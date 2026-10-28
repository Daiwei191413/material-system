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
      const libraryPermission = await page.evaluate(async () => {
        const originalReq = BOM_API.req;
        let requestCount = 0;
        BOM_API.req = () => {
          requestCount += 1;
          return Promise.resolve({ success: true });
        };
        BOM_API.user = { role: 'readonly', username: 'readonly-test' };
        V3_applyRoleUI();
        const denied = [];
        for (const lib of ['standard', 'lcsc', 'cost', 'rf']) {
          try {
            await BOM_API.importLib(lib, [{ model: 'DENIED' }]);
            denied.push(false);
          } catch (error) {
            denied.push(/只有管理员/.test(String(error && error.message || error)));
          }
        }
        const rfDenied = await importRfInductorRows([]).then(
          () => false,
          (error) => /不是管理员/.test(String(error && error.message || error)),
        );
        const readonlyButtonHidden = getComputedStyle(document.getElementById('btnImportMat')).display === 'none';
        BOM_API.user = { role: 'admin', username: 'admin-test' };
        V3_applyRoleUI();
        const adminGuardAllowed = requireMaterialLibraryAdmin('导入库文件');
        const adminButtonVisible = getComputedStyle(document.getElementById('btnImportMat')).display !== 'none';
        BOM_API.req = originalReq;
        return { denied, rfDenied, requestCount, readonlyButtonHidden, adminGuardAllowed, adminButtonVisible };
      });
      assert(libraryPermission.denied.every(Boolean), `${label}: a non-admin library import was not rejected`);
      assert(libraryPermission.rfDenied, `${label}: non-admin RF library import was not rejected`);
      assert.strictEqual(libraryPermission.requestCount, 0, `${label}: a non-admin import reached the API`);
      assert(libraryPermission.readonlyButtonHidden, `${label}: library import button is visible to a non-admin`);
      assert(libraryPermission.adminGuardAllowed, `${label}: admin library import guard rejected an administrator`);
      assert(libraryPermission.adminButtonVisible, `${label}: library import button is hidden from an administrator`);
      const rfImportValidation = await page.evaluate(async () => {
        const base = {
          '物料名称': '绕线电感',
          '型号': 'LQW15AN4N7B00D',
          '参数描述': '电感值:4.7nH，精度:±2%，额定电流:750mA，DCR:70mΩ',
          '封装': 'SL0402',
          '品牌': 'muRata(村田)',
          '立创编号': 'C98070',
        };
        const invalidCode = await importRfInductorRows([
          Object.assign({}, base, { '物料编码': '7' }),
        ]).then(
          () => '',
          (error) => String(error && error.message || error),
        );
        const duplicateCode = await importRfInductorRows([
          Object.assign({}, base, { '物料编码': '1-IN-09-00036' }),
          Object.assign({}, base, {
            '物料编码': '1-IN-09-00036',
            '型号': 'LQW15AN22NG00D',
            '参数描述': '电感值:22nH，精度:±2%，额定电流:310mA，DCR:1.82Ω',
            '立创编号': 'C86129',
          }),
        ]).then(
          () => '',
          (error) => String(error && error.message || error),
        );
        const originalFetchLcsc = window.fetchLcscDetailsByCodes;
        const originalUploadLib = BOM_API.uploadLib;
        const alerts = [];
        window.fetchLcscDetailsByCodes = async (codes) => Object.fromEntries(codes.map((code) => [code, {
          ok: true,
          data: {
            hit: true,
            productCode: code,
            productModel: 'smd332_12nh',
            productName: 'smd332_12nh',
            productType: '未分类',
            brand: '客户邮寄',
            package: 'SMD-2P',
          },
        }]));
        BOM_API.uploadLib = async () => ({ message: '测试环境未上传' });
        window.alert = (message) => alerts.push(String(message));
        window.materialDB_standard = [];
        window.materialDB_rf_inductor = [];
        await importRfInductorRows([{
          '物料编码': '1-IN-09-00036',
          '物料名称': '绕线电感',
          '型号': 'SMDS332-12N_RS',
          '参数描述': '电感值:12.1nH，精度:±5%，额定电流:4.4A，DCR:7.0mΩ',
          '封装': 'SMDS332',
          '品牌': '纳亨电子',
          '立创编号': 'C9900070550',
        }]);
        const imported = materialDB_rf_inductor[0];
        const customerStatus = rfInductorLcscStatus(imported);
        const customerRemark = imported.remark;
        const customerAlert = alerts[alerts.length - 1] || '';
        window.fetchLcscDetailsByCodes = originalFetchLcsc;
        BOM_API.uploadLib = originalUploadLib;
        window.materialDB_standard = [];
        window.materialDB_rf_inductor = [];
        localStorage.removeItem('material_db_standard');
        localStorage.removeItem('material_db_standard_updated');
        return { invalidCode, duplicateCode, customerStatus, customerRemark, customerAlert };
      });
      assert.match(rfImportValidation.invalidCode, /公司物料编码格式错误/, `${label}: numeric RF material code was not blocked`);
      assert.match(rfImportValidation.duplicateCode, /公司物料编码与 Excel 第 2 行重复/, `${label}: duplicate RF material code was not blocked`);
      assert.strictEqual(rfImportValidation.customerStatus, '客户专用', `${label}: customer-specific LCSC code was not labeled`);
      assert.match(rfImportValidation.customerRemark, /立创编号状态=客户专用/, `${label}: customer-specific status was not persisted`);
      assert.match(rfImportValidation.customerAlert, /客户专用立创编号：1 条/, `${label}: customer-specific import count missing`);
      assert.match(await page.locator('.nav-btn[onclick="showPanel(\'compare\')"]').textContent(), /立创BOM转线下BOM/);
      assert.match(await page.locator('#goBtn').textContent(), /检查立创BOM/);
      assert.match(await page.locator('#fmtAB').textContent(), /生成线下BOM/);
      assert.strictEqual(await page.locator('#expBtn').isVisible(), false, `${label}: obsolete difference export is visible`);
      await page.evaluate(() => showPanelDirect('compare'));

      await page.evaluate(() => {
        window.BOM_API.isAdmin = () => true;
        window.alert = () => {};
        window.confirm = () => true;
        const fields = ['位号', '型号', '封装', '数量', '物料名称', '参数描述', '品牌', '单位'];
        const fm = Object.fromEntries(fields.map((field) => [field, field]));
        window.A = { rows:[], fm, hd:fields, _hi:0, _sn:'单板BOM', _raw:new Uint8Array([1]) };
        window.materialDB_standard = [{model:'SAFE-STANDARD',package:'SAFE',material_code:'1-TEST-00001'}];
        window.setActiveLib('standard');
        window.BOM_STANDARD_SYNC = {status:'ready',count:1,error:''};
        window.verifyBomAuthority = () => Promise.resolve({mismatches:[],failedCodes:[],byCode:Object.create(null)});
        window.JSZip = function(){};
        window.patchAndDownloadXlsx = () => {
          window.__exportedBom = {SheetNames:['整理后BOM']};
          return Promise.resolve();
        };
        document.getElementById('boardName').value = '回归测试主板';
        document.getElementById('boardErp').value = 'A-TEST-00001';
        document.getElementById('boardVersion').value = 'V1.0';
        window.parse = () => ({
          rows: [{
            '位号': 'R1', '型号': '10K SR0402', '封装': 'SR0402', '数量': '1',
            '物料名称': '贴片电阻', '参数描述': '厚膜电阻 10KΩ ±1% 1/16W SMD 0402', '品牌': 'Sample',
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
      const afterUpload = await page.evaluate(() => ({
        standard: materialDB_standard.length,
        standardCache: localStorage.getItem('material_db_standard'),
        lcsc: materialDB_lcsc.length,
        hasAutoImportToast: !!document.getElementById('autoImpToast'),
      }));
      assert.strictEqual(afterUpload.standard, 1, `${label}: standard test fixture was lost`);
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
        fmtCore('AB', Object.create(null));
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
      assert.strictEqual(afterGenerate.standard, 1, `${label}: enrichment changed standard library`);
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
