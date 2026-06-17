// ============================================================
// 技象科技 BOM 整理神器 V3.0.5 - 团队版 API
// Cloudflare Worker + D1 数据库 + KV 缓存
// ============================================================

// ----- 配置 -----
const CONFIG = {
  APP_NAME: '技象科技研发BOM整理神器',
  VERSION: 'V3.0.5',
  JWT_EXPIRE_DAYS: 7,
  MAX_LOGIN_ATTEMPTS: 5,
  LOGIN_LOCKOUT_MINUTES: 15,
  LCSC_API_URL: 'https://open-api.jlc.com/smtOpenApi/smtComponent/selectComponentInfoByCodes',
  LCSC_SEARCH_URL: 'https://so.szlcsc.com/global.html',
};

// ----- CORS 头 -----
const ALLOWED_ORIGINS = [
  'https://techphant-bom-tools-v3.pages.dev',
  'https://techphant-bom.pages.dev',
  'http://localhost:5173',
  'http://localhost:3000',
];

function corsHeaders(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
  };
}

// ----- Base64URL 工具 -----
function base64urlEncode(str) {
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function base64urlDecode(str) {
  // 补全 padding
  const padding = 4 - (str.length % 4);
  if (padding !== 4) str += '='.repeat(padding);
  return atob(str.replace(/-/g, '+').replace(/_/g, '/'));
}

// ----- JWT 工具 -----
async function signJWT(payload, secret) {
  const encoder = new TextEncoder();
  const header = base64urlEncode(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = base64urlEncode(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + CONFIG.JWT_EXPIRE_DAYS * 86400 }));
  const data = encoder.encode(header + '.' + body);
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const signature = await crypto.subtle.sign('HMAC', key, data);
  const sig = base64urlEncode(String.fromCharCode(...new Uint8Array(signature)));
  return header + '.' + body + '.' + sig;
}

async function verifyJWT(token, secret) {
  try {
    const [header, body, signature] = token.split('.');
    const encoder = new TextEncoder();
    const data = encoder.encode(header + '.' + body);
    const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const sigBytes = Uint8Array.from(base64urlDecode(signature), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify('HMAC', key, sigBytes, data);
    if (!valid) return null;
    const payload = JSON.parse(base64urlDecode(body));
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

// ----- bcrypt 简化版（Worker 环境用 Web Crypto 模拟）-----
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 10000, hash: 'SHA-256' }, key, 256);
  return btoa(String.fromCharCode(...salt)) + '.' + btoa(String.fromCharCode(...new Uint8Array(hash)));
}

async function verifyPassword(password, stored) {
  const [saltB64, hashB64] = stored.split('.');
  const salt = Uint8Array.from(atob(saltB64), c => c.charCodeAt(0));
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const hash = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt, iterations: 10000, hash: 'SHA-256' }, key, 256);
  const computed = btoa(String.fromCharCode(...new Uint8Array(hash)));
  return computed === hashB64;
}

// ----- 立创 API 签名（复用 V2 逻辑）-----
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
  const nonce = Array.from(crypto.getRandomValues(new Uint8Array(16))).map(b => b.toString(16).padStart(2, '0')).join('');
  const stringToSign = `${method}\n${path}\n${ts}\n${nonce}\n${body}\n`;
  const signature = await hmacSha256Base64(env.JLC_SECRET_KEY, stringToSign);
  return `JOP appid="${env.JLC_APP_ID}",accesskey="${env.JLC_ACCESS_KEY}",timestamp="${ts}",nonce="${nonce}",signature="${signature}"`;
}

// ----- D1 查询封装 -----
async function dbQuery(db, sql, params = []) {
  const result = await db.prepare(sql).bind(...params).all();
  return result.results || [];
}

async function dbRun(db, sql, params = []) {
  return await db.prepare(sql).bind(...params).run();
}

function cleanText(value) {
  return (value ?? '').toString().trim();
}

function normText(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, ' ');
}

function normLcsc(value) {
  const m = cleanText(value).toUpperCase().match(/C\d{3,}/);
  return m ? m[0] : cleanText(value).toUpperCase();
}

function makeMaterialSyncKey(lib, item) {
  const lcsc = normLcsc(item.lcsc_code || item.componentCode || item['立创编号']);
  const materialCode = cleanText(item.material_code || item['物料编码']);
  const model = cleanText(item.model || item['型号']);
  const pkg = cleanText(item.package || item['封装']);
  const brand = cleanText(item.brand || item['品牌']);
  const name = cleanText(item.name || item['物料名称']);
  const spec = cleanText(item.specification || item['参数描述']);

  if (lib === 'lcsc') return lcsc ? `lcsc:${lcsc}` : '';
  if (materialCode) return `mat:${normText(materialCode)}`;
  if (lcsc) return `lcsc:${lcsc}`;
  if (model || pkg || brand) return `mpb:${normText(model)}|${normText(pkg)}|${normText(brand)}`;
  if (name || spec) return `desc:${normText(name)}|${normText(spec)}`;
  return '';
}

function materialIdentityError(lib) {
  return lib === 'lcsc'
    ? '立创库需填写立创编号'
    : '标准库需至少填写物料编码、立创编号、型号/封装/品牌或物料名称/参数描述';
}

function materialParams(item, userId, lib, syncKey, includeCreators) {
  const params = [
    lib, syncKey,
    normLcsc(item.lcsc_code || item.componentCode || item['立创编号']) || '',
    item.name || item['物料名称'] || '',
    item.model || item['型号'] || '',
    item.specification || item['参数描述'] || '',
    item.brand || item['品牌'] || '',
    item.material_code || item['物料编码'] || '',
    item.package || item['封装'] || '',
    item.category || item['分类'] || '',
    item.manufacturer || '',
    item.unit || item['单位'] || 'PCS',
    item.price || '',
    item.stock || '',
    item.datasheet || '',
    item.image_url || '',
    item.remark || item['备注'] || '',
  ];
  return includeCreators ? [...params, userId, userId] : params;
}

// ----- 响应封装 -----
function jsonResponse(data, status = 200, origin) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) },
  });
}

function errorResponse(message, status = 400, origin) {
  return jsonResponse({ success: false, error: message }, status, origin);
}

// ----- 主处理 -----
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const clientIP = request.headers.get('CF-Connecting-IP') || 'unknown';

    // OPTIONS 预检
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // 只处理 /v3/ 路径
    if (!url.pathname.startsWith('/v3/')) {
      return errorResponse('Not found', 404, origin);
    }

    const path = url.pathname.replace('/v3', '');
    const JWT_SECRET = env.JWT_SECRET || 'default-secret-change-me';

    try {
      // ===== 认证相关 =====
      if (path === '/auth/login') {
        const { username, password } = await request.json();
        if (!username || !password) {
          return errorResponse('用户名和密码必填', 400, origin);
        }

        // 检查登录锁定
        const attempts = await dbQuery(env.BOM_DB,
          `SELECT COUNT(*) as count FROM login_attempts 
           WHERE username = ? AND ip = ? AND success = 0 
           AND created_at > datetime('now', '-${CONFIG.LOGIN_LOCKOUT_MINUTES} minutes')`,
          [username, clientIP]
        );
        if (attempts[0]?.count >= CONFIG.MAX_LOGIN_ATTEMPTS) {
          return errorResponse(`登录失败次数过多，请${CONFIG.LOGIN_LOCKOUT_MINUTES}分钟后再试`, 429, origin);
        }

        // 查询用户
        const users = await dbQuery(env.BOM_DB, 'SELECT * FROM users WHERE username = ? OR phone = ?', [username, username]);
        const user = users[0];

        if (!user) {
          await dbRun(env.BOM_DB, 'INSERT INTO login_attempts (username, ip, success) VALUES (?, ?, 0)', [username, clientIP]);
          return errorResponse('用户名或密码错误', 401, origin);
        }

        // 验证密码
        const valid = await verifyPassword(password, user.password_hash);
        if (!valid) {
          await dbRun(env.BOM_DB, 'INSERT INTO login_attempts (username, ip, success) VALUES (?, ?, 0)', [username, clientIP]);
          return errorResponse('用户名或密码错误', 401, origin);
        }

        // 记录成功登录
        await dbRun(env.BOM_DB, 'INSERT INTO login_attempts (username, ip, success) VALUES (?, ?, 1)', [username, clientIP]);
        await dbRun(env.BOM_DB, 'INSERT INTO audit_log (user_id, action, ip, user_agent) VALUES (?, ?, ?, ?)',
          [user.id, 'login', clientIP, request.headers.get('User-Agent') || '']);

        // 签发 Token
        const token = await signJWT({ userId: user.id, username: user.username, role: user.role }, JWT_SECRET);

        return jsonResponse({
          success: true,
          token,
          user: {
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            role: user.role,
            mustChangePassword: user.must_change_password === 1,
          },
        }, 200, origin);
      }

      if (path === '/auth/me') {
        const auth = request.headers.get('Authorization') || '';
        const token = auth.replace('Bearer ', '');
        const payload = await verifyJWT(token, JWT_SECRET);
        if (!payload) return errorResponse('未登录或登录已过期', 401, origin);

        const users = await dbQuery(env.BOM_DB, 'SELECT id, username, display_name, role, must_change_password FROM users WHERE id = ?', [payload.userId]);
        const user = users[0];
        if (!user) return errorResponse('用户不存在', 401, origin);

        return jsonResponse({
          success: true,
          user: {
            id: user.id,
            username: user.username,
            displayName: user.display_name,
            role: user.role,
            mustChangePassword: user.must_change_password === 1,
          },
        }, 200, origin);
      }

      // 修改密码
      if (path === '/auth/change-password') {
        const auth = request.headers.get('Authorization') || '';
        const token = auth.replace('Bearer ', '');
        const payload = await verifyJWT(token, JWT_SECRET);
        if (!payload) return errorResponse('未登录或登录已过期', 401, origin);

        const { oldPassword, newPassword } = await request.json();
        if (!oldPassword || !newPassword) {
          return errorResponse('当前密码和新密码必填', 400, origin);
        }
        if (newPassword.length < 8) {
          return errorResponse('新密码至少8位', 400, origin);
        }

        // 查询用户
        const users = await dbQuery(env.BOM_DB, 'SELECT * FROM users WHERE id = ?', [payload.userId]);
        const user = users[0];
        if (!user) return errorResponse('用户不存在', 404, origin);

        // 验证旧密码
        const valid = await verifyPassword(oldPassword, user.password_hash);
        if (!valid) return errorResponse('当前密码错误', 401, origin);

        // 更新密码
        const newHash = await hashPassword(newPassword);
        await dbRun(env.BOM_DB, 'UPDATE users SET password_hash = ?, must_change_password = 0 WHERE id = ?', [newHash, payload.userId]);

        // 记录审计日志
        await dbRun(env.BOM_DB, 'INSERT INTO audit_log (user_id, action, ip, user_agent) VALUES (?, ?, ?, ?)',
          [payload.userId, 'change_password', clientIP, request.headers.get('User-Agent') || '']);

        return jsonResponse({ success: true, message: '密码修改成功' }, 200, origin);
      }

      // ===== 需要登录的接口 =====
      const auth = request.headers.get('Authorization') || '';
      const token = auth.replace('Bearer ', '');
      const payload = await verifyJWT(token, JWT_SECRET);
      if (!payload) return errorResponse('未登录或登录已过期', 401, origin);

      const userId = payload.userId;
      const userRole = payload.role;

      // ===== 物料库 CRUD（双库分离：lcsc / standard）=====
      // 所有 /library 接口都强制要求 lib 参数（'lcsc' | 'standard'）
      function requireLib(libRaw) {
        const lib = (libRaw || '').toLowerCase();
        if (lib !== 'lcsc' && lib !== 'standard') return null;
        return lib;
      }

      // ----- 物料库列表 / 新增 -----
      if (path === '/library') {
        const lib = requireLib(url.searchParams.get('lib'));
        if (!lib) return errorResponse('lib 参数必填且必须为 lcsc 或 standard', 400, origin);

        if (request.method === 'GET') {
          const search = url.searchParams.get('search') || '';
          const category = url.searchParams.get('category') || '';
          const page = parseInt(url.searchParams.get('page') || '1');
          const limit = parseInt(url.searchParams.get('limit') || '50');
          const offset = (page - 1) * limit;

          let sql = 'SELECT * FROM material_library WHERE lib_type = ?';
          let countSql = 'SELECT COUNT(*) as total FROM material_library WHERE lib_type = ?';
          const params = [lib];

          if (search) {
            sql += ' AND (sync_key LIKE ? OR lcsc_code LIKE ? OR name LIKE ? OR model LIKE ? OR specification LIKE ? OR material_code LIKE ?)';
            countSql += ' AND (sync_key LIKE ? OR lcsc_code LIKE ? OR name LIKE ? OR model LIKE ? OR specification LIKE ? OR material_code LIKE ?)';
            const like = `%${search}%`;
            params.push(like, like, like, like, like, like);
          }
          if (category) {
            sql += ' AND category = ?';
            countSql += ' AND category = ?';
            params.push(category);
          }

          sql += ' ORDER BY updated_at DESC LIMIT ? OFFSET ?';

          const [items, countResult] = await Promise.all([
            dbQuery(env.BOM_DB, sql, [...params, limit, offset]),
            dbQuery(env.BOM_DB, countSql, params),
          ]);

          return jsonResponse({
            success: true,
            lib,
            data: items,
            pagination: { page, limit, total: countResult[0]?.total || 0 },
          }, 200, origin);
        }

        if (request.method === 'POST') {
          if (userRole !== 'admin') return errorResponse('只有管理员可写入物料库', 403, origin);

          const data = await request.json();
          const syncKey = makeMaterialSyncKey(lib, data);
          if (!syncKey) return errorResponse(materialIdentityError(lib), 400, origin);
          data.lcsc_code = normLcsc(data.lcsc_code || data.componentCode || data['立创编号']) || '';
          data.sync_key = syncKey;

          const existing = await dbQuery(env.BOM_DB,
            'SELECT id FROM material_library WHERE lib_type = ? AND sync_key = ?', [lib, syncKey]);
          if (existing.length > 0) return errorResponse('该物料在此库已存在', 409, origin);

          await dbRun(env.BOM_DB,
            `INSERT INTO material_library
             (lib_type, sync_key, lcsc_code, name, model, specification, brand, material_code, package, category, manufacturer, unit, price, stock, datasheet, image_url, remark, source, created_by, updated_by)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [...materialParams(data, userId, lib, syncKey, false), data.source || 'manual', userId, userId]
          );

          await dbRun(env.BOM_DB,
            'INSERT INTO audit_log (user_id, action, target, lib_type, new_value, ip) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, 'create', syncKey, lib, JSON.stringify(data), clientIP]);

          return jsonResponse({ success: true, message: '创建成功' }, 201, origin);
        }
      }

      // ----- 单条物料操作 /library/<sync_key>?lib=xxx -----
      const materialMatch = path.match(/^\/library\/(.+)$/);
      if (materialMatch && !path.startsWith('/library/import') && !path.startsWith('/library/export')) {
        const code = decodeURIComponent(materialMatch[1]);
        const lib = requireLib(url.searchParams.get('lib'));
        if (!lib) return errorResponse('lib 参数必填且必须为 lcsc 或 standard', 400, origin);
        const fallbackKey = code.includes(':') ? code : makeMaterialSyncKey(lib, { lcsc_code: code, material_code: code });
        const lookupSql = 'SELECT * FROM material_library WHERE lib_type = ? AND (sync_key = ? OR sync_key = ? OR lcsc_code = ?)';
        const lookupParams = [lib, code, fallbackKey, code];

        if (request.method === 'GET') {
          const items = await dbQuery(env.BOM_DB, lookupSql, lookupParams);
          if (items.length === 0) return errorResponse('物料不存在', 404, origin);
          return jsonResponse({ success: true, data: items[0] }, 200, origin);
        }

        if (request.method === 'PUT') {
          if (userRole !== 'admin') return errorResponse('只有管理员可修改物料库', 403, origin);

          const data = await request.json();
          const old = await dbQuery(env.BOM_DB, lookupSql, lookupParams);
          if (old.length === 0) return errorResponse('物料不存在', 404, origin);

          const o = old[0];
          const merged = { ...o, ...data };
          const nextSyncKey = makeMaterialSyncKey(lib, merged);
          if (!nextSyncKey) return errorResponse(materialIdentityError(lib), 400, origin);
          await dbRun(env.BOM_DB,
            `UPDATE material_library SET
             sync_key = ?, lcsc_code = ?,
             name = ?, model = ?, specification = ?, brand = ?,
             material_code = ?, package = ?, category = ?, manufacturer = ?,
             unit = ?, price = ?, stock = ?, datasheet = ?, image_url = ?, remark = ?,
             updated_by = ?, updated_at = datetime('now')
             WHERE lib_type = ? AND sync_key = ?`,
            [nextSyncKey, normLcsc(merged.lcsc_code || merged.componentCode || merged['立创编号']) || '',
             data.name ?? o.name, data.model ?? o.model, data.specification ?? o.specification, data.brand ?? o.brand,
             data.material_code ?? o.material_code, data.package ?? o.package, data.category ?? o.category, data.manufacturer ?? o.manufacturer,
             data.unit ?? o.unit, data.price ?? o.price, data.stock ?? o.stock,
             data.datasheet ?? o.datasheet, data.image_url ?? o.image_url, data.remark ?? o.remark,
             userId, lib, o.sync_key]
          );

          await dbRun(env.BOM_DB,
            'INSERT INTO audit_log (user_id, action, target, lib_type, old_value, new_value, ip) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [userId, 'update', code, lib, JSON.stringify(o), JSON.stringify(data), clientIP]);

          return jsonResponse({ success: true, message: '更新成功' }, 200, origin);
        }

        if (request.method === 'DELETE') {
          if (userRole !== 'admin') return errorResponse('只有管理员可删除', 403, origin);

          const old = await dbQuery(env.BOM_DB, lookupSql, lookupParams);
          if (old.length === 0) return errorResponse('物料不存在', 404, origin);

          await dbRun(env.BOM_DB,
            'DELETE FROM material_library WHERE lib_type = ? AND sync_key = ?', [lib, old[0].sync_key]);
          await dbRun(env.BOM_DB,
            'INSERT INTO audit_log (user_id, action, target, lib_type, old_value, ip) VALUES (?, ?, ?, ?, ?, ?)',
            [userId, 'delete', code, lib, JSON.stringify(old[0]), clientIP]);

          return jsonResponse({ success: true, message: '删除成功' }, 200, origin);
        }
      }

      // ----- 批量导入 -----
      if (path === '/library/import') {
        if (userRole !== 'admin') return errorResponse('只有管理员可批量导入', 403, origin);

        const body = await request.json();
        const lib = requireLib(body.lib || url.searchParams.get('lib'));
        if (!lib) return errorResponse('lib 字段必填且必须为 lcsc 或 standard', 400, origin);

        const items = body.items;
        if (!Array.isArray(items) || items.length === 0) return errorResponse('items 为空', 400, origin);

        let success = 0, failed = 0, updated = 0, inserted = 0;
        for (const item of items) {
          const syncKey = makeMaterialSyncKey(lib, item);
          if (!syncKey) { failed++; continue; }
          item.sync_key = syncKey;
          item.lcsc_code = normLcsc(item.lcsc_code || item.componentCode || item['立创编号']) || '';
          try {
            const existing = await dbQuery(env.BOM_DB,
              'SELECT id FROM material_library WHERE lib_type = ? AND sync_key = ?', [lib, syncKey]);
            if (existing.length > 0) {
              await dbRun(env.BOM_DB,
                `UPDATE material_library SET
                 lcsc_code = ?, name = ?, model = ?, specification = ?, brand = ?,
                 material_code = ?, package = ?, category = ?, manufacturer = ?,
                 unit = ?, price = ?, stock = ?, datasheet = ?, image_url = ?, remark = ?,
                 source = 'import', updated_by = ?, updated_at = datetime('now')
                 WHERE lib_type = ? AND sync_key = ?`,
                [item.lcsc_code || '',
                 item.name || '', item.model || '', item.specification || '', item.brand || '',
                 item.material_code || '', item.package || '', item.category || '', item.manufacturer || '',
                 item.unit || 'PCS', item.price || '', item.stock || '',
                 item.datasheet || '', item.image_url || '', item.remark || '',
                 userId, lib, syncKey]
              );
              updated++;
            } else {
              await dbRun(env.BOM_DB,
                `INSERT INTO material_library
                 (lib_type, sync_key, lcsc_code, name, model, specification, brand, material_code, package, category, manufacturer, unit, price, stock, datasheet, image_url, remark, source, created_by, updated_by)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'import', ?, ?)`,
                [lib, syncKey, item.lcsc_code || '',
                 item.name || '', item.model || '', item.specification || '', item.brand || '',
                 item.material_code || '', item.package || '', item.category || '', item.manufacturer || '',
                 item.unit || 'PCS', item.price || '', item.stock || '',
                 item.datasheet || '', item.image_url || '', item.remark || '',
                 userId, userId]
              );
              inserted++;
            }
            success++;
          } catch (e) {
            failed++;
          }
        }

        await dbRun(env.BOM_DB,
          'INSERT INTO audit_log (user_id, action, target, lib_type, new_value, ip) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, 'import', `batch-${Date.now()}`, lib, JSON.stringify({ success, failed, inserted, updated, total: items.length }), clientIP]);

        return jsonResponse({ success: true, message: `导入完成：新增 ${inserted}，更新 ${updated}，失败 ${failed}`, stats: { success, failed, inserted, updated } }, 200, origin);
      }

      // ----- 导出（按库导出，或全部）-----
      if (path === '/library/export') {
        const libRaw = url.searchParams.get('lib');
        let items;
        if (libRaw) {
          const lib = requireLib(libRaw);
          if (!lib) return errorResponse('lib 必须为 lcsc 或 standard', 400, origin);
          items = await dbQuery(env.BOM_DB,
            'SELECT * FROM material_library WHERE lib_type = ? ORDER BY updated_at DESC', [lib]);
          await dbRun(env.BOM_DB,
            'INSERT INTO audit_log (user_id, action, target, lib_type, ip) VALUES (?, ?, ?, ?, ?)',
            [userId, 'export', `${lib}-${items.length}`, lib, clientIP]);
        } else {
          items = await dbQuery(env.BOM_DB,
            'SELECT * FROM material_library ORDER BY lib_type, updated_at DESC');
          await dbRun(env.BOM_DB,
            'INSERT INTO audit_log (user_id, action, target, ip) VALUES (?, ?, ?, ?)',
            [userId, 'export', `all-${items.length}`, clientIP]);
        }
        return jsonResponse({ success: true, data: items }, 200, origin);
      }

      // ----- 清空指定库（admin only）-----
      if (path === '/library/clear') {
        if (userRole !== 'admin') return errorResponse('只有管理员可清空', 403, origin);
        const body = await request.json().catch(() => ({}));
        const libRaw = body.lib || url.searchParams.get('lib');
        const lib = requireLib(libRaw);
        if (!lib) return errorResponse(`lib 字段必填且必须为 lcsc 或 standard（收到：${libRaw || '空'}）`, 400, origin);

        const before = await dbQuery(env.BOM_DB,
          'SELECT COUNT(*) as cnt FROM material_library WHERE lib_type = ?', [lib]);
        await dbRun(env.BOM_DB, 'DELETE FROM material_library WHERE lib_type = ?', [lib]);
        await dbRun(env.BOM_DB,
          'INSERT INTO audit_log (user_id, action, target, lib_type, old_value, ip) VALUES (?, ?, ?, ?, ?, ?)',
          [userId, 'delete', `clear-${lib}`, lib, JSON.stringify({ count: before[0]?.cnt || 0 }), clientIP]);

        return jsonResponse({ success: true, message: `已清空 ${lib} 库（${before[0]?.cnt || 0} 条）` }, 200, origin);
      }

      // ----- 审计日志（admin only）-----
      if (path === '/audit') {
        if (userRole !== 'admin') return errorResponse('无权限', 403, origin);

        const page = parseInt(url.searchParams.get('page') || '1');
        const limit = parseInt(url.searchParams.get('limit') || '50');
        const offset = (page - 1) * limit;

        const [logs, countResult] = await Promise.all([
          dbQuery(env.BOM_DB, 'SELECT a.*, u.username, u.display_name FROM audit_log a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC LIMIT ? OFFSET ?', [limit, offset]),
          dbQuery(env.BOM_DB, 'SELECT COUNT(*) as total FROM audit_log'),
        ]);

        return jsonResponse({
          success: true,
          data: logs,
          pagination: { page, limit, total: countResult[0]?.total || 0 },
        }, 200, origin);
      }

      // ----- 用户管理（admin only）-----
      if (path === '/users') {
        if (userRole !== 'admin') return errorResponse('无权限', 403, origin);

        if (request.method === 'GET') {
          const users = await dbQuery(env.BOM_DB, 'SELECT id, username, phone, display_name, role, created_at, updated_at FROM users ORDER BY created_at DESC');
          return jsonResponse({ success: true, data: users }, 200, origin);
        }

        if (request.method === 'POST') {
          const data = await request.json();
          if (!data.username || !data.password) return errorResponse('用户名和密码必填', 400, origin);

          const existing = await dbQuery(env.BOM_DB, 'SELECT id FROM users WHERE username = ?', [data.username]);
          if (existing.length > 0) return errorResponse('用户名已存在', 409, origin);

          const hash = await hashPassword(data.password);
          await dbRun(env.BOM_DB,
            'INSERT INTO users (username, phone, display_name, password_hash, role, must_change_password) VALUES (?, ?, ?, ?, ?, ?)',
            [data.username, data.phone || null, data.display_name || data.username, hash, data.role || 'member', data.mustChangePassword ? 1 : 0]
          );

          return jsonResponse({ success: true, message: '创建成功' }, 201, origin);
        }
      }

      // ----- 修改用户角色（admin only）-----
      if (path.startsWith('/users/role/') && request.method === 'POST') {
        if (userRole !== 'admin') return errorResponse('无权限', 403, origin);
        const targetUsername = decodeURIComponent(path.replace('/users/role/', ''));
        const data = await request.json();
        if (!['admin', 'member', 'readonly'].includes(data.role)) {
          return errorResponse('role 必须是 admin / member / readonly', 400, origin);
        }
        // 防止把自己降权（避免锁死管理员）
        const me = await dbQuery(env.BOM_DB, 'SELECT username FROM users WHERE id = ?', [userId]);
        if (me.length && me[0].username === targetUsername && data.role !== 'admin') {
          return errorResponse('不能修改自己的管理员角色', 400, origin);
        }
        await dbRun(env.BOM_DB, 'UPDATE users SET role = ?, updated_at = CURRENT_TIMESTAMP WHERE username = ?', [data.role, targetUsername]);
        return jsonResponse({ success: true, message: '角色已更新' }, 200, origin);
      }

      // ----- 删除用户（admin only）-----
      if (path.startsWith('/users/') && request.method === 'DELETE') {
        if (userRole !== 'admin') return errorResponse('无权限', 403, origin);
        const targetUsername = decodeURIComponent(path.replace('/users/', ''));
        const me = await dbQuery(env.BOM_DB, 'SELECT username FROM users WHERE id = ?', [userId]);
        if (me.length && me[0].username === targetUsername) {
          return errorResponse('不能删除自己', 400, origin);
        }
        if (targetUsername === 'admin') {
          return errorResponse('不能删除内置 admin 账号', 400, origin);
        }
        // 先查目标用户 id
        const target = await dbQuery(env.BOM_DB, 'SELECT id FROM users WHERE username = ?', [targetUsername]);
        if (!target.length) return errorResponse('用户不存在', 404, origin);
        const targetId = target[0].id;
        // 解除 audit_log 与 material_library 的外键引用，再删用户
        await dbRun(env.BOM_DB, 'UPDATE audit_log SET user_id = NULL WHERE user_id = ?', [targetId]);
        await dbRun(env.BOM_DB, 'UPDATE material_library SET created_by = NULL WHERE created_by = ?', [targetId]);
        await dbRun(env.BOM_DB, 'UPDATE material_library SET updated_by = NULL WHERE updated_by = ?', [targetId]);
        const r = await dbRun(env.BOM_DB, 'DELETE FROM users WHERE id = ?', [targetId]);
        return jsonResponse({ success: true, message: '已删除', changes: r.meta?.changes }, 200, origin);
      }

      // ----- 重置密码（admin 或自己）-----
      if (path === '/users/reset-password') {
        if (userRole !== 'admin') return errorResponse('无权限', 403, origin);

        const data = await request.json();
        if (!data.username || !data.newPassword) return errorResponse('用户名和新密码必填', 400, origin);

        const hash = await hashPassword(data.newPassword);
        await dbRun(env.BOM_DB, 'UPDATE users SET password_hash = ?, must_change_password = 1 WHERE username = ?', [hash, data.username]);

        return jsonResponse({ success: true, message: '密码重置成功' }, 200, origin);
      }

      // ----- 立创 API 代理（复用 V2 逻辑）-----
      if (path === '/lcsc/batch') {
        const codes = url.searchParams.get('codes');
        if (!codes) return errorResponse('codes 参数必填', 400, origin);

        // 先查 KV 缓存
        const cacheKey = `lcsc:${codes}`;
        const cached = await env.LCSC_CACHE_V3.get(cacheKey);
        if (cached) {
          return jsonResponse({ success: true, source: 'cache', data: JSON.parse(cached) }, 200, origin);
        }

        // 调立创 API
        const body = JSON.stringify({ componentCodeList: codes.split(',').map(c => c.trim()) });
        const auth = await buildAuthHeader(env, 'POST', '/smtOpenApi/smtComponent/selectComponentInfoByCodes', body);

        const response = await fetch(CONFIG.LCSC_API_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Accept': 'application/json',
            'Authorization': auth,
          },
          body,
        });

        const result = await response.json();

        // 缓存结果
        if (result.code === 200) {
          await env.LCSC_CACHE_V3.put(cacheKey, JSON.stringify(result), { expirationTtl: 7 * 86400 });
        }

        return jsonResponse({ success: true, source: 'api', data: result }, 200, origin);
      }

      return errorResponse('接口不存在', 404, origin);

    } catch (err) {
      console.error('Worker error:', err);
      return errorResponse('服务器错误: ' + err.message, 500, origin);
    }
  },
};
