# 物料编码规则设计文档

## 1. 编码规则概述

### 编码格式
```
[大类]-[子类]-[序号]-[版本]
```

**示例：**
- `R-01-00001-V01` → 电阻类-贴片电阻-第1号-版本1
- `C-01-00001-V01` → 电容类-陶瓷电容-第1号-版本1
- `IC-01-00001-V01` → IC类-MCU-第1号-版本1

### 编码长度
- 总长度：15-20位
- 格式：X-XX-XXXXX-VXX

---

## 2. 大类分类（第1位）

| 代码 | 大类名称 | 说明 |
|------|---------|------|
| R | 电阻器 | Resistor |
| C | 电容器 | Capacitor |
| L | 电感器 | Inductor |
| D | 二极管 | Diode |
| Q | 三极管/MOS | Transistor |
| IC | 集成电路 | Integrated Circuit |
| CON | 连接器 | Connector |
| SW | 开关 | Switch |
| LED | 发光二极管 | LED |
| CRY | 晶振 | Crystal |
| FIL | 滤波器 | Filter |
| MOD | 模块 | Module |
| PCB | 电路板 | PCB |
| MEC | 结构件 | Mechanical |
| BAT | 电池 | Battery |
| ANT | 天线 | Antenna |
| SEN | 传感器 | Sensor |
| POW | 电源器件 | Power |
| PRO | 保护器件 | Protection |
| MIS | 杂项 | Miscellaneous |

---

## 3. 子类分类（第2-3位）

### 3.1 电阻器 (R)

| 代码 | 子类名称 | 说明 |
|------|---------|------|
| 01 | 贴片电阻 | SMD Resistor |
| 02 | 插件电阻 | Through-hole Resistor |
| 03 | 排阻 | Resistor Array |
| 04 | 可变电阻 | Variable Resistor |
| 05 | 热敏电阻 | Thermistor |
| 06 | 压敏电阻 | Varistor |

### 3.2 电容器 (C)

| 代码 | 子类名称 | 说明 |
|------|---------|------|
| 01 | 陶瓷电容 | Ceramic Capacitor |
| 02 | 钽电容 | Tantalum Capacitor |
| 03 | 铝电解电容 | Aluminum Electrolytic |
| 04 | 薄膜电容 | Film Capacitor |
| 05 | 超级电容 | Super Capacitor |
| 06 | 插件电容 | Through-hole Capacitor |

### 3.3 电感器 (L)

| 代码 | 子类名称 | 说明 |
|------|---------|------|
| 01 | 贴片电感 | SMD Inductor |
| 02 | 绕线电感 | Wirewound Inductor |
| 03 | 磁珠 | Ferrite Bead |
| 04 | 共模电感 | Common Mode Choke |
| 05 | 插件电感 | Through-hole Inductor |

### 3.4 二极管 (D)

| 代码 | 子类名称 | 说明 |
|------|---------|------|
| 01 | 整流二极管 | Rectifier Diode |
| 02 | 肖特基二极管 | Schottky Diode |
| 03 | 稳压二极管 | Zener Diode |
| 04 | TVS二极管 | TVS Diode |
| 05 | 发光二极管 | LED |
| 06 | 快恢复二极管 | Fast Recovery Diode |

### 3.5 三极管/MOS (Q)

| 代码 | 子类名称 | 说明 |
|------|---------|------|
| 01 | NPN三极管 | NPN Transistor |
| 02 | PNP三极管 | PNP Transistor |
| 03 | N-MOS | N-Channel MOSFET |
| 04 | P-MOS | P-Channel MOSFET |
| 05 | IGBT | IGBT |
| 06 | 达林顿管 | Darlington Transistor |

### 3.6 集成电路 (IC)

| 代码 | 子类名称 | 说明 |
|------|---------|------|
| 01 | MCU | Microcontroller |
| 02 | MPU | Microprocessor |
| 03 | 存储器 | Memory |
| 04 | 电源IC | Power Management IC |
| 05 | 接口IC | Interface IC |
| 06 | 放大器 | Amplifier |
| 07 | ADC/DAC | Data Converter |
| 08 | 射频IC | RF IC |
| 09 | 传感器IC | Sensor IC |
| 10 | 逻辑IC | Logic IC |
| 11 | 时钟IC | Clock IC |
| 12 | 驱动IC | Driver IC |

### 3.7 连接器 (CON)

| 代码 | 子类名称 | 说明 |
|------|---------|------|
| 01 | 排针/排母 | Pin Header |
| 02 | USB连接器 | USB Connector |
| 03 | HDMI连接器 | HDMI Connector |
| 04 | 射频连接器 | RF Connector |
| 05 | 端子台 | Terminal Block |
| 06 | FPC连接器 | FPC Connector |
| 07 | 电源连接器 | Power Connector |
| 08 | 音频连接器 | Audio Connector |
| 09 | 网络连接器 | Network Connector |
| 10 | 卡座 | Card Socket |

### 3.8 开关 (SW)

| 代码 | 子类名称 | 说明 |
|------|---------|------|
| 01 | 轻触开关 | Tact Switch |
| 02 | 拨动开关 | Toggle Switch |
| 03 | 滑动开关 | Slide Switch |
| 04 | 按键开关 | Push Switch |
| 05 | 旋转开关 | Rotary Switch |
| 06 | 微动开关 | Micro Switch |

---

## 4. 序号规则（第4-8位）

### 序号格式
- 5位数字，从00001开始
- 按录入顺序递增
- 每个子类独立编号

### 示例
- R-01-00001 → 第一个贴片电阻
- R-01-00002 → 第二个贴片电阻
- C-01-00001 → 第一个陶瓷电容（与电阻独立编号）

---

## 5. 版本规则（第9-11位）

### 版本格式
- V + 2位数字
- V01 = 版本1
- V02 = 版本2（替代版本）

### 版本升级规则
1. **V01**：初始版本
2. **V02**：替代版本（停产、升级等）
3. 版本升级时，原版本标记为"已停用"

---

## 6. 完整编码示例

| 物料编码 | 物料名称 | 型号 | 说明 |
|---------|---------|------|------|
| R-01-00001-V01 | 贴片电阻 | 10K 0402 | 10KΩ ±1% 0402 |
| R-01-00002-V01 | 贴片电阻 | 100K 0402 | 100KΩ ±1% 0402 |
| C-01-00001-V01 | 陶瓷电容 | 100nF 0402 | 100nF ±10% 16V X7R |
| C-01-00002-V01 | 陶瓷电容 | 10uF 0603 | 10uF ±20% 6.3V X5R |
| IC-01-00001-V01 | MCU | STM32F103C8T6 | ARM Cortex-M3 |
| CON-01-00001-V01 | 排针 | 2.54mm 1x40P | 单排直针 |
| CON-03-00001-V01 | Type-C | USB-C 16P | 贴片式 |

---

## 7. 编码管理规范

### 7.1 新增物料流程
1. 确认物料分类（大类→子类）
2. 查询是否已存在相同物料
3. 分配新序号
4. 录入物料信息
5. 生成物料编码

### 7.2 物料信息字段

```json
{
  "物料编码": "R-01-00001-V01",
  "物料名称": "贴片电阻",
  "型号": "10K 0402",
  "规格参数": "10KΩ ±1% 1/16W SMD 0402",
  "封装": "0402",
  "品牌": "Yageo",
  "制造商型号": "RC0402FR-0710KL",
  "立创编号": "C10001",
  "单位": "PCS",
  "单价": 0.01,
  "最小包装": 10000,
  "库存数量": 50000,
  "安全库存": 10000,
  "状态": "在用",
  "替代物料": "R-01-00001-V02",
  "备注": "常用物料"
}
```

### 7.3 物料状态

| 状态 | 说明 |
|------|------|
| 在用 | 正常使用中 |
| 停用 | 不再使用 |
| 待验证 | 新物料，待验证 |
| 替代 | 已被替代 |
| 缺货 | 暂时缺货 |

---

## 8. 查询规则

### 8.1 按编码查询
- 精确查询：R-01-00001-V01
- 模糊查询：R-01-*（所有贴片电阻）

### 8.2 按型号查询
- 支持型号模糊匹配
- 支持参数范围查询

### 8.3 按分类查询
- 大类查询：所有电阻 R-*
- 子类查询：所有贴片电阻 R-01-*

---

## 9. 实施建议

### 9.1 第一阶段（1周）
- [ ] 确定编码规则
- [ ] 建立物料分类体系
- [ ] 创建物料编码数据库

### 9.2 第二阶段（2周）
- [ ] 录入现有物料
- [ ] 生成物料编码
- [ ] 建立查询系统

### 9.3 第三阶段（1周）
- [ ] 集成到BOM工具
- [ ] 培训使用人员
- [ ] 建立维护流程

---

## 10. 数据库设计

### 10.1 物料主表 (materials)

```sql
CREATE TABLE materials (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_code VARCHAR(20) UNIQUE NOT NULL,  -- 物料编码
    category VARCHAR(10) NOT NULL,               -- 大类
    subcategory VARCHAR(10) NOT NULL,            -- 子类
    sequence INTEGER NOT NULL,                   -- 序号
    version VARCHAR(5) NOT NULL,                 -- 版本
    name VARCHAR(100) NOT NULL,                  -- 物料名称
    model VARCHAR(100),                          -- 型号
    specification TEXT,                          -- 规格参数
    package VARCHAR(50),                         -- 封装
    brand VARCHAR(50),                           -- 品牌
    manufacturer_model VARCHAR(100),             -- 制造商型号
    lcsc_code VARCHAR(50),                       -- 立创编号
    unit VARCHAR(10) DEFAULT 'PCS',              -- 单位
    unit_price DECIMAL(10,4),                    -- 单价
    moq INTEGER DEFAULT 1,                       -- 最小起订量
    stock_quantity INTEGER DEFAULT 0,            -- 库存数量
    safety_stock INTEGER DEFAULT 0,              -- 安全库存
    status VARCHAR(20) DEFAULT '在用',           -- 状态
    replacement_code VARCHAR(20),                -- 替代物料编码
    remarks TEXT,                                -- 备注
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 10.2 物料分类表 (categories)

```sql
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code VARCHAR(10) UNIQUE NOT NULL,            -- 分类代码
    name VARCHAR(50) NOT NULL,                   -- 分类名称
    parent_code VARCHAR(10),                     -- 父分类代码
    level INTEGER DEFAULT 1,                     -- 层级
    description TEXT,                            -- 描述
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 10.3 BOM表 (boms)

```sql
CREATE TABLE boms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bom_code VARCHAR(50) NOT NULL,               -- BOM编号
    project_name VARCHAR(100),                   -- 项目名称
    board_name VARCHAR(100),                     -- 板卡名称
    board_model VARCHAR(100),                    -- 板卡型号
    version VARCHAR(10),                         -- BOM版本
    material_count INTEGER DEFAULT 0,            -- 物料数量
    created_by VARCHAR(50),                      -- 创建人
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 10.4 BOM明细表 (bom_details)

```sql
CREATE TABLE bom_details (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    bom_id INTEGER NOT NULL,                     -- BOM ID
    material_code VARCHAR(20) NOT NULL,          -- 物料编码
    designator VARCHAR(200),                     -- 位号
    quantity INTEGER DEFAULT 1,                    -- 数量
    unit VARCHAR(10) DEFAULT 'PCS',              -- 单位
    remarks TEXT,                                -- 备注
    FOREIGN KEY (bom_id) REFERENCES boms(id),
    FOREIGN KEY (material_code) REFERENCES materials(material_code)
);
```

---

## 11. 使用示例

### 11.1 新增物料
```sql
INSERT INTO materials (material_code, category, subcategory, sequence, version, name, model, specification, package, brand, lcsc_code)
VALUES ('R-01-00001-V01', 'R', '01', 1, 'V01', '贴片电阻', '10K 0402', '10KΩ ±1% 1/16W SMD 0402', '0402', 'Yageo', 'C10001');
```

### 11.2 查询物料
```sql
-- 按编码查询
SELECT * FROM materials WHERE material_code = 'R-01-00001-V01';

-- 按分类查询所有电阻
SELECT * FROM materials WHERE category = 'R';

-- 按型号模糊查询
SELECT * FROM materials WHERE model LIKE '%10K%';
```

### 11.3 创建BOM
```sql
-- 创建BOM头
INSERT INTO boms (bom_code, project_name, board_name, version)
VALUES ('BOM-2024-001', '智能门锁项目', '主控板', 'V1.0');

-- 添加BOM明细
INSERT INTO bom_details (bom_id, material_code, designator, quantity)
VALUES (1, 'R-01-00001-V01', 'R1,R2,R3', 3);
```

---

## 12. 注意事项

1. **编码唯一性**：物料编码必须全局唯一
2. **版本管理**：替代物料使用新版本号
3. **状态管理**：停用物料保留编码但不使用
4. **数据备份**：定期备份物料数据库
5. **权限管理**：限制编码生成权限

---

*文档版本：V1.0*
*创建日期：2024-01-15*
*维护人员：硬件工程部*
