import pandas as pd
import re

new_bom = "/root/.hermes/profiles/development-assistant/cache/documents/doc_aea1134c47a4_器件BOM库V1.0 20260419.xlsx"
df_lib = pd.read_excel(new_bom, sheet_name="单板BOM")

# 看电阻/电容的型号写法
print("=== 电阻（Top 20）===")
r = df_lib[df_lib['物料名称']=='贴片电阻'][['型号','参数描述','封装']].head(20)
print(r.to_string(max_colwidth=50))

print("\n=== 电容（Top 20）===")
c = df_lib[df_lib['物料名称']=='贴片电容'][['型号','参数描述','封装']].head(20)
print(c.to_string(max_colwidth=50))

print("\n=== 二极管相关型号 ===")
d = df_lib[df_lib['物料名称'].isin(['肖特基二极管','发光二极管','TVS管','普通二极管'])][['型号','物料名称','参数描述','封装']].head(20)
print(d.to_string(max_colwidth=40))
