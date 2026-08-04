# V3 CloudBase 国内版迁移骨架

此目录是 V3 BOM 工具国内 CloudBase 版的独立迁移骨架。它不会影响现有 Cloudflare V3 线上版本。

## 目录结构

```text
v3-cloudbase/
  web/
    index.html                  # 国内版前端副本，API 默认指向同域 /v3
  functions/
    api/
      index.js                  # CloudBase HTTP 云函数 Express API
      package.json
      scf_bootstrap
      .env.example
      README.md
  db/
    schema.sql                  # CloudBase PostgreSQL 建表脚本
  docs/
```

## 当前迁移边界

- Cloudflare V3 保持原样，仍在 `v3-legacy/`。
- CloudBase 国内版前端从 `v3-cloudbase/web/index.html` 上传到静态网站托管。
- CloudBase 国内版 API 从 `v3-cloudbase/functions/api` 创建 HTTP 云函数。
- CloudBase 国内版数据库使用 `v3-cloudbase/db/schema.sql`。

## 部署顺序建议

1. 在 CloudBase PostgreSQL 的 SQL 窗口执行 `db/schema.sql`。
2. 创建 HTTP 云函数，上传 `functions/api`。
3. 配置云函数环境变量。
4. 先访问 `/health` 或 `/v3/health` 验证 API。
5. 通过 `/v3/users/reset-password` 或临时 SQL 设置正式 admin 密码。
6. 上传 `web/index.html` 到静态网站托管。
7. 配置静态网站访问到 HTTP 云函数的路由或把 `WORKER_BASE` 改为完整 HTTP API 地址。

## 注意

CloudBase HTTP API 和静态网站是否能同域访问，需要以后按控制台实际 HTTP 访问服务配置确认。如果不能同域，修改 `web/index.html` 里的 `WORKER_BASE` 为 CloudBase HTTP 云函数完整访问地址即可。
