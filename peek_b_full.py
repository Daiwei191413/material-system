import pandas as pd

b_bom = "/root/.hermes/profiles/development-assistant/cache/documents/doc_9baaccfc9448_B BOM.xlsx"
df = pd.read_excel(b_bom, sheet_name="TP1506－MS22－Test", header=0)
print("列名:", list(df.columns))
print(f"总行数: {len(df)}\n")

# 去掉首列全 NaN
if df.columns[0] == 'Unnamed: 0' or df[df.columns[0]].isna().all():
    df = df.iloc[:, 1:]

df.columns = ['型号', '位号', '封装', '嘉立创编号']
print("规范化后列名:", list(df.columns))
print(f"有效行数: {df.dropna(subset=['型号']).shape[0]}\n")

print("=== B BOM 完整内容 ===")
print(df.to_string(max_colwidth=40))

print("\n=== 嘉立创编号统计 ===")
print(f"有编号: {df['嘉立创编号'].notna().sum()}")
print(f"无编号: {df['嘉立创编号'].isna().sum()}")
print(f"编号样例: {df['嘉立创编号'].dropna().head(10).tolist()}")
