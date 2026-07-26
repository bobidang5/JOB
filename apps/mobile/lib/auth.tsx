import type { Session } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Platform } from 'react-native';

import { getSupabase, isSupabaseConfigured } from './supabase';

/**
 * 认证。
 *
 * 三家 OAuth（Google / LinkedIn / Facebook）走同一条路径：
 * PKCE + 系统浏览器 —— signInWithOAuth 拿到授权 URL，用 expo-web-browser
 * 的 openAuthSessionAsync 打开，用户授权后深链回 App，再把 code 兑换成
 * 会话。这条路径在 Expo Go 里就能跑，不需要 dev build。
 *
 * Sign in with Apple 不一样：它走原生弹层拿 identityToken，再用
 * signInWithIdToken 换会话。它需要原生模块，只能在 EAS dev build 或
 * 正式包里验证，Expo Go 里会走到 isAvailableAsync() 的 false 分支。
 *
 * 为什么必须有 Apple 登录：App Store 审核指南 4.8 要求，只要提供第三方
 * 社交登录，就必须同时提供一个等效的、限制数据收集、允许隐藏邮箱、
 * 不做追踪的选项。Google / LinkedIn / Facebook 都不满足，不加会被拒审。
 */

export type OAuthProvider = 'google' | 'facebook' | 'linkedin_oidc';

export class AuthCancelledError extends Error {
  constructor() {
    super('用户取消了登录');
    this.name = 'AuthCancelledError';
  }
}

interface AuthContextValue {
  session: Session | null;
  /** 首次读取本地会话是否还没完成——用来避免登录页闪一下 */
  isLoading: boolean;
  signInWithOAuth: (provider: OAuthProvider) => Promise<void>;
  signInWithApple: () => Promise<void>;
  isAppleAvailable: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/** 深链回调地址，必须与 Supabase 的 Redirect URLs 允许列表一致 */
const redirectTo = Linking.createURL('auth/callback');

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  // 没配 Supabase 时没有会话可读，初值直接就是「读完了」，
  // 避免在 effect 里同步 setState 引发一次多余的级联渲染。
  const [isLoading, setIsLoading] = useState(isSupabaseConfigured);
  const [isAppleAvailable, setIsAppleAvailable] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured) return;

    void getSupabase().auth.getSession().then(({ data }) => {
      setSession(data.session);
      setIsLoading(false);
    });

    const { data: subscription } = getSupabase().auth.onAuthStateChange(
      (_event, nextSession) => {
        setSession(nextSession);
      },
    );

    return () => subscription.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    void AppleAuthentication.isAvailableAsync().then(setIsAppleAvailable);
  }, []);

  const signInWithOAuth = useCallback(async (provider: OAuthProvider) => {
    const { data, error } = await getSupabase().auth.signInWithOAuth({
      provider,
      options: {
        redirectTo,
        // 自己开浏览器，不让 supabase-js 直接跳转
        skipBrowserRedirect: true,
      },
    });
    if (error) throw error;
    if (!data.url) throw new Error('未能取得授权地址');

    const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
    if (result.type !== 'success') throw new AuthCancelledError();

    const code = new URL(result.url).searchParams.get('code');
    if (!code) throw new Error('回调里没有授权码');

    const { error: exchangeError } =
      await getSupabase().auth.exchangeCodeForSession(code);
    if (exchangeError) throw exchangeError;
  }, []);

  const signInWithApple = useCallback(async () => {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) {
        throw new Error('Apple 没有返回 identityToken');
      }

      const { error } = await getSupabase().auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      if (error) throw error;
    } catch (error) {
      // Apple 用取消也走 throw，这里区分开，免得把取消报成失败
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code?: string }).code === 'ERR_REQUEST_CANCELED'
      ) {
        throw new AuthCancelledError();
      }
      throw error;
    }
  }, []);

  const signOut = useCallback(async () => {
    await getSupabase().auth.signOut();
    setSession(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      isLoading,
      signInWithOAuth,
      signInWithApple,
      isAppleAvailable,
      signOut,
    }),
    [isAppleAvailable, isLoading, session, signInWithApple, signInWithOAuth, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth 必须在 AuthProvider 内使用');
  }
  return context;
}
