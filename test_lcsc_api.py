#!/usr/bin/env python3
"""测试立创商城 API 查询"""
import requests
import json

# 立创商城官方公开 API
headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    'Accept': 'application/json',
    'Referer': 'https://www.szlcsc.com/',
}

def try_api(code):
    """尝试多个已知立创 API 端点"""
    print(f"\n{'='*60}")
    print(f"测试编号: {code}")
    print(f"{'='*60}")
    
    endpoints = [
        # 立创开放接口（需要 token，但部分免 token）
        ("https://item.szlcsc.com/api/product/detail/{code}", "item API"),
        # wmsc 商品详情
        ("https://wmsc.lcsc.com/wmsc/product/detail?productCode={code}", "wmsc API"),
        # so 搜索（无需 token）
        ("https://so.szlcsc.com/api/common/product/v2/list?keyword={code}", "搜索 API"),
        # 嘉立创 EDA 查询
        ("https://easyeda.com/api/components/search?type=2&wd={code}", "EasyEDA API"),
    ]
    
    for url_tpl, name in endpoints:
        url = url_tpl.format(code=code)
        try:
            r = requests.get(url, headers=headers, timeout=8)
            print(f"\n[{name}] {r.status_code} {url[:80]}")
            if r.status_code == 200:
                try:
                    data = r.json()
                    s = json.dumps(data, ensure_ascii=False)[:500]
                    print(f"  响应: {s}")
                    if 'productModel' in s or 'productName' in s or 'displayTitle' in s:
                        print("  ✅ 找到有效字段")
                        return data
                except Exception as e:
                    print(f"  非 JSON: {r.text[:150]}")
        except Exception as e:
            print(f"[{name}] 错误: {e}")
    return None

# 测试 3 个典型编号
for code in ['C1523', 'C2977777', 'C473820']:
    try_api(code)
