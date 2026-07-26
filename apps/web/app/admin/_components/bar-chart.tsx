import { barPercents, type TrendPoint } from '../../../lib/admin/metrics';

/**
 * 迷你柱状图。
 *
 * 刻意不引图表库：整个后台就这两处趋势（注册、AI 调用），一个 div 加一个
 * 百分比高度就够了，为此背上一个几十 KB 的依赖和它的版本升级不划算。
 *
 * **这个文件必须保持 Server Component**（不要加 'use client'）：它从
 * lib/admin/metrics 里 import 了值，那条模块链上挂着 service_role 客户端。
 * 需要交互的话，把纯展示的部分单独拆出去，别把这里标成客户端组件。
 */
export function BarChart({
  points,
  unit,
  emptyText,
}: {
  points: readonly TrendPoint[];
  /** 悬停提示里的单位，如「人」「次」 */
  unit: string;
  /** 一根柱子都没有（或全是 0）时显示的话 */
  emptyText: string;
}) {
  const values = points.map((point) => point.value);
  const peak = values.reduce((max, value) => (value > max ? value : max), 0);

  // 全 0 的图和没有图没区别，还容易被当成「渲染坏了」。直接说没有数据。
  if (points.length === 0 || peak === 0) {
    return (
      <p style={{ fontSize: 13, color: '#AEAEB2', margin: 0, padding: '28px 0', textAlign: 'center' }}>
        {emptyText}
      </p>
    );
  }

  const percents = barPercents(values);
  const first = points[0];
  const last = points[points.length - 1];

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 120 }}>
        {points.map((point, index) => (
          <div
            key={point.day}
            // 内部后台，原生 title 提示足够了，省掉一整套 tooltip 交互
            title={`${point.day}　${point.value}${unit}`}
            style={{ flex: 1, display: 'flex', alignItems: 'flex-end', height: '100%' }}
          >
            <div
              style={{
                width: '100%',
                height: `${percents[index] ?? 0}%`,
                // 有数据的日子至少留 3px：峰值很高时，1 和 0 的柱子换算出来
                // 都不到一个像素，看上去像那天没数据
                minHeight: point.value > 0 ? 3 : 1,
                background: point.value > 0 ? '#007AFF' : '#ECECF0',
                borderRadius: '3px 3px 0 0',
              }}
            />
          </div>
        ))}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 8,
          fontSize: 11,
          color: '#AEAEB2',
        }}
      >
        <span>{first ? first.day.slice(5) : ''}</span>
        <span>
          峰值 {peak}
          {unit}
        </span>
        <span>{last ? last.day.slice(5) : ''}</span>
      </div>
    </div>
  );
}
