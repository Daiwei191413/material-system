const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));
const X=require('../v3-cloudbase/web/assets/vendor/xlsx.full.min.js');
const E=require('../v3-cloudbase/web/assets/bom-review-engine.js');
const root=path.resolve(__dirname,'..');
const out=process.env.BOM_REVIEW_OUTPUT;
assert(out&&/^D:[\\/]/i.test(out),'BOM_REVIEW_OUTPUT must be a D: directory');
fs.mkdirSync(out,{recursive:true});
const cases=[['C18',15,'0R','SC0201','电阻 0Ω SMD 0402'],['C23',17,'5.6pF','SC0402','电容 5.6pF SMD 0201'],['C37,C70,C74',25,'22uF','SC0603','MLCC 22F SMD 0603'],['R1,R44,R47,R50',54,'10K','SR0201','电阻 10KΩ SMD 0402'],['R2,R3,R4,R5,R6,R19,R42,R48,R49,R51,R52,R53,R54,R55,R56,R57,R58,R59',55,'22R','SR0201','电阻 22Ω SMD 0402'],['R20,R21',61,'1K','SR0201','电阻 1KΩ SMD 0402']];
function fixture(fixed=false){
 const matrix=Array.from({length:61},()=>[]);matrix[4]=['序号','物料编码','物料名称','型号','参数描述','位号','数量','单位','封装'];
 cases.forEach(([ref,r,model,pkg,spec],i)=>{if(fixed)spec=(model.includes('F')?'电容 ':'电阻 ')+model+(model==='5.6pF'?' ±0.1pF':'')+' SMD '+pkg.slice(2);matrix[r-1]=[i+1,'','',model,spec,ref,ref.split(',').length,'PCS',pkg];});
 const w=X.utils.book_new();X.utils.book_append_sheet(w,X.utils.aoa_to_sheet(matrix),'单板BOM');return {name:fixed?'fixed.xlsx':'sample.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(X.write(w,{type:'array',bookType:'xlsx'}))};
}
const inputs=[process.env.BOM_REVIEW_PRIMARY_FILE||fixture(),process.env.BOM_REVIEW_SOURCE_FILE||fixture(true)];
const evidenceHeaders=['型号','封装','位号','数量','参数描述','备注','立创编号'];
const screenshotRows=[
 {'位号':'C14','型号':'RVT1H101M0607','封装':'RVT1H101M0607','数量':1,'参数描述':'容量：100uF, 精度：±20%, 额定电压：50V, 电容体直径：6.3mm'},
 {'位号':'C16','型号':'1nF','封装':'SC1812','数量':1,'参数描述':'MLCC 1nF ±10% 2000V X7R SMD 1812'},
 {'位号':'L26,L36,L40,L42','型号':'AS0807-68NK','封装':'AS0807-68NK','数量':4,'参数描述':'额定电流：3A；直流电阻：4.1mΩ；精度：±5%'},
 {'位号':'RV1','型号':'820KD14J','封装':'820KD14J','数量':1,'参数描述':'压敏电压：82V；钳位电压：135V'},
 {'位号':'U33,U34,U38','型号':'SAFEA2G45MB0F0A','封装':'SAFEA2G45MB0F0A','数量':3,'参数描述':'中心频率：2442MHz；阻抗：50Ω；插入损耗：2.4dB'},
 {'位号':'Y3','型号':'CN4025M00010T5074162','封装':'SMD-2016_4P','数量':1,'参数描述':'贴片晶体；频率：25MHz；频率偏差：±10ppm；负载电容：10pF'}
].map(r=>({...r,'备注':'参数待核实（详见补齐报告）'}));
const specificWarnings=['电容体高度未取得官方依据','耐压2000V来源待核实','电感精度缺少规格书佐证','压敏电压82V未取得对应料号资料','带宽未取得官方规格书','晶体负载电容10pF待核实'];
function evidenceFixture(rows, details=[], records=[], name='evidence.xlsx'){
 const wb=X.utils.book_new();X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([evidenceHeaders,...rows.map(r=>evidenceHeaders.map(h=>r[h]??''))]),'单板BOM');
 if(details.length||records.length){const report=[['位号','型号','匹配等级','补齐字段','待核实事项','审查依据'],...details.map(d=>[d.ref,d.model,'待核实','',d.warnings.join('；'),'']),...records.map(r=>['','','确认记录','','',JSON.stringify(r)])];const ws=X.utils.aoa_to_sheet(report);ws['!cols']=[{},{},{},{},{},{hidden:true}];X.utils.book_append_sheet(wb,ws,'补齐报告');}
 return {name,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(X.write(wb,{type:'array',bookType:'xlsx'}))};
}
function signedSourceRecord(row,sourceRows){
 const sourceDoc=E.readWorkbook(X.read(evidenceFixture(sourceRows).buffer,{type:'buffer'}),X,{name:'source.xlsx'});
 return {schema:1,ref:row['位号'],model:row['型号'],signature:E.rowSignature(row),sourceSignature:E.sourceSignature(sourceDoc,row['位号']),entries:[{kind:'model',reason:'型号对应关系待确认',action:'已核实型号对应关系，保留源型号及当前采购编号',time:'2026-11-04T10:00:00+08:00',confirmed:true,resolved:true,note:row['备注'],fields:['型号'],source:{model:row['型号'],package:row['封装'],code:row['立创编号']},official:{model:'CATALOG-CHIP',package:'QFN32',code:'C10001'}}]};
}
async function sourceChangeScenario(page,label){
 const row={'型号':'CUSTOM-CHIP','封装':'QFN32','位号':'U1','数量':1,'参数描述':'收发芯片','备注':'人工确认：型号对应关系待确认；处理=已核实型号对应关系，保留源型号及当前采购编号','立创编号':'C10001'};
 const original={...row,'型号':'CATALOG-CHIP','备注':''};
 await page.locator('#reviewFile').setInputFiles(evidenceFixture([row],[],[signedSourceRecord(row,[original])],'same-target.xlsx'));
 await page.waitForFunction(()=>BOM_REVIEW_UI.state.primary?.valid);
 const checks=[];
 for(const [field,value] of [['型号','OTHER-CATALOG-CHIP'],['封装','CUSTOM-NEW-PAD'],['参数描述','不同额定电压与工作频率'],['立创编号','C10003']]){
  await page.locator('#reviewSourceFile').setInputFiles(evidenceFixture([original],[],[],'original-source.xlsx'));
  await page.waitForFunction(()=>BOM_REVIEW_UI.state.source?.valid);await page.locator('#reviewRun').click();
  assert.equal(await page.evaluate(()=>BOM_REVIEW_UI.state.result.auditCounts.confirmed),1,'Original source did not retain confirmation');
  await page.locator('#reviewSourceFile').setInputFiles(evidenceFixture([{...original,[field]:value}],[],[],'changed-source.xlsx'));
  await page.waitForFunction(()=>BOM_REVIEW_UI.state.source?.valid);await page.locator('#reviewRun').click();
  const result=await page.evaluate(()=>BOM_REVIEW_UI.state.result);
  assert.equal(result.auditCounts.confirmed,0,'Changed source '+field+' kept confirmation');
  assert(!result.checks.some(c=>c.outcome==='confirmed'));assert(result.checks.some(c=>c.rule==='CONFIRMATION_STALE'&&c.outcome==='pending'));
  checks.push({field,counts:result.auditCounts});
 }
 await page.locator('#reviewResults').screenshot({path:path.join(out,label+'-changed-source-confirmation-invalidated.png')});
 return checks;
}
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
   if(process.env.BOM_REVIEW_SOURCE_ONLY==='1'){
    const changedSource=await sourceChangeScenario(page,label);
    const preserved=await page.evaluate(()=>({lib:window.__beforeLib===JSON.stringify([window.materialDB_standard,window.materialDB_lcsc]),b:window.__beforeB===JSON.stringify(window.B)}));assert(preserved.lib&&preserved.b);assert.equal(errors.length,0,errors.join('\n'));
    records.push({label,changedSource,errors});await context.close();continue;
   }
   await page.locator('#reviewFile').setInputFiles(inputs[0]);
   await page.waitForFunction(()=>BOM_REVIEW_UI.state.primary?.valid);
   await page.locator('#reviewSourceFile').setInputFiles(inputs[1]);
   await page.waitForFunction(()=>BOM_REVIEW_UI.state.source?.valid);
   await page.locator('#reviewRun').click();
   let result=await page.evaluate(()=>BOM_REVIEW_UI.state.result);
   assert.equal(await page.locator('#reviewFilter option[value="matched"]').count(),0);
   assert.equal(await page.locator('#reviewFilter option[value="abnormal"]').count(),1);
   assert.equal(await page.locator('#reviewFilter option[value="unverified"]').count(),1);
   assert.equal(await page.locator('#reviewResultBody').locator('xpath=preceding-sibling::thead/tr/th').count(),6);
   for(const [ref,cell,rule] of [['C18','E15','PACKAGE_CONFLICT'],['C23','E17','PACKAGE_CONFLICT'],['C37,C70,C74','E25','VALUE_CONFLICT'],['R1,R44,R47,R50','E54','PACKAGE_CONFLICT'],['R2,R3,R4,R5,R6,R19,R42,R48,R49,R51,R52,R53,R54,R55,R56,R57,R58,R59','E55','PACKAGE_CONFLICT'],['R20,R21','E61','PACKAGE_CONFLICT']]){
    assert(result.issues.some(c=>c.refs===ref&&c.cell===cell&&c.rule===rule&&c.status==='error'),ref+' not located');
   }
   assert(!result.issues.some(c=>c.refs==='C18'&&c.rule==='TYPE_CONFLICT'));
   assert.equal(result.document.hash.length,64);assert.equal(result.source.hash.length,64);
   await page.locator('#reviewSearch').fill('C18');await page.locator('[data-review-evidence]').first().click();
   assert((await page.locator('#reviewEvidence').textContent()).includes('E15'));
   await page.locator('#reviewSearch').fill('');
   await page.evaluate(()=>window.scrollTo(0,0));
   await page.screenshot({path:path.join(out,label+'-review-desktop.png'),fullPage:true});
   const promise=page.waitForEvent('download');await page.locator('#reviewExport').click();const download=await promise;
   const reportPath=path.join(out,label+'-审查报告.xlsx');await download.saveAs(reportPath);
   const report=X.read(fs.readFileSync(reportPath),{type:'buffer'});assert.deepEqual(report.SheetNames,['审查结论','逐行核对明细','检查项明细']);
   const issues=X.utils.sheet_to_json(report.Sheets['逐行核对明细']);assert(issues.some(r=>r['位号']==='C18'&&r['核对结果']==='明确冲突'&&String(r['涉及字段']).includes('参数描述')));
   assert.equal(issues.length,result.auditRows.length);
   const preserved=await page.evaluate(()=>({lib:window.__beforeLib===JSON.stringify([window.materialDB_standard,window.materialDB_lcsc]),b:window.__beforeB===JSON.stringify(window.B)}));assert(preserved.lib&&preserved.b);
   await page.locator('#reviewPrimaryConfig details > summary').click();
   await page.locator('[data-review-header="primary"]').fill('9999');await page.locator('[data-review-header="primary"]').dispatchEvent('change');
   await page.evaluate(()=>BOM_REVIEW_UI.run());assert.equal(await page.evaluate(()=>BOM_REVIEW_UI.state.result),null);
   await page.locator('[data-review-header="primary"]').fill('5');await page.locator('[data-review-header="primary"]').dispatchEvent('change');
   await page.locator('#reviewRun').click();assert(await page.evaluate(()=>!!BOM_REVIEW_UI.state.result));
   await page.locator('#reviewClearSource').click();assert(await page.locator('#reviewExport').isDisabled());
   await page.locator('#reviewFile').setInputFiles(process.env.BOM_REVIEW_FIXED_DIR?path.join(process.env.BOM_REVIEW_FIXED_DIR,'修复试转换-'+label+'.xlsx'):fixture(true));
   await page.waitForFunction(()=>BOM_REVIEW_UI.state.primary?.valid);await page.locator('#reviewRun').click();
   const fixed=await page.evaluate(()=>BOM_REVIEW_UI.state.result);assert(!fixed.issues.some(c=>['VALUE_CONFLICT','PACKAGE_CONFLICT'].includes(c.rule)));assert.equal(fixed.auditCounts.abnormal,0);assert(fixed.auditCounts.unverified>0);
   await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:path.join(out,label+'-review-mobile.png')});
   const overflow=await page.locator('#reviewPanel').evaluate(e=>({width:e.getBoundingClientRect().width,scroll:e.scrollWidth}));assert(overflow.scroll<=overflow.width+2,JSON.stringify(overflow));
   await page.evaluate(async()=>{const headers=['型号','封装','位号','数量','参数描述'];BOM_REVIEW_UI.remember(headers,[['0R','SC0201','C18',1,'电阻 0Ω SMD 0201']],{rows:[{'型号':'0R','封装':'SC0201','位号':'C18','数量':1}],_fn:'original.xlsx'},'generated.xlsx');await BOM_REVIEW_UI.useLast();});
   const handoff=await page.evaluate(()=>BOM_REVIEW_UI.state.result);assert.equal(handoff.document.name,'generated.xlsx');assert.equal(handoff.document.rows,1);assert(handoff.source.hash.includes('非原始文件'));
   // Reproduce the six displayed part categories with deliberately distinct,
   // controlled evidence gaps. These are not claims about the user's source file.
   await page.setViewportSize({width:1440,height:1000});
   await page.locator('#reviewFile').setInputFiles(evidenceFixture(screenshotRows,screenshotRows.map((r,i)=>({ref:r['位号'],model:r['型号'],warnings:[specificWarnings[i]]}))));
   await page.waitForFunction(()=>BOM_REVIEW_UI.state.primary?.valid);
   await page.locator('#reviewSourceFile').setInputFiles(evidenceFixture(screenshotRows.map(r=>({...r,'备注':''})),[],[],'original-six.xlsx'));
   await page.waitForFunction(()=>BOM_REVIEW_UI.state.source?.valid);await page.locator('#reviewRun').click();
   const six=await page.evaluate(()=>BOM_REVIEW_UI.state.result);
   assert.equal(six.auditCounts.total,6);assert.equal(six.auditCounts.unverified,6);assert.equal(six.auditCounts.abnormal,0);
   assert.equal(six.auditCounts.normal+six.auditCounts.confirmed+six.auditCounts.unverified+six.auditCounts.abnormal,6);
   const sixText=await page.locator('#reviewResultBody').innerText();specificWarnings.forEach(w=>assert(sixText.includes(w),'Specific reason missing: '+w));
   const desktopGeometry=await page.locator('#reviewResultBody').evaluate(body=>{const wrap=body.closest('.review-table-wrap');return {wrap:wrap.clientWidth,scroll:wrap.scrollWidth};});
   assert(desktopGeometry.scroll<=desktopGeometry.wrap+2,'Reasons require horizontal scrolling: '+JSON.stringify(desktopGeometry));
   await page.locator('#reviewSearch').fill('C16');await page.locator('[data-review-evidence]').first().click();
   const allChecks=await page.locator('#reviewEvidence').innerText();
   assert(allChecks.includes('耐压2000V来源待核实'));assert(allChecks.includes('数量'),'Expanded row omitted already checked fields');
   await page.locator('#reviewSearch').fill('');await page.locator('#reviewResults').screenshot({path:path.join(out,label+'-six-specific-reasons.png')});
   const detailedDownload=page.waitForEvent('download');await page.locator('#reviewExport').click();
   const detailedPath=path.join(out,label+'-六行具体原因报告.xlsx');await (await detailedDownload).saveAs(detailedPath);
   const detailedReport=X.read(fs.readFileSync(detailedPath),{type:'buffer'});
   const detailRows=X.utils.sheet_to_json(detailedReport.Sheets['检查项明细']);
   const allReportText=JSON.stringify(detailRows);specificWarnings.forEach(w=>assert(allReportText.includes(w),'Export lost '+w));
   assert.equal(detailRows.length,six.checks.length,'Report must retain every individual check');
   await page.setViewportSize({width:390,height:844});
   const mobileGeometry=await page.locator('#reviewPanel').evaluate(e=>({width:e.getBoundingClientRect().width,scroll:e.scrollWidth}));
   assert(mobileGeometry.scroll<=mobileGeometry.width+2,JSON.stringify(mobileGeometry));
   await page.locator('#reviewResults').screenshot({path:path.join(out,label+'-six-mobile.png')});
   // Current conversion handoff retains a row-bound confirmation snapshot.
   await page.setViewportSize({width:1440,height:1000});
   await page.evaluate(async()=>{
    const h=['型号','封装','位号','数量','参数描述','备注','立创编号'];
    const row={'型号':'CUSTOM-CHIP','封装':'QFN32','位号':'U1','数量':'1','参数描述':'收发芯片','备注':'人工确认：型号对应关系待确认；处理=已核实型号对应关系，保留源型号及当前采购编号','立创编号':'C10001'};
    const swb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(swb,XLSX.utils.aoa_to_sheet([h,h.map(f=>f==='型号'?'CATALOG-CHIP':f==='备注'?'':row[f]??'')]),'BOM');
    const sourceDoc=BOMReview.readWorkbook(swb,XLSX,{name:'original-alias.xlsx'});
    const context={details:[],records:[{schema:1,ref:row['位号'],model:row['型号'],signature:BOMReview.rowSignature(row),sourceSignature:BOMReview.sourceSignature(sourceDoc,row['位号']),entries:[{kind:'model',reason:'型号对应关系待确认',action:'已核实型号对应关系，保留源型号及当前采购编号',time:'2026-11-04T10:00:00+08:00',confirmed:true,resolved:true,note:row['备注'],fields:['型号'],source:{model:'CUSTOM-CHIP',package:'QFN32',code:'C10001'},official:{model:'CATALOG-CHIP',package:'QFN32',code:'C10001'}}]}]};
    BOM_REVIEW_UI.remember(h,[h.map(f=>row[f]??'')],{rows:[{...row,'型号':'CATALOG-CHIP','备注':''}],_fn:'original-alias.xlsx'},'confirmed-alias.xlsx',context);
    context.records[0].entries[0].confirmed=false;
    await BOM_REVIEW_UI.useLast();
   });
   const confirmed=await page.evaluate(()=>BOM_REVIEW_UI.state.result);assert.equal(confirmed.auditCounts.confirmed,1);assert.equal(confirmed.auditCounts.unverified,0);
   assert((await page.locator('#reviewResultBody').innerText()).includes('人工已确认'));
   const savedAlias={'型号':'CUSTOM-CHIP','封装':'QFN32','位号':'U1','数量':1,'参数描述':'收发芯片','备注':'人工确认：型号对应关系待确认；处理=已核实型号对应关系，保留源型号及当前采购编号','立创编号':'C10001'};
   const savedRecord=signedSourceRecord(savedAlias,[{...savedAlias,'型号':'CATALOG-CHIP','备注':''}]);
   await page.locator('#reviewFile').setInputFiles(evidenceFixture([savedAlias],[],[savedRecord],'saved-confirmed.xlsx'));
   await page.waitForFunction(()=>BOM_REVIEW_UI.state.primary?.valid);await page.locator('#reviewRun').click();
   assert.equal(await page.evaluate(()=>BOM_REVIEW_UI.state.result.auditCounts.confirmed),1,'Workbook re-import lost confirmation');
   const confirmationDownload=page.waitForEvent('download');await page.locator('#reviewExport').click();
   const confirmationPath=path.join(out,label+'-人工确认审查报告.xlsx');await (await confirmationDownload).saveAs(confirmationPath);
   const confirmationReport=X.read(fs.readFileSync(confirmationPath),{type:'buffer'});
   const confirmationRows=X.utils.sheet_to_json(confirmationReport.Sheets['检查项明细']);
   assert(confirmationRows.some(r=>r['核对结果']==='人工已确认'&&String(r['人工确认记录']).includes('2026-11-04T10:00:00+08:00')&&String(r['人工确认记录']).includes('已核实型号对应关系')));
   await page.locator('#reviewFile').setInputFiles(evidenceFixture([{...savedAlias,'型号':'EDITED-CHIP'}],[],[savedRecord],'edited-after-confirmation.xlsx'));
   await page.waitForFunction(()=>BOM_REVIEW_UI.state.primary?.valid);await page.locator('#reviewRun').click();
   assert.equal(await page.evaluate(()=>BOM_REVIEW_UI.state.result.auditCounts.confirmed),0,'Edited workbook reused stale confirmation');
   const noEvidence=[{'型号':'CUSTOM-CHIP','封装':'QFN32','位号':'U1','数量':1,'参数描述':'收发芯片','备注':'人工确认：型号对应关系待确认','立创编号':'C10001'}];
   await page.locator('#reviewFile').setInputFiles(evidenceFixture(noEvidence));await page.waitForFunction(()=>BOM_REVIEW_UI.state.primary?.valid);await page.locator('#reviewRun').click();
   const fresh=await page.evaluate(()=>BOM_REVIEW_UI.state.result);assert.equal(fresh.auditCounts.confirmed,0);assert.equal(fresh.auditCounts.unverified,1,'New upload inherited unrelated confirmation');
   const changedSource=await sourceChangeScenario(page,label);
   const unchanged=await page.evaluate(()=>({lib:window.__beforeLib===JSON.stringify([window.materialDB_standard,window.materialDB_lcsc]),b:window.__beforeB===JSON.stringify(window.B)}));assert(unchanged.lib&&unchanged.b);
   assert.equal(errors.length,0,errors.join('\n'));
   records.push({label,original:result.counts,originalRows:result.document.rows,fixed:fixed.counts,report:reportPath,six:six.auditCounts,specificReasons:specificWarnings,detailedReport:detailedPath,confirmed:confirmed.auditCounts,confirmationReport:confirmationPath,changedSource,errors});
   await context.close();
  }
  fs.writeFileSync(path.join(out,process.env.BOM_REVIEW_SOURCE_ONLY==='1'?'browser-review-source-change-results.json':'browser-review-results.json'),JSON.stringify(records,null,2));console.log('PASS',JSON.stringify(records));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
