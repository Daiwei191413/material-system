#!/usr/bin/env python3
"""EasyEDA 元件库 API 测试 - 这是公开的"""
import requests, json

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0',
    'Accept': 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9',
}

def try_endpoints(code):
    print(f"\n{'='*70}\n测试: {code}\n{'='*70}")
    endpoints = [
        # EasyEDA 搜索（之前用过）
        f"https://easyeda.com/api/components/search?type=2&wd={code}",
        # EasyEDA 按 LCSC 编号精确查询
        f"https://easyeda.com/api/components/{code}",
        # EasyEDA Pro API
        f"https://pro.easyeda.com/api/v2/components/search?type=lcsc&wd={code}",
        # JLC 嘉立创 EDA 元件查询
        f"https://api.jlcpcb.com/v1/component/{code}",
        # 嘉立创智造 API（开放给 SMT 用户）
        f"https://jlcpcb.com/api/overseas-pcb-order/v1/shoppingCart/smtGood/selectSmtComponentList?componentCode={code}",
    ]
    for url in endpoints:
        try:
            r = requests.get(url, headers=headers, timeout=10)
            body = r.text[:400]
            print(f"\n{url[:90]}")
            print(f"  [{r.status_code}] {body[:300]}")
            if r.status_code == 200:
                try:
                    data = r.json()
                    s = json.dumps(data, ensure_ascii=False)
                    if any(k in s for k in ['productModel', 'productName', 'componentModel', 'dataStr', 'packageDetail']):
                        print("  ✅ 可能有数据")
                except: pass
        except Exception as e:
            print(f"  ✗ {e}")

for code in ['C1523', 'C2977777']:
    try_endpoints(code)
