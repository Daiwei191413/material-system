// 线下BOM确认与待复核稿端到端验收；真实BOM和接口快照仅从外部路径读取。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const {chromium} = require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));
const XLSX = require('../v3-cloudbase/web/assets/vendor/xlsx.full.min.js');
const root=path.resolve(__dirname,'..'), output=process.env.BOM_OFFLINE_REVIEW_OUTPUT;
assert(output && /^D:[\\/]/i.test(output),'BOM_OFFLINE_REVIEW_OUTPUT must be on D:');
fs.mkdirSync(output,{recursive:true});
const edge=[process.env.EDGE_PATH,'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe','C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p=>p&&fs.existsSync(p));
assert(edge,'Microsoft Edge is required');
const standard=[{material_code:'1-TEST-00001',name:'测试IC',model:'TEST-IC',specification:'受控测试资料',package:'SOT-23-6',brand:'Test',lcsc_code:'',unit:'PCS'}];
const fixtures={
 C408450:{hit:true,productCode:'C408450',productModel:'MWSA0603S-8R2MT',productType:'功率电感',package:'SMD,7x6.6mm',brand:'Sunlord',specification:'电感值：8.2uH, 精度：±20%, 额定电流：5A',_extracted:{inductance:'8.2uH',tolerance:'±20%',current:'5A'}},
 C810001:{hit:true,productCode:'C810001',productModel:'CAP-100NF',productType:'贴片电容(MLCC)',package:'0402',brand:'Test',specification:'MLCC 100nF ±10% 50V SMD 0402',_extracted:{capacitance:'100nF',tolerance:'±10%',voltage:'50V'}},
 C810002:{hit:true,productCode:'C810002',productModel:'CAP-6PF-BAD',productType:'贴片电容(MLCC)',package:'0402',brand:'Test',specification:'MLCC 6pF ±0.25pF 50V C0G SMD 0402',_extracted:{capacitance:'6pF',tolerance:'±0.25pF',voltage:'50V',dielectric:'C0G'}},
 C810003:{hit:true,productCode:'C810003',productModel:'RES-22R',productType:'贴片电阻',package:'0402',brand:'Test',specification:'厚膜电阻 22Ω ±1% 1/16W SMD 0402',_extracted:{resistance:'22Ω',tolerance:'±1%',power:'1/16W'}},
 C810004:{hit:true,productCode:'C810004',productModel:'CAP-6PF-GOOD',productType:'贴片电容(MLCC)',package:'0402',brand:'Test',specification:'MLCC 6pF ±0.1pF 50V C0G SMD 0402',_extracted:{capacitance:'6pF',tolerance:'±0.1pF',voltage:'50V',dielectric:'C0G'}}
};
function workbookBytes(rows){
 const wb=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['Comment','Designator','Footprint','嘉立创元件编号','参数描述'],...rows]),'嘉立创BOM');
 return Buffer.from(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));
}
function refs(value){return String(value||'').toUpperCase().split(/[,，;；\s]+/).map(v=>v.trim()).filter(Boolean);}
function readExport(file){
 const wb=XLSX.read(fs.readFileSync(file),{type:'buffer',cellStyles:true});
 assert.deepEqual(wb.SheetNames,['封面','单板BOM','补齐报告']);
 const rows=XLSX.utils.sheet_to_json(wb.Sheets['单板BOM'],{header:1,defval:''}).slice(5).filter(r=>r.some(v=>v!==''));
 const report=XLSX.utils.sheet_to_json(wb.Sheets['补齐报告'],{header:1,defval:''});
 const visible=wb.SheetNames.flatMap(n=>Object.entries(wb.Sheets[n]).filter(([a,c])=>!a.startsWith('!')&&c&&Object.hasOwn(c,'v')).map(([,c])=>String(c.v))).join('\n');
 return {wb,rows,report,visible};
}
const server=http.createServer((req,res)=>{
 const file=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 if(!file.startsWith(root+path.sep)||!fs.existsSync(file)||!fs.statSync(file).isFile()){res.writeHead(404);res.end();return;}
 res.writeHead(200,{'Content-Type':{'.html':'text/html; charset=utf-8','.js':'application/javascript','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}[path.extname(file)]||'application/octet-stream'});
 fs.createReadStream(file).pipe(res);
});
async function preparePage(browser,base,relative,data,library=standard,syncStatus='ready'){
 const liveUrl=relative.startsWith('v3-cloudbase/')
  ? 'https://techphant-bom-v3-d9e3pqqb0b46c88-1363491993.tcloudbaseapp.com/'
  : 'https://techphant-bom-tools-v3.pages.dev/';
 const live=process.argv.includes('--live');
 const page=await browser.newPage({acceptDownloads:true,viewport:{width:1600,height:1050}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{
  const url=route.request().url();
  if(url.startsWith(base+'/'))return route.continue();
  if(url.includes('/npm/xlsx@'))return route.fulfill({path:path.join(root,'v3-cloudbase/web/assets/vendor/xlsx.full.min.js'),contentType:'application/javascript'});
  if(url.includes('/npm/jszip@'))return route.fulfill({path:path.join(root,'v3-cloudbase/web/assets/vendor/jszip.min.js'),contentType:'application/javascript'});
  if(url.includes('/batch?'))return route.fulfill({json:{ok:true,results:new URL(url).searchParams.get('codes').split(',').map(code=>({query:code,ok:!!data[code],data:data[code]}))}});
  if(live&&url.startsWith(liveUrl)&&['GET','HEAD'].includes(route.request().method()))return route.continue();
  return route.abort();
 });
 await page.goto(live?liveUrl:base+'/'+relative,{waitUntil:'domcontentloaded'});
 if(live&&await page.title()==='风险提醒')await page.getByText('确定访问',{exact:true}).click();
 await page.waitForFunction(()=>typeof offlineReviewPrepare==='function'&&document.getElementById('msgA')?.textContent.includes('已就绪'));
 await page.evaluate(({library,syncStatus})=>{
  document.body.classList.remove('v3-not-logged');document.getElementById('v3LoginMask').classList.remove('show');showPanelDirect('compare');
  materialDB_standard=library;materialDB_rf_inductor=[];materialDB_lcsc=[];materialDB_cost=[];setActiveLib('standard');
  window.BOM_STANDARD_SYNC={status:syncStatus,count:library.length,error:syncStatus==='error'?'受控断网':''};
  window.testAlerts=[];window.testConfirms=[];
  window.alert=s=>testAlerts.push(String(s));window.confirm=s=>{testConfirms.push(String(s));return true;};
  window.testLibraries=JSON.stringify([materialDB_standard,materialDB_lcsc,materialDB_rf_inductor,materialDB_cost]);
 },{library,syncStatus});
 return {page,errors};
}
async function uploadAndCheck(page,rows,name='人工确认_V1.0_嘉立创BOM.xlsx',buffer){
 await page.locator('#fileB').setInputFiles({name,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:buffer||workbookBytes(rows)});
 await page.waitForFunction(name=>B&&B._fn===name,name);
 await page.locator('#goBtn').click();
 await page.waitForFunction(()=>!document.getElementById('fmtAB').disabled);
 return page.evaluate(()=>({source:B.rows.map(r=>({...r})),issues:OFFLINE_REVIEW_STATE.issues.map(i=>({sourceIndex:i.sourceIndex,kind:i.kind,reason:i.reason,fields:i.fields})),counts:offlineReviewCounts(),summary:document.getElementById('checkSummary').textContent}));
}
async function openReview(page){
 await page.locator('#fmtAB').click();
 await page.waitForFunction(()=>!fmtBusy&&document.getElementById('offlineReviewModal')?.style.display==='block');
}
async function confirmPending(page){
 await page.evaluate(()=>{
  for(const kind of [...new Set(OFFLINE_REVIEW_STATE.issues.filter(i=>i.kind!=='hard'&&!offlineReviewConfirmed(i)).map(i=>i.kind))])offlineReviewConfirmKind(kind);
 });
 return page.evaluate(()=>offlineReviewCounts());
}
async function saveDownload(page,file,action){
 const pending=page.waitForEvent('download',{timeout:20000});
 await action();const download=await pending;await download.saveAs(file);
 return {suggestedFilename:download.suggestedFilename(),...readExport(file)};
}
async function assertLibraries(page){assert(await page.evaluate(()=>testLibraries===JSON.stringify([materialDB_standard,materialDB_lcsc,materialDB_rf_inductor,materialDB_cost])),'Confirmation or edit wrote a material library');}
async function assertNoNormalDownload(page){
 let count=0;const handler=()=>count++;page.on('download',handler);
 await page.evaluate(()=>offlineReviewExport(false));
 assert.equal(count,0,'Unresolved or hard issues exported a normal BOM');
 assert(await page.locator('#offlineReviewExport').isDisabled(),'Normal export must stay disabled');
 page.off('download',handler);
}
async function runBridgeBoundary(browser,base,relative,label){
 const {page,errors}=await preparePage(browser,base,relative,fixtures);
 const rows=[
  ['MWSA0603S-8R2MT','L1','MWSA0603S-5R6MT'],
  ['AS0807-68NK','L26,L36,L40,L42','AS0807-68NK']
 ];
 const source=XLSX.utils.book_new();
 XLSX.utils.book_append_sheet(source,XLSX.utils.aoa_to_sheet([['Value','Reference','PCB Footprint'],...rows]),'原理图BOM');
 const sourceBytes=Buffer.from(XLSX.write(source,{type:'buffer',bookType:'xlsx'}));
 try{
  await page.evaluate(()=>{
   showPanelDirect('convert');
   materialDB_lcsc=[{model:'MWSA0603S-8R2MT',package:'MWSA0603S-5R6MT',lcsc_code:'C408450'}];
   window.testLibraries=JSON.stringify([materialDB_standard,materialDB_lcsc,materialDB_rf_inductor,materialDB_cost]);
  });
  await page.locator('#convFile').setInputFiles({name:'桥接_原理图BOM.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:sourceBytes});
  await page.waitForFunction(()=>CONV_OUT.length===2&&!CONV_OUT.some(r=>r.status==='verifying'));
  const before=await page.evaluate(()=>CONV_OUT.map(r=>({ref:r.designator,status:r.status,packageConfirmRequired:r.packageConfirmRequired})));
  assert(before.find(r=>r.ref==='L1')?.packageConfirmRequired,JSON.stringify(before));
  assert.equal(before.find(r=>r.ref==='L26,L36,L40,L42')?.status,'unmatched');
  await page.evaluate(async()=>{
   await confirmConvPackage(CONV_OUT.findIndex(r=>r.designator==='L1'));
   setConvDeferredRows([CONV_OUT.findIndex(r=>r.designator==='L26,L36,L40,L42')],true);
  });
  const confirmed=await page.evaluate(()=>CONV_OUT.map(r=>({ref:r.designator,packageConfirmed:convPackageConfirmationMatches(r,{productCode:r.lcsc,package:r.officialPackage}),deferred:isConvDeferred(r),model:r.comment,footprint:r.footprint,code:r.lcsc})));
  assert(confirmed.find(r=>r.ref==='L1').packageConfirmed);assert(confirmed.find(r=>r.ref==='L26,L36,L40,L42').deferred);
  const pending=page.waitForEvent('download',{timeout:20000});await page.evaluate(()=>exportJlcBom());
  const jlc=await pending,jlcPath=path.join(output,label+'-桥接-四列立创BOM.xlsx');await jlc.saveAs(jlcPath);
  const jlcBytes=fs.readFileSync(jlcPath),wb=XLSX.read(jlcBytes,{type:'buffer'});
  assert.deepEqual(wb.SheetNames,['嘉立创BOM']);
  const matrix=XLSX.utils.sheet_to_json(wb.Sheets['嘉立创BOM'],{header:1,defval:''});
  assert.equal(matrix.length,3);assert(matrix.every(r=>r.length===4));
  assert.deepEqual(matrix[0],['Comment','Designator','Footprint','嘉立创元件编号']);
  assert.deepEqual(matrix.find(r=>r[1]==='L1'),['MWSA0603S-8R2MT','L1','MWSA0603S-5R6MT','C408450']);
  assert.deepEqual(matrix.find(r=>r[1]==='L26,L36,L40,L42'),['AS0807-68NK','L26,L36,L40,L42','AS0807-68NK','']);
  await page.evaluate(()=>showPanelDirect('compare'));
  await uploadAndCheck(page,null,jlc.suggestedFilename(),jlcBytes);
  const inherited=await page.evaluate(()=>OFFLINE_REVIEW_STATE.issues.filter(i=>i.kind==='package'||i.kind==='source').map(i=>({kind:i.kind,index:i.sourceIndex,confirmed:offlineReviewConfirmed(i),action:OFFLINE_REVIEW_STATE.decisions[i.key]?.action})));
  assert(inherited.some(i=>i.kind==='package'&&i.index===0&&i.confirmed&&i.action.includes('承接')),JSON.stringify(inherited));
  assert(inherited.some(i=>i.kind==='source'&&i.index===1&&i.confirmed&&i.action.includes('承接')),JSON.stringify(inherited));
  await page.evaluate(()=>{renderOfflineReviewModal();document.getElementById('offlineReviewModal').style.display='block';});
  await confirmPending(page);
  assert.equal(await page.evaluate(()=>offlineReviewCounts().hard),0);
  const normal=await saveDownload(page,path.join(output,label+'-桥接-线下BOM.xlsx'),()=>page.locator('#offlineReviewExport').click());
  assert.equal(normal.rows.length,2);
  for(const original of rows){
   const actual=normal.rows.find(r=>r[5]===original[1]);
   assert(actual);assert.equal(actual[3],original[0]);assert.equal(actual[8],original[2]);assert.equal(Number(actual[6]),refs(original[1]).length);
  }
  assert(normal.report.some(r=>String(r[4]).includes('承接本次原理图转换')));
  await assertLibraries(page);
  // 官方封装变化后，不得承接前一步的旧焊盘确认。
  const changedOfficial=await page.evaluate(async data=>{
   window.bridgeOfficial=data;
   window.fetchLcscDetailsByCodes=async codes=>Object.fromEntries(codes.map(code=>[code,{ok:!!bridgeOfficial[code],data:bridgeOfficial[code]}]));
   bridgeOfficial.C408450={...bridgeOfficial.C408450,package:'SMD,8x7mm'};
   await offlineReviewPrepare(true);
   return OFFLINE_REVIEW_STATE.issues.filter(i=>i.kind==='package'&&i.sourceIndex===0).map(i=>({confirmed:offlineReviewConfirmed(i),package:i.official?.package}));
  },fixtures);
  assert(changedOfficial.some(i=>i.package==='SMD,8x7mm'&&!i.confirmed),JSON.stringify(changedOfficial));
  // 即使上传文件名相同，源行变更也不得承接原有确认。
  await page.evaluate(()=>{bridgeOfficial.C408450={...bridgeOfficial.C408450,package:'SMD,7x6.6mm'};});
  const changed=matrix.map(r=>r.slice());changed.find(r=>r[1]==='L1')[2]='MWSA0603S-CHANGED';
  const changedWb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(changedWb,XLSX.utils.aoa_to_sheet(changed),'嘉立创BOM');
  await uploadAndCheck(page,null,jlc.suggestedFilename(),Buffer.from(XLSX.write(changedWb,{type:'buffer',bookType:'xlsx'})));
  const changedSource=await page.evaluate(()=>OFFLINE_REVIEW_STATE.issues.filter(i=>i.kind==='package'&&i.sourceIndex===0).map(i=>({confirmed:offlineReviewConfirmed(i),package:i.package})));
  assert(changedSource.some(i=>i.package==='MWSA0603S-CHANGED'&&!i.confirmed),JSON.stringify(changedSource));
  await assertLibraries(page);assert.deepEqual(errors,[]);
  return {label,case:'schematic-jlc-offline-bridge',schematicRows:2,jlcColumns:4,offlineRows:2,
   packageConfirmationInherited:true,deferredSourceInherited:true,officialChangeInvalidates:true,sourceChangeInvalidates:true,librariesUnchanged:true};
 }finally{await page.close();}
}
async function runAdditionalBoundaries(browser,base,relative,label){
 const {page,errors}=await preparePage(browser,base,relative,fixtures);
 const rowsFor=(model='MWSA0603S-8R2MT',pkg='CUSTOM-A',code='C408450',ref='L1')=>[[model,ref,pkg,code,'']];
 async function uploadOnly(rows,name){
  await page.locator('#fileB').setInputFiles({name,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:workbookBytes(rows)});
  await page.waitForFunction(name=>B&&B._fn===name,name);
 }
 async function installOfficial(map){
  await page.evaluate(map=>{
   window.boundaryOfficial=map;
   window.fetchLcscDetailsByCodes=async codes=>Object.fromEntries(codes.map(code=>[code,{ok:!!boundaryOfficial[code],data:boundaryOfficial[code]}]));
  },map);
 }
 try{
  // 首轮官网返回错误精度，预检二次查询异常，已取得的明确冲突不能退化为“未知可确认”。
  await uploadOnly([['6pF','C6','SC0402','C810002','MLCC 6pF ±0.25pF 50V C0G SMD 0402']],'边界-首轮精度.xlsx');
  await page.evaluate(()=>{
   var original=fetchLcscDetailsByCodes,calls=0;window.boundaryFetchCalls=0;
   window.fetchLcscDetailsByCodes=codes=>{
    boundaryFetchCalls=++calls;
    if(calls===1)return original(codes);
    return Promise.reject(new Error('受控预检二次查询失败'));
   };
  });
  await page.locator('#goBtn').click();await page.waitForFunction(()=>!document.getElementById('fmtAB').disabled);
  const secondFailure=await page.evaluate(()=>({calls:boundaryFetchCalls,issues:OFFLINE_REVIEW_STATE.issues.map(i=>({kind:i.kind,reason:i.reason}))}));
  assert(secondFailure.calls>=2,'Second lookup failure was not exercised');
  assert(secondFailure.issues.some(i=>i.kind==='hard'&&/精度/.test(i.reason)),JSON.stringify(secondFailure));
  // 即使网络失败，本地指定库感值冲突也不能被 catch 分支抹掉。
  await uploadOnly(rowsFor('22nH','SL0402','C810090','L10'),'边界-RF本地冲突.xlsx');
  const rfFailure=await page.evaluate(async()=>{
   materialDB_rf_inductor=[{model:'RF-39NH',package:'0402',lcsc_code:'C810090',specification:'电感值：39nH，精度：±5%，额定电流：200mA',name:'绕线电感'}];
   window.fetchLcscDetailsByCodes=()=>Promise.reject(new Error('受控官网异常'));
   await offlineReviewPrepare(true);
   return OFFLINE_REVIEW_STATE.issues.map(i=>({kind:i.kind,reason:i.reason}));
  });
  assert(rfFailure.some(i=>i.kind==='hard'&&/感值|电感值|指定库/.test(i.reason)),JSON.stringify(rfFailure));
  await page.evaluate(()=>{materialDB_rf_inductor=[];});
  // 两边明确给出不同尺寸时，即使归一化成同一个封装家族也必须判为冲突。
  for(const item of [
   {id:'diameter',model:'XR4426T101MVL5',pkg:'插件,D=13.2mm',officialPkg:'插件,D=8mm',code:'C810091',ref:'L2'},
   {id:'qfn-dimensions',model:'TEST-QFN',pkg:'QFN48,5x5mm',officialPkg:'QFN48,4x4mm',code:'C810092',ref:'U1'}
  ]){
   await uploadOnly(rowsFor(item.model,item.pkg,item.code,item.ref),'边界-'+item.id+'.xlsx');
   await installOfficial({[item.code]:{hit:true,productCode:item.code,productModel:item.model,productType:item.ref.startsWith('L')?'色环/插件电感':'集成电路',package:item.officialPkg,_extracted:{}}});
   const physical=await page.evaluate(async()=>{await offlineReviewPrepare(true);return OFFLINE_REVIEW_STATE.issues.map(i=>({kind:i.kind,reason:i.reason}));});
   assert(physical.some(i=>i.kind==='hard'&&/直径|尺寸/.test(i.reason)),item.id+': '+JSON.stringify(physical));
  }
  // 人工点击重新校验必须查询新官方资料，不能继续沿用旧确认。
  await uploadOnly(rowsFor(),'边界-强制刷新.xlsx');await installOfficial({C408450:fixtures.C408450});
  await page.evaluate(async()=>{await offlineReviewPrepare(true);renderOfflineReviewModal();});
  await confirmPending(page);
  assert((await page.evaluate(()=>offlineReviewCounts().confirmed))>0);
  const forced=await page.evaluate(async()=>{
   boundaryOfficial.C408450={...boundaryOfficial.C408450,package:'SMD,8x7mm'};
   await offlineReviewRefresh();
   return {counts:offlineReviewCounts(),packages:OFFLINE_REVIEW_STATE.issues.filter(i=>i.kind==='package').map(i=>({official:i.official.package,confirmed:offlineReviewConfirmed(i)}))};
  });
  assert(forced.packages.some(i=>i.official==='SMD,8x7mm'&&!i.confirmed),JSON.stringify(forced));
  assert(forced.counts.pending>0);
  // 编辑 A→B→A 后，A 上的旧确认不能复活。
  await confirmPending(page);
  const roundtrip=await page.evaluate(async()=>{
   const change=async value=>{
    renderOfflineReviewModal();
    const i=OFFLINE_REVIEW_STATE.issues.findIndex(i=>i.kind==='package');
    document.getElementById('offlineEdit-'+i+'-1').value=value;
    await offlineReviewSaveRow(i);
   };
   await change('CUSTOM-B');await change('CUSTOM-A');
   return {counts:offlineReviewCounts(),issues:OFFLINE_REVIEW_STATE.issues.filter(i=>i.kind==='package').map(i=>({confirmed:offlineReviewConfirmed(i),source:i.package}))};
  });
  assert(roundtrip.issues.some(i=>i.source==='CUSTOM-A'&&!i.confirmed),JSON.stringify(roundtrip));
  // 编辑框的双引号和HTML只应成为文本值，不能创建额外属性或标签。
  const quoted=await page.evaluate(async()=>{
   const attack='测试参数 " autofocus onfocus="window.__offlineInjected=1" <img src=x onerror="window.__offlineInjected=2">';
   window.__offlineInjected=0;
   renderOfflineReviewModal();
   var i=OFFLINE_REVIEW_STATE.issues.findIndex(i=>i.kind==='package');
   document.getElementById('offlineEdit-'+i+'-3').value=attack;
   await offlineReviewSaveRow(i);
   renderOfflineReviewModal();
   i=OFFLINE_REVIEW_STATE.issues.findIndex(i=>i.kind==='package');
   const input=document.getElementById('offlineEdit-'+i+'-3');
   input.focus();
   return {sameValue:input.value===attack,hasAutofocus:input.hasAttribute('autofocus'),hasOnfocus:input.hasAttribute('onfocus'),
    injected:window.__offlineInjected,images:document.querySelectorAll('#offlineReviewBody img').length};
  });
  assert.equal(quoted.sameValue,true);assert.equal(quoted.hasAutofocus,false);assert.equal(quoted.hasOnfocus,false);
  assert.equal(quoted.injected,0);assert.equal(quoted.images,0);
  await assertLibraries(page);assert.deepEqual(errors,[]);
  return {label,case:'additional-boundaries',firstOfficialConflictSurvivesLookupFailure:true,rfConflictSurvivesLookupFailure:true,
   diameterConflict:true,qfnDimensionsConflict:true,forcedRefreshInvalidates:true,roundtripDoesNotRevive:true,quotedEditsAreText:true};
 }finally{await page.close();}
}

async function runBrandCases(browser, base, relative, label) {
 const data = {...fixtures};
 for (const [code, model, productType, brand] of [
  ['C880001','COIL-A','绕线电感',''],
  ['C880002','BLM-TEST','片式磁珠','客户邮寄'],
  ['C880003','POWER-A','功率电感','Sunlord'],
  ['C880004','CHOKE-A','共模电感','']
 ]) data[code] = {hit:true,productCode:code,productModel:model,productType,brand,package:'0402',
  specification:'电感值：22nH, 精度：±5%, 额定电流：300mA',_extracted:{inductance:'22nH',tolerance:'±5%',current:'300mA'}};
 const {page,errors} = await preparePage(browser,base,relative,data);
 try {
  await uploadAndCheck(page,[
   ['COIL-A','L1','0402','C880001'],
   ['BLM-TEST','FB1','0402','C880002'],
   ['POWER-A','L2','0402','C880003'],
   ['CHOKE-A','CM1','0402','C880004'],
   ['0R','L3','0402','','厚膜电阻 0Ω ±1% 1/16W SMD 0402']
  ],'品牌检查_V1.0.xlsx');
  const initial = await page.evaluate(()=>({
   missing:OFFLINE_REVIEW_STATE.issues.filter(i=>i.kind==='brand').map(i=>i.ref),
   placeholders:['','未知','客户邮寄','TBD','N/A','—','待补充'].map(offlineHasBrand),
   official:fmtCore('AB',OFFLINE_REVIEW_STATE.result.byCode,{preview:true}),
   resistor:offlineNeedsInductorBrand({'型号':'0R','位号':'L3','物料名称':'贴片电阻'})
  }));
  assert.deepEqual(initial.missing.sort(),['CM1','FB1','L1']);
  assert(initial.placeholders.every(v=>!v));
  assert.equal(initial.resistor,false);
  const brandColumn = await page.evaluate(()=>A.hd.filter(Boolean).indexOf(A.fm['品牌']));
  assert(brandColumn>=0);
  assert.equal(initial.official.rows[2][brandColumn],'Sunlord');
  await openReview(page);
  await confirmPending(page);
  await assertNoNormalDownload(page);
  const draft = await saveDownload(page,path.join(output,label+'-缺品牌待复核稿.xlsx'),()=>page.locator('#offlineReviewDraft').click());
  assert(draft.visible.includes('品牌待补充'));
  await openReview(page);
  const invalid = await page.evaluate(async()=>{
   const i=OFFLINE_REVIEW_STATE.issues.findIndex(i=>i.kind==='brand');
   document.getElementById('offlineEdit-'+i+'-4').value='未知';
   await offlineReviewSaveRow(i);
   return testAlerts.at(-1);
  });
  assert(invalid.includes('实际品牌'));
  for (const [ref,brand] of [['L1','Test Coil'],['FB1','Test Bead & Co'],['CM1','Test Choke']]) {
   const index = await page.evaluate(ref=>OFFLINE_REVIEW_STATE.issues.findIndex(i=>i.kind==='brand'&&i.ref===ref),ref);
   await page.locator('#offlineEdit-'+index+'-4').evaluate(e=>e.closest('details').open=true);
   await page.locator('#offlineEdit-'+index+'-4').fill(brand);
   await page.locator('#offlineEdit-'+index+'-4').locator('..').locator('..').getByRole('button',{name:'保存并重新校验'}).click();
   await page.waitForFunction(ref=>!OFFLINE_REVIEW_STATE.issues.some(i=>i.kind==='brand'&&i.ref===ref),ref);
  }
  await confirmPending(page);
  const saved = await saveDownload(page,path.join(output,label+'-已补品牌最终BOM.xlsx'),()=>page.locator('#offlineReviewExport').click());
  for (const [ref,brand] of [['L1','Test Coil'],['FB1','Test Bead & Co'],['L2','Sunlord'],['CM1','Test Choke']]) {
   assert.equal(saved.rows.find(r=>r[5]===ref)[brandColumn],brand,ref+' exported brand');
  }
  assert(saved.visible.includes('工程师本次补填品牌'));
  await assertLibraries(page);
  // Export must check again even if a caller skips the review modal.
  const direct = await page.evaluate(()=>{
   B.rows[0]['品牌']='';delete B.rows[0]._offlineManualBrand;
   return fmtCore('AB',OFFLINE_REVIEW_STATE.result.byCode,{reviewExport:true});
  });
  assert.equal(direct,undefined);
  await page.evaluate(()=>closeOfflineSupplementModal());
  await uploadAndCheck(page,[['COIL-A','L1','0402','C880001']],'指定库缺品牌.xlsx');
  await page.evaluate(async()=>{
   materialDB_rf_inductor=[{material_code:'1-IN-09-00036',model:'COIL-A',package:'0402',lcsc_code:'C880001',
    name:'绕线电感',specification:'电感值：22nH, 精度：±5%, 额定电流：300mA',brand:''}];
   await offlineReviewPrepare(true);
  });
  await openReview(page);
  const companyBrand = await page.evaluate(async()=>{
   const before=JSON.stringify(materialDB_rf_inductor);
   const index=OFFLINE_REVIEW_STATE.issues.findIndex(i=>i.kind==='brand');
   if(index<0)throw new Error('Missing brand check for company RF record');
   document.getElementById('offlineEdit-'+index+'-4').value='Company Coil';
   await offlineReviewSaveRow(index);
   return {before,after:JSON.stringify(materialDB_rf_inductor),preview:fmtCore('AB',OFFLINE_REVIEW_STATE.result.byCode,{preview:true})};
  });
  assert.equal(companyBrand.before,companyBrand.after);
  assert.equal(companyBrand.preview.brandErrors.length,0);
  assert.equal(companyBrand.preview.rows[0][brandColumn],'Company Coil');
  const stale = await page.evaluate(async()=>{
   materialDB_rf_inductor[0].model='OTHER-COIL';
   await offlineReviewPrepare(true);
   return fmtCore('AB',OFFLINE_REVIEW_STATE.result.byCode,{preview:true}).brandErrors;
  });
  assert.equal(stale.length,1,'Changed target reused a previous manual brand');
  assert.deepEqual(errors,[]);
  console.log(label+': missing/placeholder brands, automatic supplement, resistor exclusion, manual edits, draft/final downloads and report readback passed');
 } finally {await page.close();}
}

(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({headless:true,executablePath:edge,downloadsPath:path.join(output,'browser-downloads')});
 const results=[];
 try{
  for(const [label,relative] of [['domestic','v3-cloudbase/web/index.html'],['overseas','v3-legacy/index.html']]){
   await runBrandCases(browser,base,relative,label);
   if(process.argv.includes('--brand-only')) continue;
   if(process.argv.includes('--bridge-only')){results.push(await runBridgeBoundary(browser,base,relative,label));console.log(label+': schematic to JLC to offline confirmation bridge passed');continue;}
   results.push(await runAdditionalBoundaries(browser,base,relative,label));
   if(process.argv.includes('--boundaries-only')){console.log(label+': additional offline-review boundaries passed');continue;}
   // 自定义封装、邮寄料、缺失介质使用真实上传和下载入口。
   const {page,errors}=await preparePage(browser,base,relative,fixtures);
   const input=[['MWSA0603S-8R2MT','L1','MWSA0603S-5R6MT','C408450',''],['AS0807-68NK','L26,L36,L40,L42','AS0807-68NK','邮寄',''],['100nF','C1,C2','SC0402','C810001','']];
   const checked=await uploadAndCheck(page,input);
   assert.equal(checked.counts.hard,0,JSON.stringify(checked.issues));
   assert(checked.issues.some(i=>i.kind==='package'&&i.sourceIndex===0));
   assert(checked.issues.some(i=>i.kind==='source'&&i.sourceIndex===1));
   assert(checked.issues.some(i=>i.kind==='parameters'&&i.sourceIndex===2&&i.fields.includes('介质')));
   assert(checked.summary.includes('导出核对'));
   await openReview(page);await assertNoNormalDownload(page);
   await page.locator('#offlineReviewModal').screenshot({path:path.join(output,label+'-集中核对.png')});
   await page.evaluate(async()=>{
    const index=OFFLINE_REVIEW_STATE.issues.findIndex(i=>i.kind==='brand'&&i.sourceIndex===1);
    document.getElementById('offlineEdit-'+index+'-4').value='Test mailed inductor';
    await offlineReviewSaveRow(index);
   });
   const confirmed=await confirmPending(page);assert.equal(confirmed.pending,0);assert.equal(confirmed.hard,0);
   assert(!(await page.locator('#offlineReviewExport').isDisabled()));
   const normal=await saveDownload(page,path.join(output,label+'-人工确认.xlsx'),()=>page.locator('#offlineReviewExport').click());
   assert(!normal.suggestedFilename.includes('待复核稿'));assert.equal(normal.rows.length,3);
   const power=normal.rows.find(r=>r[5]==='L1'),mail=normal.rows.find(r=>r[5]==='L26,L36,L40,L42'),cap=normal.rows.find(r=>r[5]==='C1,C2');
   assert.equal(power[3],'MWSA0603S-8R2MT');assert.equal(power[8],'MWSA0603S-5R6MT');assert.equal(Number(power[6]),1);
   assert.equal(mail[3],'AS0807-68NK');assert.equal(mail[8],'AS0807-68NK');assert.equal(Number(mail[6]),4);
   assert(String(mail[10]).includes('邮寄'));assert(String(power[10]).includes('人工确认'));
   assert(!/X5R|X7R|C0G|NP0/.test(String(cap[4])),'Missing dielectric was invented');
   assert(String(cap[10]).includes('待核实'));assert(normal.report.some(r=>String(r[4]).includes('确认时间')));
   await assertLibraries(page);
   // 变更源行后旧确认不得复用；重新上传同名文件也不得复用。
   const changed=await page.evaluate(async()=>{
    B.rows[0]['封装']='MWSA0603S-CUSTOM-NEW';await offlineReviewPrepare();
    return {counts:offlineReviewCounts(),issues:OFFLINE_REVIEW_STATE.issues.filter(i=>i.sourceIndex===0).map(i=>({kind:i.kind,confirmed:offlineReviewConfirmed(i)}))};
   });
   assert(changed.issues.some(i=>i.kind==='package'&&!i.confirmed));assert(changed.counts.pending>0);
   const reuploaded=await uploadAndCheck(page,input);assert(reuploaded.counts.pending>0);assert.equal(reuploaded.counts.confirmed,0);
   await openReview(page);
   // 当前页手工补齐介质，重新校验后该项消失，不写库。
   const editIndex=await page.evaluate(()=>OFFLINE_REVIEW_STATE.issues.findIndex(i=>i.sourceIndex===2&&i.kind==='parameters'));
   assert(editIndex>=0);
   await page.evaluate(({editIndex})=>{document.getElementById('offlineEdit-'+editIndex+'-3').value='MLCC 100nF ±10% 50V X7R SMD 0402';return offlineReviewSaveRow(editIndex);},{editIndex});
   const afterEdit=await page.evaluate(()=>({spec:B.rows[2]['参数描述'],issues:OFFLINE_REVIEW_STATE.issues.filter(i=>i.sourceIndex===2)}));
   assert(afterEdit.spec.includes('X7R'));assert(!afterEdit.issues.some(i=>i.kind==='parameters'&&i.fields.includes('介质')));
   await assertLibraries(page);
   results.push({label,case:'manual-confirmation',rows:normal.rows.length,sourceEditInvalidates:true,reuploadInvalidates:true,manualFill:true,librariesUnchanged:true});
   assert.deepEqual(errors,[]);await page.close();

   // 资料接口不可用且标准库同步失败，未知资料仍可确认导出。
   const failed=await preparePage(browser,base,relative,{},[],'error');
   const failChecked=await uploadAndCheck(failed.page,[['OFFLINE-PART','U1,U2','CUSTOM-PKG','C999999','']],'断网BOM.xlsx');
   assert(failChecked.issues.some(i=>i.kind==='library'));assert(failChecked.issues.some(i=>i.kind==='lookup'));
   assert.equal(failChecked.counts.hard,0,JSON.stringify(failChecked.issues));await openReview(failed.page);await confirmPending(failed.page);
   const fallback=await saveDownload(failed.page,path.join(output,label+'-离线确认.xlsx'),()=>failed.page.locator('#offlineReviewExport').click());
   assert.equal(fallback.rows.length,1);assert.equal(fallback.rows[0][3],'OFFLINE-PART');assert.equal(Number(fallback.rows[0][6]),2);
   assert(fallback.report.some(r=>/未完整同步|未取得完整/.test(String(r[4]))));await assertLibraries(failed.page);
   assert.deepEqual(failed.errors,[]);await failed.page.close();results.push({label,case:'offline-library-and-query',rows:1});

   // 明确冲突与小电容规则只能修正或导出待复核稿，原错误参数不得变成合规数据。
   for(const item of [
    {id:'small-cap',row:['6pF','C6','SC0402','C810002','MLCC 6pF ±0.25pF 50V C0G SMD 0402'],reason:/精度/,original:'±0.25pF'},
    {id:'resistance',row:['10K','R1','SR0402','C810003','厚膜电阻 10KΩ ±1% 1/16W SMD 0402'],reason:/阻值/,original:'10K'},
     {id:'physical-size',row:['MWSA0603S-8R2MT','L1','SMD,8x7mm','C408450',''],reason:/尺寸/,original:'MWSA0603S-8R2MT'}
   ]){
    const guarded=await preparePage(browser,base,relative,fixtures);
    const check=await uploadAndCheck(guarded.page,[item.row],item.id+'.xlsx');
    assert(check.issues.some(i=>i.kind==='hard'&&item.reason.test(i.reason)),JSON.stringify(check.issues));
    await openReview(guarded.page);await confirmPending(guarded.page);await assertNoNormalDownload(guarded.page);
    const draft=await saveDownload(guarded.page,path.join(output,label+'-'+item.id+'-待复核稿.xlsx'),()=>guarded.page.locator('#offlineReviewDraft').click());
    assert(draft.suggestedFilename.includes('待复核稿'));assert.equal(draft.rows.length,1);
    assert.equal(draft.rows[0][3],item.row[0]);assert.equal(draft.rows[0][8],item.row[2]);assert.equal(draft.rows[0][4],item.row[4]);
    assert(draft.visible.includes('待复核稿'));assert(draft.report.some(r=>String(r[4]).includes('待复核稿')));
    if(item.id==='small-cap')assert(!String(draft.rows[0][4]).includes('±0.1pF'),'Draft falsified bad precision');
    if(item.id==='small-cap'){
     // 把本次器件改为已验证的正确编码后可恢复正常导出。
     await guarded.page.evaluate(()=>{renderOfflineReviewModal();document.getElementById('offlineReviewModal').style.display='block';});
     const index=await guarded.page.evaluate(()=>OFFLINE_REVIEW_STATE.issues.findIndex(i=>i.sourceIndex===0&&i.kind==='hard'));
     await guarded.page.evaluate(async index=>{
      document.getElementById('offlineEdit-'+index+'-2').value='C810004';
      document.getElementById('offlineEdit-'+index+'-3').value='MLCC 6pF ±0.1pF 50V C0G SMD 0402';
      await offlineReviewSaveRow(index);
     },index);
     assert.equal(await guarded.page.evaluate(()=>offlineReviewCounts().hard),0);
     await confirmPending(guarded.page);
     const corrected=await saveDownload(guarded.page,path.join(output,label+'-小电容修正.xlsx'),()=>guarded.page.locator('#offlineReviewExport').click());
     assert(!corrected.suggestedFilename.includes('待复核稿'));assert(String(corrected.rows[0][4]).includes('±0.1pF'));
    }
    await assertLibraries(guarded.page);assert.deepEqual(guarded.errors,[]);await guarded.page.close();
    results.push({label,case:item.id,normalBlocked:true,draftPreservesSource:true});
   }

   const realSource=process.env.BOM_OFFLINE_REVIEW_REAL_SOURCE,realApi=process.env.BOM_OFFLINE_REVIEW_REAL_API;
   if(realSource&&realApi){
    assert(fs.existsSync(realSource)&&fs.existsSync(realApi),'Real source/API snapshot missing');
    const bytes=fs.readFileSync(realSource),before=crypto.createHash('sha256').update(bytes).digest('hex');
    const api=JSON.parse(fs.readFileSync(realApi,'utf8'));
    const data=api.results?Object.fromEntries(api.results.filter(x=>x.ok&&x.data?.hit).map(x=>[x.data.productCode,x.data])):api;
    const actual=await preparePage(browser,base,relative,data);
    const check=await uploadAndCheck(actual.page,null,path.basename(realSource),bytes);assert.equal(check.source.length,114);
    await openReview(actual.page);await actual.page.locator('#offlineReviewModal').screenshot({path:path.join(output,label+'-真实114行核对.png')});
    await confirmPending(actual.page);
    const hard=await actual.page.evaluate(()=>offlineReviewCounts().hard),draft=hard>0;
    if(draft)await assertNoNormalDownload(actual.page);
    const saved=await saveDownload(actual.page,path.join(output,label+'-真实114行'+(draft?'-待复核稿':'')+'.xlsx'),()=>actual.page.locator(draft?'#offlineReviewDraft':'#offlineReviewExport').click());
    assert.equal(saved.rows.length,check.source.length,'Real BOM row count changed');
    const expectedRefs=check.source.flatMap(r=>refs(r['位号'])).sort(),exportedRefs=saved.rows.flatMap(r=>refs(r[5])).sort();
    assert.deepEqual(exportedRefs,expectedRefs,'Real BOM reference coverage changed');
    for(const sourceRow of check.source){
     const exported=saved.rows.find(r=>String(r[5])===String(sourceRow['位号']));
     assert(exported,'Missing real row '+sourceRow['位号']);
     assert.equal(Number(exported[6]),Number(sourceRow['数量']||refs(sourceRow['位号']).length),'Real quantity changed at '+sourceRow['位号']);
    }
    const keyRows=[];
    for(const ref of ['L1','L2','L5','L26,L36,L40,L42']){
     const s=check.source.find(r=>r['位号']===ref),r=saved.rows.find(r=>r[5]===ref);
     assert(s&&r,'Key row missing '+ref);assert.equal(r[3],s['型号']);assert.equal(r[8],s['封装']);
     keyRows.push({ref,model:r[3],package:r[8],quantity:Number(r[6])});
    }
    await assertLibraries(actual.page);assert.deepEqual(actual.errors,[]);await actual.page.close();
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(realSource)).digest('hex'),before);
    results.push({label,case:'real-114-rows',source:realSource,sourceSha256:before,rows:saved.rows.length,referenceCount:expectedRefs.length,hardIssues:hard,draft,keyRows,issues:check.issues,
     scope:'完整114行真实上传/检查/人工处理/下载读回；官方资料来自外部接口快照，标准库使用受控占位记录，不代表公司生产库完整核验'});
   }else results.push({label,case:'real-114-rows',skipped:true,reason:'BOM_OFFLINE_REVIEW_REAL_SOURCE / BOM_OFFLINE_REVIEW_REAL_API not set'});
   console.log(label+': offline confirmation, unavailable data, source invalidation, edits and hard-conflict draft cases passed');
  }
  fs.writeFileSync(path.join(output,process.argv.includes('--bridge-only')?'offline-review-bridge-results.json':process.argv.includes('--boundaries-only')?'offline-review-boundaries-results.json':'offline-review-results.json'),JSON.stringify({results},null,2));
 }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack||error);server.close();process.exitCode=1;});
