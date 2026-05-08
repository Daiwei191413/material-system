import pandas as pd
# 看 A BOM 和 C BOM 的实际 header
for name, path in [("A BOM", "/root/.hermes/profiles/development-assistant/cache/documents/doc_9c294fa381d8_A主板_V1.0.xlsx"),
                    ("C BOM", "/root/.hermes/profiles/development-assistant/cache/documents/doc_53d38b156ae0_C .xlsx")]:
    xl = pd.ExcelFile(path)
    for sn in xl.sheet_names:
        df = pd.read_excel(path, sheet_name=sn, header=None, nrows=5)
        print(f"\n{name} - {sn}")
        print(df.to_string(max_cols=15, max_colwidth=15))
        print("-" * 40)
