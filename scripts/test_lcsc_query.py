"""测试立创开放平台查询元器件信息接口
路径: POST /smtOpenApi/smtComponent/selectComponentInfoByCodes
Body: {"componentCodeList": ["C1523", ...]}
"""
import sys, json
sys.path.insert(0, "/root/projects/material-system/scripts")
import lcsc_api as L

codes = ["C1523", "C1525", "C414017"]  # 先测 3 个
body = {"componentCodeList": codes}

r = L.call("POST", "/smtOpenApi/smtComponent/selectComponentInfoByCodes", json_body=body, timeout=20)
print(f"HTTP {r.status_code}")
print(f"J-Trace-ID: {r.headers.get('J-Trace-ID', '(无)')}")
print(f"Content-Type: {r.headers.get('Content-Type', '(无)')}")
print(f"\n响应原文（前 2000 字）:")
print(r.text[:2000])

# 试试 JSON 解析
try:
    j = r.json()
    print(f"\n--- JSON 解析成功 ---")
    print(json.dumps(j, ensure_ascii=False, indent=2)[:3000])
except Exception as e:
    print(f"\nJSON 解析失败: {e}")
