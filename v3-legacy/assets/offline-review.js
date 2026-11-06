// 本次上传的人工确认只保存在内存；重新上传、源资料或查询结果变化后失效。
var OFFLINE_REVIEW_STATE = {owner:null, signature:'', result:null, issues:[], decisions:Object.create(null)};
var OFFLINE_REVIEW_FIELDS = ['型号','位号','封装','立创编号','物料编码','物料名称','参数描述','品牌','数量','单位','备注','_mfgPart','原厂型号','productModel'];
var OFFLINE_REVIEW_EDIT_FIELDS = ['型号','封装','立创编号','参数描述','品牌'];

function offlineHasBrand(value) {
  var brand = String(value == null ? '' : value).normalize('NFKC').trim();
  return !!brand && !isCatalogPlaceholderValue(brand)
    && !/^(?:未知|无|暂无|待定|待补充|待确认|待核实|未提供|未指定|不详|通用|国产|N\/A|NA|NULL|NONE|TBD|[-—_/？?]+)$/i.test(brand);
}
function offlineNeedsInductorBrand(row) {
  var actual = explicitPassiveType(row['型号'] || '');
  if (actual && actual !== 'inductor') return false;
  return isInductorAuthorityRow(row)
    || /电感|磁珠|共模|\binductor\b|\bferrite\b|\bchoke\b/i.test(
      [row['物料名称'], row['参数描述'], row._officialProductType].filter(Boolean).join(' '));
}
function offlineBrandTarget(row) {
  var choice = findRfInductorPreference(row);
  return JSON.stringify([offlineReviewIdentitySignature(row), choice.mode === 'exact' ? choice.record : null]);
}
function offlineApplyManualBrand(row, source, details) {
  var record = source._offlineManualBrand;
  if (!record || record.target !== offlineBrandTarget(source) || !offlineHasBrand(record.brand)) return;
  row['品牌'] = record.brand;
  details.push({ref:row['位号'] || '', model:row['型号'] || '', level:'manual', filled:['品牌'],
    warnings:['工程师本次补填品牌：' + record.brand + '；时间：' + record.time]});
}

function offlineReviewEscapeAttribute(value) {
  return String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
function offlineReviewModelEvidence(row,code) {
  return convPackageBatchLibraryEvidence(Object.assign({},row,{comment:row['型号'],model:row['型号'],matchedFromLcscLibrary:true}),code);
}
function offlineReviewSourceSignature(row) {
  return JSON.stringify(OFFLINE_REVIEW_FIELDS.map(function(key){ return row && row[key] != null ? row[key] : ''; }));
}
function offlineReviewSourceRow(index) {
  return B && (B._offlineSourceRows && B._offlineSourceRows[index] || B.rows[index]);
}
function offlineReviewIdentitySignature(row) {
  return JSON.stringify(['型号','封装','位号','立创编号'].map(function(k){return row && row[k] || '';}));
}
function offlineReviewSignature() {
  return JSON.stringify([B && B._fn, (B && B.rows || []).map(offlineReviewSourceSignature),
    materialDB_standard, materialDB_rf_inductor, materialDB_lcsc, window.BOM_STANDARD_SYNC || null]);
}
function resetOfflineReview() {
  OFFLINE_REVIEW_STATE = {owner:B, signature:'', result:null, issues:[], decisions:Object.create(null)};
  var modal = document.getElementById('offlineReviewModal');
  if (modal) modal.style.display = 'none';
}
function offlineReviewAdd(issues, index, kind, reason, data, fields) {
  if (issues.some(function(item){return item.sourceIndex === index && item.kind === kind && (item.reason === reason || kind === 'package' || kind === 'source');})) return;
  var row = index >= 0 && B ? B.rows[index] : null;
  var item = {sourceIndex:index, kind:kind, reason:reason, official:data || null, fields:fields || [],
    ref:row ? row['位号'] || '-' : '整份BOM', model:row ? row['型号'] || '' : '',
    package:row ? row['封装'] || '' : '', lcsc:row ? row['立创编号'] || '' : ''};
  var authority = row ? findRfInductorPreference(row) : {mode:'none'};
  item.key = JSON.stringify([index,kind,reason,offlineReviewSourceSignature(row),
    data && data.productCode,data && data.productModel,data && data.package,data && data.specification,data && data._extracted,data && data.productType,data && data.paramLinkedMap,
    authority.mode === 'exact' ? authority.record : null]);
  issues.push(item);
}
function offlineReviewConfirmed(item) {
  var record = OFFLINE_REVIEW_STATE.decisions[item.key];
  return item.kind !== 'hard' && item.kind !== 'brand' && !!(record && record.owner === B && record.signature === offlineReviewSourceSignature(B.rows[item.sourceIndex]));
}
function offlineReviewCounts() {
  var issues = OFFLINE_REVIEW_STATE.issues;
  return {hard:issues.filter(function(i){return i.kind === 'hard';}).length,
    pending:issues.filter(function(i){return i.kind !== 'hard' && !offlineReviewConfirmed(i);}).length,
    confirmed:issues.filter(offlineReviewConfirmed).length};
}
function offlineReviewSummary() {
  var c = offlineReviewCounts();
  return ' 导出核对：明确冲突 ' + c.hard + ' 项，待人工确认 ' + c.pending + ' 项，已人工确认 ' + c.confirmed + ' 项。';
}
function offlineReviewPhysicalError(source,official) {
  source=String(source || '').replace(/(\d)\s*\*\s*(?=\d)/g,'$1X');
  official=String(official || '').replace(/(\d)\s*\*\s*(?=\d)/g,'$1X');
  var error=convPackageBatchPhysicalError(source,official);
  if (error) return error;
  var pattern=/(?:^|[,，\s])(?:D|直径)\s*[=：:]?\s*(\d+(?:\.\d+)?)\s*MM/i;
  var a=String(source || '').match(pattern), b=String(official || '').match(pattern);
  if (a && b && Number(a[1]) !== Number(b[1])) return '明确封装直径不同：' + a[1] + 'mm / ' + b[1] + 'mm';
  return '';
}
function offlineReviewPackageKind(row, data) {
  return offlineReviewPhysicalError(row['封装'] || '',data && data.package || '') ? 'hard' : 'package';
}
function offlineReviewBuildIssues(result) {
  var issues = [], rows = B.rows;
  (result.mismatches || []).forEach(function(mismatch){
    rows.forEach(function(row,index){
      if (String(row['位号'] || '') !== mismatch.ref) return;
      var data = result.byCode[normLcsc(mismatch.code)] || null;
      String(mismatch.reason).split('；').forEach(function(reason){
        var kind = /封装/.test(reason) && !/缺少/.test(reason) ? offlineReviewPackageKind(row,data)
          : /缺少|无法取得|未提供|缺.*编号/.test(reason) ? 'lookup' : 'hard';
        if (/缺少可核验立创编号/.test(reason)) kind = 'source';
        // 名称不同只能证明映射待核实，不能单凭文字差异认定器件不兼容。
        if (/型号.*不一致/.test(reason) && data) kind = 'model';
        offlineReviewAdd(issues,index,kind,reason,data);
      });
    });
  });
  rows.forEach(function(row,index){
    var source = offlineReviewSourceRow(index) || row;
    var rf = findRfInductorPreference(row);
    if (rf.mode === 'conflict') offlineReviewAdd(issues,index,'hard',rf.message || '公司指定库身份冲突',null);
    var code = rf.mode === 'exact' ? normLcsc(rf.record.lcsc_code) : normLcsc(row['立创编号']);
    var data = result.byCode[code];
    if (rf.mode === 'exact') {
      var libraryPhysical=offlineReviewPhysicalError(row['封装'],rf.record.package || rf.record['封装']);
      if (libraryPhysical) offlineReviewAdd(issues,index,'hard','源封装与指定库实际尺寸冲突：' + libraryPhysical,null);
    }
    if (code && !data) offlineReviewAdd(issues,index,'lookup','未取得完整立创资料；可按公司资料或源BOM保留',null);
    if (!code && (/邮寄|专用|线下采购/.test(String(row['立创编号'] || ''))
        || !String(row['物料编码'] || '').trim() && !matchForStandard(row).hit)) {
      offlineReviewAdd(issues,index,'source','无立创采购编号：保留源器件，按线下采购处理',null);
    }
    if (data && !(rf.mode === 'exact' && rfInductorHasCompanyMaterialCode(rf.record))) {
      officialPassiveErrors(source,data).forEach(function(reason){
        offlineReviewAdd(issues,index,/缺少|未提供|无法/.test(reason) ? 'lookup' : 'hard',reason,data);
      });
      var sourceModel = schematicExplicitModel(row);
      if (sourceModel && data.productModel && sourceModel !== normModel(data.productModel)) {
        var evidence = offlineReviewModelEvidence(row,normLcsc(data.productCode));
        offlineReviewAdd(issues,index,'model',
          evidence ? '型号对应关系待确认：公司立创库存在唯一同编号映射' : '型号对应关系待人工核实：源型号与商城登记型号不同，可确认保留源型号或修改本次BOM',data);
      }
      if (normLcsc(data.productCode) !== code) offlineReviewAdd(issues,index,'hard','官方返回的立创编号与当前编号不一致',data);
      var p = normPkg(row['封装']), op = normPkg(data.package);
      var physical=offlineReviewPhysicalError(row['封装'],data.package);
      if (physical) offlineReviewAdd(issues,index,'hard',physical,data);
      else if (p && op && p !== op) offlineReviewAdd(issues,index,'package','源封装与官方封装名称不同，请核对实际焊盘',data);
      if (companySmallCapPf(row) !== null) {
        var err = companySmallCapToleranceError(row,data);
        if (err) offlineReviewAdd(issues,index,'hard',err,data);
      }
    } else if (companySmallCapPf(row) !== null) {
      var hit = matchForStandard(row).hit;
      var tolerance = extractToleranceToken([source['参数描述'], hit && hit.specification].filter(Boolean).join(' '));
      if (!isExactCompanySmallCapTolerance(tolerance)) offlineReviewAdd(issues,index,'hard','小于10pF电容尚无明确±0.1pF精度依据',null);
    }
  });
  var sync = window.BOM_STANDARD_SYNC || {status:'pending'};
  if (sync.status !== 'ready' && sync.status !== 'success' && sync.status !== 'synced' || !materialDB_standard.length) {
    // 已加载的非空标准库在部分旧会话使用 done 状态。
    if (!materialDB_standard.length || /pending|loading|error/.test(sync.status)) {
      offlineReviewAdd(issues,-1,'library','公司标准库未完整同步；确认仅使用当前已加载资料和源BOM，未匹配项待核实',null);
    }
  }
  return issues;
}
function offlineReviewInheritConfirmations(issues) {
  if (typeof CONV_OUT === 'undefined' || !CONV_OUT.length || typeof CONV_SOURCE_FILE === 'undefined'
      || !CONV_SOURCE_FILE || B._fn !== jlcExportFilename(CONV_SOURCE_FILE)) return;
  issues.forEach(function(item){
    if (item.kind !== 'package' && item.kind !== 'source') return;
    if (issues.some(function(i){return i.sourceIndex === item.sourceIndex && i.kind === 'hard';})) return;
    var row=B.rows[item.sourceIndex];
    var refs=function(value){return splitRefs(value).slice().sort().join(',');};
    var matches=CONV_OUT.filter(function(out){
      return String(out.comment || '') === String(row['型号'] || '')
        && String(out.footprint || '') === String(row['封装'] || '')
        && refs(out.designator) === refs(row['位号'])
        && normLcsc(out.lcsc) === normLcsc(row['立创编号']);
    });
    if (matches.length !== 1) return;
    var out=matches[0];
    var valid=item.kind === 'package'
      ? item.official && normModel(out.officialModel) === normModel(item.official.productModel)
        && convPackageConfirmationMatches(out,item.official)
      : isConvDeferred(out);
    if (valid) OFFLINE_REVIEW_STATE.decisions[item.key]={owner:B,signature:offlineReviewSourceSignature(row),
      action:offlineReviewActionLabel(item) + '（承接本次原理图转换的有效人工确认）',time:new Date().toISOString()};
  });
}
function offlineReviewPrepare(force) {
  if (!B || !A) return Promise.resolve(null);
  if (OFFLINE_REVIEW_STATE.owner !== B) resetOfflineReview();
  if (!B._offlineSourceRows) B._offlineSourceRows = B.rows.map(function(row){return Object.assign({},row);});
  var signatures = B.rows.map(offlineReviewSourceSignature);
  var previous = OFFLINE_REVIEW_STATE.sourceSignatures;
  if (previous) Object.keys(OFFLINE_REVIEW_STATE.decisions).forEach(function(key){
    var index = JSON.parse(key)[0];
    if (index >= 0 && previous[index] !== signatures[index]) delete OFFLINE_REVIEW_STATE.decisions[key];
  });
  var owner = B, signature = offlineReviewSignature();
  if (!force && signature === OFFLINE_REVIEW_STATE.signature && OFFLINE_REVIEW_STATE.result) return Promise.resolve(OFFLINE_REVIEW_STATE);
  var currentState = OFFLINE_REVIEW_STATE;
  var requestId = currentState.requestId = (currentState.requestId || 0) + 1;
  return verifyBomAuthority(B.rows).catch(function(){
    return {byCode:Object.create(null), mismatches:[], failedCodes:B.rows.map(function(row){return normLcsc(row['立创编号']);}).filter(Boolean)};
  }).then(function(result){
    if (B !== owner || OFFLINE_REVIEW_STATE !== currentState || currentState.requestId !== requestId || offlineReviewSignature() !== signature) return null;
    B.rows.forEach(function(row){
      var evidence = row._offlineOfficialDetails;
      if (evidence && evidence.signature === offlineReviewIdentitySignature(row)) {
        var code = normLcsc(row['立创编号']);
        if (code && !result.byCode[code]) result.byCode[code] = evidence.data;
      }
    });
    var issues = offlineReviewBuildIssues(result);
    var preview = fmtCore('AB',result.byCode,{preview:true});
    (preview.brandErrors || []).forEach(function(item){
      offlineReviewAdd(issues,item.sourceIndex,'brand',
        '电感或磁珠缺少实际品牌（导出型号 ' + item.model + '），请补填品牌并重新校验',
        result.byCode[normLcsc(item.lcsc)],['品牌']);
    });
    (preview.formatErrors || []).forEach(function(item){
      // 明确冲突行不再叠加格式确认，待复核稿会原样保留。
      if (!issues.some(function(i){return i.sourceIndex === item.sourceIndex && i.kind === 'hard';})) {
        offlineReviewAdd(issues,item.sourceIndex,'parameters','缺少参数：' + item.fields.join('、') + '；可手工补齐或确认留空待核实',result.byCode[normLcsc(item.lcsc)],item.fields);
      }
    });
    Object.keys(OFFLINE_REVIEW_STATE.decisions).forEach(function(key){
      if (!issues.some(function(item){return item.key === key;})) delete OFFLINE_REVIEW_STATE.decisions[key];
    });
    issues.sort(function(a,b){return (b.kind === 'hard') - (a.kind === 'hard') || a.sourceIndex-b.sourceIndex;});
    OFFLINE_REVIEW_STATE.sourceSignatures = signatures;
    OFFLINE_REVIEW_STATE.signature = signature;
    OFFLINE_REVIEW_STATE.result = result;
    OFFLINE_REVIEW_STATE.issues = issues;
    offlineReviewInheritConfirmations(issues);
    return OFFLINE_REVIEW_STATE;
  });
}
function offlineReviewActionLabel(item) {
  return item.kind === 'model' ? '已核实型号对应关系，保留源型号及当前采购编号' : item.kind === 'package' ? '已核对实际焊盘兼容'
    : item.kind === 'source' ? '按源BOM保留，线下采购'
    : item.kind === 'parameters' ? '缺失参数留空，标记待核实'
    : item.kind === 'library' ? '采用当前资料，未匹配项待核实'
    : '采用已有资料，保留未核验标记';
}
function offlineReviewSetConfirmation(index, checked) {
  var item = OFFLINE_REVIEW_STATE.issues[index];
  if (!item || item.kind === 'hard' || item.kind === 'brand' || OFFLINE_REVIEW_STATE.owner !== B
      || OFFLINE_REVIEW_STATE.signature !== offlineReviewSignature()) return;
  if (checked) OFFLINE_REVIEW_STATE.decisions[item.key] = {owner:B,
    signature:offlineReviewSourceSignature(B.rows[item.sourceIndex]), action:offlineReviewActionLabel(item), time:new Date().toISOString()};
  else delete OFFLINE_REVIEW_STATE.decisions[item.key];
  renderOfflineReviewModal();
}
function offlineReviewConfirmKind(kind) {
  if (OFFLINE_REVIEW_STATE.owner !== B || OFFLINE_REVIEW_STATE.signature !== offlineReviewSignature()) return;
  OFFLINE_REVIEW_STATE.issues.forEach(function(item,index){
    if (item.kind === kind && item.kind !== 'hard' && item.kind !== 'brand') {
      OFFLINE_REVIEW_STATE.decisions[item.key] = {owner:B, signature:offlineReviewSourceSignature(B.rows[item.sourceIndex]),
        action:offlineReviewActionLabel(item), time:new Date().toISOString()};
    }
  });
  renderOfflineReviewModal();
}
function renderOfflineReviewModal() {
  var state = OFFLINE_REVIEW_STATE, counts = offlineReviewCounts();
  var modal = document.getElementById('offlineReviewModal');
  if (!modal) {
    modal = document.createElement('div'); modal.id = 'offlineReviewModal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9997;display:none;padding:3vh 2vw;box-sizing:border-box';
    modal.innerHTML = '<div style="max-width:1260px;margin:auto;background:white;border-radius:10px;max-height:94vh;display:flex;flex-direction:column">'
      + '<div style="padding:18px 20px;border-bottom:1px solid #ddd;display:flex;justify-content:space-between"><strong style="font-size:19px">线下BOM导出核对</strong><button type="button" onclick="closeOfflineReviewModal()" aria-label="关闭导出核对">关闭</button></div>'
      + '<div id="offlineReviewSummary" style="padding:12px 20px;background:#fff7ed"></div>'
      + '<div id="offlineReviewBulk" style="padding:8px 20px;display:flex;gap:10px;flex-wrap:wrap"></div>'
      + '<div style="overflow:auto;flex:1;padding:0 20px"><table style="border-collapse:collapse;width:100%;font-size:13px"><thead><tr style="background:#f1f5f9"><th>原行 / 位号</th><th>源BOM资料</th><th>官方资料</th><th>待处理事项</th><th style="min-width:230px">处理</th></tr></thead><tbody id="offlineReviewBody"></tbody></table></div>'
      + '<div style="padding:15px 20px;border-top:1px solid #ddd;display:flex;gap:12px;flex-wrap:wrap;justify-content:flex-end">'
      + '<button type="button" onclick="offlineReviewRefresh()">重新校验</button><button type="button" id="offlineReviewDraft" onclick="offlineReviewExport(true)">导出待复核稿</button>'
      + '<button type="button" id="offlineReviewExport" onclick="offlineReviewExport(false)" style="background:#167a48;color:white;border:0;border-radius:5px;padding:10px 18px">确认后生成线下BOM</button></div></div>';
    document.body.appendChild(modal);
  }
  document.getElementById('offlineReviewSummary').textContent = offlineReviewSummary()
    + ' 确认仅作用于本次BOM，不写物料库。明确冲突不能勾选放行，可修正本次资料或导出待复核稿。';
  var kinds = ['package','source','parameters','lookup','library','model'];
  document.getElementById('offlineReviewBulk').innerHTML = kinds.filter(function(kind){
    return state.issues.some(function(item){return item.kind === kind && !offlineReviewConfirmed(item);});
  }).map(function(kind){var item=state.issues.filter(function(i){return i.kind===kind;})[0];
    return '<button type="button" onclick="offlineReviewConfirmKind(\'' + kind + '\')">批量确认：' + esc(offlineReviewActionLabel(item)) + '</button>';
  }).join('');
  document.getElementById('offlineReviewBody').innerHTML = state.issues.map(function(item,index){
    var row = B.rows[item.sourceIndex], data = item.official;
    var official = data ? [data.productModel,data.productCode,data.package].filter(Boolean).join('；') : '未取得完整资料';
    var officialParams = data && data.specification ? '<details><summary>查看官方参数</summary>' + esc(data.specification) + '</details>' : '';
    var action = item.kind === 'hard' ? '<span style="color:#b91c1c">明确冲突：须修正后重新校验</span>'
      : item.kind === 'brand' ? '<span style="color:#9a5800">请展开下方编辑框补填实际品牌，再保存校验</span>'
      : '<label><input type="checkbox" ' + (offlineReviewConfirmed(item) ? 'checked ' : '') + 'onchange="offlineReviewSetConfirmation(' + index + ',this.checked)">'
        + esc(offlineReviewActionLabel(item)) + '</label>';
    var editor = row ? '<details style="margin-top:8px"><summary style="display:inline-block;padding:6px 10px;border:1px solid #0078b8;border-radius:4px;color:#0078b8;cursor:pointer;background:#f0f9ff">✎ 修改型号 / 编号 / 封装 / 参数 / 品牌</summary>'
      + OFFLINE_REVIEW_EDIT_FIELDS.map(function(field,j){return '<label style="display:block">' + field + '<input id="offlineEdit-' + index + '-' + j
        + '" value="' + offlineReviewEscapeAttribute(row[field]) + '" style="display:block;width:220px;box-sizing:border-box"></label>';}).join('')
      + '<button type="button" onclick="offlineReviewSaveRow(' + index + ')">保存并重新校验</button></details>' : '';
    var search = row && item.kind === 'parameters' && !offlineSupplementRfLock(row)
      ? '<button type="button" style="margin-top:8px" onclick="offlineReviewSearch(' + index + ')">搜索立创并补齐</button>' : '';
    return '<tr style="border-bottom:1px solid #ddd;vertical-align:top">'
      + '<td style="padding:10px">' + (item.sourceIndex >= 0 ? '第' + (item.sourceIndex+1) + '条 / ' : '') + esc(item.ref) + '</td>'
      + '<td style="padding:10px;word-break:break-word">' + esc([item.model,item.lcsc,item.package].filter(Boolean).join('；'))
        + (row && row['参数描述'] ? '<details><summary>查看源参数</summary>' + esc(row['参数描述']) + '</details>' : '') + '</td>'
      + '<td style="padding:10px;max-width:280px;word-break:break-word">' + esc(official) + officialParams + '</td>'
      + '<td style="padding:10px;color:' + (item.kind==='hard'?'#b91c1c':'#9a5800') + '">' + esc(item.reason) + '</td>'
      + '<td style="padding:10px">' + action + search + editor + '</td></tr>';
  }).join('');
  document.getElementById('offlineReviewExport').disabled = counts.hard > 0 || counts.pending > 0;
  document.getElementById('offlineReviewExport').style.opacity = counts.hard > 0 || counts.pending > 0 ? '0.5' : '1';
  var hint = document.getElementById('checkSummary');
  if (hint) hint.textContent = hint.textContent.replace(/ 导出核对：[\s\S]*$/,'') + offlineReviewSummary();
}
function closeOfflineReviewModal() {
  var modal = document.getElementById('offlineReviewModal'); if (modal) modal.style.display = 'none';
}
function offlineReviewRefresh() {
  return offlineReviewPrepare(true).then(function(state){if(state){renderOfflineReviewModal();document.getElementById('offlineReviewModal').style.display='block';}});
}
function offlineReviewSearch(index) {
  var item=OFFLINE_REVIEW_STATE.issues[index];
  if (!item || item.kind !== 'parameters') return;
  closeOfflineReviewModal();
  OFFLINE_SUPPLEMENT_STATE.errors=[{sourceIndex:item.sourceIndex,ref:item.ref,model:item.model,package:item.package,lcsc:item.lcsc,fields:item.fields,row:item.sourceIndex+1}];
  openOfflineSupplementSearch(0);
}
function offlineReviewSaveRow(index) {
  var item=OFFLINE_REVIEW_STATE.issues[index], row=item && B.rows[item.sourceIndex];
  if (!row) return;
  var values=OFFLINE_REVIEW_EDIT_FIELDS.map(function(field,j){return document.getElementById('offlineEdit-'+index+'-'+j).value.trim();});
  if (!values[0]) {alert('型号不能留空；请保留可追溯的源器件身份。');return;}
  var brandChanged = values[4] !== String(row['品牌'] || '').trim();
  if ((item.kind === 'brand' || brandChanged && offlineNeedsInductorBrand(row)) && !offlineHasBrand(values[4])) {
    alert('请填写实际品牌；暂时无法确认时可导出待复核稿。');return;
  }
  var rf=findRfInductorPreference(row);
  if (rf.mode==='exact' && rfInductorHasCompanyMaterialCode(rf.record)) {
    var otherChanged = OFFLINE_REVIEW_EDIT_FIELDS.slice(0,4).some(function(field,j){
      return values[j] !== String(row[field] || '').trim();
    });
    if (otherChanged || offlineHasBrand(rf.record.brand || rf.record['品牌'])) {
      alert('该器件已有公司定型资料，请由管理员维护指定库。缺品牌时可仅补填本次品牌。');return;
    }
  }
  OFFLINE_REVIEW_EDIT_FIELDS.forEach(function(field,j){row[field]=values[j];});
  if (row._offlineManualBrand && row._offlineManualBrand.target !== offlineBrandTarget(row) && !brandChanged) {
    row['品牌'] = '';
    delete row._offlineManualBrand;
  }
  if (brandChanged || item.kind === 'brand') row._offlineManualBrand = {
    brand:values[4],target:offlineBrandTarget(row),time:new Date().toISOString()
  };
  row._mfgPart=values[0];
  ['原厂型号','productModel'].forEach(function(field){if(Object.prototype.hasOwnProperty.call(row,field))row[field]=values[0];});
  delete row._lcscOnlineState; delete row._lcscOnlineHit; delete row._specWarnings; delete row._offlineOfficialDetails;
  if (B._offlineSourceRows) B._offlineSourceRows[item.sourceIndex] = Object.assign({},row);
  Object.keys(OFFLINE_REVIEW_STATE.decisions).forEach(function(key){
    if (JSON.parse(key)[0] === item.sourceIndex) delete OFFLINE_REVIEW_STATE.decisions[key];
  });
  OFFLINE_REVIEW_STATE.signature='';
  return offlineReviewRefresh();
}
function offlineReviewDecisionNote(item,options) {
  var decision=OFFLINE_REVIEW_STATE.decisions[item.key],data=item.official;
  var comparison='源资料=' + [item.model,item.package,item.lcsc].filter(Boolean).join(' / ')
    + '；官方资料=' + (data ? [data.productModel,data.package,data.productCode].filter(Boolean).join(' / ') : '未取得完整资料');
  var note=(options.draft ? '待复核稿：' : '人工确认：') + item.reason + '；' + comparison;
  if(decision)note+='；处理='+decision.action+'；确认时间='+decision.time;
  return note;
}
function buildOfflineAuditContext(headers,rows,options,details) {
  var E=window.BOMReview,context={details:[],records:[]};if(!E)return context;
  var map=E.mapping(headers);
  var original=B._reviewWorkbook?E.readWorkbook(B._reviewWorkbook,XLSX,{}):{rows:(B.rows||[]).map(function(row){return {values:row};})};
  rows.forEach(function(cells,index){
    var values={};E.FIELDS.forEach(function(field){values[field]=map[field]==null?'':E.text(cells[map[field]]);});
    var entries=(options.issues||[]).filter(function(item){return item.sourceIndex===index||item.sourceIndex<0;}).map(function(item){
      var decision=OFFLINE_REVIEW_STATE.decisions[item.key],confirmed=!options.draft&&offlineReviewConfirmed(item);
      return {kind:item.kind,reason:item.reason,fields:item.fields||[],confirmed:confirmed,
        resolved:confirmed&&['model','package','source'].indexOf(item.kind)>=0,action:decision?decision.action:'',time:decision?decision.time:'',
        note:offlineReviewDecisionNote(item,options),source:{model:item.model,package:item.package,code:item.lcsc},
        official:item.official?{model:item.official.productModel,package:item.official.package,code:item.official.productCode,specification:item.official.specification}:null};
    });
    var relevant=details.filter(function(d){return d.sourceIndex!=null?d.sourceIndex===index:E.text(d.ref)===values['位号']&&E.text(d.model)===values['型号'];});
    relevant.forEach(function(d){d.model=values['型号'];});
    relevant.forEach(function(d){(d.warnings||[]).forEach(function(w){
      if(w==='标准库候选与立创官方型号不一致，已改用官方资料，未引用该库记录')entries.push({kind:'information',reason:w,note:w,resolved:true,confirmed:false});
    });});
    var sourceRow=B.rows[index]||{},official=OFFLINE_REVIEW_STATE.result&&OFFLINE_REVIEW_STATE.result.byCode[normLcsc(sourceRow['立创编号'])];
    if(official&&official.productModel&&E.text(values['型号'])===E.text(official.productModel)&&E.text(sourceRow['型号'])===E.text(official.productModel))entries.push({kind:'verifiedModel',confirmed:false,resolved:true,
      reason:'转换阶段已按采购编号 '+normLcsc(sourceRow['立创编号'])+' 核对型号文字：'+official.productModel,
      source:{model:sourceRow['型号'],code:sourceRow['立创编号']},official:{model:official.productModel,package:official.package,code:official.productCode}});
    if(!entries.length&&!relevant.some(function(d){return d.level==='review'&&(d.warnings||[]).length;}))return;
    var record={schema:1,ref:values['位号'],signature:E.rowSignature(values),sourceSignature:E.sourceSignature(original,values['位号']),entries:entries,
      details:relevant.filter(function(d){return d.level==='review'||d.level==='confirmed';}).map(function(d){return {ref:d.ref,model:d.model,warnings:(d.warnings||[]).slice()};})};context.records.push(record);
    // Machine-readable evidence is in a hidden report column, while the ordinary report remains readable.
    var target=relevant[0];
    if(!target){target={sourceIndex:index,ref:values['位号'],model:values['型号'],level:'auto',filled:[],warnings:[]};details.push(target);}
    target.reviewEvidence=record;
  });
  context.details=details.filter(function(d){return d.level==='review'||d.level==='confirmed';}).map(function(d){return {ref:d.ref,model:d.model,warnings:(d.warnings||[]).slice(),source:'本次转换补齐报告'};});
  return context;
}
function offlineReviewAnnotate(row,index,options,details,stats) {
  var issues=options.issues || [], source=B.rows[index];
  issues.filter(function(item){return item.sourceIndex === index || item.sourceIndex < 0;}).forEach(function(item){
    var decision=OFFLINE_REVIEW_STATE.decisions[item.key];
    var note=offlineReviewDecisionNote(item,options);
    row['备注']=[row['备注'],note].filter(Boolean).join('；');
    var resolved=!options.draft&&offlineReviewConfirmed(item)&&['model','package','source'].indexOf(item.kind)>=0;
    details.push({ref:row['位号'] || '',model:row['型号'] || '',level:resolved?'confirmed':'review',filled:[],warnings:[note]});
    if(!resolved)stats.review=(stats.review || 0)+1;
    if (item.kind==='package' || item.kind==='source' || item.kind==='model') {
      var choice = findRfInductorPreference(source);
      var identity = choice.mode === 'exact' ? {
        '型号':choice.record.model || choice.record['型号'] || source['型号'],
        '封装':choice.record.package || choice.record['封装'] || source['封装'],
        '立创编号':choice.record.lcsc_code || choice.record['立创编号'] || source['立创编号']
      } : source;
      row['型号']=identity['型号']; row['封装']=identity['封装'];
      row['立创编号']=normLcsc(identity['立创编号']);
      if (!row['立创编号'] && source['立创编号']) row['备注'] += '；源采购标记=' + source['立创编号'];
    }
  });
  if (options.draft && !/待复核稿/.test(String(row['备注'] || ''))) row['备注']=[row['备注'],'待复核稿'].filter(Boolean).join('；');
}
function offlineReviewExport(draft) {
  return offlineReviewPrepare().then(function(state){
    if (!state) return;
    var counts=offlineReviewCounts();
    if (!draft && (counts.hard || counts.pending)) {
      renderOfflineReviewModal();document.getElementById('offlineReviewModal').style.display='block';return;
    }
    if (draft && !confirm('导出待复核稿：保留所有物料，明确冲突行按源资料保留，缺失参数不编造。文件名、备注和补齐报告均标明待复核。是否继续？')) return;
    closeOfflineReviewModal();closeOfflineSupplementModal();
    return fmtCore('AB',state.result.byCode,{reviewExport:true,draft:!!draft,issues:state.issues,
      hardRows:state.issues.filter(function(i){return i.kind==='hard';}).map(function(i){return i.sourceIndex;})});
  });
}
