const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const targets = [
  'v3-cloudbase/functions/api/index.js',
  'v3-legacy/worker/worker.js',
];
const helperNames = [
  'cleanText',
  'normText',
  'normLcsc',
  'makeMaterialSyncKey',
  'materialIdentityError',
  'validCostPrice',
  'requireLib',
];

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} helper not found`);
  const braceStart = source.indexOf('{', start);
  let depth = 0;
  for (let i = braceStart; i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`${name} helper is not balanced`);
}

for (const target of targets) {
  const source = fs.readFileSync(path.join(repoRoot, target), 'utf8');
  const helperSource = helperNames.map((name) => extractFunction(source, name)).join('\n');
  const context = {};
  vm.runInNewContext(`${helperSource}\nthis.helpers = { ${helperNames.join(', ')} };`, context);
  const h = context.helpers;

  assert.strictEqual(h.requireLib('cost'), 'cost', `${target}: cost library type rejected`);
  assert.strictEqual(h.requireLib('other'), null, `${target}: unknown library type accepted`);
  assert.strictEqual(
    h.makeMaterialSyncKey('cost', { model: ' Key-A ', package: 'QFN 32', lcsc_code: 'C900001' }),
    'cost:key-a|qfn 32',
    `${target}: cost sync key must be model/package based`,
  );
  assert.strictEqual(h.makeMaterialSyncKey('cost', { model: 'Key-A' }), '', `${target}: package was not required`);
  assert.strictEqual(h.makeMaterialSyncKey('cost', { package: 'QFN-32' }), '', `${target}: model was not required`);
  assert(h.validCostPrice({ price: '3.21' }), `${target}: valid cost price rejected`);
  assert(!h.validCostPrice({ price: '0' }), `${target}: zero cost price accepted`);
  assert(!h.validCostPrice({ price: '-1' }), `${target}: negative cost price accepted`);
  assert(!h.validCostPrice({ price: '1abc' }), `${target}: malformed cost price accepted`);
  assert.strictEqual(h.materialIdentityError('cost'), '关键器件成本库需填写型号和封装', `${target}: cost identity error missing`);
  assert(source.includes("lib === 'cost' && !validCostPrice(data)"), `${target}: create route lacks cost price validation`);
  assert(source.includes("lib === 'cost' && !validCostPrice(merged)"), `${target}: update route lacks cost price validation`);
  assert(source.includes("lib === 'cost' && !validCostPrice(item)"), `${target}: import route lacks cost price validation`);
  const scopedDeletes = source.match(/DELETE FROM material_library WHERE lib_type = (?:\$1|\?)/g) || [];
  assert(scopedDeletes.length >= 2, `${target}: library clear/delete operations are not scoped by library type`);
  console.log(`${target}: cost-library backend helpers passed`);
}
