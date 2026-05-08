#!/usr/bin/env python3
"""
立创商城抓取器 V2 - 复用已存在的 page tab（带 session cookie）
"""
import json
import time
import requests
import websocket
import urllib.parse

CDP = "http://localhost:9222"


def get_page_tab():
    """找到一个已经打开过立创的 page tab，或返回第一个 page"""
    tabs = requests.get(f"{CDP}/json").json()
    pages = [t for t in tabs if t.get("type") == "page"]
    # 优先已经在立创域名的
    for t in pages:
        if "szlcsc.com" in (t.get("url") or ""):
            return t
    if pages:
        return pages[0]
    return None


def fetch_lcsc(code, wait_timeout=15):
    code = code.strip()
    if not code.upper().startswith("C"):
        return {"code": code, "error": "非法编号"}

    url = f"https://so.szlcsc.com/global.html?k={urllib.parse.quote(code)}"
    tab = get_page_tab()
    if not tab:
        return {"code": code, "error": "no_tab"}

    ws = websocket.create_connection(tab["webSocketDebuggerUrl"], timeout=30)
    try:
        def send(method, params=None):
            rid = int(time.time() * 1000) % 1000000
            ws.send(json.dumps({"id": rid, "method": method, "params": params or {}}))
            while True:
                m = json.loads(ws.recv())
                if m.get("id") == rid:
                    return m

        send("Page.enable")
        send("Page.navigate", {"url": url})

        ready_js = r"""
        (() => {
          const root = document.querySelector('.product-group-leader');
          if (!root) return false;
          const txt = root.innerText || '';
          return txt.includes('编号') && txt.length > 300;
        })()
        """
        deadline = time.time() + wait_timeout
        ok = False
        while time.time() < deadline:
            r = send("Runtime.evaluate", {"expression": ready_js, "returnByValue": True})
            if r.get("result", {}).get("result", {}).get("value") is True:
                ok = True
                break
            # 检查是否被重定向到登录
            tt = send("Runtime.evaluate", {"expression": "document.title", "returnByValue": True})
            title = tt.get("result", {}).get("result", {}).get("value") or ""
            if "登录" in title:
                return {"code": code, "error": f"redirected_to_login:{title}"}
            time.sleep(0.5)

        if not ok:
            return {"code": code, "error": "timeout"}

        extract_js = r"""
        (() => {
          const root = document.querySelector('.product-group-leader');
          if (!root) return {error: 'no_product'};
          
          const dls = root.querySelectorAll('dl');
          const fields = {};
          dls.forEach(dl => {
            const term = dl.querySelector('dt')?.innerText?.replace(/[:：]/g,'').trim();
            const defi = dl.querySelector('dd')?.innerText?.trim();
            if (term && defi) fields[term] = defi;
          });
          
          let model = '';
          const firstNoDt = Array.from(dls).find(dl => !dl.querySelector('dt') && dl.querySelector('dd'));
          if (firstNoDt) model = firstNoDt.querySelector('dd').innerText.trim();
          if (!model) {
            const firstA = root.querySelector('dl dd a');
            if (firstA) model = firstA.innerText.trim();
          }
          
          const descP = Array.from(root.querySelectorAll('p')).find(p => p.innerText.includes('描述'));
          const desc = descP ? descP.innerText.replace(/^描述\s*[:：]?\s*/, '').trim() : '';
          
          return {fields, model, desc};
        })()
        """
        r = send("Runtime.evaluate", {"expression": extract_js, "returnByValue": True})
        val = r.get("result", {}).get("result", {}).get("value") or {}
        fields = val.get("fields") or {}
        model = val.get("model") or fields.get("型号") or ""

        return {
            "code": code,
            "型号": model,
            "物料名称": fields.get("类目", ""),
            "封装": fields.get("封装", ""),
            "品牌": fields.get("品牌", ""),
            "描述": val.get("desc", ""),
            "参数": {k: v for k, v in fields.items() if k not in ["类目", "封装", "品牌", "编号", "型号"]},
        }
    finally:
        try:
            ws.close()
        except:
            pass


if __name__ == "__main__":
    test_codes = ['C1523', 'C25744', 'C411563', 'C17168', 'C4109', 'C2977777']
    for code in test_codes:
        r = fetch_lcsc(code)
        print(f"\n📦 {code}")
        for k, v in r.items():
            print(f"  {k}: {v}")
        time.sleep(0.5)  # 礼貌间隔
