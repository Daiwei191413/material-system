const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function extractFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, `${name} missing`);
  const brace = source.indexOf('{', start);
  let depth = 0;
  for (let index = brace; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    else if (source[index] === '}') {
      depth -= 1;
      if (depth === 0) return Function(`${source.slice(start, index + 1)}; return ${name};`)();
    }
  }
  throw new Error(`${name} body is incomplete`);
}

for (const relative of ['v3-cloudbase/functions/lcsc-proxy/index.js', 'cloudflare-worker/worker.js']) {
  const source = fs.readFileSync(path.join(root, relative), 'utf8');
  const toleranceFromText = extractFunction(source, 'toleranceFromText');
  assert.equal(toleranceFromText('±0.25pF 6pF 50V'), '±0.25pF', `${relative}: pF tolerance missing`);
  assert.equal(toleranceFromText('±1% 10pF 50V'), '±1%', `${relative}: percentage tolerance missing`);
  assert.equal(toleranceFromText('6pF 50V NP0'), '', `${relative}: fabricated tolerance`);
  console.log(`${relative}: tolerance fallback parser passed`);
}

const cloudflare = fs.readFileSync(path.join(root, 'cloudflare-worker/worker.js'), 'utf8');
assert.match(cloudflare, /COMPONENT_CACHE_PREFIX\s*=\s*['"]jlc:v11:/, 'Cloudflare component cache version was not bumped');
