/**
 * GET /api/lcsc/batch?codes=C1,C2,C3
 * 批量查询，最多 30 个，逻辑与 v1.x Worker 一致。
 */
import { VERSION, handleBatch, jsonResp, preflightResp } from './_lib.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflightResp();
  if (request.method !== 'GET') {
    return jsonResp({ ok: false, error: 'Method Not Allowed' }, 405);
  }
  const url = new URL(request.url);
  const codes = (url.searchParams.get('codes') || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    const body = await handleBatch(codes, env);
    return jsonResp(body);
  } catch (e) {
    return jsonResp({ ok: false, error: String(e.message || e), version: VERSION }, 500);
  }
}
