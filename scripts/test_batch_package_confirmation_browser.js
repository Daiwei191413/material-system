const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
let pw;try{pw=require('playwright-core');}catch(_){pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));}
const root=path.resolve(__dirname,'..');
const edge=[process.env.EDGE_PATH,path.join(process.env['ProgramFiles(x86)']||'','Microsoft/Edge/Application/msedge.exe'),path.join(process.env.ProgramFiles||'','Microsoft/Edge/Application/msedge.exe')].find(p=>p&&fs.existsSync(p));
const output=process.env.BOM_BATCH_PACKAGE_OUTPUT;
if(output){assert(/^D:[\\/]/i.test(output));fs.mkdirSync(output,{recursive:true});}
const product=(code,model,pkg,type='IC',extracted={})=>({hit:true,productCode:code,productModel:model,package:pkg,productType:type,brand:'Test',_extracted:extracted});
const details={
 C3151829:product('C3151829','RVT1H101M0607','SMD,D6.3xL7.7mm','铝电解电容'),
 C2845616:product('C2845616','HC-PHD-2*5A','插件,P=2mm','连接器'),
 C18203127:product('C18203127','BSMD2920-300-33V','2920','自恢复保险丝'),
 C100001:product('C100001','CHIP-A','QFN-32_5x5mm'),
 C100002:product('C100002','RC0402-10K','0201','贴片电阻',{resistance:'10kΩ',tolerance:'±1%',power:'50mW'}),
 C100003:product('C100003','CONN-PIN','插件,P=2.54mm 3P','连接器'),
 C100004:product('C100004','OTHER-MODEL','QFN32'),
 C98060:product('C98060','LQW15AN39NJ00D','0402','绕线电感',{inductance:'39nH',tolerance:'±5%',current:'200mA'}),
 C100005:product('C100005','API-FAIL','QFN32'),
 C100006:product('C100006','CAP6PF','0603','贴片电容',{capacitance:'6pF',tolerance:'±0.25pF',voltage:'50V',dielectric:'C0G'})
};
const fixture=[
 ['C14','RVT1H101M0607','RVT1H101M0607','C3151829'],
 ['J3,J4','HC-PHD-2*5A','HC-PHD-2X5A','C2845616'],
 ['F2','BSMD2920-300-33V','BSMD2920-200-48V','C18203127'],
 ['U1','CHIP-A','CHIP-A','C100001'],
 ['R1','10K','SR0402','C100002'],
 ['J9','CONN-PIN','插件,P=2mm 2P','C100003'],
 ['U2','SOURCE-A','SOURCE-A','C100004'],
 ['L1','LQW15AN39NJ00D','RF_CUSTOM','C98060'],
 ['U3','API-FAIL','API-FAIL','C100005'],
 ['C1','6pF','SC0402','C100006']
];
(async()=>{
 const browser=await pw.chromium.launch({headless:true,executablePath:edge});
 try{for(const [label,file] of [['domestic','v3-cloudbase/web/index.html'],['overseas','v3-legacy/index.html']]){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[],requests=[];
  let overrides={},hold=false,held=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',async route=>{
   const url=route.request().url();
   if(url.includes('/batch?')){
    const codes=new URL(url).searchParams.get('codes').split(',');requests.push(codes);
    if(hold)await new Promise(resolve=>held.push(resolve));
    const results=codes.map(code=>{
     if(code==='C100005'&&!overrides[code])return {query:code,ok:false,error:'受控网络失败'};
     return {query:code,ok:true,data:overrides[code]||details[code]};
    });return route.fulfill({json:{ok:true,results}});
   }
   return url.startsWith('file:')?route.continue():route.abort();
  });
  await page.goto(pathToFileURL(path.join(root,file)).href,{waitUntil:'domcontentloaded'});
  await page.evaluate(({details,fixture})=>{
   document.body.classList.remove('v3-not-logged');document.getElementById('v3LoginMask').classList.remove('show');showPanelDirect('convert');document.getElementById('convPreview').style.display='block';
   window.alerts=[];window.prompts=[];window.alert=x=>alerts.push(x);window.confirm=x=>{prompts.push(x);return true;};
   window.exports=[];window.XLSX={utils:{aoa_to_sheet:rows=>({rows}),book_new:()=>({sheets:{}}),book_append_sheet:(wb,ws,name)=>{wb.sheets[name]=ws.rows;}},writeFile:(wb,name)=>exports.push({wb,name})};
   window.batchDetails=details;window.batchFixture=fixture;
   window.installBatchFixture=function(refs){
    closeConvPackageBatch();CONV_OUT=[];CONV_RAW=[];CONV_AUDIT_FILTER='invalid';CONV_AUDIT_QUERY='';document.getElementById('convAuditSearch').value='';
    materialDB_lcsc=[];materialDB_standard=[];materialDB_rf_inductor=[{model:'LQW15AN39NJ00D',package:'0402',lcsc_code:'C98060',specification:'电感值：39nH ±5% 200mA'}];
    batchFixture.filter(x=>!refs||refs.includes(x[0])).forEach(([designator,comment,footprint,code])=>{
     CONV_RAW.push({ref:designator,value:comment,fp:footprint});
     const row={comment,designator,footprint,refs:splitRefs(designator),lcsc:code,status:'verifying',verification:'pending',rfPreferred:code==='C98060',rfLibraryLcsc:code==='C98060'?code:''};
     applyOfficialVerification(row,{ok:true,data:batchDetails[code]});CONV_OUT.push(row);
    });
    updateConvStats();renderConvTable();renderConvAudit();
    return JSON.stringify([materialDB_lcsc,materialDB_standard,materialDB_rf_inductor]);
   };
   installBatchFixture();
  },{details,fixture});
  const libs=await page.evaluate(()=>JSON.stringify([materialDB_lcsc,materialDB_standard,materialDB_rf_inductor]));
  assert((await page.locator('#convAuditBatchPackage').innerText()).includes('9行'));
  // 当前筛选/搜索确定批量范围；同一合并行在位号明细中出现多次也只入队一次。
  await page.locator('#convAuditSearch').fill('J3');assert((await page.locator('#convAuditBatchPackage').innerText()).includes('1行'));
  await page.locator('#convAuditSearch').fill('');await page.locator('#convAuditBatchPackage').click();
  await page.waitForFunction(()=>CONV_PACKAGE_BATCH&&CONV_PACKAGE_BATCH.phase==='ready');
  const ready=await page.evaluate(()=>CONV_PACKAGE_BATCH.entries.map(e=>({ref:e.row.designator,code:e.code,kind:e.kind,selected:e.selected,message:e.message})));
  assert.equal(ready.length,9);assert.equal(new Set(requests[0]).size,requests[0].length);
  assert.equal(ready.filter(e=>e.kind==='eligible').length,4);
  assert.equal(ready.find(e=>e.ref==='F2').selected,false);assert(ready.find(e=>e.ref==='F2').message.includes('旧型号'));
  assert(ready.find(e=>e.ref==='R1').message.includes('尺寸不同'));assert(ready.find(e=>e.ref==='J9').message.includes('引脚数不同'));
  assert(ready.find(e=>e.ref==='U2').message.includes('型号'));assert(ready.find(e=>e.ref==='L1').message.includes('公司库'));
  assert.equal(ready.find(e=>e.ref==='U3').kind,'failed');assert(!ready.some(e=>e.ref==='C1'));
  assert.equal(ready.find(e=>e.ref==='C14').selected,true);
  // 取消不修改任何物料；再次打开统一确认一次，不逐颗弹框。
  const before=await page.evaluate(()=>JSON.stringify(CONV_OUT));await page.locator('#convPackageBatchCancel').click();
  assert.equal(await page.evaluate(()=>JSON.stringify(CONV_OUT)),before);
  await page.evaluate(()=>openConvPackageBatch());
  await page.getByRole('checkbox',{name:'确认 J3,J4',exact:true}).check();
  assert((await page.locator('#convPackageBatchConfirm').innerText()).includes('3 行 / 4 个位号'));
  if(output)await page.locator('#convPackageBatchModal .conv-package-batch-panel').screenshot({path:path.join(output,label+'-批量封装核对清单.png')});
  await page.locator('#convPackageBatchConfirm').click();await page.waitForFunction(()=>CONV_PACKAGE_BATCH.phase==='done');
  const done=await page.evaluate(()=>({rows:CONV_OUT,summary:document.getElementById('convPackageBatchSummary').textContent,prompts:prompts.length,audit:CONV_AUDIT,libs:JSON.stringify([materialDB_lcsc,materialDB_standard,materialDB_rf_inductor])}));
  assert(done.summary.includes('成功 3 行；跳过 5 行；失败 1 行'),done.summary);assert.equal(done.prompts,0);assert.equal(done.libs,libs);
  const success=done.rows.filter(r=>r.verification==='manual_confirmed');assert.equal(success.length,3);
  assert(success.every(r=>r.packageConfirmation.mode==='batch'&&r.packageConfirmation.confirmedAt&&r.packageConfirmation.sourceSignature));
  assert.equal(done.rows.find(r=>r.designator==='F2').status,'invalid');assert.equal(done.audit.counts.completed,4);
  assert(!done.audit.items.find(i=>i.ref==='J3').attention);assert.equal(done.audit.counts.invalid,7);
  assert(done.audit.items.find(i=>i.ref==='C14').changes.some(s=>s.includes('批量人工确认')));
  if(output)await page.locator('#convPackageBatchModal .conv-package-batch-panel').screenshot({path:path.join(output,label+'-批量确认结果.png')});
  await page.locator('#convPackageBatchCancel').click();
  const exported=await page.evaluate(()=>{
   CONV_OUT=CONV_OUT.filter(r=>r.verification==='manual_confirmed');renderConvAudit();exports=[];exportJlcBom();exportConvAudit();return exports;
  });
  assert.equal(exported.length,2);const bom=exported[0].wb.sheets['嘉立创BOM'];
  assert.deepEqual(bom[0],['Comment','Designator','Footprint','嘉立创元件编号']);assert.equal(bom.length,4);assert(bom.every(r=>r.length===4));
  assert.deepEqual(bom.find(r=>r[1]==='J3,J4'),['HC-PHD-2*5A','J3,J4','HC-PHD-2X5A','C2845616']);
  assert(exported[1].wb.sheets['位号明细'].some(r=>String(r[12]).includes('批量人工确认')));
  if(output){
   const X=require('../v3-cloudbase/web/assets/vendor/xlsx.full.min.js');
   for(const [i,e] of exported.entries()){
    const wb=X.utils.book_new();for(const [name,rows] of Object.entries(e.wb.sheets))X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet(rows),name);
    const dest=path.join(output,label+'-'+i+'-批量确认导出.xlsx');fs.writeFileSync(dest,Buffer.from(X.write(wb,{type:'array',bookType:'xlsx'})));
    const loaded=X.read(fs.readFileSync(dest),{type:'buffer'});assert.equal(loaded.SheetNames.length,Object.keys(e.wb.sheets).length);
   }
  }
  // F2必须工程师明确选择；选择后只确认该行，源封装名和型号均保留。
  await page.evaluate(()=>installBatchFixture(['F2']));await page.evaluate(()=>openConvPackageBatch());
  assert(await page.locator('#convPackageBatchConfirm').isDisabled());
  await page.getByRole('checkbox',{name:'确认 F2',exact:true}).check();await page.locator('#convPackageBatchConfirm').click();
  await page.waitForFunction(()=>CONV_PACKAGE_BATCH.phase==='done');
  const f2=await page.evaluate(()=>CONV_OUT[0]);assert.equal(f2.verification,'manual_confirmed');assert.equal(f2.footprint,'BSMD2920-200-48V');
  // 源行、编号、型号、位号、封装变化，以及输出重复，都使旧清单失效。
  for(const mutation of ['comment','footprint','designator','refs','code','source','replacement','duplicate']){
   await page.evaluate(()=>installBatchFixture(['C14']));await page.evaluate(()=>openConvPackageBatch());
   await page.evaluate(mutation=>{
    const r=CONV_OUT[0];if(mutation==='code')r.rejectedLcsc='C999999';else if(mutation==='source')CONV_RAW[0].fp='CHANGED';
    else if(mutation==='replacement')CONV_OUT[0]=Object.assign({},r);else if(mutation==='duplicate')CONV_OUT.push(Object.assign({},r));
    else r[mutation]=mutation==='refs'?['C14','C99']:'CHANGED';
   },mutation);
   await page.evaluate(()=>confirmConvPackageBatch());
   assert.equal(await page.evaluate(()=>CONV_OUT.some(r=>r.allowPackageMismatch)),false,mutation);
   assert((await page.locator('#convPackageBatchSummary').innerText()).includes('成功 0 行'));
  }
  // 确认时再次查官方资料，型号/封装变化、错码、参数变化及新增射频指定规则均不得套用旧确认。
  for(const kind of ['model','package','code','rf']){
   overrides={};await page.evaluate(()=>installBatchFixture(['C14']));await page.evaluate(()=>openConvPackageBatch());
   if(kind==='rf')await page.evaluate(()=>{CONV_OUT[0].rfPreferred=true;});
   else overrides.C3151829=Object.assign({},details.C3151829,kind==='model'?{productModel:'WRONG'}:kind==='code'?{productCode:'C999999'}:{package:'SMD,D8xL8mm'});
   await page.evaluate(()=>confirmConvPackageBatch());assert.equal(await page.evaluate(()=>!!CONV_OUT[0].allowPackageMismatch),false,kind);
  }
  overrides={};
  // 初次可确认的小电容若在提交时返回不合格精度，仍必须跳过。
  details.C100007=product('C100007','CAP6PF-OK','0603','贴片电容',{capacitance:'6pF',tolerance:'±0.1pF',voltage:'50V',dielectric:'C0G'});
  await page.evaluate(data=>{batchDetails.C100007=data;batchFixture.push(['C99','6pF','CUSTOM-CAP','C100007']);installBatchFixture(['C99']);},details.C100007);
  await page.evaluate(()=>openConvPackageBatch());await page.getByRole('checkbox',{name:'确认 C99',exact:true}).check();
  overrides.C100007=Object.assign({},details.C100007,{_extracted:{capacitance:'6pF',tolerance:'±0.25pF',voltage:'50V',dielectric:'C0G'}});
  await page.evaluate(()=>confirmConvPackageBatch());assert.equal(await page.evaluate(()=>!!CONV_OUT[0].allowPackageMismatch),false);
  assert((await page.locator('#convPackageBatchBody').innerText()).includes('精度'));overrides={};
  // 41行不同器件跨过接口每批30个编号的边界，清单和确认均按分批结果完整处理。
  const many=Array.from({length:41},(_,i)=>({ref:'U'+(100+i),code:'C'+(500000+i),model:'BATCH-IC-'+i}));
  for(const r of many)details[r.code]=product(r.code,r.model,'SOP8');
  await page.evaluate(({many,details})=>{
   closeConvPackageBatch();CONV_OUT=[];CONV_RAW=[];materialDB_rf_inductor=[];CONV_AUDIT_FILTER='invalid';CONV_AUDIT_QUERY='';
   for(const item of many){
    const row={comment:item.model,model:item.model,designator:item.ref,refs:[item.ref],footprint:item.model,lcsc:item.code,status:'verifying'};
    CONV_RAW.push({ref:item.ref,value:item.model,fp:item.model});applyOfficialVerification(row,{ok:true,data:details[item.code]});CONV_OUT.push(row);
   }
   updateConvStats();renderConvTable();renderConvAudit();
  },{many,details});
  const beforeMany=requests.length;await page.evaluate(()=>openConvPackageBatch());
  assert((await page.locator('#convPackageBatchConfirm').innerText()).includes('41 行 / 41 个位号'));
  await page.evaluate(()=>confirmConvPackageBatch());assert.equal(await page.evaluate(()=>CONV_OUT.filter(r=>r.verification==='manual_confirmed').length),41);
  assert.equal(requests.length-beforeMany,4);assert(requests.slice(beforeMany).every(codes=>codes.length<=30&&codes.length===new Set(codes).size));
  // 取消正在提交的请求、新文件转换及重复点击，不会产生迟到回填。
  for(const cancel of ['close','new-file','double-click']){
   await page.evaluate(()=>installBatchFixture(['C14']));await page.evaluate(()=>openConvPackageBatch());
   hold=true;held=[];const n=requests.length;
   await page.locator('#convPackageBatchConfirm').click();await page.waitForFunction(()=>CONV_PACKAGE_BATCH.phase==='applying');
   for(let i=0;i<20&&!held.length;i++)await new Promise(resolve=>setTimeout(resolve,10));
   assert(held.length);
   if(cancel==='new-file')await page.evaluate(()=>runConvert([{Value:'NEW-PART',Reference:'U99','PCB Footprint':'CUSTOM'}]));
   else if(cancel==='close')await page.evaluate(()=>closeConvPackageBatch());
   else await page.evaluate(()=>confirmConvPackageBatch());
   hold=false;held.splice(0).forEach(resolve=>resolve());
   if(cancel==='double-click'){
    await page.waitForFunction(()=>CONV_PACKAGE_BATCH.phase==='done');assert.equal(requests.length,n+1);assert.equal(await page.evaluate(()=>CONV_OUT[0].verification),'manual_confirmed');
   }else{
    await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>CONV_OUT.some(r=>r.allowPackageMismatch)),false);assert.equal(await page.evaluate(()=>CONV_PACKAGE_BATCH),null);
   }
  }
  // 精度、封装尺寸、引脚及间距冲突判定，以及批量确认后的导出防失效校验。
  const guards=await page.evaluate(details=>{
   const conflict=(a,b)=>!!convPackageBatchPhysicalError(a,b);
   const geometry=[conflict('SC0402','0603'),conflict('SC0402','SMD,0201'),conflict('QFN32','QFN48'),conflict('SOT23-3','SOT23-6'),conflict('插件,P=2mm','插件,P=2.54mm'),conflict('QFN32-4x4mm','QFN32-5x5mm'),!conflict('MWSA0603S-5R6MT','SMD,7x6.6mm')];
   const actual={'comment':'6pF','designator':'C1','refs':['C1'],'footprint':'SC0402'};
   const data={hit:true,productCode:'C300000',productModel:'CAP6PF',productType:'电容',package:'0603',_extracted:{capacitance:'6pF',tolerance:'±0.25pF'}};
   const small=convPackageBatchCheck(actual,'C300000',{ok:true,data});
   closeConvPackageBatch();const r=CONV_OUT[0],n=exports.length;CONV_RAW[0].value='CHANGED';exportJlcBom();
   return {geometry,small:small.kind==='blocked'&&small.message.includes('精度'),staleExport:exports.length===n};
  },details);
  assert(guards.geometry.every(Boolean));assert(guards.small&&guards.staleExport,JSON.stringify(guards));
  assert.deepEqual(errors,[]);await page.close();console.log(label+': batch package selection, merged refs, report/export, hard guards, race/cancel and stale-binding checks passed');
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
