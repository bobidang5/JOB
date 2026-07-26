'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import { ERROR_BOX, INPUT, LABEL, PRIMARY_BUTTON, BUTTON_BUSY } from '../_components/styles';

/**
 * 登录表单。
 *
 * 会话是 httpOnly cookie，浏览器这边碰不到也不需要碰：提交成功后
 * router.refresh() 让服务端重新渲染，守卫自然就放行了。
 */
export function LoginForm() {
  const router = useRouter();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setBusy(true);
    setError(null);

    try {
      const response = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        // 服务端对「用户名不存在」和「口令错」返回的是同一句话，这里原样
        // 展示，不要在前端自作聪明地再分类一次
        const message =
          typeof body === 'object' && body !== null && 'message' in body
            ? String((body as { message: unknown }).message)
            : '登录失败，请重试';
        setError(message);
        setBusy(false);
        return;
      }

      // replace 而不是 push：登录页不该留在返回栈里
      router.replace('/admin');
      router.refresh();
    } catch {
      setError('网络异常，请检查服务是否已启动');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label htmlFor="admin-username" style={LABEL}>
          用户名
        </label>
        <input
          id="admin-username"
          name="username"
          type="text"
          autoComplete="username"
          autoFocus
          required
          value={username}
          onChange={(event) => setUsername(event.target.value)}
          style={INPUT}
        />
      </div>

      <div>
        <label htmlFor="admin-password" style={LABEL}>
          口令
        </label>
        <input
          id="admin-password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          style={INPUT}
        />
      </div>

      {error ? (
        <p role="alert" style={{ ...ERROR_BOX, margin: 0 }}>
          {error}
        </p>
      ) : null}

      <button type="submit" disabled={busy} style={busy ? BUTTON_BUSY : PRIMARY_BUTTON}>
        {busy ? '登录中…' : '登录'}
      </button>
    </form>
  );
}
