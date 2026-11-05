const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const E = require('../v3-cloudbase/web/assets/bom-review-engine.js');
const X = require('../v3-cloudbase/web/assets/vendor/xlsx.full.min.js');
const headers = E.FIELDS;
function workbook(rows, details = [], records = []) {
  const wb = X.utils.book_new();
  X.utils.book_append_sheet(wb, X.utils.aoa_to_sheet([headers, ...rows.map(r => headers.map(h => r[h] ?? ''))]), '单板BOM');
  if (details.length || records.length) {
    const report = [['位号','型号','匹配等级','补齐字段','待核实事项','审查依据']];
    details.forEach(d => report.push([d.ref,d.model,'待核实','',(d.warnings || []).join('；'),'']));
    records.forEach(r => report.push(['','','确认记录','','',JSON.stringify(r)]));
    const sheet = X.utils.aoa_to_sheet(report); sheet['!cols'] = [{},{},{},{},{},{hidden:true}];
    X.utils.book_append_sheet(wb, sheet, '补齐报告');
  }
  return wb;
}
function doc(rows, context) { return E.readWorkbook(workbook(rows), X, {name:'evidence.xlsx',reviewContext:context}); }
function reportDoc(rows, details, records) {
  const bytes = X.write(workbook(rows, details, records), {type:'buffer',bookType:'xlsx'});
  return E.readWorkbook(X.read(bytes,{type:'buffer'}), X, {name:'saved-final.xlsx'});
}
function analyze(rows, source, context) { return E.analyze(doc(rows, context), source ? doc(source) : null, {}); }
function issues(result) { return result.checks.filter(c => ['pending','conflict'].includes(c.outcome)); }
function outcome(result, rule, expected) { assert(result.checks.some(c=>c.rule===rule&&c.outcome===expected), rule+' should be '+expected+'\n'+JSON.stringify(result.checks)); }
const c16={'位号':'C16','型号':'1nF','参数描述':'MLCC 1nF ±10% 2000V X7R SMD 1812','封装':'SC1812','数量':'1'};
const chip={'位号':'U1','型号':'CUSTOM-CHIP','参数描述':'收发芯片','封装':'QFN32','数量':'1','立创编号':'C10001'};
const cases=[];
function check(name, fn) { fn(); cases.push(name); }
check('pin header with repeated model and footprint needs a field-specific review', () => {
  const row = {'物料名称':'排针','位号':'J8','数量':'1','型号':'DPI_2_54_7P','封装':'DPI_2_54_7P'};
  const rule = 'PIN_HEADER_MODEL_FOOTPRINT';
  const result = analyze([row], [row]);
  const finding = result.checks.find(c => c.rule === rule);
  assert.equal(finding.outcome, 'pending');
  assert.equal(result.rowAudits[0].status, 'unverified');
  for (const field of ['型号','封装']) {
    assert(result.rowAudits[0].pendingFields.includes(field));
    assert(finding.cell.split('、').includes(doc([row]).rows[0].cells[field]));
  }
  for (const changes of [{'型号':'HDR-07'}, {'型号':'','封装':''}, {'物料名称':'收发芯片'}]) {
    assert(!analyze([{...row,...changes}]).checks.some(c => c.rule === rule));
  }
  outcome(analyze([{...row,'物料名称':'连接器','参数描述':'插针结构 1x7P','型号':' dpi_2_54_7p '}]), rule, 'pending');
  assert.equal(analyze([{...row,'数量':'2'}]).rowAudits[0].status, 'abnormal');
});
check('missing information is pending, not a definite conflict', () => {
  const r = analyze([{...c16,'数量':''}]);
  outcome(r,'MISSING_QUANTITY','pending'); assert.equal(r.auditCounts.abnormal,0);
  assert.equal(r.auditCounts.unverified,1); assert(r.rowAudits[0].pendingFields.includes('数量'));
});
check('purchase code conflict cannot disappear from row summary', () => {
  const r = analyze([chip],[{...chip,'立创编号':'C20002'}]);
  outcome(r,'SOURCE_CODE','conflict'); assert.equal(r.rowAudits[0].status,'abnormal');
  assert(r.rowAudits[0].finding.includes('编号')); assert(r.rowAudits[0].abnormalFields.includes('立创编号'));
});
check('unparsed manufacturer model does not hide strict small-cap rule', () => {
  for (const description of ['MLCC 6pF ±0.25pF 50V C0G SMD 0402','容量：6pF, 精度：±0.25pF, 额定电压：50V, 介质：C0G, 封装：0402']) {
    const r = analyze([{'位号':'C1','型号':'VENDOR-6P0','参数描述':description,'封装':'SC0402','数量':'1'}]);
    outcome(r,'SMALL_CAP_TOLERANCE','conflict'); assert.equal(r.auditCounts.abnormal,1);
    assert(r.rowAudits[0].uncovered.length,'Unparsed model coverage must be explicit');
  }
  assert(E.equal(E.specData('容量：100uF, 精度：±20%, 额定电压：50V').value,E.value('100uF')));
});
check('manufacturer naming difference is pending, not a fabricated error', () => {
  const r=analyze([chip],[{...chip,'型号':'CATALOG-CHIP'}]);
  outcome(r,'SOURCE_MODEL','pending'); outcome(r,'MODEL_EVIDENCE','pending');
  assert.equal(r.auditCounts.abnormal,0); assert.equal(r.auditCounts.unverified,1);
});
check('electrolytic description does not invent a ceramic dielectric requirement', () => {
  const electrolytic={'物料名称':'铝电解电容','位号':'C14','型号':'RVT1H101M0607','参数描述':'容量：100uF, 精度：±20%, 额定电压：50V, 电容体直径：6.3mm','封装':'RVT1H101M0607','数量':1};
  const r=analyze([electrolytic],[electrolytic]);
  assert(!r.checks.some(c=>c.rule==='PARAMETERS_MISSING'&&c.message.includes('介质')));
  assert(r.rowAudits[0].uncovered.some(s=>/型号|参数|官方/.test(s)),'Matching source text cannot prove electrical verification');
  const ceramic={...c16,'参数描述':'MLCC 1nF ±10% 2000V SMD 1812'};
  const rc=analyze([ceramic]);assert(rc.checks.some(c=>c.rule==='PARAMETERS_MISSING'&&c.message.includes('介质')));
});
const alias={...chip,'备注':'人工确认：型号对应关系待确认；处理=已核实型号对应关系，保留源型号及当前采购编号；确认时间=2026-11-04T10:00:00+08:00'};
const aliasSource=[{...chip,'型号':'CATALOG-CHIP'}];
function record(row, kind='model', extra={}) {
  return {schema:1,ref:row['位号'],model:row['型号'],signature:E.rowSignature(row),entries:[{kind,reason:'型号对应关系待确认',action:'已核实型号对应关系，保留源型号及当前采购编号',time:'2026-11-04T10:00:00+08:00',confirmed:true,resolved:true,note:row['备注']||'',fields:['型号'],source:{model:row['型号'],package:row['封装'],code:row['立创编号']},official:{model:'CATALOG-CHIP',package:'QFN32',code:'C10001'},...extra}]};
}
function sourceRecord(row, sourceRows=aliasSource, kind='model', extra={}) { return {...record(row,kind,extra),sourceSignature:E.sourceSignature(doc(sourceRows),row['位号'])}; }
check('structured current-row confirmation resolves legacy pending words', () => {
  const r=analyze([alias],aliasSource,{details:[],records:[sourceRecord(alias)]});
  assert.equal(r.rowAudits[0].status,'confirmed',r.rowAudits[0].finding);
  assert.equal(r.auditCounts.confirmed,1); assert.equal(r.auditCounts.unverified,0);
  assert(r.rowAudits[0].checks.some(c=>c.outcome==='confirmed'));
  assert(!issues(r).some(c=>c.rule==='PENDING_NOTE'));
});
check('plain note alone is not accepted as a signed current-row confirmation', () => {
  const r=analyze([alias],[{...chip,'型号':'CATALOG-CHIP'}]);
  assert.notEqual(r.rowAudits[0].status,'confirmed'); assert.equal(r.auditCounts.unverified,1);
});
check('edits invalidate current BOM confirmation', () => {
  for(const [field,value] of [['型号','NEW-CHIP'],['封装','QFN48'],['参数描述','新规格'],['位号','U2'],['数量','2'],['立创编号','C10003']]) {
    const edited={...alias,[field]:value};
    const r=analyze([edited],null,{records:[record(alias)],details:[]});
    assert(!r.rowAudits[0].checks.some(c=>c.outcome==='confirmed'),'Stale confirmation survived '+field);
    assert.notEqual(r.rowAudits[0].status,'confirmed');
  }
});
check('confirmation never waives a physical or electrical conflict', () => {
  const cap={'位号':'C1','型号':'VENDOR-6P0','参数描述':'MLCC 6pF ±0.25pF 50V C0G SMD 0402','封装':'SC0201','数量':'1'};
  const r=analyze([cap],null,{records:[record(cap)],details:[]});
  outcome(r,'SMALL_CAP_TOLERANCE','conflict'); outcome(r,'PACKAGE_CONFLICT','conflict');
  assert.equal(r.auditCounts.abnormal,1);
  const differentCode=[{...chip,'立创编号':'C20002'}];
  const codeConflict=analyze([alias],differentCode,{records:[sourceRecord(alias,differentCode)],details:[]});
  outcome(codeConflict,'SOURCE_CODE','conflict');assert.equal(codeConflict.auditCounts.abnormal,1);
});
check('package alias can be resolved within the signed row only', () => {
  const custom={...c16,'封装':'CUSTOM-1812-PAD'};
  // A footprint that exposes 1812 is already equivalent; use a purely named alias.
  custom['封装']='CUSTOM-CAP-PAD';
  const r=analyze([custom],[c16],{records:[sourceRecord(custom,[c16],'package',{reason:'自定义焊盘别名待确认',fields:['封装'],action:'已核对焊盘与1812尺寸一致'})],details:[]});
  assert.equal(r.auditCounts.abnormal,0);assert.equal(r.auditCounts.unverified,0);assert.equal(r.auditCounts.confirmed,1);
  assert(r.checks.some(c=>c.rule==='SOURCE_PACKAGE'&&c.outcome==='confirmed'));
});
check('procurement source confirmation cannot approve manufacturer model identity', () => {
  const r=analyze([alias],aliasSource,{records:[sourceRecord(alias,aliasSource,'source',{fields:['立创编号'],reason:'邮寄来源已确认'})],details:[]});
  assert.equal(r.auditCounts.unverified,1);outcome(r,'MODEL_EVIDENCE','pending');
});
check('model confirmation does not erase an independent unresolved report item', () => {
  const r=analyze([alias],aliasSource,{records:[sourceRecord(alias)],details:[{ref:'U1',model:'CUSTOM-CHIP',warnings:['工作电压尚缺数据手册核实']} ]});
  assert.equal(r.auditCounts.unverified,1);assert(r.rowAudits[0].finding.includes('工作电压尚缺数据手册核实'));
  const extraNote={...alias,'备注':alias['备注']+'；独立事项：工作电压待核实'};
  const r2=analyze([extraNote],aliasSource,{records:[sourceRecord(alias)],details:[]});
  assert.equal(r2.auditCounts.unverified,1);assert(r2.rowAudits[0].finding.includes('工作电压待核实'));
});
check('independent pending note survives alongside a different supplement warning', () => {
  const pending={...c16,'备注':'额定温度待核实'};
  const r=analyze([pending],null,{records:[],details:[{ref:'C16',model:'1nF',warnings:['缺寿命测试依据']} ]});
  outcome(r,'PENDING_NOTE','pending');outcome(r,'SUPPLEMENT_PENDING','pending');
  assert(r.rowAudits[0].finding.includes('额定温度待核实'));
  assert(r.rowAudits[0].finding.includes('缺寿命测试依据'));
});
check('permission to export missing parameters is not technical verification', () => {
  const missing={...c16,'参数描述':'MLCC 1nF ±10% 2000V SMD 1812','备注':'参数待核实（详见补齐报告）'};
  const r=analyze([missing],null,{records:[record(missing,'parameters',{resolved:false,fields:['介质'],action:'缺失参数留空，标记待核实'})],details:[{ref:'C16',model:'1nF',warnings:['介质未取得官方依据；人工允许留空导出']} ]});
  assert.equal(r.auditCounts.unverified,1); outcome(r,'PARAMETERS_MISSING','pending');
  assert(r.rowAudits[0].finding.includes('介质')); assert.notEqual(r.rowAudits[0].status,'confirmed');
});
check('saved workbook carries specific report warnings and row-bound confirmations', () => {
  const pending={...c16,'备注':'参数待核实（详见补齐报告）'};
  const d=reportDoc([pending,alias],[{ref:'C16',model:'1nF',warnings:['额定电压虽已填入2000V，尚缺供应商规格书核实']}],[sourceRecord(alias)]);
  const r=E.analyze(d,doc([c16,{...chip,'型号':'CATALOG-CHIP'}]),{});
  assert(r.rowAudits[0].finding.includes('尚缺供应商规格书核实'));
  assert.equal(r.rowAudits[1].status,'confirmed');
  const changed=reportDoc([{...pending,'型号':'2nF'}],[{ref:'C16',model:'1nF',warnings:['此旧型号警告不应套用']}],[]);
  assert(!E.analyze(changed,null,{}).rowAudits[0].finding.includes('此旧型号警告不应套用'));
});
check('changing source identity or specifications invalidates an unchanged target-row confirmation', () => {
  const records=[sourceRecord(alias)];
  const unchanged=analyze([alias],aliasSource,{records,details:[]});assert.equal(unchanged.auditCounts.confirmed,1);
  for(const [field,value] of [['型号','ANOTHER-CATALOG-CHIP'],['封装','CUSTOM-NEW-PAD'],['参数描述','不同额定电压与工作频率'],['立创编号','C10003']]) {
    const changedSource=[{...aliasSource[0],[field]:value}];
    const r=analyze([alias],changedSource,{records,details:[]});
    assert.equal(r.auditCounts.confirmed,0,'Old confirmation survived changed source '+field);
    assert(!r.checks.some(c=>c.outcome==='confirmed'),'Old check confirmation survived changed source '+field);
    outcome(r,'CONFIRMATION_STALE','pending');
  }
  const saved=reportDoc([alias],[],records);
  const reread=E.analyze(saved,doc([{...aliasSource[0],'型号':'ANOTHER-CATALOG-CHIP'}]),{});
  assert.equal(reread.auditCounts.confirmed,0,'Workbook record survived a different source upload');
});
check('source comparison requires a bound source signature while source-free review retains row scope', () => {
  const unbound={records:[record(alias)],details:[]};
  const withSource=analyze([alias],aliasSource,unbound);
  assert.equal(withSource.auditCounts.confirmed,0,'Record without source signature was accepted against a source');
  assert(!withSource.checks.some(c=>c.outcome==='confirmed'));
  const noSource=analyze([alias],null,unbound);assert.equal(noSource.auditCounts.confirmed,1);
});
check('all checks survive mixed conflict and pending row with transparent coverage', () => {
  const r=analyze([{...c16,'参数描述':'MLCC 1nF ±10% 2000V SMD 0402'}]);
  const a=r.rowAudits[0]; assert.equal(a.status,'abnormal');
  assert(a.checks.some(c=>c.outcome==='pending')&&a.checks.some(c=>c.outcome==='conflict')&&a.checks.some(c=>c.outcome==='passed'));
  assert(a.pendingFields.length&&a.checkedFields.length);
});
check('file scope issues are counted separately from mutually exclusive material rows', () => {
  const r=analyze([c16],[c16,{...chip,'位号':'U2'}]);
  assert.equal(r.auditCounts.total,1);
  assert.equal(r.auditCounts.normal+r.auditCounts.confirmed+r.auditCounts.unverified+r.auditCounts.abnormal,1);
  assert(r.fileCounts.abnormal+r.fileCounts.unverified>0); assert(r.auditRows.some(a=>a.scope==='file'));
});
check('actual conversion builder preserves separate evidence for same-ref model main and alternative rows', () => {
  const sourceRows=[{...chip,'型号':'CATALOG-CHIP','备注':'主料'}];
  const rawMain={...chip,'备注':'主料'},rawAlternative={...chip,'备注':'替代料；参数待核实（详见补齐报告）'};
  const B={rows:[rawMain,rawAlternative],_reviewWorkbook:workbook(sourceRows)};
  const sandbox={window:{BOMReview:E},B,XLSX:X,normLcsc:v=>String(v||'').trim().toUpperCase()};
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../v3-cloudbase/web/assets/offline-review.js'),'utf8'),sandbox);
  const issue={key:'main-alias',sourceIndex:0,kind:'model',reason:'型号对应关系待确认',fields:['型号'],model:'CUSTOM-CHIP',package:'QFN32',lcsc:'C10001',official:{productModel:'CATALOG-CHIP',package:'QFN32',productCode:'C10001'}};
  const options={issues:[issue],draft:false};
  sandbox.OFFLINE_REVIEW_STATE.decisions[issue.key]={owner:B,signature:sandbox.offlineReviewSourceSignature(rawMain),action:'已核实主料型号对应关系',time:'2026-11-04T10:00:00+08:00'};
  const note=sandbox.offlineReviewDecisionNote(issue,options);
  const main={...rawMain,'备注':'主料；'+note}, alternative={...rawAlternative};
  const details=[{sourceIndex:0,ref:'U1',model:'CUSTOM-CHIP',level:'confirmed',filled:[],warnings:[note]},{sourceIndex:1,ref:'U1',model:'CUSTOM-CHIP',level:'review',filled:[],warnings:['替代料缺寿命测试依据']}];
  const rows=[main,alternative];
  const context=JSON.parse(JSON.stringify(sandbox.buildOfflineAuditContext(headers,rows.map(r=>headers.map(h=>r[h]??'')),options,details)));
  assert.equal(context.records.length,2,'Same-ref rows overwrote each other');
  assert.notEqual(context.records[0].signature,context.records[1].signature,'Remarks must participate in row binding');
  assert.equal(context.records[0].signature,E.rowSignature(main));assert.equal(context.records[1].signature,E.rowSignature(alternative));
  assert.equal(details[0].reviewEvidence.signature,context.records[0].signature);assert.equal(details[1].reviewEvidence.signature,context.records[1].signature);
  assert(context.records[0].details.every(d=>!d.warnings.includes('替代料缺寿命测试依据')));
  assert(context.records[1].details.some(d=>d.warnings.includes('替代料缺寿命测试依据')));
  function assertIsolated(r,label){
    assert.equal(r.rowAudits[0].status,'confirmed',label+' main confirmation lost');
    assert(!r.rowAudits[0].finding.includes('替代料缺寿命测试依据'),label+' alternative warning leaked to main');
    assert.equal(r.rowAudits[1].status,'unverified',label+' alternative warning missing');
    assert(r.rowAudits[1].finding.includes('替代料缺寿命测试依据'));
    assert(!r.rowAudits[1].checks.some(c=>c.outcome==='confirmed'),label+' main confirmation leaked to alternative');
    assert(!r.checks.some(c=>c.rule==='CONFIRMATION_STALE'),label+' separate valid record was falsely marked stale');
    assert(!r.checks.some(c=>c.rule==='DUPLICATE_MAIN_REF'),label+' alternative was treated as a second main');
  }
  assertIsolated(analyze(rows,sourceRows,context),'in-memory');
  const saved=reportDoc(rows,context.details,context.records);
  assertIsolated(E.analyze(saved,doc(sourceRows),{}),'saved workbook');
});
const out=process.env.BOM_REVIEW_OUTPUT;
if(out){assert(/^D:[\\/]/i.test(out),'Evidence output must stay on D:');fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'review-evidence-results.json'),JSON.stringify({passed:cases.length,cases},null,2));}
console.log('PASS: '+cases.length+' independent review evidence cases');
