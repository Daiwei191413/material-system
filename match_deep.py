import pandas as pd
import re

new_bom = "/root/.hermes/profiles/development-assistant/cache/documents/doc_aea1134c47a4_器件BOM库V1.0 20260419.xlsx"
a_bom = "/root/.hermes/profiles/development-assistant/cache/documents/doc_9c294fa381d8_A主板_V1.0.xlsx"
c_bom = "/root/.hermes/profiles/development-assistant/cache/documents/doc_53d38b156ae0_C .xlsx"

df_lib = pd.read_excel(new_bom, sheet_name="单板BOM")
df_a = pd.read_excel(a_bom, sheet_name="单板BOM", header=4)
df_c = pd.read_excel(c_bom, sheet_name="单板BOM", header=4)

# A BOM 按"型号" 过滤（型号有值的行）；C BOM 按"型号" 过滤
df_a = df_a[df_a['型号'].notna()].reset_index(drop=True)
df_c = df_c[df_c['型号'].notna()].reset_index(drop=True)

print(f"A BOM 有效行: {len(df_a)}")
print(f"C BOM 有效行: {len(df_c)}")
print(f"新库 行数: {len(df_lib)}")

def norm(s):
    if pd.isna(s): return ""
    return re.sub(r'\s+', '', str(s)).upper()

# 新库索引：用 "型号" 原样 + 规范化版本双索引
lib_idx = {}  # normalized_model -> row
for _, r in df_lib.iterrows():
    if pd.notna(r['型号']):
        key = norm(r['型号'])
        lib_idx[key] = r.to_dict()

# 查 A BOM 是否匹配 —— 直接对比型号的规范化形式
print("\n"+"="*60)
print("🎯 A BOM 型号 → 新库匹配（规范化 + 封装融合）")
print("="*60)

match_rows, miss_rows = [], []
for _, r in df_a.iterrows():
    model_raw = str(r['型号']).strip()
    pkg_raw = str(r.get('封装', '')).strip() if pd.notna(r.get('封装')) else ''
    # 尝试多种匹配
    candidates = [
        norm(model_raw),
        norm(model_raw + pkg_raw),
        norm(model_raw.replace(pkg_raw, '') + pkg_raw) if pkg_raw else norm(model_raw),
    ]
    hit = None
    for c in candidates:
        if c and c in lib_idx:
            hit = lib_idx[c]
            break
    if hit:
        match_rows.append((model_raw, hit['物料名称'], hit['参数描述']))
    else:
        miss_rows.append((model_raw, pkg_raw, r.get('物料名称',''), r.get('参数描述','')))

print(f"✓ 命中: {len(match_rows)}/{len(df_a)}")
print(f"✗ 未命中: {len(miss_rows)}")
print("\n未命中示例（前15）：型号 | 封装 | 物料名称 | 参数描述")
for row in miss_rows[:15]:
    print(f"  {row[0]:<25} | {row[1]:<10} | {str(row[2])[:15]:<15} | {str(row[3])[:30]}")

# 分析一下 C BOM 未命中的型号在立创上能否查到
print("\n"+"="*60)
print("📦 C BOM 字段缺失情况")
print("="*60)
for col in df_c.columns:
    missing = df_c[col].isna().sum()
    print(f"  {col:<8} 缺失 {missing}/{len(df_c)} ({missing/len(df_c)*100:.0f}%)")

print("\n"+"="*60)
print("🎯 C BOM → 新库匹配 (按型号+封装)")
print("="*60)
c_match, c_miss = [], []
for _, r in df_c.iterrows():
    model_raw = str(r['型号']).strip()
    pkg_raw = str(r.get('封装', '')).strip() if pd.notna(r.get('封装')) else ''
    candidates = [norm(model_raw), norm(model_raw + pkg_raw)]
    hit = None
    for c in candidates:
        if c and c in lib_idx:
            hit = lib_idx[c]
            break
    if hit:
        c_match.append((model_raw, hit['物料名称']))
    else:
        c_miss.append((model_raw, pkg_raw))

print(f"✓ C BOM 命中: {len(c_match)}/{len(df_c)}")
for m, n in c_match[:10]:
    print(f"  ✓ {m} → {n}")
print(f"\n✗ C BOM 未命中 ({len(c_miss)}):")
for m, pkg in c_miss:
    print(f"  - {m} ({pkg})")
