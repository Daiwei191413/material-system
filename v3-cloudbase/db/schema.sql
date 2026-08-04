-- V3.0.21 CloudBase PostgreSQL Schema
-- 技象科技 BOM 整理神器 - 国内 CloudBase PostgreSQL 版
-- 执行位置：CloudBase SQL 型数据库 -> SQL 窗口

CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    phone TEXT UNIQUE,
    display_name TEXT,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member', 'readonly')),
    must_change_password INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS material_library (
    id BIGSERIAL PRIMARY KEY,
    lib_type TEXT NOT NULL CHECK (lib_type IN ('lcsc', 'standard')),
    sync_key TEXT NOT NULL,
    lcsc_code TEXT,
    name TEXT,
    model TEXT,
    specification TEXT,
    brand TEXT,
    material_code TEXT,
    package TEXT,
    category TEXT,
    manufacturer TEXT,
    unit TEXT,
    price TEXT,
    stock TEXT,
    datasheet TEXT,
    image_url TEXT,
    remark TEXT,
    source TEXT DEFAULT 'import' CHECK (source IN ('api', 'manual', 'import')),
    created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    updated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (lib_type, sync_key)
);

CREATE TABLE IF NOT EXISTS audit_log (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target TEXT,
    lib_type TEXT,
    old_value TEXT,
    new_value TEXT,
    ip TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS login_attempts (
    id BIGSERIAL PRIMARY KEY,
    username TEXT NOT NULL,
    ip TEXT NOT NULL,
    success INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_material_libtype_key ON material_library(lib_type, sync_key);
CREATE INDEX IF NOT EXISTS idx_material_libtype_code ON material_library(lib_type, lcsc_code);
CREATE INDEX IF NOT EXISTS idx_material_libtype_updated ON material_library(lib_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_model ON material_library(model);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_login_username ON login_attempts(username);
CREATE INDEX IF NOT EXISTS idx_login_ip ON login_attempts(ip);

-- 初始化占位管理员。
-- 注意：这里的 password_hash 只是占位值，国内版后端接入后需要用正式密码哈希替换。
INSERT INTO users (username, display_name, password_hash, role, must_change_password)
VALUES ('admin', '管理员', 'PLACEHOLDER_NEEDS_BOOTSTRAP', 'admin', 1)
ON CONFLICT (username) DO NOTHING;
