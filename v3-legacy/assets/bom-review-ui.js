(function(){
  'use strict';
  var E=window.BOMReview;
  if(!E)return;
  var state={primary:null,source:null,result:null,roles:{},bindings:{},serial:{primary:0,source:0},last:null};
  function el(id){return document.getElementById(id);}
  function html(v){return E.text(v).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}
  function message(s,cls){el('reviewMessage').textContent=s;el('reviewMessage').className='review-message '+(cls||'');}
  function invalidate(){
    state.result=null;el('reviewExport').disabled=true;el('reviewResults').hidden=true;
    el('reviewRun').disabled=!state.primary;
    message(state.primary?'输入或设置已变化，请重新审查。':'请上传待审查线下BOM。','stale');
  }
  async function digest(bytes){
    if(window.crypto&&crypto.subtle){var hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');}
    return '无法生成SHA256；本次独立会话 '+Date.now();
  }
  function editor(side){
    var item=state[side], host=el(side==='primary'?'reviewPrimaryConfig':'reviewSourceConfig');
    if(!item){host.innerHTML='';return;}
    var d=item.doc;
    host.innerHTML='<div class="review-file-meta">'+html(d.name)+' · '+d.rows.length+'行物料<br>SHA256：'+html(d.hash)+'</div>'
      +'<details class="review-details"><summary>文件识别设置（已自动识别，一般无需修改）</summary>'
      +'<div class="review-config"><label>工作表 <select data-review-sheet="'+side+'">'+item.wb.SheetNames.map(function(n){return '<option '+(n===d.sheet?'selected':'')+'>'+html(n)+'</option>';}).join('')+'</select></label>'
      +'<label>表头行 <input type="number" min="1" value="'+d.headerRow+'" data-review-header="'+side+'"></label></div><div class="review-map">'
      +E.FIELDS.map(function(f){return '<label>'+html(f)+'<select data-review-map="'+side+'" data-field="'+html(f)+'"><option value="-1">未映射</option>'+d.headers.map(function(h,i){return '<option value="'+i+'" '+(d.mapping[f]===i?'selected':'')+'>'+E.column(i)+' · '+html(h||'(空表头)')+'</option>';}).join('')+'</select></label>';}).join('')+'</div></details>';
  }
  function parseItem(side,opts){
    var item=state[side];if(!item)return;
    item.valid=false;
    item.doc=E.readWorkbook(item.wb,XLSX,Object.assign({name:item.name,hash:item.hash},opts||{}));
    item.valid=true;
    editor(side);invalidate();if(side==='primary')preview();
  }
  async function load(side,file){
    var sequence=++state.serial[side];state[side]=null;invalidate();editor(side);
    if(side==='primary'){state.roles={};state.bindings={};el('reviewActuals').value='';preview();}
    if(!file)return;
    try{
      message('正在读取 '+file.name+'…');
      if(typeof XLSX==='undefined')throw new Error('Excel读取组件未加载，请刷新后重试');
      var bytes=await file.arrayBuffer(), hash=await digest(bytes);
      if(sequence!==state.serial[side])return;
      var wb=XLSX.read(bytes,{type:'array',cellStyles:true});
      state[side]={wb:wb,name:file.name,hash:hash};
      parseItem(side);
      message('已读取文件并自动识别字段，可以开始审查。');
    }catch(error){if(sequence!==state.serial[side])return;state[side]=null;editor(side);invalidate();message('读取失败：'+error.message,'error');}
  }
  function preview(){
    var host=el('reviewRowBody'), d=state.primary&&state.primary.doc;
    if(!d){host.innerHTML='';el('reviewPreviewInfo').textContent='';return;}
    var term=el('reviewRowSearch').value.trim().toLowerCase();
    var rows=d.rows.filter(function(r){return !term||String(r.row)===term||E.text(r.values['位号']).toLowerCase().includes(term)||E.text(r.values['型号']).toLowerCase().includes(term);});
    el('reviewPreviewInfo').textContent='共'+d.rows.length+'行，当前显示'+Math.min(rows.length,100)+'/'+rows.length+'行；审查处理全部数据。可搜索原行号或位号设置行类别。';
    host.innerHTML=rows.slice(0,100).map(function(r){return '<tr><td>'+r.row+'</td><td>'+html(r.values['位号'])+'</td><td>'+html(r.values['型号'])+'</td><td>'+html(r.values['数量'])+'</td><td><select data-review-role="'+html(r.key)+'">'+[['auto','自动识别'],['main','主料'],['alternative','替代料'],['nonplacement','PCB/配件/非贴片']].map(function(pair){return '<option value="'+pair[0]+'" '+((state.roles[r.key]||'auto')===pair[0]?'selected':'')+'>'+pair[1]+'</option>';}).join('')+'</select></td><td><input data-review-binding="'+html(r.key)+'" value="'+html(state.bindings[r.key]||'')+'" placeholder="替代料关联位号" aria-label="第'+r.row+'行关联位号"></td></tr>';}).join('');
  }
  function actuals(){
    return el('reviewActuals').value.split(/\n/).map(function(line){return line.trim();}).filter(Boolean).map(function(line,i){
      var parts=line.split('|').map(function(s){return s.trim();});
      if(parts.length!==4||!E.refs(parts[0]).values.length||E.refs(parts[0]).invalid.length||!E.value(parts[1])||!E.packageInfo(parts[2])||!E.packageInfo(parts[2]).key||!parts[3])throw new Error('装配说明第'+(i+1)+'行格式应为：位号 | 实际型号/数值 | 封装 | 确认原因');
      return {refs:parts[0],model:parts[1],package:parts[2],reason:parts[3]};
    });
  }
  function run(){
    if(!state.primary)return;
    if(!state.primary.valid||(state.source&&!state.source.valid)){invalidate();message('字段设置无效，请修正后再审查。','error');return;}
    try{
      state.result=E.analyze(state.primary.doc,state.source&&state.source.doc,{roles:state.roles,bindings:state.bindings,actuals:actuals()});
      el('reviewResults').hidden=false;el('reviewExport').disabled=false;
      var r=state.result;
      el('reviewSummary').innerHTML=[['model','型号 / 参数'],['package','封装'],['reference','位号'],['quantity','数量'],['file','文件 / 规则']].map(function(pair){return '<div class="review-metric '+(r.categoryCounts[pair[0]]?'review-error':'review-pass')+'"><strong>'+r.categoryCounts[pair[0]]+'</strong><span>'+pair[1]+'</span></div>';}).join('');
      el('reviewConclusion').className='review-result-note '+(r.coreIssues.length?'review-result-fail':'review-result-pass');
      el('reviewConclusion').innerHTML=r.coreIssues.length
        ? '<strong>发现 '+r.coreIssues.length+' 处需要处理的问题</strong><br>请按下面明细修正型号参数、封装、位号或数量后重新审查。'
        : '<strong>审查通过，可以导出</strong><br>型号与参数描述、封装、位号和数量未发现明确错误。';
      el('reviewEvidence').hidden=true;renderResults();message('审查完成。可查看原始单元格和依据，或导出本次报告。');
    }catch(error){invalidate();message('无法完成审查：'+error.message,'error');}
  }
  var labels={error:'错误',warning:'需确认',pending:'需确认',matched:'已核对'};
  var categoryLabels={model:'型号 / 参数',package:'封装',reference:'位号',quantity:'数量',file:'文件 / 规则'};
  function renderResults(){
    if(!state.result)return;
    var filter=el('reviewFilter').value, term=el('reviewSearch').value.trim().toLowerCase();
    var rows=state.result.coreIssues.filter(function(c){return (filter==='all'||c.category===filter)&&(!term||[c.refs,c.row,c.rule,c.message,c.field,c.observed,c.expected].join(' ').toLowerCase().includes(term));});
    el('reviewResultCount').textContent='已检查 '+state.result.checks.length+' 项，当前显示 '+rows.length+' 个问题';
    el('reviewResultBody').innerHTML=rows.slice(0,500).map(function(c){return '<tr><td><button class="review-action-link" data-review-evidence="'+c.id+'">第'+html(c.row)+'行'+(c.cell?' · '+html(c.cell):'')+'</button></td><td>'+html(c.refs||'文件范围')+'</td><td><span class="review-issue-badge review-'+c.status+'">'+labels[c.status]+'</span><br>'+html(categoryLabels[c.category]||c.field)+'</td><td>'+html(c.observed||'缺失')+'</td><td>'+html(c.expected||'按型号、源BOM或公司规则修正')+'</td><td>'+html(c.message)+'<div class="review-suggestion">'+html(c.suggestion)+'</div></td></tr>';}).join('')||'<tr><td colspan="6" class="review-empty">当前没有需要处理的问题。</td></tr>';
  }
  function evidence(id){
    if(!state.result)return;
    var c=state.result.checks.find(function(x){return x.id===id;}), row=c&&state.primary.doc.rows.find(function(x){return x.key===c.key;});
    if(!c)return;
    el('reviewEvidence').hidden=false;
    el('reviewEvidence').innerHTML='<h4>第 '+c.row+' 行 · '+html(c.refs||'文件范围')+'</h4><p>'+html(c.message)+'</p><p>建议修正为：'+html(c.expected||'请按实际器件资料确认')+'</p>'
      +(row?'<div class="review-table-wrap"><table class="review-table"><thead><tr><th>字段</th><th>原单元格</th><th>原始内容</th></tr></thead><tbody>'+E.FIELDS.filter(function(f){return row.cells[f];}).map(function(f){return '<tr><td>'+html(f)+'</td><td>'+html(row.cells[f])+'</td><td>'+html(row.values[f])+'</td></tr>';}).join('')+'</tbody></table></div>':'');
    el('reviewEvidence').scrollIntoView({behavior:'smooth',block:'nearest'});
  }
  function exportReport(){
    if(!state.result)return;
    try{
      var r=state.result, wb=XLSX.utils.book_new();
      var overview=[['项目','内容'],['文件',r.document.name],['物料行数',r.document.rows],['审查结论',r.conclusion],['需处理问题',r.coreIssues.length],['型号/参数',r.categoryCounts.model],['封装',r.categoryCounts.package],['位号',r.categoryCounts.reference],['数量',r.categoryCounts.quantity],['文件/规则',r.categoryCounts.file],['源文件',r.source?r.source.name:'未提供'],['规则版本',r.version]];
      var header=['原行号','原单元格','位号','检查项','当前内容','正确内容','问题说明','处理建议'];
      var details=[header].concat(r.coreIssues.map(function(c){return [c.row,c.cell,c.refs,categoryLabels[c.category]||c.field,c.observed,c.expected,c.message,c.suggestion];}));
      [['审查结论',overview],['问题明细',details]].forEach(function(pair){var sheet=XLSX.utils.aoa_to_sheet(pair[1]);sheet['!cols']=pair[0]==='审查结论'?[{wch:25},{wch:90}]:[{wch:10},{wch:12},{wch:24},{wch:18},{wch:38},{wch:38},{wch:65},{wch:50}];XLSX.utils.book_append_sheet(wb,sheet,pair[0]);});
      XLSX.writeFile(wb,'线下BOM审查报告_'+new Date().toISOString().replace(/[:.]/g,'-')+'.xlsx');
    }catch(error){message('报告导出失败：'+error.message,'error');}
  }
  function remember(headers, rows, source, name){
    state.last={headers:headers.slice(),rows:rows.map(function(r){return r.slice();}),source:source?{rows:JSON.parse(JSON.stringify(source.rows||[])),fm:Object.assign({},source.fm),_fn:source._fn,_reviewWorkbook:source._reviewWorkbook,_reviewBytes:source._reviewBytes}:null,name:name};
    var button=el('reviewLastBtn');if(button)button.disabled=false;
  }
  async function useLast(){
    if(!state.last)return;
    var last=state.last;
    var wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.aoa_to_sheet([last.headers].concat(last.rows)),'整理后BOM');
    var sequence=++state.serial.primary, sourceSequence=++state.serial.source;state.roles={};state.bindings={};el('reviewActuals').value='';
    state.source=null;editor('source');el('reviewFile').value='';el('reviewSourceFile').value='';
    state.primary={wb:wb,name:last.name||'刚生成的线下BOM.xlsx',hash:'内存数据；请导出原文件获取文件SHA256'};parseItem('primary',{headerRow:1});
    state.source=null;
    if(last.source&&last.source._reviewWorkbook){
      var sourceHash=last.source._reviewBytes?await digest(last.source._reviewBytes):'原始工作簿会话数据';
      if(sequence!==state.serial.primary||sourceSequence!==state.serial.source)return;
      state.source={wb:last.source._reviewWorkbook,name:last.source._fn||'本次原始立创BOM',hash:sourceHash};parseItem('source');
    }else if(last.source&&last.source.rows){
      var fields=Object.keys(last.source.fm||{});if(!fields.length)fields=E.FIELDS;
      var swb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(swb,XLSX.utils.aoa_to_sheet([fields].concat(last.source.rows.map(function(r){return fields.map(function(f){return r[f]||'';});}))),'原始立创BOM');
      state.source={wb:swb,name:last.source._fn||'本次立创BOM',hash:'转换会话数据（非原始文件摘要）'};parseItem('source',{headerRow:1});
    }else editor('source');
    showPanelDirect('review');run();message('已自动审查刚生成的线下BOM；默认只显示需要处理的问题。');
  }
  function boot(){
    if(!el('reviewPanel'))return;
    el('reviewFile').addEventListener('change',function(){load('primary',this.files[0]);});
    el('reviewSourceFile').addEventListener('change',function(){load('source',this.files[0]);});
    el('reviewClearSource').addEventListener('click',function(){state.serial.source++;state.source=null;el('reviewSourceFile').value='';editor('source');invalidate();});
    el('reviewRun').addEventListener('click',run);el('reviewExport').addEventListener('click',exportReport);
    el('reviewLastBtn').addEventListener('click',useLast);
    el('reviewFilter').addEventListener('change',renderResults);el('reviewSearch').addEventListener('input',renderResults);
    el('reviewRowSearch').addEventListener('input',preview);el('reviewActuals').addEventListener('input',invalidate);
    el('reviewPanel').addEventListener('click',function(ev){var target=ev.target.closest('[data-review-evidence]');if(target)evidence(target.dataset.reviewEvidence);});
    el('reviewPanel').addEventListener('change',function(ev){
      var t=ev.target;
      try{
        if(t.dataset.reviewSheet){parseItem(t.dataset.reviewSheet,{sheet:t.value});}
        else if(t.dataset.reviewHeader){var side=t.dataset.reviewHeader;parseItem(side,{sheet:state[side].doc.sheet,headerRow:Number(t.value)});}
        else if(t.dataset.reviewMap){var s=t.dataset.reviewMap, map={};el(s==='primary'?'reviewPrimaryConfig':'reviewSourceConfig').querySelectorAll('[data-review-map]').forEach(function(select){if(Number(select.value)>=0)map[select.dataset.field]=Number(select.value);});parseItem(s,{sheet:state[s].doc.sheet,headerRow:state[s].doc.headerRow,mapping:map});}
        else if(t.dataset.reviewRole){state.roles[t.dataset.reviewRole]=t.value;invalidate();}
        else if(t.dataset.reviewBinding){state.bindings[t.dataset.reviewBinding]=t.value;invalidate();}
      }catch(error){invalidate();message('设置无效：'+error.message,'error');}
    });
    invalidate();
  }
  window.BOM_REVIEW_UI={state:state,load:load,run:run,remember:remember,useLast:useLast,exportReport:exportReport};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
