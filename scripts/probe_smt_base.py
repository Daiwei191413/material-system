"""探测 SMT 业务 API 的正确 base URL"""
import sys, json
sys.path.insert(0, "/root/projects/material-system/scripts")
import lcsc_api as L

PATH = "/smtOpenApi/smtComponent/selectComponentInfoByCodes"
BODY = {"componentCodeList": ["C1523"]}

candidates = [
    "https://api.jlc.com",
    "https://smt-api.jlc.com",
    "https://smt.jlc.com",
    "https://smtapi.jlc.com",
    "https://openapi.jlc.com",
    "https://openapi.smt.jlc.com",
    "https://api.smt.jlc.com",
    "https://api-smt.jlc.com",
    "https://open.jlc.com",
    "https://gateway.jlc.com",
    "https://api-gateway.jlc.com",
    "https://api.szlcsc.com",
]

for base in candidates:
    L.BASE_URL = base
    try:
        r = L.call("POST", PATH, json_body=BODY, timeout=8)
        ct = r.headers.get('Content-Type', '')
        body_short = r.text[:100].replace('\n', ' ')
        ok = r.status_code == 200 and 'json' in ct
        print(f"  {r.status_code:3}  {ct[:30]:30}  {base:40}  {body_short[:60]}")
        if r.status_code == 200:
            try:
                j = r.json()
                print(f"    ✅ JSON: {json.dumps(j, ensure_ascii=False)[:200]}")
            except Exception:
                pass
    except Exception as e:
        print(f"  ERR                                 {base:40}  {type(e).__name__}")
