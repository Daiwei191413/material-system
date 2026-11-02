const assert=require('assert'),fs=require('fs'),path=require('path');
const {pathToFileURL}=require('url');
let pw;try{pw=require('playwright-core');}catch(_){pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));}
const edge=[process.env.EDGE_PATH,path.join(process.env['ProgramFiles(x86)']||'','Microsoft/Edge/Application/msedge.exe'),path.join(process.env.ProgramFiles||'','Microsoft/Edge/Application/msedge.exe')].find(p=>p&&fs.existsSync(p));
const root=path.resolve(__dirname,'..');
const output=process.env.BOM_ZERO_DEFER_OUTPUT;
if(output){assert(/^D:[\\/]/i.test(output),'Test artifacts must stay on D:');fs.mkdirSync(output,{recursive:true});}
const zero={hit:true,productCode:'C17168',productModel:'0402WGF0000TCE',productType:'贴片电阻',package:'0402',brand:'UNI-ROYAL(厚声)',_extracted:{resistance:'0Ω',tolerance:'±1%',power:'1/16W'}};
const rows=[
 {Value:'TP6310',Reference:'U8,U9,U10,U11','PCB Footprint':'QFN48-0_35-5_0X5_0HS3_8-H0_9'},
 {Value:'MB-N2442B085',Reference:'U21,U35','PCB Footprint':'MB-N2442B085'},
 {Value:'AS0807-68NK',Reference:'L26,L36,L40,L42','PCB Footprint':'AS0807-68NK'},
];
(async()=>{
 const browser=await pw.chromium.launch({headless:true,executablePath:edge});
 try{for(const file of ['v3-cloudbase/web/index.html','v3-legacy/index.html']){
  const page=await browser.newPage(),errors=[];let searches=0;
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const u=route.request().url();
   if(u.includes('/batch?'))return route.fulfill({json:{ok:true,results:new URL(u).searchParams.get('codes').split(',').map(c=>({ok:c==='C17168',data:zero}))}});
   if(u.includes('/search?')){searches++;const q=new URL(u).searchParams.get('q');return route.fulfill({json:{ok:true,items:q.includes('0R')&&q.includes('厚声')?[{componentCode:'C17168',componentModel:zero.productModel,componentSpecification:'0402',componentBrand:zero.brand}]:[]}});}
   return u.startsWith('file:')?route.continue():route.abort();
  });
  await page.goto(pathToFileURL(path.join(root,file)).href,{waitUntil:'domcontentloaded'});
  const actual=await page.evaluate(zero=>{
   window.alerts=[];window.prompts=[];window.alert=x=>alerts.push(x);window.confirm=x=>{prompts.push(x);return true;};
   document.body.classList.remove('v3-not-logged');document.getElementById('v3LoginMask').classList.remove('show');showPanelDirect('convert');
   window.materialDB_standard=[];window.materialDB_rf_inductor=[];window.materialDB_lcsc=[{model:'0R',package:'0402',lcsc_code:'C17168'}];
   window.exports=[];window.XLSX={utils:{aoa_to_sheet:rows=>({rows}),book_new:()=>({sheets:{}}),book_append_sheet:(wb,ws,name)=>{wb.sheets[name]=ws.rows;}},writeFile:(wb,name)=>exports.push({wb,name})};
   const mk=(comment,designator='L16',footprint='SL0402')=>({comment,designator,refs:splitRefs(designator),footprint});
   window.makeRow=mk;
   const r=mk('0R');
   return {type:detectMaterialType({'型号':'0R','位号':'L16','封装':'SL0402'}),kind:convPassiveKind(r),rf:isRfInductorSourceRow(r),identity:rfInductorSourceIdentity(r).hasIdentity,
    brand:getLcscBrandPlan(r),authority:isInductorAuthorityRow({'型号':'0R','位号':'L16'}),basic:basicInductorDescription({'型号':'0R','位号':'L16'}),
    errors:validateLcscMapping(r,zero),wrongValue:validateLcscMapping(r,Object.assign({},zero,{_extracted:{resistance:'10Ω'}})),wrongType:validateLcscMapping(r,Object.assign({},zero,{productType:'绕线电感'})),
    wrongPkg:validateLcscMapping(r,Object.assign({},zero,{package:'0603'})),
    caps:convPassiveKind(mk('6pF','L1')),inductor:explicitPassiveType('39nH'),mpn:explicitPassiveType('LQW15AN39NJ00D'),
    zeros:['0R','0Ω','0欧姆','0OHM'].map(v=>[explicitPassiveType(v),convPassiveNumber(v,'res')]),c18:convPassiveKind(mk('0R','C18','SC0201'))};
  },zero);
  assert.equal(actual.type,'resistor');assert.equal(actual.kind,'res');assert.equal(actual.rf,false);assert.equal(actual.identity,false);
  assert.equal(actual.authority,false);assert.equal(actual.basic,null);assert.deepEqual(actual.errors,[]);
  assert(actual.brand&&JSON.stringify(actual.brand).includes('厚声'));assert(actual.wrongValue.length&&actual.wrongType.length&&actual.wrongPkg.length);
  assert.equal(actual.caps,'cap');assert.equal(actual.inductor,'inductor');assert.equal(actual.mpn,'');assert.equal(actual.c18,'res');
  assert(actual.zeros.every(x=>x[0]==='resistor'&&x[1]===0));
  await page.evaluate(()=>runConvert([{Value:'0R',Reference:'L16,L17,L20,L21','PCB Footprint':'SL0402'}]));
  await page.waitForFunction(()=>CONV_OUT[0].status!=='verifying');
  const reused=await page.evaluate(()=>{exportJlcBom();return {row:CONV_OUT[0],exported:exports[0],audit:CONV_AUDIT};});
  assert.equal(reused.row.status,'matched',JSON.stringify(reused.row));assert.equal(reused.row.lcsc,'C17168');assert(reused.row.matchedFromLcscLibrary);
  assert.deepEqual(reused.exported.wb.sheets['嘉立创BOM'],[['Comment','Designator','Footprint','嘉立创元件编号'],['0R','L16,L17,L20,L21','SL0402','C17168']]);
  assert.equal(reused.audit.attentionCount,0);assert.equal(reused.audit.counts.completed,4);
  await page.evaluate(()=>{materialDB_lcsc=[];runConvert([{Value:'0R',Reference:'L16,L17,L20,L21','PCB Footprint':'SL0402'}]);openLcscSearch(0);});
  await page.waitForFunction(()=>document.querySelectorAll('.lcsc-data-row').length===1);
  await page.evaluate(()=>pickLcscCandidate(0));
  await page.waitForFunction(()=>CONV_OUT[0].status==='matched');
  assert.equal(await page.evaluate(()=>CONV_OUT[0].lcsc),'C17168');
  const offline=await page.evaluate(zero=>{
   const row={'型号':'0R','位号':'L16,L17,L20,L21','封装':'SL0402','物料名称':'电感','立创编号':'C17168','参数描述':'','数量':4};
   const accepted=applyLcscToRow({row},zero);
   return {accepted,row,type:passiveIdentity(row).type,errors:passiveSpecErrors(row,row['参数描述'])};
  },zero);
  assert(offline.accepted);assert.equal(offline.type,'resistor');assert.deepEqual(offline.errors,[]);
  assert(offline.row['参数描述'].includes('0Ω'));assert.equal(offline.row['位号'],'L16,L17,L20,L21');assert.equal(offline.row['数量'],4);
  // 真实截图的专用件：批量确认后完整保留10个位号，只有编码留空。
  const snapshot=await page.evaluate(rows=>{materialDB_lcsc=[];runConvert(rows);return JSON.stringify([materialDB_lcsc,materialDB_standard,materialDB_rf_inductor]);},rows);
  await page.evaluate(()=>{selectAllConvDeferred(true);});
  assert.equal(await page.locator('#convDeferSelected').isEnabled(),true);
  await page.locator('#convDeferSelected').click();
  const deferred=await page.evaluate(()=>({rows:CONV_OUT,audit:CONV_AUDIT,stats:document.getElementById('convStatDeferred').textContent,banner:document.getElementById('convAuditBanner').textContent}));
  assert(deferred.rows.every(r=>r.status==='deferred'&&r.verification==='deferred'&&r.deferredConfirmation));
  assert.equal(deferred.audit.counts.deferred,10);assert.equal(deferred.audit.attentionCount,0);assert.equal(deferred.stats,'3');assert(deferred.banner.includes('未完成立创商品核验'));
  await page.evaluate(()=>setConvAuditFilter('deferred'));
  assert.equal(await page.locator('#convAuditBody tr').count(),10);
  const beforeSearch=searches;
  await page.evaluate(async()=>{await pullUnmatchedLcsc();await collectOnlineLcscCandidates(CONV_OUT[0]);});
  assert.equal(searches,beforeSearch);
  const result=await page.evaluate(()=>{exports=[];const n=prompts.length;exportJlcBom();exportConvMap();exportConvAudit();return {exports,morePrompts:prompts.length-n,libs:JSON.stringify([materialDB_lcsc,materialDB_standard,materialDB_rf_inductor])};});
  assert.equal(result.morePrompts,0);assert.equal(result.libs,snapshot);
  const bom=result.exports[0].wb.sheets['嘉立创BOM'];assert.equal(bom.length,4);assert(bom.every(r=>r.length===4));assert(bom.slice(1).every(r=>r[3]===''));
  assert.equal(bom.slice(1).reduce((n,r)=>n+r[1].split(',').length,0),10);
  assert.deepEqual(bom.slice(1).map(r=>r[0]),rows.map(r=>r.Value));assert.deepEqual(bom.slice(1).map(r=>r[2]),rows.map(r=>r['PCB Footprint']));
  assert.equal(result.exports[1].wb.sheets['导出后补充清单'].length,4);
  assert(result.exports[2].wb.sheets['校验汇总'].some(r=>r[0]==='已确认导出后补充'&&r[1]===10));
  if(output){
   const label=file.includes('cloudbase')?'domestic':'overseas',X=require('../v3-cloudbase/web/assets/vendor/xlsx.full.min.js');
   for(const [i,entry] of result.exports.entries()){
    const wb=X.utils.book_new();for(const [name,matrix] of Object.entries(entry.wb.sheets))X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(matrix),name);
    const dest=path.join(output,label+'-'+i+'-回归导出.xlsx');fs.writeFileSync(dest,Buffer.from(X.write(wb,{type:'array',bookType:'xlsx'})));
    const reopened=X.read(fs.readFileSync(dest),{type:'buffer'});assert.deepEqual(reopened.SheetNames,Object.keys(entry.wb.sheets));
    if(i===0){const actual=X.utils.sheet_to_json(reopened.Sheets['嘉立创BOM'],{header:1,defval:''});assert.deepEqual(actual,bom);}
   }
   await page.screenshot({path:path.join(output,label+'-专用料后补.png'),fullPage:true});
  }
  // 撤销允许重新搜索，别的行的确认不受其他物料查询轮次影响。
  const revoked=await page.evaluate(async()=>{setConvDeferredRows([0],false);CONV_VERIFY_RUN_ID++;const other=isConvDeferred(CONV_OUT[1]);await collectOnlineLcscCandidates(CONV_OUT[0]);return {status:CONV_OUT[0].status,other};});
  assert.equal(revoked.status,'unmatched');assert.equal(revoked.other,true);assert(searches>beforeSearch);
  // 源信息、编号或新射频指定库变动后，旧确认必须失效，不能带着确认放行。
  const guards=await page.evaluate(()=>{
   const saved=JSON.parse(JSON.stringify(CONV_OUT[1])),tests=[];
   for(const key of ['comment','footprint','designator','refs','lcsc','rejectedLcsc','officialCode']){
    CONV_OUT[1]=JSON.parse(JSON.stringify(saved));CONV_OUT[1][key]=key==='refs'?['U99']:'CHANGED';const n=exports.length;exportJlcBom();tests.push(!isConvDeferred(CONV_OUT[1])&&exports.length===n);
   }
   CONV_OUT[1]=saved;
   const mk=(value,status='unmatched')=>Object.assign(makeRow(value),{status,lcsc:'',verification:''});
   const invalid=['invalid','verifying','verify_failed','searching','dnp'].map(s=>!!convDeferredEligibilityError(mk('TP6310',s)));
   const small=!!convDeferredEligibilityError(mk('6pF'));
   const code=!!convDeferredEligibilityError(Object.assign(mk('TP6310'),{rejectedLcsc:'C11111'}));
   materialDB_rf_inductor=[{model:'LQW15AN39NJ00D',package:'SL0402',lcsc_code:'C98060',specification:'绕线电感 39nH ±5% 200mA'}];
   const rf=!!convDeferredEligibilityError(mk('39nH'));
   const conflict=!!convDeferredEligibilityError(Object.assign(mk('39nH'),{material_code:'1-IN-00-99999'}));
   return {tests,invalid,small,code,rf,conflict};
  });
  assert(guards.tests.every(Boolean));assert(guards.invalid.every(Boolean));assert(guards.small&&guards.code&&guards.rf&&guards.conflict,JSON.stringify(guards));
  assert.deepEqual(errors,[]);await page.close();console.log('PASS '+file+' zero-ohm reuse + deferred workflow + hard-rule guards');
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
