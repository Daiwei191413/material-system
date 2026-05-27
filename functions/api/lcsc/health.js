/**
 * GET /api/lcsc/health   健康检查
 */
import { VERSION, jsonResp, preflightResp } from './_lib.js';

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') return preflightResp();
  return jsonResp({
    ok: true,
    service: 'lcsc-proxy',
    runtime: 'edgeone-pages-functions',
    version: VERSION,
    ts: Date.now(),
    env_check: {
      JLC_APP_ID: !!env.JLC_APP_ID,
      JLC_ACCESS_KEY: !!env.JLC_ACCESS_KEY,
      JLC_SECRET_KEY: !!env.JLC_SECRET_KEY,
      LCSC_CACHE: !!env.LCSC_CACHE,
    },
  });
}
