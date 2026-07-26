import {
  ApplySuggestionsRequestSchema,
  ResumeContentSchema,
  SuggestionSchema,
  applySuggestions,
  computeScoreAfter,
} from '@zhiyou/shared';
import { NextResponse } from 'next/server';

import { errorResponse, unwrap } from '../../../../../lib/http';
import { authenticate } from '../../../../../lib/supabase';

/**
 * POST /api/analyses/[id]/apply —— 完成页点「完成」时调用。
 *
 * 这里**不调模型**：改写文案在建议里已经有了，这一步是纯确定性计算——
 * 按 field_path 把采纳项写回内容、算新分、存一个版本、插一条记录。
 * 计分用的是 packages/shared 里前后端共用的那一份实现，所以完成页上
 * 显示的数字和落库的数字不可能对不上。
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase, userId } = await authenticate(request);
    const { id } = await params;
    const body = ApplySuggestionsRequestSchema.parse(await request.json());

    const analysis = unwrap(
      await supabase
        .from('analyses')
        .select('id, resume_id, base_score, max_score')
        .eq('id', id)
        .single(),
      '找不到这次分析',
    );

    const resume = unwrap(
      await supabase
        .from('resumes')
        .select('id, content, score')
        .eq('id', analysis.resume_id)
        .single(),
      '找不到这份简历',
    );

    const rows = unwrap(
      await supabase
        .from('suggestions')
        .select('*')
        .eq('analysis_id', id)
        .order('position'),
      '找不到建议',
    );

    const adoptedIds = new Set(body.adopted_suggestion_ids);
    const adopted = rows
      .filter((row) => adoptedIds.has(row.id))
      .map((row) => SuggestionSchema.parse(row));

    const before = ResumeContentSchema.parse(resume.content);
    const { content, skipped } = applySuggestions(before, adopted);

    if (skipped.length > 0) {
      // 路径失效的建议不该计分——用户看到的分数必须对应真正落地的改动
      console.warn('[apply] 有建议因路径失效未落地', {
        analysisId: id,
        skipped: skipped.map((s) => s.field_path),
      });
    }
    const landed = adopted.filter((s) => !skipped.includes(s));

    const scoreBefore = analysis.base_score;
    const scoreAfter = computeScoreAfter(
      scoreBefore,
      landed,
      analysis.max_score ?? scoreBefore,
    );

    const version = unwrap(
      await supabase
        .from('resume_versions')
        .insert({
          resume_id: resume.id,
          user_id: userId,
          content,
          score: scoreAfter,
        })
        .select('id')
        .single(),
      '版本写入失败',
    );

    const { error: updateError } = await supabase
      .from('resumes')
      .update({ content, score: scoreAfter })
      .eq('id', resume.id);
    if (updateError) throw new Error(updateError.message);

    // 标记每条建议的最终状态，供以后回看
    const { error: statusError } = await supabase.from('suggestions').upsert(
      rows.map((row) => ({
        ...row,
        status: adoptedIds.has(row.id) ? 'adopted' : 'skipped',
      })),
    );
    if (statusError) throw new Error(statusError.message);

    const optimization = unwrap(
      await supabase
        .from('optimizations')
        .insert({
          user_id: userId,
          analysis_id: id,
          resume_id: resume.id,
          resume_version_id: version.id,
          adopted_count: landed.length,
          score_before: scoreBefore,
          score_after: scoreAfter,
        })
        .select('id')
        .single(),
      '记录写入失败',
    );

    return NextResponse.json({
      score_before: scoreBefore,
      score_after: scoreAfter,
      adopted_count: landed.length,
      resume_id: resume.id,
      resume_version_id: version.id,
      optimization_id: optimization.id,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
