const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const targets = [
  { file: 'v3-cloudbase/web/index.html', version: 'V1.0.24' },
  { file: 'v3-legacy/index.html', version: 'V3.0.48' },
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
    assert(html.includes('A 模板只提供列顺序、封面和样式'), `${target.file}: format-only boundary missing`);

    const helpers = section(html, 'function parseInductanceNh(raw)', 'var fmtBusy = false;');
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
      cleanSpec: (raw) => String(raw || '').trim(),
      fetchLcscDetailsByCodes: async (codes) => Object.fromEntries(
        codes.map((code) => [code, { ok: true, data: official }]),
      ),
    };
    vm.runInNewContext(`${specBuilder}\n${helpers}`, context, { filename: target.file });

    assert.strictEqual(context.parseInductanceNh('0.22uH'), 220, `${target.file}: uH conversion failed`);
    assert.strictEqual(context.parseInductanceNh('220nH'), 220, `${target.file}: nH conversion failed`);

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
