-- Cloudflare D1 / SQLite: rebuild material_library to extend its CHECK constraint.
-- Wrangler remote file execution provides rollback and rejects explicit BEGIN/COMMIT.

CREATE TABLE material_library_cost_migration (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lib_type TEXT NOT NULL CHECK (lib_type IN ('lcsc', 'standard', 'cost')),
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
    created_by INTEGER REFERENCES users(id),
    updated_by INTEGER REFERENCES users(id),
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (lib_type, sync_key)
);

INSERT INTO material_library_cost_migration
SELECT * FROM material_library;

DROP TABLE material_library;
ALTER TABLE material_library_cost_migration RENAME TO material_library;

CREATE INDEX IF NOT EXISTS idx_material_libtype_key ON material_library(lib_type, sync_key);
CREATE INDEX IF NOT EXISTS idx_material_libtype_code ON material_library(lib_type, lcsc_code);
CREATE INDEX IF NOT EXISTS idx_material_libtype_updated ON material_library(lib_type, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_material_model ON material_library(model);
