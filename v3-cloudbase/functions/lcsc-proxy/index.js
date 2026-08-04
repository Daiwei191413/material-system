const crypto = require('crypto');
const http = require('http');

const PORT = Number(process.env.PORT || 9000);
const VERSION = 'V1.0.17';
const JLC_BASE = 'https://open-api.jlc.com';
const JLC_QUERY_PATH = '/smtOpenApi/smtComponent/selectComponentInfoByCodes';
const JLC_SEARCH_PATH = '/smtOpenApi/order/selectComponentInfo';
const SEARCH_PAGE_SIZE = 10;
const BATCH_HARD_CAP = 30;
const QUERY_TIMEOUT_MS = 12000;
const SEARCH_CACHE_TTL = 60 * 60 * 1000;
const COMPONENT_CACHE_TTL = 7 * 24 * 60 * 60 * 1000;

const searchCache = new Map();
const componentCache = new Map();

function json(res, status, body) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(body));
}

function credentialsConfigured() {
  return Boolean(process.env.JLC_APP_ID && process.env.JLC_ACCESS_KEY && process.env.JLC_SECRET_KEY);
}

function buildAuthHeader(method, path, body) {
  if (!credentialsConfigured()) throw new Error('立创开放平台凭证未配置');
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString('hex');
  const stringToSign = `${method}\n${path}\n${timestamp}\n${nonce}\n${body}\n`;
  const signature = crypto
    .createHmac('sha256', process.env.JLC_SECRET_KEY)
    .update(stringToSign, 'utf8')
    .digest('base64');
  return `JOP appid="${process.env.JLC_APP_ID}",accesskey="${process.env.JLC_ACCESS_KEY}",timestamp="${timestamp}",nonce="${nonce}",signature="${signature}"`;
}

async function postJlc(path, bodyObject) {
  const body = JSON.stringify(bodyObject);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), QUERY_TIMEOUT_MS);
  try {
    const response = await fetch(JLC_BASE + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/json',
        Authorization: buildAuthHeader('POST', path, body),
      },
      body,
      signal: controller.signal,
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (_err) {
      throw new Error(`立创接口返回格式异常（HTTP ${response.status}）`);
    }
    if (!response.ok) throw new Error(`立创接口 HTTP ${response.status}：${data.message || '请求失败'}`);
    if (!data.success) throw new Error(`立创接口业务失败：${data.message || data.errorCode || data.code || '未知错误'}`);
    return data.data;
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('立创接口连接超时');
    throw err;
  } finally {
    clearTimeout(timeout);
  }
}

function cacheGet(cache, key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.value;
}

function cacheSet(cache, key, value, ttl) {
  cache.set(key, { value, expiresAt: Date.now() + ttl });
}

function normCode(value) {
  const code = String(value || '').trim().toUpperCase();
  return /^C\d{2,}$/.test(code) ? code : '';
}

function paramMap(paramText) {
  const out = {};
  String(paramText || '').split(/[,，]/).forEach((segment) => {
    const match = segment.trim().match(/^([^:：]+)\s*[:：]\s*(.+)$/);
    if (match) out[match[1].trim()] = match[2].trim();
  });
  return out;
}

function paramText(paramTextAll) {
  return String(paramTextAll || '')
    .split(/[,，]/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => {
      const match = segment.match(/^([^:：]+)\s*[:：]\s*(.+)$/);
      return match ? `${match[1].trim()}：${match[2].trim()}` : segment;
    })
    .join(', ');
}

function toCompatData(query, item) {
  if (!item) return { query, hit: false, error: '立创未找到该编号' };
  const params = paramMap(item.paramTextAll);
  const extract = (keys) => keys.find((key) => params[key]) ? params[keys.find((key) => params[key])] : '';
  return {
    query,
    hit: true,
    productCode: item.componentCode || '',
    productModel: item.componentModel || '',
    productName: item.componentName || '',
    productType: item.componentType || '',
    brand: item.componentBrand || '',
    package: item.componentSpecification || '',
    unit: 'PCS',
    productId: String(item.componentId || ''),
    remark: item.componentName || '',
    paramLinkedMap: params,
    specification: paramText(item.paramTextAll),
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
    stockNum: item.stockNum || 0,
    encapsulationNumber: item.encapsulationNumber || 0,
    priceLadder: item.smtComponentPriceInfoVOList || [],
  };
}

async function handleBatch(rawCodes) {
  const queryList = rawCodes.slice(0, BATCH_HARD_CAP);
  const normalized = queryList.map((query) => ({ query, code: normCode(query) }));
  const missing = [];
  const dataByCode = {};

  normalized.forEach(({ code }) => {
    if (!code || dataByCode[code]) return;
    const cached = cacheGet(componentCache, code);
    if (cached) dataByCode[code] = cached;
    else missing.push(code);
  });

  let apiError = null;
  if (missing.length) {
    try {
      const rows = await postJlc(JLC_QUERY_PATH, { componentCodeList: [...new Set(missing)] });
      const apiMap = {};
      (rows || []).forEach((item) => {
        if (item && item.componentCode) apiMap[String(item.componentCode).toUpperCase()] = item;
      });
      [...new Set(missing)].forEach((code) => {
        const data = toCompatData(code, apiMap[code]);
        dataByCode[code] = data;
        cacheSet(componentCache, code, data, data.hit ? COMPONENT_CACHE_TTL : 24 * 60 * 60 * 1000);
      });
    } catch (err) {
      apiError = err.message || String(err);
    }
  }

  const results = normalized.map(({ query, code }) => {
    if (!code) return { ok: false, query, error: '编号格式错误' };
    if (!dataByCode[code]) return { ok: false, query, error: apiError || '查询失败' };
    return { ok: true, cached: missing.indexOf(code) < 0, data: dataByCode[code] };
  });

  return {
    ok: true,
    count: results.length,
    cache_hits: normalized.filter(({ code }) => code && missing.indexOf(code) < 0).length,
    api_calls: missing.length && !apiError ? 1 : 0,
    api_error: apiError,
    results,
  };
}

async function handleSingle(rawCode) {
  const code = normCode(rawCode);
  if (!code) return { ok: false, error: '参数格式错误，需要 C 开头的立创编号' };
  const batch = await handleBatch([code]);
  return batch.results[0] || { ok: false, error: '查询失败' };
}

async function handleSearch(rawQuery, rawPackage, rawPage) {
  const query = String(rawQuery || '').trim();
  if (!query) return { ok: false, error: '参数 q 不能为空' };
  if (query.length > 64) return { ok: false, error: '参数 q 太长，最大 64 字符' };

  const pkg = String(rawPackage || '').trim().toUpperCase();
  const pageNum = Math.max(1, Math.min(20, Number.parseInt(rawPage, 10) || 1));
  const cacheKey = `${query.toLowerCase()}:p${pageNum}`;
  let raw = cacheGet(searchCache, cacheKey);
  const cached = Boolean(raw);
  if (!raw) {
    const root = await postJlc(JLC_SEARCH_PATH, { queryString: query, pageNum, pageSize: SEARCH_PAGE_SIZE });
    raw = {
      items: root?.list || [],
      pageNum: root?.pageNum || pageNum,
      pageSize: root?.pageSize || SEARCH_PAGE_SIZE,
      totalPages: root?.pages || 0,
      totalRows: root?.total || 0,
      hasNextPage: Boolean(root?.hasNextPage),
    };
    cacheSet(searchCache, cacheKey, raw, SEARCH_CACHE_TTL);
  }

  let items = raw.items.map((item) => ({
    componentCode: item.componentCode || '',
    componentModel: item.componentModel || '',
    componentSpecification: item.componentSpecification || '',
    componentBrand: item.componentBrand || '',
    componentName: item.componentName || '',
  }));
  if (pkg) {
    const filtered = items.filter((item) => String(item.componentSpecification || '').toUpperCase().includes(pkg));
    if (filtered.length) items = filtered;
  }

  return {
    ok: true,
    cached,
    query,
    pkg: pkg || null,
    pageNum: raw.pageNum,
    pageSize: raw.pageSize,
    totalPages: raw.totalPages,
    totalRows: raw.totalRows,
    hasNextPage: raw.hasNextPage,
    items,
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    // CloudBase's HTTP gateway owns CORS headers for the service domain.
    res.writeHead(204);
    return res.end();
  }
  if (req.method !== 'GET') return json(res, 405, { ok: false, error: '仅支持 GET 请求' });

  const requestUrl = new URL(req.url, 'http://localhost');
  const path = requestUrl.pathname.replace(/^\/lcsc/, '') || '/';

  try {
    if (path === '/health') {
      return json(res, 200, {
        ok: true,
        service: 'techphant-bom-v3-lcsc-proxy',
        version: VERSION,
        credentialsConfigured: credentialsConfigured(),
      });
    }
    if (path === '/search') {
      return json(res, 200, await handleSearch(requestUrl.searchParams.get('q'), requestUrl.searchParams.get('pkg'), requestUrl.searchParams.get('page')));
    }
    if (path === '/batch') {
      const codes = String(requestUrl.searchParams.get('codes') || '').split(',').filter(Boolean);
      return json(res, 200, await handleBatch(codes));
    }
    if (path === '/') {
      return json(res, 200, await handleSingle(requestUrl.searchParams.get('k')));
    }
    return json(res, 404, { ok: false, error: `接口不存在：GET ${requestUrl.pathname}` });
  } catch (err) {
    json(res, 502, { ok: false, error: err.message || String(err) });
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Techphant BOM V3 LCSC proxy listening on ${PORT}`);
});
