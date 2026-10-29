const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let playwrightCore;
try {
  playwrightCore = require('playwright-core');
} catch (_error) {
  playwrightCore = require(path.join(
    process.env.USERPROFILE || '',
    '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core',
  ));
}
const { chromium } = playwrightCore;

const edgeCandidates = [
  process.env.EDGE_PATH,
  path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe'),
].filter(Boolean);
const edgePath = edgeCandidates.find((candidate) => fs.existsSync(candidate));
assert(edgePath, 'Microsoft Edge executable not found; set EDGE_PATH to run this browser check.');

const repoRoot = path.resolve(__dirname, '..');
const targets = [
  ['domestic', 'v3-cloudbase/web/index.html', 'V1.0.57'],
  ['overseas', 'v3-legacy/index.html', 'V3.0.81'],
];

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: edgePath });
  try {
    for (const [label, relativePath, expectedVersion] of targets) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const requestedCodes = [];
      await page.route('**/*', async (route) => {
        const requestUrl = route.request().url();
        if (requestUrl.includes('/batch?codes=')) {
          const codes = decodeURIComponent(new URL(requestUrl).searchParams.get('codes') || '').split(',').filter(Boolean);
          requestedCodes.push(...codes);
          const results = codes.map((code) => {
            if (code === 'C123456') {
              return {
                ok: true,
                data: {
                  query: code,
                  hit: true,
                  productCode: code,
                  productModel: 'OFFICIAL-IC',
                  productType: '电源管理芯片',
                  package: 'QFN-32',
                  brand: 'TEST',
                  specification: '电源管理芯片，QFN-32',
                  unit: 'PCS',
                },
              };
            }
            return {
              ok: false,
              error: '立创未找到该编号',
              data: { query: code, hit: false },
            };
          });
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ ok: true, results }),
          });
        } else if (requestUrl.startsWith('file:')) {
          await route.continue();
        } else {
          await route.abort();
        }
      });

      await page.goto(pathToFileURL(path.join(repoRoot, relativePath)).href, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof window.doCompare === 'function');
      const result = await page.evaluate(async (version) => {
        window.alert = () => {};
        window.confirm = () => true;
        window.materialDB_standard = [];
        window.setActiveLib('standard');
        const rows = [
          { '位号':'U1', '型号':'SOURCE-IC', '封装':'QFN-32', '数量':'1', '立创编号':'C123456' },
          { '位号':'U2', '型号':'NO-LCSC', '封装':'SOT-23', '数量':'1', '立创编号':'邮寄' },
          { '位号':'U3', '型号':'UNKNOWN-IC', '封装':'QFN-24', '数量':'1', '立创编号':'C999999' },
        ];
        window.A = { rows:[], fm:{}, hd:[], _hi:0, _sn:'线下BOM', _raw:new Uint8Array([1]) };
        window.B = { rows, fm:{}, hd:[], _hi:0, _sn:'立创BOM', _raw:new Uint8Array([1]) };
        const first = await window.doCompare();
        const snapshot = window.MM_RESULT.map((item) => ({
          ref: item.ref,
          level: item.level,
          online: item.online,
          state: item.onlineState,
          hitModel: item.hit && item.hit.model,
        }));
        const bodyText = document.getElementById('mmBody').innerText;
        const summaryText = document.getElementById('checkSummary').textContent;
        const second = await window.doCompare();
        return {
          title: document.title,
          expectedVersion: version,
          first,
          second,
          snapshot,
          bodyText,
          summaryText,
          ready: !document.getElementById('fmtAB').disabled,
        };
      }, expectedVersion);

      assert(result.title.includes(expectedVersion), `${label}: version not updated`);
      assert.deepStrictEqual(result.first, { total:2, ok:1, notHit:1, conflict:0, fail:0, failCodes:[] });
      assert.deepStrictEqual(result.second, { total:0, ok:0, notHit:0, conflict:0, fail:0, failCodes:[] });
      assert.deepStrictEqual(result.snapshot[0], { ref:'U1', level:1, online:true, state:'success', hitModel:'OFFICIAL-IC' });
      assert.strictEqual(result.snapshot[1].state, '');
      assert.strictEqual(result.snapshot[2].state, 'not_found');
      assert.match(result.bodyText, /缺有效立创编号，需确认/);
      assert.match(result.bodyText, /立创未找到该编号/);
      assert.match(result.summaryText, /自动查询 2 条：已确认 1 条，查无此号 1 条/);
      assert.strictEqual(result.ready, true);
      assert.deepStrictEqual([...new Set(requestedCodes)].sort(), ['C123456', 'C999999']);
      console.log(`${label}: automatic LCSC match workflow passed`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
