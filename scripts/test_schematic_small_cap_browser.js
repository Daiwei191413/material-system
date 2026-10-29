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
    for (const [label, relativePath, version] of targets) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.route('**/*', async (route) => {
        if (route.request().url().startsWith('file:')) await route.continue();
        else await route.abort();
      });
      await page.goto(pathToFileURL(path.join(repoRoot, relativePath)).href, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof window.convSmallCapToleranceError === 'function');

      const result = await page.evaluate(({ version }) => {
        const capRow = (comment, ref = 'C1') => ({
          refs: [ref], designator: ref, comment, footprint: 'SC0402', status: 'unmatched', verification: 'not_applicable', lcsc: '',
        });
        const makeDetail = (capacitance, tolerance) => ({
          hit: true,
          productCode: 'C-TEST',
          productType: '贴片电容',
          productName: `贴片电容 ${capacitance} ${tolerance || ''}`,
          package: '0402',
          _extracted: { capacitance, tolerance: tolerance || '' },
        });
        const errors = (value, tolerance) => validateLcscMapping(capRow(value), makeDetail(value, tolerance));

        const alerts = [];
        let confirmed = false;
        let exported = false;
        window.alert = (message) => alerts.push(String(message));
        window.confirm = () => { confirmed = true; return true; };
        window.XLSX = {
          utils: { aoa_to_sheet: () => ({}), book_new: () => ({}), book_append_sheet: () => {} },
          writeFile: () => { exported = true; },
        };
        window.CONV_OUT = [capRow('6pF')];
        exportJlcBom();

        return {
          versionFound: document.title.includes(version),
          pf: [
            convSmallCapPf(capRow('5.6pF')),
            convSmallCapPf(capRow('10pF')),
            convSmallCapPf(capRow('12pF')),
            convSmallCapPf(capRow('0R', 'C18')),
          ],
          badAbsolute: errors('6pF', '±0.25pF'),
          goodAbsolute: errors('6pF', '±0.1pF'),
          badPercent: errors('5pF', '±2%'),
          tenPfPercent: errors('10pF', '±1%'),
          missingTolerance: errors('6pF', ''),
          aboveThreshold: errors('12pF', '±5%'),
          strictBad: lcscCandidateIsStrictForRow(capRow('6pF'), { _detail: makeDetail('6pF', '±0.25pF') }),
          strictGood: lcscCandidateIsStrictForRow(capRow('6pF'), { _detail: makeDetail('6pF', '±0.1pF') }),
          exportAlert: alerts.join('\n'),
          confirmed,
          exported,
          helpText: document.getElementById('convertPanel').textContent,
        };
      }, { version });

      assert(result.versionFound, `${label}: expected ${version}`);
      assert(Math.abs(result.pf[0] - 5.6) < 1e-9, `${label}: 5.6pF not detected`);
      assert.strictEqual(result.pf[1], null, `${label}: 10pF must be outside the strict less-than rule`);
      assert.strictEqual(result.pf[2], null, `${label}: 12pF should be outside rule`);
      assert.strictEqual(result.pf[3], null, `${label}: C18 0R exception was misclassified`);
      assert(result.badAbsolute.some((message) => message.includes('实际精度为±0.25pF')), `${label}: ±0.25pF was not blocked`);
      assert(!result.goodAbsolute.some((message) => message.includes('公司规则')), `${label}: ±0.1pF was rejected`);
      assert(result.badPercent.some((message) => message.includes('实际精度为±2%')), `${label}: percentage tolerance was accepted below 10pF`);
      assert(!result.tenPfPercent.some((message) => message.includes('公司规则')), `${label}: 10pF incorrectly received company rule`);
      assert(result.missingTolerance.some((message) => message.includes('未提供可核验精度')), `${label}: missing tolerance was not blocked`);
      assert(!result.aboveThreshold.some((message) => message.includes('公司规则')), `${label}: 12pF incorrectly received company rule`);
      assert.strictEqual(result.strictBad, false, `${label}: bad candidate passed strict filter`);
      assert.strictEqual(result.strictGood, true, `${label}: compliant candidate failed strict filter`);
      assert.match(result.exportAlert, /已停止导出.*小于10pF电容/s, `${label}: hard export gate did not fire`);
      assert.strictEqual(result.confirmed, false, `${label}: hard rule fell through to manual bypass`);
      assert.strictEqual(result.exported, false, `${label}: blocked BOM was exported`);
      assert.match(result.helpText, /小于10pF的电容.*±0\.1pF/s, `${label}: UI rule notice missing`);
      console.log(`${label}: schematic small-cap hard rule passed`);
      await context.close();
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
