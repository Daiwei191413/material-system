const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));

const root = path.resolve(__dirname, '..');
const edge = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(fs.existsSync);
assert(edge, 'Microsoft Edge is required');

(async () => {
  const browser = await chromium.launch({ headless:true, executablePath:edge });
  try {
    for (const [label, relative] of [
      ['domestic', 'v3-cloudbase/web/index.html'],
      ['overseas', 'v3-legacy/index.html'],
    ]) {
      const page = await browser.newPage();
      const pageErrors = [];
      page.on('pageerror', error => pageErrors.push(error.message));
      await page.route('**/*', route => route.request().url().startsWith('file:') ? route.continue() : route.abort());
      await page.goto(pathToFileURL(path.join(root, relative)).href, { waitUntil:'domcontentloaded' });
      const result = await page.evaluate(() => {
        function run(row) {
          const clone = {...row};
          clone['型号'] = standardizeModel(clone);
          const errors = normalizeOfflineTemplateRow(clone);
          return {row:clone, errors};
        }
        const cap = run({'物料名称':'贴片电容(MLCC)','型号':'4.7uF SC0201','参数描述':'MLCC 4.7uF ±20% 6.3V X5R SMD 0201','封装':'SC0201','位号':'C2,C4'});
        const cog = run({'物料名称':'贴片电容','型号':'12pF SC0201','参数描述':'MLCC 12pF ±2% 50V COG SMD 0201','封装':'SC0201','位号':'C15'});
        const small = run({'物料名称':'贴片电容','型号':'5pF SC0402','参数描述':'MLCC 5pF ±1% 50V NPO SMD 0402','封装':'SC0402','位号':'C17'});
        const resistor = run({'物料名称':'贴片电阻','型号':'10K SR0201','参数描述':'厚膜电阻 10000Ω ±1% 50mW SMD 0201','封装':'SR0201','位号':'R1'});
        const resistor75 = run({'物料名称':'贴片电阻','型号':'75R SR0402','参数描述':'厚膜电阻 75000mΩ ±1% 1/16W SMD 0402','封装':'SR0402','位号':'R17'});
        const wire = run({'物料名称':'贴片电感','型号':'LQW15AN22NJ00D','_mfgPart':'LQW15AN22NJ00D','参数描述':'绕线电感, 22nH, 0402, ±5%, 额定电流310mA','封装':'SL0402','位号':'L3'});
        const multilayer = run({'物料名称':'贴片电感','型号':'LQG15HS10NJ02D','_mfgPart':'LQG15HS10NJ02D','参数描述':'贴片电感, 10nH, 0402, ±5%, 额定电流500mA','封装':'SL0402','位号':'L13'});
        const crystal = {'物料名称':'晶振','型号':'WN4026M00018T5074006','参数描述':'26MHz TCXO','封装':'SMD-2016_4P','位号':'Y4'};
        const crystalBefore = JSON.stringify(crystal);
        const crystalErrors = normalizeOfflineTemplateRow(crystal);
        const missing = run({'物料名称':'贴片电容','型号':'100nF','参数描述':'MLCC 100nF ±10% X7R SMD 0201','封装':'SC0201','位号':'C6'});
        const electrolytic = {'物料名称':'铝电解电容','型号':'10uF','参数描述':'铝电解电容 10uF 25V','封装':'SMD'};
        const electrolyticBefore = JSON.stringify(electrolytic);
        const electrolyticErrors = normalizeOfflineTemplateRow(electrolytic);
        const network = {'物料名称':'排阻','型号':'10K','参数描述':'电阻网络 10KΩ','封装':'0603'};
        const networkBefore = JSON.stringify(network);
        const networkErrors = normalizeOfflineTemplateRow(network);
        const nonCompanyRf = {'型号':'22nH','封装':'SL0402','位号':'L30','立创编号':'C123456'};
        applyRfInductorPreferred(nonCompanyRf, {name:'绕线电感',model:'LQW15AN22NJ00D',specification:'电感值:22nH,精度:±5%',package:'SL0402',lcsc_code:'C123456',brand:'muRata'});
        nonCompanyRf['型号'] = standardizeModel(nonCompanyRf);
        const nonCompanyRfErrors = normalizeOfflineTemplateRow(nonCompanyRf);
        const companyRf = {'型号':'12nH','封装':'SMDS332-12N','位号':'L11','立创编号':'C9900070550'};
        applyRfInductorPreferred(companyRf, {material_code:'1-IN-09-00036',name:'绕线电感',model:'SMDS332-12N_RS',specification:'公司定型参数',package:'SMDS332-12N',lcsc_code:'C9900070550',brand:'纳亨电子'});
        return {cap,cog,small,resistor,resistor75,wire,multilayer,crystal,crystalBefore,crystalErrors,missing,electrolytic,electrolyticBefore,electrolyticErrors,network,networkBefore,networkErrors,nonCompanyRf,nonCompanyRfErrors,companyRf};
      });

      assert.deepEqual(result.cap.errors, [], `${label}: capacitor rejected`);
      assert.deepEqual([result.cap.row['物料名称'], result.cap.row['型号'], result.cap.row['参数描述'], result.cap.row['封装']],
        ['陶瓷电容器','4.7uF','MLCC 4.7uF ±20% 6.3V X5R SMD 0201','0201']);
      assert.equal(result.cog.row['参数描述'], 'MLCC 12pF ±2% 50V C0G SMD 0201', `${label}: C0G normalization failed`);
      assert.equal(result.small.row['参数描述'], 'MLCC 5pF ±0.1pF 50V NP0 SMD 0402', `${label}: small-cap rule failed`);
      assert.deepEqual([result.resistor.row['物料名称'], result.resistor.row['型号'], result.resistor.row['参数描述'], result.resistor.row['封装']],
        ['厚膜电阻','10K','厚膜电阻 10KΩ,精度：±1%,50mW,SMD 0201','0201']);
      assert.equal(result.resistor75.row['参数描述'], '厚膜电阻 75Ω,精度：±1%,1/16W,SMD 0402', `${label}: resistor display failed`);
      assert.deepEqual([result.wire.row['物料名称'], result.wire.row['型号'], result.wire.row['参数描述'], result.wire.row['封装']],
        ['绕线电感','LQW15AN22NJ00D','电感值:22nH,精度:±5%,额定电流:310mA,SMD 0402','0402']);
      assert.deepEqual([result.multilayer.row['物料名称'], result.multilayer.row['型号'], result.multilayer.row['参数描述'], result.multilayer.row['封装']],
        ['叠层电感','LQG15HS10NJ02D','电感值:10nH,精度:±5%,额定电流:500mA,SMD 0402','0402']);
      assert.deepEqual(result.crystalErrors, [], `${label}: Y4 was treated as a target passive`);
      assert.equal(JSON.stringify(result.crystal), result.crystalBefore, `${label}: Y4 changed`);
      assert.deepEqual(result.missing.errors, ['耐压'], `${label}: missing mandatory field was not blocked`);
      assert.deepEqual(result.electrolyticErrors, [], `${label}: electrolytic capacitor was incorrectly gated`);
      assert.equal(JSON.stringify(result.electrolytic), result.electrolyticBefore, `${label}: electrolytic capacitor was incorrectly normalized`);
      assert.deepEqual(result.networkErrors, [], `${label}: resistor network was incorrectly gated`);
      assert.equal(JSON.stringify(result.network), result.networkBefore, `${label}: resistor network was incorrectly normalized`);
      assert.equal(result.nonCompanyRf._rfCompanyMaterialAuthoritative, false, `${label}: RF record without company code received the bypass`);
      assert.deepEqual(result.nonCompanyRfErrors, ['额定电流'], `${label}: RF record without company code skipped mandatory normalization`);
      assert.equal(result.companyRf._rfCompanyMaterialAuthoritative, true, `${label}: company-coded RF record did not receive authority`);
      assert.equal(pageErrors.length, 0, `${label}: ${pageErrors.join(' | ')}`);
      await page.close();
      console.log(`${label}: 1931 normalization checks passed`);
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
