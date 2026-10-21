const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));
const XLSX = require('../v3-cloudbase/web/assets/vendor/xlsx.full.min.js');
const JSZip = require('../v3-cloudbase/web/assets/vendor/jszip.min.js');

const root = path.resolve(__dirname, '..');
const output = process.env.BOM_TEMPLATE_TEST_OUTPUT;
const useRealLcsc = process.env.BOM_TEMPLATE_REAL_LCSC === '1';
const liveLcscUrl = 'https://techphant-bom-v3-d9e3pqqb0b46c88.service.tcloudbase.com/lcsc';
const source = 'D:/桌面/TP1211-MK36/BOM/A-01-02-00259-TP1211-MK36_V1.0嘉立创BOM.xlsx';
const standardSource = path.join(root, 'backups/2026-09-30/domestic-cloudbase/物料库_公司标准_2026-09-30.xlsx');
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(fs.existsSync);
assert(output && /^D:[\\/]/i.test(output), 'BOM_TEMPLATE_TEST_OUTPUT must be on D:');
assert(fs.existsSync(source), 'LCSC BOM fixture is missing');
assert(fs.existsSync(standardSource), 'standard library fixture is missing');
assert(edge, 'Microsoft Edge is required');
fs.mkdirSync(output, { recursive: true });

const standardWorkbook = XLSX.read(fs.readFileSync(standardSource), { type:'buffer' });
const standardLibrary = XLSX.utils.sheet_to_json(standardWorkbook.Sheets[standardWorkbook.SheetNames[0]], { defval:'' }).map(row => ({
  material_code:row['物料编码'] || '', name:row['物料名称'] || '', model:row['型号'] || '',
  specification:row['参数描述'] || '', package:row['封装'] || '', brand:row['品牌'] || '',
  lcsc_code:row['立创编号'] || '', unit:row['单位'] || 'PCS', remark:row['备注'] || ''
}));

const mime = { '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
const server = http.createServer((req, res) => {
  const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + requested);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

async function inspectOutput(filename, expectedRows) {
  const data = fs.readFileSync(filename);
  const workbook = XLSX.read(data, { type:'buffer' });
  assert.deepEqual(workbook.SheetNames, ['封面', '单板BOM', '补齐报告']);
  const cover = workbook.Sheets['封面'];
  const bom = workbook.Sheets['单板BOM'];
  assert.match(String(cover.D9?.v || ''), /TP1211-MK36主板/);
  assert.match(String(cover.D10?.v || ''), /A-01-02-00259/);
  assert.match(String(cover.D11?.v || ''), /V1\.0/);
  assert.match(String(bom.A2?.v || ''), /TP1211-MK36主板/);
  assert.match(String(bom.E2?.v || ''), /TP1211-MK36主板PCBA/);
  assert.match(String(bom.A3?.v || ''), /A-01-02-00259/);
  assert.match(String(bom.E3?.v || ''), /V1\.0/);
  for (const cell of ['A23','B23','E23','F23','G23','A24','B24','E24','F24','G24']) assert.equal(cover[cell]?.v ?? '', '', `old revision remains in ${cell}`);
  const rows = XLSX.utils.sheet_to_json(bom, { header:1, defval:'' });
  const dataRows = rows.slice(5).filter(row => row.some(value => value !== ''));
  assert.equal(dataRows.length, expectedRows);
  assert.equal(rows[5][5], 'C2,C4');
  const inductors = dataRows.filter(row => /(^|[,，;\s])(L|FB)\d+/i.test(String(row[5] || '')));
  assert.equal(inductors.length, 16, 'inductor row count changed');
  assert(inductors.every(row => String(row[2] || '').trim()), 'inductor material name is blank');
  assert(inductors.every(row => String(row[4] || '').trim()), 'inductor specification is blank');
  const byRef = Object.fromEntries(inductors.map(row => [String(row[5]), row]));
  assert.equal(byRef['L1,L2'][2], useRealLcsc ? '片式磁珠' : '磁珠');
  assert.match(String(byRef['L1,L2'][4]), /240欧@100MHz/);
  assert.equal(byRef['L3'][2], useRealLcsc ? '贴片绕线电感' : '贴片电感');
  assert.match(String(byRef['L3'][4]), /220nH/);
  assert.equal(byRef['L11'][2], '贴片电感');
  assert.match(String(byRef['L11'][4]), /12nH/);
  assert.match(String(byRef['L11'][10]), /参数待核实/);
  assert(inductors.every(row => !/，\s*[-—]+\s*，/.test(String(row[4] || ''))), 'placeholder parameter leaked into inductor specification');
  if (useRealLcsc) {
    assert.equal(byRef['L1,L2'][3], 'BLM15BC241SN1D');
    assert.match(String(byRef['L1,L2'][4]), /700mΩ/);
    assert.equal(byRef['L3'][3], 'LQW15CAR22J00D');
    assert.match(String(byRef['L3'][4]), /540mA/);
    const crystal = dataRows.find(row => /XL7KI-TFS-32M/i.test(String(row[3] || '')));
    assert(crystal, 'XL-32M did not use the official model for the second standard-library match');
    assert.equal(crystal[1], '1-CR-01-00031');
    assert.match(String(crystal[10] || ''), /关键器件/);
  }
  const c18 = dataRows.find(row => String(row[5] || '').split(/[,，;\s]+/).includes('C18'));
  assert(c18, 'C18 missing');
  assert.match(String(c18[3]), /^0R\s+SR0201$/i);
  assert.match(String(c18[4]), /0Ω.*0201/i);
  assert.doesNotMatch(String(c18[4]), /0402/i);
  const cap22u = dataRows.find(row => /C37/.test(String(row[5] || '')));
  assert(cap22u, '22uF capacitor group missing');
  assert.match(String(cap22u[4]), /22uF/i);
  assert.doesNotMatch(String(cap22u[4]), /22000000pF|22F/i);
  const keyedRows = dataRows.filter(row => String(row[1] || '').trim());
  assert(keyedRows.length > 0, 'standard library did not supply internal material codes');
  assert(keyedRows.every(row => /关键器件/.test(String(row[10] || ''))), 'an internal material code was not marked as a key component');
  const expectedKeyParts = new Map([
    ['U3','1-RF-01-00009'], ['U5','1-SW-09-00002'], ['U7','1-IC-03-00031'],
    ['U12','1-IC-06-00012'], ['Y2','1-CR-01-00031'],
  ]);
  if (useRealLcsc) expectedKeyParts.forEach((materialCode, ref) => {
    const row = dataRows.find(item => String(item[5] || '') === ref);
    assert(row, `${ref}: key component row missing`);
    assert.equal(row[1], materialCode, `${ref}: internal material code missing`);
    assert.match(String(row[10] || ''), /关键器件/, `${ref}: key-component remark missing`);
  });
  const visible = [...Object.values(cover), ...Object.values(bom)].filter(cell => cell && typeof cell === 'object' && Object.hasOwn(cell,'v')).map(cell => String(cell.v)).join(' ');
  assert(!visible.includes('TP1506-MS22') && !visible.includes('TP1506-M22'), 'old board name remains visible');
  const zip = await JSZip.loadAsync(data);
  assert(Object.keys(zip.files).some(name => name.startsWith('xl/media/')), 'cover image missing');
  return { rows:expectedRows, sheets:workbook.SheetNames, bytes:data.length };
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless:true, executablePath:edge });
  const results = [];
  try {
    for (const [label, relative] of [['domestic','v3-cloudbase/web/index.html'],['overseas','v3-legacy/index.html']]) {
      const context = await browser.newContext({ acceptDownloads:true });
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.route('**/*', route => {
        const url = route.request().url();
        if (url.startsWith(base + '/')) return route.continue();
        if (useRealLcsc && url.startsWith(liveLcscUrl)) return route.continue();
        if (url.includes('cdn.jsdelivr.net/npm/xlsx@')) return route.fulfill({ path:path.join(root,'v3-cloudbase/web/assets/vendor/xlsx.full.min.js'), contentType:'application/javascript' });
        if (url.includes('cdn.jsdelivr.net/npm/jszip@')) return route.fulfill({ path:path.join(root,'v3-cloudbase/web/assets/vendor/jszip.min.js'), contentType:'application/javascript' });
        return route.abort();
      });
      await page.goto(`${base}/${relative}`, { waitUntil:'domcontentloaded' });
      await page.waitForFunction(() => /已就绪|加载失败/.test(document.getElementById('msgA')?.textContent || ''), null, { timeout:12000 });
      const templateStatus = await page.locator('#msgA').textContent();
      assert(templateStatus.includes('已就绪'), `${label}: ${templateStatus}; page errors: ${pageErrors.join(' | ')}`);
      await page.evaluate(standardRows => {
        document.body.classList.remove('v3-not-logged');
        document.getElementById('v3LoginMask')?.classList.remove('show');
        window.materialDB_standard = standardRows;
        localStorage.setItem('material_db_standard', JSON.stringify(standardRows));
        window.BOM_STANDARD_SYNC = {status:'ready', count:standardRows.length, error:''};
        setActiveLib('standard');
        showPanelDirect('compare');
      }, standardLibrary);
      if (useRealLcsc) await page.evaluate(url => { LCSC_WORKER_URL = url; }, liveLcscUrl);
      assert.equal(await page.evaluate(() => A.rows.length), 0, 'template data rows were used');
      assert.equal(await page.evaluate(() => extractBoardInfo('A-01-02-00195-TP1506-MS22_V1.1嘉立创BOM.xlsx').tp), 'TP1506-M22');
      assert.equal(await page.locator('#fileA').count(), 0, 'old template upload is still present');
      assert.equal(await page.locator('#expBtn').isVisible(), false, 'obsolete difference report is visible');
      await page.locator('#fileB').setInputFiles(source);
      await page.waitForFunction(() => document.getElementById('msgB')?.textContent.includes('✅'));
      const expectedRows = await page.evaluate(() => B.rows.length);
      assert(expectedRows > 0);
      assert.equal(await page.locator('#boardName').inputValue(), 'TP1211-MK36主板');
      assert.equal(await page.locator('#boardErp').inputValue(), 'A-01-02-00259');
      assert.equal(await page.locator('#boardVersion').inputValue(), 'V1.0');
      assert.equal(await page.locator('#goBtn').isDisabled(), false);
      await page.locator('#goBtn').click();
      assert.match(await page.locator('#checkSummary').textContent(), /已读取立创BOM/);
      assert.equal(await page.locator('#fmtAB').isDisabled(), false);
      await page.evaluate(realLcsc => {
        window.alert = () => {};
        window.confirm = () => true;
        if (!realLcsc) window.verifyBomAuthority = () => Promise.resolve({ mismatches:[], failedCodes:[], byCode:Object.create(null) });
      }, useRealLcsc);
      const downloadEvent = page.waitForEvent('download', { timeout:30000 });
      await page.locator('#fmtAB').click();
      const download = await downloadEvent;
      const saved = path.join(output, `${label}${useRealLcsc ? '-real' : ''}-generated.xlsx`);
      await download.saveAs(saved);
      const workbook = await inspectOutput(saved, expectedRows);
      assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
      results.push({ label, lcsc:useRealLcsc ? 'real' : 'fallback', template:'loaded', rows:expectedRows, workbook, pageErrors });
      await context.close();
    }
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.route('**/*', route => route.request().url().startsWith(base + '/') ? route.continue() : route.abort());
    await page.route('**/assets/offline-bom-format-template.xlsx*', route => route.fulfill({ status:404, body:'missing' }));
    await page.goto(`${base}/v3-cloudbase/web/index.html`, { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => document.getElementById('msgA')?.textContent.includes('加载失败'));
    await page.evaluate(() => {
      document.body.classList.remove('v3-not-logged');
      document.getElementById('v3LoginMask')?.classList.remove('show');
      showPanelDirect('compare');
    });
    await page.locator('#fileB').setInputFiles(source);
    await page.waitForFunction(() => document.getElementById('msgB')?.textContent.includes('✅'));
    assert.equal(await page.locator('#goBtn').isDisabled(), true, 'conversion enabled without template');
    assert.equal(await page.locator('#retryTemplateBtn').isVisible(), true, 'retry control missing');
    await page.unroute('**/assets/offline-bom-format-template.xlsx*');
    await page.locator('#retryTemplateBtn').click();
    await page.waitForFunction(() => document.getElementById('msgA')?.textContent.includes('已就绪'));
    assert.equal(await page.locator('#goBtn').isDisabled(), false, 'conversion did not recover after retry');
    results.push({ label:'missing-template', conversionBlocked:true, retryVisible:true, retryRecovered:true });
    await context.close();
    fs.writeFileSync(path.join(output, useRealLcsc ? 'browser-results-real.json' : 'browser-results.json'), JSON.stringify(results, null, 2));
    console.log('PASS', JSON.stringify(results));
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error.stack || error); server.close(); process.exitCode = 1; });
