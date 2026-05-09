"""嘉立创开放平台 API 客户端

签名规则参考：https://open.jlc.com/docs/ → API安全 → 请求签名
- HmacSHA256(SecretKey, StringToSign) → Base64
- StringToSign = METHOD\\n + PATH(+?query)\\n + timestamp\\n + nonce\\n + body\\n
- Authorization: JOP appid="...",accesskey="...",nonce="...",timestamp="...",signature="..."
"""
import os
import time
import json
import hmac
import base64
import hashlib
import secrets
import string
from pathlib import Path

import requests

# ─── 凭证加载 ───────────────────────────────────────────────
ENV_PATH = Path(__file__).parent.parent / ".env.lcsc"

def _load_env():
    env = {}
    if ENV_PATH.exists():
        for ln in ENV_PATH.read_text(encoding="utf-8").splitlines():
            ln = ln.strip()
            if not ln or ln.startswith("#") or "=" not in ln:
                continue
            k, v = ln.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env

_env = _load_env()
ACCESS_KEY = _env.get("LCSC_ACCESS_KEY") or os.getenv("LCSC_ACCESS_KEY", "")
SECRET_KEY = _env.get("LCSC_SECRET_KEY") or os.getenv("LCSC_SECRET_KEY", "")
APP_ID     = _env.get("LCSC_APP_ID")     or os.getenv("LCSC_APP_ID", "")
# 基础域名：嘉立创开放平台统一网关（暂定，需戴纬哥在控制台确认）
BASE_URL   = _env.get("LCSC_BASE_URL")   or os.getenv("LCSC_BASE_URL", "https://api.jlc.com")


def _nonce(n=32):
    alphabet = string.ascii_letters + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(n))


def _sign(method: str, path_with_query: str, body: str, timestamp: int, nonce: str) -> str:
    """按官方规则构造签名串并做 HmacSHA256+Base64。"""
    string_to_sign = (
        f"{method}\n"
        f"{path_with_query}\n"
        f"{timestamp}\n"
        f"{nonce}\n"
        f"{body}\n"
    )
    mac = hmac.new(SECRET_KEY.encode("utf-8"), string_to_sign.encode("utf-8"), hashlib.sha256)
    return base64.b64encode(mac.digest()).decode("ascii")


def _auth_header(method: str, path_with_query: str, body: str) -> str:
    ts = int(time.time())
    nonce = _nonce()
    sig = _sign(method, path_with_query, body, ts, nonce)
    return (
        f'JOP appid="{APP_ID}",accesskey="{ACCESS_KEY}",'
        f'nonce="{nonce}",timestamp="{ts}",signature="{sig}"'
    )


def call(method: str, path: str, *, params: dict | None = None, json_body: dict | None = None, timeout: int = 15):
    """通用调用。path 例：'/product/v1/query'；params 会拼到 URL 上并参与签名。"""
    method = method.upper()
    q = ""
    if params:
        from urllib.parse import urlencode
        q = "?" + urlencode(params)
    path_with_query = path + q
    body = json.dumps(json_body, ensure_ascii=False, separators=(",", ":")) if json_body else ""
    headers = {
        "Authorization": _auth_header(method, path_with_query, body),
        "Content-Type": "application/json; charset=UTF-8",
    }
    url = BASE_URL.rstrip("/") + path_with_query
    r = requests.request(method, url, headers=headers, data=body.encode("utf-8") if body else None, timeout=timeout)
    return r


if __name__ == "__main__":
    # 自检：用文档示例数据验证签名算法
    # 文档示例：SecretKey=z0BWlikshimuyiwBsH1i2qwnzMb3j3kA
    # 预期 signature=sygwKhKBkLwHVv0c7D+a/A7JTEJjGH/kLugFKh16918=
    _test_key = "z0BWlikshimuyiwBsH1i2qwnzMb3j3kA"
    _string_to_sign = (
        "POST\n"
        "/order/v1/createOrder\n"
        "1625208260\n"
        "IZHEJYNIHYZIE8S0LLC0VWTPJVRRTO50\n"
        '{"goodsId":100,"quantity":52,"createdTime":"2024-03-21 10:03:20"}\n'
    )
    _mac = hmac.new(_test_key.encode("utf-8"), _string_to_sign.encode("utf-8"), hashlib.sha256)
    _sig = base64.b64encode(_mac.digest()).decode("ascii")
    print("签名算法自检：")
    print("  算得:", _sig)
    print("  预期: sygwKhKBkLwHVv0c7D+a/A7JTEJjGH/kLugFKh16918=")
    print("  结果:", "✅ 通过" if _sig == "sygwKhKBkLwHVv0c7D+a/A7JTEJjGH/kLugFKh16918=" else "❌ 不对")
    print(f"\n当前凭证:")
    print(f"  AccessKey: {ACCESS_KEY[:8]}...{ACCESS_KEY[-4:] if ACCESS_KEY else ''}")
    print(f"  SecretKey: {'已配置 (' + str(len(SECRET_KEY)) + ' 字节)' if SECRET_KEY else '缺失'}")
    print(f"  AppId:     {APP_ID or '⚠️ 未配置，需要戴纬哥从控制台提供'}")
    print(f"  BaseURL:   {BASE_URL}")
