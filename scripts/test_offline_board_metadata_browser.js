const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const crypto = require('node:crypto');
const {chromium} = require(path.join(process.env.USERPROFILE, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core'));
const XLSX = require('../v3-cloudbase/web/assets/vendor/xlsx.full.min.js');
const JSZip = require('../v3-cloudbase/web/assets/vendor/jszip.min.js');

const root = path.resolve(__dirname, '..');
const live=process.env.BOM_BOARD_METADATA_LIVE==='1';
const output = process.env.BOM_BOARD_METADATA_OUTPUT;
assert(output && /^D:[\\/]/i.test(output), 'BOM_BOARD_METADATA_OUTPUT must be on D:');
fs.mkdirSync(output, {recursive:true});
const edge = [process.env.EDGE_PATH, 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => p && fs.existsSync(p));
assert(edge, 'Microsoft Edge is required');
const templatePath = path.join(root, 'v3-cloudbase/web/assets/offline-bom-format-template.xlsx');
const templateBytes = fs.readFileSync(templatePath);
const templateHash = crypto.createHash('sha256').update(templateBytes).digest('hex');
const standard = [{material_code:'1-TEST-00001', name:'测试IC', model:'TEST-IC', specification:'测试器件', package:'SOT-23-6', brand:'Test', lcsc_code:'', unit:'PCS'}];
const cases = [
  {id:'with-erp', file:'A-01-02-00221-DMZ_ZJB_V1.1-嘉立创格式BOM-20260422.xlsx', name:'DMZ_ZJB', erp:'A-01-02-00221', version:'V1.1', saved:'A-01-02-00221-DMZ_ZJB_V1.1_20260422.xlsx'},
  {id:'no-erp', file:'DMZ_ZJB_V1.1-嘉立创BOM.xlsx', name:'DMZ_ZJB', erp:'', version:'V1.1', saved:'DMZ_ZJB_V1.1.xlsx'},
  {id:'underscore-version', file:'DMZ_ZJB_V1_1-嘉立创BOM.xlsx', name:'DMZ_ZJB', erp:'', version:'V1.1', saved:'DMZ_ZJB_V1_1.xlsx'},
  {id:'chinese', file:'电源控制板_V2.0_20261103_立创BOM.xlsx', name:'电源控制板', erp:'', version:'V2.0', saved:'电源控制板_V2.0_20261103.xlsx'},
  {id:'tp', file:'A-01-02-00259-TP1211-MK36_V1.0嘉立创BOM20261020.xlsx', name:'TP1211-MK36', erp:'A-01-02-00259', version:'V1.0', saved:'A-01-02-00259-TP1211-MK36_V1.0_20261020.xlsx'},
  {id:'no-version', file:'射频测试板.xlsx', name:'射频测试板', erp:'', version:'', saved:'射频测试板.xlsx'},
  {id:'erp-only', file:'A-01-02-00221_嘉立创BOM.xlsx', name:'', erp:'A-01-02-00221', version:'', saved:'A-01-02-00221.xlsx'},
  {id:'manual', file:'DMZ_ZJB_V1.1-嘉立创BOM.xlsx', name:'研发&验证<板>$&', model:'RF-ASSY<&>"$1',erp:'A-01-02-00998', version:'V9.9', saved:'DMZ_ZJB_V1.1.xlsx', manual:true},
  {id:'mainboard-independent',file:'A-01-02-00259-TP1211-MK36_V1.0.xlsx',name:'TP1211-MK36主板',model:'TP1211-MK36主板PCBA',erp:'A-01-02-00259',version:'V1.0',saved:'A-01-02-00259-TP1211-MK36_V1.0.xlsx',manual:true},
  {id:'source-explicit',file:'文件名候选_V1.0.xlsx',name:'射频测试板',model:'RF-ASSY-REV-C',erp:'A-01-02-00999',version:'V2.3',saved:'文件名候选_V1.0.xlsx',sourceInfo:{name:'射频测试板',model:'RF-ASSY-REV-C',erp:'A-01-02-00999',version:'V2.3'}},
  {id:'source-conflict',file:'文件名候选_V1.0.xlsx',name:'',model:'RF-ASSY-REV-C',erp:'A-01-02-00999',version:'V2.3',saved:'文件名候选_V1.0.xlsx',sourceInfo:{name:'射频板A',model:'RF-ASSY-REV-C',erp:'A-01-02-00999',version:'V2.3'},conflict:'射频板B'},
  {id:'manual-source',file:'文件名候选_V1.0.xlsx',name:'手工确认电源板',model:'POWER-REV-D',erp:'A-01-02-00888',version:'V3.1',saved:'文件名候选_V1.0.xlsx',sourceInfo:{name:'源表名称',model:'SOURCE-MODEL',erp:'A-01-02-00999',version:'V2.3'},manual:true},
  {id:'manual-clear', file:'A-01-02-00221-DMZ_ZJB_V1.1-嘉立创BOM.xlsx', name:'', erp:'', version:'', saved:'A-01-02-00221-DMZ_ZJB_V1.1.xlsx', manual:true},
  {id:'reset-on-upload', file:'BOM.xlsx', name:'', erp:'', version:'', saved:'BOM.xlsx'},
];
function uploadBytes(comment='TEST-IC', ref='U1,U2', footprint='SOT-23-6', code='',item={}) {
  const wb = XLSX.utils.book_new();
  if(item.sourceInfo){const i=item.sourceInfo;XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['板卡名称：'+i.name],['板卡型号：'+i.model],['板卡 ERP：'+i.erp],['BOM 版本：'+i.version]]),'封面');}
  if(item.conflict)XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([['板卡名称：'+item.conflict]]),'补充信息');
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([
    ['Comment','Designator','Footprint','嘉立创元件编号'], [comment,ref,footprint,code]
  ]), '嘉立创BOM');
  return Buffer.from(XLSX.write(wb, {type:'buffer', bookType:'xlsx'}));
}
const server = http.createServer((req,res) => {
  const relative = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
  const file = path.resolve(root, '.'+relative);
  if (!file.startsWith(root+path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {res.writeHead(404);res.end();return;}
  const type={'.html':'text/html; charset=utf-8','.js':'application/javascript','.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'};
  res.writeHead(200, {'Content-Type':type[path.extname(file)] || 'application/octet-stream'});
  fs.createReadStream(file).pipe(res);
});
function labelValue(sheet, cell, label) {
  return String(sheet[cell]?.v || '').replace(new RegExp('^\\s*'+label+'[：:]\\s*'), '').trim();
}
async function inspectExport(file, item, templateZip, originalWorkbook) {
  const bytes=fs.readFileSync(file), wb=XLSX.read(bytes,{type:'buffer',cellStyles:true});
  assert.deepEqual(wb.SheetNames, ['封面','单板BOM','补齐报告']);
  const cover=wb.Sheets['封面'], bom=wb.Sheets['单板BOM'];
  assert.equal(labelValue(cover,'D9','板卡名称'), item.name);
  assert.equal(labelValue(cover,'D10','板卡ERP'), item.erp);
  assert.equal(labelValue(cover,'D11','BOM版本'), item.version);
  assert.equal(labelValue(bom,'A2','板卡名称'), item.name);
  assert.equal(labelValue(bom,'E2','板卡型号'), item.model || '');
  assert.equal(labelValue(bom,'A3','板卡ERP'), item.erp);
  assert.equal(labelValue(bom,'E3','BOM版本'), item.version);
  const detail=XLSX.utils.sheet_to_json(bom,{header:1,defval:''}).slice(5).filter(row=>row.some(v=>v!==''));
  assert.equal(detail.length,1);assert.equal(detail[0][3],'TEST-IC');assert.equal(detail[0][5],'U1,U2');assert.equal(Number(detail[0][6]),2);
  const visible=[cover,bom].flatMap(s=>Object.entries(s).filter(([a,v])=>!a.startsWith('!')&&v&&Object.hasOwn(v,'v')).map(([,v])=>String(v.v))).join('\n');
  assert(!/TP1506-(?:M22|MS22)|A-01-02-00195/.test(visible),'Old template board information leaked');
  if(!item.version) assert(!/BOM版本[：:]\s*V\d/.test(visible),'Old BOM version leaked');
  for(const cell of ['A23','B23','E23','F23','G23','A24','B24','E24','F24','G24'])assert.equal(cover[cell]?.v ?? '', '');
  const missing=[!item.name&&'板卡名称',!item.model&&'板卡型号',!item.erp&&'板卡 ERP',!item.version&&'BOM 版本'].filter(Boolean);
  const report=XLSX.utils.sheet_to_json(wb.Sheets['补齐报告'],{header:1,defval:''});
  assert(report.some(r=>r[0]==='板卡信息一致性'&&r[1]==='通过'));
  for(const field of missing) assert(report.some(r=>r[0]===field&&String(r[4]).includes('已留空')),'Missing metadata report: '+field);
  if(!missing.length) assert(!report.some(r=>r[0]==='板卡信息待补'));
  for(const name of ['封面','单板BOM'])assert.deepEqual(wb.Sheets[name]['!merges'],originalWorkbook.Sheets[name]['!merges'],'Template merge ranges changed');
  const zip=await JSZip.loadAsync(bytes);
  for(const name of Object.keys(templateZip.files).filter(p=>/^xl\/(?:media|drawings)\//.test(p)&&!templateZip.files[p].dir)){
    assert.deepEqual(await zip.file(name).async('nodebuffer'),await templateZip.file(name).async('nodebuffer'),'Logo/drawing changed: '+name);
  }
  for(const name of ['xl/theme/theme1.xml'])assert.equal(await zip.file(name).async('string'),await templateZip.file(name).async('string'));
  const styles=await zip.file('xl/styles.xml').async('string'),originalStyles=await templateZip.file('xl/styles.xml').async('string');
  for(const tag of ['fonts','fills','numFmts'])assert.equal(styles.match(new RegExp('<'+tag+'\\b[^>]*>[\\s\\S]*?</'+tag+'>'))?.[0],originalStyles.match(new RegExp('<'+tag+'\\b[^>]*>[\\s\\S]*?</'+tag+'>'))?.[0],tag+' changed');
  return {missing,rows:detail.length,quantity:detail[0][6],logoAndFormatPreserved:true};
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({headless:true,executablePath:edge,downloadsPath:path.join(output,'browser-downloads')});
  const templateZip=await JSZip.loadAsync(templateBytes),originalWorkbook=XLSX.read(templateBytes,{type:'buffer',cellStyles:true}),results=[];
  try {
    for(const [label,relative,url] of [['domestic','v3-cloudbase/web/index.html','https://techphant-bom-v3-d9e3pqqb0b46c88-1363491993.tcloudbaseapp.com/'],['overseas','v3-legacy/index.html','https://techphant-bom-tools-v3.pages.dev/']]){
      const page=await browser.newPage({acceptDownloads:true,viewport:{width:1440,height:1000}}),errors=[];
      page.on('pageerror',e=>errors.push(e.message));
      await page.route('**/*',route=>{
        const url=route.request().url();
        if(url.startsWith(base+'/'))return route.continue();
        if(url.includes('cdn.jsdelivr.net/npm/xlsx@'))return route.fulfill({path:path.join(root,'v3-cloudbase/web/assets/vendor/xlsx.full.min.js'),contentType:'application/javascript'});
        if(url.includes('cdn.jsdelivr.net/npm/jszip@'))return route.fulfill({path:path.join(root,'v3-cloudbase/web/assets/vendor/jszip.min.js'),contentType:'application/javascript'});
        if(url.includes('/batch?')){
          const official={C700515:{hit:true,productCode:'C700515',productModel:'SMALL-CAP',productType:'贴片电容',package:'0402',_extracted:{capacitance:'6pF',tolerance:'±0.25pF',voltage:'50V',dielectric:'C0G'}},C100001:{hit:true,productCode:'C100001',productModel:'RES-22R',productType:'贴片电阻',package:'0402',_extracted:{resistance:'22Ω',tolerance:'±1%',power:'1/16W'}}};
          return route.fulfill({json:{ok:true,results:new URL(url).searchParams.get('codes').split(',').map(code=>({query:code,ok:!!official[code],data:official[code]}))}});
        }
        if(live&&['GET','HEAD'].includes(route.request().method()))return route.continue();
        return route.abort();
      });
      await page.goto(live?url:base+'/'+relative,{waitUntil:'domcontentloaded'});
      if(live&&await page.title()==='风险提醒')await page.getByText('确定访问',{exact:true}).click();
      await page.waitForFunction(()=>typeof OfflineBoardInfo!=='undefined');await page.waitForLoadState('domcontentloaded');
      await page.waitForFunction(()=>document.getElementById('msgA')?.textContent.includes('已就绪'));
      await page.evaluate(rows=>{
        document.body.classList.remove('v3-not-logged');document.getElementById('v3LoginMask').classList.remove('show');showPanelDirect('compare');
        materialDB_standard=rows;materialDB_lcsc=[];materialDB_rf_inductor=[];materialDB_cost=[];
        window.BOM_STANDARD_SYNC={status:'ready',count:rows.length,error:''};setActiveLib('standard');
        window.testAlerts=[];window.testConfirms=[];window.alert=s=>testAlerts.push(String(s));window.confirm=s=>{testConfirms.push(String(s));return true;};
        window.testLibraries=JSON.stringify([materialDB_standard,materialDB_lcsc,materialDB_rf_inductor,materialDB_cost]);
      },standard);
      for(const item of cases){
        if(item.id==='reset-on-upload')await page.evaluate(()=>{
          document.getElementById('boardName').value='OLD-BOARD';document.getElementById('boardModel').value='OLD-MODEL';document.getElementById('boardErp').value='A-01-02-00999';document.getElementById('boardVersion').value='V8.8';
        });
        await page.locator('#fileB').setInputFiles({name:item.file,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:uploadBytes('TEST-IC','U1,U2','SOT-23-6','',item)});
        await page.waitForFunction(name=>B&&B._fn===name,item.file);
        if(item.manual){await page.locator('#boardName').fill(item.name);await page.locator('#boardModel').fill(item.model||'');await page.locator('#boardErp').fill(item.erp);await page.locator('#boardVersion').fill(item.version);}
        const values=await page.evaluate(()=>getOfflineBoardInfo());
        assert.equal(values.name,item.name,item.id);assert.equal(values.model,item.model||'',item.id);assert.equal(values.erp,item.erp,item.id);assert.equal(values.version,item.version,item.id);
        const preview=await page.locator('#boardInfoPreview').innerText();assert(preview.includes(item.name||'（留空）'));assert(preview.includes(item.model||'（留空）'));if(item.conflict)assert((await page.locator('#boardInfoHint').innerText()).includes('源文件有不同值'));
        if(item.id==='mainboard-independent'){
          await page.locator('.cfg').filter({has:page.locator('#boardName')}).screenshot({path:path.join(output,label+'-四字段预览.png')});
          await page.setViewportSize({width:390,height:844});const size=await page.locator('#boardInfoPreview').evaluate(e=>({width:e.clientWidth,scroll:e.scrollWidth}));assert(size.scroll<=size.width+2);await page.locator('.cfg').filter({has:page.locator('#boardName')}).screenshot({path:path.join(output,label+'-四字段移动端.png')});await page.setViewportSize({width:1440,height:1000});
        }
        if(values.missing.length)assert((await page.locator('#boardInfoHint').innerText()).includes('仍可生成'));
        await page.locator('#goBtn').click();
        await page.waitForFunction(()=>!document.getElementById('fmtAB').disabled);
        await page.evaluate(()=>{testAlerts=[];testConfirms=[];});
        const pending=page.waitForEvent('download',{timeout:15000});await page.locator('#fmtAB').click();
        const download=await pending;assert.equal(download.suggestedFilename(),item.saved,item.id);
        const file=path.join(output,label+'-'+item.id+'.xlsx');await download.saveAs(file);
        const inspected=await inspectExport(file,item,templateZip,originalWorkbook);
        const prompts=await page.evaluate(()=>({alerts:testAlerts,confirms:testConfirms,libraryUnchanged:testLibraries===JSON.stringify([materialDB_standard,materialDB_lcsc,materialDB_rf_inductor,materialDB_cost])}));
        assert.equal(prompts.confirms.length,0,'Metadata triggered a blocking confirmation');assert(prompts.libraryUnchanged);
        assert(!prompts.alerts.some(s=>/请先补充.*板卡/.test(s)));
        results.push({label,live,case:item.id,sourceFilename:item.file,outputFilename:item.saved,...inspected});
        if(item.id==='no-erp')await page.locator('.cfg').filter({has:page.locator('#boardName')}).screenshot({path:path.join(output,label+'-板卡缺项提示.png')});
      }
      // 板卡信息全空也不能绕过真实物料规格冲突及小电容硬性精度要求。
      for(const guard of [{id:'small-cap',comment:'6pF',code:'C700515',ref:'C1',reason:'精度'},{id:'resistance',comment:'10K',code:'C100001',ref:'R1',reason:'阻值'}]){
        await page.locator('#fileB').setInputFiles({name:'BOM.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:uploadBytes(guard.comment,guard.ref,'0402',guard.code)});
        await page.waitForFunction(model=>B&&B.rows[0]['型号']===model,guard.comment);
        await page.locator('#boardName').fill('');await page.locator('#boardModel').fill('');await page.locator('#boardErp').fill('');await page.locator('#boardVersion').fill('');
        await page.evaluate(()=>{testAlerts=[];testConfirms=[];});
        let downloaded=false;const onDownload=()=>{downloaded=true;};page.on('download',onDownload);
        await page.evaluate(()=>fmt('AB'));await page.waitForFunction(()=>!fmtBusy);
        page.off('download',onDownload);
        const issues=await page.evaluate(()=>OFFLINE_REVIEW_STATE.issues);
        assert(!downloaded,guard.id+' bypassed the technical guard');
        assert(issues.some(i=>i.kind==='hard'&&i.reason.includes(guard.reason)),JSON.stringify(issues));
        assert(await page.locator('#offlineReviewExport').isDisabled(),'Hard conflict allowed normal export');
        results.push({label,guard:guard.id,blocked:true});
      }
      assert.deepEqual(errors,[]);await page.close();console.log(label+': '+cases.length+' metadata export cases, workbook contents/styles, upload reset and 2 technical guards passed');
    }
    assert.equal(crypto.createHash('sha256').update(fs.readFileSync(templatePath)).digest('hex'),templateHash,'Source template changed');
    fs.writeFileSync(path.join(output,'board-metadata-results.json'),JSON.stringify({templateSha256:templateHash,results},null,2));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error.stack || error);server.close();process.exitCode=1;});
