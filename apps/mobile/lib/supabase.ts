import {
  createClient,
  type SupabaseClient,
  type SupportedStorage,
} from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * 两个变量都填了才算配好。任一为空就是 mock 模式：AuthGate 放行、
 * 数据全部来自 lib/api.ts，不碰网络。
 */
export const isSupabaseConfigured =
  supabaseUrl.length > 0 && supabaseAnonKey.length > 0;

/**
 * 会话存储适配器。
 *
 * 会话里的 JWT 常常超过 SecureStore 单值 2048 字节的上限，直接写会被
 * 静默截断，表现为「登录成功但重启后掉登录」。所以这里按 1800 字节
 * 分片：主键存分片数，分片各自单独存。
 *
 * 用 SecureStore 而不是 AsyncStorage —— access/refresh token 属于凭据，
 * 该进 Keychain。
 */
const CHUNK_SIZE = 1800;

const chunkKey = (key: string, index: number) => `${key}.${index}`;

const secureStoreAdapter: SupportedStorage = {
  async getItem(key) {
    const head = await SecureStore.getItemAsync(key);
    if (head === null) return null;

    const count = Number.parseInt(head, 10);
    // 不是分片计数就是早期写入的整值，原样返回
    if (!Number.isFinite(count) || count <= 0) return head;

    const parts: string[] = [];
    for (let i = 0; i < count; i += 1) {
      const part = await SecureStore.getItemAsync(chunkKey(key, i));
      // 任何一片丢了都无法还原，当作没有会话
      if (part === null) return null;
      parts.push(part);
    }
    return parts.join('');
  },

  async setItem(key, value) {
    // 先清掉上一次的分片，避免旧的残片被下次读取拼进来
    await secureStoreAdapter.removeItem(key);

    const count = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < count; i += 1) {
      await SecureStore.setItemAsync(
        chunkKey(key, i),
        value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
      );
    }
    await SecureStore.setItemAsync(key, String(count));
  },

  async removeItem(key) {
    const head = await SecureStore.getItemAsync(key);
    if (head !== null) {
      const count = Number.parseInt(head, 10);
      if (Number.isFinite(count) && count > 0) {
        for (let i = 0; i < count; i += 1) {
          await SecureStore.deleteItemAsync(chunkKey(key, i));
        }
      }
    }
    await SecureStore.deleteItemAsync(key);
  },
};

/**
 * 客户端必须惰性创建。
 *
 * createClient 拿到空 URL 会当场抛 "supabaseUrl is required."，而本模块
 * 被 app/_layout.tsx 顶层引入——在模块顶层无条件 createClient 等于
 * 「没填凭据就一启动白屏」，mock 模式压根进不去（web 静态导出同理，
 * 它会在 Node 里真的求值一遍路由模块）。所以推迟到真正要用时才建。
 */
let client: SupabaseClient | null = null;

/**
 * 取客户端。调用前请先判 isSupabaseConfigured——mock 模式下没有任何
 * 理由走到这里，与其发一个注定打不通的请求，不如当场把话说清楚。
 */
export function getSupabase(): SupabaseClient {
  if (!isSupabaseConfigured) {
    throw new Error(
      '未配置 EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY，' +
        '当前为 mock 模式，不应调用 Supabase',
    );
  }

  client ??= createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      // Web 上没有 SecureStore，交给 supabase-js 用 localStorage
      storage: Platform.OS === 'web' ? undefined : secureStoreAdapter,
      autoRefreshToken: true,
      persistSession: true,
      // RN 里没有 URL 栏，回调 code 由 expo-web-browser 取回后手动兑换
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  });
  return client;
}

/**
 * App 回到前台时恢复自动刷新，退到后台时停掉——否则后台计时器会一直
 * 尝试刷新，白白耗电还可能在网络不可用时刷出一堆失败。
 *
 * mock 模式下不注册：没有会话可刷，注册了反而会在切前台时把上面的
 * 「不应调用 Supabase」抛到一个没人接的地方。
 */
if (Platform.OS !== 'web' && isSupabaseConfigured) {
  AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active') {
      void getSupabase().auth.startAutoRefresh();
    } else {
      void getSupabase().auth.stopAutoRefresh();
    }
  });
}
