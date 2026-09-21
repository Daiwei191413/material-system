const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let playwrightCore;
try {
  playwrightCore = require('playwright-core');
} catch (_error) {
  playwrightCore = require(path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));
}
const edgePath = [
  process.env.EDGE_PATH,
  path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe'),
].filter(Boolean).find((candidate) => fs.existsSync(candidate));
assert(edgePath, 'Microsoft Edge executable not found; set EDGE_PATH to run this browser check.');

const repoRoot = path.resolve(__dirname, '..');
const targets = [['domestic', 'v3-cloudbase/web/index.html'], ['overseas', 'v3-legacy/index.html']];
const headers = ['序号', '物料名称', '型号', '封装', '立创编号', '单价'];
const namedRows = [headers, [77, ' 无线收发芯片 ', 'KEY-A', 'QFN32', '', 3.21], [91, '', 'KEY-B', 'QFN24', 'C900002', 4.56]];

async function uploadRows(page, rows) {
  const bytes = await page.evaluate((data) => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(data), '导入表');
    return Array.from(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
  }, rows);
  const chooserPromise = page.waitForEvent('filechooser');
  await page.locator('#btnImportMat').click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: 'cost-metadata.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: Buffer.from(bytes) });
  await page.waitForFunction(() => window.__costAlerts.length > 0);
}

(async () => {
  const browser = await playwrightCore.chromium.launch({ headless: true, executablePath: edgePath });
  try {
    for (const [label, relativePath] of targets) {
      const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
      const errors = [];
      page.on('pageerror', (error) => errors.push(error.message));
      await page.route('**/*', (route) => route.request().url().startsWith('file:') ? route.continue() : route.abort());
      await page.goto(pathToFileURL(path.join(repoRoot, relativePath)).href, { waitUntil: 'domcontentloaded' });
      if (!await page.evaluate(() => typeof window.XLSX !== 'undefined')) {
        await page.addScriptTag({ path: path.join(repoRoot, 'v3-cloudbase/web/assets/vendor/xlsx.full.min.js') });
      }
      await page.evaluate(() => {
        document.body.classList.remove('v3-not-logged');
        document.getElementById('v3LoginMask').classList.remove('show');
        window.BOM_API.user = { role: 'admin', username: 'local-test' };
        window.V3_applyRoleUI();
        window.BOM_API.toast = () => {};
        window.__costAlerts = [];
        window.__costUploads = [];
        window.alert = (message) => window.__costAlerts.push(message);
        window.confirm = () => true;
        window.BOM_API.importLib = async (lib, items) => {
          window.__costUploads.push({ lib, items });
          return { success: true, message: 'mock sync' };
        };
        window.materialDB_lcsc = [{ model: 'KEEP-LCSC', package: '0603', lcsc_code: 'C800001' }];
        window.materialDB_standard = [{ name: 'KEEP-STD', model: 'KEEP-STD', package: '0603' }];
        window.materialDB_cost = [];
        window.switchLib('cost');
      });

      await uploadRows(page, namedRows);
      const imported = await page.evaluate(() => ({ rows: materialDB_cost, uploads: __costUploads, counts: [materialDB_lcsc.length, materialDB_standard.length] }));
      assert.deepStrictEqual(imported.rows.map((row) => [row.name, row.model, row.price]), [['无线收发芯片', 'KEY-A', '3.21'], ['', 'KEY-B', '4.56']], `${label}: named cost import failed`);
      assert.deepStrictEqual(imported.counts, [1, 1], `${label}: cost import changed an existing library`);
      assert.strictEqual(imported.uploads[0].lib, 'cost');
      assert.strictEqual(imported.uploads[0].items[0].name, '无线收发芯片', `${label}: upload dropped name`);
      assert(!('idx' in imported.uploads[0].items[0]) && !('序号' in imported.uploads[0].items[0]), `${label}: display ordinal was persisted`);

      await page.evaluate(() => { window.__costAlerts = []; });
      await uploadRows(page, [['型号', '封装', '单价'], ['KEY-A', 'QFN32', 5.25]]);
      assert.deepStrictEqual(await page.evaluate(() => [materialDB_cost[0].name, materialDB_cost[0].price]), ['无线收发芯片', '5.25'], `${label}: old-format update erased name`);
      await page.evaluate(() => { window.__costAlerts = []; });
      await uploadRows(page, [headers, [5, '无线芯片（更新）', 'KEY-A', 'QFN32', '', 6.5]]);
      assert.strictEqual(await page.evaluate(() => materialDB_cost[0].name), '无线芯片（更新）', `${label}: reimport did not update name`);

      const metadata = await page.evaluate(async () => {
        const uploadedItems = window.BOM_API.toCloudItems('cost', materialDB_cost);
        window.BOM_API.listLib = async (lib) => ({ data: lib === 'cost' ? uploadedItems : (lib === 'lcsc' ? materialDB_lcsc : materialDB_standard) });
        await window.V3_syncDownAll();
        window.saveMaterialDB();
        const savedName = JSON.parse(localStorage.getItem('material_db_cost'))[0].name;
        document.getElementById('matSearch').value = '无线芯片';
        window.loadMaterialTable();
        const searchRows = document.querySelectorAll('#matTableBody tr').length;
        const rowText = document.getElementById('matTableBody').textContent;
        document.getElementById('matSearch').value = '';
        window.loadMaterialTable();
        let exported;
        const originalWriteFile = XLSX.writeFile;
        try {
          XLSX.writeFile = (wb) => { exported = wb; };
          window.exportMaterialData();
        } finally {
          XLSX.writeFile = originalWriteFile;
        }
        const savedExport = XLSX.read(XLSX.write(exported, { type: 'array', bookType: 'xlsx' }), { type: 'array' });
        const exportValues = XLSX.utils.sheet_to_json(savedExport.Sheets[savedExport.SheetNames[0]], { header: 1, defval: '' });
        const exportFormat = window.detectBomFormat(window.parse(savedExport).rows);
        const oldItem = window.sanitizeCostLibraryItem({ model: 'OLD', package: 'QFN32', price: '1' });
        const maliciousName = '<img src=x onerror=alert(1)>';
        const oldName = materialDB_cost[0].name;
        materialDB_cost[0].name = maliciousName;
        window.loadMaterialTable();
        const nameEscaped = document.querySelector('#matTableBody td:nth-child(2)').textContent === maliciousName && !document.querySelector('#matTableBody img');
        materialDB_cost[0].name = oldName;
        window.loadMaterialTable();
        return { savedName, searchRows, rowText, exportValues, exportFormat, oldName: oldItem.name, nameEscaped, cloudName: materialDB_cost[0].name };
      });
      assert.strictEqual(metadata.savedName, '无线芯片（更新）', `${label}: local persistence dropped name`);
      assert.strictEqual(metadata.cloudName, metadata.savedName, `${label}: cloud download dropped name`);
      assert.strictEqual(metadata.searchRows, 1);
      assert(metadata.rowText.includes('无线芯片（更新）'), `${label}: name search failed`);
      assert.deepStrictEqual(metadata.exportValues[0], headers, `${label}: export column order changed`);
      assert.deepStrictEqual(metadata.exportValues.slice(1).map((row) => [row[0], row[1], row[5]]), [[1, '无线芯片（更新）', 6.5], [2, '', 4.56]], `${label}: export metadata/ordinal/price failed`);
      assert.strictEqual(metadata.exportFormat, 'cost', `${label}: own export was not reimportable`);
      assert.strictEqual(metadata.oldName, '', `${label}: optional name became required`);
      assert(metadata.nameEscaped, `${label}: material name injected HTML`);

      await page.evaluate(() => { window.__costAlerts = []; });
      await uploadRows(page, [['物料编码', '物料名称', '型号', '参数描述', '封装', '品牌', '单价'], ['ERP-1', '标准芯片', 'STD-NEW', '标准参数', 'QFN32', 'Brand', 7]]);
      const blocked = await page.evaluate(() => ({ message: __costAlerts[0], count: materialDB_cost.length, uploads: __costUploads.length }));
      assert(blocked.message.includes('本次导入已阻止'), `${label}: full standard BOM entered cost library`);
      assert(!blocked.message.includes('11列'), `${label}: alert still claimed a false column count`);
      assert.strictEqual(blocked.count, 2);
      assert.strictEqual(blocked.uploads, 3);
      await page.evaluate(() => { window.__costAlerts = []; window.switchLib('standard'); });
      await uploadRows(page, namedRows);
      assert(await page.evaluate(() => __costAlerts[0].includes('本次导入已阻止') && materialDB_standard.length === 1), `${label}: named cost sheet entered standard library`);

      if (process.env.COST_BOM_PATH) {
        await page.evaluate(() => { window.__costAlerts = []; window.materialDB_cost = []; window.switchLib('cost'); });
        const chooserPromise = page.waitForEvent('filechooser');
        await page.locator('#btnImportMat').click();
        await (await chooserPromise).setFiles(process.env.COST_BOM_PATH);
        await page.waitForFunction(() => window.__costAlerts.length > 0);
        const actual = await page.evaluate(() => ({ count: materialDB_cost.length, names: materialDB_cost.map((row) => row.name), message: __costAlerts[0] }));
        assert(actual.count > 0 && actual.names.every(Boolean) && actual.message.includes('导入完成'), `${label}: supplied workbook import failed`);
        console.log(`${label}: supplied workbook imported ${actual.count} named rows`);
      }
      if (process.env.COST_QA_DIR) {
        fs.mkdirSync(process.env.COST_QA_DIR, { recursive: true });
        await page.evaluate(() => window.switchLib('cost'));
        for (const [view, width, height] of [['desktop', 1440, 1000], ['mobile', 390, 844]]) {
          await page.setViewportSize({ width, height });
          await page.screenshot({ path: path.join(process.env.COST_QA_DIR, `${label}-${view}.png`), fullPage: true });
          if (view === 'desktop') await page.locator('#matTable').screenshot({ path: path.join(process.env.COST_QA_DIR, `${label}-table.png`) });
          assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${label}/${view}: page overflows viewport`);
        }
      }
      assert.deepStrictEqual(errors, [], `${label}: browser runtime errors`);
      console.log(`${label}: cost metadata import, persistence, export and isolation passed`);
      await page.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => { console.error(error); process.exitCode = 1; });
