const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));
const X=require('../v3-cloudbase/web/assets/vendor/xlsx.full.min.js');
const root=path.resolve(__dirname,'..'),live=process.env.BOM_DUPLICATE_LIVE==='1';
const baseOut=process.env.BOM_DUPLICATE_OUTPUT||'D:/研发电子ＢＯＭ工具 2/交互资料/测试/2026-11-04-同料归一化';assert(/^D:[\\/]/i.test(baseOut));const out=live?path.join(baseOut,'live'):baseOut;fs.mkdirSync(out,{recursive:true});
const headers=['物料名称','型号','参数描述','封装','位号','数量','单位','备注','DNP'];
const rows=[['贴片电阻','0R SR0402','厚膜电阻 0Ω ±1% 1/16W SMD 0402','SR0402','L3',1,'PCS','',''],['贴片电阻','0R SR0402','厚膜电阻 0Ω，精度：±1%，SMD 0402','SR0402','R13,R14',2,'PCS','',''],['贴片电阻','0R SR0603','厚膜电阻 0Ω ±1% 1/8W SMD 0603','SR0603','R15',1,'PCS','',''],['贴片电阻','0R SR0402','厚膜电阻 0Ω ±1% 1/16W SMD 0402','SR0402','R16',1,'PCS','替代料',''],['贴片电阻','0R SR0402','厚膜电阻 0Ω ±1% 1/16W SMD 0402','SR0402','R17',1,'PCS','','Y']];
function file(){const wb=X.utils.book_new();X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([headers,...rows]),'单板BOM');return {name:'截图同料分行受控样例.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from(X.write(wb,{type:'array',bookType:'xlsx'}))};}
async function snapshot(page){return page.evaluate(()=>JSON.stringify([B,materialDB_standard,materialDB_lcsc,materialDB_rf_inductor,BOM_REVIEW_UI.state.primary.doc]));}
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'}),results=[];
 try{for(const [label,local,url] of [['domestic','v3-cloudbase/web/index.html','https://techphant-bom-v3-d9e3pqqb0b46c88-1363491993.tcloudbaseapp.com/'],['overseas','v3-legacy/index.html','https://techphant-bom-tools-v3.pages.dev/']]){
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:1000}}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>{const r=route.request();return (live?['GET','HEAD'].includes(r.method()):r.url().startsWith('file:'))?route.continue():route.abort();});
  await page.goto(live?url:pathToFileURL(path.join(root,local)).href,{waitUntil:'domcontentloaded'});if(live&&(await page.title())==='风险提醒')await page.getByText('确定访问',{exact:true}).click();
  if(!live&&!await page.evaluate(()=>typeof XLSX!=='undefined'))await page.addScriptTag({path:path.join(root,'v3-cloudbase/web/assets/vendor/xlsx.full.min.js')});
  await page.waitForFunction(()=>typeof BOM_REVIEW_UI!=='undefined'&&typeof XLSX!=='undefined');await page.waitForLoadState('domcontentloaded');
  await page.evaluate(()=>{document.body.classList.remove('v3-not-logged');document.getElementById('v3LoginMask').classList.remove('show');BOM_API.user={role:'readonly',username:'controlled-duplicate-review'};V3_applyRoleUI();materialDB_standard=[];materialDB_rf_inductor=[];BOM_STANDARD_SYNC={status:'ready',count:0,error:''};showPanelDirect('review');});
  await page.locator('#reviewFile').setInputFiles(file());await page.waitForFunction(()=>BOM_REVIEW_UI.state.primary?.valid);const before=await snapshot(page);await page.locator('#reviewRun').click();const result=await page.evaluate(()=>BOM_REVIEW_UI.state.result);
  assert.equal(result.duplicateGroups.length,1);assert.deepEqual(result.duplicateGroups[0].refs,['L3','R13','R14']);assert.equal(result.duplicateGroups[0].quantity,3);assert.equal(await snapshot(page),before);
  await page.locator('#reviewFilter').selectOption('duplicates');assert((await page.locator('#reviewFilter option[value="duplicates"]').innerText()).includes('1组'));assert.equal(await page.locator('#reviewResultBody tr').count(),2);
  const visible=await page.locator('#reviewResultBody').innerText();assert(visible.includes('L3')&&visible.includes('R13,R14')&&visible.includes('数量：3')&&visible.includes('功率'));assert(!visible.includes('R15')&&!visible.includes('R16')&&!visible.includes('R17'));
  await page.locator('[data-review-evidence]').first().click();assert((await page.locator('#reviewEvidence').innerText()).includes('同型号/数值、同封装'));
  await page.locator('#reviewResults').screenshot({path:path.join(out,label+'-duplicate-candidate.png')});
  const downloadPromise=page.waitForEvent('download');await page.locator('#reviewExport').click();const reportPath=path.join(out,label+'-同料归一化审查报告.xlsx');await (await downloadPromise).saveAs(reportPath);
  const report=X.read(fs.readFileSync(reportPath));assert.deepEqual(report.SheetNames,['审查结论','逐行核对明细','检查项明细']);const detail=X.utils.sheet_to_json(report.Sheets['逐行核对明细']),checks=X.utils.sheet_to_json(report.Sheets['检查项明细']);
  for(const ref of ['L3','R13,R14']){const r=detail.find(r=>r['位号']===ref);assert(r&&String(r['具体原因']).includes('归一化候选')&&String(r['对照内容']).includes('数量：3'));assert(checks.some(c=>c['位号']===ref&&String(c['具体原因']).includes('同型号/数值、同封装')&&c['核对结果']==='待核实'));}
  assert.equal(await snapshot(page),before,'Export mutated original BOM or library');
  await page.setViewportSize({width:390,height:844});const geometry=await page.locator('#reviewPanel').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));assert(geometry.scroll<=geometry.width+2);await page.locator('#reviewResults').screenshot({path:path.join(out,label+'-duplicate-mobile.png')});assert.deepEqual(errors,[]);
  results.push({label,live,groups:1,refs:['L3','R13','R14'],quantity:3,powerRequiresReview:true,excludedRows:['R15','R16','R17'],reportReadback:true,originalDataUnchanged:true,report:reportPath,errors});await context.close();
 }}finally{await browser.close();}
 fs.writeFileSync(path.join(out,'duplicate-browser-results.json'),JSON.stringify(results,null,2));console.log('PASS '+JSON.stringify(results));
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
