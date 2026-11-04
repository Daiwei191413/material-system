const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));
const X=require('../v3-cloudbase/web/assets/vendor/xlsx.full.min.js');
const root=path.resolve(__dirname,'..'),live=process.env.BOM_MATERIAL_LIVE==='1';
const baseOut=process.env.BOM_REVIEW_MATERIAL_OUTPUT||'D:/研发电子ＢＯＭ工具 2/交互资料/测试/2026-11-04-物料编码审查';
assert(/^D:[\\/]/i.test(baseOut));const out=live?path.join(baseOut,'live'):baseOut;fs.mkdirSync(out,{recursive:true});
const correctCode='1-CR-04-00009',wrongCode='1-CR-04-00999';
// Historical code fixture and intentionally fabricated wrong code: not the user's BOM.
const row={'物料编码':wrongCode,'物料名称':'贴片晶体','型号':'WN4026M00018T5074006','封装':'SMD-2016_4P','参数描述':'频率：26MHz；负载电容：18pF','品牌':'受控测试品牌','位号':'Y4','数量':1};
const standard={material_code:correctCode,model:row['型号'],package:'SMD2016-4P',specification:row['参数描述'],brand:row['品牌'],name:'贴片晶体'};
const headers=['物料编码','物料名称','型号','参数描述','封装','位号','数量','品牌','备注'];
const rows=[row,{...row,'物料编码':correctCode,'位号':'Y5'},{...row,'物料编码':'1-CR-04-00888','型号':'UNREGISTERED-CRYSTAL','位号':'Y6'}];
function file(name){const wb=X.utils.book_new();X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([headers,...rows.map(r=>headers.map(h=>r[h]??''))]),'单板BOM');return {name,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(X.write(wb,{type:'array',bookType:'xlsx'}))};}
async function snapshot(page){return page.evaluate(()=>JSON.stringify({standard:window.materialDB_standard,rf:window.materialDB_rf_inductor,lcsc:window.materialDB_lcsc,sync:window.BOM_STANDARD_SYNC,B:window.B,primary:BOM_REVIEW_UI.state.primary.doc,source:BOM_REVIEW_UI.state.source.doc}));}
async function runUnchanged(page){const before=await snapshot(page);await page.locator('#reviewRun').click();const result=await page.evaluate(()=>BOM_REVIEW_UI.state.result);assert(result,'Review produced no result');assert.equal(await snapshot(page),before,'Review mutated BOM or libraries');return result;}
function materialChecks(result){return result.checks.filter(c=>/^MATERIAL_CODE|^MATERIAL_LIBRARY/.test(c.rule));}
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'});
 const results=[];
 try{
  for(const [label,local,url] of [['domestic','v3-cloudbase/web/index.html','https://techphant-bom-v3-d9e3pqqb0b46c88-1363491993.tcloudbaseapp.com/'],['overseas','v3-legacy/index.html','https://techphant-bom-tools-v3.pages.dev/']]){
   const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   // A live smoke test uses only isolated in-memory fixtures. Never send a write request.
   await page.route('**/*',route=>{const request=route.request();return (live?['GET','HEAD'].includes(request.method()):request.url().startsWith('file:'))?route.continue():route.abort();});
   await page.goto(live?url:pathToFileURL(path.join(root,local)).href,{waitUntil:'domcontentloaded'});
   if(live&&(await page.title())==='风险提醒')await page.getByText('确定访问',{exact:true}).click({timeout:15000});
   if(!live&&!await page.evaluate(()=>typeof XLSX!=='undefined'))await page.addScriptTag({path:path.join(root,'v3-cloudbase/web/assets/vendor/xlsx.full.min.js')});
   await page.waitForFunction(()=>typeof BOM_REVIEW_UI!=='undefined'&&typeof XLSX!=='undefined');
   await page.waitForLoadState('domcontentloaded');
   await page.evaluate(({standard})=>{document.body.classList.remove('v3-not-logged');document.getElementById('v3LoginMask').classList.remove('show');BOM_API.user={role:'readonly',username:'controlled-review-test'};V3_applyRoleUI();window.materialDB_standard=[standard];window.materialDB_rf_inductor=[];window.BOM_STANDARD_SYNC={status:'ready',count:1,error:''};document.dispatchEvent(new CustomEvent('bom-standard-sync-changed',{detail:window.BOM_STANDARD_SYNC}));},{standard});
   await page.locator('button[onclick="showPanel(\'review\')"]').click();
   await page.locator('#reviewFile').setInputFiles(file('controlled-offline.xlsx'));await page.waitForFunction(()=>BOM_REVIEW_UI.state.primary?.valid);
   await page.locator('#reviewSourceFile').setInputFiles(file('controlled-source.xlsx'));await page.waitForFunction(()=>BOM_REVIEW_UI.state.source?.valid);
   const result=await runUnchanged(page);
   const y4=result.rowAudits.find(r=>r.refs==='Y4'),y5=result.rowAudits.find(r=>r.refs==='Y5'),y6=result.rowAudits.find(r=>r.refs==='Y6');
   assert.equal(y4.status,'abnormal');assert.equal(y5.status,'normal');assert.equal(y6.status,'unverified');
   assert(y4.checks.some(c=>c.rule==='MATERIAL_CODE_CONFLICT'&&c.expected===correctCode));
   assert.equal(y4.materialCode,wrongCode);assert(y4.materialCandidates.some(c=>c.code===correctCode));
   const visible=await page.locator('#reviewResultBody').innerText();assert(visible.includes('物料编码：'+wrongCode)&&visible.includes(correctCode));
   await page.locator('[data-review-evidence]').first().click();const expanded=await page.locator('#reviewEvidence').innerText();assert(expanded.includes(wrongCode)&&expanded.includes(correctCode));
   await page.locator('#reviewResults').screenshot({path:path.join(out,label+'-wrong-company-code.png')});
   const beforeDownload=await snapshot(page),downloadPromise=page.waitForEvent('download');await page.locator('#reviewExport').click();
   const reportPath=path.join(out,label+'-物料编码审查报告.xlsx');await (await downloadPromise).saveAs(reportPath);assert.equal(await snapshot(page),beforeDownload);
   const report=X.read(fs.readFileSync(reportPath),{type:'buffer'});assert.deepEqual(report.SheetNames,['审查结论','逐行核对明细','检查项明细']);
   const reportRows=X.utils.sheet_to_json(report.Sheets['逐行核对明细']);const reportY4=reportRows.find(r=>r['位号']==='Y4');assert.equal(reportY4['物料编码'],wrongCode);assert.equal(reportY4['核对结果'],'明确冲突');assert(String(reportY4['对照内容']).includes(correctCode));
   const checks=X.utils.sheet_to_json(report.Sheets['检查项明细']);assert(checks.some(c=>c['位号']==='Y4'&&c['字段']==='物料编码'&&c['当前内容']===wrongCode&&String(c['对照内容']).includes(correctCode)));
   // Detect direct array mutation even if the caller did not emit the sync event.
   await page.evaluate(()=>{window.materialDB_standard[0].material_code='1-CR-04-00010';});
   const staleDownload=page.waitForEvent('download',{timeout:400}).then(()=>true,()=>false);await page.evaluate(()=>BOM_REVIEW_UI.exportReport());assert.equal(await staleDownload,false,'Stale report was downloaded');
   assert.equal(await page.evaluate(()=>BOM_REVIEW_UI.state.result),null);assert(await page.locator('#reviewExport').isDisabled());assert((await page.locator('#reviewMessage').innerText()).includes('重新审查'));
   const updated=await runUnchanged(page);assert(updated.checks.some(c=>c.rule==='MATERIAL_CODE_CONFLICT'&&c.refs==='Y4'&&c.expected==='1-CR-04-00010'));
   // Sync status changes must invalidate an existing report immediately.
   await page.evaluate(()=>{window.BOM_STANDARD_SYNC={status:'loading',count:1,error:''};document.dispatchEvent(new CustomEvent('bom-standard-sync-changed',{detail:window.BOM_STANDARD_SYNC}));});
   assert.equal(await page.evaluate(()=>BOM_REVIEW_UI.state.result),null);assert(await page.locator('#reviewExport').isDisabled());
   const loading=await runUnchanged(page);assert(materialChecks(loading).every(c=>c.outcome==='pending'));assert(materialChecks(loading).some(c=>c.rule==='MATERIAL_LIBRARY_UNAVAILABLE'));
   await page.evaluate(()=>{window.BOM_STANDARD_SYNC={status:'error',count:1,error:'controlled offline failure'};document.dispatchEvent(new CustomEvent('bom-standard-sync-changed',{detail:window.BOM_STANDARD_SYNC}));});
   const failed=await runUnchanged(page);assert(materialChecks(failed).every(c=>c.outcome==='pending'));
   // The read-only RF designated library participates in the same audit snapshot.
   await page.evaluate(({standard})=>{window.materialDB_standard=[];window.materialDB_rf_inductor=[standard];window.BOM_STANDARD_SYNC={status:'ready',count:1,error:''};document.dispatchEvent(new CustomEvent('bom-standard-sync-changed',{detail:window.BOM_STANDARD_SYNC}));},{standard});
   const rf=await runUnchanged(page);assert(rf.checks.some(c=>c.rule==='MATERIAL_CODE_MATCH'&&c.refs==='Y5'));assert(rf.checks.some(c=>c.rule==='MATERIAL_CODE_CONFLICT'&&c.refs==='Y4'));
   await page.setViewportSize({width:390,height:844});const geometry=await page.locator('#reviewPanel').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));assert(geometry.scroll<=geometry.width+2,JSON.stringify(geometry));await page.locator('#reviewResults').screenshot({path:path.join(out,label+'-company-code-mobile.png')});
   assert.equal(errors.length,0,errors.join('\n'));
   results.push({label,live,scope:'historical test code plus fabricated wrong code; isolated browser memory',counts:result.auditCounts,currentCode:wrongCode,expectedCode:correctCode,report:reportPath,staleReportRejected:true,syncChangeInvalidated:true,cacheFailurePending:true,rfLibraryRead:true,errors});
   await context.close();
  }
  fs.writeFileSync(path.join(out,'material-code-browser-results.json'),JSON.stringify(results,null,2));console.log('PASS',JSON.stringify(results));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
