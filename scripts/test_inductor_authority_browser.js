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
  ['domestic', 'v3-cloudbase/web/index.html', 'V1.0.24'],
  ['overseas', 'v3-legacy/index.html', 'V3.0.48'],
];

let browser;
(async () => {
  browser = await chromium.launch({ headless: true, executablePath: edgePath });
  const page = await browser.newPage();
  await page.route('**/*', async (route) => {
    if (route.request().url().startsWith('file:')) await route.continue();
    else await route.abort();
  });

  for (const [label, relativePath, version] of targets) {
    await page.goto(pathToFileURL(path.join(repoRoot, relativePath)).href, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForFunction(() => typeof window.fmtCore === 'function');

    const result = await page.evaluate((expectedVersion) => {
      const captures = [];
      window.alert = () => {};
      window.XLSX = {
        utils: {
          book_new: () => ({ SheetNames: [], Sheets: {} }),
          aoa_to_sheet: (rows) => ({ rows }),
          book_append_sheet: (workbook, sheet, name) => {
            workbook.SheetNames.push(name);
            workbook.Sheets[name] = sheet;
          },
        },
        writeFile: (workbook) => captures.push(workbook.Sheets['整理后BOM'].rows),
      };

      const fields = ['型号', '物料名称', '参数描述', '封装', '位号', '立创编号', '品牌', '单位'];
      const fm = Object.fromEntries(fields.map((field) => [field, field]));
      window.A = {
        fm,
        hd: fields,
        rows: [{
          '型号': 'LQW15AN22NJ00D',
          '物料名称': '绕线电感',
          '参数描述': '绕线电感 22nH SMD 0402',
          '封装': '0402',
          '位号': 'L4',
        }],
      };
      window.B = {
        fm,
        hd: fields,
        _fn: 'A-01-02-00256-TP1212-MS20_V1_0嘉立创BOM.xlsx',
        rows: [{
          '型号': '220nH',
          '物料名称': '功率电感',
          '参数描述': '220nH',
          '封装': 'SL0402',
          '位号': 'L4',
          '立创编号': 'C703735',
        }],
      };

      const official = {
        hit: true,
        productCode: 'C703735',
        productModel: 'LQW15CAR22J00D',
        productType: '功率电感',
        brand: 'muRata(村田)',
        package: '0402',
        _extracted: { inductance: '220nH', tolerance: '±5%', current: '540mA' },
        specification: '直流电阻(DCR)：-, 直流电阻(DCR)：290mΩ',
      };

      window.materialDB_standard = [];
      window.setActiveLib('standard');
      window.fmtCore('AB', { C703735: official });

      window.materialDB_standard = [{
        model: '220nH',
        package: 'SL0402',
        name: '绕线电感',
        specification: '绕线电感 22nH SMD 0402',
        lcsc_code: 'C703735',
        mfg_part: 'LQW15AN22NJ00D',
      }];
      window.setActiveLib('standard');
      window.fmtCore('AB', Object.create(null));

      return {
        versionFound: document.title.includes(expectedVersion),
        official: captures[0],
        fallback: captures[1],
      };
    }, version);

    assert(result.versionFound, `${label}: expected version ${version}`);
    const header = result.official[0];
    const officialRow = Object.fromEntries(header.map((field, index) => [field, result.official[1][index]]));
    const fallbackRow = Object.fromEntries(header.map((field, index) => [field, result.fallback[1][index]]));

    assert.strictEqual(officialRow['型号'], 'LQW15CAR22J00D', `${label}: official MPN missing`);
    assert(officialRow['参数描述'].includes('220nH'), `${label}: official inductance missing`);
    assert(officialRow['参数描述'].includes('DCR 290mΩ'), `${label}: official DCR missing`);
    assert.strictEqual(fallbackRow['型号'], '220nH', `${label}: fallback copied template/library MPN`);
    assert(fallbackRow['参数描述'].includes('220nH'), `${label}: fallback lost B inductance`);
    assert(!/(^|\D)22nH/i.test(fallbackRow['参数描述']), `${label}: fallback copied template/library specification`);
    console.log(`${label}: browser inductor authority flow passed`);
  }

  await browser.close();
})().catch(async (error) => {
  if (browser) await browser.close();
  console.error(error);
  process.exitCode = 1;
});
