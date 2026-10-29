const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

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

const repoRoot = path.resolve(__dirname, '..');
const screenshotDir = process.env.BOM_SUPPLEMENT_SCREENSHOT_DIR || '';
if (screenshotDir) fs.mkdirSync(screenshotDir, { recursive:true });
const edge = [
  process.env.EDGE_PATH,
  path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe'),
].filter(Boolean).find(fs.existsSync);
assert(edge, 'Microsoft Edge executable not found');

const targets = [
  ['domestic', 'v3-cloudbase/web/index.html'],
  ['overseas', 'v3-legacy/index.html'],
];

let browser;
(async () => {
  browser = await chromium.launch({ headless:true, executablePath:edge });
  for (const [label, relative] of targets) {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route('**/*', route => route.request().url().startsWith('file:') ? route.continue() : route.abort());
    await page.goto(pathToFileURL(path.join(repoRoot, relative)).href, { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => typeof showOfflineSupplementModal === 'function'
      && typeof pickOfflineSupplementCandidate === 'function');

    const result = await page.evaluate(() => {
      const alerts = [];
      window.alert = message => alerts.push(String(message));
      if (typeof hideLogin === 'function') hideLogin();
      window.CONV_OUT = [];
      window.materialDB_standard = [];
      window.materialDB_rf_inductor = [];
      const capRow = {
        '物料名称':'陶瓷电容器', '型号':'22uF', '参数描述':'', '封装':'SC0603',
        '位号':'C37,C70,C74', '立创编号':'C29519229', '品牌':'', '备注':''
      };
      window.B = { rows:[capRow] };
      const capError = {
        row:19, sourceIndex:0, ref:'C37,C70,C74', model:'22uF', package:'SC0603',
        lcsc:'C29519229', fields:['介质'], reason:'立创官方数据和公司标准库补齐后仍未提供'
      };
      showOfflineSupplementModal([capError]);
      const modalText = document.getElementById('offlineSupplementModal').textContent;
      const modalVisible = document.getElementById('offlineSupplementModal').style.display === 'block';
      openOfflineSupplementSearch(0);
      const searchTarget = document.getElementById('lcscSearchTarget').textContent;
      const query = document.getElementById('lcscSearchQ').value;
      const pkg = document.getElementById('lcscSearchPkg').value;

      const capCandidate = {
        componentCode:'C888888', componentModel:'GRM188R61E226ME15', componentSpecification:'0603', componentBrand:'muRata',
        _detail:{
          hit:true, productCode:'C888888', productModel:'GRM188R61E226ME15', package:'0603', brand:'muRata(村田)',
          productType:'贴片电容(MLCC)', productName:'22uF ±20% 25V X5R',
          specification:'MLCC 22uF ±20% 25V X5R SMD 0603',
          paramLinkedMap:{'容值':'22uF','精度':'±20%','额定电压':'25V','介质':'X5R'},
          _extracted:{capacitance:'22uF', tolerance:'±20%', voltage:'25V', dielectric:'X5R'}
        }
      };
      const capCandidateErrors = offlineCandidateErrors(capError, capCandidate);
      document.getElementById('lcscSearchBody')._items = [capCandidate];
      pickLcscCandidate(0);
      const pickedCap = {
        code:capRow['立创编号'], model:capRow['型号'], brand:capRow['品牌'],
        remark:capRow['备注'], manual:capRow._offlineManualPick
      };

      const changedInductorRow = {
        '物料名称':'叠层电感', '型号':'LQW15AN39NJ00D', '_mfgPart':'LQW15AN39NJ00D',
        '原厂型号':'LQW15AN39NJ00D', productModel:'LQW15AN39NJ00D',
        '参数描述':'叠层电感，39nH，±5%，额定电流200mA，0402',
        '封装':'SL0402', '位号':'L7,L9', '立创编号':'C98055', '备注':''
      };
      const changedInductorError = {
        row:35, sourceIndex:0, ref:'L7,L9', model:'LQW15AN39NJ00D', package:'SL0402',
        lcsc:'C98055', fields:['额定电流'], reason:'缺失'
      };
      const changedInductorCandidate = {
        componentCode:'C26443', componentModel:'SDCL1005C39NJTDF',
        _detail:{hit:true,productCode:'C26443',productModel:'SDCL1005C39NJTDF',package:'0402',brand:'Sunlord(顺络)',productType:'贴片电感',productName:'39nH ±5%',specification:'电感值：39nH, 精度：±5%, 额定电流：200mA, 直流电阻(DCR)：1Ω',paramLinkedMap:{'电感值':'39nH','精度':'±5%','额定电流':'200mA','直流电阻(DCR)':'1Ω'},_extracted:{inductance:'39nH',tolerance:'±5%',current:'200mA'}}
      };
      window.B.rows = [changedInductorRow];
      OFFLINE_SUPPLEMENT_STATE.errors = [changedInductorError];
      window._LCSC_SEARCH_IDX = 0;
      window._LCSC_SEARCH_MODE = 'offline';
      pickOfflineSupplementCandidate(changedInductorCandidate);
      const rejectedDifferentCode = alerts[alerts.length - 1] || '';
      const changedInductor = {
        code:changedInductorRow['立创编号'], model:changedInductorRow['型号'],
        mfgPart:changedInductorRow._mfgPart, originalModel:changedInductorRow['原厂型号'],
        productModel:changedInductorRow.productModel,
        identityModel:rfInductorSourceIdentity(changedInductorRow).model,
        authorityErrors:rfInductorSourceOfficialErrors(changedInductorRow, changedInductorCandidate._detail)
      };

      const inductorRow = {
        '物料名称':'叠层电感', '型号':'SDCL0603Q1N6ST02B03', '参数描述':'叠层电感，1.6nH，0201，600mA',
        '封装':'SL0201', '位号':'L23', '立创编号':'C370131', '备注':''
      };
      window.B.rows = [inductorRow];
      const inductorError = {row:44,sourceIndex:0,ref:'L23',model:'SDCL0603Q1N6ST02B03',package:'SL0201',lcsc:'C370131',fields:['精度'],reason:'缺失'};
      OFFLINE_SUPPLEMENT_STATE.errors = [inductorError];
      const inductorSearchCode = offlineSupplementSearchAdapter(inductorError).comment;
      const missingToleranceCandidate = {
        componentCode:'C370131',
        _detail:{hit:true,productCode:'C370131',productModel:'SDCL0603Q1N6ST02B03',package:'0201',brand:'Sunlord',productType:'电感',productName:'1.6nH',specification:'叠层电感 1.6nH 0201 600mA',paramLinkedMap:{'电感值':'1.6nH','额定电流':'600mA'},_extracted:{inductance:'1.6nH',current:'600mA'}}
      };
      const missingToleranceErrors = offlineCandidateErrors(inductorError, missingToleranceCandidate);

      const smallCapRow = {'物料名称':'陶瓷电容器','型号':'5pF','封装':'SC0402','位号':'C12','立创编号':'C1'};
      window.B.rows = [smallCapRow];
      const smallCapError = {row:1,sourceIndex:0,ref:'C12',model:'5pF',package:'SC0402',lcsc:'C1',fields:['精度'],reason:'缺失'};
      const badSmallCap = {
        componentCode:'C2',
        _detail:{hit:true,productCode:'C2',productModel:'BAD5PF',package:'0402',brand:'YAGEO',productType:'贴片电容',productName:'5pF ±0.25pF 50V C0G',specification:'MLCC 5pF ±0.25pF 50V C0G SMD 0402',paramLinkedMap:{},_extracted:{capacitance:'5pF',tolerance:'±0.25pF',voltage:'50V',dielectric:'C0G'}}
      };
      const smallCapErrors = offlineCandidateErrors(smallCapError, badSmallCap);

      const rfRow = {'物料编码':'1-IN-09-00036','物料名称':'绕线电感','型号':'SMDS332-12N_RS','参数描述':'射频库参数','封装':'SMDS332-12N','位号':'L11','立创编号':'C9900070550'};
      window.materialDB_rf_inductor = [{material_code:'1-IN-09-00036',name:'绕线电感',model:'SMDS332-12N_RS',specification:'射频库参数',package:'SMDS332-12N',lcsc_code:'C9900070550'}];
      window.B.rows = [rfRow];
      const rfError = {row:1,sourceIndex:0,ref:'L11',model:'SMDS332-12N_RS',package:'SMDS332-12N',lcsc:'C9900070550',fields:['精度'],reason:'射频库缺失'};
      OFFLINE_SUPPLEMENT_STATE.errors = [rfError];
      const rfLock = offlineSupplementRfLock(rfRow);
      openOfflineSupplementSearch(0);
      const rfAlert = alerts[alerts.length - 1] || '';

      return {
        modalText, modalVisible, searchTarget, query, pkg, capCandidateErrors, pickedCap, changedInductor,
        missingToleranceErrors, smallCapErrors, rfLock, rfAlert, rejectedDifferentCode, inductorSearchCode,
        standardCount:materialDB_standard.length, rfCount:materialDB_rf_inductor.length,
      };
    });

    if (screenshotDir) {
      await page.evaluate(() => {
        document.body.classList.remove('v3-not-logged');
        document.getElementById('v3LoginMask').classList.remove('show');
        renderOfflineSupplementModal();
        document.getElementById('offlineSupplementModal').style.display = 'block';
      });
      await page.locator('#offlineSupplementModal > div').screenshot({ path:path.join(screenshotDir, `${label}-offline-supplement.png`) });
    }

    assert.equal(result.modalVisible, true, `${label}: supplement modal not shown`);
    assert.match(result.modalText, /待补参数/);
    assert.match(result.modalText, /只修改当前上传的BOM，不会写入任何物料库/);
    assert.match(result.searchTarget, /补齐\s*介质/);
    assert.equal(result.query, '22uF');
    assert.equal(result.pkg, '0603');
    assert.deepEqual(result.capCandidateErrors, [], `${label}: complete capacitor candidate rejected`);
    assert.equal(result.pickedCap.code, 'C888888');
    assert.equal(result.pickedCap.model, '22uF', `${label}: passive engineering value was overwritten`);
    assert.equal(result.pickedCap.manual.source, '立创搜索（仅本次BOM）');
    assert.match(result.pickedCap.remark, /本次BOM立创搜索补齐/);
    assert.deepEqual(result.changedInductor, {
      code:'C98055', model:'LQW15AN39NJ00D', mfgPart:'LQW15AN39NJ00D',
      originalModel:'LQW15AN39NJ00D', productModel:'LQW15AN39NJ00D',
      identityModel:'LQW15AN39NJ00D', authorityErrors:['官方立创编号与源BOM指定编号不一致','官方原厂型号与源BOM指定型号不一致']
    }, `${label}: different LCSC product changed the original inductor`);
    assert.match(result.rejectedDifferentCode, /以源BOM立创编号C98055为准/);
    assert.equal(result.inductorSearchCode, 'C370131');
    assert(result.missingToleranceErrors.some(item => /仍缺少1931必填参数：精度/.test(item)), `${label}: incomplete inductor candidate allowed`);
    assert(result.smallCapErrors.some(item => /小于10pF电容/.test(item)), `${label}: small-cap hard rule bypassed`);
    assert.match(result.rfLock, /射频电感库/);
    assert.match(result.rfAlert, /管理员/);
    assert.equal(result.standardCount, 0, `${label}: standard library changed`);
    assert.equal(result.rfCount, 1, `${label}: RF library changed`);
    assert.deepEqual(pageErrors, [], `${label}: page errors: ${pageErrors.join(' | ')}`);
    console.log(`${label}: offline supplement search workflow passed`);
    await page.close();
  }
  await browser.close();
})().catch(async error => {
  if (browser) await browser.close();
  console.error(error);
  process.exitCode = 1;
});
