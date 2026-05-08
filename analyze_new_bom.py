import pandas as pd
from collections import Counter

new_bom = "/root/.hermes/profiles/development-assistant/cache/documents/doc_aea1134c47a4_器件BOM库V1.0 20260419.xlsx"
a_bom = "/root/.hermes/profiles/development-assistant/cache/documents/doc_9c294fa381d8_A主板_V1.0.xlsx"
c_bom = "/root/.hermes/profiles/development-assistant/cache/documents/doc_53d38b156ae0_C .xlsx"

df_new = pd.read_excel(new_bom, sheet_name="单板BOM")

print("=" * 60)
print("📊 新 BOM 库 V1.0 - 整体健康度")
print("=" * 60)
print(f"总行数: {len(df_new)}")
print(f"\n字段缺失统计:")
for col in df_new.columns:
    non_null = df_new[col].notna().sum()
    null_count = len(df_new) - non_null
    pct = null_count / len(df_new) * 100
    print(f"  {col:<12} 缺失 {null_count:>3} 行 ({pct:>5.1f}%)")

print("\n" + "=" * 60)
print("📦 物料分类（按物料名称）- Top 20")
print("=" * 60)
cnt = Counter(df_new['物料名称'].dropna())
for k, v in cnt.most_common(20):
    print(f"  {k:<20} {v:>4} 种")

# 检查 A BOM 和 C BOM 内容
print("\n" + "=" * 60)
print("🔗 A BOM vs 新库 - 型号匹配度")
print("=" * 60)
# A BOM 首行是标题，尝试 header=1 或 2
for h in [0, 1, 2]:
    tmp = pd.read_excel(a_bom, sheet_name="单板BOM", header=h)
    if '型号' in tmp.columns:
        df_a = tmp
        print(f"A BOM header={h}, 列: {list(df_a.columns)}")
        print(f"A BOM 行数: {len(df_a)}")
        break
else:
    raise SystemExit("找不到 A BOM 表头")
a_models = set(df_a['型号'].dropna().astype(str).str.strip())
lib_models = set(df_new['型号'].dropna().astype(str).str.strip())
matched = a_models & lib_models
print(f"A BOM 唯一型号数: {len(a_models)}")
print(f"新库唯一型号数: {len(lib_models)}")
print(f"A BOM 中能直接在新库查到的: {len(matched)} / {len(a_models)} = {len(matched)/max(len(a_models),1)*100:.1f}%")
print(f"A BOM 未在新库中的型号示例（前10）:")
for m in list(a_models - lib_models)[:10]:
    print(f"  - {m}")

print("\n" + "=" * 60)
print("🔗 C BOM vs 新库 - 型号匹配度")
print("=" * 60)
# C BOM 可能在别的 sheet
xl_c = pd.ExcelFile(c_bom)
print(f"C BOM sheets: {xl_c.sheet_names}")
df_c = pd.read_excel(c_bom, sheet_name=xl_c.sheet_names[0])
print(f"C BOM 列: {list(df_c.columns)}")
print(f"C BOM 行数: {len(df_c)}")
