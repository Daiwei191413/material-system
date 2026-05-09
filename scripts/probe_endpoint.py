"""探测立创开放平台的 API 端点 —— 用 GET / 和几个常见路径试探。
目的：验证凭证与签名是否被服务器接受（正确的路径 = 200，错误 = 404，签名错 = 401）。
"""
import sys
sys.path.insert(0, "/root/projects/material-system/scripts")
from lcsc_api import call, APP_ID, ACCESS_KEY, BASE_URL

print(f"BaseURL: {BASE_URL}")
print(f"AppId:   {APP_ID}\n")

# 候选基础域名
bases = [
    "https://api.jlc.com",
    "https://open.jlc.com",
    "https://openapi.jlc.com",
    "https://gateway.jlc.com",
]

# 候选查询接口路径（按开放平台命名习惯推测）
paths = [
    "/",
    "/openapi/mall/product/v1/query",
    "/mall/product/v1/query",
    "/product/v1/query",
    "/openapi/product/v1/detail",
    "/product/v1/detail",
    "/openapi/mall/v1/search",
    "/openapi/component/v1/detail",
    "/openapi/component/v1/query",
    "/component/v1/query",
]

import lcsc_api as L

for base in bases:
    L.BASE_URL = base
    print(f"\n─── {base} ───")
    for p in paths:
        try:
            r = L.call("GET", p, params={"productCode": "C1525"})
            body = (r.text or "")[:200].replace("\n", " ")
            print(f"  {r.status_code:3}  GET {p:48}  {body}")
            if r.status_code == 200:
                print("    ✅ 可能通了!")
        except Exception as e:
            print(f"  ERR  GET {p:48}  {type(e).__name__}: {str(e)[:100]}")
