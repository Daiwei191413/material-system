(function(root, factory){
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BOMReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';
  var VERSION = '1.4.0';
  var ALIASES = {
    '物料编码':['物料编码','料号','Part Number'], '物料名称':['物料名称','名称','Description','物料描述'],
    '型号':['型号','Comment','Comment型号','Value','value','规格型号','Part'],
    '参数描述':['参数描述','规格描述','Specification','规格','详细描述'],
    '封装':['封装','Footprint','Footprint封装','Package','封装规格'],
    '位号':['位号','Designator','Designator位号','Reference','RefDes','Ref'],
    '数量':['数量','Quantity','QTY','qty','用量','Count'], '单位':['单位','Unit'],
    '品牌':['品牌','Brand','Manufacturer','厂商'],
    '立创编号':['立创编号','LCSC','LCSC编号','嘉立创元件编号','嘉立创编号','嘉立创编码','嘉立创元件编码','立创编码','LCSC PartNumber'],
    '备注':['备注','Note','Remark','说明'], 'DNP':['DNP','dnp','不上板','不贴','不焊','是否DNP','上板','是否上板']
  };
  var FIELDS = Object.keys(ALIASES);
  function text(v){ return v == null ? '' : String(v).trim(); }
  function column(n){ var s=''; for(n++;n;n=Math.floor((n-1)/26)) s=String.fromCharCode(65+(n-1)%26)+s; return s; }
  function unique(a){ return Array.from(new Set(a)); }
  function rfLibraryStatus(raw){ var m=text(raw).match(/射频电感状态\s*[=:：]\s*([^；;]+)/); return m?text(m[1]):''; }
  function code(v){ var m=text(v).toUpperCase().match(/^C\d{3,}$/); return m ? m[0] : ''; }
  // Bind confirmations to the exported values, never to a row number or a free-text keyword.
  function rowSignature(values){ return JSON.stringify(FIELDS.map(function(f){return text(values[f]);})); }
  function sameRefs(a,b){return JSON.stringify(unique(refs(a).values).sort())===JSON.stringify(unique(refs(b).values).sort())&&refs(a).values.length>0;}
  function sourceSignature(doc,rawRefs){
    var wanted=refs(rawRefs).values;
    return JSON.stringify((doc.rows||[]).filter(function(r){return refs(r.values['位号']).values.some(function(ref){return wanted.indexOf(ref)>=0;});}).map(function(r){return ['型号','封装','立创编号','参数描述','位号'].map(function(f){return text(r.values[f]);});}).sort(function(a,b){return JSON.stringify(a).localeCompare(JSON.stringify(b));}));
  }
  function mapping(headers){
    var result={}, used={};
    FIELDS.forEach(function(field){
      for(var i=0;i<ALIASES[field].length;i++){
        var index=headers.findIndex(function(h,j){ return !used[j] && text(h).toLowerCase()===ALIASES[field][i].toLowerCase(); });
        if(index>=0){ result[field]=index; used[index]=true; break; }
      }
    });
    return result;
  }
  function detectHeader(matrix){
    var best={row:0,score:0};
    matrix.slice(0,50).forEach(function(row,index){
      var map=mapping(row||[]), score=Object.keys(map).length;
      if(map['型号']!=null) score+=1;
      if(map['位号']!=null) score+=1;
      if(score>best.score) best={row:index,score:score};
    });
    return best.row;
  }
  function readWorkbook(wb, xlsx, options){
    options=options||{};
    var sheetName=options.sheet || wb.SheetNames.find(function(name){return /BOM/i.test(name);}) || wb.SheetNames[0];
    if(!wb.Sheets[sheetName]) throw new Error('未找到工作表');
    var sheet=wb.Sheets[sheetName];
    var matrix=xlsx.utils.sheet_to_json(sheet,{header:1,range:0,defval:'',raw:false,blankrows:true});
    var header=options.headerRow!=null ? Number(options.headerRow)-1 : detectHeader(matrix);
    if(!Number.isInteger(header)||header<0||header>=matrix.length) throw new Error('表头行号无效');
    var headers=(matrix[header]||[]).map(text);
    var map=options.mapping || mapping(headers);
    var rows=[];
    for(var r=header+1;r<matrix.length;r++){
      var raw=matrix[r]||[];
      if(!raw.some(function(v){return text(v)!=='';})) continue;
      var values={}, cells={}, flags=[];
      FIELDS.forEach(function(field){
        var c=map[field];
        if(c!=null && c>=0 && c<headers.length){ values[field]=text(raw[c]); cells[field]=column(c)+(r+1); }
      });
      if(!['物料编码','物料名称','型号','参数描述','封装','位号'].some(function(f){return values[f];})) continue;
      headers.forEach(function(h,c){ if(ALIASES.DNP.some(function(a){return a.toLowerCase()===h.toLowerCase();}) && text(raw[c])!=='') flags.push({header:h,value:text(raw[c]),cell:column(c)+(r+1)}); });
      rows.push({key:sheetName+':'+(r+1),sheet:sheetName,row:r+1,values:values,cells:cells,raw:raw.slice(),flags:flags,hidden:!!(sheet['!rows']&&sheet['!rows'][r]&&sheet['!rows'][r].hidden)});
    }
    var metadata=[];
    wb.SheetNames.forEach(function(name){
      xlsx.utils.sheet_to_json(wb.Sheets[name],{header:1,defval:'',raw:false}).slice(0,20).forEach(function(row){ metadata.push(row.map(text).join(' ')); });
    });
    var context={details:[],records:[]};
    if(wb.Sheets['补齐报告']){
      xlsx.utils.sheet_to_json(wb.Sheets['补齐报告'],{defval:'',raw:false}).forEach(function(item){
        if((!text(item['匹配等级'])||/待核实|人工已确认/.test(text(item['匹配等级'])))&&text(item['位号'])&&text(item['型号'])&&text(item['待核实事项']))context.details.push({ref:text(item['位号']),model:text(item['型号']),warnings:[text(item['待核实事项'])],source:'补齐报告'});
        if(item['审查依据']){try{var record=JSON.parse(item['审查依据']);if(record&&record.schema===1&&Array.isArray(record.entries))context.records.push(record);}catch(ignore){context.invalid=true;}}
      });
    }
    if(options.reviewContext)context=JSON.parse(JSON.stringify(options.reviewContext));
    return {name:options.name||'',hash:options.hash||'',sheet:sheetName,headerRow:header+1,headers:headers,mapping:map,rows:rows,metadata:metadata,reviewContext:context};
  }
  function refs(raw){
    var values=[], invalid=[];
    text(raw).toUpperCase().split(/[,，;；\s]+/).filter(Boolean).forEach(function(token){
      var range=token.match(/^([A-Z]+)(\d+)[-~～]([A-Z]+)?(\d+)$/);
      if(range){
        var a=Number(range[2]),b=Number(range[4]);
        if((!range[3]||range[3]===range[1]) && b>=a && b-a<5000){ for(var i=a;i<=b;i++) values.push(range[1]+i); }
        else invalid.push(token);
      } else if(/^[A-Z]+\d+(?:[_-][A-Z0-9]+)?$/.test(token)) values.push(token);
      else invalid.push(token);
    });
    return {values:values,invalid:invalid};
  }
  function value(raw, forced){
    var s=text(raw).replace(/[µμ]/g,'u'), m, kind, factor, label;
    if(!forced || forced==='capacitor'){
      m=s.match(/^(\d+(?:\.\d+)?)\s*([pPnNuUmM]?)[fF](?=$|[\s,，;/\\])/);
      if(m){
        factor={p:1e-12,P:1e-12,n:1e-9,N:1e-9,u:1e-6,U:1e-6,m:1e-3,M:1e6,'':1}[m[2]];
        return {kind:'capacitor',number:Number(m[1])*factor,label:m[1]+m[2]+'F'};
      }
    }
    if(!forced || forced==='inductor'){
      m=s.match(/^(\d+(?:\.\d+)?)\s*([pPnNuUm]?)[hH](?=$|[\s,，;/\\])/);
      if(m) return {kind:'inductor',number:Number(m[1])*({p:1e-12,P:1e-12,n:1e-9,N:1e-9,u:1e-6,U:1e-6,m:1e-3,'':1}[m[2]]),label:m[0].trim()};
    }
    if(!forced || forced==='resistor'){
      m=s.match(/^(\d+(?:\.\d+)?)\s*m(?:Ω|ohms?)(?=$|[\s,，;/\\])/i);
      // Uppercase M is mega; lowercase m with an explicit ohm unit is milli.
      if(m && /m(?:Ω|ohm)/.test(m[0])) return {kind:'resistor',number:Number(m[1])*1e-3,label:m[0].trim()};
      m=s.match(/^(\d+)[rRkKmM](\d+)\s*(?:Ω|ohms?)?(?=$|[\s,，;/\\])/i);
      if(m){var unit=s.match(/^\d+([rRkKmM])/)[1].toUpperCase();return {kind:'resistor',number:Number(m[1]+'.'+m[2])*({R:1,K:1e3,M:1e6}[unit]),label:m[0].trim()};}
      m=s.match(/^(\d+(?:\.\d+)?)\s*([rRkKM]?)\s*(Ω|ohms?)?(?=$|[\s,，;/\\])/i);
      if(m && (m[2]||m[3]||forced==='resistor')){
        kind=(m[2]||'R').toUpperCase(); factor={R:1,K:1e3,M:1e6}[kind]; label=m[0].trim();
        return {kind:'resistor',number:Number(m[1])*factor,label:label};
      }
    }
    return null;
  }
  function equal(a,b){ return !!a&&!!b&&a.kind===b.kind&&Math.abs(a.number-b.number)<=Math.max(Math.abs(a.number),Math.abs(b.number),1e-18)*1e-9; }
  function packageInfo(raw){
    var s=text(raw).toUpperCase();
    if(!s) return null;
    var found=unique((s.match(/(?:01005|0201|0402|0603|0805|1008|1206|1210|1812|2010|2512)/g)||[]));
    if(found.length>1) return {key:'',raw:s,ambiguous:true};
    if(found.length===1 && new RegExp('(^|[^0-9])'+found[0]+'(?![0-9])').test(s)) return {key:found[0],raw:s,standard:true};
    var family=s.match(/^(SOT|SOP|SSOP|TSSOP|QFN|DFN|LQFP|TQFP|BGA)[-_ ]?(\d+)(?:[-_](\d+))?/);
    return {key:family ? family[1]+family[2]+(family[3]?'-'+family[3]:'') : s.replace(/[\s_()\-]/g,''),raw:s,standard:!!family};
  }
  function specData(raw){
    var s=text(raw), fields={};
    s.split(/[,，;；|\n]/).forEach(function(part){var m=part.match(/^\s*([^:：]+)[:：]\s*(.+)$/);if(m)fields[text(m[1])]=text(m[2]);});
    var v=value(fields['容值']||fields['电容值']||fields['电容量']||fields['容量']||'', 'capacitor')
      || value(fields['阻值']||fields['电阻值']||'', 'resistor') || value(fields['电感值']||fields['电感量']||'', 'inductor')
      || value(s.replace(/^(?:MLCC|陶瓷电容器?|贴片电容|电容器?|厚膜电阻|薄膜电阻|贴片电阻|电阻|绕线电感|贴片电感|功率电感|电感)[\s,，]*/i,''));
    var packages=[], p;
    if(fields['封装']||fields['封装规格']) packages.push(packageInfo(fields['封装']||fields['封装规格']));
    var rx=/(?:\bSMD\s+|\bS[CRL])\s*(01005|0201|0402|0603|0805|1008|1206|1210|1812|2010|2512)\b/gi;
    while((p=rx.exec(s))!==null)packages.push(packageInfo(p[1]));
    return {value:v,packages:packages.filter(Boolean),fields:fields};
  }
  function modelValue(row){
    var v=row.values, parsed=value(v['型号']);
    if(parsed) return parsed;
    var name=text(v['物料名称']);
    if(/电阻|resistor/i.test(name)||/^SR/i.test(v['封装']||''))return value(v['型号'],'resistor');
    return null;
  }
  function rowRole(row, options){
    if(options.roles && options.roles[row.key] && options.roles[row.key]!=='auto')return options.roles[row.key];
    if(/替代料|备选料|alternative|\bALT\b/i.test(row.values['备注']||''))return 'alternative';
    if(/PCB|PCBA|螺丝|标签|包装|线材|配件|散料/i.test(text(row.values['物料名称'])+' '+text(row.values['型号'])))return 'nonplacement';
    return 'main';
  }
  function assembly(row){
    var flags=[], unknown=[];
    (row.flags||[]).forEach(function(f){
      var v=text(f.value).toUpperCase(), inverse=/^(上板|是否上板)$/.test(f.header), yes=/^(Y|YES|TRUE|1|是|✓|√)$/.test(v), no=/^(N|NO|FALSE|0|否)$/.test(v);
      if(/^(DNP|不上板|不贴|不焊)$/.test(v))flags.push(true);
      else if(/^(上板|贴|焊)$/.test(v))flags.push(false);
      else if(yes||no) flags.push(inverse ? no : yes); else unknown.push(f);
    });
    var nc=/^NC$/i.test(text(row.values['型号'])) || /[/\\／]\s*NC\s*$/i.test(text(row.values['型号']));
    return {excluded:nc||flags.indexOf(true)>=0,conflict:(flags.indexOf(true)>=0&&flags.indexOf(false)>=0)||(nc&&flags.indexOf(false)>=0),unknown:unknown};
  }
  function missingParams(row, kind, numeric){
    var s=text(row.values['参数描述']), missing=[];
    if(kind==='resistor'&&numeric===0){if(!/\d\s*(?:[mun]?W|[mun]?A)\b/i.test(s))missing.push('适用额定功率/电流');return missing;}
    if(kind==='resistor'||kind==='capacitor'){
      if(!/±\s*\d|\d\s*%/.test(s))missing.push('精度');
      if(kind==='resistor'&&!/\d\s*[mun]?W\b/i.test(s))missing.push('功率');
      if(kind==='capacitor'){
        if(!/\d\s*[mk]?V\b/i.test(s))missing.push('耐压');
        if(/MLCC|陶瓷|贴片电容/i.test(text(row.values['物料名称'])+' '+s)||/^S?C?(01005|0201|0402|0603|0805|1206|1210|1812)$/i.test(text(row.values['封装']))){
          if(!/X[5678][RS]|C0G|COG|NP0|NPO|Y5[UV]/i.test(s))missing.push('介质');
        }
      }
    }
    return missing;
  }
  function hasExactSmallCapTolerance(raw){
    var match=text(raw).replace(/[µμ]/g,'u').match(/±\s*(\d+(?:\.\d+)?)\s*pF(?=$|[\s,，;；/|])/i);
    return !!match&&Math.abs(Number(match[1])-0.1)<=1e-9;
  }
  function materialKey(raw){return text(raw).toUpperCase().replace(/\s+/g,'');}
  function materialPackageHasUnit(raw){return /metric|imperial|公制|英制|毫米|inch|\bmm\b/i.test(text(raw));}
  function materialPackageKey(raw){
    var p=packageInfo(raw);
    return p&&p.standard&&/^\d+$/.test(p.key)&&!materialPackageHasUnit(raw)?p.key:materialKey(raw).replace(/[_()\-]/g,'');
  }
  function materialLibraryIndex(library){
    var records=[],seen=new Set(),byCode=new Map(),byIdentity=new Map();
    ((library&&library.records)||[]).forEach(function(raw){
      var item={code:text(raw.material_code||raw['物料编码']),model:text(raw.model||raw['型号']),package:text(raw.package||raw['封装']),specification:text(raw.specification||raw['参数描述']),brand:text(raw.brand||raw['品牌']),name:text(raw.name||raw['物料名称'])};
      if(!item.code)return;
      var signature=JSON.stringify(item);if(seen.has(signature))return;seen.add(signature);records.push(item);
      var key=materialKey(item.code);if(!byCode.has(key))byCode.set(key,[]);byCode.get(key).push(item);
      if(item.model&&item.package){key=materialKey(item.model)+'|'+materialPackageKey(item.package);if(!byIdentity.has(key))byIdentity.set(key,[]);byIdentity.get(key).push(item);}
    });
    return {records:records,byCode:byCode,byIdentity:byIdentity,ready:!!library&&library.status==='ready'&&records.length>0};
  }
  function analyze(doc, source, options){
    options=options||{};
    var checks=[], index=new Map(), sourceIndex=new Map(), codes=new Map(), seq=0;
    var context=doc.reviewContext||{details:[],records:[]};
    var materialLibrary=options.materialLibrary,materials=materialLibraryIndex(materialLibrary);
    var materialStatus=materialLibrary?({ready:'已同步',pending:'未同步',loading:'同步中',error:'同步失败'}[materialLibrary.status]||'状态未知'):'';
    function emit(row,rule,status,field,message,expected,origin){
      var check={id:'R'+(++seq),rule:rule,status:status,sheet:row?row.sheet:doc.sheet,row:row?row.row:doc.headerRow,key:row?row.key:'',refs:row?text(row.values['位号']):'',cell:row?(row.cells[field]||''): '',field:field||'',observed:row?text(row.values[field]):'',expected:text(expected),message:message,source:origin||'线下BOM本地规则'};
      checks.push(check);return check;
    }
    if(!doc.rows.length)emit(null,'EMPTY_BOM','error','','未识别到有效物料行');
    var selected=Object.keys(doc.mapping).map(function(f){return doc.mapping[f];}).filter(function(n){return n!=null&&n>=0;});
    if(unique(selected).length!==selected.length)emit(null,'MAPPING_COLLISION','pending','','多个字段映射到同一列，请核实字段映射');
    var versions=unique((doc.metadata||[]).filter(function(s){return /BOM版本|版本[:：]|REV/i.test(s);}).map(function(s){var m=s.match(/(?:版本|REV)\s*[:：]?\s*[Vv]?(\d+(?:\.\d+)+)/i);return m?m[1]:'';}).filter(Boolean));
    if(versions.length>1)emit(null,'VERSION_CONFLICT','warning','','封面或明细中的版本标识不一致',versions.join(' / '),'文件内容');
    ['型号','参数描述','封装','位号','数量'].forEach(function(field){if(doc.mapping[field]==null)emit(null,'MISSING_COLUMN','pending',field,'未映射'+field+'列，对应检查未完成');});
    if(materialLibrary&&doc.mapping['物料编码']==null)emit(null,'MATERIAL_CODE_COLUMN','pending','物料编码','未识别公司物料编码列，本次未完成编码与标准库核对');
    if(source){source.rows.forEach(function(row){if(rowRole(row,{})!=='main')return;unique(refs(row.values['位号']).values).forEach(function(ref){if(!sourceIndex.has(ref))sourceIndex.set(ref,[]);sourceIndex.get(ref).push(row);});});}
    var matchedRefs=new Set(), seenRefs=new Set();
    doc.rows.forEach(function(row){
      var v=row.values, role=rowRole(row,options), split=refs((role==='alternative'&&options.bindings&&options.bindings[row.key])||v['位号']), rr=split.values, main=role==='main';
      var mv=modelValue(row), sd=specData(v['参数描述']), fp=packageInfo(v['封装']), excluded=assembly(row);
      var boundRecord=(context.records||[]).find(function(r){return r.schema===1&&r.signature===rowSignature(v)&&Array.isArray(r.entries);});
      var record=boundRecord&&(!source||boundRecord.sourceSignature===sourceSignature(source,v['位号']))?boundRecord:null;
      var confirmations=record?record.entries.filter(function(e){return e.confirmed===true&&e.resolved===true&&e.action&&e.time;}):[];
      var completed=record?record.entries.filter(function(e){return e.kind==='information'&&e.resolved===true;}):[];
      rr.forEach(function(ref){seenRefs.add(ref);});
      if(row.hidden)emit(row,'HIDDEN_ROW','warning','型号','隐藏行仍参与审查，请确认是否属于本次范围');
      if(!text(v['型号'])&&role!=='nonplacement')emit(row,'MISSING_MODEL','pending','型号','缺少型号，无法确认实际器件');
      if(split.invalid.length)emit(row,'REF_FORMAT','pending','位号','位号格式或范围无法可靠展开',split.invalid.join('、'));
      if(rr.length!==unique(rr).length)emit(row,'DUPLICATE_REF_IN_ROW','error','位号','同一行位号重复');
      if(!rr.length&&role!=='nonplacement')emit(row,'MISSING_REF','pending','位号',role==='alternative'?'替代料缺少明确关联位号，请在行类别中填写关联位号':'无位号，请确认属于主料、替代料还是非贴片物料');
      if(main){unique(rr).forEach(function(ref){if(!index.has(ref))index.set(ref,[]);index.get(ref).push(row);});}
      if(excluded.conflict)emit(row,'ASSEMBLY_CONFLICT','error','DNP','多个上板/DNP字段互相矛盾');
      if(excluded.unknown.length)emit(row,'ASSEMBLY_UNKNOWN','pending','DNP','存在无法识别的上板/DNP状态',excluded.unknown.map(function(f){return f.header+':'+f.value;}).join('；'));
      if(excluded.excluded)emit(row,'DNP_SCOPE','matched','DNP','已识别为空贴/DNP；保留原数量，不将其计为待装主料');
      var qty=text(v['数量']), unit=text(v['单位']).toUpperCase(), countUnit=!unit||/^(PCS|PC|个|只|颗|件)$/.test(unit);
      if(!qty&&doc.mapping['数量']!=null)emit(row,'MISSING_QUANTITY','pending','数量','原数量为空，审查未按位号自动补数量');
      else if(qty){
        var number=Number(qty.replace(/,/g,''));
        if(!Number.isFinite(number)||number<0||(role!=='nonplacement'&&countUnit&&!Number.isInteger(number)))emit(row,'INVALID_QUANTITY','error','数量','数量不是适用的有效非负数');
        else if(main&&!excluded.excluded&&countUnit&&rr.length&&number!==unique(rr).length)emit(row,'QUANTITY_REF','error','数量','数量与主料位号数不一致',unique(rr).length);
        else emit(row,'QUANTITY','matched','数量','数量格式及本次适用的计数规则一致');
      }
      if(role==='nonplacement')emit(row,'ROW_SCOPE','matched','位号','非贴片/配件行按独立范围审查，不强制位号计数');
      if(fp&&fp.ambiguous)emit(row,'PACKAGE_AMBIGUOUS','pending','封装','封装含多个尺寸或单位体系，需确认后比较');
      var modelPackages=[], suffix=text(v['型号']).match(/(?:^|\s)S[CRL](01005|0201|0402|0603|0805|1206|1210|2010|2512)\b/i);
      if(suffix)modelPackages.push(packageInfo(suffix[1]));
      if(fp&&fp.key){
        var others=sd.packages.concat(modelPackages);
        if(others.some(function(p){return p.key&&p.key!==fp.key&&p.standard&&fp.standard;}))emit(row,'PACKAGE_CONFLICT','error','参数描述','型号/描述中的尺寸与封装列不一致',fp.key);
        else if(others.some(function(p){return p.key&&p.key!==fp.key;}))emit(row,'PACKAGE_ALIAS','pending','参数描述','自定义焊盘名与描述封装不同，缺少尺寸或别名依据，需人工核对',fp.raw);
        else if(others.length)emit(row,'PACKAGE','matched','封装','已核对字段内的封装尺寸；C/SC/SR前缀不用于判定实际器件类型',fp.key);
        else if(mv&&!excluded.excluded)emit(row,'PACKAGE_EVIDENCE','pending','封装','仅有封装列，缺少独立尺寸对照');
      } else if(role!=='nonplacement'&&!excluded.excluded)emit(row,'PACKAGE_MISSING','pending','封装','缺少可核对的封装');
      if(mv&&sd.value){
        if(!equal(mv,sd.value))emit(row,'VALUE_CONFLICT','error','参数描述','型号与描述的器件类型或参数值不一致',mv.label);
        else emit(row,'VALUE','matched','参数描述','阻容/电感值按单位换算后相符',mv.label);
      } else if(mv&&!excluded.excluded)emit(row,'VALUE_MISSING','pending','参数描述','缺少可解析的参数描述，不能核实阻容/电感值',mv.label);
      var nominal=mv||sd.value;
      if(nominal&&!excluded.excluded&&role!=='nonplacement'){
        var named=/电阻|resistor/i.test(v['物料名称']||'')?'resistor':/电容|capacitor|MLCC/i.test(v['物料名称']||'')?'capacitor':/电感|inductor/i.test(v['物料名称']||'')?'inductor':'';
        if(named&&named!==nominal.kind)emit(row,'TYPE_CONFLICT','error','物料名称','物料名称与实际型号参数类型矛盾，需核实',nominal.kind);
        var missing=missingParams(row,nominal.kind,nominal.number);
        if(missing.length)emit(row,'PARAMETERS_MISSING','pending','参数描述',missing.join('、')+'待核实；不根据封装或默认值推断');
        if(nominal.kind==='capacitor'&&nominal.number>0&&nominal.number/1e-12<10&&!hasExactSmallCapTolerance(v['参数描述']))emit(row,'SMALL_CAP_TOLERANCE','error','参数描述','公司硬性规则：小于10pF电容必须明确使用±0.1pF精度','±0.1pF');
      }
      var exactSource=source&&rr.length&&rr.every(function(ref){var list=sourceIndex.get(ref)||[];return list.length===1&&text(list[0].values['型号'])===text(v['型号']);});
      if(!mv&&!excluded.excluded&&role==='main'&&text(v['型号'])&&!exactSource)emit(row,'MODEL_EVIDENCE','pending','型号','厂家型号不能直接解析为器件参数；需要型号对应资料或本次人工确认，当前未独立核实型号与规格的对应关系');
      var rfStatus=rfLibraryStatus(v['备注']);
      if(rfStatus){
        if(/待入库/.test(rfStatus))emit(row,'RF_LIBRARY_PENDING','pending','备注','源BOM指定的新关键电感已保留，本次可用；射频电感库尚未收录，需由管理员审核后导入');
        else emit(row,'RF_LIBRARY_STATUS','matched','备注','射频电感库状态：'+rfStatus);
      }
      var note=text(v['备注']);
      confirmations.forEach(function(e){if(e.note)note=note.split(e.note).join('');});
      var detailWarnings=[],resolvedDetails=0;
      (boundRecord&&Array.isArray(boundRecord.details)?boundRecord.details:context.details||[]).filter(function(d){return sameRefs(d.ref,v['位号'])&&text(d.model)===text(v['型号']);}).forEach(function(d){
        (d.warnings||[]).forEach(function(w){
          var remaining=text(w);confirmations.concat(completed).forEach(function(e){if(e.note&&remaining.indexOf(e.note)>=0){remaining=remaining.split(e.note).join('');resolvedDetails++;}});
          if(remaining.replace(/[；;\s]/g,''))detailWarnings.push(remaining);
        });
      });
      detailWarnings=unique(detailWarnings);
      if(resolvedDetails||detailWarnings.length)note=note.split('参数待核实（详见补齐报告）').join('');
      if(detailWarnings.length)detailWarnings.forEach(function(w){emit(row,'SUPPLEMENT_PENDING','pending','参数描述','补齐报告待核实事项：'+w,'','本次转换 / 补齐报告');});
      if(/待核实|待确认/.test(note)&&detailWarnings.indexOf(note)<0)emit(row,'PENDING_NOTE','pending','备注','原备注：'+note+'；未取得对应的具体核对依据，请查看原补齐报告或提供器件资料');
      if(!record&&(context.records||[]).some(function(r){return r.schema===1&&r.ref&&sameRefs(r.ref,v['位号'])&&(r.signature!==rowSignature(v)||(source&&r.sourceSignature!==sourceSignature(source,v['位号'])));}))emit(row,'CONFIRMATION_STALE','pending','型号','原人工确认对应的行内容或源BOM依据已变化或无法验证，需要重新核实');
      confirmations.forEach(function(e){
        var c=emit(row,'MANUAL_CONFIRMATION','matched',e.kind==='package'?'封装':e.kind==='model'?'型号':'备注',e.reason||e.action,'','本次BOM人工确认记录');
        c.confirmation={action:e.action,time:e.time};c.confirmationKind=e.kind;c.evidence=e;
      });
      completed.forEach(function(e){emit(row,'CONVERSION_TRACE','matched','备注',e.reason,'','转换阶段处理记录');});
      var verifiedModel=record&&record.entries.find(function(e){return e.kind==='verifiedModel'&&e.resolved===true&&e.official&&text(e.official.model)===text(v['型号']);});
      if(verifiedModel)emit(row,'OFFICIAL_MODEL_RECORD','matched','型号',verifiedModel.reason,verifiedModel.official.model,'转换阶段商品核对记录（本次未重新联网）');
      var material=text(v['物料编码']);
      if(materialLibrary&&doc.mapping['物料编码']!=null){
        var identityKey=materialKey(v['型号'])+'|'+materialPackageKey(v['封装']);
        var candidates=materials.ready?(materials.byIdentity.get(identityKey)||[]):[];
        var candidateCodes=unique(candidates.map(function(m){return m.code;}));
        var current=materials.ready?(materials.byCode.get(materialKey(material))||[]):[];
        var origin=(materialLibrary.source||'公司标准库')+'（本次同步状态：'+materialStatus+'；'+materials.records.length+'条编码记录）';
        var currentSummary=current.map(function(m){return [m.code,m.model,m.package,m.specification].filter(Boolean).join(' / ');}).join('；');
        var codeCheck;
        if(!material)codeCheck=emit(row,'MATERIAL_CODE_MISSING','pending','物料编码','当前公司物料编码为空，不能核对编码对应关系',candidateCodes.join(' / '),origin);
        else if(!materials.ready)codeCheck=emit(row,'MATERIAL_LIBRARY_UNAVAILABLE','pending','物料编码','公司标准库未完成同步或没有可用编码记录，当前编码 '+material+' 尚未核对；请完成库同步后重新审查','',origin);
        else if(current.length>1)codeCheck=emit(row,'MATERIAL_CODE_AMBIGUOUS','pending','物料编码','标准库中编码 '+material+' 对应多条不同资料，无法唯一确定；请管理员核对库记录',currentSummary,origin);
        else if(candidateCodes.length===1&&materialKey(candidateCodes[0])!==materialKey(material)&&materials.byCode.get(materialKey(candidateCodes[0])).length===1&&(!current.length||materialKey(current[0].model)!==materialKey(v['型号']))){
          codeCheck=emit(row,'MATERIAL_CODE_CONFLICT','error','物料编码','当前编码 '+material+' 与标准库按型号 '+text(v['型号'])+'、封装 '+text(v['封装'])+' 唯一匹配的编码 '+candidateCodes[0]+' 不一致'+(currentSummary?'；当前编码在库中对应：'+currentSummary:'；当前编码在标准库中未找到'),candidateCodes[0],origin);
        }else if(current.length===1){
          var m=current[0],sameModel=materialKey(m.model)===materialKey(v['型号']),samePackage=!!m.package&&materialPackageKey(m.package)===materialPackageKey(v['封装']);
          if(sameModel&&samePackage&&m.model&&text(v['型号']))codeCheck=emit(row,'MATERIAL_CODE_MATCH','matched','物料编码','公司物料编码 '+material+' 对应的型号、封装与当前行一致；其他规格仍按各检查项核验',currentSummary,origin);
          else{
            var actualPackage=packageInfo(v['封装']),libraryPackage=packageInfo(m.package);
            var physicalConflict=sameModel&&!materialPackageHasUnit(v['封装'])&&!materialPackageHasUnit(m.package)&&actualPackage&&libraryPackage&&actualPackage.standard&&libraryPackage.standard&&/^\d+$/.test(actualPackage.key)&&/^\d+$/.test(libraryPackage.key)&&actualPackage.key!==libraryPackage.key;
            codeCheck=emit(row,physicalConflict?'MATERIAL_CODE_PACKAGE_CONFLICT':'MATERIAL_CODE_IDENTITY',physicalConflict?'error':'pending','物料编码','编码 '+material+' 的标准库资料与当前型号/封装未能一致对应；需核实型号别名、实际封装或编码'+(candidateCodes.length>1?'；当前型号封装有多个候选编码：'+candidateCodes.join('、'):''),currentSummary,origin);
          }
        }else codeCheck=emit(row,candidateCodes.length>1?'MATERIAL_CODE_CANDIDATES':'MATERIAL_CODE_UNKNOWN','pending','物料编码','标准库未找到当前编码 '+material+(candidateCodes.length>1?'；型号和封装对应多个候选编码，不能自动确定':'，且无法按型号及封装唯一确定编码')+'；需管理员核对或补充依据',candidateCodes.join(' / '),origin);
        if(codeCheck)codeCheck.materialCandidates=candidates;
      }
      if(material&&role!=='alternative'){if(!codes.has(material))codes.set(material,[]);codes.get(material).push(row);}
      if(source&&main&&rr.length){
        var matched=unique(rr).map(function(ref){return sourceIndex.get(ref)||[];});
        if(matched.some(function(rows){return rows.length>1;}))emit(row,'SOURCE_AMBIGUOUS','pending','位号','原始BOM同一位号有多个主料，不能唯一核对');
        var sourceRows=unique([].concat.apply([],matched)).filter(function(sr){return matched.some(function(list){return list.length===1&&list[0]===sr;});});
        unique(rr).forEach(function(ref){if(sourceIndex.has(ref))matchedRefs.add(ref);else emit(row,'SOURCE_MISSING','warning','位号','原始立创BOM未找到位号 '+ref,'','原始立创BOM');});
        sourceRows.forEach(function(sr){
          var sv=sr.values, origin='原始立创BOM '+sr.sheet+'!'+sr.row, smv=modelValue(sr), sp=packageInfo(sv['封装']);
          var applicableRefs=unique(rr).filter(function(ref){return refs(sv['位号']).values.indexOf(ref)>=0;});
          var actual=(options.actuals||[]).find(function(a){var declared=refs(a.refs).values;return applicableRefs.length&&applicableRefs.every(function(ref){return declared.indexOf(ref)>=0;})&&a.reason&&equal(value(a.model),mv)&&packageInfo(a.package)&&fp&&packageInfo(a.package).key===fp.key;});
          if(mv&&smv&&!equal(mv,smv)){
            var valueCheck=emit(row,'SOURCE_VALUE',actual?'matched':'error','型号',actual?'实际装配变更已确认：'+actual.reason:'实际型号参数与原始BOM存在来源冲突',sv['型号'],origin);
            if(actual)valueCheck.confirmation={action:actual.reason,time:'本次审查填写'};
          }
          else if(mv&&smv)emit(row,'SOURCE_VALUE','matched','型号','与原始BOM的阻容/电感值相符',sv['型号'],origin);
          // 非阻容感器件的源表 Value、商品型号和公司型号常使用不同命名口径；
          // 纯名称差异属于待核实；不能当成已证实错料，也不能悄悄略过。
          if((!mv||!smv)&&text(v['型号'])&&text(sv['型号']))emit(row,'SOURCE_MODEL',text(v['型号'])===text(sv['型号'])?'matched':'pending','型号',text(v['型号'])===text(sv['型号'])?'型号文字与原始BOM一致；未据此推断电气规格已核验':'源型号与当前型号名称不同，需要对应关系或本次人工确认',sv['型号'],origin);
          if(fp&&sp&&fp.key&&sp.key&&fp.key!==sp.key)emit(row,'SOURCE_PACKAGE',fp.standard&&sp.standard?'error':'pending','封装','与原始BOM封装标识不同，需核实尺寸或自定义焊盘别名',sv['封装'],origin);
          else if(fp&&sp&&fp.key&&sp.key)emit(row,'SOURCE_PACKAGE','matched','封装','与原始BOM封装相符',sv['封装'],origin);
          if(code(v['立创编号'])&&code(sv['立创编号'])&&code(v['立创编号'])!==code(sv['立创编号']))emit(row,'SOURCE_CODE',actual?'pending':'error','立创编号',actual?'已确认装配变更，当前编号仍需商品数据核实':'当前采购编号与原始BOM编号明确不同，需修正或核实采购变更',sv['立创编号'],origin);
          // 线下BOM模板不要求保留立创编号，缺少该字段不作为审查问题。
        });
      }
      // Only a scoped, content-bound manual decision can resolve its corresponding soft check.
      checks.filter(function(c){return c.key===row.key&&c.status==='pending';}).forEach(function(c){
        var kind=/^(MODEL_EVIDENCE|SOURCE_MODEL)$/.test(c.rule)?'model':/^(PACKAGE_ALIAS|PACKAGE_EVIDENCE|SOURCE_PACKAGE)$/.test(c.rule)?'package':'';
        var confirmation=kind&&confirmations.find(function(e){return e.kind===kind;});
        if(confirmation){c.status='matched';c.confirmation={action:confirmation.action,time:confirmation.time};c.message+='；已承接本次人工确认';}
        else if(c.rule==='MODEL_EVIDENCE'&&verifiedModel){c.status='matched';c.message=verifiedModel.reason;c.source='转换阶段商品核对记录（本次未重新联网）';}
      });
    });
    index.forEach(function(rows,ref){if(rows.length>1)rows.forEach(function(row){emit(row,'DUPLICATE_MAIN_REF','error','位号','位号 '+ref+' 出现在多个主料行；替代料需明确标记');});});
    codes.forEach(function(rows,id){
      var pkgs=unique(rows.map(function(r){var p=packageInfo(r.values['封装']);return p&&p.key;}).filter(Boolean));
      var vals=rows.map(modelValue).filter(Boolean);
      if(pkgs.length>1||vals.some(function(v){return vals[0]&&!equal(vals[0],v);}))rows.forEach(function(row){emit(row,'MATERIAL_ID_CONFLICT','error','物料编码','同一物料编码 '+id+' 对应互相矛盾的封装或阻容值');});
    });
    if(source){
      sourceIndex.forEach(function(rows,ref){if(!seenRefs.has(ref))emit(null,'SOURCE_OMISSION','warning','位号','源BOM位号 '+ref+' 未出现在待审BOM',ref,'原始立创BOM '+rows[0].sheet+'!'+rows[0].row);});
      var board=function(name){var m=text(name).match(/TP\d+[-_][A-Za-z0-9]+/i);return m?m[0].toUpperCase():'';};
      if(board(doc.name)&&board(source.name)&&board(doc.name)!==board(source.name))emit(null,'SOURCE_BOARD','warning','','两份文件的板卡标识不同，来源范围需确认',source.name,'文件名');
    }
    function category(c){
      var rule=c.rule;
      if(/^MATERIAL_CODE|^MATERIAL_LIBRARY/.test(rule))return 'model';
      if(rule==='MISSING_COLUMN'){
        if(c.field==='封装')return 'package';
        if(c.field==='位号')return 'reference';
        if(c.field==='数量')return 'quantity';
        return 'model';
      }
      if(['EMPTY_BOM','MAPPING_COLLISION','VERSION_CONFLICT','SOURCE_BOARD'].indexOf(rule)>=0)return 'file';
      if(['MISSING_MODEL','VALUE_CONFLICT','VALUE_MISSING','TYPE_CONFLICT','PARAMETERS_MISSING','MATERIAL_ID_CONFLICT','SOURCE_VALUE','SMALL_CAP_TOLERANCE'].indexOf(rule)>=0)return 'model';
      if(['PACKAGE_AMBIGUOUS','PACKAGE_CONFLICT','PACKAGE_ALIAS','PACKAGE_MISSING','SOURCE_PACKAGE'].indexOf(rule)>=0)return 'package';
      if(['REF_FORMAT','DUPLICATE_REF_IN_ROW','MISSING_REF','DUPLICATE_MAIN_REF','SOURCE_MISSING','SOURCE_OMISSION','ASSEMBLY_CONFLICT'].indexOf(rule)>=0)return 'reference';
      if(['MISSING_QUANTITY','INVALID_QUANTITY','QUANTITY_REF'].indexOf(rule)>=0)return 'quantity';
      if(['SOURCE_CODE','SOURCE_MODEL','MODEL_EVIDENCE','CONFIRMATION_STALE','SUPPLEMENT_PENDING'].indexOf(rule)>=0)return 'model';
      if(rule==='PACKAGE_EVIDENCE')return 'package';
      return c.field==='备注'||c.field==='DNP'?'reference':'file';
    }
    checks.forEach(function(c){
      c.category=category(c);
      c.outcome=c.status==='matched'?(c.confirmation?'confirmed':'passed'):c.status==='error'?'conflict':'pending';
      c.core=c.outcome==='conflict';
      c.advisory=c.outcome==='pending';
      c.suggestion=c.status==='matched'?'保留核对记录':({
        model:c.core?'按实际器件资料修正冲突后重新审查':'补充该型号的规格或对应关系依据；已确认事项需保留确认记录',
        package:c.core?'核实实际尺寸并修正封装后重新审查':'核对尺寸或焊盘别名，保留本次确认依据',
        reference:'按原始BOM修正位号，去除重复或补齐遗漏',
        quantity:c.core?'核实装配范围并修正数量':'补充数量或计数依据后重新审查',
        file:'确认文件、工作表和字段识别设置后重新审查'
      }[c.category]||(c.status==='error'?'对照原单元格及实际装配资料修订后复审':'补充可靠来源后复审'));
      if(/PENDING_NOTE|SUPPLEMENT_PENDING/.test(c.rule))c.suggestion='查看该行补齐报告和原备注，补充具体器件资料；缺参允许导出不等于参数已核实';
      if(c.rule==='RF_LIBRARY_PENDING')c.suggestion='该物料可保留使用；由管理员审核是否录入射频电感库';
      if(/^MATERIAL_CODE|^MATERIAL_LIBRARY/.test(c.rule))c.suggestion=c.status==='matched'?'保留编码对应关系核对记录':c.core?'按公司标准库核实并修正当前BOM的物料编码或物料资料后重新审查':'核对公司标准库同步状态及该编码记录；有多个候选时由工程师确认，审查不会自动改码';
      if(c.confirmation)c.suggestion='已承接确认：'+c.confirmation.action+'；时间：'+c.confirmation.time;
      c.resolution={passed:'本检查项通过',confirmed:'人工已确认',pending:'待核实',conflict:'明确冲突'}[c.outcome];
    });
    var issues=checks.filter(function(c){return c.status!=='matched';});
    var coreIssues=issues.filter(function(c){return c.core;});
    var advisories=checks.filter(function(c){return c.advisory;});
    function finding(list, fallback){
      if(!list.length)return fallback;
      return list.map(function(c){return c.message+(c.expected?'；对照内容：'+c.expected:'');}).join('；');
    }
    function auditRow(row){
      var rowChecks=checks.filter(function(c){return c.key===row.key;});
      var errors=rowChecks.filter(function(c){return c.core&&c.status!=='matched';});
      var unknown=rowChecks.filter(function(c){return c.advisory;});
      var confirmed=rowChecks.filter(function(c){return c.outcome==='confirmed';});
      var status=errors.length?'abnormal':unknown.length?'unverified':confirmed.length?'confirmed':'normal';
      var fields=unique(errors.map(function(c){return c.field||c.category;}).filter(Boolean));
      var uncovered=['未独立查询官方商品资料或验证实际装配'];
      if(!source)uncovered.push('未提供原始立创BOM，未核对源位号覆盖和源封装');
      if(!modelValue(row))uncovered.push('厂家型号无法直接解析，未自动推断型号内编码的电气参数');
      if(!text(row.values['立创编号']))uncovered.push('线下BOM未包含立创编号，未独立比较采购编号');
      if(!materialLibrary)uncovered.push('本次未接入公司标准库物料编码核对');
      else if(doc.mapping['物料编码']==null)uncovered.push('未识别公司物料编码列，未完成公司编码核对');
      return {
        id:'ROW:'+row.key,key:row.key,scope:'row',sheet:row.sheet,row:row.row,
        refs:text(row.values['位号']),model:text(row.values['型号']),materialCode:text(row.values['物料编码']),materialCandidates:[].concat.apply([],rowChecks.map(function(c){return c.materialCandidates||[];})),specification:text(row.values['参数描述']),
        package:text(row.values['封装']),quantity:text(row.values['数量']),inductorStatus:rfLibraryStatus(row.values['备注']),status:status,
        abnormalFields:fields,pendingFields:unique(unknown.map(function(c){return c.field;}).filter(Boolean)),checkedFields:unique(rowChecks.filter(function(c){return c.status==='matched';}).map(function(c){return c.field;}).filter(Boolean)),
        checks:rowChecks,confirmedChecks:confirmed,confirmations:confirmed.map(function(c){return c.confirmation;}),uncovered:uncovered,
        checkIds:rowChecks.map(function(c){return c.id;}),
        finding:errors.length||unknown.length?finding(errors.concat(unknown),'待核实'):confirmed.length?finding(confirmed,'人工已确认'):'当前规则覆盖的检查项通过；未覆盖项目见详情',
        suggestion:unique(errors.concat(unknown,confirmed).map(function(c){return c.suggestion;})).join('；'),
        evidence:unique(rowChecks.map(function(c){return c.source;})).join('；'),
        expected:unique(errors.concat(unknown).map(function(c){return c.expected;}).filter(Boolean)).join('；')
      };
    }
    var rowAudits=doc.rows.map(auditRow);
    var fileAudits=issues.filter(function(c){return !c.key;}).map(function(c){
      return {id:'FILE:'+c.id,key:'',scope:'file',sheet:c.sheet,row:c.row,refs:c.refs||c.expected||'文件范围',model:'',specification:'',package:'',quantity:'',inductorStatus:'',status:c.core?'abnormal':'unverified',abnormalFields:c.core?[c.field||'文件']:[],pendingFields:c.advisory?[c.field||'文件']:[],checkedFields:[],uncovered:[],checks:[c],confirmedChecks:[],checkIds:[c.id],finding:finding([c],'文件范围待核实'),expected:c.expected||'',suggestion:c.suggestion,evidence:c.source};
    });
    var auditRows=rowAudits.concat(fileAudits);
    var auditCounts={
      total:doc.rows.length,
      normal:rowAudits.filter(function(a){return a.status==='normal';}).length,
      confirmed:rowAudits.filter(function(a){return a.status==='confirmed';}).length,
      abnormal:rowAudits.filter(function(a){return a.status==='abnormal';}).length,
      unverified:rowAudits.filter(function(a){return a.status==='unverified';}).length
    };
    var counts={error:0,warning:0,pending:0,matched:0};checks.forEach(function(c){counts[c.status]++;});
    var categoryCounts={model:0,package:0,reference:0,quantity:0,file:0};coreIssues.forEach(function(c){categoryCounts[c.category]++;});
    var fileCounts={abnormal:fileAudits.filter(function(a){return a.status==='abnormal';}).length,unverified:fileAudits.filter(function(a){return a.status==='unverified';}).length};
    var settings=JSON.parse(JSON.stringify({roles:options.roles||{},bindings:options.bindings||{},actuals:options.actuals||[]}));
    if(materialLibrary)settings.materialLibrary={status:materialLibrary.status,count:materials.records.length,source:materialLibrary.source||'公司标准库'};
    return {version:VERSION,time:new Date().toISOString(),document:{name:doc.name,hash:doc.hash,sheet:doc.sheet,headerRow:doc.headerRow,rows:doc.rows.length},source:source?{name:source.name,hash:source.hash,sheet:source.sheet}:null,checks:checks,issues:issues,coreIssues:coreIssues,advisories:advisories,rowAudits:rowAudits,auditRows:auditRows,auditCounts:auditCounts,fileCounts:fileCounts,categoryCounts:categoryCounts,counts:counts,affectedRows:unique(coreIssues.map(function(c){return c.key;}).filter(Boolean)).length,affectedRefs:unique([].concat.apply([],coreIssues.map(function(c){return refs(c.refs||c.expected).values;}))).length,sourceCoverage:source?{matchedRefs:matchedRefs.size,totalRefs:seenRefs.size}:null,settings:settings,conclusion:coreIssues.length?'发现'+auditCounts.abnormal+'行明确冲突，文件范围冲突'+fileCounts.abnormal+'项':advisories.length?'当前存在待核实事项，详见逐行依据':'当前规则覆盖的检查项通过',officialVerification:'本次执行BOM字段一致性及公司规则检查；'+(materialLibrary?'公司物料编码依据本次已加载标准库核对（状态：'+materialStatus+'，'+materials.records.length+'条编码记录）。':'未接入公司物料编码核对。')+'未重新联网核验全部商品参数；人工确认按事项承接，未覆盖范围逐行列出。'};
  }
  return {VERSION:VERSION,FIELDS:FIELDS,ALIASES:ALIASES,text:text,column:column,rowSignature:rowSignature,sourceSignature:sourceSignature,mapping:mapping,detectHeader:detectHeader,readWorkbook:readWorkbook,refs:refs,value:value,equal:equal,packageInfo:packageInfo,specData:specData,assembly:assembly,analyze:analyze};
});
