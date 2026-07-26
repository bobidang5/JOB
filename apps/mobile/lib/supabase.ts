import { createClient, type SupportedStorage } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/** 没配环境变量时给出明确提示，而不是在第一次请求时报一个含糊的网络错误。 */
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

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
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

/**
 * App 回到前台时恢复自动刷新，退到后台时停掉——否则后台计时器会一直
 * 尝试刷新，白白耗电还可能在网络不可用时刷出一堆失败。
 */
if (Platform.OS !== 'web') {
  AppState.addEventListener('change', (nextState) => {
    if (nextState === 'active') {
      void supabase.auth.startAutoRefresh();
    } else {
      void supabase.auth.stopAutoRefresh();
    }
  });
}
