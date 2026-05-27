/**
 * GET /api/lcsc            服务信息
 * GET /api/lcsc?k=C431542  单颗查询（保持 v1.x 契约）
 *
 * EdgeOne Pages Functions 入口签名：
 *   onRequest({ request, env, params, waitUntil })
 */
import {
  VERSION, handleSingle, jsonResp, preflightResp,
} from './_lib.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflightResp();
  if (request.method !== 'GET') {
    return jsonResp({ ok: false, error: 'Method Not Allowed' }, 405);
  }

  const url = new URL(request.url);
  if (url.searchParams.has('k')) {
    try {
      const body = await handleSingle(url.searchParams.get('k'), env);
      return jsonResp(body);
    } catch (e) {
      return jsonResp({ ok: false, error: String(e.message || e), version: VERSION }, 500);
    }
  }

  return jsonResp({
    ok: true,
    service: 'lcsc-proxy',
    runtime: 'edgeone-pages-functions',
    version: VERSION,
    backend: 'JLC OpenAPI (signed)',
    endpoints: {
      '/api/lcsc?k=C431542': '查询单个立创编号',
      '/api/lcsc/batch?codes=C1,C2,C3': '批量查询（最多 30 个）',
      '/api/lcsc/search?q=10K&pkg=0805&page=1': '关键字搜索（V2 反查未匹配料）',
      '/api/lcsc/health': '健康检查',
      '/api/lcsc/quota': '查看今日配额消耗',
    },
  });
}
