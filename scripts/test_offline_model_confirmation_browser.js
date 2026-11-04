// 型号名称差异人工确认验收；全部BOM和接口数据均为受控样本，不写生产库。
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),http=require('node:http');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));
const XLSX=require('../v3-cloudbase/web/assets/vendor/xlsx.full.min.js');
const root=path.resolve(__dirname,'..'),output=process.env.BOM_MODEL_REVIEW_OUTPUT;
assert(output&&/^D:[\\/]/i.test(output),'BOM_MODEL_REVIEW_OUTPUT must be on D:');
fs.mkdirSync(output,{recursive:true});
const edge=[process.env.EDGE_PATH,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>p&&fs.existsSync(p));
assert(edge,'Microsoft Edge is required');
const qfn='QFN48-0_35-5_0X5_0HS3_8-H0_9';
const sourceRows=[
 ['TYPEC-304-BCP16','J6','TYPEC-304-BCP16','C2982555',''],
 ['TP6310','U8,U9,U10,U11',qfn,'C9900123247',''],
 ['CB5337','U14','CB5337','C9900170068','']
];
const companyKey={material_code:'1-IC-TP6310',name:'公司定型TP6310',model:'TP6310',specification:'公司批准参数：TP6310专用配置',package:qfn,brand:'公司指定供方',lcsc_code:'C9900123247',unit:'PCS'};
const standard=[companyKey,{material_code:'1-TEST-DUMMY',name:'测试占位',model:'UNRELATED',specification:'无关公司记录',package:'SOT23',brand:'Test',lcsc_code:'',unit:'PCS'}];
const fixtures={
 C2982555:{hit:true,productCode:'C2982555',productModel:'TYPEC-304-ACP16',productType:'USB连接器',package:'SMD',brand:'商城连接器品牌',specification:'商城USB连接器资料',_extracted:{}},
 C720629:{hit:true,productCode:'C720629',productModel:'TYPEC-304-BCP16',productType:'USB连接器',package:'SMD',brand:'商城连接器品牌',specification:'商城USB连接器资料',_extracted:{}},
 C9900123247:{hit:true,productCode:'C9900123247',productModel:'A5800m',productType:'电源管理芯片',package:'QFN48-5x5-0.35',brand:'商城A5800m品牌',specification:'商城A5800m参数',_extracted:{}},
 C9900170068:{hit:true,productCode:'C9900170068',productModel:'CB5337C',productType:'电源管理芯片',package:'QFN-16_3x3mm',brand:'商城CB品牌',specification:'商城CB5337C参数',_extracted:{}},
 C820001:{hit:true,productCode:'C820001',productModel:'OTHER-PART',productType:'集成电路',package:'QFN48,4x4mm',brand:'Test',_extracted:{}},
 C820002:{hit:true,productCode:'C820002',productModel:'RES-22R',productType:'贴片电阻',package:'0402',brand:'Test',specification:'厚膜电阻 22Ω ±1% 1/16W SMD 0402',_extracted:{resistance:'22Ω',tolerance:'±1%',power:'1/16W'}},
 C820003:{hit:true,productCode:'C820003',productModel:'CAP-6PF',productType:'贴片电容(MLCC)',package:'0402',brand:'Test',specification:'MLCC 6pF ±0.25pF 50V C0G SMD 0402',_extracted:{capacitance:'6pF',tolerance:'±0.25pF',voltage:'50V',dielectric:'C0G'}}
};
function bytes(rows){
 const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Comment','Designator','Footprint','嘉立创元件编号','参数描述'],...rows]),'嘉立创BOM');
 return Buffer.from(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));
}
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.js':'application/javascript','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}[path.extname(file)]||'application/octet-stream'});
 fs.createReadStream(file).pipe(res);
});
async function newPage(browser,base,relative){
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1600,height:1050}}),errors=[];
 page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>{
  const url=route.request().url();
  if(url.startsWith(base+'/'))return route.continue();
  if(url.includes('/npm/xlsx@'))return route.fulfill({path:path.join(root,'v3-cloudbase/web/assets/vendor/xlsx.full.min.js'),contentType:'application/javascript'});
  if(url.includes('/npm/jszip@'))return route.fulfill({path:path.join(root,'v3-cloudbase/web/assets/vendor/jszip.min.js'),contentType:'application/javascript'});
  if(url.includes('/batch?'))return route.fulfill({json:{ok:true,results:new URL(url).searchParams.get('codes').split(',').map(code=>({query:code,ok:!!fixtures[code],data:fixtures[code]}))}});
  return route.abort();
 });
 await page.goto(base+'/'+relative,{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>typeof offlineReviewPrepare==='function'&&document.getElementById('msgA')?.textContent.includes('已就绪'));
 await page.evaluate(standard=>{
  document.body.classList.remove('v3-not-logged');document.getElementById('v3LoginMask').classList.remove('show');showPanelDirect('compare');
  materialDB_standard=standard;materialDB_lcsc=[];materialDB_rf_inductor=[];materialDB_cost=[];setActiveLib('standard');
  window.BOM_STANDARD_SYNC={status:'ready',count:standard.length,error:''};
  window.testAlerts=[];window.alert=value=>testAlerts.push(String(value));window.confirm=()=>true;
  window.modelTestLibraries=JSON.stringify([materialDB_standard,materialDB_lcsc,materialDB_rf_inductor,materialDB_cost]);
 },standard);
 return {page,errors};
}
async function upload(page,rows,name){
 await page.locator('#fileB').setInputFiles({name,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:bytes(rows)});
 await page.waitForFunction(name=>B&&B._fn===name,name);
 await page.locator('#goBtn').click();await page.waitForFunction(()=>!document.getElementById('fmtAB').disabled);
 await page.locator('#fmtAB').click();await page.waitForFunction(()=>!fmtBusy&&document.getElementById('offlineReviewModal')?.style.display==='block');
 return page.evaluate(()=>({issues:OFFLINE_REVIEW_STATE.issues.map(i=>({index:i.sourceIndex,kind:i.kind,reason:i.reason})),counts:offlineReviewCounts()}));
}
async function confirmAll(page){
 const indices=await page.evaluate(()=>OFFLINE_REVIEW_STATE.issues.map((item,index)=>({item,index})).filter(x=>x.item.kind!=='hard'&&!offlineReviewConfirmed(x.item)).map(x=>x.index));
 for(const index of indices)await page.locator('#offlineReviewBody tr').nth(index).locator('input[type="checkbox"]').check();
 return page.evaluate(()=>offlineReviewCounts());
}
async function assertBlocked(page){
 let count=0;const handler=()=>count++;page.on('download',handler);
 await page.evaluate(()=>offlineReviewExport(false));
 assert.equal(count,0,'Unconfirmed or hard items exported a final BOM');
 assert(await page.locator('#offlineReviewExport').isDisabled(),'Final export button must stay disabled');
 page.off('download',handler);
}
function read(file){
 const wb=XLSX.read(fs.readFileSync(file),{type:'buffer'});
 assert.deepEqual(wb.SheetNames,['封面','单板BOM','补齐报告']);
 const rows=XLSX.utils.sheet_to_json(wb.Sheets['单板BOM'],{header:1,defval:''}).slice(5).filter(r=>r.some(v=>v!==''));
 const report=XLSX.utils.sheet_to_json(wb.Sheets['补齐报告'],{header:1,defval:''});
 const visible=wb.SheetNames.flatMap(n=>Object.entries(wb.Sheets[n]).filter(([a,c])=>!a.startsWith('!')&&c&&Object.hasOwn(c,'v')).map(([,c])=>String(c.v))).join('\n');
 return {rows,report,visible};
}
async function downloadFinal(page,file){
 const pending=page.waitForEvent('download',{timeout:20000});await page.locator('#offlineReviewExport').click();
 const download=await pending;assert(!download.suggestedFilename().includes('待复核'));
 await download.saveAs(file);const actual=read(file);assert(!actual.visible.includes('待复核稿'),'Final output still labeled as draft');
  // Exercise the real conversion handoff and the downloaded workbook, not a manufactured evidence record.
  await page.evaluate(()=>BOM_REVIEW_UI.useLast());
  const memory=await page.evaluate(()=>BOM_REVIEW_UI.state.result);
  assert.equal(memory.auditCounts.confirmed,1,JSON.stringify(memory.issues));
  assert.equal(memory.auditCounts.unverified,2);assert.equal(memory.auditCounts.abnormal,0);
  for(const audit of memory.rowAudits){
    assert(audit.confirmedChecks.length>0,'Model/package confirmation was lost for '+audit.refs);
    const code=audit.checks.find(c=>/^MATERIAL_CODE/.test(c.rule));
    assert.equal(code.rule,audit.refs==='U8,U9,U10,U11'?'MATERIAL_CODE_MATCH':'MATERIAL_CODE_MISSING');
    if(audit.refs!=='U8,U9,U10,U11')assert.equal(code.outcome,'pending','Model confirmation waived missing company code');
  }
  await page.locator('#reviewFile').setInputFiles(file);
  await page.waitForFunction(()=>BOM_REVIEW_UI.state.primary?.valid);
  await page.locator('#reviewRun').click();
  const reloaded=await page.evaluate(()=>BOM_REVIEW_UI.state.result);
  assert.deepEqual(reloaded.auditCounts,memory.auditCounts,'Saved workbook audit differs from conversion session');
  assert.equal(reloaded.checks.filter(c=>c.outcome==='confirmed').length,memory.checks.filter(c=>c.outcome==='confirmed').length);
  await page.evaluate(()=>showPanelDirect('compare'));
 return {...actual,filename:download.suggestedFilename()};
}
async function assertLibraries(page){
 assert(await page.evaluate(()=>modelTestLibraries===JSON.stringify([materialDB_standard,materialDB_lcsc,materialDB_rf_inductor,materialDB_cost])),'Current-BOM confirmation or edit modified a library');
}
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:edge,downloadsPath:path.join(output,'browser-downloads')});
 const results=[];
 try{
  for(const [label,relative] of [['domestic','v3-cloudbase/web/index.html'],['overseas','v3-legacy/index.html']]){
   const {page,errors}=await newPage(browser,base,relative);
   try{
    const checked=await upload(page,sourceRows,'截图三行_嘉立创BOM.xlsx');
    assert.equal(checked.counts.hard,0,JSON.stringify(checked.issues));
    for(const index of [0,1,2])assert(checked.issues.some(i=>i.index===index&&i.kind==='model'),JSON.stringify(checked.issues));
    assert.equal(await page.evaluate(()=>materialDB_lcsc.length),0,'Alias library must remain empty');
    await assertBlocked(page);
    await page.locator('#offlineReviewModal').screenshot({path:path.join(output,label+'-三行型号待确认.png')});
    const modelIndices=await page.evaluate(()=>OFFLINE_REVIEW_STATE.issues.map((item,index)=>({item,index})).filter(x=>x.item.kind==='model').map(x=>x.index));
    for(const index of modelIndices)await page.locator('#offlineReviewBody tr').nth(index).locator('input[type="checkbox"]').check();
    const actionText=await page.locator('#offlineReviewBody').innerText();
    assert(actionText.includes('已核实型号对应关系'),'Model confirmation wording does not describe engineer responsibility');
    const finalCounts=await confirmAll(page);assert.equal(finalCounts.pending,0);assert.equal(finalCounts.hard,0);
    await page.locator('#offlineReviewModal').screenshot({path:path.join(output,label+'-三行已确认可导出.png')});
    const actual=await downloadFinal(page,path.join(output,label+'-三行人工确认最终BOM.xlsx'));
    assert.equal(actual.rows.length,3);
    let refTotal=0;
    for(const source of sourceRows){
     const row=actual.rows.find(r=>r[5]===source[1]);assert(row,'Missing '+source[1]);
     assert.equal(row[3],source[0]);assert.equal(row[8],source[2]);
     const quantity=source[1].split(',').length;assert.equal(Number(row[6]),quantity);refTotal+=quantity;
     const reports=actual.report.filter(r=>r[0]===source[1]).map(r=>String(r[4])).join('\n');
     assert(reports.includes(source[3]),'Report lost source purchasing code '+source[3]);
     assert(reports.includes(fixtures[source[3]].productModel),'Report lost official model comparison');
     assert(reports.includes('确认时间'),'Report lost confirmation timestamp');
    }
    assert.equal(refTotal,6);
    const keyRow=actual.rows.find(r=>r[5]==='U8,U9,U10,U11');
    assert.deepEqual([keyRow[1],keyRow[2],keyRow[4],keyRow[9]],[companyKey.material_code,companyKey.name,companyKey.specification,companyKey.brand],
     'Marketplace A5800m overwrote company TP6310 key information');
    await assertLibraries(page);
    // 在当前行更正J6采购编号后，型号差异消失且该行旧确认失效。
    await page.evaluate(()=>offlineReviewRefresh());
    const editIndex=await page.evaluate(()=>OFFLINE_REVIEW_STATE.issues.findIndex(i=>i.sourceIndex===0&&i.kind==='model'));
    assert(editIndex>=0);
    const previousKeys=await page.evaluate(()=>Object.keys(OFFLINE_REVIEW_STATE.decisions).filter(key=>JSON.parse(key)[0]===0));
    const input=page.locator('#offlineEdit-'+editIndex+'-2');
    if(!await input.isVisible())await input.evaluate(el=>{const details=el.closest('details');if(details)details.open=true;});
    await input.fill('C720629');await page.evaluate(index=>offlineReviewSaveRow(index),editIndex);
    const edited=await page.evaluate(()=>({code:B.rows[0]['立创编号'],issues:OFFLINE_REVIEW_STATE.issues.filter(i=>i.sourceIndex===0).map(i=>({kind:i.kind,confirmed:offlineReviewConfirmed(i)})),keys:Object.keys(OFFLINE_REVIEW_STATE.decisions)}));
    assert.equal(edited.code,'C720629');assert(!edited.issues.some(i=>i.kind==='model'),JSON.stringify(edited.issues));
    assert(edited.issues.some(i=>!i.confirmed),'Edited row reused old confirmation');
    assert(previousKeys.every(key=>!edited.keys.includes(key)),'Old confirmation survived purchasing-code change');
    await confirmAll(page);
    const corrected=await downloadFinal(page,path.join(output,label+'-J6修改采购编号最终BOM.xlsx'));
    assert.equal(corrected.rows.length,3);assert.equal(corrected.rows.find(r=>r[5]==='J6')[3],'TYPEC-304-BCP16');
    assert(corrected.report.some(r=>r[0]==='J6'&&String(r[4]).includes('C720629')));
    await assertLibraries(page);assert.deepEqual(errors,[]);
    results.push({label,case:'three-model-differences',rows:3,references:6,normalExportAfterIndividualConfirmation:true,sourceIdentityPreserved:true,reportContainsCodesAndOfficialModels:true,companyKeyPreserved:true,currentRowCodeCorrection:true,oldConfirmationsInvalidated:true,librariesUnchanged:true});
   }finally{await page.close();}
   for(const guard of [
    {id:'physical',row:['SOURCE-PART','U1','QFN48,5x5mm','C820001',''],reason:/尺寸/},
    {id:'electrical',row:['10K','R1','SR0402','C820002','厚膜电阻 10KΩ ±1% 1/16W SMD 0402'],reason:/阻值/},
    {id:'small-cap',row:['6pF','C1','SC0402','C820003','MLCC 6pF ±0.25pF 50V C0G SMD 0402'],reason:/精度/}
   ]){
    const guarded=await newPage(browser,base,relative);
    try{
     const check=await upload(guarded.page,[sourceRows[0],guard.row],'硬规则-'+guard.id+'.xlsx');
     assert(check.issues.some(i=>i.kind==='model'),'Guard must include a confirmable model difference');
     assert(check.issues.some(i=>i.kind==='hard'&&guard.reason.test(i.reason)),JSON.stringify(check.issues));
     await confirmAll(guarded.page);await assertBlocked(guarded.page);
     const counts=await guarded.page.evaluate(()=>offlineReviewCounts());assert(counts.hard>0);
     await assertLibraries(guarded.page);assert.deepEqual(guarded.errors,[]);
     results.push({label,case:guard.id,modelConfirmationDoesNotBypassHardRule:true});
    }finally{await guarded.page.close();}
   }
   console.log(label+': three model differences confirmed to final BOM, current-row correction, company-key preservation and three hard-rule guards passed');
  }
  fs.writeFileSync(path.join(output,'offline-model-review-results.json'),JSON.stringify({results},null,2));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack||error);server.close();process.exitCode=1;});
