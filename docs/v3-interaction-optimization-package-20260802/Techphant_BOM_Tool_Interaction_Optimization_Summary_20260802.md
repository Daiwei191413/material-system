# 技象科技 BOM 整理神器交互记录与优化内容汇总

整理日期：2026-08-02

## 1. 整理范围
- 本包基于当前 Codex 对话上下文、本地仓库、Git 提交记录、既有 docs 文档、CloudBase 迁移说明和 rollout 摘要整理。
- 本包不是平台原始逐字聊天导出；重点保留需求、决策、优化项、部署状态和后续注意事项。
- 按安全边界处理：不写入明文密码、Secret、Token、数据库密码。
- 登录页样式、账号密码细节、Cloudflare 国内网络登录失败等登录链路内容不做展开，除非它影响功能边界。

## 2. 当前项目与部署状态
| 项目 | 当前值 | 说明 |
| --- | --- | --- |
| 仓库 | `Daiwei191413/material-system` | 本地路径 `D:\Users\Administrator\Documents\开发助手\material-system` |
| 分支 | `v3-rework` | Cloudflare Pages 绑定生产分支 |
| 国内版 | V1.0.14 | https://techphant-bom-v3-d9e3pqqb0b46c88-1363491993.tcloudbaseapp.com/ |
| 海外版 | V3.0.38 | https://techphant-bom-tools-v3.pages.dev/ |
| CloudBase 环境 | `techphant-bom-v3-d9e3pqqb0b46c88` | 国内静态托管、API、LCSC 代理 |

## 3. 功能模块定位
| 模块 | 定位 | 使用场景 |
| --- | --- | --- |
| 物料库管理 | 团队共享物料库维护入口，含标准库和立创库两个独立库。 | 管理员导入、导出、清空、维护；成员只读取。 |
| 标准库 | 公司线下 BOM 格式物料库，字段更完整，可包含部分立创编码。 | 用于把立创 BOM 按线下 BOM 模板整理成公司内部线下格式。 |
| 立创库 | 原理图转立创 BOM 的映射库，仅保留型号、封装、嘉立创元件编号。 | 用于原理图 BOM 转嘉立创 4 列下单 BOM；导入时 Designator 不入库。 |
| 原理图转立创BOM | 读取原理图 BOM，结合立创库和线上搜索生成嘉立创 BOM。 | 输出 Comment、Designator、Footprint、嘉立创元件编号，并提供映射/校验报告。 |
| BOM对比及转线下BOM | 上传线下 BOM 参考模板和立创 BOM，先对比，再按线下模板输出。 | BOM A 决定线下输出格式；BOM B 是需要整理的立创 BOM。 |
| 线下BOM对比 | 独立的两份公司线下 BOM 差异对比，不调用物料库。 | 适合版本差异、替代料、同位号不同品牌/型号等场景。 |
| BOM成本评估 | 按立创编号抓取立创商城价格阶梯，默认按 1000 套估算。 | 用于新品初期物料成本预估和报价参考，不修改物料库。 |

## 4. 交互与优化主线
| 阶段 | 用户需求/问题 | 处理结果 |
| --- | --- | --- |
| 环境与权限准备 | 安装 Anthropic skills，并要求以后安装内容放 D 盘。 | 12 个技能安装到 D:\Users\Administrator\.codex\skills，C 盘技能目录作为兼容入口；后续交付物默认放 D 盘项目目录。 |
| 平台绑定 | 确认 GitHub 仓库和 Cloudflare 权限，建议绑定 v3-rework。 | 确认仓库 Daiwei191413/material-system，Cloudflare Pages 项目 techphant-bom-tools-v3 绑定 production branch v3-rework。 |
| 历史资料整理 | 读取 Telegram 导出的前期开发记录。 | 提取为 V3 后续优化依据，形成早期 docs/v3-non-login-optimization-record.md。 |
| V3 体检 | 先对 V3 做体检，Secret/历史密钥/JLC 明文密钥保持用户指定状态。 | 完成结构性检查；安全项按用户决定不做进一步迁移或删除。 |
| 物料库命名 | 把“物料编码”改成“物料库管理”，版本升级。 | 顶部功能和模块标题改为物料库管理，版本从 V3.0.1 进入 V3.0.2 后续序列。 |
| 双库定位 | 明确标准库与立创库用途，并排查成员看不到管理员上传库。 | 确认为两个独立库：标准库用于立创转线下，立创库用于原理图转立创；云端共享、成员读取。 |
| 清空库修复 | 清空当前库不生效、刷新又回来，且库类型参数报错。 | 清空动作按 standard/lcsc 当前库类型路由；避免本地缓存把云端清空结果恢复。 |
| 数据丢失修复 | 管理员导入 860+ 标准库和 190+ 立创库后刷新数量随机变少。 | 修复批量导入、去重键、云端写入和本地整库回传问题；双库刷新数量稳定。 |
| 顶部 UI | 右上角 Logo/标语与管理员、登出区域重叠。 | 调整顶部标语和账号区域间距，保持原视觉风格。 |
| 对比模块命名 | 把“BOM对比”改为“BOM对比及转线下BOM”。 | 顶部按钮和模块标题统一改名，突出该模块包含线下 BOM 输出。 |
| 上传区语义 | BOM A/B 名称从基准/对比改为线下参考模板/立创 BOM。 | BOM A 改为“线下BOM参考模版”，BOM B 改为“立创BOM”，并更新上传说明。 |
| 文案优化 | 使用流程第 2 步按业务真实流程重新写。 | 改为在 BOM 对比及转线下 BOM 页上传 BOM A 和 BOM B，A 用作线下输出格式参考，B 是需要对比并整理的立创 BOM。 |
| 功能精简 | 去掉“按B格式整理A”。 | 移除反向整理按钮，只保留“按线下BOM模板整理立创BOM”。 |
| 操作入口前置 | 对比配置和操作按钮能否放外面，不要点对比后才出现。 | 对比配置和主要操作按钮提前显示；条件不足时按钮禁用并提示。 |
| 原理图转换命名 | “转嘉立创”改为“原理图转立创BOM”。 | 顶部按钮和功能区标题同步改为“原理图转立创BOM”。 |
| 国内部署 | Cloudflare 国内访问受阻，迁移国内 CloudBase。 | 创建 CloudBase 国内版目录和部署链路：静态托管、HTTP 云函数 API、LCSC 代理、PostgreSQL 数据库；Cloudflare 海外版保持可用。 |
| 成员管理 | 成员新增/删除不稳定，需要刷新几次才出现。 | 优化创建/删除后返回最新用户列表并刷新前端状态；国内版先修复，海外版同步修复。 |
| 成员权限 | 成员上传 BOM A 会自动把新物料导入标准库，不允许。 | 限制 BOM A 自动入库仅管理员可触发；成员仅做整理和对比。 |
| 上传按钮初始化 | 第一次登录后选择文件按钮无反应，刷新后才好。 | 修复登录后面板重渲染与文件 input 事件绑定顺序问题，两个版本同步。 |
| 导出与颜色 | 原理图转立创导出文件名用原文件名把“原理图”替换成“嘉立创”；清空按钮改红色。 | JLC 导出文件名按原始 Excel 名称替换；物料库清空当前库按钮改为红色。 |
| 版本策略 | 国内 CloudBase 首次部署后版本从 V1.0.0 开始。 | 国内版显示 V1.0.x，海外版继续 V3.0.x；代码功能保持同步。 |
| 物料库导出权限 | 导出当前库没反应，且库只有管理员有权限。 | 导出接口和前端导出动作限制为管理员；成员不显示或不可执行写库/导出库动作。 |
| 成员同步提示 | 成员登录提示“云端同步失败：无权限”。 | 保留成员读取库能力，避免因无写权限触发误导性同步失败提示。 |
| 线下BOM对比 | 增加两份公司线下 BOM 相互对比，且不调用物料库。 | 新增独立“线下BOM对比”模块；后续围绕替代料场景优化同位号不同品牌/型号的差异展示。 |
| 国内 LCSC 搜索 | 国内版立创搜索返回 HTML，不是 JSON；海外版正常。 | 调整国内 CloudBase LCSC 代理链路，避免请求落到静态页导致 JSON 解析失败。 |
| 品牌策略 | 电容搜索新增国巨，顺序村田、国巨、风华、三星；电阻常用厚声和国巨。 | 优化立创搜索品牌优先级和筛选策略；库内常用料优先于线上搜索。 |
| 转换校验 | 原理图转立创 BOM 出现 22pF 0805 匹配到 0402 编码等严重错误。 | 建立更严格的官方详情校验和转换审计：被动器件必须型号/容值/阻值/电感值与封装一致，异常进入待确认或隔离。 |
| 立创库导入 | 导入立创库只保留 Comment、Footprint、嘉立创元件编号，不要 Designator。 | 导入逻辑忽略 Designator，新增/完善导入隔离清单用于确认未入库记录。 |
| 成本评估 | 增加立创 BOM 和线下 BOM 按 1000 量抓立创单价并统计成本。 | 新增独立“BOM成本评估”模块，按立创编号查询价格阶梯；缺编号时只从现有库匹配，不写库。 |
| 封装/未匹配确认 | 封装不一致和未匹配不应强制阻止导出，应由使用者确认。 | 封装不一致可人工确认使用；未匹配器件可经确认后空编号导出，并保留提示和校验报告。 |
| 未匹配一键拉取 | 未匹配能否一键拉取。 | 新增“未匹配一键拉取”：唯一严格候选且有库存时自动填充，多候选/无库存/品牌不确定仍交给人工。 |
| 最新匹配规则 | 电容/电阻/电感需型号+封装一致，其它器件以型号为主提取立创编码。 | 国内 V1.0.14、海外 V3.0.38 同步：C/R/L/磁珠严格型号+封装，其它器件支持型号优先匹配；GDT 等非被动器件可按型号匹配。 |

## 5. 版本/优化记录
| 版本 | 类型 | 内容 |
| --- | --- | --- |
| V3.0.0 | 团队版基础 | 登录/权限/共享物料库基础框架。 |
| V3.0.1 | 权限与代理 | 补全权限矩阵，修复 LCSC proxy CORS。 |
| V3.0.2 | 命名 | “物料编码”改为“物料库管理”。 |
| V3.0.3-V3.0.7 | 物料库 | 修复共享、清空、standard/lcsc 参数和双库隔离。 |
| V3.0.8-V3.0.11 | 导入稳定性 | 修复大批量导入刷新后数量随机减少。 |
| V3.0.13-V3.0.21 | BOM 对比文案/UI | 重命名 BOM 对比模块、BOM A/B、上传说明，移除反向整理，前置操作区。 |
| V3.0.22-V3.0.25 | 操作问题修复 | 修复成员管理、BOM A 自动入库权限、首次上传按钮、JLC 导出文件名、清空按钮颜色、库导出权限。 |
| V1.0.0 起 | 国内版版本线 | CloudBase 国内版采用 V1.0.x；海外 Cloudflare 继续 V3.0.x。 |
| V1.0.1 | 成员同步 | 成员只读同步，不再因无写权限误报云端同步失败。 |
| V1.0.14 / V3.0.38 | 最新匹配与部署 | 被动器件严格型号+封装，其它器件型号优先；国内/海外均已更新。 |

## 6. 已确认产品规则
- 标准库与立创库必须独立，互不导入、互不清空、互不覆盖。
- 物料库导入、删除、清空、导出只允许管理员；成员用于读取库、转换、对比和导出业务 BOM。
- BOM A 自动入库前期仅允许管理员触发；成员上传 BOM A 不能写入标准库。
- Cloudflare 海外版要保持当前可用状态；CloudBase 国内版作为国内同事访问入口。
- CloudBase 默认域名不便修改；更好记的正式域名需要购买自有域名并完成解析/备案等流程。
- CloudBase 默认域名可能出现风险提醒，通常需要自有域名和平台信任配置才能根本消除。
- 不在文档中保存明文密码、Secret、Token、数据库密码。

## 7. 后续建议
- 用 2-3 份真实 BOM 建立回归样例：电容/电阻/电感封装不一致必须拦住；GDT/连接器等非被动器件可型号优先匹配。
- 为“线下BOM对比”的替代料场景增加更清楚的一眼识别视图：同位号、旧料、新料、品牌/型号/参数变化。
- 为“BOM成本评估”保留价格抓取时间、价格阶梯和未计价原因，避免报价时误用过期价格。
- 后续若上正式域名，建议把国内版域名、CloudBase API、静态托管、风险提示统一纳入部署检查清单。
- 每次优化继续递增版本，并同步更新国内/海外两套版本说明，避免现场试用时混淆。

## 8. Git 提交摘录
```text
fdb0e88 (HEAD -> v3-rework, origin/v3-rework) feat(v3): add offline BOM compare module
1f44070 fix(v3): let members sync libraries read-only
23d9585 fix(v3): restrict material library export
68c195e fix(v3): polish jlc export filename and clear button
826ccfb fix(v3): restore bom upload controls after login
26a04f1 chore(v3): restrict bom a auto import to admins
56648c2 chore(v3): harden member management refresh
17976c4 chore(v3): clarify compare upload workflow copy
bd8bd9b chore(v3): rename schematic to lcsc nav
1206720 chore(v3): show compare actions before running compare
9bc4bc0 chore(v3): remove reverse bom formatting action
1e2399f chore(v3): update lcsc bom upload copy
f655d3d chore(v3): clarify lcsc bom upload prompt
ff54b10 chore(v3): refine bom workflow ui copy
026af62 chore(v3): clarify compare bom labels
b3ceb55 chore(v3): rename compare nav action
1657fd2 fix(v3): refresh admin controls after login
f78df27 fix(v3): batch material library imports
2c93572 fix(v3): make library imports deterministic
0d2af9d fix(v3): isolate material libraries
1809344 style(v3): reposition top slogan
21cd6fe style(v3): adjust top bar spacing
4a8c0e0 fix(v3): route clear library before item operations
ab13d07 fix(v3): prevent cloud sync from restoring cleared libraries
3c8fcbf fix(v3): normalize active library before clearing
71c474a fix(v3): clear cloud library from material manager
3fe2cf4 fix(v3): share standard library without lcsc code
c230f0d chore(v3): bump to V3.0.2 and rename material tab
4e2b4e0 docs: remove JLC secrets from EdgeOne guide
981ef3b fix(v3): scheduleSync 守卫从 canWrite 收紧到 isAdmin（第三层防线）
178b69e chore(v3): 版本号 V3.0.0 → V3.0.1（patch：权限矩阵补完整 + lcsc-proxy CORS 修复）
1ffd52c feat(v3): 三级权限矩阵落地——admin 写双库、member 只整理对比、readonly 只读
6c54b68 (tag: v3.0.0) feat(v3): V3.0.0 团队版 - 登录/权限/共享物料库
06bb5e5 (origin/v2-dev) v2: save current state before v3 branch
2d5c718 V2.1.8-fix2: Worker _extracted字段增加电感值/容差/温度系数映射，修复电感参数提取失败
c6c309d V2.1.8-fix: COG/NP0材质电容缺精度时自动推断，避免参数描述不完整
24d00d8 V2.1.8: 立创API返回_extracted字段，前端优先用真实参数组装描述，替代autoDescribe硬编码
ee5412f V2.1.7: 按A整理B时库未命中的电容/电阻自动兜底生成名称+描述
0d00bdb chore: bump version V2.1.5 -> V2.1.6 (title/h1/panel/footer)
d1c83db V2.1.6: 物料库表格加'删除'按钮，支持删除单条记录
669d910 V2.1.5: 双库分离（立创库 / 标准库），导入自动识别 + 匹配分流
286d37f fix(v2.1.4): 物料库导入去重改为字段完整度优先，修复残缺记录永久占位 BUG
ea72f23 perf(v2.1.3): 物料库表格显示上限 500→5000，提取为 DISPLAY_LIMIT 常量
ab95971 fix(v2.1.2): 表格序号改为按列表位置生成，修复合并BOM后序号混乱
28026cf fix(v2.1.1): 修复物料库导入两个 BUG
```
