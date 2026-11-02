const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
let pw;try{pw=require('playwright-core');}catch(_){pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));}
const root=path.resolve(__dirname,'..');
const edge=[process.env.EDGE_PATH,path.join(process.env['ProgramFiles(x86)']||'','Microsoft/Edge/Application/msedge.exe'),path.join(process.env.ProgramFiles||'','Microsoft/Edge/Application/msedge.exe')].find(p=>p&&fs.existsSync(p));
const output=process.env.BOM_AUDIT_OUTPUT;
if(output){assert(/^D:[\\/]/i.test(output));fs.mkdirSync(output,{recursive:true});}
const zero={hit:true,productCode:'C17168',productModel:'0402WGF0000TCE',productType:'贴片电阻',package:'0402',brand:'UNI-ROYAL',_extracted:{resistance:'0Ω',tolerance:'±1%',power:'1/16W'}};
const chip={hit:true,productCode:'C100002',productModel:'CHIP-B',productType:'IC',package:'QFN-32_5x5mm',brand:'Test',_extracted:{}};
(async()=>{
 const browser=await pw.chromium.launch({headless:true,executablePath:edge});
 try{for(const [label,file] of [['domestic','v3-cloudbase/web/index.html'],['overseas','v3-legacy/index.html']]){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const url=route.request().url();
   if(url.includes('/batch?')){const codes=new URL(url).searchParams.get('codes').split(',');requests.push(codes);return route.fulfill({json:{ok:true,results:codes.map(c=>({ok:true,data:c==='C100002'?chip:zero}))}});}
   if(url.includes('/search?'))return route.fulfill({json:{ok:true,items:[]}});
   return url.startsWith('file:')?route.continue():route.abort();
  });
  await page.goto(pathToFileURL(path.join(root,file)).href,{waitUntil:'domcontentloaded'});
  const original=await page.evaluate(({zero,chip})=>{
   window.alerts=[];window.prompts=[];window.alert=s=>alerts.push(s);window.confirm=s=>{prompts.push(s);return true;};
   document.body.classList.remove('v3-not-logged');document.getElementById('v3LoginMask').classList.remove('show');showPanelDirect('convert');
   document.getElementById('convPreview').style.display='block';
   materialDB_lcsc=[];materialDB_standard=[];materialDB_rf_inductor=[];
   window.auditLibSnapshot=JSON.stringify([materialDB_lcsc,materialDB_standard,materialDB_rf_inductor]);
   CONV_RAW=[];CONV_OUT=[];CONV_AUDIT_QUERY='';CONV_AUDIT_FILTER='attention';
   const add=(ref,value,fp,status='unmatched',extras={})=>{
    CONV_RAW.push({value,ref,fp});const row=Object.assign({comment:value,designator:ref,footprint:fp,refs:splitRefs(ref),lcsc:'',status,verification:'',rawValues:[value]},extras);CONV_OUT.push(row);return row;
   };
   const normal=add('R1,R2','0R','SR0402','matched',{lcsc:'C17168'});applyOfficialVerification(normal,{ok:true,data:zero});
   const confirmed=add('U1','CHIP-A','CHIP-A','matched',{lcsc:'C100001'});
   const officialA=Object.assign({},chip,{productCode:'C100001',productModel:'CHIP-A'});
   requestConvPackageConfirmation(confirmed,'C100001',chip.package);applyOfficialVerification(confirmed,{ok:true,data:officialA});
   add('C1,C4','22uF','SC0603');
   const pending=add('U2','CHIP-B','CHIP-B','invalid',{lcsc:'C100002'});applyOfficialVerification(pending,{ok:true,data:chip});
   add('R3','0R','SR0402','verifying',{lcsc:'C17168',verification:'pending'});
   add('R4,R5','0R','SR0402','verify_failed',{lcsc:'C17168',verification:'failed',verifyError:'网络暂时不可用'});
   add('C2','NC','SC0402','dnp',{dnpReason:'NC 空贴（BOM标记）'});
   CONV_RAW.push({value:'MISSING',ref:'U3',fp:'CUSTOM'});
   add('U4','SOURCE-A','CUSTOM');CONV_RAW.push({value:'SOURCE-B',ref:'U4',fp:'CUSTOM-2'});
   CONV_OUT.push({comment:'SOURCE-B',designator:'U4',footprint:'CUSTOM-2',refs:['U4'],lcsc:'',status:'unmatched'});
   CONV_OUT.push({comment:'EXTRA',designator:'X99',footprint:'CUSTOM',refs:['X99'],lcsc:'',status:'unmatched'});
   add('U6','SOURCE-A','QFN32','matched',{comment:'SOURCE-B',lcsc:'C999006',verification:'verified'});
   const special=add('U7','TP6310','CUSTOM');
   special.status='deferred';special.verification='deferred';special.deferredConfirmation={signature:convDeferredSignature(special),reason:'专用料/线下采购，导出后补充'};
   add('L1','39nH','SL0402','invalid',{rfPreferred:true,verifyError:'射频电感指定库冲突',verification:'invalid'});
   const small=add('C3','6pF','SC0402','invalid',{lcsc:'C300001'});
   applyOfficialVerification(small,{ok:true,data:{hit:true,productCode:'C300001',productModel:'CAP6PF',productType:'贴片电容',package:'0402',_extracted:{capacitance:'6pF',tolerance:'±0.25pF',voltage:'50V',dielectric:'C0G'}}});
   CONV_OUT.push({comment:'UNKNOWN',designator:'U8',footprint:'QFN32',refs:['U8'],lcsc:'C999008',status:'matched',verification:'pending'});
   CONV_RAW.push({value:'UNKNOWN',ref:'U8',fp:'QFN32'});
   updateConvStats();renderConvTable();renderConvAudit();
   window.exports=[];window.XLSX={utils:{aoa_to_sheet:rows=>({rows}),book_new:()=>({sheets:{}}),book_append_sheet:(wb,ws,name)=>{wb.sheets[name]=ws.rows;}},writeFile:(wb,name)=>exports.push({wb,name})};
   return CONV_AUDIT;
  },{zero,chip});
  assert.equal(original.counts.completed,3);assert.equal(original.counts.unmatched,2);assert.equal(original.counts.invalid,3);
  assert.equal(original.counts.deferred,1);assert.equal(original.counts.dnp,1);assert.equal(original.counts.duplicate,1);assert.equal(original.counts.extra,1);assert.equal(original.counts.missing,1);
  assert.equal(original.counts.verifying,2);assert.equal(original.counts.verifyFailed,2);
  assert(!original.items.find(i=>i.ref==='U1').attention,'Valid confirmed package must not remain an exception');
  assert.equal(original.items.find(i=>i.ref==='U6').status,'fieldMismatch');
  assert(!original.items.find(i=>i.ref==='R4').mismatches.length,'Network failure is not a field mismatch');
  // 每张卡片的数字、筛选谓词、DOM记录数完全一致；原理图卡不包含输出新增位号。
  const cards=await page.locator('#convAuditStats button').evaluateAll(bs=>bs.map(b=>({key:b.dataset.auditFilter,count:Number(b.querySelector('.n').textContent)})));
  assert.equal(cards.length,12);
  for(const {key,count} of cards){
   await page.locator('#convAuditStats [data-audit-filter="'+key+'"]').click();
   assert.equal(await page.locator('#convAuditBody tr[data-ref]').count(),count,key);
   assert.equal(await page.locator('#convAuditStats [data-audit-filter="'+key+'"]').getAttribute('aria-pressed'),'true');
   assert((await page.locator('#convAuditScope').innerText()).includes('共 '+count+' 个位号'));
   if(key==='source')assert(!await page.locator('#convAuditBody tr[data-ref="X99"]').count());
  }
  // 键盘可切换，字段变化高亮，搜索限定当前类别，切换类别自动清除搜索。
  await page.locator('#convAuditStats [data-audit-filter="unmatched"]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>CONV_AUDIT_FILTER),'unmatched');
  assert.equal(await page.evaluate(()=>document.activeElement.getAttribute('data-audit-filter')),'unmatched');
  await page.locator('#convAuditSearch').fill('C1');assert.equal(await page.locator('#convAuditBody tr[data-ref]').count(),1);
  await page.locator('#convAuditSearch').fill('C17168');assert.equal(await page.locator('#convAuditBody tr[data-ref]').count(),0);
  await page.locator('#convAuditStats [data-audit-filter="completed"]').click();assert.equal(await page.locator('#convAuditSearch').inputValue(),'');
  await page.locator('#convAuditSearch').fill('C17168');assert.equal(await page.locator('#convAuditBody tr[data-ref]').count(),2);
  await page.evaluate(()=>setConvAuditFilter('fieldMismatch'));
  assert(await page.locator('#convAuditBody tr[data-ref="U6"] .conv-audit-diff').count());
  // 筛选报告按当前类别及搜索导出；完整报告不受筛选影响。
  await page.evaluate(()=>setConvAuditFilter('invalid'));await page.locator('#convAuditSearch').fill('U2');
  await page.locator('#convAuditExportFiltered').click();await page.evaluate(()=>exportConvAudit());
  const reports=await page.evaluate(()=>exports.splice(0));
  assert.equal(reports[0].wb.sheets['位号明细'].length,2);assert.equal(reports[0].wb.sheets['位号明细'][1][1],'U2');
  assert(reports[0].wb.sheets['校验汇总'].some(r=>r[0]==='报告范围'&&r[1].includes('U2')));
  assert.equal(reports[1].wb.sheets['位号明细'].length,original.items.length+1);
  const duplicates=reports[1].wb.sheets['位号明细'].find(r=>r[1]==='U4');
  assert.equal(duplicates[13],2);assert.equal(duplicates[14],2);assert(duplicates[15].includes('SOURCE-B'));assert(duplicates[16].includes('CUSTOM-2'));
  // 单行操作与真实转换预览联动，未授权的参数错误和射频限制仍受原规则约束。
  await page.locator('#convAuditBody [data-audit-ref="U2"][data-audit-action="locate"]').click();
  assert.equal(await page.locator('#convTableBody .conv-row-focused').count(),1);
  await page.evaluate(()=>setConvAuditFilter('invalid'));
  assert(!await page.locator('#convAuditBody [data-audit-ref="L1"][data-audit-action="search"]').count());
  assert(!await page.locator('#convAuditBody [data-audit-ref="C3"][data-audit-action="confirmPackage"]').count());
  assert(!await page.locator('#convAuditBody [data-audit-ref="C3"][data-audit-action="defer"]').count());
  await page.locator('#convAuditBody [data-audit-ref="U2"][data-audit-action="confirmPackage"]').click();
  await page.waitForFunction(()=>CONV_OUT.find(r=>r.designator==='U2').verification==='manual_confirmed');
  assert.equal(await page.evaluate(()=>CONV_AUDIT.counts.invalid),2);
  assert.equal(await page.evaluate(()=>CONV_AUDIT.items.find(i=>i.ref==='U2').attention),false);
  await page.evaluate(()=>setConvAuditFilter('verifyFailed'));
  await page.locator('#convAuditBody [data-audit-ref="R4"][data-audit-action="retry"]').click();
  await page.waitForFunction(()=>CONV_OUT.find(r=>r.designator==='R4,R5').status==='matched');
  assert.equal(await page.evaluate(()=>CONV_AUDIT.counts.verifyFailed),0);
  assert(await page.locator('#convAuditStats [data-audit-filter="missing"]').isEnabled());
  assert((await page.locator('#convAuditBody').innerText()).includes('问题已处理完成'));
  assert.deepEqual(requests.flat().sort(),['C100002','C17168']);
  await page.evaluate(()=>setConvAuditFilter('unmatched'));
  assert(await page.locator('#convAuditStats [data-audit-filter="verifyFailed"]').isDisabled());
  await page.locator('#convAuditBody [data-audit-ref="C1"][data-audit-action="defer"]').click();
  assert.equal(await page.evaluate(()=>CONV_AUDIT.counts.unmatched),0);
  assert.equal(await page.evaluate(()=>CONV_AUDIT.counts.deferred),3);
  await page.evaluate(()=>setConvAuditFilter('deferred'));
  assert((await page.locator('#convAuditBody tr[data-ref="C1"]').innerText()).includes('整行 2 个位号'));
  await page.locator('#convAuditBody [data-audit-ref="C1"][data-audit-action="undefer"]').click();
  assert.equal(await page.evaluate(()=>CONV_AUDIT.counts.unmatched),2);
  // 重新选择会使用合并行的完整位号；旧界面里的操作不能误作用于新转换结果。
  await page.evaluate(()=>setConvAuditFilter('unmatched'));
  await page.locator('#convAuditBody [data-audit-ref="C1"][data-audit-action="search"]').click();
  assert((await page.locator('#lcscSearchTarget').innerText()).includes('C1,C4'));
  await page.evaluate(()=>closeLcscSearch());
  const guards=await page.evaluate(()=>{
   const row=CONV_OUT.find(r=>r.designator==='U1'),saved=JSON.parse(JSON.stringify(row));
   row.lcsc='C999999';renderConvAudit();const stale=CONV_AUDIT.items.find(i=>i.ref==='U1');Object.assign(row,saved);
   const small=CONV_OUT.find(r=>r.designator==='C3'),before=JSON.stringify(small);setConvDeferredRows([CONV_OUT.indexOf(small)],true);const hard=JSON.stringify(small)===before;
   const old=document.createElement('button');old.setAttribute('data-audit-ref','R1');old.setAttribute('data-audit-row','999');runConvAuditAction(old,'search');
   return {stale:stale.attention&&stale.status==='invalid',hard,libs:JSON.stringify([materialDB_lcsc,materialDB_standard,materialDB_rf_inductor]),alerts};
  });
  assert(guards.stale&&guards.hard);assert.equal(guards.libs,await page.evaluate(()=>auditLibSnapshot));
  assert(guards.alerts.some(s=>s.includes('转换结果已更新')));
  await page.evaluate(()=>clearConvAuditFilters());assert.equal(await page.locator('#convAuditBody tr[data-ref]').count(),original.items.length);
  if(output){
   await page.evaluate(()=>{setConvAuditFilter('invalid');document.getElementById('convAudit').scrollIntoView();});
   await page.locator('#convAudit').screenshot({path:path.join(output,label+'-统计联动与明细操作.png')});
   const X=require('../v3-cloudbase/web/assets/vendor/xlsx.full.min.js');
   for(const [i,r] of reports.entries()){
    const wb=X.utils.book_new();for(const [name,rows] of Object.entries(r.wb.sheets))X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(rows),name);
    const dest=path.join(output,label+'-'+(i?'完整':'当前筛选')+'校验报告.xlsx');fs.writeFileSync(dest,Buffer.from(X.write(wb,{type:'array',bookType:'xlsx'})));
    const loaded=X.read(fs.readFileSync(dest),{type:'buffer'});assert.equal(X.utils.sheet_to_json(loaded.Sheets['位号明细'],{header:1}).length,r.wb.sheets['位号明细'].length);
   }
  }
  assert.deepEqual(errors,[]);await page.close();console.log(label+': audit card counts, scoped search, reports, actions, hard guards and live updates passed');
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
