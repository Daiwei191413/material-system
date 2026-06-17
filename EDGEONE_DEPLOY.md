# EdgeOne Pages 部署指引（V2.1.0-dev）

> 本工程在 V2.1.0 把后端从 Cloudflare Workers 搬到了腾讯云 EdgeOne Pages Functions，前后端同域部署。CF 那一套（`techphant-bom-tools-v2.pages.dev` + `lcsc-proxy.workers.dev`）保留不动，作为海外版 / 兜底。

## 架构对比

| 维度 | Cloudflare（海外/兜底） | EdgeOne（国内主用） |
|---|---|---|
| 前端 | techphant-bom-tools-v2.pages.dev | material-system-hgfxi1cs.edgeone.cool |
| 后端 | lcsc-proxy.steidleyestephani737.workers.dev | 同域 `/api/lcsc/*` |
| KV | LCSC_CACHE（Workers KV） | LCSC_CACHE（EdgeOne KV，ns-Hd4Pwv84xbbG） |
| 部署 | git push → CF 自动构建 | git push → EdgeOne 自动构建 |
| 代码 | `cloudflare-worker/worker.js`（独立项目） | `functions/api/lcsc/*.js`（同仓库） |

前端通过 `location.hostname` 自动判断走哪个后端，**一份代码两边都能跑**。

## EdgeOne 控制台需要做的 4 件事

### ① 绑定 KV 命名空间
- 名称：`LCSC_CACHE`
- 命名空间 ID：`ns-Hd4Pwv84xbbG`
- 绑定变量名（**重要，代码里 `env.LCSC_CACHE` 就是它**）：`LCSC_CACHE`

路径：项目 → 设置 → 函数 → KV 命名空间绑定

### ② 配置环境变量（3 个，**类型必须选「仅服务器端」/「Secret」**）

| 变量名 | 值 |
|---|---|
| `JLC_APP_ID` | `<在 EdgeOne 控制台配置为 Secret>` |
| `JLC_ACCESS_KEY` | `<在 EdgeOne 控制台配置为 Secret>` |
| `JLC_SECRET_KEY` | `<在 EdgeOne 控制台配置为 Secret>` |

⚠️ 千万别选「客户端可访问」，否则密钥会下发到浏览器。

⚠️ 如果真实密钥曾经提交到 Git 历史或发到公开渠道，请到立创开放平台重新生成/轮换密钥，并同步更新 EdgeOne、Cloudflare Worker 等运行环境里的 Secret。

路径：项目 → 设置 → 函数 → 环境变量

### ③ 连接 Git 仓库
- 仓库：`https://github.com/Daiwei191413/material-system.git`
- 分支：`v2-dev`
- 构建命令：留空（纯静态 + Functions，不需要构建）
- 输出目录：`/`（仓库根）
- Functions 目录：`functions`（EdgeOne 默认约定，无需配置）

### ④ 触发首次部署
git push 后自动构建，或在控制台点「重新部署」。

## 部署后自检（按顺序点）

```
1. https://material-system-hgfxi1cs.edgeone.cool/api/lcsc/health
   期望：env_check 4 项全部 true

2. https://material-system-hgfxi1cs.edgeone.cool/api/lcsc?k=C25804
   期望：ok:true, data.hit:true, data.productModel 有值

3. https://material-system-hgfxi1cs.edgeone.cool/api/lcsc/batch?codes=C25804,C431542,C1525
   期望：ok:true, count:3, results 三条都 hit

4. https://material-system-hgfxi1cs.edgeone.cool/api/lcsc/search?q=10K&pkg=0805
   期望：ok:true, items 数组非空

5. https://material-system-hgfxi1cs.edgeone.cool/api/lcsc/quota
   期望：used 随调用递增（KV 计数）
```

## 目录结构

```
material-system/
├── index.html                       # 前端，含双后端自动切换
├── functions/
│   └── api/
│       └── lcsc/
│           ├── _lib.js              # 签名/KV/字段映射 共享库
│           ├── index.js             # GET /api/lcsc[?k=]
│           ├── batch.js             # GET /api/lcsc/batch?codes=
│           ├── search.js            # GET /api/lcsc/search?q=&pkg=&page=
│           ├── health.js            # GET /api/lcsc/health
│           └── quota.js             # GET /api/lcsc/quota
└── cloudflare-worker/               # CF 老后端，保留作海外/兜底
    ├── worker.js
    └── wrangler.toml
```

## 已知风险点

1. **首次部署 KV 是空的**，会快速消耗立创 1000 次/天 配额。建议小范围预热 1-2 天再正式推广。
2. **EdgeOne Functions 没有 `ctx.waitUntil`**，KV 写入用了 `await`，单次响应会比 CF 慢 50-200ms（可接受）。
3. **HMAC-SHA256 走 Web Crypto subtle**，理论上 EdgeOne 兼容，万一报错查 `/api/lcsc/health` 看 env_check 是不是缺密钥。
4. **EdgeOne KV 与 Workers KV API 99% 兼容**，本工程只用了 `get(key, {type:'json'})` / `put(key, val, {expirationTtl})`，都是公共子集，预计不需要适配层。
