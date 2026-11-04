(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.OfflineBoardInfo=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  var labels={name:'板卡名称',model:'板卡型号',erp:'板卡 ERP',version:'BOM 版本'};
  function text(value){return value==null?'':String(value).trim();}
  function identify(value){
    var s=String(value==null?'':value),m=s.match(/^(\s*(板卡\s*名称|板卡\s*型号|板卡\s*ERP|BOM\s*版本)\s*[:：])([\s\S]*)$/i);
    if(!m){var exact=s.match(/^(\s*(板卡\s*名称|板卡\s*型号|板卡\s*ERP|BOM\s*版本)\s*)$/i);if(!exact)return null;m=[s,exact[1],exact[2],''];}
    var key=m[2].replace(/\s/g,'').toUpperCase(),field=key==='板卡名称'?'name':key==='板卡型号'?'model':key==='板卡ERP'?'erp':'version';
    return {field:field,prefix:m[1],value:text(m[3]),colon:/[:：]\s*$/.test(m[1])};
  }
  function locations(wb,X){
    var found=[];
    wb.SheetNames.filter(function(name){return !/补齐报告|审查|修改记录/.test(name);}).forEach(function(name){
      var sheet=wb.Sheets[name],range=X.utils.decode_range(sheet['!ref']||'A1'),end=Math.min(range.e.r,49);
      for(var r=range.s.r;r<=end;r++){
        var row=[];for(var col=range.s.c;col<=range.e.c;col++)row.push(text((sheet[X.utils.encode_cell({r:r,c:col})]||{}).v));
        if(row.some(function(s){return /^(位号|Designator位号|Designator|Reference|位置编号|Ref|RefDes)$/i.test(s.replace(/\s/g,''));})&&row.some(function(s){return /^(型号|原厂型号|Comment型号|Comment|Value|规格型号|LibRef|Part)$/i.test(s.replace(/\s/g,''));}))break;
        for(var c=range.s.c;c<=range.e.c;c++){
          var address=X.utils.encode_cell({r:r,c:c}),cell=sheet[address],label=identify(cell&&cell.v);if(!label)continue;
          var merged=(sheet['!merges']||[]).find(function(m){return m.s.r===r&&m.s.c===c;}),nextCol=merged?merged.e.c+1:c+1;
          var nextAddress=X.utils.encode_cell({r:r,c:nextCol}),next=sheet[nextAddress],nextIsLabel=identify(next&&next.v)||/^(?:说明|拟\s*制|审\s*核|批\s*准|项目名称|编\s*制|日\s*期|修订记录|版本号)\s*[:：]/.test(text(next&&next.v));
          var separate=!label.value&&next&&!nextIsLabel&&text(next.v)!=='';
          if(!label.colon&&!label.value&&!separate&&nextCol<=range.e.c&&!nextIsLabel)separate=true;
          found.push({sheet:name,field:label.field,labelCell:address,cell:separate?nextAddress:address,inline:!separate,prefix:label.prefix+(label.colon?' ':'： '),value:separate?text(next&&next.v):label.value});
        }
      }
    });return found;
  }
  function readSource(wb,X){
    var entries=wb?locations(wb,X):[],values={},conflicts={},sources={};
    Object.keys(labels).forEach(function(field){
      var rows=entries.filter(function(e){return e.field===field&&e.value;}),unique=Array.from(new Set(rows.map(function(e){return e.value;})));
      if(unique.length===1){values[field]=unique[0];sources[field]=rows.map(function(e){return e.sheet+'!'+e.cell;}).join('、');}
      if(unique.length>1){values[field]='';conflicts[field]=rows.map(function(e){return e.sheet+'!'+e.cell+'：'+e.value;});}
    });return {values:values,conflicts:conflicts,sources:sources};
  }
  function prefill(filenameInfo,wb,X){
    var source=readSource(wb,X),result={sources:{},conflicts:source.conflicts};filenameInfo=filenameInfo||{};
    Object.keys(labels).forEach(function(field){
      if(source.conflicts[field]){result[field]='';result.sources[field]='源文件存在冲突，请人工填写';}
      else if(source.values[field]){result[field]=source.values[field];result.sources[field]='源文件 '+source.sources[field];}
      else {result[field]=field==='model'?'':text(filenameInfo[field]);result.sources[field]=result[field]?'文件名':'未识别，请填写或留空';}
    });return result;
  }
  function escapeXml(value){return String(value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');}
  function decodeXml(value){return String(value).replace(/&#x([0-9a-f]+);/gi,function(_,n){return String.fromCodePoint(parseInt(n,16));}).replace(/&#(\d+);/g,function(_,n){return String.fromCodePoint(Number(n));}).replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&amp;/g,'&');}
  function attributes(tag){var result={};tag.replace(/([\w:.-]+)\s*=\s*(["'])(.*?)\2/g,function(_,key,q,value){result[key]=decodeXml(value);});return result;}
  function sheetPaths(workbookXml,relsXml){
    var rels={};(relsXml.match(/<Relationship\b[^>]*\/?\s*>/g)||[]).forEach(function(tag){var a=attributes(tag);if(a.TargetMode==='External')return;var target=a.Target||'',parts=(target.charAt(0)==='/'?target.slice(1):'xl/'+target).split('/'),clean=[];parts.forEach(function(p){if(p==='..')clean.pop();else if(p&&p!=='.')clean.push(p);});rels[a.Id]=clean.join('/');});
    var paths={};(workbookXml.match(/<sheet\b[^>]*\/?\s*>/g)||[]).forEach(function(tag){var a=attributes(tag);paths[a.name]=rels[a['r:id']];});return paths;
  }
  function putCell(xml,address,value,X){
    if(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(value))throw new Error('板卡信息含Excel不支持的控制字符，请清理后重试。');
    if(value.length>32767)throw new Error('板卡字段超过Excel单元格长度限制。');
    var re=new RegExp('<c\\b(?=[^>]*\\br="'+address+'")([^>]*?)(?:\\/>|>[\\s\\S]*?<\\/c>)'),old=xml.match(re),attrs=old?old[1]:' r="'+address+'"';
    attrs=attrs.replace(/\s+t="[^"]*"/g,'');
    var cell='<c'+attrs+' t="inlineStr"><is><t xml:space="preserve">'+escapeXml(value)+'</t></is></c>';
    if(old)return xml.replace(re,function(){return cell;});
    var pos=X.utils.decode_cell(address),rowRe=new RegExp('<row\\b(?=[^>]*\\br="'+(pos.r+1)+'")[^>]*>[\\s\\S]*?<\\/row>'),row=xml.match(rowRe);
    if(!row)throw new Error('模板缺少板卡信息所在行：'+address);
    var inserted=false,newRow=row[0].replace(/<c\b[^>]*\br="([A-Z]+\d+)"[^>]*(?:\/>|>[\s\S]*?<\/c>)/g,function(original,ref){if(!inserted&&X.utils.decode_cell(ref).c>pos.c){inserted=true;return cell+original;}return original;});
    if(!inserted)newRow=newRow.replace('</row>',cell+'</row>');return xml.replace(row[0],function(){return newRow;});
  }
  async function patch(zip,X,info){
    var before=X.read(await zip.generateAsync({type:'uint8array'}),{type:'array'}),entries=locations(before,X);
    // Missing values are permitted; missing template destinations are a template error.
    var cover=before.SheetNames.find(function(name){return /封面/.test(name);}),detail=before.SheetNames.find(function(name){return /BOM/i.test(name)&&!/审查|修改记录|补齐报告/.test(name);});
    if(!cover||!detail||cover===detail)throw new Error('模板缺少封面或BOM明细表，无法保证板卡信息一致。');
    [[cover,['name','erp','version']],[detail,Object.keys(labels)]].forEach(function(pair){pair[1].forEach(function(field){if(!entries.some(function(e){return e.sheet===pair[0]&&e.field===field;}))throw new Error('模板缺少'+pair[0]+'的'+labels[field]+'位置，无法保证封面与明细一致。');});});
    var paths=sheetPaths(await zip.file('xl/workbook.xml').async('string'),await zip.file('xl/_rels/workbook.xml.rels').async('string')),expected=[];
    for(var name of Array.from(new Set(entries.map(function(e){return e.sheet;})))){
      var path=paths[name];if(!path||!zip.file(path))throw new Error('模板工作表路径无效：'+name);
      var xml=await zip.file(path).async('string');
      entries.filter(function(e){return e.sheet===name;}).forEach(function(entry){var value=(entry.inline?entry.prefix:'')+text(info[entry.field]);xml=putCell(xml,entry.cell,value,X);expected.push({sheet:name,cell:entry.cell,value:value,field:entry.field});});
      zip.file(path,xml);
    }
    var after=X.read(await zip.generateAsync({type:'uint8array'}),{type:'array'});
    expected.forEach(function(e){if(String((after.Sheets[e.sheet][e.cell]||{}).v||'')!==e.value)throw new Error('板卡信息写入核对失败：'+e.sheet+'!'+e.cell);});
    var checked=locations(after,X);if(checked.length!==entries.length)throw new Error('板卡字段位置发生变化，请检查模板。');
    checked.forEach(function(e){if(e.value!==text(info[e.field]))throw new Error('板卡信息不一致或残留模板值：'+e.sheet+'!'+e.cell);});
    return {verified:true,locations:expected.map(function(e){return e.sheet+'!'+e.cell+' '+labels[e.field];}),fields:{name:text(info.name),model:text(info.model),erp:text(info.erp),version:text(info.version)}};
  }
  return {labels:labels,identify:identify,locations:locations,readSource:readSource,prefill:prefill,patch:patch};
});
