'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';

import {
  BUTTON_BUSY,
  ERROR_BOX,
  HINT,
  INPUT,
  LABEL,
  PRIMARY_BUTTON,
  SUCCESS_BOX,
} from '../_components/styles';

const MIN_LENGTH = 8;

/**
 * 改密表单。
 *
 * 两处校验都留着：这里挡的是手滑，服务端挡的才是攻击。前端的长度校验
 * 随手就能绕过，Route Handler 那边是同一套规则的第二遍。
 */
export function PasswordForm() {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;

    setError(null);
    setDone(false);

    if (next.length < MIN_LENGTH) {
      setError(`新口令至少 ${MIN_LENGTH} 位`);
      return;
    }
    if (next !== confirm) {
      setError('两次输入的新口令不一致');
      return;
    }

    setBusy(true);

    try {
      const response = await fetch('/api/admin/password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ current_password: current, new_password: next }),
      });

      const body: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        const message =
          typeof body === 'object' && body !== null && 'message' in body
            ? String((body as { message: unknown }).message)
            : '修改失败，请重试';
        setError(message);
        setBusy(false);
        return;
      }

      setCurrent('');
      setNext('');
      setConfirm('');
      setDone(true);
      setBusy(false);

      // 服务端已经换过 cookie 了，刷新一次让警告条跟着消失
      router.refresh();
    } catch {
      setError('网络异常，请重试');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label htmlFor="current-password" style={LABEL}>
          当前口令
        </label>
        <input
          id="current-password"
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          style={INPUT}
        />
      </div>

      <div>
        <label htmlFor="new-password" style={LABEL}>
          新口令
        </label>
        <input
          id="new-password"
          type="password"
          autoComplete="new-password"
          required
          minLength={MIN_LENGTH}
          value={next}
          onChange={(event) => setNext(event.target.value)}
          style={INPUT}
        />
        <p style={{ ...HINT, margin: '6px 0 0' }}>至少 {MIN_LENGTH} 位。</p>
      </div>

      <div>
        <label htmlFor="confirm-password" style={LABEL}>
          确认新口令
        </label>
        <input
          id="confirm-password"
          type="password"
          autoComplete="new-password"
          required
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          style={INPUT}
        />
      </div>

      {error ? (
        <p role="alert" style={{ ...ERROR_BOX, margin: 0 }}>
          {error}
        </p>
      ) : null}

      {done ? (
        <p role="status" style={{ ...SUCCESS_BOX, margin: 0 }}>
          口令已修改。其它设备上的后台会话已全部失效，需要重新登录。
        </p>
      ) : null}

      <button type="submit" disabled={busy} style={busy ? BUTTON_BUSY : PRIMARY_BUTTON}>
        {busy ? '提交中…' : '修改口令'}
      </button>
    </form>
  );
}
