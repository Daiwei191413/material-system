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
  browser = await chromium.launch({ headless:true, executablePath:edgePath });
  const page = await browser.newPage();
  await page.route('**/*', async route => {
    if (route.request().url().startsWith('file:')) await route.continue();
    else await route.abort();
  });

  for (const [label, relativePath] of targets) {
    await page.goto(pathToFileURL(path.join(repoRoot, relativePath)).href, {
      waitUntil:'domcontentloaded', timeout:30000,
    });
    await page.waitForFunction(() => typeof window.fmtCore === 'function');

    const result = await page.evaluate(() => {
      const captures = [];
      const alerts = [];
      window.alert = message => alerts.push(String(message));
      window.JSZip = {};
      window.patchAndDownloadXlsx = (_raw, dataRows, _stats, details, _dl, _tl, headers) => {
        captures.push({rows:[headers].concat(dataRows), details});
        return Promise.resolve();
      };

      const fields = ['物料编码','物料名称','型号','参数描述','位号','数量','单位','封装','品牌','立创编号','备注'];
      const fm = Object.fromEntries(fields.map(field => [field, field]));
      window.A = {fm, hd:fields, _raw:new ArrayBuffer(8), rows:[]};
      window.B = {
        fm, hd:fields, _fn:'TP1211-MK36-关键器件回归.xlsx',
        rows:[
          {'物料名称':'未分类','型号':'SW8006Q','参数描述':'','位号':'U3','单位':'PCS','封装':'QFN24-0_5-4_05X4_05HS2_75-H0_9','品牌':'客户邮寄','立创编号':'C9900053302'},
          {'物料名称':'未分类','型号':'FW3104','参数描述':'立创占位参数','位号':'U5','单位':'PCS','封装':'fw3104','品牌':'客户邮寄','立创编号':'C9900037742'},
          {'物料名称':'嘉立创SMT','型号':'TP6300','参数描述':'立创占位参数','位号':'U12','单位':'PCS','封装':'qfn32-0_4-4_0x4_0hs2_8-h0_8','品牌':'客户邮寄','立创编号':'C9900208522'},
        ],
      };
      const standards = [
        {material_code:'1-RF-01-00009',name:'贴片功放',model:'SW8006Q',specification:'型号：SW8006, 工作频率：400MHz~510MHz, 工作电压：3.3V~5V, OutPower：36.5dBm',package:'qfn24-0_5-4_05x4_05hs2_75-h0_9a',brand:'矽磊',lcsc_code:'',unit:'PCS'},
        {material_code:'1-SW-09-00002',name:'射频开关',model:'FW3104',specification:'工作频率：100MHz~6.0GHz, 插入损耗：0.45dB@100MHz~900MHz',package:'fw3104',brand:'通量科技',lcsc_code:'',unit:'PCS'},
        {material_code:'1-IC-06-00012',name:'无线收发芯片',model:'TP6300',specification:'Sub-1G(40M~1070MHz) S-FSK调制解调器 最大链路预算达170 dB',package:'QFN32_TP6300',brand:'技象',lcsc_code:'',unit:'PCS'},
      ];
      window.materialDB_standard = standards;
      window.materialDB_rf_inductor = [];
      window.setActiveLib('standard');
      const nonInductorErrors = rfInductorLibraryCandidateErrors(window.B.rows[0], standards[0]);
      window.fmtCore('AB', {
        C9900053302:{hit:true,productCode:'C9900053302',productModel:'定制QFN24 IC',productType:'未分类',brand:'客户邮寄',package:'QFN-24_4X4',_extracted:{}},
        C9900037742:{hit:true,productCode:'C9900037742',productModel:'定制DFN8PIN IC',productType:'未分类',brand:'客户邮寄',package:'DFN-8',_extracted:{}},
        C9900208522:{hit:true,productCode:'C9900208522',productModel:'26MHz BGA Chip 32PIN 定制',productType:'嘉立创SMT',brand:'客户邮寄',package:'BGA-32',_extracted:{}},
      });

      const rfSource = {'型号':'39nH','参数描述':'39nH','位号':'L7,L9','数量':2,'单位':'PCS','封装':'SL0402','立创编号':'C98060'};
      const rfRecord = {
        name:'绕线电感',model:'LQW15AN39NG00D',specification:'电感值：39nH, 精度：±2%, 额定电流：250mA, 直流电阻(DCR)：700mΩ, 封装：0402, Q值：25@250MHz',
        package:'SL0402',brand:'muRata(村田)',lcsc_code:'C98059',unit:'PCS',category:'射频电感指定件',remark:'射频电感值=39nH',
      };
      window.materialDB_standard = [];
      window.materialDB_rf_inductor = [rfRecord];
      window.setActiveLib('standard');
      const rfChoice = findRfInductorPreference(rfSource);
      const rfLock = offlineSupplementRfLock(rfSource);
      window.B = {fm, hd:fields, _fn:'TP1211-MK36-39nH回归.xlsx', rows:[Object.assign({}, rfSource)]};
      window.fmtCore('AB', {C98059:{
        hit:true,productCode:'C98059',productModel:'LQW15AN39NG00D',productType:'绕线电感',brand:'muRata(村田)',package:'0402',
        _extracted:{inductance:'39nH',tolerance:'±2%',current:'250mA'},specification:'直流电阻(DCR)：700mΩ',
      }});

      return {
        captures, alerts, nonInductorErrors, rfChoiceMode:rfChoice.mode,
        rfMatchedByValuePackage:!!rfChoice.matchedByValuePackage,
        rfChoiceCode:normLcsc(rfChoice.record && rfChoice.record.lcsc_code), rfLock,
        placeholderChecks:['未分类','嘉立创SMT','客户邮寄','邮寄专用'].map(isCatalogPlaceholderValue),
      };
    });

    assert.strictEqual(result.captures.length, 2, `${label}: expected two exports; alerts=${result.alerts.join(' | ')}`);
    const toObjects = capture => {
      const [header, ...rows] = capture.rows;
      return rows.map(row => Object.fromEntries(header.map((field, index) => [field, row[index]])));
    };
    const keyRows = toObjects(result.captures[0]);
    const byRef = Object.fromEntries(keyRows.map(row => [row['位号'], row]));
    assert.deepStrictEqual(result.nonInductorErrors, [], `${label}: SW8006Q was incorrectly checked as an RF inductor`);
    assert.deepStrictEqual(result.placeholderChecks, [true,true,true,true], `${label}: catalog placeholders were not recognized`);
    assert.strictEqual(byRef.U3['物料编码'], '1-RF-01-00009');
    assert.strictEqual(byRef.U3['物料名称'], '贴片功放');
    assert.strictEqual(byRef.U3['品牌'], '矽磊');
    assert.match(byRef.U3['参数描述'], /400MHz~510MHz/);
    assert.strictEqual(byRef.U5['物料编码'], '1-SW-09-00002');
    assert.strictEqual(byRef.U5['物料名称'], '射频开关');
    assert.strictEqual(byRef.U5['品牌'], '通量科技');
    assert.match(byRef.U5['参数描述'], /0\.45dB/);
    assert.strictEqual(byRef.U12['物料编码'], '1-IC-06-00012');
    assert.strictEqual(byRef.U12['物料名称'], '无线收发芯片');
    assert.strictEqual(byRef.U12['品牌'], '技象');
    assert.match(byRef.U12['参数描述'], /Sub-1G/);

    assert.strictEqual(result.rfChoiceMode, 'exact', `${label}: 39nH/C98060 did not use the RF library`);
    assert.strictEqual(result.rfMatchedByValuePackage, true, `${label}: 39nH/C98060 was not resolved by value + package`);
    assert.strictEqual(result.rfChoiceCode, 'C98059', `${label}: wrong RF library target`);
    assert.match(result.rfLock, /已命中射频电感库/, `${label}: manual supplement was not locked`);
    const rfRow = toObjects(result.captures[1])[0];
    assert.strictEqual(rfRow['位号'], 'L7,L9');
    assert.strictEqual(rfRow['数量'], 2);
    assert.strictEqual(rfRow['型号'], 'LQW15AN39NG00D');
    assert.strictEqual(rfRow['物料名称'], '绕线电感');
    assert.strictEqual(rfRow['立创编号'], 'C98059');
    assert.strictEqual(rfRow['品牌'], 'muRata(村田)');
    assert.match(rfRow['参数描述'], /39nH/);
    assert.match(rfRow['参数描述'], /±2%/);
    assert.match(rfRow['备注'], /射频库归一：源C98060 → 指定C98059/);
    assert(!/C26443|SDCL1005C39NJTDF/.test(JSON.stringify(rfRow)), `${label}: old manual candidate leaked into RF output`);
    assert(result.captures[1].details.some(item => item.level === 'rf' && /C98060/.test((item.warnings || []).join(''))), `${label}: RF trace missing from supplement report`);
    console.log(`${label}: key-component and RF-priority regression passed`);
  }

  await browser.close();
})().catch(async error => {
  if (browser) await browser.close();
  console.error(error.stack || error);
  process.exitCode = 1;
});
