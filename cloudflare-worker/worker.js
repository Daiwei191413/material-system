/**
 * 立创开放平台代理 Worker - BOM 整理神器配套服务
 *
 * 用途：通过立创官方开放平台 API 查询元器件信息（替代旧版 HTML 抓取）。
 *       签名认证 + KV 缓存 + 批量去重，最大化节省每天 1000 次配额。
 *
 * 接口契约（保持与 v1.x 兼容）：
 *   GET /?k=C431542               单颗查询
 *   GET /batch?codes=C1,C2,C3     批量查询（最多 30 颗）
 *   GET /health                   健康检查
 *   GET /quota                    查看今日配额消耗（KV 计数）
 *
 * 环境变量（wrangler secret）：
 *   JLC_ACCESS_KEY  立创开放平台 access_key
 *   JLC_SECRET_KEY  立创开放平台 secret_key（仅 HMAC 签名计算用）
 *   JLC_APP_ID      立创开放平台 app_id
 *
 * KV 绑定：
 *   LCSC_CACHE      元器件数据缓存，TTL 7 天
 *
 * 版本：v1.0.8（底层切换至立创官方 OpenAPI，HMAC-SHA256 签名；对外契约不变）
 * 部署：cd cloudflare-worker && export CLOUDFLARE_API_TOKEN=xxx && npx wrangler deploy
 * 作者：开发助理 (hdv_dev_bot) for 戴纬哥 · 技象科技
 */

const VERSION = 'v1.0.8';
const JLC_BASE = 'https://open-api.jlc.com';
const JLC_PATH = '/smtOpenApi/smtComponent/selectComponentInfoByCodes';
const CACHE_TTL = 7 * 86400; // 7 天
const BATCH_HARD_CAP = 30;   // 与前端约定一致

// 允许跨域的域名白名单
const ALLOWED_ORIGINS = [
  'https://techphant-bom-tools.pages.dev',
  'https://daiwei191413.github.io',
  'http://localhost:8765',
  'http://127.0.0.1:8765',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

// 通配后缀（CF Pages 预览分支：xxx.techphant-bom-tools.pages.dev）
const ALLOWED_ORIGIN_SUFFIXES = [
  '.techphant-bom-tools.pages.dev',
];

const CORS_HEADERS_FACTORY = (origin) => {
  const isAllowed = ALLOWED_ORIGINS.includes(origin) ||
                    ALLOWED_ORIGIN_SUFFIXES.some((suf) => origin.endsWith(suf));
  const allow = isAllowed ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
};

// ==================== 立创签名 ====================

function genNonce(len = 32) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const arr = new Uint8Array(len);
  crypto.getRandomValues(arr);
  let out = '';
  for (let i = 0; i < len; i++) out += chars[arr[i] % chars.length];
  return out;
}

async function hmacSha256Base64(secret, message) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message));
  // ArrayBuffer → Base64
  const bytes = new Uint8Array(sig);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function buildAuthHeader(env, method, path, body) {
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = genNonce(32);
  const stringToSign = `${method}\n${path}\n${ts}\n${nonce}\n${body}\n`;
  const signature = await hmacSha256Base64(env.JLC_SECRET_KEY, stringToSign);
  return `JOP appid="${env.JLC_APP_ID}",accesskey="${env.JLC_ACCESS_KEY}",timestamp="${ts}",nonce="${nonce}",signature="${signature}"`;
}

// ==================== JLC API 调用 ====================

async function jlcQuery(codes, env) {
  if (!env.JLC_ACCESS_KEY || !env.JLC_SECRET_KEY || !env.JLC_APP_ID) {
    throw new Error('立创签名密钥未配置（需 wrangler secret 设置 JLC_ACCESS_KEY/JLC_SECRET_KEY/JLC_APP_ID）');
  }
  const bodyObj = { componentCodeList: codes };
  // 关键：签名用的 body 必须和发送的 body 一字节不差，所以这里固定 separators
  const body = JSON.stringify(bodyObj);
  const auth = await buildAuthHeader(env, 'POST', JLC_PATH, body);

  const resp = await fetch(JLC_BASE + JLC_PATH, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Accept': 'application/json',
      'Authorization': auth,
    },
    body,
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`立创 API HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  const json = await resp.json();
  if (!json.success) {
    throw new Error(`立创 API 业务失败: code=${json.code} message=${json.message} errorCode=${json.errorCode}`);
  }
  return json.data || [];
}

// ==================== 字段映射 JLC → 兼容输出 ====================

// 把 JLC 返回的 paramTextAll 转成前端期望的「字段：值」全角冒号格式
// 输入示例：阻值:10000Ω,精度:±1%,功率:0.125W
// 输出示例：阻值：10000Ω, 精度：±1%, 功率：0.125W
function jlcParamToSpec(paramTextAll) {
  if (!paramTextAll) return '';
  return paramTextAll
    .split(/[,，]/)
    .map((seg) => seg.trim())
    .filter(Boolean)
    .map((seg) => {
      const m = seg.match(/^([^:：]+)\s*[:：]\s*(.+)$/);
      return m ? `${m[1].trim()}：${m[2].trim()}` : seg;
    })
    .join(', ');
}

// 把 paramTextAll 解析成 map（以备前端 toAStyleSpec 二次使用）
function jlcParamToMap(paramTextAll) {
  const out = {};
  if (!paramTextAll) return out;
  paramTextAll.split(/[,，]/).forEach((seg) => {
    const m = seg.trim().match(/^([^:：]+)\s*[:：]\s*(.+)$/);
    if (m) out[m[1].trim()] = m[2].trim();
  });
  return out;
}

function jlcToCompatData(query, jlcItem) {
  if (!jlcItem) {
    return { query, hit: false, error: '立创未找到该编号' };
  }
  return {
    query,
    hit: true,
    productCode: jlcItem.componentCode || '',
    productModel: jlcItem.componentModel || '',
    productName: jlcItem.componentName || '',
    productType: jlcItem.componentType || '',
    brand: jlcItem.componentBrand || '',
    package: jlcItem.componentSpecification || '',
    unit: 'PCS',
    productId: String(jlcItem.componentId || ''),
    remark: jlcItem.componentName || '',
    paramLinkedMap: jlcParamToMap(jlcItem.paramTextAll || ''),
    specification: jlcParamToSpec(jlcItem.paramTextAll || ''),
    // JLC 独有字段，留给前端将来用
    stockNum: jlcItem.stockNum || 0,
    encapsulationNumber: jlcItem.encapsulationNumber || 0,
    priceLadder: jlcItem.smtComponentPriceInfoVOList || [],
  };
}

// ==================== 配额计数（KV 软计数，仅供监控） ====================

async function bumpQuota(env, count) {
  if (!env.LCSC_CACHE) return;
  // 用 北京时间 当天的 yyyy-mm-dd 做 key
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const dateKey = now.toISOString().slice(0, 10);
  const key = `quota:${dateKey}`;
  try {
    const current = parseInt((await env.LCSC_CACHE.get(key)) || '0', 10);
    await env.LCSC_CACHE.put(key, String(current + count), { expirationTtl: 3 * 86400 });
  } catch (e) {
    // 计数失败不影响主流程
  }
}

async function getQuota(env) {
  if (!env.LCSC_CACHE) return { configured: false };
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const dateKey = now.toISOString().slice(0, 10);
  const key = `quota:${dateKey}`;
  const used = parseInt((await env.LCSC_CACHE.get(key)) || '0', 10);
  return {
    configured: true,
    date: dateKey,
    used,
    daily_limit: 1000,
    remaining: Math.max(0, 1000 - used),
  };
}

// ==================== 核心：批量查询 + KV 缓存 ====================

function normCode(c) {
  c = String(c || '').trim().toUpperCase();
  return /^C\d{2,}$/.test(c) ? c : '';
}

async function handleSingle(rawCode, env, ctx) {
  const code = normCode(rawCode);
  if (!code) {
    return { ok: false, error: '参数格式错误，需要 C 开头的立创编号（如 C431542）' };
  }
  const result = await handleBatchInternal([code], env, ctx);
  const r = result.results[0];
  if (!r) return { ok: false, error: '未知错误' };
  return r;
}

async function handleBatch(rawCodes, env, ctx) {
  // 规范化 + 截断
  const seen = new Set();
  const codes = [];
  for (const c of rawCodes) {
    const nc = normCode(c);
    if (nc && !seen.has(nc)) {
      seen.add(nc);
      codes.push(nc);
      if (codes.length >= BATCH_HARD_CAP) break;
    }
  }
  if (codes.length === 0) {
    return { ok: true, count: 0, results: [] };
  }
  // 保留原始（带格式问题的）输入顺序，供下游逐项映射
  const queryList = (rawCodes || []).slice(0, BATCH_HARD_CAP);
  return handleBatchInternal(queryList, env, ctx);
}

async function handleBatchInternal(queryList, env, ctx) {
  // queryList 可以是规范化或原始的 code 列表，逐个映射回结果
  // 1) 规范化每个 query 为 C 编号
  const normalized = queryList.map((q) => ({ query: q, code: normCode(q) }));

  // 2) 收集需要查询的唯一 code（去重 + 过滤无效）
  const validCodes = [];
  const seen = new Set();
  for (const it of normalized) {
    if (it.code && !seen.has(it.code)) {
      seen.add(it.code);
      validCodes.push(it.code);
    }
  }

  // 3) 查 KV 缓存
  const cacheMap = {}; // code → data
  let cacheHits = 0;
  if (env && env.LCSC_CACHE && validCodes.length > 0) {
    const cacheReads = await Promise.all(
      validCodes.map((c) => env.LCSC_CACHE.get(`jlc:${c}`, { type: 'json' })),
    );
    for (let i = 0; i < validCodes.length; i++) {
      if (cacheReads[i]) {
        cacheMap[validCodes[i]] = cacheReads[i];
        cacheHits++;
      }
    }
  }

  // 4) 找出未命中的 code，调用 JLC API
  const missing = validCodes.filter((c) => !cacheMap[c]);
  let apiCalls = 0;
  let apiError = null;
  if (missing.length > 0) {
    try {
      const apiData = await jlcQuery(missing, env);
      apiCalls = 1;
      // 用 componentCode 做索引（API 返回顺序 ≠ 请求顺序）
      const apiMap = {};
      for (const item of apiData) {
        if (item && item.componentCode) {
          apiMap[String(item.componentCode).toUpperCase()] = item;
        }
      }
      // 写 KV：命中的写真实数据，未命中的也写 null（避免重复打 API 找不到）
      const writes = [];
      for (const code of missing) {
        const item = apiMap[code];
        const data = jlcToCompatData(code, item);
        cacheMap[code] = data;
        if (env && env.LCSC_CACHE) {
          if (data.hit) {
            writes.push(env.LCSC_CACHE.put(`jlc:${code}`, JSON.stringify(data), { expirationTtl: CACHE_TTL }));
          } else {
            // 不存在的 code 缓存 1 天，避免反复打 API
            writes.push(env.LCSC_CACHE.put(`jlc:${code}`, JSON.stringify(data), { expirationTtl: 86400 }));
          }
        }
      }
      if (writes.length > 0) {
        if (ctx && ctx.waitUntil) {
          ctx.waitUntil(Promise.all(writes));
        } else {
          await Promise.all(writes);
        }
      }
      // 异步上调配额计数
      if (ctx && ctx.waitUntil) {
        ctx.waitUntil(bumpQuota(env, 1));
      } else {
        await bumpQuota(env, 1);
      }
    } catch (e) {
      apiError = String(e.message || e);
    }
  }

  // 5) 按 queryList 顺序拼装结果
  const results = normalized.map((it) => {
    if (!it.code) {
      return { ok: false, error: '编号格式错误', query: it.query };
    }
    const data = cacheMap[it.code];
    if (data) {
      return { ok: true, cached: missing.indexOf(it.code) < 0, data };
    }
    // 整批 API 失败的 fallback
    return { ok: false, error: apiError || '查询失败', query: it.query };
  });

  return {
    ok: true,
    count: results.length,
    cache_hits: cacheHits,
    api_calls: apiCalls,
    api_error: apiError,
    results,
  };
}

// ==================== 入口 ====================

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = CORS_HEADERS_FACTORY(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ ok: false, error: 'Method Not Allowed' }), {
        status: 405,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const path = url.pathname;
    let body;

    try {
      if (path === '/' && !url.searchParams.has('k')) {
        body = {
          ok: true,
          service: 'lcsc-proxy',
          version: VERSION,
          backend: 'JLC OpenAPI (signed)',
          endpoints: {
            '/?k=C431542': '查询单个立创编号',
            '/batch?codes=C1,C2,C3': '批量查询（最多 30 个）',
            '/health': '健康检查',
            '/quota': '查看今日配额消耗',
          },
        };
      } else if (path === '/health') {
        body = { ok: true, service: 'lcsc-proxy', version: VERSION, ts: Date.now() };
      } else if (path === '/quota') {
        body = { ok: true, version: VERSION, quota: await getQuota(env) };
      } else if (path === '/' && url.searchParams.has('k')) {
        body = await handleSingle(url.searchParams.get('k'), env, ctx);
      } else if (path === '/batch') {
        const codes = (url.searchParams.get('codes') || '')
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        body = await handleBatch(codes, env, ctx);
      } else {
        body = { ok: false, error: 'Not Found' };
        return new Response(JSON.stringify(body), {
          status: 404,
          headers: { ...cors, 'Content-Type': 'application/json' },
        });
      }
    } catch (e) {
      body = { ok: false, error: String(e.message || e), version: VERSION };
      return new Response(JSON.stringify(body), {
        status: 500,
        headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify(body, null, 2), {
      status: 200,
      headers: {
        ...cors,
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  },
};
