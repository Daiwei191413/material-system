import pandas as pd

a_std = "/root/.hermes/profiles/development-assistant/cache/documents/doc_a77096145ae6_A主板_BOMV1.0.xlsx"
b_bom = "/root/.hermes/profiles/development-assistant/cache/documents/doc_9baaccfc9448_B BOM.xlsx"

for name, path in [("A主板_BOMV1.0 (标准模板)", a_std), ("B BOM (待整理)", b_bom)]:
    print("="*70)
    print(f"📄 {name}")
    print("="*70)
    xl = pd.ExcelFile(path)
    print(f"Sheets: {xl.sheet_names}")
    for sn in xl.sheet_names:
        df = pd.read_excel(path, sheet_name=sn, header=None, nrows=8)
        print(f"\n-- Sheet: {sn} --")
        print(df.to_string(max_cols=15, max_colwidth=18))
    print()
