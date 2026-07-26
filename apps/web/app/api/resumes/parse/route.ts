import { NextResponse } from 'next/server';

import { getConfiguredAIService } from '../../../../lib/ai';
import { withUsage } from '../../../../lib/ai/usage';
import { errorResponse } from '../../../../lib/http';
import { authenticate } from '../../../../lib/supabase';

/**
 * POST /api/resumes/parse —— 「上传已有简历」（截图 07）。
 *
 * PDF 与图片直接作为 document / image 内容块交给 Claude；Word 先用
 * mammoth 转成纯文本再进去（模型不吃 .docx 的二进制）。
 *
 * 接入的是 OpenAI 兼容平台时 PDF / 图片走不通，适配器会抛
 * AIUnsupportedInputError，errorResponse 把它映射成 415 并提示换 Word 上传
 * 或改用 Anthropic 接入。
 */

const MAX_BYTES = 20 * 1024 * 1024;

const DOCX =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

const SUPPORTED = new Set([
  'application/pdf',
  DOCX,
  'application/msword',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export async function POST(request: Request) {
  try {
    const { supabase, userId } = await authenticate(request);

    const form = await request.formData();
    const file = form.get('file');

    if (!(file instanceof File)) {
      return NextResponse.json(
        { error: 'invalid_request', message: '没有收到文件' },
        { status: 400 },
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: 'file_too_large', message: '文件太大了，请控制在 20MB 以内' },
        { status: 413 },
      );
    }

    if (!SUPPORTED.has(file.type)) {
      return NextResponse.json(
        { error: 'unsupported_type', message: '暂时只支持 PDF / Word / 图片' },
        { status: 415 },
      );
    }

    let data = Buffer.from(await file.arrayBuffer());
    let mediaType = file.type;

    if (file.type === DOCX || file.type === 'application/msword') {
      // 动态引入：只有真的传了 Word 才把 mammoth 加载进来
      const mammoth = await import('mammoth');
      const { value } = await mammoth.extractRawText({ buffer: data });
      data = Buffer.from(value, 'utf8');
      mediaType = 'text/plain';
    }

    const { service, platform, model } = await getConfiguredAIService();

    const result = await withUsage(
      supabase,
      { userId, kind: 'parse', platform, model },
      (options) =>
        service.parseResume({ filename: file.name, mediaType, data }, options),
    );

    return NextResponse.json(result);
  } catch (error) {
    return errorResponse(error);
  }
}
