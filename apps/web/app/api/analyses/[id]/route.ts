import { NextResponse } from 'next/server';

import { errorResponse, unwrap } from '../../../../lib/http';
import { authenticate } from '../../../../lib/supabase';

/** GET /api/analyses/[id] —— 回看一次分析（RLS 保证只能看自己的）。 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { supabase } = await authenticate(request);
    const { id } = await params;

    const analysis = unwrap(
      await supabase
        .from('analyses')
        .select(
          'id, status, match_score, satisfied_count, missing_keywords, base_score, max_score, error, created_at, completed_at, job_targets(title, company)',
        )
        .eq('id', id)
        .single(),
      '找不到这次分析',
    );

    const suggestions = unwrap(
      await supabase
        .from('suggestions')
        .select('*')
        .eq('analysis_id', id)
        .order('position'),
      '找不到建议',
    );

    return NextResponse.json({ ...analysis, suggestions });
  } catch (error) {
    return errorResponse(error);
  }
}
