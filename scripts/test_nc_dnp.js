const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const targets = [
  { file: 'v3-cloudbase/web/index.html', version: 'V1.0.24' },
  { file: 'v3-legacy/index.html', version: 'V3.0.48' },
];

const cases = [
  ['NC', true],
  [' nc ', true],
  ['10K/NC', true],
  ['100nF / nc ', true],
  ['10uH\\NC', true],
  ['22pF\uFF0FNC', true],
  ['NC7SZ125', false],
  ['NCP1117', false],
  ['CONNECTOR', false],
  ['10K/NC1', false],
  ['10K', false],
  ['', false],
];

for (const target of targets) {
  const absolutePath = path.join(repoRoot, target.file);
  const html = fs.readFileSync(absolutePath, 'utf8');

  const helperMatch = html.match(/function isNcNoFitValue\(rawValue\) \{[\s\S]*?\n\}/);
  assert(helperMatch, `${target.file}: isNcNoFitValue helper not found`);
  const context = {};
  vm.runInNewContext(`${helperMatch[0]}; this.isNcNoFitValue = isNcNoFitValue;`, context);

  for (const [value, expected] of cases) {
    assert.strictEqual(
      context.isNcNoFitValue(value),
      expected,
      `${target.file}: unexpected NC classification for ${JSON.stringify(value)}`,
    );
  }

  const ncCheckIndex = html.indexOf('if (isNcNoFitValue(c.value))');
  const normalizeIndex = html.indexOf('var normVal = normalizeValue(c.value, c.fp)');
  assert(ncCheckIndex >= 0, `${target.file}: NC pre-filter not found`);
  assert(normalizeIndex >= 0, `${target.file}: value normalization not found`);
  assert(ncCheckIndex < normalizeIndex, `${target.file}: NC must be filtered before normalization`);
  assert(html.includes("dnpReason: 'NC \u7a7a\u8d34\uff08BOM\u6807\u8bb0\uff09'"), `${target.file}: NC audit reason missing`);
  assert(html.includes(target.version), `${target.file}: expected version ${target.version} missing`);

  const scriptPattern = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch;
  while ((scriptMatch = scriptPattern.exec(html)) !== null) {
    if (scriptMatch[1].trim()) new vm.Script(scriptMatch[1], { filename: target.file });
  }
}

console.log('NC/DNP regression checks passed for domestic and overseas frontends.');
