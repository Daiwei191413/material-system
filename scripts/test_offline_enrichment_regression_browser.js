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
const edgePath = edgeCandidates.find(candidate => fs.existsSync(candidate));
assert(edgePath, 'Microsoft Edge executable not found; set EDGE_PATH to run this browser check.');

const repoRoot = path.resolve(__dirname, '..');
const targets = [
  ['domestic', 'v3-cloudbase/web/index.html'],
  ['overseas', 'v3-legacy/index.html'],
];

let browser;
(async () => {
  browser = await chromium.launch({ headless: true, executablePath: edgePath });
  const page = await browser.newPage();
  await page.route('**/*', async route => {
    if (route.request().url().startsWith('file:')) await route.continue();
    else await route.abort();
  });

  for (const [label, relativePath] of targets) {
    await page.goto(pathToFileURL(path.join(repoRoot, relativePath)).href, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });
    await page.waitForFunction(() => typeof window.resolveStandardCapDielectric === 'function');

    const result = await page.evaluate(() => {
      function officialCap(code, model, value, tolerance, voltage, pkg) {
        return {
          hit:true, productCode:code, productModel:model, productName:`${value} ${tolerance} ${voltage}`,
          productType:'贴片电容(MLCC)', brand:'muRata(村田)', package:pkg,
          _extracted:{capacitance:value,tolerance,voltage,dielectric:''},
        };
      }
      function officialInductor(code, model, productName, pkg, ext, map, specification) {
        return {
          hit:true, productCode:code, productModel:model, productName,
          productType:'贴片电感', brand:'muRata(村田)', package:pkg,
          _extracted:ext || {}, paramLinkedMap:map || {}, specification:specification || '',
        };
      }
      function finishInductor(source, official) {
        const row = Object.assign({}, source);
        applyOfficialSupplement(row, official, false);
        row['型号'] = standardizeModel(row);
        return { row, errors:normalizeOfflineTemplateRow(row) };
      }

      window.materialDB_standard = [
        {name:'陶瓷电容器',model:'1nF',specification:'MLCC 1nF ±10% 25V C0G SMD 0201',package:'0201',lcsc_code:'CSTD1001'},
        {name:'陶瓷电容器',model:'22uF',specification:'MLCC 22uF ±20% 25V X5R SMD 0603',package:'0603',lcsc_code:'CSTD2206'},
      ];
      const c30 = {'型号':'1nF','封装':'SC0201','位号':'C30','立创编号':'C576430','参数描述':'MLCC 1nF ±10% 25V SMD 0201'};
      const c22 = {'型号':'22uF','封装':'SC0603','位号':'C37,C70,C74','立创编号':'C29519229','参数描述':'MLCC 22uF ±20% 25V SMD 0603'};
      const c30Fill = resolveStandardCapDielectric(c30, officialCap('C576430','GRM033B11E102KA01D','1nF','±10%','25V','0201'));
      const c22Fill = resolveStandardCapDielectric(c22, officialCap('C29519229','GRM188C61E226ME01D','22uF','±20%','25V','0603'));
      const c30Errors = normalizeOfflineTemplateRow(c30);
      const c22Errors = normalizeOfflineTemplateRow(c22);

      window.materialDB_standard.push(
        {name:'陶瓷电容器',model:'1nF',specification:'MLCC 1nF ±10% 25V X7R SMD 0201',package:'0201',lcsc_code:'CSTD1002'},
      );
      const conflict = {'型号':'1nF','封装':'SC0201','位号':'C30','立创编号':'C576430','参数描述':'MLCC 1nF ±10% 25V SMD 0201'};
      const conflictResult = resolveStandardCapDielectric(conflict, officialCap('C576430','GRM033B11E102KA01D','1nF','±10%','25V','0201'));
      const conflictErrors = normalizeOfflineTemplateRow(conflict);

      const l3 = finishInductor(
        {'型号':'220nH','封装':'SL0402','位号':'L3','立创编号':'C703735','参数描述':'220nH'},
        officialInductor('C703735','LQW15CAR22J00D','220nH ±5%','0402',
          {inductance:'220nH',tolerance:'±5%',current:'540mA'},
          {'电感值':'220nH','精度':'±5%','额定电流':'540mA','直流电阻(DCR)':'290mΩ'})
      );
      const l7 = finishInductor(
        {'型号':'39nH','封装':'SL0402','位号':'L7,L9','立创编号':'C98060','参数描述':'39nH'},
        officialInductor('C98060','LQW15AN39NJ00D','39nH ±5%','0402',{tolerance:'±5%'},{})
      );
      const l21 = finishInductor(
        {'型号':'1.1nH','封装':'SL0402','位号':'L21','立创编号':'C404613','参数描述':'1.1nH'},
        officialInductor('C404613','MLG1005S1N1BTD25','±0.1nH 1.1nH','0402',
          {inductance:'1.1nH',tolerance:'-',current:'1A'},
          {'电感值':'1.1nH','精度':'-','额定电流':'1A','直流电阻(DCR)':'30mΩ'})
      );
      const l22 = finishInductor(
        {'型号':'1.5nH','封装':'SL0402','位号':'L22','立创编号':'C778759','参数描述':'1.5nH'},
        officialInductor('C778759','MWSD1005C1N5STM01','1.5nH','0402',
          {inductance:'1.5nH',current:'1A'},
          {'电感值':'1.5nH','额定电流':'1A','直流电阻(DCR)':'30mΩ'})
      );
      const l23 = finishInductor(
        {'型号':'1.6nH','封装':'SL0201','位号':'L23','立创编号':'C370131','参数描述':'1.6nH'},
        officialInductor('C370131','SDCL0603Q1N6ST02B03','1.6nH','0201',
          {inductance:'1.6nH',current:'600mA'},
          {'电感值':'1.6nH','额定电流':'600mA','直流电阻(DCR)':'130mΩ'})
      );

      const companyRf = {'型号':'12nH','封装':'SMDS332-12N','位号':'L11'};
      applyRfInductorPreferred(companyRf, {
        material_code:'1-IN-09-00036', name:'功率电感', model:'SMDS332-12N_RS',
        specification:'公司定型参数', package:'SMDS332-12N', lcsc_code:'C9900070550', brand:'纳亨电子',
      });

      return {c30Fill,c22Fill,c30,c22,c30Errors,c22Errors,conflictResult,conflictErrors,l3,l7,l21,l22,l23,companyRf};
    });

    assert.strictEqual(result.c30Fill.status, 'filled', `${label}: C30 dielectric was not filled`);
    assert.strictEqual(result.c22Fill.status, 'filled', `${label}: 22uF dielectric was not filled`);
    assert.deepStrictEqual(result.c30Errors, [], `${label}: C30 still blocked: ${result.c30Errors}`);
    assert.deepStrictEqual(result.c22Errors, [], `${label}: 22uF still blocked: ${result.c22Errors}`);
    assert.match(result.c30['参数描述'], /C0G/, `${label}: C30 did not use the unique standard dielectric`);
    assert.match(result.c22['参数描述'], /X5R/, `${label}: 22uF did not use the unique standard dielectric`);
    assert.strictEqual(result.conflictResult.status, 'conflict', `${label}: conflicting standard dielectrics were not blocked`);
    assert.deepStrictEqual(result.conflictErrors, ['介质'], `${label}: conflict did not remain an unresolved dielectric`);

    assert.deepStrictEqual(result.l3.errors, [], `${label}: L3 complete official data was blocked: ${result.l3.errors}`);
    assert.strictEqual(result.l3.row['参数描述'], '电感值:220nH,精度:±5%,额定电流:540mA,SMD 0402', `${label}: L3 1931 output changed`);
    assert.deepStrictEqual(result.l7.errors, ['额定电流'], `${label}: L7/L9 should only lack current`);
    assert.deepStrictEqual(result.l21.errors, [], `${label}: L21 product-name tolerance was not recognized`);
    assert.match(result.l21.row['参数描述'], /精度:±0\.1nH/, `${label}: L21 ±0.1nH tolerance missing`);
    assert.deepStrictEqual(result.l22.errors, ['精度'], `${label}: L22 should only lack tolerance: ${JSON.stringify(result.l22.row)}`);
    assert.deepStrictEqual(result.l23.errors, ['精度'], `${label}: L23 should only lack tolerance: ${JSON.stringify(result.l23.row)}`);
    assert.strictEqual(result.companyRf._rfCompanyMaterialAuthoritative, true, `${label}: company RF authority flag missing`);
    assert.strictEqual(result.companyRf['参数描述'], '公司定型参数', `${label}: company RF specification was overwritten`);

    console.log(`${label}: offline enrichment regression checks passed`);
  }

  await browser.close();
})().catch(async error => {
  if (browser) await browser.close();
  console.error(error);
  process.exitCode = 1;
});
