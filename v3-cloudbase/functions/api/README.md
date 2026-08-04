# V3 CloudBase HTTP 云函数 API

这是国内 CloudBase 版后端 API 骨架，目标是替代海外版 `v3-legacy/worker/worker.js`，但不影响现在线上 Cloudflare V3。

## 控制台创建建议

- 类型：HTTP 云函数
- 运行时：Node.js 18.x 或更高
- 部署方式：本地上传文件夹
- 上传目录：`v3-cloudbase/functions/api`
- 自动安装依赖：开启
- 监听端口：`9000`

CloudBase 官方 Express 示例要求 HTTP 云函数监听 `9000` 端口，并通过 `scf_bootstrap` 启动。

## 必填环境变量

```text
PGHOST=172.17.0.6
PGPORT=5432
PGDATABASE=postgres
PGUSER=bom_admin
PGPASSWORD=你的 CloudBase PostgreSQL 密码
JWT_SECRET=一串足够长的随机字符串
ALLOWED_ORIGINS=https://你的静态网站托管域名,http://localhost:9000
```

## 暂留事项

`/api/lcsc` 和 `/v3/lcsc/batch` 目前只保留了代理入口。若暂时要沿用旧 Cloudflare 立创代理，可设置：

```text
LCSC_PROXY_FALLBACK=https://lcsc-proxy.steidleyestephani737.workers.dev
```

真正国内化时，应把 `cloudflare-worker/worker.js` 的立创签名和缓存逻辑迁到本函数，或单独创建 CloudBase 版立创代理函数。
