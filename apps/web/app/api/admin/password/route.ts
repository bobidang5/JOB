import { NextResponse } from 'next/server';
import { z } from 'zod';

import { clientIp, writeAudit } from '../../../../lib/admin/audit';
import { adminDb } from '../../../../lib/admin/db';
import { hashPassword, verifyPassword } from '../../../../lib/admin/password';
import {
  issueSessionToken,
  readAdminSession,
  setSessionCookie,
} from '../../../../lib/admin/session';
import { errorResponse } from '../../../../lib/http';

/**
 * POST /api/admin/password —— 修改管理员口令。
 *
 * 出厂口令写在迁移文件里，任何拿到源码的人都知道，所以这条路径是「能不能
 * 放上公网」的前提，不是可选项。
 */

const MIN_PASSWORD_LENGTH = 8;

const ChangePasswordSchema = z.object({
  // 必须提供旧口令：光有 cookie 不够。会话可能是从一台没锁屏的电脑上捡到
  // 的，再要一次口令才能保证改密的人确实知道当前口令。
  current_password: z.string().min(1).max(256),
  new_password: z
    .string()
    .min(MIN_PASSWORD_LENGTH, `新口令至少 ${MIN_PASSWORD_LENGTH} 位`)
    .max(256),
});

export async function POST(request: Request) {
  try {
    const session = await readAdminSession();
    if (!session) {
      return NextResponse.json(
        { error: 'unauthorized', message: '后台会话无效，请重新登录' },
        { status: 401 },
      );
    }

    const body = ChangePasswordSchema.parse(await request.json());
    const ip = clientIp(request);

    const { data: admin, error } = await adminDb()
      .from('admin_users')
      .select('id, username, password_hash')
      .eq('id', session.id)
      .maybeSingle();

    if (error) throw new Error(error.message);
    if (!admin) {
      return NextResponse.json(
        { error: 'unauthorized', message: '后台会话无效，请重新登录' },
        { status: 401 },
      );
    }

    if (!verifyPassword(body.current_password, admin.password_hash)) {
      // admin_action 枚举里没有单独的「改密失败」，而枚举定在迁移里不改。
      // 借 login_failed + detail.reason 记下来——重新验证口令失败这件事跟
      // 登录失败是同一类信号，都是「有人在试口令」，漏掉才是问题。
      await writeAudit({
        adminUserId: admin.id,
        username: admin.username,
        action: 'login_failed',
        detail: { reason: 'password_change_current_mismatch' },
        ip,
      });

      return NextResponse.json(
        { error: 'invalid_credentials', message: '当前口令不正确' },
        { status: 401 },
      );
    }

    if (body.new_password === body.current_password) {
      return NextResponse.json(
        { error: 'same_password', message: '新口令不能和当前口令相同' },
        { status: 400 },
      );
    }

    const { data: updated, error: updateError } = await adminDb()
      .from('admin_users')
      .update({
        password_hash: hashPassword(body.new_password),
        /*
         * 改密的一半意义就是把可能已经泄露的旧会话踢下线。token_version + 1
         * 之后，readAdminSession() 的回查会让所有旧票据在下一次请求就失效
         * ——包括这次请求自己带来的那张，所以下面要重新签一张。
         */
        token_version: session.tokenVersion + 1,
        is_default_password: false,
      })
      .eq('id', session.id)
      // 乐观并发：万一另一处同时也在改密，token_version 已经不是我们读到的
      // 那个值了，这条更新就不该盖上去
      .eq('token_version', session.tokenVersion)
      .select('id, username, token_version')
      .maybeSingle();

    if (updateError) throw new Error(updateError.message);
    if (!updated) {
      return NextResponse.json(
        { error: 'conflict', message: '会话状态已变化，请重新登录后再试' },
        { status: 409 },
      );
    }

    const response = NextResponse.json({ ok: true });
    // 用刚写进库的 token_version 签，于是所有旧票据都作废，只有当前这条
    // 会话活下来——改完密不用重新登录，但别人手里的那张已经没用了
    setSessionCookie(response, issueSessionToken(updated));

    await writeAudit({
      adminUserId: updated.id,
      username: updated.username,
      action: 'password_changed',
      detail: { token_version: updated.token_version },
      ip,
    });

    return response;
  } catch (error) {
    return errorResponse(error);
  }
}
