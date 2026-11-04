(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./bom-review-engine.js'));
  else root.BOMReviewEdit=factory(root.BOMReview);
})(typeof globalThis!=='undefined'?globalThis:this,function(E){
  'use strict';
  function clone(value){return JSON.parse(JSON.stringify(value));}
  function change(item,options,X){
    var doc=item.doc, keys=options.keys||[], merge=keys.length>1;
    if(!options.confirmed||!E.text(options.reviewer)||!E.text(options.reason))throw new Error('请填写确认人和修改依据，并勾选确认。');
    var rows=keys.map(function(key){return doc.rows.find(function(r){return r.key===key;});});
    if(!rows.length||rows.some(function(r){return !r;})||new Set(keys).size!==keys.length)throw new Error('原行已变化，请重新打开编辑。');
    var group;
    if(merge){
      group=E.analyze(doc,null,{roles:options.roles||{}}).duplicateGroups.find(function(g){return g.rows.length===keys.length&&g.rows.every(function(r){return keys.indexOf(r.key)>=0;});});
      if(!group||group.quantity===null)throw new Error('当前候选的位号或数量不可靠，请先修改原行并重新审查。');
    }
    var base=rows[0], values=options.values.map(E.text), headers=doc.headers.slice(), map=Object.assign({},doc.mapping);
    if(values.length!==headers.length)throw new Error('字段结构已变化，请重新打开编辑。');
    // Missing standard fields can be added explicitly; never overwrite an unrelated source column.
    Object.keys(options.additions||{}).forEach(function(field){
      var value=E.text(options.additions[field]);
      if(E.FIELDS.indexOf(field)<0||map[field]!=null||!value)return;
      map[field]=headers.length;headers.push(field);values.push(value);
    });
    function get(field){return map[field]==null?'':E.text(values[map[field]]);}
    if(merge&&(!get('型号')||!get('封装')))throw new Error('请填写型号和封装。');
    if(!['物料编码','物料名称','型号','参数描述','封装','位号'].some(get))throw new Error('至少保留一项物料识别信息，不能通过清空字段删除原行。');
    var parsed=E.refs(get('位号')), count=Number(get('数量').replace(/,/g,''));
    if((merge&&!parsed.values.length)||parsed.invalid.length||new Set(parsed.values).size!==parsed.values.length)throw new Error('位号为空、重复或无法识别，请修正。');
    if(merge&&(!get('数量')||!Number.isSafeInteger(count)||count<1||count!==parsed.values.length))throw new Error('数量必须为正整数，并与不重复位号数一致。');
    var candidateValues={},candidateFlags=[];Object.keys(map).forEach(function(f){candidateValues[f]=values[map[f]];});
    headers.forEach(function(h,c){if(E.ALIASES.DNP.some(function(a){return a.toLowerCase()===h.toLowerCase();})&&values[c])candidateFlags.push({header:h,value:values[c],cell:E.column(c)+base.row});});
    function candidateDoc(candidateRows){return {name:doc.name,hash:doc.hash,sheet:doc.sheet,headerRow:doc.headerRow,headers:headers,mapping:map,metadata:[],reviewContext:{records:[],details:[]},rows:candidateRows};}
    if(!merge){
      var single=E.analyze(candidateDoc([Object.assign({},base,{values:candidateValues,flags:candidateFlags})]),null,{roles:options.roles||{}});
      var badQuantity=single.checks.find(function(c){return c.outcome==='conflict'&&['INVALID_QUANTITY','QUANTITY_REF'].indexOf(c.rule)>=0;});
      if(badQuantity)throw new Error('数量需要修正：'+badQuantity.message);
    }
    if(merge&&(count!==group.quantity||JSON.stringify(parsed.values.slice().sort())!==JSON.stringify(group.refs.slice().sort())))throw new Error('归并不能丢失或增加位号，数量必须等于原行之和。');
    if(merge&&get('单位')&&!/^(PCS|PC|个|只|颗|件)$/i.test(get('单位')))throw new Error('归并数量必须使用计数单位，如PCS、个或颗。');
    if(merge){
      var identity=E.analyze(candidateDoc(rows.map(function(r,i){return i?r:Object.assign({},r,{values:candidateValues,flags:candidateFlags});})),null,{roles:options.roles||{}});
      if(!identity.duplicateGroups.some(function(g){return g.rows.length===rows.length;}))throw new Error('修改后的型号、封装或装配状态已不属于同一候选，请先修改原行后重新审查。');
    }
    var wb=clone(item.wb), sheet=wb.Sheets[doc.sheet], range=X.utils.decode_range(sheet['!ref']||'A1');
    // Do not silently destroy formulas or cells merged across several material rows.
    var touched=new Set(rows.map(function(r){return r.row-1;}));
    (sheet['!merges']||[]).forEach(function(m){if(m.e.r!==m.s.r&&Array.from(touched).some(function(r){return r>=m.s.r&&r<=m.e.r;}))throw new Error('这些行含跨行合并单元格，请在Excel中拆分后重新上传。');});
    function write(address,value,numeric){
      var old=sheet[address]||{};
      if(old.f)throw new Error('待修改单元格 '+address+' 含公式，请先在Excel确认计算结果。');
      var cell=clone(old);['v','w','f','F','h','r','l','c'].forEach(function(k){delete cell[k];});
      cell.t=numeric?'n':'s';cell.v=numeric?Number(value.replace(/,/g,'')):value;sheet[address]=cell;
    }
    headers.forEach(function(h,c){
      if(c>=doc.headers.length)write(E.column(c)+doc.headerRow,h,false);
      if(c>=doc.headers.length||E.text(base.raw[c])!==values[c])write(E.column(c)+base.row,values[c],c===map['数量']&&values[c]!=='');
    });
    rows.slice(1).forEach(function(r){
      for(var c=0;c<=range.e.c;c++){
        var address=E.column(c)+r.row, old=sheet[address];
        if(!old)continue;if(old.f)throw new Error('待归并原行 '+address+' 含公式，请先在Excel确认计算结果。');
        var cell=clone(old);['v','w','f','F','h','r','l','c'].forEach(function(k){delete cell[k];});cell.t='z';sheet[address]=cell;
      }
      sheet['!rows']=sheet['!rows']||[];sheet['!rows'][r.row-1]=Object.assign({},sheet['!rows'][r.row-1],{hidden:true});
    });
    range.e.c=Math.max(range.e.c,headers.length-1);sheet['!ref']=X.utils.encode_range(range);
    wb.Workbook=wb.Workbook||{};wb.Workbook.CalcPr=Object.assign({},wb.Workbook.CalcPr,{fullCalcOnLoad:true,forceFullCalc:true});
    var record={action:merge?'人工确认归并':'修改本行',time:new Date().toISOString(),reviewer:E.text(options.reviewer),reason:E.text(options.reason),sourceName:item.name,sourceHash:item.hash,sheet:doc.sheet,targetRow:base.row,before:rows.map(function(r){return {row:r.row,key:r.key,values:clone(r.values),raw:clone(r.raw)};}),headers:headers,after:values,refs:parsed.values.join(', '),quantity:get('数量')?count:null};
    return {wb:wb,mapping:map,record:record};
  }
  function appendSheet(wb,X,name,data){
    var original=name,n=2;while(wb.Sheets[name])name=original+(n++);
    var sheet=X.utils.aoa_to_sheet(data);sheet['!cols']=[{wch:24},{wch:80},{wch:50},{wch:60},{wch:60},{wch:60}];X.utils.book_append_sheet(wb,sheet,name);
  }
  function logRows(history){
    var rows=[['时间','操作 / 来源','确认人','依据','原行 / 字段','修改前','修改后']];
    history.forEach(function(record){record.before.forEach(function(before){record.headers.forEach(function(field,c){rows.push([record.time,record.action+'；'+record.sourceName+'；'+record.sheet+'；保留第'+record.targetRow+'行；来源摘要 '+record.sourceHash,record.reviewer,record.reason,'第'+before.row+'行 / '+(field||E.column(c)+'列'),E.text(before.raw[c]),E.text(record.after[c])]);});});});return rows;
  }
  return {change:change,clone:clone,appendSheet:appendSheet,logRows:logRows};
});
