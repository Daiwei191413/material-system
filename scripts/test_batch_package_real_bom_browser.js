// 用外部真实原理图文件验证，不把用户BOM或公司的库文件提交到仓库。
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {pathToFileURL}=require('node:url');
let pw;try{pw=require('playwright-core');}catch(_){pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));}
const root=path.resolve(__dirname,'..'),source=process.env.BOM_BATCH_REAL_SOURCE,snapshot=process.env.BOM_BATCH_REAL_API,output=process.env.BOM_BATCH_REAL_OUTPUT;
assert(source&&fs.existsSync(source),'Set BOM_BATCH_REAL_SOURCE to the source schematic XLSX');
assert(snapshot&&fs.existsSync(snapshot),'Set BOM_BATCH_REAL_API to the official API snapshot');
assert(output&&/^D:[\\/]/i.test(output),'BOM_BATCH_REAL_OUTPUT must be on D:');fs.mkdirSync(output,{recursive:true});
const before=crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex');
const api=JSON.parse(fs.readFileSync(snapshot,'utf8')),data=Object.fromEntries(api.results.filter(x=>x.ok&&x.data?.hit).map(x=>[x.data.productCode,x.data]));
const targets=[['U33','C390106'],['U24','C9900134727'],['U14','C9900206934'],['N1','C9900060769'],['J14','C27985230'],['J15','C27985231'],['J1','C8396'],['J2','C8389'],['J3','C2845616']];
const edge=[process.env.EDGE_PATH,path.join(process.env['ProgramFiles(x86)']||'','Microsoft/Edge/Application/msedge.exe'),path.join(process.env.ProgramFiles||'','Microsoft/Edge/Application/msedge.exe')].find(x=>x&&fs.existsSync(x));
(async()=>{
 const browser=await pw.chromium.launch({headless:true,executablePath:edge});
 try{for(const [label,file] of [['domestic','v3-cloudbase/web/index.html'],['overseas','v3-legacy/index.html']]){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{
   const url=route.request().url();
   if(url.includes('/npm/xlsx@0.18.5/'))return route.fulfill({path:path.join(root,'v3-cloudbase/web/assets/vendor/xlsx.full.min.js'),contentType:'application/javascript'});
   if(url.includes('/npm/jszip@3.10.1/'))return route.fulfill({path:path.join(root,'v3-cloudbase/web/assets/vendor/jszip.min.js'),contentType:'application/javascript'});
   if(url.includes('/batch?'))return route.fulfill({json:{ok:true,results:new URL(url).searchParams.get('codes').split(',').map(code=>({query:code,ok:!!data[code],data:data[code]}))}});
   return url.startsWith('file:')?route.continue():route.abort();
  });
  await page.goto(pathToFileURL(path.join(root,file)).href,{waitUntil:'domcontentloaded'});
  // 使用网站自身的文件解析与转换入口，只为截图涉及的9行配置受控的已用库映射。
  await page.evaluate(({data,targets})=>{
   document.body.classList.remove('v3-not-logged');document.getElementById('v3LoginMask').classList.remove('show');showPanelDirect('convert');
   window.alert=()=>{};window.confirm=()=>true;materialDB_standard=[];materialDB_rf_inductor=[];
   window.knownTargets=targets;window.knownData=data;
   const mapping=[['SAFEA2G45MB0F0A','SAFEA2G45MB0F0A','C390106'],['ST-91-Z8LR','module10x10_smt','C9900134727'],['CB5337','CB5337','C9900206934'],['PD25T03','PD0409J7575S2HF','C9900060769'],['HC-PM254-5.0H-1X5PZ','HC-PM254-5_0H-1X5PZ','C27985230'],['HC-PM254-5.0H-1X6PZ','HC-PM254-5_0H-1X6PZ','C27985231'],['WJ15EDGVC-3.81-02P-14-00A','WJ15EDGVC-3_81-02P-14-00A','C8396'],['WJ15EDGVC-3.81-03P-14-00A','WJ15EDGVC-3_81-03P-14-00A','C8389'],['HC-PHD-2*5A','HC-PHD-2X5A','C2845616']];
   materialDB_lcsc=mapping.map(([model,package,lcsc_code])=>({model,package,lcsc_code}));
   window.libsBefore=JSON.stringify([materialDB_lcsc,materialDB_standard,materialDB_rf_inductor]);
  },{data,targets});
  await page.locator('#convFile').setInputFiles(source);
  await page.waitForFunction(()=>CONV_OUT.length>100&&!CONV_OUT.some(r=>r.status==='verifying'));
  const original=await page.evaluate(()=>knownTargets.map(([ref,code])=>{
   const r=CONV_OUT.find(x=>x.refs.includes(ref));return {ref,code,row:r&&{comment:r.comment,footprint:r.footprint,designator:r.designator,packageConfirmRequired:r.packageConfirmRequired,matchedFromLcscLibrary:r.matchedFromLcscLibrary},check:r&&convPackageBatchCheck(r,code,{ok:true,data:knownData[code]})};
  }));
  assert(original.every(x=>x.row?.packageConfirmRequired&&x.row.matchedFromLcscLibrary));
  const totals=await page.evaluate(()=>({sourceRefs:CONV_AUDIT.sourceTotal,mergedRows:CONV_OUT.length,rawRows:CONV_RAW.length}));
  const report={mode:'regression',sourceSha256:before,source,totals,checks:original,
   scope:'真实文件完整解析转换；仅截图9行用受控已用库映射及实际立创接口快照核对，不代表公司完整库和其余器件已全部核验'};
   assert.equal(totals.sourceRefs,492);
   assert(original.every(x=>x.check.kind==='eligible'),JSON.stringify(original));
   assert(original.filter(x=>['U33','U14'].includes(x.ref)).every(x=>x.check.warning&&x.check.libraryMapping));
   assert(original.filter(x=>['J1','J2','J3','J14','J15'].includes(x.ref)).every(x=>!x.check.warning));
   assert(original.filter(x=>['U24','N1'].includes(x.ref)).every(x=>x.check.warning));
   // 当前类别搜索仍严格限定范围；预览的全部入口可找回被筛选隐藏的待确认行。
   await page.evaluate(()=>{setConvAuditFilter('invalid');setConvAuditQuery('J1');});
   const scoped=await page.evaluate(()=>({current:convPackageBatchIndices().length,all:convPackageBatchIndices(true).length}));
   assert.equal(scoped.all,9);assert(scoped.current<scoped.all);
   await page.locator('#convPreviewBatchPackage').click();await page.waitForFunction(()=>CONV_PACKAGE_BATCH?.phase==='ready');
   assert.equal(await page.evaluate(()=>CONV_PACKAGE_BATCH.entries.length),9);
   assert.equal(await page.evaluate(()=>CONV_PACKAGE_BATCH.entries.filter(e=>e.selected).length),5);
   assert((await page.locator('#convPackageBatchBody').innerText()).includes('官方型号'));
   await page.locator('#convPackageBatchAll').check();
   if(output)await page.locator('.conv-package-batch-panel').screenshot({path:path.join(output,label+'-真实BOM九行核对.png')});
   await page.locator('#convPackageBatchConfirm').click();await page.waitForFunction(()=>CONV_PACKAGE_BATCH?.phase==='done');
   report.result=await page.evaluate(()=>({summary:document.getElementById('convPackageBatchSummary').textContent,
    states:knownTargets.map(([ref])=>{const r=CONV_OUT.find(x=>x.refs.includes(ref));return {ref,code:r.lcsc,designator:r.designator,status:r.status,verification:r.verification,record:r.packageConfirmation};}),
    libraryUnchanged:libsBefore===JSON.stringify([materialDB_lcsc,materialDB_standard,materialDB_rf_inductor])}));
   assert(report.result.summary.includes('成功 9 行；跳过 0 行；失败 0 行'));assert(report.result.states.every(r=>r.verification==='manual_confirmed'));
   assert.equal(report.result.states.reduce((n,r)=>n+r.designator.split(',').length,0),17);
   assert(report.result.libraryUnchanged);
   // 同编号映射必须当前存在且唯一，不按型号前缀、后缀通用放行；资料/映射撤回后旧确认失效。
   const guards=await page.evaluate(()=>{
    closeConvPackageBatch();const row=CONV_OUT.find(r=>r.refs.includes('U14')),saved=JSON.stringify(materialDB_lcsc),code=row.lcsc;
    const originalRows=CONV_OUT,writeFile=XLSX.writeFile,written=[];
    CONV_OUT=CONV_OUT.filter(r=>knownTargets.some(([ref])=>r.refs.includes(ref)));
    XLSX.writeFile=wb=>written.push(XLSX.utils.sheet_to_json(wb.Sheets['嘉立创BOM'],{header:1}));
    exportJlcBom();
    const exportUnchanged=written.length===1&&written[0].length===10&&written[0].every(r=>r.length===4)
     &&written[0].some(r=>r[0]==='CB5337'&&r[1]==='U14'&&r[2]==='CB5337'&&r[3]===code);
    materialDB_lcsc=materialDB_lcsc.filter(x=>x.lcsc_code!==code);
    const revoked=!convPackageConfirmationMatches(row,{productCode:code,package:row.officialPackage});
    exportJlcBom();const exportRevoked=written.length===1;
    const unregistered=convPackageBatchCheck(row,code,{ok:true,data:knownData[code]}).kind;
    materialDB_lcsc=JSON.parse(saved);materialDB_lcsc.push({model:row.comment,package:row.footprint,lcsc_code:'C999999'});
    const ambiguous=convPackageBatchCheck(row,code,{ok:true,data:knownData[code]}).kind;
    materialDB_lcsc=JSON.parse(saved);row.officialModel='CHANGED';
    const changed=!convPackageConfirmationMatches(row,{productCode:code,package:row.officialPackage});
    const name=x=>convPackageFootprintName(x);
    const names=name('PART-3_81')===name('PART-3.81')&&name('PART-3.81')!==name('PART-38.1')&&name('HC-PHD-2*5A')===name('HC-PHD-2X5A');
    XLSX.writeFile=writeFile;CONV_OUT=originalRows;
    return {revoked,unregistered,ambiguous,changed,names,exportUnchanged,exportRevoked};
   });
   assert(guards.revoked&&guards.changed&&guards.names&&guards.exportUnchanged&&guards.exportRevoked);assert.equal(guards.unregistered,'blocked');assert.equal(guards.ambiguous,'blocked');report.guards=guards;
  fs.writeFileSync(path.join(output,label+'-真实BOM回归.json'),JSON.stringify(report,null,2));
  assert.deepEqual(errors,[]);await page.close();console.log(label+': '+JSON.stringify({totals,checks:original.map(x=>({ref:x.ref,kind:x.check.kind,selectedByDefault:x.check.kind==='eligible'&&!x.check.warning,reason:x.check.message}))}));
 }}finally{await browser.close();}
 assert.equal(crypto.createHash('sha256').update(fs.readFileSync(source)).digest('hex'),before,'Original source workbook must remain unchanged');
})().catch(e=>{console.error(e);process.exitCode=1;});
