const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let playwrightCore;
try {
  playwrightCore = require('playwright-core');
} catch (error) {
  const bundledPath = path.join(
    process.env.USERPROFILE || '',
    '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core',
  );
  playwrightCore = require(bundledPath);
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
  ['domestic', pathToFileURL(path.join(repoRoot, 'v3-cloudbase/web/index.html')).href, 'V1.0.18'],
  ['overseas', pathToFileURL(path.join(repoRoot, 'v3-legacy/index.html')).href, 'V3.0.42'],
];

(async () => {
  const browser = await chromium.launch({
    headless: true,
    executablePath: edgePath,
  });
  const page = await browser.newPage();
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (url.startsWith('file:')) await route.continue();
    else await route.abort();
  });

  for (const [label, url, version] of targets) {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => typeof window.isNcNoFitValue === 'function');
    const result = await page.evaluate((expectedVersion) => {
      const negativeCases = ['NC7SZ125', 'NCP1117', 'CONNECTOR', '10K/NC1', '10K'];
      const positives = [
        { Value: 'NC', Reference: 'R1', 'PCB Footprint': 'R0402' },
        { Value: '10K/NC', Reference: 'R2,R3', 'PCB Footprint': 'R0402' },
        { Value: '100nF / nc', Reference: 'C1', 'PCB Footprint': 'C0402' },
        { Value: `10uH${String.fromCharCode(92)}NC`, Reference: 'L1', 'PCB Footprint': 'L0603' },
        { Value: '22pF\uFF0FNC', Reference: 'C2', 'PCB Footprint': 'C0402' },
      ];
      window.runConvert(positives);
      return {
        versionFound: document.title.includes(expectedVersion),
        negativeResults: negativeCases.map((value) => [value, window.isNcNoFitValue(value)]),
        statuses: window.CONV_OUT.map((row) => row.status),
        reasons: window.CONV_OUT.map((row) => row.dnpReason),
        dnpCount: document.getElementById('convStatDnp').textContent,
        outputCount: window.CONV_OUT.length,
      };
    }, version);

    assert(result.versionFound, `${label}: expected version ${version}`);
    assert(result.negativeResults.every(([, matched]) => !matched), `${label}: real model classified as NC`);
    assert.strictEqual(result.outputCount, 5, `${label}: expected five NC groups`);
    assert(result.statuses.every((status) => status === 'dnp'), `${label}: NC row was not removed`);
    assert(result.reasons.every((reason) => reason === 'NC \u7a7a\u8d34\uff08BOM\u6807\u8bb0\uff09'), `${label}: audit reason missing`);
    assert.strictEqual(result.dnpCount, '6', `${label}: expected six removed references`);
    console.log(`${label}: browser NC/DNP flow passed`);
  }

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
