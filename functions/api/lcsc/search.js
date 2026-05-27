/**
 * GET /api/lcsc/search?q=10K&pkg=0805&page=1
 * 关键字搜索（V2 反查未匹配料）
 */
import { VERSION, handleSearch, jsonResp, preflightResp } from './_lib.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflightResp();
  if (request.method !== 'GET') {
    return jsonResp({ ok: false, error: 'Method Not Allowed' }, 405);
  }
  const url = new URL(request.url);
  try {
    const body = await handleSearch(
      url.searchParams.get('q'),
      url.searchParams.get('pkg'),
      url.searchParams.get('page'),
      env,
    );
    return jsonResp(body);
  } catch (e) {
    return jsonResp({ ok: false, error: String(e.message || e), version: VERSION }, 500);
  }
}
