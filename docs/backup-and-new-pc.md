# 数据备份与换机继续开发

## 仓库范围

本仓库保存以下内容：

- 网站源代码、数据库结构和回归测试。
- 按日期保存的 CloudBase、Cloudflare D1 数据快照。
- 管理员从国内站导出的标准库、立创库和关键器件成本库 Excel。

以下内容不提交到 Git：

- 立创 API 的 App ID、Access Key、Secret Key。
- CloudBase、Cloudflare、GitHub 的登录令牌和浏览器会话。
- Codex 的 `auth.json`。

访问密钥代表外部账户操作权限，不属于普通业务资料。换电脑后应重新登录，并从密码管理器或云平台 Secret 配置恢复。

## 创建数据快照

先在国内站“物料库管理”中分别导出三个库，再运行：

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\backup_cloud_data.ps1 `
  -DomesticExcelDirectory "D:\Users\Administrator\Downloads"
```

脚本会：

1. 从 CloudBase PostgreSQL 导出 `users`、`material_library`、`audit_log` 和 `login_attempts`。
2. 从 Cloudflare D1 导出完整 SQL 快照。
3. 复制指定目录中当天导出的 Excel 文件。
4. 生成包含记录数、Git 提交号和校验值的 `manifest.json`。

运行前需要分别完成 `tcb login` 和 `wrangler login`。

## 换电脑恢复开发环境

```powershell
git clone -b v3-rework https://github.com/Daiwei191413/material-system.git
cd material-system
git rev-parse HEAD
```

然后重新登录 GitHub、CloudBase 和 Cloudflare。生产网站和云数据库不会因换电脑而消失；仓库快照用于独立恢复和核对。

## 发布版本门禁

- 国内 CloudBase 使用 `V1.0.x`。
- 海外 Cloudflare 使用 `V3.0.x`。
- 每次发布两边都递增版本、运行全部回归测试、部署后检查线上页面版本和关键功能。
