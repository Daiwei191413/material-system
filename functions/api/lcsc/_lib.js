/**
 * EdgeOne Pages Functions - 立创开放平台代理 共享库
 *
 * 把原 cloudflare-worker/worker.js 的核心逻辑抽出来，给同目录下各路由文件复用。
 * 关键差异（与 Workers 对比）：
 *   1. EdgeOne Functions 入口签名是 onRequest({ request, env, params }) 而非 fetch(req,env,ctx)
 *   2. KV 调用方式相同（env.LCSC_CACHE.get/put）
 *   3. 同域部署，无需 CORS（兜底加上 * 通配，方便偶发跨域调试）
 *   4. crypto.subtle 标准 Web Crypto API 完全兼容
 */

export const VERSION = 'edgeone-v1.0.1';
export const JLC_BASE = 'https://open-api.jlc.com';
export const JLC_PATH = '/smtOpenApi/smtComponent/selectComponentInfoByCodes';
export const JLC_SEARCH_PATH = '/smtOpenApi/order/selectComponentInfo';
export const CACHE_TTL = 7 * 86400;
export const SEARCH_CACHE_TTL = 3600;
export const BATCH_HARD_CAP = 30;
export const SEARCH_PAGE_SIZE = 10;

// 同域部署不用 CORS；这里给个宽松通配，方便 v2-dev 沙盒、测试页直接调
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

export const JSON_HEADERS = {
  ...CORS_HEADERS,
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'public, max-age=300',
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
  const bytes = new Uint8Array(sig);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

async function buildAuthHeader(env, method, path, body) {
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = genNonce(32);
  // 5 行待签名串：每行末尾必须带 \n（包括最后一行 body 后面的）
  const stringToSign = `${method}\n${path}\n${ts}\n${nonce}\n${body}\n`;
  const signature = await hmacSha256Base64(env.JLC_SECRET_KEY, stringToSign);
  return `JOP appid="${env.JLC_APP_ID}",accesskey="${env.JLC_ACCESS_KEY}",timestamp="${ts}",nonce="${nonce}",signature="${signature}"`;
}

// ==================== JLC API 调用 ====================

export async function jlcQuery(codes, env) {
  if (!env.JLC_ACCESS_KEY || !env.JLC_SECRET_KEY || !env.JLC_APP_ID) {
    throw new Error('立创签名密钥未配置（需在 EdgeOne 项目环境变量配置 JLC_ACCESS_KEY/JLC_SECRET_KEY/JLC_APP_ID）');
  }
  const bodyObj = { componentCodeList: codes };
  // 关键：签名用的 body 必须和发送的 body 一字节不差，禁止二次序列化
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

export async function jlcSearch(queryString, pageNum, env) {
  if (!env.JLC_ACCESS_KEY || !env.JLC_SECRET_KEY || !env.JLC_APP_ID) {
    throw new Error('立创签名密钥未配置（需在 EdgeOne 项目环境变量配置 JLC_ACCESS_KEY/JLC_SECRET_KEY/JLC_APP_ID）');
  }
  const bodyObj = {
    queryString: String(queryString || '').trim(),
    pageNum: pageNum || 1,
    pageSize: SEARCH_PAGE_SIZE,
  };
  const body = JSON.stringify(bodyObj);
  const auth = await buildAuthHeader(env, 'POST', JLC_SEARCH_PATH, body);

  const resp = await fetch(JLC_BASE + JLC_SEARCH_PATH, {
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
    throw new Error(`立创搜索 HTTP ${resp.status}: ${text.slice(0, 200)}`);
  }
  const json = await resp.json();
  if (!json.success) {
    throw new Error(`立创搜索业务失败: code=${json.code} message=${json.message} errorCode=${json.errorCode}`);
  }
  const root = json.data || {};
  return {
    items: root.list || [],
    pageNum: root.pageNum || pageNum || 1,
    pageSize: root.pageSize || SEARCH_PAGE_SIZE,
    totalPages: root.pages || 0,
    totalRows: root.total || 0,
    hasNextPage: !!root.hasNextPage,
  };
}

// ==================== 字段映射 JLC → 兼容输出（保持与 v1.0.x Worker 完全一致） ====================

export function jlcParamToSpec(paramTextAll) {
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

export function jlcParamToMap(paramTextAll) {
  const out = {};
  if (!paramTextAll) return out;
  paramTextAll.split(/[,，]/).forEach((seg) => {
    const m = seg.trim().match(/^([^:：]+)\s*[:：]\s*(.+)$/);
    if (m) out[m[1].trim()] = m[2].trim();
  });
  return out;
}

export function jlcToCompatData(query, jlcItem) {
  if (!jlcItem) {
    return { query, hit: false, error: '立创未找到该编号' };
  }
  const paramMap = jlcParamToMap(jlcItem.paramTextAll || '');

  // 从 paramLinkedMap 提取关键电气参数，供前端精准组装描述（替代 autoDescribe 硬编码）
  const extract = (keys) => {
    for (const k of keys) {
      if (paramMap[k]) return paramMap[k];
    }
    return '';
  };

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
    paramLinkedMap: paramMap,
    specification: jlcParamToSpec(jlcItem.paramTextAll || ''),
    // 提取字段：前端优先用这些组装描述，比 autoDescribe 硬编码更准确
    _extracted: {
      capacitance: extract(['容值', '电容量', 'Capacitance']),
      resistance: extract(['阻值', '电阻值', 'Resistance']),
      tolerance: extract(['精度', '容差', '误差', 'Tolerance', '容许差']),
      voltage: extract(['额定电压', '耐压', 'Voltage', '工作电压']),
      dielectric: extract(['介质材料', '材质', '温度系数', 'Dielectric']),
      current: extract(['额定电流', '电流', 'Current']),
      inductance: extract(['电感值', '感值', '电感量', 'Inductance']),
      frequency: extract(['频率', '频点', 'Frequency']),
      power: extract(['功率', 'Power']),
    },
    stockNum: jlcItem.stockNum || 0,
    encapsulationNumber: jlcItem.encapsulationNumber || 0,
    priceLadder: jlcItem.smtComponentPriceInfoVOList || [],
  };
}

// ==================== 配额计数（KV 软计数） ====================

export async function bumpQuota(env, count) {
  if (!env.LCSC_CACHE) return;
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

export async function getQuota(env) {
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

export function normCode(c) {
  c = String(c || '').trim().toUpperCase();
  return /^C\d{2,}$/.test(c) ? c : '';
}

// EdgeOne Functions 没有 ctx.waitUntil，统一用 await（KV 写入慢一点点，但稳）
// 如果未来发现 EdgeOne 有 waitUntil，改成可选 await 即可
async function maybeWaitUntil(promise) {
  try { await promise; } catch (e) { /* swallow */ }
}

export async function handleSingle(rawCode, env) {
  const code = normCode(rawCode);
  if (!code) {
    return { ok: false, error: '参数格式错误，需要 C 开头的立创编号（如 C431542）' };
  }
  const result = await handleBatchInternal([code], env);
  const r = result.results[0];
  if (!r) return { ok: false, error: '未知错误' };
  return r;
}

export async function handleBatch(rawCodes, env) {
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
  const queryList = (rawCodes || []).slice(0, BATCH_HARD_CAP);
  return handleBatchInternal(queryList, env);
}

async function handleBatchInternal(queryList, env) {
  const normalized = queryList.map((q) => ({ query: q, code: normCode(q) }));

  const validCodes = [];
  const seen = new Set();
  for (const it of normalized) {
    if (it.code && !seen.has(it.code)) {
      seen.add(it.code);
      validCodes.push(it.code);
    }
  }

  // 查 KV 缓存
  const cacheMap = {};
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

  // 未命中走 API
  const missing = validCodes.filter((c) => !cacheMap[c]);
  let apiCalls = 0;
  let apiError = null;
  if (missing.length > 0) {
    try {
      const apiData = await jlcQuery(missing, env);
      apiCalls = 1;
      const apiMap = {};
      for (const item of apiData) {
        if (item && item.componentCode) {
          apiMap[String(item.componentCode).toUpperCase()] = item;
        }
      }
      const writes = [];
      for (const code of missing) {
        const item = apiMap[code];
        const data = jlcToCompatData(code, item);
        cacheMap[code] = data;
        if (env && env.LCSC_CACHE) {
          if (data.hit) {
            writes.push(env.LCSC_CACHE.put(`jlc:${code}`, JSON.stringify(data), { expirationTtl: CACHE_TTL }));
          } else {
            writes.push(env.LCSC_CACHE.put(`jlc:${code}`, JSON.stringify(data), { expirationTtl: 86400 }));
          }
        }
      }
      if (writes.length > 0) {
        await maybeWaitUntil(Promise.all(writes));
      }
      await maybeWaitUntil(bumpQuota(env, 1));
    } catch (e) {
      apiError = String(e.message || e);
    }
  }

  const results = normalized.map((it) => {
    if (!it.code) {
      return { ok: false, error: '编号格式错误', query: it.query };
    }
    const data = cacheMap[it.code];
    if (data) {
      return { ok: true, cached: missing.indexOf(it.code) < 0, data };
    }
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

// ==================== 搜索：关键字反查 ====================

export async function handleSearch(rawQuery, rawPkg, rawPage, env) {
  const q = String(rawQuery || '').trim();
  if (!q) {
    return { ok: false, error: '参数 q 不能为空' };
  }
  if (q.length > 64) {
    return { ok: false, error: '参数 q 太长，最大 64 字符' };
  }
  const pkg = String(rawPkg || '').trim().toUpperCase();
  let pageNum = parseInt(rawPage, 10);
  if (!pageNum || pageNum < 1) pageNum = 1;
  if (pageNum > 20) pageNum = 20;

  const cacheKey = `search:${q.toLowerCase()}:p${pageNum}`;
  let cached = null;
  let cacheHit = false;
  if (env && env.LCSC_CACHE) {
    cached = await env.LCSC_CACHE.get(cacheKey, { type: 'json' });
    if (cached) cacheHit = true;
  }

  let raw;
  if (cached) {
    raw = cached;
  } else {
    try {
      raw = await jlcSearch(q, pageNum, env);
    } catch (e) {
      return { ok: false, error: String(e.message || e), query: q };
    }
    if (env && env.LCSC_CACHE) {
      await maybeWaitUntil(env.LCSC_CACHE.put(cacheKey, JSON.stringify(raw), { expirationTtl: SEARCH_CACHE_TTL }));
    }
    await maybeWaitUntil(bumpQuota(env, 1));
  }

  let items = (raw.items || []).map((it) => ({
    componentCode: it.componentCode || '',
    componentModel: it.componentModel || '',
    componentSpecification: it.componentSpecification || '',
    componentBrand: it.componentBrand || '',
    componentName: it.componentName || '',
  }));

  if (pkg) {
    const filtered = items.filter((it) => {
      const spec = String(it.componentSpecification || '').toUpperCase();
      return spec.indexOf(pkg) >= 0;
    });
    if (filtered.length > 0) {
      items = filtered;
    }
  }

  return {
    ok: true,
    cached: cacheHit,
    query: q,
    pkg: pkg || null,
    pageNum: raw.pageNum,
    pageSize: raw.pageSize,
    totalPages: raw.totalPages,
    totalRows: raw.totalRows,
    hasNextPage: !!raw.hasNextPage,
    items,
  };
}

// ==================== 工具：JSON 响应 + OPTIONS 预检 ====================

export function jsonResp(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: JSON_HEADERS,
  });
}

export function preflightResp() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
