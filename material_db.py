import sqlite3
import json
import os
from datetime import datetime

# 数据库路径
DB_PATH = '/tmp/materials.db'

def init_database():
    """初始化物料编码数据库"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 创建物料分类表
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        code VARCHAR(10) UNIQUE NOT NULL,
        name VARCHAR(50) NOT NULL,
        parent_code VARCHAR(10),
        level INTEGER DEFAULT 1,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    
    # 创建物料主表
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS materials (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        material_code VARCHAR(20) UNIQUE NOT NULL,
        category VARCHAR(10) NOT NULL,
        subcategory VARCHAR(10) NOT NULL,
        sequence INTEGER NOT NULL,
        version VARCHAR(5) NOT NULL,
        name VARCHAR(100) NOT NULL,
        model VARCHAR(100),
        specification TEXT,
        package VARCHAR(50),
        brand VARCHAR(50),
        manufacturer_model VARCHAR(100),
        lcsc_code VARCHAR(50),
        unit VARCHAR(10) DEFAULT 'PCS',
        unit_price DECIMAL(10,4),
        moq INTEGER DEFAULT 1,
        stock_quantity INTEGER DEFAULT 0,
        safety_stock INTEGER DEFAULT 0,
        status VARCHAR(20) DEFAULT '在用',
        replacement_code VARCHAR(20),
        remarks TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    
    # 创建BOM表
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS boms (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bom_code VARCHAR(50) NOT NULL,
        project_name VARCHAR(100),
        board_name VARCHAR(100),
        board_model VARCHAR(100),
        version VARCHAR(10),
        material_count INTEGER DEFAULT 0,
        created_by VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    ''')
    
    # 创建BOM明细表
    cursor.execute('''
    CREATE TABLE IF NOT EXISTS bom_details (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        bom_id INTEGER NOT NULL,
        material_code VARCHAR(20) NOT NULL,
        designator VARCHAR(200),
        quantity INTEGER DEFAULT 1,
        unit VARCHAR(10) DEFAULT 'PCS',
        remarks TEXT,
        FOREIGN KEY (bom_id) REFERENCES boms(id),
        FOREIGN KEY (material_code) REFERENCES materials(material_code)
    )
    ''')
    
    # 创建索引
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_material_code ON materials(material_code)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_category ON materials(category)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_model ON materials(model)')
    cursor.execute('CREATE INDEX IF NOT EXISTS idx_status ON materials(status)')
    
    conn.commit()
    conn.close()
    print("✅ 数据库初始化完成")

def init_categories():
    """初始化物料分类数据"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    categories = [
        # 大类
        ('R', '电阻器', None, 1, 'Resistor'),
        ('C', '电容器', None, 1, 'Capacitor'),
        ('L', '电感器', None, 1, 'Inductor'),
        ('D', '二极管', None, 1, 'Diode'),
        ('Q', '三极管/MOS', None, 1, 'Transistor'),
        ('IC', '集成电路', None, 1, 'Integrated Circuit'),
        ('CON', '连接器', None, 1, 'Connector'),
        ('SW', '开关', None, 1, 'Switch'),
        ('LED', '发光二极管', None, 1, 'LED'),
        ('CRY', '晶振', None, 1, 'Crystal'),
        ('MOD', '模块', None, 1, 'Module'),
        ('PCB', '电路板', None, 1, 'PCB'),
        ('MEC', '结构件', None, 1, 'Mechanical'),
        ('BAT', '电池', None, 1, 'Battery'),
        ('ANT', '天线', None, 1, 'Antenna'),
        ('SEN', '传感器', None, 1, 'Sensor'),
        ('POW', '电源器件', None, 1, 'Power'),
        ('PRO', '保护器件', None, 1, 'Protection'),
        ('MIS', '杂项', None, 1, 'Miscellaneous'),
        
        # 电阻子类
        ('R-01', '贴片电阻', 'R', 2, 'SMD Resistor'),
        ('R-02', '插件电阻', 'R', 2, 'Through-hole Resistor'),
        ('R-03', '排阻', 'R', 2, 'Resistor Array'),
        ('R-04', '可变电阻', 'R', 2, 'Variable Resistor'),
        ('R-05', '热敏电阻', 'R', 2, 'Thermistor'),
        ('R-06', '压敏电阻', 'R', 2, 'Varistor'),
        
        # 电容子类
        ('C-01', '陶瓷电容', 'C', 2, 'Ceramic Capacitor'),
        ('C-02', '钽电容', 'C', 2, 'Tantalum Capacitor'),
        ('C-03', '铝电解电容', 'C', 2, 'Aluminum Electrolytic'),
        ('C-04', '薄膜电容', 'C', 2, 'Film Capacitor'),
        ('C-05', '超级电容', 'C', 2, 'Super Capacitor'),
        ('C-06', '插件电容', 'C', 2, 'Through-hole Capacitor'),
        
        # 电感子类
        ('L-01', '贴片电感', 'L', 2, 'SMD Inductor'),
        ('L-02', '绕线电感', 'L', 2, 'Wirewound Inductor'),
        ('L-03', '磁珠', 'L', 2, 'Ferrite Bead'),
        ('L-04', '共模电感', 'L', 2, 'Common Mode Choke'),
        ('L-05', '插件电感', 'L', 2, 'Through-hole Inductor'),
        
        # 二极管子类
        ('D-01', '整流二极管', 'D', 2, 'Rectifier Diode'),
        ('D-02', '肖特基二极管', 'D', 2, 'Schottky Diode'),
        ('D-03', '稳压二极管', 'D', 2, 'Zener Diode'),
        ('D-04', 'TVS二极管', 'D', 2, 'TVS Diode'),
        ('D-05', '发光二极管', 'D', 2, 'LED'),
        ('D-06', '快恢复二极管', 'D', 2, 'Fast Recovery Diode'),
        
        # 三极管/MOS子类
        ('Q-01', 'NPN三极管', 'Q', 2, 'NPN Transistor'),
        ('Q-02', 'PNP三极管', 'Q', 2, 'PNP Transistor'),
        ('Q-03', 'N-MOS', 'Q', 2, 'N-Channel MOSFET'),
        ('Q-04', 'P-MOS', 'Q', 2, 'P-Channel MOSFET'),
        ('Q-05', 'IGBT', 'Q', 2, 'IGBT'),
        ('Q-06', '达林顿管', 'Q', 2, 'Darlington Transistor'),
        
        # IC子类
        ('IC-01', 'MCU', 'IC', 2, 'Microcontroller'),
        ('IC-02', 'MPU', 'IC', 2, 'Microprocessor'),
        ('IC-03', '存储器', 'IC', 2, 'Memory'),
        ('IC-04', '电源IC', 'IC', 2, 'Power Management IC'),
        ('IC-05', '接口IC', 'IC', 2, 'Interface IC'),
        ('IC-06', '放大器', 'IC', 2, 'Amplifier'),
        ('IC-07', 'ADC/DAC', 'IC', 2, 'Data Converter'),
        ('IC-08', '射频IC', 'IC', 2, 'RF IC'),
        ('IC-09', '传感器IC', 'IC', 2, 'Sensor IC'),
        ('IC-10', '逻辑IC', 'IC', 2, 'Logic IC'),
        ('IC-11', '时钟IC', 'IC', 2, 'Clock IC'),
        ('IC-12', '驱动IC', 'IC', 2, 'Driver IC'),
        
        # 连接器子类
        ('CON-01', '排针/排母', 'CON', 2, 'Pin Header'),
        ('CON-02', 'USB连接器', 'CON', 2, 'USB Connector'),
        ('CON-03', 'HDMI连接器', 'CON', 2, 'HDMI Connector'),
        ('CON-04', '射频连接器', 'CON', 2, 'RF Connector'),
        ('CON-05', '端子台', 'CON', 2, 'Terminal Block'),
        ('CON-06', 'FPC连接器', 'CON', 2, 'FPC Connector'),
        ('CON-07', '电源连接器', 'CON', 2, 'Power Connector'),
        ('CON-08', '音频连接器', 'CON', 2, 'Audio Connector'),
        ('CON-09', '网络连接器', 'CON', 2, 'Network Connector'),
        ('CON-10', '卡座', 'CON', 2, 'Card Socket'),
        
        # 开关子类
        ('SW-01', '轻触开关', 'SW', 2, 'Tact Switch'),
        ('SW-02', '拨动开关', 'SW', 2, 'Toggle Switch'),
        ('SW-03', '滑动开关', 'SW', 2, 'Slide Switch'),
        ('SW-04', '按键开关', 'SW', 2, 'Push Switch'),
        ('SW-05', '旋转开关', 'SW', 2, 'Rotary Switch'),
        ('SW-06', '微动开关', 'SW', 2, 'Micro Switch'),
    ]
    
    cursor.executemany('''
    INSERT OR IGNORE INTO categories (code, name, parent_code, level, description)
    VALUES (?, ?, ?, ?, ?)
    ''', categories)
    
    conn.commit()
    conn.close()
    print("✅ 物料分类数据初始化完成")

def generate_material_code(category, subcategory):
    """生成新的物料编码"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 查询当前子类的最大序号
    cursor.execute('''
    SELECT MAX(sequence) FROM materials 
    WHERE category = ? AND subcategory = ?
    ''', (category, subcategory))
    
    result = cursor.fetchone()
    max_sequence = result[0] if result[0] else 0
    new_sequence = max_sequence + 1
    
    # 生成物料编码
    material_code = f"{category}-{subcategory}-{new_sequence:05d}-V01"
    
    conn.close()
    return material_code, new_sequence

def add_material(category, subcategory, name, model, specification, 
                 package=None, brand=None, manufacturer_model=None, 
                 lcsc_code=None, unit='PCS', unit_price=None, remarks=None):
    """添加新物料"""
    material_code, sequence = generate_material_code(category, subcategory)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute('''
    INSERT INTO materials (material_code, category, subcategory, sequence, version,
                          name, model, specification, package, brand, manufacturer_model,
                          lcsc_code, unit, unit_price, remarks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ''', (material_code, category, subcategory, sequence, 'V01',
          name, model, specification, package, brand, manufacturer_model,
          lcsc_code, unit, unit_price, remarks))
    
    conn.commit()
    conn.close()
    
    return material_code

def search_materials(keyword=None, category=None, model=None, status=None):
    """搜索物料"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    query = "SELECT * FROM materials WHERE 1=1"
    params = []
    
    if keyword:
        query += " AND (material_code LIKE ? OR name LIKE ? OR model LIKE ? OR specification LIKE ?)"
        params.extend([f"%{keyword}%"] * 4)
    
    if category:
        query += " AND category = ?"
        params.append(category)
    
    if model:
        query += " AND model LIKE ?"
        params.append(f"%{model}%")
    
    if status:
        query += " AND status = ?"
        params.append(status)
    
    query += " ORDER BY material_code"
    
    cursor.execute(query, params)
    results = cursor.fetchall()
    
    # 获取列名
    columns = [description[0] for description in cursor.description]
    
    conn.close()
    
    # 转换为字典列表
    materials = []
    for row in results:
        material = dict(zip(columns, row))
        materials.append(material)
    
    return materials

def get_material_by_code(material_code):
    """按编码查询物料"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM materials WHERE material_code = ?", (material_code,))
    result = cursor.fetchone()
    
    if result:
        columns = [description[0] for description in cursor.description]
        material = dict(zip(columns, result))
    else:
        material = None
    
    conn.close()
    return material

def update_material(material_code, **kwargs):
    """更新物料信息"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # 构建更新语句
    fields = []
    values = []
    for key, value in kwargs.items():
        fields.append(f"{key} = ?")
        values.append(value)
    
    values.append(material_code)
    
    query = f"UPDATE materials SET {', '.join(fields)}, updated_at = CURRENT_TIMESTAMP WHERE material_code = ?"
    cursor.execute(query, values)
    
    conn.commit()
    conn.close()
    
    return cursor.rowcount > 0

def export_to_json(output_path):
    """导出所有物料到JSON"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    cursor.execute("SELECT * FROM materials ORDER BY material_code")
    results = cursor.fetchall()
    columns = [description[0] for description in cursor.description]
    
    materials = []
    for row in results:
        material = dict(zip(columns, row))
        materials.append(material)
    
    conn.close()
    
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(materials, f, ensure_ascii=False, indent=2)
    
    return output_path

def import_from_json(json_path):
    """从JSON导入物料"""
    with open(json_path, 'r', encoding='utf-8') as f:
        materials = json.load(f)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    count = 0
    for material in materials:
        try:
            cursor.execute('''
            INSERT OR IGNORE INTO materials 
            (material_code, category, subcategory, sequence, version, name, model,
             specification, package, brand, manufacturer_model, lcsc_code, unit,
             unit_price, status, remarks)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                material.get('material_code'),
                material.get('category'),
                material.get('subcategory'),
                material.get('sequence', 0),
                material.get('version', 'V01'),
                material.get('name'),
                material.get('model'),
                material.get('specification'),
                material.get('package'),
                material.get('brand'),
                material.get('manufacturer_model'),
                material.get('lcsc_code'),
                material.get('unit', 'PCS'),
                material.get('unit_price'),
                material.get('status', '在用'),
                material.get('remarks')
            ))
            count += 1
        except Exception as e:
            print(f"导入失败: {material.get('material_code')} - {e}")
    
    conn.commit()
    conn.close()
    
    return count

# 测试代码
if __name__ == "__main__":
    # 初始化数据库
    init_database()
    init_categories()
    
    # 添加示例物料
    print("\n添加示例物料:")
    
    # 电阻
    code1 = add_material('R', '01', '贴片电阻', '10K 0402', 
                        '10KΩ ±1% 1/16W SMD 0402', '0402', 'Yageo', 
                        'RC0402FR-0710KL', 'C10001', 'PCS', 0.01)
    print(f"✅ 添加: {code1}")
    
    code2 = add_material('R', '01', '贴片电阻', '100K 0402',
                        '100KΩ ±1% 1/16W SMD 0402', '0402', 'Yageo',
                        'RC0402FR-07100KL', 'C10002', 'PCS', 0.01)
    print(f"✅ 添加: {code2}")
    
    # 电容
    code3 = add_material('C', '01', '陶瓷电容', '100nF 0402',
                        '100nF ±10% 16V X7R SMD 0402', '0402', 'Murata',
                        'GRM155R71C104KA88D', 'C10003', 'PCS', 0.02)
    print(f"✅ 添加: {code3}")
    
    # IC
    code4 = add_material('IC', '01', 'MCU', 'STM32F103C8T6',
                        'ARM Cortex-M3 72MHz 64KB Flash 20KB RAM', 'LQFP48', 'ST',
                        'STM32F103C8T6', 'C10004', 'PCS', 2.5)
    print(f"✅ 添加: {code4}")
    
    # 搜索测试
    print("\n搜索测试:")
    results = search_materials(keyword='10K')
    for r in results:
        print(f"  找到: {r['material_code']} - {r['name']} - {r['model']}")
    
    # 导出测试
    export_path = export_to_json('/tmp/materials_export.json')
    print(f"\n✅ 导出到: {export_path}")
    
    print("\n数据库初始化完成！")
    print(f"数据库路径: {DB_PATH}")
