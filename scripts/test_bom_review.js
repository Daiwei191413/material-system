const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const E=require('../v3-cloudbase/web/assets/bom-review-engine.js');
const X=require('../v3-cloudbase/web/assets/vendor/xlsx.full.min.js');
const headers=['物料编码','物料名称','型号','参数描述','封装','位号','数量','单位','备注','DNP','上板'];
function doc(rows,name='sample.xlsx'){
  const wb=X.utils.book_new();X.utils.book_append_sheet(wb,X.utils.aoa_to_sheet([headers,...rows.map(r=>headers.map(h=>r[h]??''))]),'BOM');
  return E.readWorkbook(wb,X,{name});
}
function row(ref='C18',model='0R',pkg='SC0201',spec='电阻 0Ω SMD 0201') {return {'位号':ref,'型号':model,'封装':pkg,'参数描述':spec,'数量':'1'};}
function has(result,rule,status){return result.checks.some(c=>c.rule===rule&&(!status||status===c.status));}
let r=E.analyze(doc([row()]));
assert(!has(r,'TYPE_CONFLICT'));assert(!has(r,'PACKAGE_CONFLICT'));assert(has(r,'PARAMETERS_MISSING','pending'));
for(const [ref,model,pkg,spec,rule] of [
  ['C18','0R','SC0201','电阻 0Ω SMD 0402','PACKAGE_CONFLICT'],
  ['C23','5.6pF SC0402','SC0402','MLCC 5.6pF SMD 0201','PACKAGE_CONFLICT'],
  ['C37,C70,C74','22uF','SC0603','MLCC 22F SMD 0603','VALUE_CONFLICT'],
  ['R1','10K','SR0201','电阻 10KΩ SMD 0402','PACKAGE_CONFLICT'],
  ['R2','22R','SR0201','电阻 22Ω SMD 0402','PACKAGE_CONFLICT'],
  ['R20','1K','SR0201','电阻 1KΩ SMD 0402','PACKAGE_CONFLICT']
]) assert(has(E.analyze(doc([row(ref,model,pkg,spec)])),rule,'error'),ref);
assert(E.equal(E.value('100nF'),E.value('0.1uF')));assert(E.equal(E.value('2K2'),E.value('2.2kΩ')));
assert.equal(E.value('10mΩ').number,.01);assert.equal(E.value('10MΩ').number,1e7);
assert(!E.equal(E.value('22F'),E.value('22uF')));
let blank=row('R1');blank['数量']='';let d=doc([blank]);assert.equal(d.rows[0].values['数量'],'');assert(has(E.analyze(d),'MISSING_QUANTITY','pending'));
let zero=row('R1');zero['数量']=0;d=doc([zero]);assert.equal(d.rows[0].values['数量'],'0');assert(has(E.analyze(d),'QUANTITY_REF','error'));
assert(has(E.analyze(doc([row('R1'),row('R1')])),'DUPLICATE_MAIN_REF','error'));
let alt={...row('R1'),'备注':'替代料'};assert(!has(E.analyze(doc([row('R1'),alt])),'DUPLICATE_MAIN_REF'));
assert(has(E.analyze(doc([row('R1'),row('')])),'MISSING_REF','pending'));
assert(!has(E.analyze(doc([{'物料名称':'PCB','型号':'TP1234','数量':'1'}])),'MISSING_REF'));
assert(has(E.analyze(doc([row('C1','5pF','SC0402','MLCC 5pF ±2% 50V C0G SMD 0402')])),'SMALL_CAP_TOLERANCE','error'));
assert(has(E.analyze(doc([row('C1','5pF','SC0402','MLCC 5pF ±0.05pF 50V C0G SMD 0402')])),'SMALL_CAP_TOLERANCE','error'));
assert(!has(E.analyze(doc([row('C1','5pF','SC0402','MLCC 5pF ±0.1pF 50V C0G SMD 0402')])),'SMALL_CAP_TOLERANCE'));
assert(!has(E.analyze(doc([row('C1','10pF','SC0402','MLCC 10pF ±5% 50V C0G SMD 0402')])),'SMALL_CAP_TOLERANCE'));
for(const [header,value,excluded] of [['DNP','Y',true],['上板','Y',false],['上板','上板',false],['DNP','不上板',true],['上板','否',true]]) {
 const x=doc([{...row('R1'),[header]:value}]);assert.equal(E.assembly(x.rows[0]).excluded,excluded,header+value);
}
assert(!E.assembly(doc([row('U1','NC7WZ14','SOT-353','逻辑芯片')]).rows[0]).excluded);
assert(E.assembly(doc([row('R1','1K/NC')]).rows[0]).excluded);
assert(has(E.analyze(doc([{...row('R1','NC'),'上板':'Y'}])),'ASSEMBLY_CONFLICT','error'));
let before=doc([row()]), source=doc([row('C18','100nF','SC0201','电容 100nF SMD 0201')]);
const copy=JSON.stringify(before);assert(has(E.analyze(before,source),'SOURCE_VALUE','warning'));
assert(has(E.analyze(before,source,{actuals:[{refs:'C18',model:'0R',package:'0201',reason:'调试改装'}]}),'SOURCE_VALUE','matched'));
assert.equal(JSON.stringify(before),copy);
assert(has(E.analyze(doc([row('R1,R2')]),doc([row('R1,R2','100K')]),{actuals:[{refs:'R1',model:'0R',package:'0201',reason:'改装'}]}),'SOURCE_VALUE','warning'),'Partial declaration must not cover full row');
const sparse={SheetNames:['BOM'],Sheets:{BOM:{'!ref':'A5:G6',A5:{t:'s',v:'型号'},B5:{t:'s',v:'封装'},C5:{t:'s',v:'位号'},D5:{t:'s',v:'数量'},A6:{t:'s',v:'0R'},B6:{t:'s',v:'SC0201'},C6:{t:'s',v:'C18'},D6:{t:'n',v:1}}}};
d=E.readWorkbook(sparse,X,{});assert.equal(d.headerRow,5);assert.equal(d.rows[0].row,6);assert.equal(d.rows[0].cells['型号'],'A6');
for(const name of ['bom-review-engine.js','bom-review-ui.js','bom-review.css'])assert.equal(fs.readFileSync(path.join(root,'v3-cloudbase/web/assets',name),'utf8'),fs.readFileSync(path.join(root,'v3-legacy/assets',name),'utf8'));
console.log('PASS: review rules, strict small-cap tolerance, original cells/quantities, six fault groups, actual assembly scope, DNP, parity');
