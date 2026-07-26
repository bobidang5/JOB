import { NextResponse } from 'next/server';

/**
 * OAuth 回调兜底。
 *
 * 正常路径不经过这里：App 里 signInWithOAuth 的 redirectTo 是深链
 * zhiyouai://auth/callback，浏览器直接跳回 App，由 expo-web-browser
 * 取回 code。
 *
 * 但有两种情况会落到这个地址上——用户在桌面浏览器里点了链接，或者某个
 * provider 的控制台只允许配置 https 回调。那时至少要把人引导回 App，
 * 而不是停在一个空白页。
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const error = url.searchParams.get('error_description');

  if (error) {
    return new NextResponse(page('登录没有完成', error), {
      status: 400,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  if (!code) {
    return new NextResponse(page('缺少授权码', '请回到 App 重新登录。'), {
      status: 400,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }

  // 把 code 原样转交给 App 的深链，由客户端完成 PKCE 兑换——
  // code_verifier 只存在于设备上，服务端换不了。
  const deepLink = `zhiyouai://auth/callback?code=${encodeURIComponent(code)}`;
  return new NextResponse(page('正在返回 App…', '如果没有自动跳转，请点下面的链接。', deepLink), {
    status: 200,
    headers: { 'content-type': 'text/html; charset=utf-8' },
  });
}

function page(title: string, body: string, deepLink?: string): string {
  const escape = (value: string) =>
    value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escape(title)}</title>
<style>
  body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;
    background:#F7F7FA;color:#111114;
    font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Noto Sans SC",sans-serif}
  main{text-align:center;padding:32px}
  h1{font-size:20px;font-weight:800;margin:0 0 10px}
  p{font-size:14px;color:#8E8E93;margin:0 0 20px;line-height:1.7}
  a{display:inline-block;background:#007AFF;color:#fff;text-decoration:none;
    font-weight:700;font-size:16px;padding:14px 28px;border-radius:16px}
</style>
</head>
<body>
<main>
  <h1>${escape(title)}</h1>
  <p>${escape(body)}</p>
  ${deepLink ? `<a href="${escape(deepLink)}">打开职优 AI</a>` : ''}
</main>
${deepLink ? `<script>location.replace(${JSON.stringify(deepLink)})</script>` : ''}
</body>
</html>`;
}
