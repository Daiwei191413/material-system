/**
 * GET /api/lcsc/quota   查看今日配额消耗（KV 计数）
 */
import { VERSION, getQuota, jsonResp, preflightResp } from './_lib.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflightResp();
  return jsonResp({
    ok: true,
    version: VERSION,
    quota: await getQuota(env),
  });
}
