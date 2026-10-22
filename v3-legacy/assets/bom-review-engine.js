(function(root, factory){
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BOMReview = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(){
  'use strict';
  var VERSION = '1.1.0';
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
  function code(v){ var m=text(v).toUpperCase().match(/^C\d{3,}$/); return m ? m[0] : ''; }
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
    return {name:options.name||'',hash:options.hash||'',sheet:sheetName,headerRow:header+1,headers:headers,mapping:map,rows:rows,metadata:metadata};
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
    var v=value(fields['容值']||fields['电容值']||fields['电容量']||'', 'capacitor')
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
        if(!/X[5678][RS]|C0G|COG|NP0|NPO|Y5[UV]/i.test(s))missing.push('介质');
      }
    }
    return missing;
  }
  function hasExactSmallCapTolerance(raw){
    var match=text(raw).replace(/[µμ]/g,'u').match(/±\s*(\d+(?:\.\d+)?)\s*pF(?=$|[\s,，;；/|])/i);
    return !!match&&Math.abs(Number(match[1])-0.1)<=1e-9;
  }
  function analyze(doc, source, options){
    options=options||{};
    var checks=[], index=new Map(), sourceIndex=new Map(), codes=new Map(), seq=0;
    function emit(row,rule,status,field,message,expected,origin){
      checks.push({id:'R'+(++seq),rule:rule,status:status,sheet:row?row.sheet:doc.sheet,row:row?row.row:doc.headerRow,key:row?row.key:'',refs:row?text(row.values['位号']):'',cell:row?(row.cells[field]||''): '',field:field||'',observed:row?text(row.values[field]):'',expected:text(expected),message:message,source:origin||'线下BOM本地规则'});
    }
    if(!doc.rows.length)emit(null,'EMPTY_BOM','error','','未识别到有效物料行');
    var selected=Object.keys(doc.mapping).map(function(f){return doc.mapping[f];}).filter(function(n){return n!=null&&n>=0;});
    if(unique(selected).length!==selected.length)emit(null,'MAPPING_COLLISION','pending','','多个字段映射到同一列，请核实字段映射');
    var versions=unique((doc.metadata||[]).filter(function(s){return /BOM版本|版本[:：]|REV/i.test(s);}).map(function(s){var m=s.match(/(?:版本|REV)\s*[:：]?\s*[Vv]?(\d+(?:\.\d+)+)/i);return m?m[1]:'';}).filter(Boolean));
    if(versions.length>1)emit(null,'VERSION_CONFLICT','warning','','封面或明细中的版本标识不一致',versions.join(' / '),'文件内容');
    ['型号','参数描述','封装','位号','数量'].forEach(function(field){if(doc.mapping[field]==null)emit(null,'MISSING_COLUMN','pending',field,'未映射'+field+'列，对应检查未完成');});
    if(source){source.rows.forEach(function(row){if(rowRole(row,{})!=='main')return;unique(refs(row.values['位号']).values).forEach(function(ref){if(!sourceIndex.has(ref))sourceIndex.set(ref,[]);sourceIndex.get(ref).push(row);});});}
    var matchedRefs=new Set(), seenRefs=new Set();
    doc.rows.forEach(function(row){
      var v=row.values, role=rowRole(row,options), split=refs((role==='alternative'&&options.bindings&&options.bindings[row.key])||v['位号']), rr=split.values, main=role==='main';
      var mv=modelValue(row), sd=specData(v['参数描述']), fp=packageInfo(v['封装']), excluded=assembly(row);
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
      if(mv&&!excluded.excluded&&role!=='nonplacement'){
        var named=/电阻|resistor/i.test(v['物料名称']||'')?'resistor':/电容|capacitor|MLCC/i.test(v['物料名称']||'')?'capacitor':/电感|inductor/i.test(v['物料名称']||'')?'inductor':'';
        if(named&&named!==mv.kind)emit(row,'TYPE_CONFLICT','error','物料名称','物料名称与实际型号参数类型矛盾，需核实',mv.kind);
        var missing=missingParams(row,mv.kind,mv.number);
        if(missing.length)emit(row,'PARAMETERS_MISSING','pending','参数描述',missing.join('、')+'待核实；不根据封装或默认值推断');
        if(mv.kind==='capacitor'&&mv.number>0&&mv.number/1e-12<10&&!hasExactSmallCapTolerance(v['参数描述']))emit(row,'SMALL_CAP_TOLERANCE','error','参数描述','公司硬性规则：小于10pF电容必须明确使用±0.1pF精度','±0.1pF');
      }
      if(/待核实|待确认/.test(text(v['备注'])))emit(row,'PENDING_NOTE','pending','备注','原BOM已有待核实/待确认标记');
      var material=text(v['物料编码']);
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
          if(mv&&smv&&!equal(mv,smv))emit(row,'SOURCE_VALUE',actual?'matched':'warning','型号',actual?'实际装配变更已确认：'+actual.reason:'实际型号参数与原始BOM存在来源冲突',sv['型号'],origin);
          else if(mv&&smv)emit(row,'SOURCE_VALUE','matched','型号','与原始BOM的阻容/电感值相符',sv['型号'],origin);
          // 非阻容感器件的源表 Value、商品型号和公司型号常使用不同命名口径；
          // 无法解析为实际参数时不做纯文字差异告警，避免把正常转换结果误报为型号错误。
          if(fp&&sp&&fp.key&&sp.key&&fp.key!==sp.key)emit(row,'SOURCE_PACKAGE',fp.standard&&sp.standard?'error':'pending','封装','与原始BOM封装标识不同，需核实尺寸或自定义焊盘别名',sv['封装'],origin);
          else if(fp&&sp&&fp.key&&sp.key)emit(row,'SOURCE_PACKAGE','matched','封装','与原始BOM封装相符',sv['封装'],origin);
          if(code(v['立创编号'])&&code(sv['立创编号'])&&code(v['立创编号'])!==code(sv['立创编号']))emit(row,'SOURCE_CODE',actual?'pending':'warning','立创编号',actual?'已确认装配变更，当前编号仍需商品数据核实':'与原始BOM立创编号不同',sv['立创编号'],origin);
          // 线下BOM模板不要求保留立创编号，缺少该字段不作为审查问题。
        });
      }
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
      return '';
    }
    checks.forEach(function(c){
      c.category=category(c);
      c.core=!!c.category;
      c.suggestion=c.status==='matched'?'保留核对记录':({
        model:'按实际器件型号和公司规则修正型号或参数描述',
        package:'统一型号、参数描述和封装列中的实际封装',
        reference:'按原始BOM修正位号，去除重复或补齐遗漏',
        quantity:'将数量修正为去重后的主料位号数量',
        file:'确认文件、工作表和字段识别设置后重新审查'
      }[c.category]||(c.status==='error'?'对照原单元格及实际装配资料修订后复审':'补充可靠来源后复审'));
      c.resolution=c.status==='matched'?'本检查项相符':c.status==='pending'?'待核实':'待处理';
    });
    var issues=checks.filter(function(c){return c.status!=='matched';});
    var coreIssues=issues.filter(function(c){return c.core;});
    var counts={error:0,warning:0,pending:0,matched:0};checks.forEach(function(c){counts[c.status]++;});
    var categoryCounts={model:0,package:0,reference:0,quantity:0,file:0};coreIssues.forEach(function(c){categoryCounts[c.category]++;});
    return {version:VERSION,time:new Date().toISOString(),document:{name:doc.name,hash:doc.hash,sheet:doc.sheet,headerRow:doc.headerRow,rows:doc.rows.length},source:source?{name:source.name,hash:source.hash,sheet:source.sheet}:null,checks:checks,issues:issues,coreIssues:coreIssues,categoryCounts:categoryCounts,counts:counts,affectedRows:unique(coreIssues.map(function(c){return c.key;}).filter(Boolean)).length,affectedRefs:unique([].concat.apply([],coreIssues.map(function(c){return refs(c.refs||c.expected).values;}))).length,sourceCoverage:source?{matchedRefs:matchedRefs.size,totalRefs:seenRefs.size}:null,settings:JSON.parse(JSON.stringify(options)),conclusion:coreIssues.length?'发现'+coreIssues.length+'处需处理问题':'审查通过，可以导出',officialVerification:'关键器件沿用转换阶段的标准库及商品核验结果'};
  }
  return {VERSION:VERSION,FIELDS:FIELDS,ALIASES:ALIASES,text:text,column:column,mapping:mapping,detectHeader:detectHeader,readWorkbook:readWorkbook,refs:refs,value:value,equal:equal,packageInfo:packageInfo,specData:specData,assembly:assembly,analyze:analyze};
});
