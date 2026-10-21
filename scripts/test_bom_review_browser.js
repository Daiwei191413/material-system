const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));
const X=require('../v3-cloudbase/web/assets/vendor/xlsx.full.min.js');
const root=path.resolve(__dirname,'..');
const out=process.env.BOM_REVIEW_OUTPUT;
assert(out&&/^D:[\\/]/i.test(out),'BOM_REVIEW_OUTPUT must be a D: directory');
const cases=[['C18',15,'0R','SC0201','电阻 0Ω SMD 0402'],['C23',17,'5.6pF','SC0402','电容 5.6pF SMD 0201'],['C37,C70,C74',25,'22uF','SC0603','MLCC 22F SMD 0603'],['R1,R44,R47,R50',54,'10K','SR0201','电阻 10KΩ SMD 0402'],['R2,R3,R4,R5,R6,R19,R42,R48,R49,R51,R52,R53,R54,R55,R56,R57,R58,R59',55,'22R','SR0201','电阻 22Ω SMD 0402'],['R20,R21',61,'1K','SR0201','电阻 1KΩ SMD 0402']];
function fixture(fixed=false){
 const matrix=Array.from({length:61},()=>[]);matrix[4]=['序号','物料编码','物料名称','型号','参数描述','位号','数量','单位','封装'];
 cases.forEach(([ref,r,model,pkg,spec],i)=>{if(fixed)spec=(model.includes('F')?'电容 ':'电阻 ')+model+(model==='5.6pF'?' ±0.1pF':'')+' SMD '+pkg.slice(2);matrix[r-1]=[i+1,'','',model,spec,ref,ref.split(',').length,'PCS',pkg];});
 const w=X.utils.book_new();X.utils.book_append_sheet(w,X.utils.aoa_to_sheet(matrix),'单板BOM');return {name:fixed?'fixed.xlsx':'sample.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(X.write(w,{type:'array',bookType:'xlsx'}))};
}
const inputs=[process.env.BOM_REVIEW_PRIMARY_FILE||fixture(),process.env.BOM_REVIEW_SOURCE_FILE||fixture(true)];
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const records=[];
 try{
  for(const [label,target] of [['domestic','v3-cloudbase/web/index.html'],['overseas','v3-legacy/index.html']]){
   const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await context.newPage();
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',r=>r.request().url().startsWith('file:')?r.continue():r.abort());
   await page.goto(pathToFileURL(path.join(root,target)).href,{waitUntil:'domcontentloaded'});
   if(!await page.evaluate(()=>typeof XLSX!=='undefined'))await page.addScriptTag({path:path.join(root,'v3-cloudbase/web/assets/vendor/xlsx.full.min.js')});
   await page.evaluate(()=>{document.body.classList.remove('v3-not-logged');document.getElementById('v3LoginMask').classList.remove('show');BOM_API.user={role:'readonly',username:'local-review'};V3_applyRoleUI();window.__beforeLib=JSON.stringify([window.materialDB_standard,window.materialDB_lcsc]);window.__beforeB=JSON.stringify(window.B);});
   await page.locator('button[onclick="showPanel(\'review\')"]').click();
   assert(await page.locator('#reviewPanel').isVisible());assert(!await page.locator('#offlineComparePanel').isVisible());
   assert(!await page.locator('#reviewFile').isDisabled());
   await page.locator('#reviewFile').setInputFiles(inputs[0]);
   await page.waitForFunction(()=>BOM_REVIEW_UI.state.primary?.valid);
   await page.locator('#reviewSourceFile').setInputFiles(inputs[1]);
   await page.waitForFunction(()=>BOM_REVIEW_UI.state.source?.valid);
   await page.locator('#reviewRun').click();
   let result=await page.evaluate(()=>BOM_REVIEW_UI.state.result);
   for(const [ref,cell,rule] of [['C18','E15','PACKAGE_CONFLICT'],['C23','E17','PACKAGE_CONFLICT'],['C37,C70,C74','E25','VALUE_CONFLICT'],['R1,R44,R47,R50','E54','PACKAGE_CONFLICT'],['R2,R3,R4,R5,R6,R19,R42,R48,R49,R51,R52,R53,R54,R55,R56,R57,R58,R59','E55','PACKAGE_CONFLICT'],['R20,R21','E61','PACKAGE_CONFLICT']]){
    assert(result.issues.some(c=>c.refs===ref&&c.cell===cell&&c.rule===rule&&c.status==='error'),ref+' not located');
   }
   assert(!result.issues.some(c=>c.refs==='C18'&&c.rule==='TYPE_CONFLICT'));
   assert.equal(result.document.hash.length,64);assert.equal(result.source.hash.length,64);
   await page.locator('#reviewSearch').fill('C18');await page.locator('[data-review-evidence]').first().click();
   assert((await page.locator('#reviewEvidence').textContent()).includes('E15'));
   await page.locator('#reviewSearch').fill('');
   await page.evaluate(()=>window.scrollTo(0,0));
   await page.screenshot({path:path.join(out,label+'-review-desktop.png')});
   const promise=page.waitForEvent('download');await page.locator('#reviewExport').click();const download=await promise;
   const reportPath=path.join(out,label+'-审查报告.xlsx');await download.saveAs(reportPath);
   const report=X.read(fs.readFileSync(reportPath),{type:'buffer'});assert.deepEqual(report.SheetNames,['审查概览','问题明细','字段核验记录','审查设置']);
   const issues=X.utils.sheet_to_json(report.Sheets['问题明细']);assert(issues.some(r=>r['位号']==='C18'&&r['原单元格']==='E15'));
   assert.equal(issues.length,result.issues.length);
   const preserved=await page.evaluate(()=>({lib:window.__beforeLib===JSON.stringify([window.materialDB_standard,window.materialDB_lcsc]),b:window.__beforeB===JSON.stringify(window.B)}));assert(preserved.lib&&preserved.b);
   await page.locator('[data-review-header="primary"]').fill('9999');await page.locator('[data-review-header="primary"]').dispatchEvent('change');
   await page.evaluate(()=>BOM_REVIEW_UI.run());assert.equal(await page.evaluate(()=>BOM_REVIEW_UI.state.result),null);
   await page.locator('[data-review-header="primary"]').fill('5');await page.locator('[data-review-header="primary"]').dispatchEvent('change');
   await page.locator('#reviewRun').click();assert(await page.evaluate(()=>!!BOM_REVIEW_UI.state.result));
   await page.locator('#reviewClearSource').click();assert(await page.locator('#reviewExport').isDisabled());
   await page.locator('#reviewFile').setInputFiles(process.env.BOM_REVIEW_FIXED_DIR?path.join(process.env.BOM_REVIEW_FIXED_DIR,'修复试转换-'+label+'.xlsx'):fixture(true));
   await page.waitForFunction(()=>BOM_REVIEW_UI.state.primary?.valid);await page.locator('#reviewRun').click();
   const fixed=await page.evaluate(()=>BOM_REVIEW_UI.state.result);assert(!fixed.issues.some(c=>['VALUE_CONFLICT','PACKAGE_CONFLICT'].includes(c.rule)));
   await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(out,label+'-review-mobile.png')});
   const overflow=await page.locator('#reviewPanel').evaluate(e=>({width:e.getBoundingClientRect().width,scroll:e.scrollWidth}));assert(overflow.scroll<=overflow.width+2,JSON.stringify(overflow));
   await page.evaluate(async()=>{const headers=['型号','封装','位号','数量','参数描述'];BOM_REVIEW_UI.remember(headers,[['0R','SC0201','C18',1,'电阻 0Ω SMD 0201']],{rows:[{'型号':'0R','封装':'SC0201','位号':'C18','数量':1}],_fn:'original.xlsx'},'generated.xlsx');await BOM_REVIEW_UI.useLast();BOM_REVIEW_UI.run();});
   const handoff=await page.evaluate(()=>BOM_REVIEW_UI.state.result);assert.equal(handoff.document.name,'generated.xlsx');assert.equal(handoff.document.rows,1);assert(handoff.source.hash.includes('非原始文件'));
   assert.equal(errors.length,0,errors.join('\n'));
   records.push({label,original:result.counts,originalRows:result.document.rows,fixed:fixed.counts,report:reportPath,errors});
   await context.close();
  }
  fs.writeFileSync(path.join(out,'browser-review-results.json'),JSON.stringify(records,null,2));console.log('PASS',JSON.stringify(records));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
