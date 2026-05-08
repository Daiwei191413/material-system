#!/usr/bin/env python3
"""抓取立创商品详情页，提取关键字段"""
import requests, re, json

headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml',
    'Accept-Language': 'zh-CN,zh;q=0.9',
}

def fetch_lcsc_product(code):
    """code 形如 C1523"""
    num = code.lstrip('Cc')
    url = f"https://item.szlcsc.com/{num}.html"
    try:
        r = requests.get(url, headers=headers, timeout=15)
        if r.status_code != 200:
            return {"error": f"HTTP {r.status_code}", "url": url}
        html = r.text
        result = {"code": code, "url": url, "html_size": len(html)}
        
        # 1) title
        m = re.search(r'<title>([^<]+)</title>', html)
        if m: result['title'] = m.group(1).strip()
        
        # 2) meta keywords / description
        for key in ['keywords', 'description']:
            m = re.search(rf'<meta\s+name="{key}"\s+content="([^"]+)"', html)
            if m: result[f'meta_{key}'] = m.group(1)
        
        # 3) JSON-LD / window 对象
        for pat in [
            r'window\.__INITIAL_STATE__\s*=\s*({[^\n]+?});',
            r'window\.productDetail\s*=\s*({.+?});',
            r'<script type="application/ld\+json">([^<]+)</script>',
        ]:
            m = re.search(pat, html)
            if m:
                result['embed_json'] = m.group(1)[:800]
                break
        
        # 4) 关键字段抓取：产品型号、参数、封装、品牌、描述
        patterns = {
            'productModel': r'productModel["\']?\s*[:=]\s*["\']([^"\']+)["\']',
            'productName': r'productName["\']?\s*[:=]\s*["\']([^"\']+)["\']',
            'brandName': r'brandName["\']?\s*[:=]\s*["\']([^"\']+)["\']',
            'encapStandard': r'encapStandard["\']?\s*[:=]\s*["\']([^"\']+)["\']',
            'productIntroEn': r'productIntroEn["\']?\s*[:=]\s*["\']([^"\']+)["\']',
            'productDescEn': r'productDescEn["\']?\s*[:=]\s*["\']([^"\']+)["\']',
        }
        for k, p in patterns.items():
            m = re.search(p, html)
            if m: result[k] = m.group(1)
        
        return result
    except Exception as e:
        return {"error": str(e)}

for code in ['C1523', 'C2977777', 'C473820', 'C25744']:
    r = fetch_lcsc_product(code)
    print(f"\n{'='*60}\n{code}\n{'='*60}")
    for k, v in r.items():
        print(f"  {k}: {str(v)[:200]}")
