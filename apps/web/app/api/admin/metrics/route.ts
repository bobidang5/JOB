import { NextResponse } from 'next/server';

import { loadDashboardMetrics } from '../../../../lib/admin/metrics';
import { readAdminSession } from '../../../../lib/admin/session';
import { errorResponse } from '../../../../lib/http';

/**
 * GET /api/admin/metrics —— 看板那份聚合数据。
 *
 * 后台首页并不走这条路：页面是 Server Component，直接调
 * loadDashboardMetrics()，少一次自己请求自己的往返。这个接口是给外部用的
 * （监控面板、周报脚本），两边共用同一个函数，不会出现「页面和接口对不上」。
 *
 * 返回体里没有任何单个用户的数据，也没有 api key：ai_providers 那段只查了
 * label / platform / model / 上次测试结果几列，密文列压根没进查询。
 */
export async function GET() {
  try {
    // middleware 已经挡过一道，这里仍然自己校验一次：那一层跑在 Edge
    // runtime 上、查不了 token_version，一张改密后作废的票据它是放行的。
    // 权威判断只在 readAdminSession()。
    const session = await readAdminSession();
    if (!session) {
      return NextResponse.json(
        { error: 'unauthorized', message: '后台会话无效，请重新登录' },
        { status: 401 },
      );
    }

    const metrics = await loadDashboardMetrics();

    return NextResponse.json(metrics, {
      // 这是实时经营数据，任何一层缓存都会让人看着旧数字做判断。
      // 而且响应体只对管理员可见，绝不能被共享缓存留下来。
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
