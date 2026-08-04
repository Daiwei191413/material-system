# V3 CloudBase 国内版迁移检查清单

## 已确认环境

- CloudBase 环境：`techphant-bom-v3`
- 地域：上海
- PostgreSQL：已创建，版本 PostgreSQL 17.10
- 静态网站托管：已开通，有默认域名
- 云函数：已开通，可创建 HTTP 云函数

## 不影响项

- 不改 `v3-legacy/` 的线上 Cloudflare V3 主代码。
- 不改 Cloudflare Pages 配置。
- 不改 Cloudflare Worker。
- 不动原 Cloudflare D1 数据库。

## 待执行步骤

1. 在 CloudBase PostgreSQL SQL 窗口执行：
   `v3-cloudbase/db/schema.sql`

2. 创建 HTTP 云函数：
   上传目录 `v3-cloudbase/functions/api`

3. 配置云函数环境变量：
   - `PGHOST`
   - `PGPORT`
   - `PGDATABASE`
   - `PGUSER`
   - `PGPASSWORD`
   - `JWT_SECRET`
   - `ALLOWED_ORIGINS`

4. 验证 API：
   - `/health`
   - `/v3/health`

5. 设置正式 admin 密码：
   - 方式 A：后续写一次性 bootstrap 脚本
   - 方式 B：先用 SQL 写入正式 PBKDF2 hash
   - 方式 C：临时开放受控重置流程

6. 上传前端：
   `v3-cloudbase/web/index.html`

7. 确认前端 API 地址：
   - 若 CloudBase 静态托管能同域路由到 HTTP 云函数，保留 `/v3`
   - 若不能同域，改为 HTTP 云函数完整地址

8. 迁移立创查询代理：
   - 临时方案：设置 `LCSC_PROXY_FALLBACK` 指向旧 Cloudflare 代理
   - 完整国内方案：迁移 `cloudflare-worker/worker.js` 的 JLC 签名查询逻辑到 CloudBase

## 第一轮验证建议

先不要导入真实大库，建议用小样本验证：

1. 创建或重置管理员密码。
2. 登录国内版。
3. 导入 2 条标准库。
4. 导入 2 条立创库。
5. 刷新页面确认数量不丢。
6. 清空标准库，确认立创库不受影响。
7. 清空立创库，确认标准库不受影响。
8. 上传一组小 BOM 做对比和线下整理导出。
