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

function detail(code, withPrice) {
  return {
    productCode: code,
    productModel: code === 'C1000' ? 'GRM-4U7' : 'NO-PRICE',
    productType: '贴片电容',
    productName: 'MLCC 4.7uF 10V X5R 0402',
    package: '0402',
    brand: 'muRata(村田)',
    stockNum: 12345,
    paramLinkedMap: { 容值: '4.7uF', 精度: '±10%' },
    _extracted: { capacitance: '4.7uF', tolerance: '±10%' },
    priceLadder: withPrice ? [
      { startNumber: 1, endNumber: 499, productPrice: 0.0932 },
      { startNumber: 500, endNumber: 1499, productPrice: 0.0714 },
      { startNumber: 1500, endNumber: -1, productPrice: 0.0658 },
    ] : [],
  };
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: edgePath });
  try {
    for (const [label, relativePath, expectedVersion] of targets) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.route('**/*', async (route) => {
        const requestUrl = route.request().url();
        if (requestUrl.includes('/batch?codes=')) {
          const codes = decodeURIComponent(new URL(requestUrl).searchParams.get('codes') || '').split(',').filter(Boolean);
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              ok: true,
              results: codes.map((code) => ({ ok: true, data: detail(code, code === 'C1000') })),
            }),
          });
        } else if (requestUrl.startsWith('file:')) {
          await route.continue();
        } else {
          await route.abort();
        }
      });

      await page.goto(pathToFileURL(path.join(repoRoot, relativePath)).href, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => typeof window.lcscUnitPriceAt1000 === 'function');

      const main = await page.evaluate(({ expectedVersion }) => {
        const pricedDetail = {
          productCode: 'C1000', productModel: 'GRM-4U7', productType: '贴片电容',
          productName: 'MLCC 4.7uF 10V X5R 0402', package: '0402', brand: 'muRata(村田)',
          stockNum: 12345, _extracted: { capacitance: '4.7uF', tolerance: '±10%' },
          priceLadder: [
            { startNumber: 1, endNumber: 499, productPrice: 0.0932 },
            { startNumber: 500, endNumber: 1499, productPrice: 0.0714 },
            { startNumber: 1500, endNumber: -1, productPrice: 0.0658 },
          ],
        };
        const noPriceDetail = Object.assign({}, pricedDetail, { productCode: 'CEMPTY', productModel: 'NO-PRICE', priceLadder: [] });
        const rows = [
          { comment: '4.7uF', designator: 'C1', footprint: 'SC0402', refs: ['C1'], lcsc: 'C1000', status: 'matched', matchLevel: 2 },
          { comment: '4.7uF', designator: 'C2', footprint: 'SC0402', refs: ['C2'], lcsc: 'CEMPTY', status: 'matched', matchLevel: 2 },
        ];
        window.applyOfficialVerification(rows[0], { ok: true, data: pricedDetail });
        window.applyOfficialVerification(rows[1], { ok: true, data: noPriceDetail });
        window.CONV_OUT = rows;
        window.renderConvTable();
        const renderedRows = Array.from(document.querySelectorAll('#convTableBody tr'));
        return {
          title: document.title,
          expectedVersion,
          helperPrice: window.lcscUnitPriceAt1000(pricedDetail),
          helperText: window.lcscUnitPrice1000Text(pricedDetail),
          noPriceText: window.lcscUnitPrice1000Text(noPriceDetail),
          gapPriceText: window.lcscUnitPrice1000Text(Object.assign({}, pricedDetail, {
            priceLadder: [{ startNumber: 1500, endNumber: -1, productPrice: 0.0658 }],
          })),
          postalPriceText: window.lcscUnitPrice1000Text(Object.assign({}, pricedDetail, {
            productName: '客户邮寄专用器件',
          })),
          header: Array.from(document.querySelectorAll('#convTable thead th')).map((el) => el.textContent.trim()),
          firstPrice: renderedRows[0].children[5].textContent.trim(),
          secondPrice: renderedRows[1].children[5].textContent.trim(),
        };
      }, { expectedVersion });

      assert(main.title.includes(expectedVersion), `${label}: version not updated`);
      assert.strictEqual(main.helperPrice, 0.0714, `${label}: 1000 quantity tier selection is wrong`);
      assert.strictEqual(main.helperText, '¥0.0714/PCS', `${label}: helper price display is wrong`);
      assert.strictEqual(main.noPriceText, '', `${label}: missing price must stay blank`);
      assert.strictEqual(main.gapPriceText, '', `${label}: ladder without a 1000 quantity tier must stay blank`);
      assert.strictEqual(main.postalPriceText, '', `${label}: customer-posted item price must stay blank`);
      assert(main.header.includes('1000PCS单价'), `${label}: main table price header missing`);
      assert.strictEqual(main.firstPrice, '¥0.0714/PCS', `${label}: main table price is wrong`);
      assert.strictEqual(main.secondPrice, '', `${label}: main table missing price must stay blank`);

      await page.evaluate(() => {
        window.openLcscSearch(0);
        window._LCSC_SEARCH_IDX = -1;
        window.renderLcscSearchResults({
          ok: true,
          items: [
            { componentCode: 'C1000', componentModel: 'GRM-4U7', componentSpecification: '0402', componentBrand: 'muRata(村田)' },
            { componentCode: 'CEMPTY', componentModel: 'NO-PRICE', componentSpecification: '0402', componentBrand: 'muRata(村田)' },
          ],
        });
      });
      await page.waitForTimeout(800);
      const search = await page.evaluate(() => ({
        headers: Array.from(document.querySelectorAll('#lcscSearchBody thead th')).map((el) => el.textContent.trim()),
        firstPrice: document.getElementById('lcscPrice1000_0').textContent.trim(),
        secondPrice: document.getElementById('lcscPrice1000_1').textContent.trim(),
      }));
      assert(search.headers.includes('1000PCS单价'), `${label}: search table price header missing`);
      assert.strictEqual(search.firstPrice, '¥0.0714/PCS', `${label}: search table price is wrong`);
      assert.strictEqual(search.secondPrice, '', `${label}: search table missing price must stay blank`);

      await context.close();
      console.log(`${label}: LCSC 1000PCS unit price browser check passed`);
    }
  } finally {
    await browser.close();
  }
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
