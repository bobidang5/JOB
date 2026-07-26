import { NextResponse } from 'next/server';

import { clientIp, writeAudit } from '../../../../lib/admin/audit';
import { clearSessionCookie, readAdminSession } from '../../../../lib/admin/session';
import { errorResponse } from '../../../../lib/http';

/**
 * POST /api/admin/logout
 *
 * 只接受 POST：GET 会被浏览器预取、被 <img> 触发，一条能用 GET 打的登出
 * 接口等于给了别人一个骚扰按钮。
 */
export async function POST(request: Request) {
  try {
    // 先读会话再清 cookie：留痕需要知道是谁登出的。读不到也照样往下走
    // ——票据可能已经过期或被改密作废，那种情况更要把 cookie 清干净。
    const session = await readAdminSession();

    const response = NextResponse.json({ ok: true });
    clearSessionCookie(response);

    if (session) {
      await writeAudit({
        adminUserId: session.id,
        username: session.username,
        action: 'logout',
        ip: clientIp(request),
      });
    }

    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
