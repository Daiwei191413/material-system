const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let playwrightCore;
try {
  playwrightCore = require('playwright-core');
} catch (_error) {
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
  ['domestic', 'v3-cloudbase/web/index.html', 'V1.0.23'],
  ['overseas', 'v3-legacy/index.html', 'V3.0.47'],
];

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: edgePath });
  const page = await browser.newPage();
  await page.route('**/*', async (route) => {
    if (route.request().url().startsWith('file:')) await route.continue();
    else await route.abort();
  });

  for (const [label, relativePath, version] of targets) {
    const url = pathToFileURL(path.join(repoRoot, relativePath)).href;
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForFunction(() => typeof window.runCostEstimate === 'function');

    const result = await page.evaluate(async (expectedVersion) => {
      const validRows = window.sanitizeCostLibraryItems([
        { model: 'KEY-A', package: 'QFN-32', price: '3.21' },
        { model: 'KEY-COMMA', package: 'QFN-40', price: '1,234.56' },
        { model: 'BAD-TEXT', package: 'QFN-20', price: '1abc' },
        { model: 'BAD-ZERO', package: 'QFN-20', price: '0' },
        { model: 'BAD-PKG', package: '', price: '1.5' },
      ]);

      window.materialDB_cost = [
        { model: 'KEY-A', package: 'QFN-32', lcsc_code: 'C900001', price: '3.21' },
        { model: 'KEY-B', package: 'QFN-24', lcsc_code: '', price: '4.56' },
        { model: 'KEY-B', package: 'QFN-48', lcsc_code: 'C900099', price: '7.89' },
      ];
      const exact = window.costFindCompanyPrice(
        { '型号': 'key-a', '封装': 'QFN-32', '立创编号': 'C900001' },
        'C900001',
      );
      const modelRequired = window.costFindCompanyPrice(
        { '型号': 'OTHER', '封装': 'QFN-32', '立创编号': 'C900001' },
        'C900001',
      );
      const optionalCodeFallback = window.costFindCompanyPrice(
        { '型号': 'KEY-B', '封装': 'QFN-24', '立创编号': 'C900088' },
        'C900088',
      );
      const codeConflict = window.costFindCompanyPrice(
        { '型号': 'KEY-A', '封装': 'QFN-32', '立创编号': 'C900002' },
        'C900002',
      );

      window.materialDB_cost = [
        { model: 'KEY-A', package: 'QFN-32', lcsc_code: 'C900001', price: '3.21' },
        { model: 'KEY-C', package: 'QFN-20', lcsc_code: 'C900010', price: '9.99' },
      ];
      const requestedCodes = [];
      window.fetchLcscDetailsByCodes = async (codes) => {
        requestedCodes.push(...codes);
        return {
          C900002: {
            ok: true,
            data: {
              hit: true,
              productCode: 'C900002',
              productModel: 'OTHER-POST',
              productName: '客户邮寄专用元件',
              package: 'QFN-16',
              stockNum: 0,
              priceLadder: [{ startNumber: 100, endNumber: -1, productPrice: 0.125 }],
            },
          },
          C900003: {
            ok: true,
            data: {
              hit: true,
              productCode: 'C900003',
              productModel: 'R-10K',
              productName: '贴片电阻',
              package: '0402',
              stockNum: 100000,
              priceLadder: [{ startNumber: 1, endNumber: -1, productPrice: 0.2 }],
            },
          },
        };
      };
      window.COST_BOM = {
        fm: { '数量': '数量' },
        _fn: 'cost-library-test.xlsx',
        rows: [
          { '型号': 'KEY-A', '封装': 'QFN-32', '立创编号': 'C900001', '数量': 1 },
          { '型号': 'KEY-C', '封装': 'QFN-20', '立创编号': 'C900011', '数量': 1 },
          { '型号': 'OTHER-POST', '封装': 'QFN-16', '立创编号': 'C900002', '数量': 1 },
          { '型号': 'R-10K', '封装': '0402', '立创编号': 'C900003', '数量': 1 },
        ],
      };
      document.getElementById('costBuildQty').value = '10';
      await window.runCostEstimate();
      const beforeManual = window.COST_RESULT.rows.map((row) => ({
        status: row.status,
        priceSource: row.priceSource,
        finalUnitPrice: row.finalUnitPrice,
      }));
      window.updateCostManualPrice(1, '2.50');
      const afterManual = window.COST_RESULT.rows[0];

      window.switchLib('cost');
      window.materialDB_lcsc = [{ model: 'LCSC-ONLY', package: 'QFN-16', lcsc_code: 'C811111' }];
      window.materialDB_standard = [{ model: 'STD-ONLY', package: 'QFN-20', lcsc_code: 'C822222' }];
      window.materialDB_cost = [{ model: 'COST-ONLY', package: 'QFN-24', lcsc_code: 'C833333', price: '8.88' }];
      window.setActiveLib('cost');
      const lcscIsolationMatch = window.matchForLcsc({ '型号': 'LCSC-ONLY', '封装': 'QFN-16' });
      const standardIsolationMatch = window.matchForStandard({ '型号': 'STD-ONLY', '封装': 'QFN-20' });
      const activeAfterMatches = {
        lib: window.currentLib,
        isCostRef: window.materialDB === window.materialDB_cost,
      };
      window.saveMaterialDB();
      const savedCostModel = JSON.parse(localStorage.getItem('material_db_cost'))[0].model;
      const clearPrompts = [];
      window.confirm = (message) => { clearPrompts.push(message); return true; };
      window.alert = () => {};
      async function clearIsolationCase(lib) {
        window.materialDB_lcsc = [{ model: 'KEEP-LCSC', package: '0603', lcsc_code: 'C811111' }];
        window.materialDB_standard = [{ model: 'KEEP-STD', package: '0805', lcsc_code: 'C822222' }];
        window.materialDB_cost = [{ model: 'KEEP-COST', package: 'QFN-24', lcsc_code: 'C833333', price: '8.88' }];
        localStorage.setItem('material_db_lcsc', JSON.stringify(window.materialDB_lcsc));
        localStorage.setItem('material_db_standard', JSON.stringify(window.materialDB_standard));
        localStorage.setItem('material_db_cost', JSON.stringify(window.materialDB_cost));
        window.switchLib(lib);
        await window.clearMaterialData();
        return {
          lcsc: window.materialDB_lcsc.length,
          standard: window.materialDB_standard.length,
          cost: window.materialDB_cost.length,
          lcscStored: localStorage.getItem('material_db_lcsc') !== null,
          standardStored: localStorage.getItem('material_db_standard') !== null,
          costStored: localStorage.getItem('material_db_cost') !== null,
        };
      }
      const clearIsolation = {
        lcsc: await clearIsolationCase('lcsc'),
        standard: await clearIsolationCase('standard'),
        cost: await clearIsolationCase('cost'),
      };
      return {
        versionFound: document.title.includes(expectedVersion),
        validRows,
        exact: { price: exact.hit && exact.hit.price, matchedBy: exact.matchedBy },
        modelRequired: { hit: !!modelRequired.hit, keyComponent: modelRequired.keyComponent },
        optionalCodeFallback: {
          price: optionalCodeFallback.hit && optionalCodeFallback.hit.price,
          matchedBy: optionalCodeFallback.matchedBy,
        },
        codeConflict: { hit: !!codeConflict.hit, keyComponent: codeConflict.keyComponent, reason: codeConflict.reason },
        requestedCodes,
        beforeManual,
        afterManual: {
          status: afterManual.status,
          priceSource: afterManual.priceSource,
          finalUnitPrice: afterManual.finalUnitPrice,
        },
        activeLib: window.currentLib,
        costHintVisible: getComputedStyle(document.getElementById('libHintCost')).display !== 'none',
        cleanButtonHidden: getComputedStyle(document.getElementById('btnCleanSpecs')).display === 'none',
        tableHeaders: document.getElementById('matTableHead').textContent.replace(/\s+/g, ''),
        importBoundary: {
          costIntoStandard: window.isCostLibraryBoundaryConflict('standard', 'cost'),
          standardIntoCost: window.isCostLibraryBoundaryConflict('cost', 'standard'),
          standardIntoLcsc: window.isCostLibraryBoundaryConflict('lcsc', 'standard'),
          unknownIntoCost: window.isCostLibraryBoundaryConflict('cost', 'unknown'),
        },
        importButtonText: document.getElementById('btnImportMat').textContent.trim(),
        isolation: {
          lcscModel: lcscIsolationMatch.hit && lcscIsolationMatch.hit.model,
          standardModel: standardIsolationMatch.hit && standardIsolationMatch.hit.model,
          activeAfterMatches,
          savedCostModel,
        },
        clearIsolation,
        clearPrompts,
      };
    }, version);

    assert(result.versionFound, `${label}: expected version ${version}`);
    assert.deepStrictEqual(result.validRows.map((row) => [row.model, row.price]), [
      ['KEY-A', '3.21'],
      ['KEY-COMMA', '1234.56'],
    ], `${label}: cost prices were not normalized and validated`);
    assert.deepStrictEqual(result.exact, { price: '3.21', matchedBy: '型号+立创编号' }, `${label}: exact cost match failed`);
    assert.deepStrictEqual(result.modelRequired, { hit: false, keyComponent: false }, `${label}: LCSC code bypassed required model match`);
    assert.strictEqual(result.optionalCodeFallback.price, '4.56', `${label}: blank cost-library code did not fall back to model/package`);
    assert(result.optionalCodeFallback.matchedBy.includes('型号+封装'), `${label}: optional-code match reason missing`);
    assert(!result.codeConflict.hit && result.codeConflict.keyComponent, `${label}: conflicting cost-library code was not blocked`);
    assert.deepStrictEqual(result.requestedCodes.sort(), ['C900002', 'C900003'], `${label}: key components were still sent to LCSC pricing`);
    assert.deepStrictEqual(result.beforeManual, [
      { status: 'companyPrice', priceSource: '公司成本库', finalUnitPrice: 3.21 },
      { status: 'costConflict', priceSource: '', finalUnitPrice: 0 },
      { status: 'unconfirmedCost', priceSource: '', finalUnitPrice: 0 },
      { status: 'priced', priceSource: '立创商城', finalUnitPrice: 0.2 },
    ], `${label}: automatic price priority/status regression`);
    assert.deepStrictEqual(result.afterManual, {
      status: 'manualPrice',
      priceSource: '手动采购价',
      finalUnitPrice: 2.5,
    }, `${label}: manual price did not override company price`);
    assert.strictEqual(result.activeLib, 'cost', `${label}: cost library tab did not activate`);
    assert(result.costHintVisible && result.cleanButtonHidden, `${label}: cost library controls are inconsistent`);
    assert(result.tableHeaders.includes('型号封装立创编号单价操作'), `${label}: cost library table headers missing`);
    assert.deepStrictEqual(result.importBoundary, {
      costIntoStandard: true,
      standardIntoCost: true,
      standardIntoLcsc: false,
      unknownIntoCost: false,
    }, `${label}: cost-library import boundary is not isolated`);
    assert.strictEqual(result.importButtonText, '💰 导入成本库 Excel', `${label}: cost import action is ambiguous`);
    assert.deepStrictEqual(result.isolation, {
      lcscModel: 'LCSC-ONLY',
      standardModel: 'STD-ONLY',
      activeAfterMatches: { lib: 'cost', isCostRef: true },
      savedCostModel: 'COST-ONLY',
    }, `${label}: cost library leaked into an existing library or matching flow`);
    assert.deepStrictEqual(result.clearIsolation, {
      lcsc: { lcsc: 0, standard: 1, cost: 1, lcscStored: false, standardStored: true, costStored: true },
      standard: { lcsc: 1, standard: 0, cost: 1, lcscStored: true, standardStored: false, costStored: true },
      cost: { lcsc: 1, standard: 1, cost: 0, lcscStored: true, standardStored: true, costStored: false },
    }, `${label}: clearing one library changed another library`);
    assert(result.clearPrompts.length === 3 && result.clearPrompts.every((prompt) => prompt.includes('其他两个库不受影响')), `${label}: clear prompt does not explain three-library isolation`);
    console.log(`${label}: cost-library matching and price-priority flow passed`);
  }

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
