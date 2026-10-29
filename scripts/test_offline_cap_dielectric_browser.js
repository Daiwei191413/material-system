const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
let pw;
try { pw = require('playwright-core'); } catch (_) {
  pw = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));
}
const edge = [process.env.EDGE_PATH,
  path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe')].filter(Boolean).find(fs.existsSync);
assert(edge);
(async () => {
  const browser = await pw.chromium.launch({ headless:true, executablePath:edge });
  try {
    for (const file of ['v3-cloudbase/web/index.html', 'v3-legacy/index.html']) {
      const page = await browser.newPage();
      await page.route('**/*', route => route.request().url().startsWith('file:') ? route.continue() : route.abort());
      await page.goto(pathToFileURL(path.resolve(__dirname, '..', file)).href);
      const results = await page.evaluate(() => {
        const out = [];
        window.alert = msg => { throw new Error(msg); };
        materialDB_standard = []; materialDB_rf_inductor = [];
        const fields = ['物料名称','型号','参数描述','封装','位号','数量','立创编号'];
        const fm = Object.fromEntries(fields.map(f => [f,f]));
        A = {fm, hd:fields, _raw:new ArrayBuffer(8), rows:[]};
        window.JSZip = {};
        let exported;
        window.patchAndDownloadXlsx = (_raw, rows) => { exported = rows; return Promise.resolve(); };
        const records = [
          ['C59461','CL10A226MQ8NRNC','6.3V'],
          ['C86295','CL10A226MP8NUNE','10V']
        ];
        for (const [code, model, voltage] of records) {
          for (const location of ['extracted','map','text']) {
            const row = {'物料名称':'陶瓷电容器','型号':'22uF','参数描述':'MLCC 22uF ±20% 25V SMD 0603','封装':'SC0603','位号':'C37,C70,C74','数量':3,'立创编号':'C29519229'};
            B = {fm, hd:fields, rows:[row], _fn:'TP1211-test.xlsx'};
            const item = {sourceIndex:0,row:19,ref:row['位号'],model:'22uF',package:'SC0603',fields:['介质']};
            const detail = {hit:true,productCode:code,productModel:model,package:'0603',brand:'SAMSUNG(三星)',productType:'贴片电容(MLCC)',
              paramLinkedMap:{'容值':'22uF','精度':'±20%','额定电压':voltage},
              _extracted:{capacitance:'22uF',tolerance:'±20%',voltage}};
            if (location === 'extracted') detail._extracted.dielectric = 'X5R';
            if (location === 'map') detail.paramLinkedMap['温度系数'] = 'X5R';
            if (location === 'text') detail.specification = '温度系数：X5R';
            const candidate = {componentCode:code,_detail:detail};
            const errors = offlineCandidateErrors(item, candidate);
            OFFLINE_SUPPLEMENT_STATE.errors = [item];
            _LCSC_SEARCH_IDX = 0; _LCSC_SEARCH_MODE = 'offline';
            pickOfflineSupplementCandidate(candidate);
            const recheck = offlineCandidateErrors(item,candidate);
            exported = null;
            fmtCore('AB', {[code]:detail});
            out.push({code,location,errors,recheck,voltage,exported,source:row});
          }
        }
        // Only dielectric is missing in an existing description: official data must fill it.
        const partial = {'型号':'22uF','封装':'0603','参数描述':'MLCC 22uF ±20% 25V SMD 0603'};
        resolveStandardCapDielectric(partial,{hit:true,paramLinkedMap:{'温度系数':'X5R'}});
        const absent = {sourceIndex:0,fields:['介质']};
        B.rows = [{'型号':'22uF','封装':'0603','位号':'C37','参数描述':'MLCC 22uF ±20% 25V X7R SMD 0603'}];
        const missing = offlineCandidateErrors(absent,{_detail:{hit:true,productCode:'C59461',package:'0603',_extracted:{capacitance:'22uF',tolerance:'±20%',voltage:'6.3V'}}});
        return {out,partial,missing,libraryCount:materialDB_standard.length};
      });
      for (const r of results.out) {
        assert.deepStrictEqual(r.errors, [], `${file}: ${r.code}/${r.location}`);
        assert.deepStrictEqual(r.recheck, []);
        assert(r.exported && r.exported.length === 1, `${file}: export failed`);
        assert.strictEqual(r.exported[0][2], `MLCC 22uF ±20% ${r.voltage} X5R SMD 0603`);
        assert.strictEqual(r.exported[0][4], 'C37,C70,C74');
        assert.strictEqual(r.exported[0][5], 3);
        assert.strictEqual(r.exported[0][6], r.code);
      }
      assert.match(results.partial['参数描述'], /X5R/);
      assert(results.missing.some(e => /介质/.test(e)), 'Old component dielectric must not fill a different selected component');
      assert.strictEqual(results.libraryCount, 0);
      console.log(`${file}: 6 candidate/recheck/export scenarios and missing-data guard passed`);
      await page.close();
    }
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
