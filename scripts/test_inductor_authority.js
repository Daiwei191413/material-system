const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const targets = [
  { file: 'v3-cloudbase/web/index.html', version: 'V1.0.59' },
  { file: 'v3-legacy/index.html', version: 'V3.0.83' },
];

function section(html, start, end) {
  const startIndex = html.indexOf(start);
  const endIndex = html.indexOf(end, startIndex);
  assert(startIndex >= 0, `missing section start: ${start}`);
  assert(endIndex > startIndex, `missing section end: ${end}`);
  return html.slice(startIndex, endIndex);
}

(async () => {
  for (const target of targets) {
    const html = fs.readFileSync(path.join(repoRoot, target.file), 'utf8');
    assert(html.includes(target.version), `${target.file}: expected version ${target.version} missing`);
    assert(!html.includes('位号反查 A BOM'), `${target.file}: template position override still exists`);
    assert(!html.includes("if (aRow['型号']) clone['_mfgPart']"), `${target.file}: template model still overwrites B`);
    assert(html.includes('模板中的示例物料只用于格式参考，绝不参与数据比对或转换'), `${target.file}: format-only boundary missing`);

    const helpers = section(html, 'function parseInductanceNh(raw)', 'var fmtBusy = false;');
    const inductorNaming = section(
      html,
      'function basicInductorDescription(row)',
      '// ==================== A 标准型号规范化',
    );
    const specBuilder = section(
      html,
      'function buildSpecFromExtracted(ext, productType, pkg)',
      '// ==================== 立创代理 Worker',
    );
    const official = {
      hit: true,
      productCode: 'C703735',
      productModel: 'LQW15CAR22J00D',
      productType: '绕线电感',
      brand: 'Murata',
      package: '0402',
      _extracted: {
        inductance: '220nH',
        tolerance: '±5%',
        current: '540mA',
      },
      specification: '直流电阻(DCR)：-, 直流电阻(DCR)：290mΩ, 自谐振频率：1.3GHz',
    };
    const context = {
      isFerrite: () => false,
      detectMaterialType: (row) => (/^(L|FB)\d+/i.test(String(row && row['位号'] || '')) ? 'inductor' : 'other'),
      normLcsc: (raw) => {
        const match = String(raw || '').toUpperCase().match(/C\d{3,}/);
        return match ? match[0] : '';
      },
      normModel: (raw) => String(raw || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, ''),
      normPkg: (raw) => String(raw || '').trim().toUpperCase()
        .replace(/^(?:SL|SC|SR)/, '')
        .replace(/[^A-Z0-9]/g, ''),
      cleanSpec: (raw) => String(raw || '').trim(),
      fetchLcscDetailsByCodes: async (codes) => Object.fromEntries(
        codes.map((code) => [code, { ok: true, data: official }]),
      ),
    };
    vm.runInNewContext(`${inductorNaming}\n${specBuilder}\n${helpers}`, context, { filename: target.file });

    assert.strictEqual(context.parseInductanceNh('0.22uH'), 220, `${target.file}: uH conversion failed`);
    assert.strictEqual(context.parseInductanceNh('220nH'), 220, `${target.file}: nH conversion failed`);
    assert.strictEqual(context.parseInductanceNh('26MHz_TCXO'), null, `${target.file}: MHz was parsed as mH`);
    assert.strictEqual(context.inductanceValuesConflict(12, 12.1), false, `${target.file}: nominal 12nH/12.1nH alias was rejected`);
    assert.strictEqual(context.inductanceValuesConflict(22, 220), true, `${target.file}: 22nH/220nH conflict was not detected`);
    assert.strictEqual(context.officialInductorNh({
      productName: '15nH ±2%',
      _extracted: {},
    }), 15, `${target.file}: official product-name inductance fallback failed`);
    assert.strictEqual(context.rfInductorHasCompanyMaterialCode({
      material_code: '1-IN-09-00036',
    }), true, `${target.file}: valid company material code was rejected`);
    assert.strictEqual(context.rfInductorHasCompanyMaterialCode({
      material_code: 'A-01-02-00239',
    }), true, `${target.file}: ERP-style company material code was rejected`);
    assert.strictEqual(context.rfInductorHasCompanyMaterialCode({
      material_code: '2-02-04-00064',
    }), true, `${target.file}: numeric-category company material code was rejected`);
    assert.strictEqual(context.rfInductorHasCompanyMaterialCode({
      material_code: '7',
    }), false, `${target.file}: numeric placeholder was accepted as a company material code`);
    assert.match(
      context.rfInductorCompanyMaterialCodeError({ material_code: '7' }),
      /格式错误/,
      `${target.file}: invalid company material code has no actionable error`,
    );
    assert.strictEqual(context.rfInductorLcscStatus({
      material_code: '1-IN-09-00036',
      lcsc_code: 'C9900070550',
      remark: '射频电感值=12.1nH；立创编号状态=客户专用',
    }), '客户专用', `${target.file}: customer-specific LCSC status was not rendered`);

    const companyErrors = context.rfInductorOfficialErrors({
      material_code: '1-IN-09-00036',
      lcsc_code: 'C9900070550',
      model: 'SMDS332-12N_RS',
      package: 'SMDS332-12N',
      specification: '电感值：12.1nH',
    }, {
      hit: true,
      productCode: 'C9900070550',
      productModel: 'smd332_12nh',
      productName: 'smd332_12nh',
      productType: '未分类',
      package: 'SMD-2P',
      _extracted: {},
    });
    assert.strictEqual(companyErrors.length, 0, `${target.file}: company material was blocked by official differences`);

    const fallbackErrors = context.rfInductorOfficialErrors({
      material_code: '',
      lcsc_code: 'C98055',
      model: 'LQW15AN15NG00D',
      package: 'SL0402',
      specification: '电感值：15nH',
    }, {
      hit: true,
      productCode: 'C98055',
      productModel: 'LQW15AN15NG00D',
      productName: '15nH ±2%',
      productType: '贴片电感',
      package: '0402',
      _extracted: {},
    });
    assert.strictEqual(fallbackErrors.length, 0, `${target.file}: product-name inductance fallback was rejected`);

    const genuineConflict = context.rfInductorOfficialErrors({
      material_code: '',
      lcsc_code: 'C91626',
      model: 'LQW15AN5N6C10D',
      package: 'SL0402',
      specification: '电感值：5.1nH',
    }, {
      hit: true,
      productCode: 'C91626',
      productModel: 'LQW15AN5N6C10D',
      productName: '5.6nH',
      productType: '功率电感',
      package: '0402',
      _extracted: { inductance: '5.6nH' },
    });
    assert(genuineConflict.includes('官方电感值与指定库不一致'), `${target.file}: genuine inductance conflict was not blocked`);

    const fallbackRow = {
      '位号': 'L4',
      '型号': '220nH',
      '物料名称': '功率电感',
      '参数描述': '220nH',
      '封装': 'SL0402',
      '立创编号': 'C703735',
    };
    const snapshot = context.snapshotInductorAuthority(fallbackRow);
    Object.assign(fallbackRow, {
      '型号': '22nH',
      '物料名称': '绕线电感',
      '参数描述': '绕线电感 22nH SMD 0402',
      _mfgPart: 'LQW15AN22NJ00D',
    });
    context.restoreInductorAuthority(fallbackRow, snapshot);
    assert.strictEqual(fallbackRow['型号'], '220nH', `${target.file}: library replaced B model`);
    assert.strictEqual(fallbackRow['参数描述'], '220nH', `${target.file}: library replaced B specification`);
    assert.strictEqual(fallbackRow._mfgPart, undefined, `${target.file}: unverified library MPN survived`);

    const row = {
      '位号': 'L4',
      '型号': '220nH',
      '物料名称': '功率电感',
      '参数描述': '220nH',
      '封装': 'SL0402',
      '立创编号': 'C703735',
    };
    const verified = await context.verifyInductorAuthority([row]);
    assert.strictEqual(verified.mismatches.length, 0, `${target.file}: valid L4 was rejected`);
    assert.strictEqual(verified.byCode.C703735.productModel, 'LQW15CAR22J00D');

    context.applyOfficialInductorIdentity(row, verified.byCode.C703735);
    assert.strictEqual(row._mfgPart, 'LQW15CAR22J00D', `${target.file}: official MPN not applied`);
    assert.strictEqual(row['物料名称'], '绕线电感', `${target.file}: LQW was not classified as wire-wound inductor`);
    assert(row['参数描述'].includes('220nH'), `${target.file}: B/official inductance was lost`);
    assert(!/(^|\D)22nH/i.test(row['参数描述']), `${target.file}: template 22nH leaked into output`);
    assert(row['参数描述'].includes('DCR 290mΩ'), `${target.file}: official DCR missing`);

    const wrong = await context.verifyInductorAuthority([{
      '位号': 'L4',
      '型号': '22nH',
      '参数描述': '22nH',
      '封装': 'SL0402',
      '立创编号': 'C703735',
    }]);
    assert.strictEqual(wrong.mismatches.length, 1, `${target.file}: 22nH/C703735 mismatch was not blocked`);

    const scriptPattern = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let scriptMatch;
    while ((scriptMatch = scriptPattern.exec(html)) !== null) {
      if (scriptMatch[1].trim()) new vm.Script(scriptMatch[1], { filename: target.file });
    }
  }

  console.log('Inductor authority regression checks passed for domestic and overseas frontends.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
