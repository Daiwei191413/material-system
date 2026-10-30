const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
let pw;
try { pw = require('playwright-core'); } catch (_) {
  pw = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));
}
const edge = [
  process.env.EDGE_PATH,
  path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
  path.join(process.env.ProgramFiles || '', 'Microsoft/Edge/Application/msedge.exe'),
].find(p => p && fs.existsSync(p));
const root = path.resolve(__dirname, '..');
const fixtures = {
  C42368194:{model:'FV43X102K402EFQ',voltage:'4kV',pkg:'1812'},
  C3861410:{model:'HV1812Y102KXVATHV',voltage:'4000V',pkg:'1812'},
  C50000:{model:'LOW-50V',voltage:'50V',pkg:'1812'},
  C1808:{model:'FV42X102K402EFQ',voltage:'4kV',pkg:'1808'},
};
function detail(code) {
  const f=fixtures[code];
  return {hit:true,productCode:code,productModel:f.model,productType:'贴片电容(MLCC)',package:f.pkg,
    brand:'PSA',stockNum:200,_extracted:{capacitance:'1nF',voltage:f.voltage,tolerance:'±10%',dielectric:'X7R'}};
}
(async () => {
  const browser=await pw.chromium.launch({headless:true,executablePath:edge});
  try {
    for (const [label,file] of [['domestic','v3-cloudbase/web/index.html'],['overseas','v3-legacy/index.html']]) {
      const page=await browser.newPage();
      const queries=[], errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',async route=>{
        const url=route.request().url();
        if(url.includes('/search?')) {
          const q=new URL(url).searchParams.get('q'); queries.push(q);
          // 模拟接口：原始斜杠词第一页没有1812；独立关键词能找到实际商品。
          const codes=q==='1nF 4kV 1812'?['C50000','C1808','C42368194','C3861410']:[];
          return route.fulfill({json:{ok:true,items:codes.map(c=>({componentCode:c,componentModel:fixtures[c].model,componentSpecification:fixtures[c].pkg}))}});
        }
        if(url.includes('/batch?')) {
          const codes=new URL(url).searchParams.get('codes').split(',');
          return route.fulfill({json:{ok:true,results:codes.map(c=>({ok:true,data:detail(c)}))}});
        }
        if(url.startsWith('file:')) return route.continue();
        return route.abort();
      });
      await page.goto(pathToFileURL(path.join(root,file)).href,{waitUntil:'domcontentloaded'});
      const initial=await page.evaluate(async()=>{
        window.alert=()=>{};window.confirm=()=>true;
        window.materialDB_standard=[];window.materialDB_lcsc=[];window.materialDB_rf_inductor=[];
        window.runConvert([
          {Value:'1nF/4KV',Reference:'C16','PCB Footprint':'SC1812'},
          {Value:'1nF/50V',Reference:'C17','PCB Footprint':'SC1812'},
          {Value:'1M NC',Reference:'R8','PCB Footprint':'SR1206'},
        ]);
        const row=CONV_OUT.find(r=>r.designator==='C16');
        const candidates=await collectOnlineLcscCandidates(row);
        const low=validateLcscMapping(row,{hit:true,productType:'贴片电容',package:'1812',_extracted:{capacitance:'1nF',voltage:'50V'}});
        const missing=validateLcscMapping(row,{hit:true,productType:'贴片电容',package:'1812',_extracted:{capacitance:'1nF'}});
        const wrongPkg=validateLcscMapping(row,{hit:true,productType:'贴片电容',package:'1808',_extracted:{capacitance:'1nF',voltage:'4kV'}});
        return {pkgs:['SC1812','SR1812','SL1812'].map(normPkg),codes:candidates.map(x=>x.componentCode),low,missing,wrongPkg,
          groups:CONV_OUT.filter(r=>/^C/.test(r.designator)).map(r=>r.comment),nc:CONV_OUT.find(r=>r.designator==='R8').status};
      });
      assert.deepEqual(initial.pkgs,['1812','1812','1812']);
      assert.deepEqual(initial.codes,['C42368194','C3861410']);
      assert(initial.low.some(x=>x.includes('耐压不一致')));
      assert(initial.missing.some(x=>x.includes('缺少可核验的耐压')));
      assert(initial.wrongPkg.some(x=>x.includes('封装不一致')));
      assert.deepEqual(initial.groups.sort(),['1nF/4KV','1nF/50V'].sort());
      assert.equal(initial.nc,'dnp');
      await page.evaluate(()=>openLcscSearch(CONV_OUT.findIndex(r=>r.designator==='C16')));
      await page.waitForFunction(()=>document.querySelectorAll('.lcsc-data-row').length===2);
      const displayed=await page.evaluate(()=>document.getElementById('lcscSearchBody')._items.map(x=>x.componentCode));
      assert.deepEqual(displayed,['C42368194','C3861410']);
      await page.evaluate(()=>pickLcscCandidate(0));
      await page.waitForFunction(()=>CONV_OUT.find(r=>r.designator==='C16').status==='matched');
      const exported=await page.evaluate(()=>{
        let rows;
        window.XLSX={utils:{aoa_to_sheet:data=>{rows=data;return {};},book_new:()=>({}),book_append_sheet:()=>{}},writeFile:()=>{}};
        exportJlcBom();
        return rows;
      });
      assert.deepEqual(exported[0],['Comment','Designator','Footprint','嘉立创元件编号']);
      assert.deepEqual(exported.find(r=>r[1]==='C16'),['1nF/4KV','C16','SC1812','C42368194']);
      assert(!exported.some(r=>r[1]==='R8'));
      assert(queries.every(q=>q==='1nF 4kV 1812'));
      assert.deepEqual(errors,[]);
      console.log(label+': high-voltage capacitor search, rated voltage, package and NC export passed');
      await page.close();
    }
  } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
