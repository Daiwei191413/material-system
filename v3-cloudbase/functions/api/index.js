const crypto = require('crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');

const CONFIG = {
  version: 'V1.0.18',
  jwtExpireDays: 7,
  maxLoginAttempts: 5,
  loginLockoutMinutes: 15,
};

const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST,
        port: Number(process.env.PGPORT || 5432),
        database: process.env.PGDATABASE || 'postgres',
        user: process.env.PGUSER,
        password: process.env.PGPASSWORD,
        max: Number(process.env.PG_POOL_MAX || 5),
      },
);

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '12mb' }));

function wrapAsyncRoute(fn) {
  if (typeof fn !== 'function' || fn.length === 4) return fn;
  return function wrappedRoute(req, res, next) {
    try {
      const result = fn(req, res, next);
      if (result && typeof result.catch === 'function') result.catch(next);
      return result;
    } catch (err) {
      return next(err);
    }
  };
}

['get', 'post', 'put', 'delete', 'all'].forEach((method) => {
  const original = app[method].bind(app);
  app[method] = function routeWithAsyncErrors(path, ...handlers) {
    return original(path, ...handlers.map(wrapAsyncRoute));
  };
});

function allowedOrigins() {
  return (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean);
}

function corsMiddleware(req, res, next) {
  const origin = req.headers.origin || '';
  const allowed = allowedOrigins();
  const allow = allowed.length === 0 || allowed.includes(origin) ? origin : allowed[0];
  if (allow) res.setHeader('Access-Control-Allow-Origin', allow);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  res.setHeader('Vary', 'Origin');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
}

app.use(corsMiddleware);

function noStoreMiddleware(req, res, next) {
  if (req.path.startsWith('/v3') || req.path.startsWith('/api/')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');
  }
  next();
}

app.use(noStoreMiddleware);

function clientIp(req) {
  return (
    req.headers['x-forwarded-for'] ||
    req.headers['x-real-ip'] ||
    req.socket.remoteAddress ||
    'unknown'
  ).toString().split(',')[0].trim();
}

function cleanText(value) {
  return (value ?? '').toString().trim();
}

function normText(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, ' ');
}

function normLcsc(value) {
  const raw = cleanText(value).toUpperCase();
  const match = raw.match(/C\d{3,}/);
  return match ? match[0] : raw;
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
  if (lib === 'cost') return model && pkg ? `cost:${normText(model)}|${normText(pkg)}` : '';
  if (materialCode) return `mat:${normText(materialCode)}`;
  if (lcsc) return `lcsc:${lcsc}`;
  if (model || pkg || brand || name || spec) {
    return `std:${normText(model)}|${normText(pkg)}|${normText(brand)}|${normText(name)}|${normText(spec)}`;
  }
  return '';
}

function materialIdentityError(lib) {
  if (lib === 'lcsc') return '立创库需填写立创编号';
  if (lib === 'cost') return '关键器件成本库需填写型号和封装';
  return '标准库需至少填写物料编码、立创编号、型号/封装/品牌或物料名称/参数描述';
}

function validCostPrice(item) {
  const price = Number(cleanText(item.price ?? item['单价']));
  return Number.isFinite(price) && price > 0;
}

function materialParams(item, userId, lib, syncKey) {
  return [
    lib,
    syncKey,
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
}

function requireLib(raw) {
  const lib = (raw || '').toLowerCase();
  return lib === 'lcsc' || lib === 'standard' || lib === 'cost' ? lib : null;
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha256');
  return `${salt.toString('base64')}.${hash.toString('base64')}`;
}

function verifyPassword(password, stored) {
  if (typeof password !== 'string' || typeof stored !== 'string') return false;
  const parts = String(stored || '').split('.');
  if (parts.length !== 2) return false;
  const salt = Buffer.from(parts[0], 'base64');
  const expected = Buffer.from(parts[1], 'base64');
  const actual = crypto.pbkdf2Sync(password, salt, 10000, 32, 'sha256');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function signToken(user) {
  const secret = process.env.JWT_SECRET || 'default-secret-change-me';
  return jwt.sign(
    { userId: user.id, username: user.username, role: user.role },
    secret,
    { expiresIn: `${CONFIG.jwtExpireDays}d` },
  );
}

function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'default-secret-change-me');
  } catch (_err) {
    return null;
  }
}

async function dbQuery(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

async function dbRun(sql, params = []) {
  return pool.query(sql, params);
}

function error(res, message, status = 400) {
  return res.status(status).json({ success: false, error: message });
}

async function authRequired(req, res, next) {
  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const payload = verifyToken(token);
  if (!payload) return error(res, '未登录或登录已过期', 401);

  const users = await dbQuery(
    'SELECT id, username, display_name, role, must_change_password FROM users WHERE id = $1',
    [payload.userId],
  );
  if (!users.length) return error(res, '用户不存在', 401);
  req.user = users[0];
  next();
}

function adminRequired(req, res, next) {
  if (!req.user || req.user.role !== 'admin') return error(res, '无权限', 403);
  next();
}

app.get('/health', async (_req, res) => {
  res.json({ ok: true, service: 'techphant-bom-v3-cloudbase-api', version: CONFIG.version });
});

app.get('/v3/health', async (_req, res) => {
  res.json({ ok: true, service: 'techphant-bom-v3-cloudbase-api', version: CONFIG.version });
});

app.post('/v3/auth/login', async (req, res) => {
  const { username, password } = req.body || {};
  if (typeof username !== 'string' || typeof password !== 'string' || !username.trim() || !password) {
    return error(res, '用户名和密码必填', 400);
  }
  const loginName = username.trim();

  const ip = clientIp(req);
  const attempts = await dbQuery(
    `SELECT COUNT(*)::int AS count
       FROM login_attempts
      WHERE username = $1
        AND ip = $2
        AND success = 0
        AND created_at > (CURRENT_TIMESTAMP - ($3::text || ' minutes')::interval)`,
    [loginName, ip, CONFIG.loginLockoutMinutes],
  );
  if ((attempts[0]?.count || 0) >= CONFIG.maxLoginAttempts) {
    return error(res, `登录失败次数过多，请${CONFIG.loginLockoutMinutes}分钟后再试`, 429);
  }

  const users = await dbQuery('SELECT * FROM users WHERE username = $1 OR phone = $1', [loginName]);
  const user = users[0];
  if (!user || !verifyPassword(password, user.password_hash)) {
    await dbRun('INSERT INTO login_attempts (username, ip, success) VALUES ($1, $2, 0)', [loginName, ip]);
    return error(res, '用户名或密码错误', 401);
  }

  await dbRun('INSERT INTO login_attempts (username, ip, success) VALUES ($1, $2, 1)', [loginName, ip]);
  await dbRun(
    'INSERT INTO audit_log (user_id, action, ip, user_agent) VALUES ($1, $2, $3, $4)',
    [user.id, 'login', ip, req.headers['user-agent'] || ''],
  );

  res.json({
    success: true,
    token: signToken(user),
    user: {
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      mustChangePassword: user.must_change_password === 1,
    },
  });
});

app.get('/v3/auth/me', authRequired, (req, res) => {
  res.json({
    success: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      displayName: req.user.display_name,
      role: req.user.role,
      mustChangePassword: req.user.must_change_password === 1,
    },
  });
});

app.post('/v3/auth/change-password', authRequired, async (req, res) => {
  const { oldPassword, newPassword } = req.body || {};
  if (!oldPassword || !newPassword) return error(res, '当前密码和新密码必填', 400);
  if (newPassword.length < 8) return error(res, '新密码至少8位', 400);

  const users = await dbQuery('SELECT * FROM users WHERE id = $1', [req.user.id]);
  const user = users[0];
  if (!verifyPassword(oldPassword, user.password_hash)) return error(res, '当前密码错误', 401);

  await dbRun(
    'UPDATE users SET password_hash = $1, must_change_password = 0, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
    [hashPassword(newPassword), req.user.id],
  );
  await dbRun(
    'INSERT INTO audit_log (user_id, action, ip, user_agent) VALUES ($1, $2, $3, $4)',
    [req.user.id, 'change_password', clientIp(req), req.headers['user-agent'] || ''],
  );
  res.json({ success: true, message: '密码修改成功' });
});

app.get('/v3/library', authRequired, async (req, res) => {
  const lib = requireLib(req.query.lib);
  if (!lib) return error(res, 'lib 参数必填且必须为 lcsc、standard 或 cost', 400);

  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(10000, Math.max(1, Number(req.query.limit || 50)));
  const offset = (page - 1) * limit;
  const params = [lib];
  let where = 'WHERE lib_type = $1';

  if (req.query.search) {
    params.push(`%${req.query.search}%`);
    const idx = params.length;
    where += ` AND (sync_key ILIKE $${idx} OR lcsc_code ILIKE $${idx} OR name ILIKE $${idx} OR model ILIKE $${idx} OR specification ILIKE $${idx} OR material_code ILIKE $${idx})`;
  }
  if (req.query.category) {
    params.push(req.query.category);
    where += ` AND category = $${params.length}`;
  }

  const items = await dbQuery(
    `SELECT * FROM material_library ${where} ORDER BY updated_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset],
  );
  const count = await dbQuery(`SELECT COUNT(*)::int AS total FROM material_library ${where}`, params);
  res.json({ success: true, lib, data: items, pagination: { page, limit, total: count[0]?.total || 0 } });
});

app.post('/v3/library', authRequired, adminRequired, async (req, res) => {
  const lib = requireLib(req.query.lib);
  if (!lib) return error(res, 'lib 参数必填且必须为 lcsc、standard 或 cost', 400);

  const data = req.body || {};
  const syncKey = makeMaterialSyncKey(lib, data);
  if (!syncKey) return error(res, materialIdentityError(lib), 400);
  if (lib === 'cost' && !validCostPrice(data)) return error(res, '关键器件成本库单价必须为大于 0 的数字', 400);

  const params = materialParams(data, req.user.id, lib, syncKey);
  try {
    await dbRun(
      `INSERT INTO material_library
       (lib_type, sync_key, lcsc_code, name, model, specification, brand, material_code, package, category, manufacturer, unit, price, stock, datasheet, image_url, remark, source, created_by, updated_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
      [...params, data.source || 'manual', req.user.id, req.user.id],
    );
  } catch (err) {
    if (err.code === '23505') return error(res, '该物料在此库已存在', 409);
    throw err;
  }

  await dbRun(
    'INSERT INTO audit_log (user_id, action, target, lib_type, new_value, ip) VALUES ($1,$2,$3,$4,$5,$6)',
    [req.user.id, 'create', syncKey, lib, JSON.stringify(data), clientIp(req)],
  );
  res.status(201).json({ success: true, message: '创建成功' });
});

app.get('/v3/library/export', authRequired, adminRequired, async (req, res) => {
  const libRaw = req.query.lib;
  let items;
  if (libRaw) {
    const lib = requireLib(libRaw);
    if (!lib) return error(res, 'lib 必须为 lcsc、standard 或 cost', 400);
    items = await dbQuery('SELECT * FROM material_library WHERE lib_type = $1 ORDER BY updated_at DESC', [lib]);
    await dbRun(
      'INSERT INTO audit_log (user_id, action, target, lib_type, ip) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'export', `${lib}-${items.length}`, lib, clientIp(req)],
    );
  } else {
    items = await dbQuery('SELECT * FROM material_library ORDER BY lib_type, updated_at DESC');
    await dbRun(
      'INSERT INTO audit_log (user_id, action, target, ip) VALUES ($1,$2,$3,$4)',
      [req.user.id, 'export', `all-${items.length}`, clientIp(req)],
    );
  }
  res.json({ success: true, data: items });
});

app.post('/v3/library/import', authRequired, adminRequired, async (req, res) => {
  const lib = requireLib(req.body?.lib || req.query.lib);
  if (!lib) return error(res, 'lib 字段必填且必须为 lcsc、standard 或 cost', 400);

  const items = req.body?.items;
  if (!Array.isArray(items) || items.length === 0) return error(res, 'items 为空', 400);

  const seen = new Map();
  let failed = 0;
  for (const raw of items) {
    const item = { ...raw };
    const syncKey = makeMaterialSyncKey(lib, item);
    if (!syncKey || (lib === 'cost' && !validCostPrice(item))) {
      failed++;
      continue;
    }
    item.sync_key = syncKey;
    item.lcsc_code = normLcsc(item.lcsc_code || item.componentCode || item['立创编号']) || '';
    seen.set(syncKey, item);
  }
  const normalized = [...seen.values()];
  const existing = await dbQuery('SELECT sync_key FROM material_library WHERE lib_type = $1', [lib]);
  const existingKeys = new Set(existing.map((x) => x.sync_key));
  const inserted = normalized.filter((x) => !existingKeys.has(x.sync_key)).length;
  const updated = normalized.length - inserted;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    for (const item of normalized) {
      const p = materialParams(item, req.user.id, lib, item.sync_key);
      await client.query(
        `INSERT INTO material_library
         (lib_type, sync_key, lcsc_code, name, model, specification, brand, material_code, package, category, manufacturer, unit, price, stock, datasheet, image_url, remark, source, created_by, updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,'import',$18,$19)
         ON CONFLICT(lib_type, sync_key) DO UPDATE SET
           lcsc_code = EXCLUDED.lcsc_code,
           name = EXCLUDED.name,
           model = EXCLUDED.model,
           specification = EXCLUDED.specification,
           brand = EXCLUDED.brand,
           material_code = EXCLUDED.material_code,
           package = EXCLUDED.package,
           category = EXCLUDED.category,
           manufacturer = EXCLUDED.manufacturer,
           unit = EXCLUDED.unit,
           price = EXCLUDED.price,
           stock = EXCLUDED.stock,
           datasheet = EXCLUDED.datasheet,
           image_url = EXCLUDED.image_url,
           remark = EXCLUDED.remark,
           source = 'import',
           updated_by = EXCLUDED.updated_by,
           updated_at = CURRENT_TIMESTAMP`,
        [...p, req.user.id, req.user.id],
      );
    }
    await client.query(
      'INSERT INTO audit_log (user_id, action, target, lib_type, new_value, ip) VALUES ($1,$2,$3,$4,$5,$6)',
      [
        req.user.id,
        'import',
        `batch-${Date.now()}`,
        lib,
        JSON.stringify({ success: normalized.length, failed, inserted, updated, total: items.length, unique: normalized.length }),
        clientIp(req),
      ],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }

  res.json({
    success: true,
    message: `导入完成：新增 ${inserted}，更新 ${updated}，失败 ${failed}`,
    stats: { success: normalized.length, failed, inserted, updated, total: items.length, unique: normalized.length },
  });
});

app.post('/v3/library/clear', authRequired, adminRequired, async (req, res) => {
  const libRaw = req.body?.lib || req.query.lib;
  const lib = requireLib(libRaw);
  if (!lib) return error(res, `lib 字段必填且必须为 lcsc、standard 或 cost（收到：${libRaw || '空'}）`, 400);

  const before = await dbQuery('SELECT COUNT(*)::int AS cnt FROM material_library WHERE lib_type = $1', [lib]);
  await dbRun('DELETE FROM material_library WHERE lib_type = $1', [lib]);
  await dbRun(
    'INSERT INTO audit_log (user_id, action, target, lib_type, old_value, ip) VALUES ($1,$2,$3,$4,$5,$6)',
    [req.user.id, 'delete', `clear-${lib}`, lib, JSON.stringify({ count: before[0]?.cnt || 0 }), clientIp(req)],
  );
  res.json({ success: true, message: `已清空 ${lib} 库（${before[0]?.cnt || 0} 条）` });
});

app.all('/v3/library/:code', authRequired, async (req, res) => {
  const lib = requireLib(req.query.lib);
  if (!lib) return error(res, 'lib 参数必填且必须为 lcsc、standard 或 cost', 400);

  const code = decodeURIComponent(req.params.code);
  const fallbackKey = code.includes(':') ? code : makeMaterialSyncKey(lib, { lcsc_code: code, material_code: code });
  const lookup = [lib, code, fallbackKey, code];
  const rows = await dbQuery(
    'SELECT * FROM material_library WHERE lib_type = $1 AND (sync_key = $2 OR sync_key = $3 OR lcsc_code = $4)',
    lookup,
  );

  if (req.method === 'GET') {
    if (!rows.length) return error(res, '物料不存在', 404);
    return res.json({ success: true, data: rows[0] });
  }

  if (req.user.role !== 'admin') return error(res, '只有管理员可修改物料库', 403);
  if (!rows.length) return error(res, '物料不存在', 404);

  const old = rows[0];
  if (req.method === 'DELETE') {
    await dbRun('DELETE FROM material_library WHERE lib_type = $1 AND sync_key = $2', [lib, old.sync_key]);
    await dbRun(
      'INSERT INTO audit_log (user_id, action, target, lib_type, old_value, ip) VALUES ($1,$2,$3,$4,$5,$6)',
      [req.user.id, 'delete', code, lib, JSON.stringify(old), clientIp(req)],
    );
    return res.json({ success: true, message: '删除成功' });
  }

  if (req.method === 'PUT') {
    const data = req.body || {};
    const merged = { ...old, ...data };
    const nextSyncKey = makeMaterialSyncKey(lib, merged);
    if (!nextSyncKey) return error(res, materialIdentityError(lib), 400);
    if (lib === 'cost' && !validCostPrice(merged)) return error(res, '关键器件成本库单价必须为大于 0 的数字', 400);
    await dbRun(
      `UPDATE material_library SET
         sync_key = $1, lcsc_code = $2,
         name = $3, model = $4, specification = $5, brand = $6,
         material_code = $7, package = $8, category = $9, manufacturer = $10,
         unit = $11, price = $12, stock = $13, datasheet = $14, image_url = $15, remark = $16,
         updated_by = $17, updated_at = CURRENT_TIMESTAMP
       WHERE lib_type = $18 AND sync_key = $19`,
      [
        nextSyncKey,
        normLcsc(merged.lcsc_code || merged.componentCode || merged['立创编号']) || '',
        data.name ?? old.name,
        data.model ?? old.model,
        data.specification ?? old.specification,
        data.brand ?? old.brand,
        data.material_code ?? old.material_code,
        data.package ?? old.package,
        data.category ?? old.category,
        data.manufacturer ?? old.manufacturer,
        data.unit ?? old.unit,
        data.price ?? old.price,
        data.stock ?? old.stock,
        data.datasheet ?? old.datasheet,
        data.image_url ?? old.image_url,
        data.remark ?? old.remark,
        req.user.id,
        lib,
        old.sync_key,
      ],
    );
    await dbRun(
      'INSERT INTO audit_log (user_id, action, target, lib_type, old_value, new_value, ip) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [req.user.id, 'update', code, lib, JSON.stringify(old), JSON.stringify(data), clientIp(req)],
    );
    return res.json({ success: true, message: '更新成功' });
  }

  return error(res, 'Method not allowed', 405);
});

app.get('/v3/audit', authRequired, adminRequired, async (req, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
  const offset = (page - 1) * limit;
  const logs = await dbQuery(
    'SELECT a.*, u.username, u.display_name FROM audit_log a LEFT JOIN users u ON a.user_id = u.id ORDER BY a.created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset],
  );
  const count = await dbQuery('SELECT COUNT(*)::int AS total FROM audit_log');
  res.json({ success: true, data: logs, pagination: { page, limit, total: count[0]?.total || 0 } });
});

app.get('/v3/users', authRequired, adminRequired, async (_req, res) => {
  const users = await dbQuery(
    'SELECT id, username, phone, display_name, role, created_at, updated_at FROM users ORDER BY created_at DESC',
  );
  res.json({ success: true, data: users });
});

app.post('/v3/users', authRequired, adminRequired, async (req, res) => {
  const data = req.body || {};
  const username = cleanText(data.username);
  const password = typeof data.password === 'string' ? data.password : '';
  const role = ['admin', 'member', 'readonly'].includes(data.role) ? data.role : 'member';
  if (!username || !password) return error(res, '用户名和密码必填', 400);
  if (!/^[a-zA-Z0-9_]{2,32}$/.test(username)) return error(res, '账号只能用字母、数字、下划线，长度 2-32 位', 400);
  if (password.length < 6) return error(res, '初始密码至少 6 位', 400);
  const hash = hashPassword(password);
  try {
    await dbRun(
      'INSERT INTO users (username, phone, display_name, password_hash, role, must_change_password) VALUES ($1,$2,$3,$4,$5,$6)',
      [username, cleanText(data.phone) || null, cleanText(data.display_name) || username, hash, role, data.mustChangePassword ? 1 : 0],
    );
  } catch (err) {
    if (err.code === '23505') return error(res, '账号或手机号已存在', 409);
    throw err;
  }
  const users = await dbQuery(
    'SELECT id, username, phone, display_name, role, created_at, updated_at FROM users ORDER BY created_at DESC',
  );
  res.status(201).json({ success: true, message: '创建成功', data: users });
});

app.post('/v3/users/role/:username', authRequired, adminRequired, async (req, res) => {
  const role = req.body?.role;
  const targetUsername = decodeURIComponent(req.params.username);
  if (!['admin', 'member', 'readonly'].includes(role)) return error(res, 'role 必须是 admin / member / readonly', 400);
  if (req.user.username === targetUsername && role !== 'admin') return error(res, '不能修改自己的管理员角色', 400);
  await dbRun('UPDATE users SET role = $1, updated_at = CURRENT_TIMESTAMP WHERE username = $2', [role, targetUsername]);
  res.json({ success: true, message: '角色已更新' });
});

app.delete('/v3/users/:username', authRequired, adminRequired, async (req, res) => {
  const targetUsername = decodeURIComponent(req.params.username);
  if (req.user.username === targetUsername) return error(res, '不能删除自己', 400);
  if (targetUsername === 'admin') return error(res, '不能删除内置 admin 账号', 400);
  const target = await dbQuery('SELECT id FROM users WHERE username = $1', [targetUsername]);
  if (!target.length) return error(res, '用户不存在', 404);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM login_attempts WHERE username = $1', [targetUsername]);
    await client.query('DELETE FROM users WHERE id = $1', [target[0].id]);
    await client.query(
      'INSERT INTO audit_log (user_id, action, target, ip, user_agent) VALUES ($1,$2,$3,$4,$5)',
      [req.user.id, 'delete_user', targetUsername, clientIp(req), req.headers['user-agent'] || ''],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
  const users = await dbQuery(
    'SELECT id, username, phone, display_name, role, created_at, updated_at FROM users ORDER BY created_at DESC',
  );
  res.json({ success: true, message: '已删除', data: users });
});

app.post('/v3/users/reset-password', authRequired, adminRequired, async (req, res) => {
  const { username, newPassword } = req.body || {};
  if (!username || !newPassword) return error(res, '用户名和新密码必填', 400);
  await dbRun(
    'UPDATE users SET password_hash = $1, must_change_password = 1, updated_at = CURRENT_TIMESTAMP WHERE username = $2',
    [hashPassword(newPassword), username],
  );
  res.json({ success: true, message: '密码重置成功' });
});

async function forwardLcsc(req, res, next) {
  const base = process.env.LCSC_PROXY_FALLBACK || 'https://lcsc-proxy.steidleyestephani737.workers.dev';
  try {
    const suffix = req.originalUrl.replace(/^\/(?:v3|api)\/lcsc/, '') || '/';
    const target = new URL(suffix, base);
    const response = await fetch(target.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });
    const text = await response.text();
    res.setHeader('Cache-Control', 'no-store');
    res.status(response.status).type(response.headers.get('content-type') || 'application/json').send(text);
  } catch (err) {
    next(err);
  }
}

app.get('/api/lcsc', forwardLcsc);
app.get('/api/lcsc/batch', forwardLcsc);
app.get('/api/lcsc/search', forwardLcsc);

app.get('/v3/lcsc', forwardLcsc);
app.get('/v3/lcsc/batch', forwardLcsc);
app.get('/v3/lcsc/search', forwardLcsc);

app.use((req, res) => {
  error(res, `接口不存在：${req.method} ${req.path}`, 404);
});

app.use((err, _req, res, _next) => {
  console.error('[cloudbase-api]', err);
  error(res, `服务器错误: ${err.message}`, 500);
});

const port = Number(process.env.PORT || 9000);
app.listen(port, '0.0.0.0', () => {
  console.log(`Techphant BOM V3 CloudBase API listening on ${port}`);
});
