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
  ['domestic', 'v3-cloudbase/web/index.html', 'V1.0.58'],
  ['overseas', 'v3-legacy/index.html', 'V3.0.82'],
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
      const alerts = [];
      window.alert = message => alerts.push(String(message));
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

      const fields = ['型号', '物料名称', '参数描述', '封装', '位号', '立创编号', '品牌', '单位', '物料编码', '备注'];
      const fm = Object.fromEntries(fields.map((field) => [field, field]));
      window.A = {
        fm,
        hd: fields,
        _raw: new ArrayBuffer(8),
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

      window.JSZip = {};
      window.patchAndDownloadXlsx = (_raw, dataRows, _stats, _details, _dl, _tl, headers) => {
        captures.push([headers].concat(dataRows));
        return Promise.resolve();
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
        specification: '电感值：220nH, 精度：±5%, 额定电流：540mA, SMD 0402',
        lcsc_code: 'C703735',
        mfg_part: 'LQW15AN22NJ00D',
      }];
      window.setActiveLib('standard');
      window.fmtCore('AB', Object.create(null));

      const crystalSource = {
        '型号': '26MHz_TCXO',
        '封装': 'SMD-2016_4P',
        '位号': 'Y3',
        '立创编号': 'C51892018',
      };
      const crystalStandard = {
        material_code: '1-CR-04-00009',
        name: '温补晶振TCXO',
        model: 'WN4026M00018T5074006',
        specification: 'TXCO 26Mhz 2PPM 1.8V -40°C~85°C',
        package: 'SMD-2016_4P',
        brand: 'JWT(晶威特)',
      };
      const crystalOfficial = {
        hit: true,
        productCode: 'C51892018',
        productModel: 'WN4026M00018T5074006',
        productName: '【邮寄专用】WN4026M00018T5074006',
        productType: '嘉立创SMT',
        remark: '【邮寄专用】WN4026M00018T5074006',
        brand: 'JWT(晶威特)',
        package: 'SMD2016-4P',
        _extracted: {},
      };
      window.B.rows = [crystalSource];
      window.materialDB_standard = [crystalStandard];
      window.setActiveLib('standard');
      window.fmtCore('AB', { C51892018: crystalOfficial });

      window.B.rows = [{
        '型号': '12pF', '封装': 'SC0201', '位号': 'C16,C25', '立创编号': 'C85890',
      }];
      window.materialDB_standard = [{
        material_code: '1-CA-TEST-00001', name: '贴片电容(MLCC)',
        model: 'GRM0335C1H120JA01D', specification: 'MLCC 12pF ±5% 50V C0G SMD 0201',
        package: '0201', brand: 'muRata(村田)', lcsc_code: 'C85890',
      }];
      window.setActiveLib('standard');
      window.fmtCore('AB', Object.create(null));

      window.B.rows = [{
        '型号': '12nH', '封装': 'smd332_12nh', '位号': 'L11', '立创编号': 'C9900070550',
      }];
      window.materialDB_standard = [{
        material_code: '1-IN-09-00036', name: '功率电感', model: 'SMDS332-12N_RS',
        specification: '电感值：12.1nH, 精度：±5%, 额定电流：4.4A, 直流电阻(DCR)：7.0mΩ,封装：SMDS332, Q值：130@2MHz',
        package: 'SMDS332-12N', brand: '纳亨电子', lcsc_code: 'C9900070550',
      }];
      window.setActiveLib('standard');
      window.fmtCore('AB', { C9900070550: {
        hit: true, productCode: 'C9900070550', productModel: 'smd332_12nh',
        productType: '未分类', productName: 'smd332_12nh', brand: '客户邮寄',
        package: 'SMD-2P', remark: 'smd332_12nh', _extracted: {},
      } });

      const placeholderCases = [
        { ref:'L4', code:'C86129', value:'22nH', pkg:'SL0402', name:'功率电感', mpn:'LQW15AN22NG00D' },
        { ref:'L12', code:'C95966', value:'2.2uH', pkg:'SL0603', name:'贴片电感', mpn:'MCL1608S2R2MT' },
        { ref:'L24', code:'C98064', value:'4.7nH', pkg:'SL0402', name:'功率电感', mpn:'LQW15AN4N7B00D' },
        { ref:'L25,L26', code:'C185892', value:'240@100', pkg:'SL0201', name:'磁珠', mpn:'PZ0603D241-R35TF' },
      ];
      window.B.rows = placeholderCases.map(item => ({
        '型号':item.value, '封装':item.pkg, '位号':item.ref, '立创编号':item.code,
      }));
      window.materialDB_standard = placeholderCases.map(item => ({
        name:item.name, model:item.value, package:item.pkg, lcsc_code:item.code,
        specification:item.name + '，' + item.value,
      }));
      window.setActiveLib('standard');
      const placeholderOfficial = Object.fromEntries(placeholderCases.map(item => [item.code, {
        hit:true, productCode:item.code, productModel:item.mpn,
        productType:item.name, package:item.pkg.replace(/^SL/i, ''),
        _extracted:item.name === '磁珠' ? {} : {inductance:item.value,tolerance:'±5%',current:'500mA'},
        specification:item.name + '，' + item.value,
      }]));
      window.fmtCore('AB', placeholderOfficial);

      const pendingSource = {
        '位号':'L30', '型号':'NEW-RF-22N', '参数描述':'绕线电感 22nH SMD 0402',
        '封装':'SL0402', '立创编号':'C12345678', '品牌':'Sample',
      };
      const ordinarySource = {
        designator:'L31', comment:'22nH', footprint:'0402',
      };
      window.materialDB_rf_inductor = [];
      const pendingChoice = findRfInductorPreference(pendingSource);
      const pendingBrandPlan = getLcscBrandPlan({
        designator:'L30', comment:'NEW-RF-22N', footprint:'0402', lcsc:'C12345678',
      });
      const ordinaryBrandPlan = getLcscBrandPlan(ordinarySource);
      window.materialDB_rf_inductor = [{
        lcsc_code:'C12345678', model:'NEW-RF-22N', specification:'电感值：22nH',
        package:'SL0402', brand:'Sample', name:'绕线电感',
      }];
      const exactChoice = findRfInductorPreference(pendingSource);
      const valuePackageChoice = findRfInductorPreference({
        '位号':'L31', '型号':'22nH', '参数描述':'22nH', '封装':'SL0402',
      });
      const ordinaryDifferentPackageChoice = findRfInductorPreference({
        '位号':'L32', '型号':'22nH', '参数描述':'22nH', '封装':'SL0603',
      });
      window.materialDB_rf_inductor = [];

      return {
        alerts,
        captureCount: captures.length,
        versionFound: document.title.includes(expectedVersion),
        official: captures[0],
        fallback: captures[1],
        crystal: captures[2],
        capacitor: captures[3],
        l11: captures[4],
        placeholderModels: captures[5],
        placeholderChecks: {
          inductance: inductorModelIsParameterPlaceholder('22nH'),
          inductanceWithPackage: inductorModelIsParameterPlaceholder('2.2uH SL0603'),
          ferrite: inductorModelIsParameterPlaceholder('240@100'),
          formal: inductorModelIsParameterPlaceholder('SMDS332-12N_RS'),
        },
        crystalType: detectMaterialType(crystalSource),
        crystalInductance: parseInductanceNh(crystalSource['型号']),
        crystalAuthority: isInductorAuthorityRow(crystalSource),
        rfDecisionChecks: {
          pendingMode: pendingChoice.mode,
          pendingIdentityType: pendingChoice.identity && pendingChoice.identity.type,
          pendingBrandPlan,
          ordinaryBrands: ordinaryBrandPlan && ordinaryBrandPlan.brands.map(item => item.name),
          exactMode: exactChoice.mode,
          valuePackageMode: valuePackageChoice.mode,
          ordinaryDifferentPackage: ordinaryDifferentPackageChoice,
        },
      };
    }, version);

    assert(result.versionFound, `${label}: expected version ${version}`);
    assert.strictEqual(result.captureCount, 6, `${label}: expected six exports, got ${result.captureCount}; ${result.alerts.join(' | ')}`);
    const header = result.official[0];
    const officialRow = Object.fromEntries(header.map((field, index) => [field, result.official[1][index]]));
    const fallbackRow = Object.fromEntries(header.map((field, index) => [field, result.fallback[1][index]]));
    const crystalRow = Object.fromEntries(header.map((field, index) => [field, result.crystal[1][index]]));
    const capacitorRow = Object.fromEntries(header.map((field, index) => [field, result.capacitor[1][index]]));
    const l11Row = Object.fromEntries(header.map((field, index) => [field, result.l11[1][index]]));
    const placeholderRows = result.placeholderModels.slice(1).map(row => Object.fromEntries(header.map((field, index) => [field, row[index]])));
    const placeholderByRef = Object.fromEntries(placeholderRows.map(row => [row['位号'], row]));

    assert.strictEqual(officialRow['型号'], 'LQW15CAR22J00D', `${label}: official MPN missing`);
    assert.strictEqual(officialRow['物料名称'], '绕线电感', `${label}: official LQW classification incorrect`);
    assert(officialRow['参数描述'].includes('220nH'), `${label}: official inductance missing`);
    assert.strictEqual(officialRow['参数描述'], '电感值:220nH,精度:±5%,额定电流:540mA,SMD 0402', `${label}: official 1931 inductor format incorrect`);
    assert.strictEqual(fallbackRow['型号'], 'LQW15AN22NJ00D', `${label}: verified company MPN missing`);
    assert(fallbackRow['参数描述'].includes('220nH'), `${label}: fallback lost B inductance`);
    assert(!/(^|\D)22nH/i.test(fallbackRow['参数描述']), `${label}: fallback copied template/library specification`);
    assert.strictEqual(result.crystalType, 'crystal', `${label}: 26MHz_TCXO was not classified as crystal`);
    assert.strictEqual(result.crystalInductance, null, `${label}: MHz was parsed as mH`);
    assert.strictEqual(result.crystalAuthority, false, `${label}: Y3 entered the inductor authority flow`);
    assert.strictEqual(crystalRow['物料编码'], '1-CR-04-00009', `${label}: Y3 did not match the company standard library`);
    assert.strictEqual(crystalRow['物料名称'], '温补晶振TCXO', `${label}: Y3 name was overwritten`);
    assert.strictEqual(crystalRow['型号'], 'WN4026M00018T5074006', `${label}: Y3 standard model missing`);
    assert(!/电感|26mH(?=$|[\s_\-/,，;；()])/i.test(crystalRow['参数描述']), `${label}: Y3 retained an inductor description: ${JSON.stringify(crystalRow)}`);
    assert(String(crystalRow['备注']).includes('关键器件'), `${label}: Y3 was not marked as a key component`);
    assert.strictEqual(capacitorRow['型号'], '12pF', `${label}: capacitor model was not normalized to the 1931 value-only format`);
    assert.strictEqual(capacitorRow['封装'], '0201', `${label}: capacitor package was not normalized to the 1931 text format`);
    assert.strictEqual(l11Row['物料编码'], '1-IN-09-00036', `${label}: L11 did not match the company standard library`);
    assert.strictEqual(l11Row['型号'], 'SMDS332-12N_RS', `${label}: L11 standard model was overwritten by postal item data`);
    assert(String(l11Row['备注']).includes('关键器件'), `${label}: L11 was not marked as a key component`);
    assert.strictEqual(result.placeholderChecks.inductance, true, `${label}: 22nH placeholder was not detected`);
    assert.strictEqual(result.placeholderChecks.inductanceWithPackage, true, `${label}: inductance placeholder with package was not detected`);
    assert.strictEqual(result.placeholderChecks.ferrite, true, `${label}: ferrite impedance placeholder was not detected`);
    assert.strictEqual(result.placeholderChecks.formal, false, `${label}: formal company model was treated as a placeholder`);
    assert.strictEqual(result.rfDecisionChecks.pendingMode, 'source', `${label}: new explicitly identified inductor was not kept as pending`);
    assert.strictEqual(result.rfDecisionChecks.pendingIdentityType, 'lcsc', `${label}: LCSC identity did not take precedence`);
    assert.strictEqual(result.rfDecisionChecks.pendingBrandPlan, null, `${label}: explicitly identified inductor entered ordinary brand fallback`);
    assert.deepStrictEqual(result.rfDecisionChecks.ordinaryBrands, ['村田', '顺络', '风华'], `${label}: ordinary inductor brand priority changed`);
    assert.strictEqual(result.rfDecisionChecks.exactMode, 'exact', `${label}: RF library identity match was not selected`);
    assert.strictEqual(result.rfDecisionChecks.valuePackageMode, 'exact', `${label}: value and package RF library fallback was not selected`);
    assert.strictEqual(result.rfDecisionChecks.ordinaryDifferentPackage.mode, 'none', `${label}: unmatched value and package was treated as an RF library conflict`);
    assert.strictEqual(result.rfDecisionChecks.ordinaryDifferentPackage.ordinary, true, `${label}: unmatched value and package did not enter ordinary inductor flow`);
    assert.strictEqual(placeholderByRef.L4['型号'], 'LQW15AN22NG00D', `${label}: L4 placeholder model was not replaced`);
    assert.strictEqual(placeholderByRef.L12['型号'], 'MCL1608S2R2MT', `${label}: L12 placeholder model was not replaced`);
    assert.strictEqual(placeholderByRef.L24['型号'], 'LQW15AN4N7B00D', `${label}: L24 placeholder model was not replaced`);
    assert.strictEqual(placeholderByRef['L25,L26']['型号'], 'PZ0603D241-R35TF', `${label}: ferrite placeholder model was not replaced`);
    console.log(`${label}: browser inductor authority flow passed`);
  }

  await browser.close();
})().catch(async (error) => {
  if (browser) await browser.close();
  console.error(error);
  process.exitCode = 1;
});
