"""用 MCP 浏览器批量抓 13-21 项未命中的立创商品数据
前置：已在浏览器打开过 so.szlcsc.com/global.html?k=... 至少一次（通过 WAF）
输入：_test/misses.json
输出：_test/lcsc_补齐.xlsx + _test/lcsc_补齐.json
"""
# 注意：这个脚本不直接跑，由助手用 MCP browser 工具逐条抓。
# 保留在这里作为数据整理参考。

PARSE_JS = """
(() => {
  const cards = document.querySelectorAll('.product-group-leader');
  if (!cards.length) return {err: '未找到商品卡', url: location.href, title: document.title};
  const c = cards[0];
  const text = c.innerText;
  const lines = text.split('\\n').map(s => s.trim()).filter(Boolean);
  const result = {model: lines[0], fields: {}, desc: '', lcsc: ''};
  let i = 1;
  while (i < lines.length) {
    const k = lines[i];
    if (k.startsWith('描述特性') || k.startsWith('描述') || k.includes('RoHS') || k.includes('补贴') || k.includes('库存') || k.includes('私有库') || k.includes('折') || k.startsWith('收藏') || k.startsWith('对比') || k.startsWith('数据手册') || k.startsWith('复制')) break;
    const v = lines[i + 1];
    if (!v) break;
    result.fields[k] = v;
    if (k === '编号') result.lcsc = v;
    i += 2;
  }
  const descLine = lines.find(l => l.startsWith('描述特性') || l.startsWith('描述:'));
  if (descLine) result.desc = descLine.replace(/^描述(特性)?[：:]\\s*/, '');
  return result;
})()
"""

if __name__ == "__main__":
    import json
    with open("/root/projects/material-system/_test/misses.json", encoding="utf-8") as f:
        misses = json.load(f)
    print(f"待抓取 {len(misses)} 项：")
    for m in misses:
        print(f"  {m['lcsc']:10} {m['model'][:30]:30} {m['pkg']}")
