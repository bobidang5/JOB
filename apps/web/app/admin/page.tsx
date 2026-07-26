import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { CSSProperties, ReactNode } from 'react';

import { loadDashboardMetrics, type DashboardMetrics } from '../../lib/admin/metrics';
import { readAdminSession } from '../../lib/admin/session';
import { AdminShell } from './_components/admin-shell';
import { BarChart } from './_components/bar-chart';
import { CARD, HINT } from './_components/styles';

export const metadata: Metadata = {
  title: '看板 · 职优 AI 运营后台',
};

/**
 * 使用数据看板。
 *
 * 直接调 loadDashboardMetrics()，不绕自己的 /api/admin/metrics——Server
 * Component 本来就在服务端，再发一次 HTTP 只是白饶一圈往返，还得自己拼绝对
 * 地址、转发 cookie。那个接口留给外部拉数据，两边共用同一个函数。
 *
 * 空数据的处理原则：计数照实显示 0（那是真实的计数），均值和分位数显示
 * `--`（没有样本，见 metrics.ts 里 null 与 0 的分工），整块没有数据的就换成
 * 一句人话。任何情况下都不会出现 NaN 或 -Infinity。
 */
export default async function AdminDashboardPage() {
  const session = await readAdminSession();
  if (!session) redirect('/admin/login');

  let metrics: DashboardMetrics | null = null;
  let failure: string | null = null;
  try {
    metrics = await loadDashboardMetrics();
  } catch (error) {
    // 缺环境变量、迁移没跑、数据库连不上都会走到这里。把原话显示出来：
    // 这一页只有管理员看得到，而「运营后台缺少环境变量：…」正是他要的答案，
    // 换成一句「加载失败」等于把线索藏起来
    console.error('[admin] 看板指标加载失败', error);
    failure = error instanceof Error ? error.message : String(error);
  }

  return (
    <AdminShell session={session} title="看板">
      {failure ? (
        <div style={{ ...CARD, borderLeft: '4px solid #C0392B' }}>
          <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 8px', color: '#C0392B' }}>
            指标加载失败
          </p>
          <p style={{ fontSize: 13, lineHeight: 1.8, margin: 0, color: '#3A3A3C' }}>{failure}</p>
          <p style={{ ...HINT, margin: '12px 0 0' }}>
            常见原因：没有配 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY，或者
            supabase/migrations 下的迁移还没跑。
          </p>
        </div>
      ) : null}

      {metrics ? <Dashboard metrics={metrics} /> : null}
    </AdminShell>
  );
}

/**
 * 看板正文。
 *
 * 导出是为了让 dashboard.test.tsx 能把它渲染成 HTML，直接断言空数据时页面上
 * 不出现 NaN——这条要求本来就在渲染这一层，光测聚合函数盖不住格式化那一段。
 * 它不是路由的一部分（App Router 只认 page/layout/route 这些约定名字）。
 */
export function Dashboard({ metrics }: { metrics: DashboardMetrics }) {
  const { users, activeUsers, content, optimization, usage, activeProvider } = metrics;
  const brandNew = users.total === 0 && usage.total === 0 && content.resumes === 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {brandNew ? (
        <div style={{ ...CARD, background: '#EAF3FF', boxShadow: 'none', padding: 20 }}>
          <p style={{ fontSize: 15, fontWeight: 700, margin: '0 0 6px' }}>还没有任何数据</p>
          <p style={{ fontSize: 13, lineHeight: 1.8, margin: 0, color: '#3A3A3C' }}>
            这套后台刚装好，库里还没有用户、简历和模型调用，下面的数字会随 App
            那边的使用长出来。先去
            <Link href="/admin/settings" style={{ color: '#007AFF', fontWeight: 700 }}>
              {' AI 接入 '}
            </Link>
            配一条可用的接入。
          </p>
        </div>
      ) : null}

      <Section title="注册用户">
        <StatGrid>
          <Stat label="总数" value={formatCount(users.total)} />
          <Stat label="今日新增" value={formatCount(users.newToday)} />
          <Stat label="7 日新增" value={formatCount(users.new7d)} />
          <Stat label="30 日新增" value={formatCount(users.new30d)} />
          <Stat
            label="已验证邮箱"
            value={formatCount(users.confirmed)}
            hint={users.total > 0 ? `占 ${formatPercent(users.confirmedRate)}` : undefined}
          />
        </StatGrid>
      </Section>

      <Section title={`注册趋势（最近 ${metrics.windowDays} 天）`}>
        <BarChart
          points={metrics.signupTrend}
          unit=" 人"
          emptyText={`最近 ${metrics.windowDays} 天没有新注册`}
        />
      </Section>

      <Section title="活跃用户" note="口径是「发起过分析」，按滚动窗口去重，不是自然日">
        <StatGrid>
          <Stat label="DAU（24 小时）" value={formatCount(activeUsers.dau)} />
          <Stat label="WAU（7 天）" value={formatCount(activeUsers.wau)} />
          <Stat label="MAU（30 天）" value={formatCount(activeUsers.mau)} />
        </StatGrid>
      </Section>

      <Section title="内容量">
        <StatGrid>
          <Stat label="简历" value={formatCount(content.resumes)} />
          <Stat label="目标职位" value={formatCount(content.jobTargets)} />
          <Stat label="分析次数" value={formatCount(content.analyses)} />
          <Stat label="完成优化" value={formatCount(content.optimizations)} />
        </StatGrid>
      </Section>

      <Section
        title="优化效果"
        note={
          optimization.sample.truncated
            ? `基于最近 ${formatCount(optimization.sample.size)} 条优化记录`
            : undefined
        }
      >
        {optimization.sample.size === 0 ? (
          <Empty text="还没有人完成过一次优化" />
        ) : (
          <StatGrid>
            <Stat label="平均提升" value={formatScore(optimization.averageGain, '+')} />
            <Stat label="累计提升" value={formatScore(optimization.totalGain, '+')} />
            <Stat label="优化前平均分" value={formatScore(optimization.averageScoreBefore)} />
            <Stat label="优化后平均分" value={formatScore(optimization.averageScoreAfter)} />
          </StatGrid>
        )}
      </Section>

      <Section
        title="AI 调用"
        note={
          usage.sample.truncated
            ? `总次数为全量，其余指标基于最近 ${formatCount(usage.sample.size)} 次调用`
            : undefined
        }
      >
        {usage.total === 0 ? (
          <Empty text="还没有任何模型调用记录" />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <StatGrid>
              <Stat label="总次数" value={formatCount(usage.total)} />
              <Stat label="成功率" value={formatPercent(usage.rates.ok)} accent="#1F7A3D" />
              <Stat label="拒答率" value={formatPercent(usage.rates.refusal)} />
              <Stat label="契约错误率" value={formatPercent(usage.rates.contract)} />
              <Stat
                label="错误率"
                value={formatPercent(usage.rates.error)}
                accent={usage.rates.error > 0 ? '#C0392B' : undefined}
              />
            </StatGrid>

            <SubBlock title="按用途">
              <StatGrid>
                <Stat label="简历解析" value={formatCount(usage.byKind.parse)} />
                <Stat label="匹配分析" value={formatCount(usage.byKind.analyze)} />
                <Stat label="模版起草" value={formatCount(usage.byKind.draft)} />
              </StatGrid>
            </SubBlock>

            <SubBlock title="按结果">
              <StatGrid>
                <Stat label="成功" value={formatCount(usage.byStatus.ok)} />
                <Stat label="拒答" value={formatCount(usage.byStatus.refusal)} />
                <Stat label="契约错误" value={formatCount(usage.byStatus.contract)} />
                <Stat label="错误" value={formatCount(usage.byStatus.error)} />
              </StatGrid>
            </SubBlock>

            <SubBlock title="Token">
              <StatGrid>
                <Stat label="输入" value={formatCount(usage.tokens.input)} />
                <Stat label="输出" value={formatCount(usage.tokens.output)} />
                <Stat
                  label="缓存读取"
                  value={formatCount(usage.tokens.cacheRead)}
                  hint="命中缓存的输入 token，越高越省钱"
                />
                <Stat label="输入 + 输出" value={formatCount(usage.tokens.total)} />
              </StatGrid>
            </SubBlock>

            <SubBlock
              title="延迟"
              note={
                usage.latency.sampleSize === 0
                  ? '这批调用都没有留下耗时'
                  : `基于 ${formatCount(usage.latency.sampleSize)} 次有耗时记录的调用`
              }
            >
              <StatGrid>
                <Stat label="P50" value={formatMs(usage.latency.p50)} />
                <Stat label="P95" value={formatMs(usage.latency.p95)} />
              </StatGrid>
            </SubBlock>

            <SubBlock title={`最近 ${metrics.windowDays} 天调用量`}>
              <BarChart
                points={usage.daily}
                unit=" 次"
                emptyText={`最近 ${metrics.windowDays} 天没有调用`}
              />
            </SubBlock>
          </div>
        )}
      </Section>

      <Section title="当前启用的接入">
        {activeProvider ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <StatGrid>
              <Stat label="名称" value={activeProvider.label} />
              <Stat label="平台" value={activeProvider.platform} />
              <Stat label="型号" value={activeProvider.model} />
              <Stat
                label="接入方式"
                value={activeProvider.protocol === 'anthropic' ? 'Anthropic 原生' : 'OpenAI 兼容'}
              />
            </StatGrid>
            <p style={{ ...HINT, margin: 0 }}>{describeTest(activeProvider)}</p>
          </div>
        ) : (
          <div>
            <Empty text="还没有启用任何接入，模型调用会退回环境变量里的配置" />
            <p style={{ ...HINT, margin: '8px 0 0', textAlign: 'center' }}>
              <Link href="/admin/settings" style={{ color: '#007AFF', fontWeight: 600 }}>
                去配置 AI 接入
              </Link>
            </p>
          </div>
        )}
      </Section>

      <p style={{ ...HINT, margin: 0, textAlign: 'right' }}>
        统计时间 {formatDateTime(metrics.generatedAt)}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * 版式
 *
 * 样式直接内联，跟 app/page.tsx 和后台其余页面一致：整个后台就几页，
 * 为它引一套 Tailwind 或组件库，要维护的比省下的多。
 * ------------------------------------------------------------------ */

const SECTION_TITLE: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  margin: 0,
  color: '#111114',
};

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <section style={{ ...CARD, padding: 20 }}>
      <div style={{ marginBottom: 16 }}>
        <h2 style={SECTION_TITLE}>{title}</h2>
        {note ? <p style={{ ...HINT, margin: '4px 0 0' }}>{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function SubBlock({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <p style={{ fontSize: 12, fontWeight: 700, color: '#8E8E93', margin: '0 0 10px' }}>
        {title}
        {note ? <span style={{ fontWeight: 500, marginLeft: 8 }}>{note}</span> : null}
      </p>
      {children}
    </div>
  );
}

/** 自适应列数，不写媒体查询：窄屏自己会掉成两列、一列。 */
function StatGrid({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: 12,
      }}
    >
      {children}
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  accent,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: string;
}) {
  return (
    <div style={{ background: '#F7F7FA', borderRadius: 14, padding: '14px 16px', minWidth: 0 }}>
      <div style={{ fontSize: 12, color: '#8E8E93', marginBottom: 6 }}>{label}</div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          letterSpacing: -0.4,
          color: accent ?? '#111114',
          // 型号、平台这类文本可能很长，允许断行，别把卡片撑破
          overflowWrap: 'anywhere',
        }}
      >
        {value}
      </div>
      {hint ? <div style={{ fontSize: 11, color: '#AEAEB2', marginTop: 4 }}>{hint}</div> : null}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <p style={{ fontSize: 13, color: '#AEAEB2', margin: 0, padding: '20px 0', textAlign: 'center' }}>
      {text}
    </p>
  );
}

/* ------------------------------------------------------------------ *
 * 格式化
 * ------------------------------------------------------------------ */

/**
 * 千分位。
 *
 * 不用 toLocaleString：它的输出取决于运行环境带的 ICU 数据，将来某段被挪进
 * 客户端组件时，服务端和浏览器给出不同结果就是一次 hydration 不匹配。
 * 自己插逗号没有这个问题。
 */
function formatCount(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

function formatPercent(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

/**
 * 分数。null 显示 --，不显示 0：「没有样本」和「平均提升 0 分」是两件事，
 * 后者说明优化根本没起作用，那是个该被看见的问题，不能和空数据混在一起。
 */
function formatScore(value: number | null, sign = ''): string {
  if (value === null) return '--';
  return `${sign}${value} 分`;
}

function formatMs(value: number | null): string {
  if (value === null) return '--';
  return value >= 1000 ? `${(value / 1000).toFixed(1)} s` : `${value} ms`;
}

function formatDateTime(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  // 固定按 UTC 显示并标出来：服务器时区未必是运营所在的时区，
  // 与其显示一个不知道是哪个时区的时间，不如说清楚
  return `${parsed.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

function describeTest(provider: {
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
}): string {
  if (!provider.lastTestedAt) return '这条接入还没有测试过';
  const when = formatDateTime(provider.lastTestedAt);
  if (provider.lastTestOk) return `上次测试通过：${when}`;
  return `上次测试失败（${when}）：${provider.lastTestError ?? '没有记录原因'}`;
}
