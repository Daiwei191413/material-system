const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
let playwright;
try { playwright = require('playwright-core'); }
catch (_) { playwright = require(path.join(process.env.USERPROFILE || '', '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core')); }
const edge = [process.env.EDGE_PATH, path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe')].filter(Boolean).find(file => fs.existsSync(file));
assert(edge, 'Microsoft Edge is required');

(async () => {
  const browser = await playwright.chromium.launch({ headless:true, executablePath:edge });
  try {
    for (const relative of ['v3-cloudbase/web/index.html', 'v3-legacy/index.html']) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.route('**/*', route => route.request().url().startsWith('file:') ? route.continue() : route.abort());
      await page.goto(pathToFileURL(path.resolve(__dirname, '..', relative)).href, {waitUntil:'domcontentloaded'});
      const result = await page.evaluate(() => {
        function check(value, message) { if (!value) throw new Error(message); }
        const cases = [
          ['C18','0R','SC0201','C106228','厚膜电阻 0Ω ±1% 50mW SMD 0201','厚膜电阻 0Ω,精度：±1%,50mW,SMD 0201','0R','0201'],
          ['C23','5.6pF','SC0402','C161329','MLCC 5.6pF ±0.1pF 50V C0G SMD 0402','MLCC 5.6pF ±0.1pF 50V C0G SMD 0402','5.6pF','0402'],
          ['C37,C70,C74','22uF','SC0603','C29519229','MLCC 22uF ±20% 25V X5R SMD 0603','MLCC 22uF ±20% 25V X5R SMD 0603','22uF','0603'],
          ['R1,R44,R47,R50','10K','SR0201','C106225','厚膜电阻 10KΩ ±1% 50mW SMD 0201','厚膜电阻 10KΩ,精度：±1%,50mW,SMD 0201','10K','0201'],
          ['R2,R3','22R','SR0201','C155743','厚膜电阻 22Ω ±1% 50mW SMD 0201','厚膜电阻 22Ω,精度：±1%,50mW,SMD 0201','22','0201'],
          ['R20,R21','1K','SR0201','C131396','厚膜电阻 1KΩ ±1% 50mW SMD 0201','厚膜电阻 1KΩ,精度：±1%,50mW,SMD 0201','1K','0201'],
        ];
        const dirtyLibrary = [
          {model:'0R',package:'SL0402',lcsc_code:'C17168',specification:'厚膜电阻 0Ω ±1% 1/16W SMD 0402'},
          {model:'5.6pF SC0201',package:'SC0201',specification:'MLCC 5.6pF ±0.1pF 50V C0G SMD 0201'},
          {model:'22uF',package:'SC0603',specification:'MLCC 22F ±20% 10V X5R SMD 0603'},
          {model:'10K SR0201',package:'SR0201',specification:'厚膜电阻 10KΩ,精度：±1%,SMD 0402'},
          {model:'22R',package:'SR0402',lcsc_code:'C25092',specification:'厚膜电阻 22Ω ±1% 1/16W SMD 0402'},
          {model:'1K SR0201',package:'SR0201',specification:'厚膜电阻 1KΩ,精度：±1%,SMD 0402'},
        ];
        const source = cases.map(([ref,model,pkg,code,inputSpec]) => ({'位号':ref,'型号':model,'封装':pkg,'立创编号':code,'数量':'1','参数描述':inputSpec,_specWarnings:['已有核查记录']}));
        const fields = ['位号','型号','封装','立创编号','数量','物料名称','参数描述','品牌','备注'];
        window.A = {hd:fields, fm:Object.fromEntries(fields.map(field=>[field,field])),rows:[],_raw:new Uint8Array([1])};
        window.B = {rows:source};
        window.materialDB_standard = dirtyLibrary;
        window.setActiveLib('standard');
        const libraryBefore = JSON.stringify(dirtyLibrary);
        const sourceBefore = JSON.stringify(source);
        const captures = [];
        window.alert = () => {};
        window.JSZip = function(){};
        window.patchAndDownloadXlsx = (raw, rows, enrichStats, enrichDetails, dl, tl, hd) => {
          const report = [['位号','型号','匹配等级','补齐字段','待核实事项']];
          enrichDetails.forEach(item => report.push([item.ref,item.model,item.level,(item.filled||[]).join(' / '),(item.warnings||[]).join('；')]));
          captures.push({Sheets:{'整理后BOM':{rows:[hd].concat(rows)},'补齐报告':{rows:report}}});
          return Promise.resolve();
        };
        window.XLSX = {
          utils:{book_new:()=>({Sheets:{}}),aoa_to_sheet:rows=>({rows}),book_append_sheet:(wb,sheet,name)=>{wb.Sheets[name]=sheet;}},
          writeFile:workbook=>captures.push(workbook),
        };
        fmtCore('AB');
        const output = captures[0].Sheets['整理后BOM'].rows;
        const report = captures[0].Sheets['补齐报告'].rows;
        cases.forEach(([ref,model,pkg,code,inputSpec,expected,expectedModel,expectedPackage])=>{
          const raw = output.find(row=>row[0]===ref);
          check(raw && raw[6]===expected, ref+': wrong specification '+JSON.stringify(raw));
          check(raw[1]===expectedModel && raw[2]===expectedPackage && raw[3]===code, ref+': 1931 identity normalization failed');
          check(String(raw[8]).includes('待核实'), ref+': missing review note');
          check(report.some(row=>row[0]===ref && row[4]), ref+': missing review report');
        });
        check(JSON.stringify(source)===sourceBefore,'Export mutated B rows');
        check(JSON.stringify(dirtyLibrary)===libraryBefore,'Export mutated the standard library');

        const resistor = {'型号':'10K','封装':'SR0201','立创编号':'C106225'};
        const correct = {model:'10K',package:'0201',lcsc_code:'C106225',name:'厚膜电阻',brand:'Verified brand',specification:'厚膜电阻 10KΩ ±1% 50mW SMD 0201'};
        window.materialDB_standard = [correct]; setActiveLib('standard');
        check(matchForStandard(resistor).level===1,'Correct exact-code match rejected');
        const enriched = enrichRow({...resistor},correct);
        check(enriched['参数描述']===correct.specification && enriched['品牌']==='Verified brand','Verified metadata lost');
        check(passiveSpecErrors({'型号':'100nF','封装':'SC0402'},'MLCC 0.1uF ±10% 16V X7R SMD 0402').length===0,'Equivalent capacitor units rejected');
        check(passiveSpecErrors({'型号':'2K2','封装':'SR0201'},'厚膜电阻 2.2KΩ ±1% SMD 0201').length===0,'Compact resistance rejected');
        check(passiveSpecErrors({'型号':'10K','封装':'SR0201'},'厚膜电阻 10 kΩ ±1% SMD 0201').length===0,'Spaced resistance unit rejected');
        check(passiveIdentity({'型号':'0 Ω','封装':'0201'}).type==='resistor','Explicit ohm unit not recognized');
        check(autoDescribe('22µF','SC0603').specification==='电容 22uF SMD 0603','Micro sign normalization failed');
        check(normalizeValue('22000000pF','SC0603')==='22uF','Large pF capacitance was not converted to uF');
        check(normalizeValue('1000pF','SC0201')==='1nF','Equivalent 1nF value was not normalized');
        check(normalizeValue('470pF','SC0201')==='470pF','Readable pF value was changed unnecessarily');
        check(normalizeCapacitanceSpec('MLCC 22000000pF ±20% 25V X5R SMD 0603')==='MLCC 22uF ±20% 25V X5R SMD 0603','Compact MLCC capacitance was not normalized');
        check(normalizeCapacitanceSpec('MLCC 5.6pF ±0.1pF 50V C0G SMD 0402')==='MLCC 5.6pF ±0.1pF 50V C0G SMD 0402','Tolerance value was rewritten as capacitance');
        check(normalizeResistanceDisplay('10000Ω')==='10KΩ','Expanded 10K resistance was not normalized');
        check(normalizeResistanceDisplay('75000mΩ')==='75Ω','Expanded 75R resistance was not normalized');
        check(normalizeResistanceDisplay('2K2')==='2.2KΩ','Compact resistance display was not normalized');
        check(normalizeResistanceDisplay('500mΩ')==='500mΩ','Sub-ohm resistance lost the mΩ display');
        check(normalizeResistanceSpec('厚膜电阻,10000Ω,精度：±1%,1/16W,SMD,0402')==='厚膜电阻,10KΩ,精度：±1%,1/16W,SMD,0402','Existing resistor specification kept expanded ohms');
        check(toAStyleSpec('厚膜电阻 75000mΩ ±1% 1/16W SMD 0402',{'型号':'75R','封装':'SR0402','物料名称':'贴片电阻'})==='厚膜电阻 75Ω ±1% 1/16W SMD 0402','Preformatted resistor bypassed display normalization');
        check(toAStyleSpec('MLCC 1000pF ±10% 25V X7R SMD 0201',{'型号':'1nF','封装':'SC0201','物料名称':'贴片电容'})==='MLCC 1nF ±10% 25V X7R SMD 0201','Existing MLCC specification bypassed capacitance normalization');
        check(autoDescribe('1R5','SR0201').specification==='电阻 1.5Ω SMD 0201','Compact fractional resistance failed');
        check(autoDescribe('0','SR0201').specification==='电阻 0Ω SMD 0201','Numeric zero lost');
        check(passiveIdentity({'型号':'100','封装':'QFN32','物料名称':'芯片'})===null,'Numeric IC model misclassified as resistor');
        check(passiveIdentity({'型号':'220','封装':'SL0402','物料名称':'电感'})===null,'Unitless inductor misclassified as resistor');
        check(passiveMissingParams({...resistor,'参数描述':'厚膜电阻 10KΩ ±1% SMD 0201'}).join() === '功率','Partial official data was marked complete');
        const suspicious = [
          {...correct,package:'0402'},
          {...correct,specification:'厚膜电阻 1KΩ ±1% 50mW SMD 0201'},
          {...correct,lcsc_code:'C900001'},
          {...correct,model:'100K'},
        ];
        suspicious.forEach((candidate,index)=>{
          materialDB_standard=[candidate];setActiveLib('standard');
          check(!matchForStandard(resistor).hit,'Conflicting candidate accepted: '+index);
        });
        materialDB_standard=[{model:'10K',package:'0201',specification:'厚膜电阻 10KΩ ±1% 50mW SMD 0201'}];setActiveLib('standard');
        const generic = enrichRow({...resistor},matchForStandard(resistor).hit);
        check(generic['参数描述']==='电阻 10KΩ SMD 0201','Unverified SKU supplied ratings');
        check(!generic['品牌'] && !generic['物料编码'],'Unverified SKU supplied identity metadata');
        check(!matchForStandard({'型号':'10K'}).hit,'Package-free passive match accepted');

        const corrupted = {...resistor,'参数描述':'厚膜电阻 10KΩ ±1% 1/16W SMD 0402'};
        check(toAStyleSpec(corrupted['参数描述'],corrupted)==='电阻 10KΩ SMD 0201','Preformatted bad spec bypassed validation');
        const item={row:corrupted};
        const official={hit:true,productCode:'C106225',productModel:'RC0201-10K',productType:'贴片电阻',package:'0201',brand:'Verified brand',_extracted:{resistance:'10kΩ',tolerance:'±1%',power:'50mW'}};
        check(applyLcscToRow(item,official),'Verified API correction rejected');
        check(corrupted['参数描述'].includes('50mW') && !corrupted['参数描述'].includes('0402'),'Verified API failed to replace bad text');
        const immutable={...resistor,'参数描述':'电阻 10KΩ SMD 0201'};
        check(!applyLcscToRow({row:immutable},{...official,package:'0402',brand:'Wrong brand'}),'Conflicting API package accepted');
        check(immutable['参数描述']==='电阻 10KΩ SMD 0201' && !immutable['品牌'],'Rejected API partially mutated the row');
        check(buildSpecFromExtracted({capacitance:'5.6pF',dielectric:'C0G'},'电容','0402')==='MLCC 5.6pF ±0.1pF C0G SMD 0402','Company small-cap tolerance was not applied');
        check(toAStyleSpec('MLCC 9pF ±1% 50V C0G SMD 0402',{'型号':'9pF','封装':'SC0402','物料名称':'贴片电容'})==='MLCC 9pF ±0.1pF 50V C0G SMD 0402','Small-cap percentage tolerance was not normalized');
        check(buildSpecFromExtracted({capacitance:'10pF',tolerance:'±1%',voltage:'50V',dielectric:'C0G'},'电容','0402')==='MLCC 10pF ±1% 50V C0G SMD 0402','10pF boundary was incorrectly forced to company tolerance');
        check(buildSpecFromExtracted({capacitance:'12pF',tolerance:'±5%',voltage:'50V',dielectric:'C0G'},'电容','0201')==='MLCC 12pF ±5% 50V C0G SMD 0201','Above-10pF tolerance was changed');
        const smallCapRow={'型号':'6pF','封装':'SC0402','立创编号':'C700515','物料名称':'贴片电容'};
        const badSmallCap={hit:true,productCode:'C700515',productModel:'CC0402CRNPO9BN6R0',productName:'±0.25pF 6pF 50V',productType:'贴片电容(MLCC)',package:'0402',_extracted:{capacitance:'6pF',tolerance:'±0.25pF',voltage:'50V',dielectric:'NP0'}};
        check(officialPassiveErrors(smallCapRow,badSmallCap).some(error=>error.includes('实际精度为±0.25pF')),'Noncompliant small capacitor was not rejected');
        const goodBoundary={...badSmallCap,productCode:'C782046',productName:'±1% 10pF 50V',_extracted:{capacitance:'10pF',tolerance:'±1%',voltage:'50V',dielectric:'C0G'}};
        check(!companySmallCapToleranceError({'型号':'10pF','封装':'SC0402','立创编号':'C782046','物料名称':'贴片电容'},goodBoundary),'10pF part incorrectly received company rule');
        check(companySmallCapToleranceError(smallCapRow,{...badSmallCap,productName:'6pF ±2% 50V',_extracted:{capacitance:'6pF',tolerance:'±2%',voltage:'50V',dielectric:'NP0'}}).includes('实际精度为±2%'),'Percentage tolerance was accepted below 10pF');
        check(companySmallCapToleranceError(smallCapRow,{...badSmallCap,productName:'6pF ±0.05pF 50V',_extracted:{capacitance:'6pF',tolerance:'±0.05pF',voltage:'50V',dielectric:'NP0'}}).includes('实际精度为±0.05pF'),'Different absolute tolerance was accepted below 10pF');
        check(companySmallCapToleranceError(smallCapRow,{...badSmallCap,productName:'6pF 50V',remark:'',specification:'',_extracted:{capacitance:'6pF',tolerance:'',voltage:'50V',dielectric:'NP0'}}).includes('未提供可核验精度'),'Missing small-cap tolerance was allowed');
        check(buildSpecFromExtracted({capacitance:'22000000pF',tolerance:'±20%',voltage:'25V',dielectric:'X5R'},'贴片电容','0603')==='MLCC 22uF ±20% 25V X5R SMD 0603','Extracted capacitance was copied without readable unit normalization');
        check(buildSpecFromExtracted({resistance:'10000Ω',tolerance:'±1%',power:'1/16W'},'贴片电阻','0402')==='厚膜电阻,10KΩ,精度：±1%,1/16W,SMD,0402','Extracted 10K resistance kept expanded ohms');
        check(buildSpecFromExtracted({resistance:'75000mΩ',tolerance:'±1%',power:'1/16W'},'贴片电阻','0402')==='厚膜电阻,75Ω,精度：±1%,1/16W,SMD,0402','Extracted 75R resistance kept expanded milliohms');
        const officialCapRow={'型号':'22uF','封装':'SC0603','立创编号':'C29519229','物料名称':'贴片电容','参数描述':'电容 22uF SMD 0603'};
        check(applyLcscToRow({row:officialCapRow},{hit:true,productCode:'C29519229',productModel:'22uF',productType:'贴片电容',package:'0603',_extracted:{capacitance:'22000000pF',tolerance:'±20%',voltage:'25V',dielectric:'X5R'}}),'Valid capacitor query result was rejected');
        check(officialCapRow['参数描述']==='MLCC 22uF ±20% 25V X5R SMD 0603','Applied capacitor query kept the oversized pF display');
        check(passiveNeedsVerification(resistor,{model:'10K',package:'0201'}),'Generic library hit hid verification action');
        check(!passiveNeedsVerification({...resistor,'参数描述':'厚膜电阻 10KΩ ±1% 50mW SMD 0201'},correct),'Complete exact-code data requested verification again');
        materialDB_standard=[];setActiveLib('standard');
        fmtCore('AB');
        check(captures[1].Sheets['补齐报告'],'Empty library suppressed the review report');
        const manual={...resistor,'位号':'R1','参数描述':'电阻 10KΩ SMD 0201'};
        B={rows:[manual]};
        MM_RESULT=[{row:manual}];
        document.getElementById('pasteDlg').dataset.idx='0';
        document.getElementById('pdName').value='贴片电阻';
        document.getElementById('pdSpec').value='厚膜电阻 10KΩ ±1% 50mW SMD 0201';
        document.getElementById('pdBrand').value='Verified brand';
        pdApply();
        check(manual['参数描述'].includes('50mW'),'Manual verified parameters could not replace basic text');
        MM_RESULT=[{row:manual}];
        document.getElementById('pdSpec').value='厚膜电阻 10KΩ ±1% 50mW SMD 0402';
        pdApply();
        check(!manual['参数描述'].includes('0402'),'Manual conflicting parameters were accepted');
        return {groups:cases.length, rows:output.length-1};
      });
      assert.strictEqual(result.groups,6);
      console.log(relative+': six reported groups and passive identity/specification guards passed');
      await context.close();
    }
  } finally { await browser.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
