import { ProfileSchema, ResumeTemplateKeySchema } from '@zhiyou/shared';
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getAIService } from '../../../../lib/ai';
import { errorResponse, unwrap } from '../../../../lib/http';
import { authenticate } from '../../../../lib/supabase';

const RequestSchema = z.object({
  template_key: ResumeTemplateKeySchema,
});

/**
 * POST /api/resumes/from-template —— 「就用这个模版」（截图 09）。
 *
 * 注意这里的分工：**已有简历换模版不需要调这个接口**，内容已经是结构化
 * 数据，换模版只是换渲染版式，客户端本地改 template_key 即可。真正需要
 * AI 的只有「新用户还没有任何简历」这一种情况——那时要用个人资料起草
 * 第一份内容。原型里 1.4 秒的「AI 正在把你的内容填入模版…」遮罩在前一种
 * 情况下只是维持节奏感，不代表有模型在跑。
 */
export async function POST(request: Request) {
  try {
    const { supabase, userId } = await authenticate(request);
    const body = RequestSchema.parse(await request.json());

    const existing = unwrap(
      await supabase
        .from('resumes')
        .select('id')
        .eq('user_id', userId)
        .limit(1),
      '查询简历失败',
    );

    if (existing.length > 0) {
      return NextResponse.json(
        {
          error: 'already_has_resume',
          message: '已有简历时换模版不需要走这个接口，直接改 template_key',
        },
        { status: 409 },
      );
    }

    const profileRow = unwrap(
      await supabase
        .from('profiles')
        .select('full_name, job_intent, years_experience, city, phone, email, avatar_url')
        .eq('id', userId)
        .single(),
      '找不到个人资料',
    );
    const profile = ProfileSchema.parse(profileRow);

    const content = await getAIService().draftFromTemplate({
      profile,
      templateKey: body.template_key,
    });

    const resume = unwrap(
      await supabase
        .from('resumes')
        .insert({
          user_id: userId,
          title: `${profile.job_intent || '我的简历'}-${profile.full_name}.pdf`,
          template_key: body.template_key,
          content,
          // 起草稿还没经过任何优化，从 0 起步；第一次分析会给出真实基线
          score: 0,
          source: 'template',
          is_default: true,
        })
        .select('id, title, template_key, content, score')
        .single(),
      '简历写入失败',
    );

    return NextResponse.json(resume);
  } catch (error) {
    return errorResponse(error);
  }
}
