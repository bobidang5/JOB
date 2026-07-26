import {
  CreateAnalysisRequestSchema,
  MIN_JD_LENGTH,
  ResumeContentSchema,
} from '@zhiyou/shared';
import { NextResponse } from 'next/server';

import { getConfiguredAIService } from '../../../lib/ai';
import { withUsage } from '../../../lib/ai/usage';
import { errorResponse, unwrap } from '../../../lib/http';
import { authenticate } from '../../../lib/supabase';

/**
 * POST /api/analyses —— 主流程的核心。
 *
 * 一次调用产出匹配度页和优化建议页的全部数据，随后连同 job_target 一起
 * 落库。客户端在「AI 正在分析」那一屏等这个响应（见 analyzing.tsx 里
 * 「动画走完 且 接口返回」的双条件）。
 */
export async function POST(request: Request) {
  try {
    const { supabase, userId } = await authenticate(request);
    const body = CreateAnalysisRequestSchema.parse(await request.json());

    // DESIGN-SPEC §5.1 的长度门槛。前端会先拦一次，这里是第二道；
    // 数据库上还有第三道 CHECK 约束。
    if (body.jd_text.length < MIN_JD_LENGTH) {
      return NextResponse.json(
        {
          error: 'jd_too_short',
          message: `职位描述太短了，至少 ${MIN_JD_LENGTH} 字才能准确分析`,
        },
        { status: 400 },
      );
    }

    const resume = unwrap(
      await supabase
        .from('resumes')
        .select('id, content, score, title, template_key')
        .eq('id', body.resume_id)
        .single(),
      '找不到这份简历',
    );

    const content = ResumeContentSchema.parse(resume.content);

    const { service, platform, model } = await getConfiguredAIService();

    // 先分析：职位名与公司名是模型从 JD 里抽出来的，拿到之后再建
    // job_target，省得先插一条空的再回头更新。
    const analysis = await withUsage(
      supabase,
      { userId, kind: 'analyze', platform, model },
      (options) =>
        service.analyze(
          {
            resume: content,
            jdText: body.jd_text,
            baseScore: resume.score,
          },
          options,
        ),
    );

    const jobTarget = unwrap(
      await supabase
        .from('job_targets')
        .insert({
          user_id: userId,
          title: analysis.job_title,
          company: analysis.company,
          jd_text: body.jd_text,
        })
        .select('id')
        .single(),
      '目标职位写入失败',
    );

    const analysisRow = unwrap(
      await supabase
        .from('analyses')
        .insert({
          user_id: userId,
          resume_id: resume.id,
          job_target_id: jobTarget.id,
          status: 'succeeded',
          match_score: analysis.match_score,
          satisfied_count: analysis.satisfied_count,
          missing_keywords: analysis.missing_keywords,
          base_score: resume.score,
          max_score: analysis.max_score,
          completed_at: new Date().toISOString(),
        })
        .select('id')
        .single(),
      '分析结果写入失败',
    );

    const suggestions = unwrap(
      await supabase
        .from('suggestions')
        .insert(
          analysis.suggestions.map((suggestion, position) => ({
            analysis_id: analysisRow.id,
            position,
            tag: suggestion.tag,
            original_text: suggestion.original_text,
            suggested_text: suggestion.suggested_text,
            emphasis: suggestion.emphasis,
            rationale: suggestion.rationale,
            score_delta: suggestion.score_delta,
            field_path: suggestion.field_path,
          })),
        )
        .select('*')
        .order('position'),
      '建议写入失败',
    );

    return NextResponse.json({
      id: analysisRow.id,
      job_title: analysis.job_title,
      company: analysis.company,
      match_score: analysis.match_score,
      satisfied_count: analysis.satisfied_count,
      missing_keywords: analysis.missing_keywords,
      base_score: resume.score,
      max_score: analysis.max_score,
      suggestions,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
