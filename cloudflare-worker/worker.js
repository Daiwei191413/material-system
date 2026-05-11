/**
 * 立创商城代理 Worker - BOM 整理神器配套服务
 * 
 * 用途：绕过浏览器 CORS，为 material-system 前端提供立创搜索页数据。
 * 
 * 使用：GET /?k=C431542
 *       GET /batch?codes=C431542,C1523,C25744   (逗号分隔，最多 30 个)
 *       GET /health
 * 
 * 版本：v1.0.6（参数描述格式对齐 A BOM：字段：值, 字段：值 逗号分隔）
 * 部署：wrangler deploy
 * 作者：开发助理 (hdv_dev_bot) for 戴纬哥 · 技象科技
 */

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 允许跨域的域名白名单
const ALLOWED_ORIGINS = [
  'https://daiwei191413.github.io',
  'http://localhost:8765',
  'http://127.0.0.1:8765',
  'http://localhost:3000',
  'http://127.0.0.1:3000',
];

const CORS_HEADERS_FACTORY = (origin) => {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
};

// ==================== 抓取 + 解析 ====================

async function fetchLcsc(code) {
  const url = `https://so.szlcsc.com/global.html?k=${encodeURIComponent(code)}`;
  const resp = await fetch(url, {
    headers: {
      'User-Agent': UA,
      'Accept-Language': 'zh-CN,zh;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    },
    // Cloudflare Workers 默认遵循重定向
    cf: { cacheTtl: 900, cacheEverything: true },  // 边缘缓存 15 分钟
  });
  if (!resp.ok) throw new Error(`立创返回 HTTP ${resp.status}`);
  return await resp.text();
}

function extractFirstBlock(html, query) {
  // 定位第一个 productCode 出现位置
  const target = query.toUpperCase().startsWith('C') ? query.toUpperCase() : query;
  let m = new RegExp(`"productCode"\\s*:\\s*"${target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"`).exec(html);
  if (!m) m = /"productCode"\s*:\s*"C\d+"/.exec(html);
  if (!m) return '';
  const start = m.index;
  // 截取到下一个 productCode 之间
  const rest = html.slice(m.index + m[0].length);
  const nextM = /"productCode"\s*:\s*"C\d+"/.exec(rest);
  const end = nextM ? m.index + m[0].length + nextM.index : Math.min(html.length, m.index + 15000);
  return html.slice(Math.max(0, start - 200), end);
}

function findScalar(block, key) {
  const m = new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`).exec(block);
  return m ? m[1] : null;
}

function findParamMap(block) {
  const m = /"paramLinkedMap"\s*:\s*(\{[^{}]*\})/.exec(block);
  if (!m) return {};
  try {
    return JSON.parse(m[1]);
  } catch (e) {
    return {};
  }
}

function parseLcsc(html, query) {
  const block = extractFirstBlock(html, query);
  if (!block) {
    return { query, hit: false, error: '未找到匹配商品' };
  }

  const out = {
    query,
    hit: true,
    productCode: findScalar(block, 'productCode'),
    productModel: findScalar(block, 'productModel'),
    productName: findScalar(block, 'productName'),
    productType: findScalar(block, 'productType'),
    brand: findScalar(block, 'productGradePlateName'),
    package: findScalar(block, 'encapsulationModel'),
    unit: findScalar(block, 'productUnit'),
    productId: findScalar(block, 'productId'),
    remark: findScalar(block, 'remark'),
    paramLinkedMap: findParamMap(block),
  };

  // 组装"参数描述"：paramLinkedMap 按常见优先级排序后拼接
  // 格式对齐 A BOM：「字段名：值, 字段名：值」全角冒号 + ", " 逗号分隔
  // 示例："连接器类型：板端, 射频系列：IPEX, 接口类型：内针"
  const priority = ['容值', '阻值', '电感量', '精度', '额定电压', '电压', '温度系数',
    '功率', '电流', '正向压降(Vf)', '反向耐压', '电阻类型',
    '连接器类型', '插针结构', '触点数量', '间距', '公母',
    '安装方式', '引脚样式', '电路结构'];
  const pm = out.paramLinkedMap || {};
  const parts = [];
  const used = new Set();
  for (const k of priority) {
    if (pm[k]) { parts.push(`${k}：${pm[k]}`); used.add(k); }
  }
  for (const [k, v] of Object.entries(pm)) {
    if (!used.has(k) && v) parts.push(`${k}：${v}`);
  }
  if (parts.length) {
    out.specification = parts.join(', ');
  } else if (out.remark) {
    out.specification = out.remark;
  } else {
    out.specification = '';
  }

  return out;
}

// ==================== 路由 ====================

async function handleSingle(code, env) {
  code = (code || '').trim();
  if (!/^[Cc]\d{2,}$/.test(code)) {
    return { ok: false, error: '参数格式错误，需要 C 开头的立创编号（如 C431542）' };
  }
  code = code.toUpperCase();

  // KV 缓存（可选）—— 如果绑定了 LCSC_CACHE
  if (env && env.LCSC_CACHE) {
    const cached = await env.LCSC_CACHE.get(`lcsc:${code}`, { type: 'json' });
    if (cached) {
      return { ok: true, cached: true, data: cached };
    }
  }

  try {
    const html = await fetchLcsc(code);
    const data = parseLcsc(html, code);
    if (env && env.LCSC_CACHE && data.hit) {
      // 缓存 7 天
      await env.LCSC_CACHE.put(`lcsc:${code}`, JSON.stringify(data), { expirationTtl: 7 * 86400 });
    }
    return { ok: true, cached: false, data };
  } catch (e) {
    return { ok: false, error: String(e.message || e) };
  }
}

async function handleBatch(codes, env) {
  codes = codes.slice(0, 30);  // 硬上限 30
  // 并发 5 路
  const results = [];
  const concurrency = 5;
  for (let i = 0; i < codes.length; i += concurrency) {
    const batch = codes.slice(i, i + concurrency);
    const settled = await Promise.all(batch.map(c => handleSingle(c, env)));
    results.push(...settled);
  }
  return { ok: true, count: results.length, results };
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
        status: 405, headers: { ...cors, 'Content-Type': 'application/json' },
      });
    }

    const path = url.pathname;
    let body;

    if (path === '/health' || path === '/') {
      if (path === '/' && !url.searchParams.has('k')) {
        body = {
          ok: true,
          service: 'lcsc-proxy',
          version: '1.0.0',
          endpoints: {
            '/?k=C431542': '查询单个立创编号',
            '/batch?codes=C1,C2,C3': '批量查询（最多30个）',
            '/health': '健康检查',
          },
        };
      } else if (path === '/health') {
        body = { ok: true, service: 'lcsc-proxy', ts: Date.now() };
      } else {
        // / 带 ?k=
        body = await handleSingle(url.searchParams.get('k'), env);
      }
    } else if (path === '/batch') {
      const codes = (url.searchParams.get('codes') || '')
        .split(',').map(s => s.trim()).filter(Boolean);
      body = await handleBatch(codes, env);
    } else {
      body = { ok: false, error: 'Not Found' };
      return new Response(JSON.stringify(body), {
        status: 404, headers: { ...cors, 'Content-Type': 'application/json' },
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
