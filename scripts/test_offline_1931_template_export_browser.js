const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { chromium } = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));
const XLSX = require('../v3-cloudbase/web/assets/vendor/xlsx.full.min.js');

const root = path.resolve(__dirname, '..');
const output = process.env.BOM_1931_TEST_OUTPUT;
const edge = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(fs.existsSync);
assert(output && /^D:[\\/]/i.test(output), 'BOM_1931_TEST_OUTPUT must be on D:');
assert(edge, 'Microsoft Edge is required');
fs.mkdirSync(output, { recursive:true });

const mime = {'.html':'text/html; charset=utf-8','.js':'application/javascript; charset=utf-8','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
const server = http.createServer((req, res) => {
  const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + requested);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, {'Content-Type':mime[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});

const fixture = [
  {'物料名称':'贴片电容(MLCC)','型号':'4.7uF SC0201','参数描述':'MLCC 4.7uF ±20% 6.3V X5R SMD 0201','位号':'C2,C4','数量':2,'单位':'PCS','封装':'SC0201'},
  {'物料名称':'贴片电容','型号':'12pF SC0201','参数描述':'MLCC 12pF ±2% 50V COG SMD 0201','位号':'C15','数量':1,'单位':'PCS','封装':'SC0201'},
  {'物料名称':'贴片电阻','型号':'10K SR0201','参数描述':'厚膜电阻 10000Ω ±1% 50mW SMD 0201','位号':'R1,R2','数量':2,'单位':'PCS','封装':'SR0201'},
  {'物料名称':'贴片电感','型号':'LQW15AN22NJ00D','_mfgPart':'LQW15AN22NJ00D','参数描述':'绕线电感, 22nH, 0402, ±5%, 额定电流310mA','位号':'L3','数量':1,'单位':'PCS','封装':'SL0402'},
  {'物料名称':'贴片电感','型号':'LQG15HS10NJ02D','_mfgPart':'LQG15HS10NJ02D','参数描述':'贴片电感, 10nH, 0402, ±5%, 额定电流500mA','位号':'L13','数量':1,'单位':'PCS','封装':'SL0402'},
  {'物料名称':'晶振','型号':'XL7KI-TFS-32M','参数描述':'32MHz 晶振','位号':'Y2','数量':1,'单位':'PCS','封装':'SMD-3225_4P'},
  {'物料名称':'晶振','型号':'WN4026M00018T5074006','参数描述':'26MHz TCXO','位号':'Y4','数量':1,'单位':'PCS','封装':'SMD-2016_4P'},
];

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({headless:true, executablePath:edge});
  try {
    for (const [label, relative] of [['domestic','v3-cloudbase/web/index.html'],['overseas','v3-legacy/index.html']]) {
      const page = await browser.newPage({acceptDownloads:true});
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.route('**/*', route => {
        const url = route.request().url();
        if (url.startsWith(base + '/')) return route.continue();
        if (url.includes('cdn.jsdelivr.net/npm/xlsx@')) return route.fulfill({path:path.join(root,'v3-cloudbase/web/assets/vendor/xlsx.full.min.js'),contentType:'application/javascript'});
        if (url.includes('cdn.jsdelivr.net/npm/jszip@')) return route.fulfill({path:path.join(root,'v3-cloudbase/web/assets/vendor/jszip.min.js'),contentType:'application/javascript'});
        return route.abort();
      });
      await page.goto(`${base}/${relative}`, {waitUntil:'domcontentloaded'});
      await page.waitForFunction(() => document.getElementById('msgA')?.textContent.includes('已就绪'), null, {timeout:12000});
      assert.equal(await page.evaluate(() => BUILTIN_TEMPLATE_PREVIEW.rows.length), 43, `${label}: 1931 template preview count changed`);
      await page.evaluate(rows => {
        document.body.classList.remove('v3-not-logged');
        document.getElementById('v3LoginMask')?.classList.remove('show');
        B = {rows:rows.map(row => ({...row})), _fn:'A-01-02-00999-TEST-V9.9嘉立创BOM.xlsx'};
        materialDB_standard = [];
        setActiveLib('standard');
        document.getElementById('boardName').value = 'TEST主板';
        document.getElementById('boardErp').value = 'A-01-02-00999';
        document.getElementById('boardVersion').value = 'V9.9';
        window.__testAlerts = [];
        window.alert = message => window.__testAlerts.push(String(message));
      }, fixture);

      const downloadEvent = page.waitForEvent('download', {timeout:15000}).catch(() => null);
      await page.evaluate(() => fmtCore('AB', Object.create(null)));
      const download = await downloadEvent;
      assert(download, `${label}: export blocked: ${await page.evaluate(() => window.__testAlerts.join(' | '))}`);
      const saved = path.join(output, `${label}-1931.xlsx`);
      await download.saveAs(saved);
      const workbook = XLSX.read(fs.readFileSync(saved), {type:'buffer'});
      assert.deepEqual(workbook.SheetNames, ['封面','单板BOM','补齐报告']);
      const cover = workbook.Sheets['封面'];
      const bom = workbook.Sheets['单板BOM'];
      assert.match(String(cover.D9?.v || ''), /TEST主板/);
      assert.match(String(cover.D10?.v || ''), /A-01-02-00999/);
      assert.match(String(cover.D11?.v || ''), /V9\.9/);
      assert.match(String(bom.E3?.v || ''), /V9\.9/);
      const rows = XLSX.utils.sheet_to_json(bom, {header:1,defval:''}).slice(5).filter(row => row.some(value => value !== ''));
      assert.equal(rows.length, fixture.length);
      const byRef = Object.fromEntries(rows.map(row => [String(row[5]), row]));
      assert.deepEqual(byRef['C2,C4'].slice(2,10), ['陶瓷电容器','4.7uF','MLCC 4.7uF ±20% 6.3V X5R SMD 0201','C2,C4',2,'PCS','0201','']);
      assert.equal(byRef['C15'][4], 'MLCC 12pF ±2% 50V C0G SMD 0201');
      assert.deepEqual(byRef['R1,R2'].slice(2,9), ['厚膜电阻','10K','厚膜电阻 10KΩ,精度：±1%,50mW,SMD 0201','R1,R2',2,'PCS','0201']);
      assert.deepEqual(byRef['L3'].slice(2,9), ['绕线电感','LQW15AN22NJ00D','电感值:22nH,精度:±5%,额定电流:310mA,SMD 0402','L3',1,'PCS','0402']);
      assert.deepEqual(byRef['L13'].slice(2,9), ['叠层电感','LQG15HS10NJ02D','电感值:10nH,精度:±5%,额定电流:500mA,SMD 0402','L13',1,'PCS','0402']);
      assert.deepEqual(byRef['Y2'].slice(2,9), ['晶振','XL7KI-TFS-32M','32MHz 晶振','Y2',1,'PCS','SMD-3225_4P']);
      assert.deepEqual(byRef['Y4'].slice(2,9), ['晶振','WN4026M00018T5074006','26MHz TCXO','Y4',1,'PCS','SMD-2016_4P']);
      assert.equal(pageErrors.length, 0, `${label}: ${pageErrors.join(' | ')}`);
      console.log(`${label}: 1931 workbook export passed (${saved})`);
      await page.close();
    }
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error.stack || error); server.close(); process.exitCode = 1; });
