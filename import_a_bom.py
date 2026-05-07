import pandas as pd
import sqlite3
import re
from material_db import init_database, init_categories, add_material, search_materials, export_to_json

# 读取A BOM数据
a_bom_path = '/root/.hermes/profiles/development-assistant/cache/documents/doc_9c294fa381d8_A主板_V1.0.xlsx'
df_a = pd.read_excel(a_bom_path, sheet_name='单板BOM', header=4)
df_a = df_a.dropna(how='all').reset_index(drop=True)

print("=" * 70)
print("📥 从A BOM导入物料到数据库")
print("=" * 70)

# 初始化数据库
init_database()
init_categories()

# 定义物料分类映射规则
def get_category_info(material_name, model, ref):
    """根据物料名称、型号和位号判断分类"""
    
    material_name = str(material_name).upper() if pd.notna(material_name) else ''
    model = str(model).upper() if pd.notna(model) else ''
    ref = str(ref).upper() if pd.notna(ref) else ''
    
    # 根据位号判断
    if 'R' in ref:
        return 'R', '01', '贴片电阻'
    elif 'C' in ref:
        return 'C', '01', '陶瓷电容'
    elif 'L' in ref:
        # 区分电感和磁珠
        if '磁珠' in material_name or 'BEAD' in material_name or 'BLM' in model:
            return 'L', '03', '磁珠'
        elif '绕线' in material_name:
            return 'L', '02', '绕线电感'
        else:
            return 'L', '01', '贴片电感'
    elif 'D' in ref or 'LED' in ref:
        if 'LED' in material_name or '发光' in material_name:
            return 'D', '05', '发光二极管'
        elif '肖特基' in material_name or 'SS' in model:
            return 'D', '02', '肖特基二极管'
        elif '稳压' in material_name:
            return 'D', '03', '稳压二极管'
        elif 'TVS' in material_name:
            return 'D', '04', 'TVS二极管'
        else:
            return 'D', '01', '整流二极管'
    elif 'Q' in ref:
        if 'MOS' in material_name or 'MOSFET' in model:
            return 'Q', '03', 'N-MOS'
        else:
            return 'Q', '01', 'NPN三极管'
    elif 'U' in ref or 'IC' in ref:
        if 'MCU' in material_name or '单片机' in material_name:
            return 'IC', '01', 'MCU'
        elif '电源' in material_name or 'PMIC' in model:
            return 'IC', '04', '电源IC'
        elif '射频' in material_name or 'RF' in model:
            return 'IC', '08', '射频IC'
        elif '放大器' in material_name or 'AMP' in model:
            return 'IC', '06', '放大器'
        else:
            return 'IC', '01', 'MCU'
    elif 'J' in ref or 'XS' in ref or 'CON' in ref:
        if 'USB' in model or 'TYPEC' in model:
            return 'CON', '02', 'USB连接器'
        elif 'RF' in model or 'IPEX' in model or 'U.FL' in model:
            return 'CON', '04', '射频连接器'
        elif 'FPC' in model:
            return 'CON', '06', 'FPC连接器'
        elif '排针' in material_name or '排母' in material_name:
            return 'CON', '01', '排针/排母'
        else:
            return 'CON', '01', '排针/排母'
    elif 'SW' in ref or 'S' in ref:
        return 'SW', '01', '轻触开关'
    elif 'Y' in ref or 'CRY' in ref:
        return 'CRY', '01', '无源晶振'
    elif 'F' in ref:
        return 'FIL', '01', '滤波器'
    elif 'ANT' in ref:
        return 'ANT', '01', '天线'
    elif 'BAT' in ref:
        return 'BAT', '01', '锂电池'
    elif 'PCB' in material_name or '电路板' in material_name:
        return 'PCB', '01', 'PCB板'
    else:
        return 'MIS', '01', '杂项'

# 导入物料
imported_count = 0
skipped_count = 0
error_count = 0

for idx, row in df_a.iterrows():
    try:
        material_name = row['物料名称']
        model = row['型号']
        ref = row['位号']
        
        if pd.isna(material_name) or pd.isna(model):
            skipped_count += 1
            continue
        
        # 获取分类信息
        category, subcategory, default_name = get_category_info(material_name, model, ref)
        
        # 使用原始物料名称，如果没有则使用默认名称
        name = material_name if pd.notna(material_name) else default_name
        
        # 规格参数
        specification = row['参数描述'] if pd.notna(row['参数描述']) else ''
        
        # 封装
        package = row['封装'] if pd.notna(row['封装']) else ''
        
        # 品牌
        brand = row['品牌'] if pd.notna(row['品牌']) else ''
        
        # 物料编码（如果有）
        existing_code = row['物料编码'] if pd.notna(row['物料编码']) else None
        
        # 单位
        unit = row['单位'] if pd.notna(row['单位']) else 'PCS'
        
        # 添加物料
        code = add_material(
            category=category,
            subcategory=subcategory,
            name=name,
            model=model,
            specification=specification,
            package=package,
            brand=brand,
            unit=unit
        )
        
        imported_count += 1
        print(f"✅ [{imported_count}] {code} - {name} - {model}")
        
    except Exception as e:
        error_count += 1
        print(f"❌ 导入失败 [{idx}]: {e}")

print(f"\n{'=' * 70}")
print(f"📊 导入统计")
print(f"{'=' * 70}")
print(f"✅ 成功导入: {imported_count} 条")
print(f"⏭️  跳过: {skipped_count} 条")
print(f"❌ 失败: {error_count} 条")

# 导出数据库
export_path = export_to_json('/tmp/a_bom_materials.json')
print(f"\n📁 数据库导出: {export_path}")

# 统计各分类数量
print(f"\n{'=' * 70}")
print(f"📈 分类统计")
print(f"{'=' * 70}")

conn = sqlite3.connect('/tmp/materials.db')
cursor = conn.cursor()

cursor.execute('''
SELECT category, COUNT(*) as count 
FROM materials 
GROUP BY category 
ORDER BY count DESC
''')

for row in cursor.fetchall():
    cat_code, count = row
    cursor.execute('SELECT name FROM categories WHERE code = ?', (cat_code,))
    cat_name = cursor.fetchone()
    cat_name = cat_name[0] if cat_name else cat_code
    print(f"  {cat_code} ({cat_name}): {count} 条")

conn.close()

print(f"\n✅ A BOM物料导入完成！")
