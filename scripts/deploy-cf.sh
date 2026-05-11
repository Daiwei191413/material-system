#!/bin/bash
# Cloudflare Pages 一键部署 -> https://techphant-bom.pages.dev/
set -e
cd "$(git rev-parse --show-toplevel)"
[ -f .env.cloudflare ] && source .env.cloudflare
[ -z "$CLOUDFLARE_API_TOKEN" ] && { echo "❌ 需要 CLOUDFLARE_API_TOKEN（在 .env.cloudflare 里设）"; exit 1; }
echo "📦 准备部署文件..."
rm -rf _deploy && mkdir _deploy
cp index.html material-manager.html materials_data.json _deploy/
cp -r assets _deploy/
echo "🚀 部署 to Cloudflare Pages..."
wrangler pages deploy _deploy --project-name=techphant-bom --branch=main --commit-dirty=true
echo "✅ https://techphant-bom.pages.dev/"
