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

const bomPath = process.env.BOM_REAL_LCSC_BOM;
assert(bomPath && fs.existsSync(bomPath), 'Set BOM_REAL_LCSC_BOM to the real LCSC BOM workbook.');
const rfLibraryPath = process.env.BOM_REAL_RF_LIBRARY || '';
const repoRoot = path.resolve(__dirname, '..');
const backupPath = path.join(repoRoot, 'backups/2026-09-30/domestic-cloudbase/material_library.json');
const rawBackup = JSON.parse(fs.readFileSync(backupPath, 'utf8').replace(/^\uFEFF/, ''));
const standardLibrary = rawBackup
  .map(item => item && item.id)
  .filter(values => Array.isArray(values) && values[1] === 'standard')
  .map(values => ({
    lcsc_code:values[3] || '', name:values[4] || '', model:values[5] || '',
    specification:values[6] || '', brand:values[7] || '', material_code:values[8] || '',
    package:values[9] || '', unit:values[12] || 'PCS',
  }));

const edgeCandidates = [
  process.env.EDGE_PATH,
  path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe'),
].filter(Boolean);
const edgePath = edgeCandidates.find(candidate => fs.existsSync(candidate));
assert(edgePath, 'Microsoft Edge executable not found.');

let browser;
(async () => {
  browser = await chromium.launch({ headless:true, executablePath:edgePath });
  const page = await browser.newPage();
  await page.route('**/*', async route => {
    if (route.request().url().startsWith('file:')) await route.continue();
    else await route.abort();
  });
  await page.goto(pathToFileURL(path.join(repoRoot, 'v3-cloudbase/web/index.html')).href, {
    waitUntil:'domcontentloaded', timeout:30000,
  });
  await page.waitForFunction(() => typeof window.fmtCore === 'function' && typeof window.XLSX !== 'undefined');

  const workbookBytes = Array.from(fs.readFileSync(bomPath));
  const parsed = await page.evaluate(bytes => {
    const wb = XLSX.read(new Uint8Array(bytes), {type:'array'});
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, {defval:''});
  }, workbookBytes);
  const rfLibrary = rfLibraryPath && fs.existsSync(rfLibraryPath)
    ? await page.evaluate(bytes => {
      const wb = XLSX.read(new Uint8Array(bytes), {type:'array'});
      return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {defval:''}).map(row => ({
        material_code:row['物料编码'] || '', name:row['物料名称'] || '', model:row['型号'] || '',
        specification:row['参数描述'] || row['规格描述'] || '', package:row['封装'] || '',
        brand:row['品牌'] || '', lcsc_code:row['立创编号'] || '', unit:'PCS',
      }));
    }, Array.from(fs.readFileSync(rfLibraryPath)))
    : [];
  const rows = parsed.map(row => ({
    '型号':row.Comment || '', '位号':row.Designator || '', '封装':row.Footprint || '',
    '立创编号':row['嘉立创元件编号'] || row['立创元件编号'] || '',
  }));
  const codes = [...new Set(rows.map(row => String(row['立创编号'] || '').trim()).filter(code => /^C\d+$/i.test(code)))];
  const officialByCode = Object.create(null);
  for (let offset = 0; offset < codes.length; offset += 30) {
    const chunk = codes.slice(offset, offset + 30);
    const response = await fetch('https://techphant-bom-v3-d9e3pqqb0b46c88.service.tcloudbase.com/lcsc/batch?codes=' + encodeURIComponent(chunk.join(',')));
    assert(response.ok, `LCSC detail endpoint failed: HTTP ${response.status}`);
    const payload = await response.json();
    for (const result of payload.results || []) {
      if (result && result.ok && result.data && result.data.hit) officialByCode[result.data.productCode] = result.data;
    }
  }

  const result = await page.evaluate(({rows, standardLibrary, rfLibrary, officialByCode, filename}) => {
    const alerts = [];
    const captures = [];
    window.alert = message => alerts.push(String(message));
    const fields = ['物料编码','物料名称','型号','参数描述','位号','数量','单位','封装','品牌','立创编号','备注'];
    const fm = Object.fromEntries(fields.map(field => [field, field]));
    window.A = {fm, hd:fields, _raw:new ArrayBuffer(8), rows:[]};
    window.B = {fm, hd:fields, _fn:filename, rows};
    window.materialDB_standard = standardLibrary;
    window.materialDB_rf_inductor = rfLibrary;
    window.setActiveLib('standard');
    window.JSZip = {};
    window.patchAndDownloadXlsx = (_raw, dataRows, _stats, _details, _dl, _tl, headers) => {
      captures.push([headers].concat(dataRows));
      return Promise.resolve();
    };
    window.fmtCore('AB', officialByCode);
    const supplementErrors = (window.OFFLINE_SUPPLEMENT_STATE && window.OFFLINE_SUPPLEMENT_STATE.errors) || [];
    return {
      alerts,
      captures,
      supplementErrors,
      supplementText:document.getElementById('offlineSupplementModal')?.textContent || '',
      supplementVisible:document.getElementById('offlineSupplementModal')?.style.display === 'block',
    };
  }, {rows, standardLibrary, rfLibrary, officialByCode, filename:path.basename(bomPath)});

  const gate = result.supplementErrors.map(item => `${item.ref} / ${item.model}：缺少${item.fields.join('、')}`).join('\n');
  console.log(gate || result.alerts.join(' | '));
  assert(result.supplementVisible, 'Expected the real BOM to open the supplement modal.');
  assert.match(result.supplementText, /搜索立创并补齐/);
  assert.match(result.supplementText, /不会写入任何物料库/);
  assert(gate, `Expected the real BOM to report only unresolved technical fields. Alerts: ${result.alerts.join(' | ')}`);
  assert(!/L3\s*\//.test(gate), `L3 complete official data was still blocked: ${gate}`);
  assert(!/L21\s*\//.test(gate), `L21 official product-name tolerance was still blocked: ${gate}`);
  assert(/C37,C70,C74/.test(gate), '22uF dielectric should remain blocked with the current standard-library snapshot.');
  assert(!/L7,L9/.test(gate) || /L7,L9[^\n]*缺少额定电流/.test(gate), 'L7/L9 must never lose value or tolerance.');
  assert(!/L22/.test(gate) || /L22[^\n]*缺少精度/.test(gate), 'L22 must retain official current and only require tolerance.');
  assert(!/L23/.test(gate) || /L23[^\n]*缺少精度/.test(gate), 'L23 must retain official current and only require tolerance.');
  console.log('real LCSC BOM regression passed');
  console.log(gate);
  await browser.close();
})().catch(async error => {
  if (browser) await browser.close();
  console.error(error);
  process.exitCode = 1;
});
