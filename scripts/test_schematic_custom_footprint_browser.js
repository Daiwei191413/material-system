const assert=require('assert'),fs=require('fs'),path=require('path');
const {pathToFileURL}=require('url');
let pw;try{pw=require('playwright-core');}catch(_){pw=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));}
const edge=[process.env.EDGE_PATH,path.join(process.env['ProgramFiles(x86)']||'','Microsoft/Edge/Application/msedge.exe'),path.join(process.env.ProgramFiles||'','Microsoft/Edge/Application/msedge.exe')].find(p=>p&&fs.existsSync(p));
const root=path.resolve(__dirname,'..');
const details={
 C408450:{hit:true,productCode:'C408450',productModel:'MWSA0603S-8R2MT',productType:'功率电感',package:'SMD,7x6.6mm',brand:'Sunlord',stockNum:4380,_extracted:{inductance:'8.2uH',tolerance:'±20%',current:'5A'}},
 C492495:{hit:true,productCode:'C492495',productModel:'M2010V-02P',productType:'线对板针座',package:'插件,P=2mm',brand:'XFCN',stockNum:35,_extracted:{}},
 C22358270:{hit:true,productCode:'C22358270',productModel:'XR4426T101MVL5',productType:'色环/插件电感',package:'插件,D=13.2mm',brand:'XR',stockNum:1230,_extracted:{inductance:'100uH',tolerance:'±10%',current:'2.5A'}},
};
const rows=[
 {Value:'MWSA0603S-8R2MT',Reference:'L1','PCB Footprint':'MWSA0603S-5R6MT'},
 {Value:'M2010V-02P',Reference:'XS3,XS15','PCB Footprint':'M2010V-02P'},
 {Value:'XR4426T101MVL5',Reference:'L2','PCB Footprint':'XR4426T101MVL5'},
];
(async()=>{
 const browser=await pw.chromium.launch({headless:true,executablePath:edge});
 try{
  for(const [label,file] of [['domestic','v3-cloudbase/web/index.html'],['overseas','v3-legacy/index.html']]){
   const page=await browser.newPage(),searches=[],pageErrors=[];
   page.on('pageerror',e=>pageErrors.push(e.message));
   await page.route('**/*',async route=>{
    const url=route.request().url();
    if(url.includes('/search?')){
     const u=new URL(url),q=u.searchParams.get('q');searches.push({q,pkg:u.searchParams.get('pkg')||''});
     const found=Object.values(details).filter(d=>d.productModel===q);
     return route.fulfill({json:{ok:true,items:found.map(d=>({componentCode:d.productCode,componentModel:d.productModel,componentSpecification:d.package}))}});
    }
    if(url.includes('/batch?')){
     const codes=new URL(url).searchParams.get('codes').split(',');
     return route.fulfill({json:{ok:true,results:codes.map(c=>({ok:!!details[c],data:details[c]}))}});
    }
    return url.startsWith('file:')?route.continue():route.abort();
   });
   await page.goto(pathToFileURL(path.join(root,file)).href,{waitUntil:'domcontentloaded'});
   const parsed=await page.evaluate(()=>{
    window.alerts=[];window.alert=x=>alerts.push(x);window.confirm=()=>true;
    document.body.classList.remove('v3-not-logged');
    document.getElementById('v3LoginMask').classList.remove('show');
    window.materialDB_standard=[];window.materialDB_rf_inductor=[];window.materialDB_lcsc=[];
    return {custom:['MWSA0603S-5R6MT','M2010V-02P','XR4426T101MVL5','MOLEX-1206'].map(extractStdPkg),
     standard:['SC1812','SL0603','SR1206','0805 (2012)','R_0603'].map(extractStdPkg)};
   });
   assert.deepEqual(parsed.custom,['','','','']);
   assert.deepEqual(parsed.standard,['1812','0603','1206','0805','0603']);
   // 按型号搜索，既不能误用内部数字，也不能自动放行未知焊盘。
   await page.evaluate(rows=>runConvert(rows),rows);
   await page.evaluate(()=>pullUnmatchedLcsc());
   await page.waitForFunction(()=>!document.getElementById('btnPullUnmatched').disabled);
   const auto=await page.evaluate(()=>CONV_OUT.map(r=>({status:r.status,note:r.onlinePullNote})));
   assert(auto.every(r=>r.status==='unmatched'&&r.note.includes('封装兼容性')));
   assert(searches.every(s=>s.pkg===''));
   for(const ref of ['L1','XS3,XS15','L2']){
    await page.evaluate(ref=>openLcscSearch(CONV_OUT.findIndex(r=>r.designator===ref)),ref);
    await page.waitForFunction(()=>document.querySelectorAll('.lcsc-data-row').length===1);
    assert.equal(await page.locator('#lcscSearchPkg').inputValue(),'');
    if(ref==='L1'){
     await page.evaluate(()=>{window.confirm=()=>false;pickLcscCandidate(0);});
     assert.equal(await page.evaluate(()=>CONV_OUT.find(r=>r.designator==='L1').status),'unmatched');
    }
    await page.evaluate(()=>{window.confirm=()=>true;pickLcscCandidate(0);});
    await page.waitForFunction(ref=>CONV_OUT.find(r=>r.designator===ref).verification==='manual_confirmed',ref);
   }
   assert((await page.evaluate(()=>CONV_OUT)).every(r=>r.status==='matched'));
   // 立创库优先命中同型号；名称不同先提示确认，期间不发起联网搜索。
   const searchCount=searches.length;
   const before=await page.evaluate(({rows,details})=>{
    window.materialDB_lcsc=Object.values(details).map(d=>({model:d.productModel,package:d.package,lcsc_code:d.productCode}));
    window.materialDB_standard=[{model:'MWSA0603S-8R2MT',package:'MWSA0603S-5R6MT',lcsc_code:'C999000'}];
    window.libSnapshot=JSON.stringify([materialDB_lcsc,materialDB_standard,materialDB_rf_inductor]);
    runConvert(rows);
    return libSnapshot;
   },{rows,details});
   await page.waitForFunction(()=>CONV_OUT.every(r=>r.status==='invalid'&&r.packageConfirmRequired));
   assert.equal(searches.length,searchCount);
   assert((await page.evaluate(()=>CONV_OUT)).every(r=>r.matchedFromLcscLibrary));
   const blocked=await page.evaluate(()=>{
    window.exports=[];window.XLSX={utils:{aoa_to_sheet:r=>({rows:r}),book_new:()=>({}),book_append_sheet:(w,s)=>{w.sheet=s;}},writeFile:w=>exports.push(w.sheet.rows)};
    exportJlcBom();return exports.length;
   });
   assert.equal(blocked,0);
   for(const ref of ['L1','XS3,XS15','L2']){
    await page.evaluate(async ref=>{await confirmConvPackage(CONV_OUT.findIndex(r=>r.designator===ref));},ref);
   }
   const reused=await page.evaluate(()=>{
    exportJlcBom();
    return {states:CONV_OUT.map(r=>({v:r.verification,code:r.lcsc,record:r.packageConfirmation})),exported:exports[0],
      libs:JSON.stringify([materialDB_lcsc,materialDB_standard,materialDB_rf_inductor])};
   });
   assert.equal(reused.libs,before);
   assert(reused.states.every(r=>r.v==='manual_confirmed'&&r.record.code===r.code));
   assert.deepEqual(reused.exported[0],['Comment','Designator','Footprint','嘉立创元件编号']);
   assert.deepEqual(reused.exported[1],['MWSA0603S-8R2MT','L1','MWSA0603S-5R6MT','C408450']);
   const guard=await page.evaluate(details=>{
    const original=JSON.parse(JSON.stringify(CONV_OUT[0]));
    CONV_OUT[0].lcsc='C999100'; const n=exports.length; exportJlcBom();
    const staleExportBlocked=exports.length===n;
    applyOfficialVerification(CONV_OUT[0],{ok:true,data:Object.assign({},details.C408450,{productCode:'C999100'})});
    const codeChange=CONV_OUT[0].status;
    CONV_OUT[0]=JSON.parse(JSON.stringify(original));
    applyOfficialVerification(CONV_OUT[0],{ok:true,data:Object.assign({},details.C408450,{productModel:'WRONG-MODEL'})});
    const modelChange=CONV_OUT[0].status;
    CONV_OUT[0]=original;
    materialDB_lcsc.push({model:original.comment,package:'DIFFERENT',lcsc_code:'C999101'});
    const duplicate=matchForLcsc({'型号':original.comment,'封装':original.footprint,'位号':'L1'});
    materialDB_lcsc=[{model:'100nF',package:'0603',lcsc_code:'C999102'}];
    const standard=matchForLcsc({'型号':'100nF','封装':'SC0402','位号':'C1'});
    return {staleExportBlocked,codeChange,modelChange,duplicate:!!duplicate.hit,standard:!!standard.hit};
   },details);
   assert.deepEqual(guard,{staleExportBlocked:true,codeChange:'invalid',modelChange:'invalid',duplicate:false,standard:false});
   // 射频指定记录仍锁定选型，同一指定编码可单独确认PCB封装名称差异。
   await page.evaluate(({row,detail})=>{
    materialDB_lcsc=[];materialDB_rf_inductor=[{model:detail.productModel,package:detail.package,lcsc_code:detail.productCode,specification:'电感值：100uH'}];
    runConvert([row]);
   },{row:rows[2],detail:details.C22358270});
   await page.waitForFunction(()=>CONV_OUT[0].packageConfirmRequired);
   assert(await page.evaluate(()=>CONV_OUT[0].rfPreferred));
   await page.evaluate(async()=>{await confirmConvPackage(0);});
   assert.equal(await page.evaluate(()=>CONV_OUT[0].verification),'manual_confirmed');
   // 搜索结果被条件过滤时告知原因，解除筛选按钮确实清空条件。
   await page.evaluate(row=>{materialDB_rf_inductor=[];runConvert([row]);openLcscSearch(0);},rows[0]);
   await page.waitForFunction(()=>document.querySelectorAll('.lcsc-data-row').length===1);
   await page.evaluate(()=>{document.getElementById('lcscSearchPkg').value='0603';runLcscSearchByBrand();});
   await page.waitForFunction(()=>document.getElementById('lcscSearchBody').textContent.includes('过滤'));
   await page.getByRole('button',{name:'清除封装条件，全网搜索',exact:true}).first().click();
   await page.waitForFunction(()=>document.querySelectorAll('.lcsc-data-row').length===1);
   assert.equal(searches[searches.length-1].pkg,'');
   assert.deepEqual(pageErrors,[]);
   console.log(label+': model footprint search, library reuse, scoped package confirmation and export passed');
   await page.close();
  }
 } finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
