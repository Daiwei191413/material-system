import pandas as pd
from collections import Counter

new_bom = "/root/.hermes/profiles/development-assistant/cache/documents/doc_aea1134c47a4_器件BOM库V1.0 20260419.xlsx"
a_bom = "/root/.hermes/profiles/development-assistant/cache/documents/doc_9c294fa381d8_A主板_V1.0.xlsx"
c_bom = "/root/.hermes/profiles/development-assistant/cache/documents/doc_53d38b156ae0_C .xlsx"

df_lib = pd.read_excel(new_bom, sheet_name="单板BOM")
df_a = pd.read_excel(a_bom, sheet_name="单板BOM", header=4)
df_c = pd.read_excel(c_bom, sheet_name="单板BOM", header=4)

# 清理：去除标题空行
df_a = df_a[df_a['序号'].apply(lambda x: str(x).replace('.0','').isdigit())].reset_index(drop=True)
df_c = df_c[df_c['序号'].apply(lambda x: str(x).replace('.0','').isdigit())].reset_index(drop=True)

print("📋 A BOM (TP1209 板卡):", len(df_a), "行")
print("📋 C BOM (TP1209 板卡):", len(df_c), "行")
print("📚 新库:", len(df_lib), "行")

def normalize(s):
    if pd.isna(s): return ""
    return str(s).strip().replace(" ", "").upper()

lib_models = {normalize(m): m for m in df_lib['型号'].dropna()}
lib_by_model = {normalize(r['型号']): r for _, r in df_lib.iterrows() if pd.notna(r['型号'])}

# A BOM 匹配情况
print("\n" + "="*60)
print("🔍 A BOM 型号 → 新库匹配")
print("="*60)
a_match, a_miss = 0, []
for _, r in df_a.iterrows():
    m = normalize(r.get('型号'))
    if m and m in lib_models:
        a_match += 1
    elif m:
        a_miss.append(str(r.get('型号')))
print(f"匹配: {a_match}/{len(df_a)}")
print(f"未命中型号 ({len(a_miss)}):")
for m in a_miss[:15]:
    print(f"  - {m}")

# C BOM 匹配情况
print("\n" + "="*60)
print("🔍 C BOM 型号 → 新库匹配")
print("="*60)
c_match, c_miss = 0, []
for _, r in df_c.iterrows():
    m = normalize(r.get('型号'))
    if m and m in lib_models:
        c_match += 1
    elif m:
        c_miss.append(str(r.get('型号')))
print(f"匹配: {c_match}/{len(df_c)}")
print(f"未命中型号 ({len(c_miss)}):")
for m in c_miss[:20]:
    print(f"  - {m}")

# C BOM 的字段缺失
print("\n" + "="*60)
print("📊 C BOM 字段完整度")
print("="*60)
for col in ['物料编码','物料名称','型号','参数描述','封装','数量','单位','品牌']:
    if col in df_c.columns:
        missing = df_c[col].isna().sum()
        print(f"  {col:<8} 缺失 {missing}/{len(df_c)} ({missing/len(df_c)*100:.0f}%)")
