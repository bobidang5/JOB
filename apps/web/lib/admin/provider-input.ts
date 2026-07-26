import { z } from 'zod';

import { PLATFORM_IDS, protocolOf } from '../ai/catalog';
import { describeUnsafeUpstreamUrl } from '../upstream-url';

/**
 * 新建 / 修改接入的入参校验。
 *
 * 单独成文件不是为了分层好看，是因为「base_url 什么时候必填」这条规则要在
 * 两个地方用：新建时字段齐全，直接在 Zod 里判；修改是部分更新，得先和库里
 * 那行合并出完整形态才判得了。规则写两遍迟早会分叉，所以抽成一个函数。
 *
 * 另外记一笔：Zod v4 的 issue 里**不带用户输入的值**（只有 code/path/message
 * 和 minimum 这类约束参数），所以 lib/http.ts 把 issues 原样回传是安全的
 * ——api_key 校验不过时不会把 key 本身回显出去。这点变了的话，errorResponse
 * 那条分支就得为后台单独处理。
 */

/** 与 ai_providers.effort 的 CHECK 约束逐字对应 */
const EffortSchema = z.enum(['low', 'medium', 'high', 'xhigh', 'max']);

/**
 * 平台限定在 catalog 里。
 *
 * 数据库那列是 text，理论上填什么都行，但这里刻意收紧：protocol 是从平台
 * 推出来的，它决定用哪个适配器发请求；放开成自由文本就等于允许写进一条
 * 「协议靠猜」的记录。前端下拉本来也只有这些选项。
 */
const PlatformSchema = z.enum(PLATFORM_IDS);

const LabelSchema = z.string().trim().min(1, '名称不能为空').max(64, '名称最长 64 个字符');
const ModelSchema = z.string().trim().min(1, '型号不能为空').max(120, '型号最长 120 个字符');
const BaseUrlSchema = z.string().trim().max(300, '地址过长');

/**
 * key 的长度上限。
 *
 * 各家的 key 都在 100 字节上下，512 留足余量。封顶是因为它要过一次
 * AES-GCM 加密再入库，不封顶等于允许往数据库里灌任意大的字符串。
 */
const ApiKeySchema = z.string().trim().min(1, 'API Key 不能为空').max(512, 'API Key 过长');

export const CreateProviderSchema = z
  .object({
    label: LabelSchema,
    platform: PlatformSchema,
    model: ModelSchema,
    base_url: BaseUrlSchema.optional(),
    api_key: ApiKeySchema,
    effort: EffortSchema.optional(),
    // 建完就启用。数据库上有部分唯一索引兜底，路由层会先把其它行置 false
    is_active: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    const message = baseUrlRuleError(value.platform, value.base_url ?? '');
    if (message) ctx.addIssue({ code: 'custom', path: ['base_url'], message });
  });

/**
 * 部分更新。
 *
 * api_key 这里**不设 min(1)**：空字符串是「不改 key」的表达方式，路由层据此
 * 跳过加密与覆盖。设了 min(1) 的话，前端那个永远留空的密码框每次提交都会
 * 被打回来。
 */
export const UpdateProviderSchema = z.object({
  label: LabelSchema.optional(),
  platform: PlatformSchema.optional(),
  model: ModelSchema.optional(),
  base_url: BaseUrlSchema.optional(),
  api_key: z.string().max(512, 'API Key 过长').optional(),
  effort: EffortSchema.optional(),
  is_active: z.boolean().optional(),
});

export type CreateProviderInput = z.infer<typeof CreateProviderSchema>;
export type UpdateProviderInput = z.infer<typeof UpdateProviderSchema>;

/**
 * base_url 这一条规则，合法返回 null。
 *
 * platform 收成 string 而不是 PlatformId：修改接口要拿库里已有的那行来合并，
 * 而历史行的 platform 可能已经从 catalog 里删掉了。protocolOf() 对未知平台
 * 按 openai_compatible 处理，也就是「要求填 base_url」——对未知平台这是更
 * 安全的一边。
 */
export function baseUrlRuleError(platform: string, baseUrl: string): string | null {
  const url = baseUrl.trim();

  // 与迁移里的 ai_providers_base_url_required 约束同一条规则。应用层先判一次，
  // 是为了给出「必须填 base_url」而不是一句数据库约束名
  if (protocolOf(platform) === 'openai_compatible' && !url) {
    return 'OpenAI 兼容接入必须填写接口地址（base_url）';
  }

  if (!url) return null;

  /*
   * 合法性、scheme、以及「能不能让服务端去请求这个地址」都交给
   * describeUnsafeUpstreamUrl()。
   *
   * 这一条不只是格式校验：服务端会拿 base_url 发请求，并把解密后的明文
   * API Key 放进请求头。所以它同时是 SSRF 入口和密钥外带通道，判断规则
   * 必须和真正发请求前那一道用同一份（见 lib/upstream-url.ts）。
   */
  return describeUnsafeUpstreamUrl(url);
}
