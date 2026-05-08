import pandas as pd

c_bom = "/root/.hermes/profiles/development-assistant/cache/documents/doc_53d38b156ae0_C .xlsx"
df = pd.read_excel(c_bom, sheet_name="单板BOM", header=4)
print("列名:", list(df.columns))
print("前10行:")
print(df.head(10).to_string(max_cols=12, max_colwidth=15))
print(f"\n总行数: {len(df)}")
print(f"\n'序号' 列取值（前20）: {df['序号'].head(20).tolist()}")
