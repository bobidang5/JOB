/**
 * mock provider 的端到端联调脚本。
 *
 * 五条 API 路由都要先过 authenticate()，没有真实 Supabase 就走不到业务
 * 逻辑，所以那一层只能验证到 401。这个脚本补的是另一半：把路由里**不
 * 依赖数据库的那段**单独拎出来跑——直接调 getAIService() 的三个方法，
 * 再用 packages/shared 的 Zod schema 校验返回值。
 *
 * 于是「AI 层的契约对不对」和「数据库通不通」被拆成两件独立的事，
 * 没有 Supabase 的环境（本地 clone、CI）也能验证前者。
 *
 * 跑：pnpm --filter @zhiyou/web smoke
 */

import { isDeepStrictEqual } from 'node:util';

import {
  AnalyzeResponseSchema,
  FieldPathSchema,
  MOCK_BASE_SCORE,
  MOCK_JD_TEXT,
  MOCK_PROFILE,
  MOCK_RESUME_BEFORE,
  ParseResumeResponseSchema,
  ResumeContentSchema,
  applySuggestion,
  applySuggestions,
  computeScoreAfter,
  formatResumeMeta,
} from '@zhiyou/shared';

import { getAIService } from '../lib/ai';

// getAIService() 是懒初始化的（第一次调用时才读 env），所以在 import 之后
// 赋值仍然有效——不必依赖调用方在命令行里带 AI_PROVIDER=mock。
process.env.AI_PROVIDER = 'mock';

let failed = 0;

function check(label: string, condition: boolean, detail?: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
    return;
  }
  failed += 1;
  console.error(`  ✗ ${label}${detail ? ` —— ${detail}` : ''}`);
}

async function main(): Promise<void> {
  const ai = getAIService();
  console.log(`provider: ${ai.constructor.name}\n`);

  /* ---------- 1. parseResume（POST /api/resumes/parse 的 AI 段） ---------- */
  console.log('parseResume');
  const parsed = await ai.parseResume({
    filename: '产品经理-李婷.pdf',
    mediaType: 'application/pdf',
    data: Buffer.from('%PDF-1.4 假的简历原件，mock 不会去读它'),
  });
  const parsedOk = ParseResumeResponseSchema.safeParse(parsed);
  check('返回值符合 ParseResumeResponseSchema', parsedOk.success,
    parsedOk.success ? undefined : JSON.stringify(parsedOk.error.issues));
  check('title 取自上传文件名', parsed.title === '产品经理-李婷.pdf', parsed.title);

  /* ---------- 2. analyze（POST /api/analyses 的 AI 段） ---------- */
  console.log('\nanalyze');
  const analysis = await ai.analyze({
    resume: MOCK_RESUME_BEFORE,
    jdText: MOCK_JD_TEXT,
    baseScore: MOCK_BASE_SCORE,
  });
  const analysisOk = AnalyzeResponseSchema.safeParse(analysis);
  check('返回值符合 AnalyzeResponseSchema', analysisOk.success,
    analysisOk.success ? undefined : JSON.stringify(analysisOk.error.issues));
  check('给出了建议', analysis.suggestions.length > 0,
    `条数 ${analysis.suggestions.length}`);
  check('job_title / company 非空',
    analysis.job_title.length > 0 && analysis.company.length > 0,
    `${analysis.job_title} · ${analysis.company}`);

  const badPath = analysis.suggestions.find(
    (s) => !FieldPathSchema.safeParse(s.field_path).success,
  );
  check('每条 field_path 都通过 FieldPathSchema', badPath === undefined,
    badPath?.field_path);

  // 光过白名单不够：路径还得在这份简历上真的落得下去，否则建议会在
  // apply 阶段被静默跳过，用户看到的分数就和实际改动对不上。
  const unresolvable = analysis.suggestions.filter(
    (s) => !applySuggestion(MOCK_RESUME_BEFORE, s.field_path, '探针').applied,
  );
  check('每条 field_path 都能在这份简历上解析', unresolvable.length === 0,
    unresolvable.map((s) => s.field_path).join(', '));

  // 把 original_text 写回它自己声称的位置——只有当它确实是那里的原文时，
  // 结果才和原简历一模一样。这样就不必在这里重写一份路径读取逻辑。
  const rewritten = applySuggestions(
    MOCK_RESUME_BEFORE,
    analysis.suggestions.map((s) => ({ ...s, suggested_text: s.original_text })),
  ).content;
  check('original_text 与简历里该位置的原文一致',
    isDeepStrictEqual(rewritten, MOCK_RESUME_BEFORE));

  /* ---------- 3. 计分与写回（POST /api/analyses/[id]/apply 的纯逻辑段） ---------- */
  console.log('\napply（纯确定性计算，不调模型）');
  const { content: after, skipped } = applySuggestions(
    MOCK_RESUME_BEFORE,
    analysis.suggestions,
  );
  check('全部采纳时没有建议被跳过', skipped.length === 0,
    skipped.map((s) => s.field_path).join(', '));
  check('写回结果仍符合 ResumeContentSchema',
    ResumeContentSchema.safeParse(after).success);

  const landed = analysis.suggestions.filter((s) => !skipped.includes(s));
  const scoreAfter = computeScoreAfter(MOCK_BASE_SCORE, landed, analysis.max_score);
  check('全部采纳后正好等于 max_score', scoreAfter === analysis.max_score,
    `${MOCK_BASE_SCORE} → ${scoreAfter}，max_score=${analysis.max_score}`);
  check('max_score = 起始分 + 2×条数（DESIGN-SPEC §5.3）',
    analysis.max_score === MOCK_BASE_SCORE + landed.length * 2,
    `${analysis.max_score} vs ${MOCK_BASE_SCORE + landed.length * 2}`);

  /* ---------- 4. draftFromTemplate（POST /api/resumes/from-template 的 AI 段） ---------- */
  console.log('\ndraftFromTemplate');
  const draft = await ai.draftFromTemplate({
    profile: MOCK_PROFILE,
    templateKey: 'v1',
  });
  const draftOk = ResumeContentSchema.safeParse(draft);
  check('返回值符合 ResumeContentSchema', draftOk.success,
    draftOk.success ? undefined : JSON.stringify(draftOk.error.issues));
  check('姓名取自个人资料', draft.name === MOCK_PROFILE.full_name, draft.name);
  check('基本信息栏由 profile 拼装',
    draft.meta === formatResumeMeta(MOCK_PROFILE), draft.meta);

  console.log(
    failed === 0
      ? '\n全部通过。'
      : `\n${failed} 项未通过。`,
  );
  if (failed > 0) process.exitCode = 1;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
