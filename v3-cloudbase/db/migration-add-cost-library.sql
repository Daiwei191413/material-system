-- Run once before deploying a frontend/backend that writes lib_type='cost'.
-- Keep this as one statement so CloudBase db execute applies the change atomically.
ALTER TABLE material_library
    DROP CONSTRAINT material_library_lib_type_check,
    ADD CONSTRAINT material_library_lib_type_check
    CHECK (lib_type IN ('lcsc', 'standard', 'cost'));
