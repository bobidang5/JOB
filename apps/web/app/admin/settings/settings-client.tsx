'use client';

import {
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react';

import type { AdminProviderView } from '../../../lib/admin/provider-view';
import { PLATFORMS, getPlatform, type PlatformId } from '../../../lib/ai/catalog';
import type { AiEffort } from '../../../lib/database.types';
import {
  BUTTON_BUSY,
  CARD,
  ERROR_BOX,
  HINT,
  INPUT,
  LABEL,
  PRIMARY_BUTTON,
  SUCCESS_BOX,
} from '../_components/styles';

/**
 * AI 接入配置的交互部分。
 *
 * 初始数据由 Server Component 取好传进来，之后所有增删改都打
 * /api/admin/providers，成功后整表重取一次。不做本地增量合并：这张表最多几条
 * 记录，重取一次的成本可以忽略，换来的是「界面上看到的就是库里的」——尤其是
 * 启用互斥这种一次改动会影响到别的行的操作，手工维护本地状态很容易漏掉另一
 * 条的取消勾选。
 *
 * 明文 API Key 在这个组件里是**只写不读**的：后端从不下发 key（列表里只有
 * api_key_last4），输入框的值提交完就清空，编辑时留空表示不修改。
 */

interface FormState {
  label: string;
  platform: PlatformId;
  model: string;
  base_url: string;
  api_key: string;
  effort: AiEffort;
  is_active: boolean;
}

const EFFORTS: AiEffort[] = ['low', 'medium', 'high', 'xhigh', 'max'];

/**
 * 一次操作之后给的反馈。
 *
 * 成功和失败合成一个状态、只用 tone 区分，是因为它们互斥：任何一次操作要么
 * 成了要么没成，分成两个 state 就会出现「上一次的绿条还挂着，下一次的红条
 * 又冒出来」。tone 也不等于「接口有没有报错」——连通性测试失败是一次成功的
 * 接口调用，但对人来说是坏消息，就该是红的。
 */
interface Feedback {
  tone: 'ok' | 'bad';
  text: string;
}

function blankForm(): FormState {
  const first = PLATFORMS[0]!;
  return {
    label: '',
    platform: first.id,
    model: first.suggestedModels[0] ?? '',
    base_url: first.defaultBaseUrl,
    api_key: '',
    effort: 'high',
    is_active: false,
  };
}

function formFrom(provider: AdminProviderView): FormState {
  return {
    label: provider.label,
    // 历史行的 platform 可能已经从目录里删掉了，那时退回第一个平台，
    // 免得下拉显示成空白让人以为没选
    platform: (getPlatform(provider.platform)?.id ?? PLATFORMS[0]!.id) as PlatformId,
    model: provider.model,
    base_url: provider.base_url ?? '',
    // 永远是空的：key 从来没发到浏览器过，留空即表示不修改
    api_key: '',
    effort: provider.effort,
    is_active: provider.is_active,
  };
}

export function ProviderSettings({
  initialProviders,
}: {
  initialProviders: AdminProviderView[];
}) {
  const [providers, setProviders] = useState(initialProviders);
  const [form, setForm] = useState<FormState | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  const mounted = useHydrated();

  async function refresh() {
    const body = await callApi<{ providers: AdminProviderView[] }>('/api/admin/providers');
    setProviders(body.providers);
  }

  /** 包一层统一处理忙碌标记与反馈，省得每个动作各写一遍 try/finally */
  async function run(key: string, action: () => Promise<Feedback | null>) {
    if (busy) return;
    setBusy(key);
    setFeedback(null);

    try {
      const result = await action();
      await refresh();
      setFeedback(result);
    } catch (caught) {
      setFeedback({
        tone: 'bad',
        text: caught instanceof Error ? caught.message : '操作失败，请重试',
      });
    } finally {
      setBusy(null);
    }
  }

  function openCreate() {
    setEditingId(null);
    setForm(blankForm());
    setFeedback(null);
  }

  function openEdit(provider: AdminProviderView) {
    setEditingId(provider.id);
    setForm(formFrom(provider));
    setFeedback(null);
  }

  function closeForm() {
    setForm(null);
    setEditingId(null);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form) return;

    const payload: Record<string, unknown> = {
      label: form.label,
      platform: form.platform,
      model: form.model,
      base_url: form.base_url,
      effort: form.effort,
      is_active: form.is_active,
    };

    // 新建必须给 key；编辑时留空表示不动原来那把，此时干脆不带这个字段
    if (form.api_key.trim() || !editingId) payload.api_key = form.api_key;

    void run('save', async () => {
      await callApi(editingId ? `/api/admin/providers/${editingId}` : '/api/admin/providers', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(payload),
      });
      closeForm();
      return { tone: 'ok', text: editingId ? '已保存修改。' : '已新建接入。' };
    });
  }

  function onActivate(provider: AdminProviderView) {
    void run(`activate-${provider.id}`, async () => {
      await callApi(`/api/admin/providers/${provider.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ is_active: true }),
      });
      return { tone: 'ok', text: `已启用「${provider.label}」，其余接入自动停用。` };
    });
  }

  function onTest(provider: AdminProviderView) {
    void run(`test-${provider.id}`, async () => {
      const result = await callApi<{ ok: boolean; error: string | null }>(
        `/api/admin/providers/${provider.id}/test`,
        { method: 'POST' },
      );
      /*
       * 测试没通过不抛异常——那是一次成功的接口调用，只是结论是坏的。
       * 但显示上仍然按坏消息处理（tone: 'bad'）：对看页面的人来说，
       * 「接口挂了」和「配置不通」都是要立刻去修的事。
       * 详细原因也已经写回这条记录，下面卡片里会一直挂着。
       */
      return result.ok
        ? { tone: 'ok', text: `「${provider.label}」连通正常。` }
        : { tone: 'bad', text: `「${provider.label}」测试失败：${result.error ?? '未知原因'}` };
    });
  }

  function onDelete(provider: AdminProviderView) {
    const confirmed = window.confirm(
      provider.is_active
        ? `「${provider.label}」是当前启用的接入，删除后前台会没有可用的 AI 接入。确定删除？`
        : `确定删除接入「${provider.label}」？`,
    );
    if (!confirmed) return;

    void run(`delete-${provider.id}`, async () => {
      const result = await callApi<{ warning: string | null }>(
        `/api/admin/providers/${provider.id}`,
        { method: 'DELETE' },
      );
      if (editingId === provider.id) closeForm();
      return result.warning
        ? { tone: 'bad', text: result.warning }
        : { tone: 'ok', text: `已删除「${provider.label}」。` };
    });
  }

  /*
   * 「一条都没启用」是状态，不是事件，所以用常驻横幅而不是那条一次性反馈。
   *
   * 走到这个状态的路子不止一条——删掉启用的那条、编辑时把勾去掉、或者建完
   * 忘了启用。逐个动作去提醒总会漏掉一种，直接盯住结果最省事，而且这个状态
   * 的后果不轻：前台会退回 AI_PROVIDER 环境变量，通常就是 mock，用户拿到一份
   * 编造的分析结果还以为模型在工作。
   */
  const noneActive = providers.length > 0 && !providers.some((item) => item.is_active);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {noneActive ? (
        <p role="alert" style={{ ...ERROR_BOX, margin: 0 }}>
          当前没有任何接入处于启用状态，前台的简历解析与分析会退回 AI_PROVIDER
          环境变量（通常是 mock 数据）。请在下面启用一条。
        </p>
      ) : null}

      {feedback ? (
        <p
          role={feedback.tone === 'bad' ? 'alert' : 'status'}
          style={{ ...(feedback.tone === 'bad' ? ERROR_BOX : SUCCESS_BOX), margin: 0 }}
        >
          {feedback.text}
        </p>
      ) : null}

      {providers.length === 0 ? (
        <div style={CARD}>
          <p style={{ fontSize: 14, lineHeight: 1.8, margin: 0, color: '#3A3A3C' }}>
            还没有配置任何 AI 接入，前台会按 AI_PROVIDER 环境变量兜底（通常是 mock 数据）。
          </p>
        </div>
      ) : (
        providers.map((provider) => (
          <ProviderCard
            key={provider.id}
            provider={provider}
            mounted={mounted}
            busy={busy}
            onActivate={() => onActivate(provider)}
            onTest={() => onTest(provider)}
            onEdit={() => openEdit(provider)}
            onDelete={() => onDelete(provider)}
          />
        ))
      )}

      {form ? (
        <div style={CARD}>
          <h2 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 16px' }}>
            {editingId ? '编辑接入' : '新建接入'}
          </h2>
          <ProviderForm
            form={form}
            setForm={setForm}
            isEditing={!!editingId}
            busy={busy === 'save'}
            onSubmit={onSubmit}
            onCancel={closeForm}
          />
        </div>
      ) : (
        <button type="button" onClick={openCreate} disabled={!!busy} style={PRIMARY_BUTTON}>
          新建接入
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */

/** 永不触发的订阅：这个「store」的值只可能从 false 变成 true 一次 */
const NEVER_CHANGES = () => () => {};

/**
 * 是否已经完成 hydration。
 *
 * 用来把 toLocaleString() 推迟到浏览器里再跑：它在服务端按 UTC 渲染、在浏览器
 * 按本地时区渲染，两边对不上就是一次 hydration mismatch。
 *
 * 写成 useSyncExternalStore 而不是「useState + useEffect 里 setMounted(true)」：
 * 后者是在 effect 里同步 setState，会多触发一轮级联渲染，React 的 lint 规则
 * 直接把它判为错误。这个 hook 是同一个意图的正规写法——服务端快照恒为 false，
 * 客户端快照恒为 true，hydration 之后 React 自己切过去。
 */
function useHydrated(): boolean {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
}

function ProviderCard({
  provider,
  mounted,
  busy,
  onActivate,
  onTest,
  onEdit,
  onDelete,
}: {
  provider: AdminProviderView;
  mounted: boolean;
  busy: string | null;
  onActivate: () => void;
  onTest: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const platform = getPlatform(provider.platform);
  const disabled = !!busy;

  return (
    <div style={{ ...CARD, padding: 20 }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          marginBottom: 12,
        }}
      >
        <span style={{ fontSize: 16, fontWeight: 700, color: '#111114' }}>{provider.label}</span>
        <span style={provider.is_active ? BADGE_ACTIVE : BADGE_IDLE}>
          {provider.is_active ? '已启用' : '未启用'}
        </span>
      </div>

      <dl style={{ display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '6px 12px', margin: 0 }}>
        <Field name="平台">{platform?.label ?? provider.platform}</Field>
        <Field name="型号">{provider.model}</Field>
        {provider.base_url ? <Field name="地址">{provider.base_url}</Field> : null}
        <Field name="API Key">
          {/* 后 4 位是唯一会离开服务端的部分，只够用来核对填的是哪把 key */}
          ****{provider.api_key_last4}
        </Field>
        <Field name="上次测试">
          <TestStatus provider={provider} mounted={mounted} />
        </Field>
      </dl>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
        {provider.is_active ? null : (
          <button type="button" onClick={onActivate} disabled={disabled} style={SMALL_BUTTON}>
            {busy === `activate-${provider.id}` ? '启用中…' : '启用'}
          </button>
        )}
        <button type="button" onClick={onTest} disabled={disabled} style={SMALL_BUTTON}>
          {busy === `test-${provider.id}` ? '测试中…' : '测试连通性'}
        </button>
        <button type="button" onClick={onEdit} disabled={disabled} style={SMALL_BUTTON}>
          编辑
        </button>
        <button type="button" onClick={onDelete} disabled={disabled} style={DANGER_BUTTON}>
          {busy === `delete-${provider.id}` ? '删除中…' : '删除'}
        </button>
      </div>
    </div>
  );
}

function TestStatus({
  provider,
  mounted,
}: {
  provider: AdminProviderView;
  mounted: boolean;
}) {
  if (!provider.last_tested_at) return <span style={{ color: '#8E8E93' }}>还没测过</span>;

  // 挂载前用占位符，理由见组件顶部 mounted 那段注释
  const when = mounted ? new Date(provider.last_tested_at).toLocaleString('zh-CN') : '…';

  if (provider.last_test_ok) {
    return <span style={{ color: '#1F7A3D' }}>正常 · {when}</span>;
  }

  return (
    <span style={{ color: '#C0392B' }}>
      失败 · {when}
      {provider.last_test_error ? `（${provider.last_test_error}）` : ''}
    </span>
  );
}

function Field({ name, children }: { name: string; children: ReactNode }) {
  return (
    <>
      <dt style={{ fontSize: 13, color: '#8E8E93' }}>{name}</dt>
      <dd style={{ fontSize: 13, color: '#3A3A3C', margin: 0, wordBreak: 'break-all' }}>
        {children}
      </dd>
    </>
  );
}

/* ------------------------------------------------------------------ */

function ProviderForm({
  form,
  setForm,
  isEditing,
  busy,
  onSubmit,
  onCancel,
}: {
  form: FormState;
  setForm: (next: FormState) => void;
  isEditing: boolean;
  busy: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const platform = getPlatform(form.platform);
  const isAnthropic = platform?.protocol === 'anthropic';

  function onPlatformChange(id: PlatformId) {
    const next = getPlatform(id);
    setForm({
      ...form,
      platform: id,
      // 换平台自动带出官方地址。覆盖掉手填的值是有意的——换了平台之后，
      // 上一个平台的地址一定是错的，留着比清掉更容易让人漏改
      base_url: next?.defaultBaseUrl ?? '',
    });
  }

  return (
    <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <label htmlFor="provider-label" style={LABEL}>
          名称
        </label>
        <input
          id="provider-label"
          type="text"
          required
          maxLength={64}
          value={form.label}
          onChange={(event) => setForm({ ...form, label: event.target.value })}
          placeholder="如：DeepSeek 生产"
          style={INPUT}
        />
        <p style={{ ...HINT, margin: '6px 0 0' }}>只用于在这个列表里区分，随便起。</p>
      </div>

      <div>
        <label htmlFor="provider-platform" style={LABEL}>
          平台
        </label>
        <select
          id="provider-platform"
          value={form.platform}
          onChange={(event) => onPlatformChange(event.target.value as PlatformId)}
          style={INPUT}
        >
          {PLATFORMS.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="provider-model" style={LABEL}>
          型号
        </label>
        {/*
          list + datalist：下拉给建议，但输入框本身是自由文本。
          各家几周就上一批新型号，把可选值写死等于给这个后台定了保质期。
        */}
        <input
          id="provider-model"
          type="text"
          required
          maxLength={120}
          list={`models-${form.platform}`}
          value={form.model}
          onChange={(event) => setForm({ ...form, model: event.target.value })}
          placeholder="照平台控制台上的全称填"
          style={INPUT}
        />
        <datalist id={`models-${form.platform}`}>
          {(platform?.suggestedModels ?? []).map((model) => (
            <option key={model} value={model} />
          ))}
        </datalist>
        <p style={{ ...HINT, margin: '6px 0 0' }}>
          下拉里的只是常见选择，可以直接手填任意型号。
          {platform?.hint ? ` ${platform.hint}` : ''}
        </p>
      </div>

      <div>
        <label htmlFor="provider-base-url" style={LABEL}>
          接口地址{isAnthropic ? '（可留空）' : ''}
        </label>
        <input
          id="provider-base-url"
          type="text"
          required={!isAnthropic}
          maxLength={300}
          value={form.base_url}
          onChange={(event) => setForm({ ...form, base_url: event.target.value })}
          placeholder={isAnthropic ? '留空走 Anthropic 官方端点' : 'https://api.example.com/v1'}
          style={INPUT}
        />
        <p style={{ ...HINT, margin: '6px 0 0' }}>
          {isAnthropic
            ? '只有走中转或自建网关时才需要填。'
            : '填到 /chat/completions 之前那一段，通常以 /v1 结尾。'}
        </p>
      </div>

      <div>
        <label htmlFor="provider-api-key" style={LABEL}>
          API Key
        </label>
        <input
          id="provider-api-key"
          type="password"
          autoComplete="off"
          required={!isEditing}
          maxLength={512}
          value={form.api_key}
          onChange={(event) => setForm({ ...form, api_key: event.target.value })}
          placeholder={isEditing ? '留空表示不修改' : ''}
          style={INPUT}
        />
        <p style={{ ...HINT, margin: '6px 0 0' }}>
          加密后存库，之后不会再显示出来，列表里只保留后 4 位供核对。
          {isEditing ? ' 留空即保持原来那把不变。' : ''}
        </p>
      </div>

      <div>
        <label htmlFor="provider-effort" style={LABEL}>
          思考强度
        </label>
        <select
          id="provider-effort"
          value={form.effort}
          onChange={(event) => setForm({ ...form, effort: event.target.value as AiEffort })}
          style={INPUT}
        >
          {EFFORTS.map((effort) => (
            <option key={effort} value={effort}>
              {effort}
            </option>
          ))}
        </select>
        <p style={{ ...HINT, margin: '6px 0 0' }}>
          只有 Anthropic 接入吃这个参数，其余平台忽略。高一档更准，也更慢更贵。
        </p>
      </div>

      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#3A3A3C' }}>
        <input
          type="checkbox"
          checked={form.is_active}
          onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
        />
        设为启用（其余接入会自动停用）
      </label>

      <div style={{ display: 'flex', gap: 8 }}>
        <button type="submit" disabled={busy} style={busy ? BUTTON_BUSY : PRIMARY_BUTTON}>
          {busy ? '保存中…' : '保存'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          disabled={busy}
          style={{ ...SMALL_BUTTON, padding: '14px 20px' }}
        >
          取消
        </button>
      </div>
    </form>
  );
}

/* ------------------------------------------------------------------ */

/**
 * 统一的接口调用。
 *
 * 服务端对每种失败都给了一句人话（见 lib/http.ts 与各路由），这里原样抛出去
 * 让上层显示，不在前端二次分类——分类逻辑分散在两处一定会分叉。
 */
async function callApi<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: init?.body ? { 'content-type': 'application/json' } : undefined,
  });

  const body: unknown = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(readMessage(body) ?? '操作失败，请重试');
  }

  return body as T;
}

function readMessage(body: unknown): string | null {
  if (typeof body === 'object' && body !== null && 'message' in body) {
    return String((body as { message: unknown }).message);
  }
  return null;
}

/* ------------------------------------------------------------------ */

const SMALL_BUTTON: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: '#3A3A3C',
  background: '#FFFFFF',
  border: '1px solid #E5E5EA',
  borderRadius: 10,
  padding: '8px 14px',
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const DANGER_BUTTON: CSSProperties = {
  ...SMALL_BUTTON,
  color: '#C0392B',
  borderColor: '#FFD5D0',
};

const BADGE_ACTIVE: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#1F7A3D',
  background: '#EFFAF2',
  border: '1px solid #C9EAD5',
  borderRadius: 999,
  padding: '3px 10px',
  whiteSpace: 'nowrap',
};

const BADGE_IDLE: CSSProperties = {
  ...BADGE_ACTIVE,
  color: '#8E8E93',
  background: '#F5F5F7',
  borderColor: '#E5E5EA',
};
