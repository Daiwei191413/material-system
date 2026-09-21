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
  ['domestic', 'v3-cloudbase/web/index.html'],
  ['overseas', 'v3-legacy/index.html'],
];

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: edgePath });
  try {
    for (const [label, relativePath] of targets) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.route('**/*', async (route) => {
        if (route.request().url().startsWith('file:')) await route.continue();
        else await route.abort();
      });
      const url = pathToFileURL(path.join(repoRoot, relativePath)).href;
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await page.evaluate(() => {
        localStorage.setItem('material_db', JSON.stringify([{ model: 'OLD-ONLY' }]));
        localStorage.setItem('manual_enrich_db', JSON.stringify({ 'OLD|PKG': { model: 'OLD' } }));
        localStorage.removeItem('material_db_standard');
        localStorage.removeItem('material_db_lcsc');
      });
      await page.reload({ waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof window.fmtCore === 'function');

      const initial = await page.evaluate(() => ({
        standard: materialDB_standard.length,
        legacy: JSON.parse(localStorage.getItem('material_db'))[0].model,
        manual: JSON.parse(localStorage.getItem('manual_enrich_db'))['OLD|PKG'].model,
        hasManagerImport: !!document.getElementById('btnImportMat'),
      }));
      assert.strictEqual(initial.standard, 0, `${label}: startup must not import legacy cache`);
      assert.strictEqual(initial.legacy, 'OLD-ONLY');
      assert.strictEqual(initial.manual, 'OLD');
      assert(initial.hasManagerImport, `${label}: library-management import remains available`);
      assert.match(await page.locator('.nav-btn[onclick="showPanel(\'compare\')"]').textContent(), /立创BOM转线下BOM/);
      assert.match(await page.locator('#goBtn').textContent(), /检查两份BOM差异/);
      assert.match(await page.locator('#fmtAB').textContent(), /生成线下BOM/);
      assert.match(await page.locator('#expBtn').textContent(), /导出差异报告/);
      await page.evaluate(() => showPanelDirect('compare'));

      await page.evaluate(() => {
        window.BOM_API.isAdmin = () => true;
        window.alert = () => {};
        window.confirm = () => true;
        const fields = ['位号', '型号', '封装', '数量', '物料名称', '参数描述', '品牌', '单位'];
        const fm = Object.fromEntries(fields.map((field) => [field, field]));
        window.parse = () => ({
          rows: [{
            '位号': 'R1', '型号': '10K SR0402', '封装': 'SR0402', '数量': '1',
            '物料名称': '贴片电阻', '参数描述': '10k', '品牌': 'Sample',
          }],
          fm,
          hd: fields,
          _hi: 0,
          _sn: 'BOM',
        });
        window.XLSX = {
          read: () => ({}),
          utils: {
            book_new: () => ({ SheetNames: [], Sheets: {} }),
            aoa_to_sheet: (rows) => ({ rows }),
            book_append_sheet: (workbook, sheet, name) => {
              workbook.SheetNames.push(name);
              workbook.Sheets[name] = sheet;
            },
          },
          writeFile: (workbook) => { window.__exportedBom = workbook; },
        };
      });
      await page.locator('#fileA').setInputFiles({
        name: 'reference.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('A'),
      });
      await page.waitForFunction(() => window.A && window.A.rows.length === 1);
      const afterUpload = await page.evaluate(() => ({
        standard: materialDB_standard.length,
        standardCache: localStorage.getItem('material_db_standard'),
        lcsc: materialDB_lcsc.length,
        hasAutoImportToast: !!document.getElementById('autoImpToast'),
      }));
      assert.strictEqual(afterUpload.standard, 0, `${label}: A upload added a standard material`);
      assert.strictEqual(afterUpload.standardCache, null, `${label}: A upload wrote the standard cache`);
      assert.strictEqual(afterUpload.lcsc, 0);
      assert.strictEqual(afterUpload.hasAutoImportToast, false);

      await page.locator('#fileB').setInputFiles({
        name: 'lcsc.xlsx', mimeType: 'application/octet-stream', buffer: Buffer.from('B'),
      });
      await page.waitForFunction(() => window.B && window.B.rows.length === 1);
      await page.evaluate(() => doCompare());
      assert.strictEqual(await page.locator('#fmtAB').isDisabled(), false, `${label}: generation is not enabled`);
      await page.evaluate(() => {
        A._raw = null;
        fmt('AB');
      });
      await page.waitForFunction(() => !!window.__exportedBom);

      const afterGenerate = await page.evaluate(() => {
        const item = { row: B.rows[0], model: '10K SR0402', pkg: 'SR0402', lcsc: '' };
        applyLcscToRow(item, { hit: true, productType: '贴片电阻', productModel: '10K', specification: '10k' });
        MM_RESULT = [item];
        autoFillRow(0);
        document.getElementById('pasteDlg').dataset.idx = '0';
        document.getElementById('pdName').value = '贴片电阻';
        document.getElementById('pdSpec').value = '10k';
        document.getElementById('pdBrand').value = 'Sample';
        pdApply();
        return {
          exported: __exportedBom.SheetNames.includes('整理后BOM'),
          standard: materialDB_standard.length,
          standardCache: localStorage.getItem('material_db_standard'),
          lcsc: materialDB_lcsc.length,
          lcscCache: localStorage.getItem('material_db_lcsc'),
          manual: JSON.parse(localStorage.getItem('manual_enrich_db')),
        };
      });
      assert(afterGenerate.exported, `${label}: BOM was not generated`);
      assert.strictEqual(afterGenerate.standard, 0, `${label}: enrichment changed standard library`);
      assert.strictEqual(afterGenerate.standardCache, null);
      assert.strictEqual(afterGenerate.lcsc, 0);
      assert.strictEqual(afterGenerate.lcscCache, null);
      assert.deepStrictEqual(Object.keys(afterGenerate.manual), ['OLD|PKG']);
      console.log(`${label}: library boundaries and BOM workflow passed`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
