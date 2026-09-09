-- V3 数据库 Schema（v3-legacy 改造版：三库分离）
-- 技象科技 BOM 整理神器 - 团队版
-- 三库结构：lcsc（立创库）+ standard（标准库）+ cost（关键器件成本库）

-- ============================================================
-- 用户表
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    phone TEXT UNIQUE,
    display_name TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'readonly')),
    must_change_password INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 物料库（团队共享，三库分离）
-- lib_type:
--   'lcsc'     → 立创库（来源：立创API批量补齐 / 立创搜索回填）
--   'standard' → 标准库（来源：A BOM / 公司格式 BOM 导入）
--   'cost'     → 关键器件成本库（型号+封装唯一，立创编号可空）
-- 唯一约束：同一库内 sync_key 唯一；标准库和成本库允许没有立创编号
-- ============================================================
CREATE TABLE IF NOT EXISTS material_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lib_type TEXT NOT NULL CHECK (lib_type IN ('lcsc', 'standard', 'cost')),

    -- 云端唯一定位字段：lcsc 用立创编号；standard 用物料编码等；cost 用型号+封装
    sync_key TEXT NOT NULL,

    -- 立创编号（V2 中文字段：立创编号）。标准库、成本库可为空，立创库必填由接口校验。
    lcsc_code TEXT,

    -- 标准库字段全集；立创库仅使用型号/封装/立创编号，成本库另使用 price。
    name TEXT,              -- V2: 物料名称
    model TEXT,             -- V2: 型号
    specification TEXT,     -- V2: 参数描述
    brand TEXT,             -- V2: 品牌

    -- 标准库专用字段
    material_code TEXT,     -- V2: 物料编码
    package TEXT,           -- V2: 封装
    category TEXT,          -- V2: 分类
    manufacturer TEXT,      -- 历史保留（兼容老 V3 schema）
    unit TEXT,              -- V2: 单位（默认 PCS）
    price TEXT,             -- V2: 价格
    stock TEXT,             -- V2: 库存
    datasheet TEXT,         -- V2: 数据手册
    image_url TEXT,         -- V2: 图片
    remark TEXT,            -- V2: 备注 / 自由扩展字段

    -- 元数据
    source TEXT DEFAULT 'import' CHECK (source IN ('api', 'manual', 'import')),
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,

    -- 同一库内 sync_key 唯一；三个库相互分开
    UNIQUE (lib_type, sync_key)
);

-- ============================================================
-- 操作审计日志
-- ============================================================
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id),
    action TEXT NOT NULL,  -- login / logout / create / update / delete / import / export / change_password
    target TEXT,           -- 资源标识（sync_key / lcsc_code / batch-时间戳 等）
    lib_type TEXT,         -- 操作的是哪个库（lcsc / standard / cost / NULL）
    old_value TEXT,
    new_value TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 登录失败记录（防暴力破解）
-- ============================================================
CREATE TABLE IF NOT EXISTS login_attempts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    ip TEXT NOT NULL,
    success INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================
-- 索引
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_material_libtype_key ON material_library(lib_type, sync_key);
CREATE INDEX IF NOT EXISTS idx_material_libtype_code ON material_library(lib_type, lcsc_code);
CREATE INDEX IF NOT EXISTS idx_material_libtype_updated ON material_library(lib_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_model ON material_library(model);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_login_username ON login_attempts(username);
CREATE INDEX IF NOT EXISTS idx_login_ip ON login_attempts(ip);

-- ============================================================
-- 初始化 admin 账号
-- ⚠️ 占位 hash，部署后需用 /v3/users/reset-password 或重置脚本生成真正的 PBKDF2 hash
-- 建议改用 bootstrap 脚本调用 hashPassword('admin123') 写入
-- ============================================================
INSERT OR IGNORE INTO users (username, display_name, password_hash, role, must_change_password)
VALUES ('admin', '管理员', 'PLACEHOLDER_NEEDS_BOOTSTRAP', 'admin', 1);
