const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const crypto = require('node:crypto');
const { chromium } = require(path.join(
  process.env.USERPROFILE,
  '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright-core',
));
const XLSX = require('../v3-cloudbase/web/assets/vendor/xlsx.full.min.js');
const reviewEngine = require('../v3-cloudbase/web/assets/bom-review-engine.js');

const root = path.resolve(__dirname, '..');
const source = process.env.BOM_REAL_SCHEMATIC_SOURCE;
const output = process.env.BOM_REAL_PIPELINE_OUTPUT;
const standardSource = process.env.BOM_REAL_STANDARD_LIBRARY
  || path.join(root, 'backups/2026-09-30/domestic-cloudbase/物料库_公司标准_2026-09-30.xlsx');
const lcscSource = process.env.BOM_REAL_LCSC_LIBRARY
  || path.join(root, 'backups/2026-09-30/domestic-cloudbase/物料库_立创格式_2026-09-30.xlsx');
const rfSource = process.env.BOM_REAL_RF_LIBRARY || 'D:/桌面/PCB S/射频电感库文件20261022.xlsx';
const liveLcscUrl = process.env.BOM_REAL_LCSC_URL
  || 'https://techphant-bom-v3-d9e3pqqb0b46c88.service.tcloudbase.com/lcsc';
const edge = [
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(fs.existsSync);

assert(source && fs.existsSync(source), 'BOM_REAL_SCHEMATIC_SOURCE is required');
assert(output && /^D:[\\/]/i.test(output), 'BOM_REAL_PIPELINE_OUTPUT must be on D:');
assert(fs.existsSync(standardSource), 'standard library file is missing');
assert(fs.existsSync(lcscSource), 'LCSC library file is missing');
assert(fs.existsSync(rfSource), 'RF inductor library file is missing');
assert(edge, 'Microsoft Edge is required');
fs.mkdirSync(output, { recursive: true });

function firstSheetRows(filename) {
  const workbook = XLSX.read(fs.readFileSync(filename), { type:'buffer' });
  return XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval:'' });
}

const standardLibrary = firstSheetRows(standardSource).map(row => ({
  material_code:row['物料编码'] || '', name:row['物料名称'] || '', model:row['型号'] || '',
  specification:row['参数描述'] || '', package:row['封装'] || '', brand:row['品牌'] || '',
  lcsc_code:row['立创编号'] || '', unit:row['单位'] || 'PCS', remark:row['备注'] || '',
}));
const lcscLibrary = firstSheetRows(lcscSource).map(row => ({
  model:row['Comment型号'] || row['型号'] || '',
  package:row['Footprint封装'] || row['封装'] || '',
  lcsc_code:row['嘉立创元件编号'] || row['立创编号'] || '',
}));
const rfLibrary = firstSheetRows(rfSource).map(row => ({
  material_code:row['物料编码'] || '', name:row['物料名称'] || '', model:row['型号'] || '',
  specification:row['参数描述'] || '', package:row['封装'] || '', brand:row['品牌'] || '',
  lcsc_code:row['立创编号'] || '', unit:row['单位'] || 'PCS', remark:row['备注'] || '',
}));

const mime = {
  '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const server = http.createServer((req, res) => {
  const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const file = path.resolve(root, '.' + requested);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'Content-Type':mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});

function refs(value) {
  return String(value || '').split(/[,，;；\s]+/).map(item => item.trim()).filter(Boolean);
}

function sha256(filename) {
  return crypto.createHash('sha256').update(fs.readFileSync(filename)).digest('hex').toUpperCase();
}

function statusCounts(rows) {
  return rows.reduce((counts, row) => {
    const key = row.status || 'unknown';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
}

function readJlcBom(filename) {
  const workbook = XLSX.read(fs.readFileSync(filename), { type:'buffer' });
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], { defval:'' });
  assert.deepEqual(Object.keys(rows[0] || {}), ['Comment','Designator','Footprint','嘉立创元件编号']);
  return { workbook, rows };
}

function findHeaderRow(matrix, required) {
  return matrix.findIndex(row => required.every(header => row.includes(header)));
}

function readOfflineBom(filename) {
  const workbook = XLSX.read(fs.readFileSync(filename), { type:'buffer' });
  assert(workbook.SheetNames.includes('封面'));
  assert(workbook.SheetNames.includes('单板BOM'));
  assert(workbook.SheetNames.includes('补齐报告'));
  const sheet = workbook.Sheets['单板BOM'];
  const matrix = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'' });
  const headerIndex = findHeaderRow(matrix, ['型号','参数描述','位号','数量','封装']);
  assert(headerIndex >= 0, 'offline BOM header row was not found');
  const headers = matrix[headerIndex];
  const rows = matrix.slice(headerIndex + 1)
    .filter(row => row.some(value => value !== ''))
    .map(row => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ''])));
  return { workbook, matrix, headerIndex, rows };
}

async function waitForConversion(page) {
  await page.waitForFunction(() => window.CONV_OUT && CONV_OUT.length > 0, null, { timeout:15000 });
  try {
    await page.waitForFunction(() => CONV_OUT.every(row => !['verifying','searching'].includes(row.status)), null, { timeout:60000 });
    return true;
  } catch (_error) {
    return false;
  }
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless:true, executablePath:edge });
  const page = await browser.newPage({ acceptDownloads:true, viewport:{ width:1440, height:1000 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(base + '/')) return route.continue();
    if (url.startsWith(liveLcscUrl)) return route.continue();
    if (url.includes('cdn.jsdelivr.net/npm/xlsx@')) return route.fulfill({
      path:path.join(root, 'v3-cloudbase/web/assets/vendor/xlsx.full.min.js'),
      contentType:'application/javascript',
    });
    if (url.includes('cdn.jsdelivr.net/npm/jszip@')) return route.fulfill({
      path:path.join(root, 'v3-cloudbase/web/assets/vendor/jszip.min.js'),
      contentType:'application/javascript',
    });
    return route.abort();
  });

  const results = {
    source:{ path:source, bytes:fs.statSync(source).size, sha256:sha256(source) },
    libraries:{ standard:standardLibrary.length, lcsc:lcscLibrary.length, rf:rfLibrary.length },
    onlineService:liveLcscUrl,
    dialogs:[],
    pageErrors,
  };

  try {
    await page.goto(`${base}/v3-cloudbase/web/index.html`, { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => /已就绪|加载失败/.test(document.getElementById('msgA')?.textContent || ''), null, { timeout:15000 });
    assert((await page.locator('#msgA').textContent()).includes('已就绪'), 'embedded offline BOM template did not load');
    await page.evaluate(({ standardRows, lcscRows, rfRows, lcscUrl }) => {
      window.__realDialogs = [];
      window.alert = message => window.__realDialogs.push({ type:'alert', message:String(message) });
      window.confirm = message => {
        window.__realDialogs.push({ type:'confirm', message:String(message), accepted:true });
        return true;
      };
      document.body.classList.remove('v3-not-logged');
      document.getElementById('v3LoginMask')?.classList.remove('show');
      window.materialDB_standard = standardRows;
      window.materialDB_lcsc = lcscRows;
      window.materialDB_rf_inductor = rfRows;
      window.BOM_STANDARD_SYNC = { status:'ready', count:standardRows.length, error:'' };
      window.LCSC_WORKER_URL = lcscUrl;
      setActiveLib('standard');
      showPanelDirect('convert');
    }, { standardRows:standardLibrary, lcscRows:lcscLibrary, rfRows:rfLibrary, lcscUrl:liveLcscUrl });

    await page.locator('#convFile').setInputFiles(source);
    const settled = await waitForConversion(page);
    let conversion = await page.evaluate(() => ({
      sourceRows:CONV_RAW.length,
      outputRows:CONV_OUT.length,
      statusCounts:CONV_OUT.reduce((counts, row) => {
        counts[row.status] = (counts[row.status] || 0) + 1;
        return counts;
      }, {}),
      pending:CONV_OUT.filter(row => row.status !== 'dnp' && row.status !== 'matched').map(row => ({
        refs:row.designator, comment:row.comment, footprint:row.footprint, lcsc:row.lcsc,
        status:row.status, verification:row.verification, error:row.verifyError || '',
      })),
      rf:CONV_OUT.filter(row => /(^|[,，;；\s])(L|FB)\d+/i.test(row.designator || '')).map(row => ({
        refs:row.designator, comment:row.comment, footprint:row.footprint, lcsc:row.lcsc,
        status:row.status, verification:row.verification, rfPreferred:!!row.rfPreferred,
        rfSourcePending:!!row.rfSourcePending, officialModel:row.officialModel || '',
      })),
    }));
    results.schematicConversion = { settled, ...conversion };
    await page.screenshot({ path:path.join(output, '01-schematic-conversion.png'), fullPage:true });
    assert(settled, 'schematic conversion did not finish online verification within 60 seconds');

    const strictSmallCapIndexes = await page.evaluate(() => CONV_OUT.map((row, index) => ({ row, index }))
      .filter(item => item.row.status !== 'dnp' && convSmallCapPf(item.row) !== null && !convSmallCapVerified(item.row))
      .map(item => item.index));
    const correctedSmallCaps = [];
    for (const index of strictSmallCapIndexes) {
      await page.evaluate(rowIndex => openLcscSearch(rowIndex), index);
      await page.waitForFunction(() => document.querySelectorAll('#lcscSearchBody .lcsc-data-row').length > 0, null, { timeout:30000 });
      const firstCandidate = page.locator('#lcscSearchBody .lcsc-data-row').first();
      const code = String(await firstCandidate.locator('td').first().textContent()).trim();
      await firstCandidate.locator('button').click();
      await page.waitForFunction(rowIndex => !['verifying','searching'].includes(CONV_OUT[rowIndex].status), index, { timeout:30000 });
      const corrected = await page.evaluate(rowIndex => ({
        refs:CONV_OUT[rowIndex].designator, code:CONV_OUT[rowIndex].lcsc,
        status:CONV_OUT[rowIndex].status, verification:CONV_OUT[rowIndex].verification,
        tolerance:CONV_OUT[rowIndex].officialTolerance || '', error:CONV_OUT[rowIndex].verifyError || '',
      }), index);
      assert.equal(corrected.code, code, 'selected small-cap code was not retained');
      assert.equal(corrected.status, 'matched', `small-cap replacement was rejected: ${JSON.stringify(corrected)}`);
      assert.equal(corrected.tolerance, '±0.1pF', `small-cap replacement tolerance is not ±0.1pF: ${JSON.stringify(corrected)}`);
      correctedSmallCaps.push(corrected);
    }
    results.schematicConversion.correctedSmallCaps = correctedSmallCaps;
    conversion = await page.evaluate(() => ({
      statusCounts:CONV_OUT.reduce((counts, row) => {
        counts[row.status] = (counts[row.status] || 0) + 1;
        return counts;
      }, {}),
      pending:CONV_OUT.filter(row => row.status !== 'dnp' && row.status !== 'matched').map(row => ({
        refs:row.designator, comment:row.comment, footprint:row.footprint, lcsc:row.lcsc,
        status:row.status, verification:row.verification, error:row.verifyError || '',
      })),
    }));
    results.schematicConversion.finalStatusCounts = conversion.statusCounts;
    results.schematicConversion.finalPending = conversion.pending;

    const blockingRows = conversion.pending.filter(row => ['invalid','verifying','searching','verify_failed'].includes(row.status));
    assert.equal(blockingRows.length, 0, `schematic conversion has blocking rows: ${JSON.stringify(blockingRows)}`);

    const jlcDownloadPromise = page.waitForEvent('download', { timeout:15000 });
    await page.evaluate(() => exportJlcBom());
    const jlcDownload = await jlcDownloadPromise;
    const jlcPath = path.join(output, 'TP1211-MK36_V1.0_实际生成立创BOM.xlsx');
    await jlcDownload.saveAs(jlcPath);
    const jlc = readJlcBom(jlcPath);
    results.jlcBom = {
      path:jlcPath, bytes:fs.statSync(jlcPath).size, sha256:sha256(jlcPath), rows:jlc.rows.length,
      refs:jlc.rows.reduce((sum, row) => sum + refs(row.Designator).length, 0),
      blankCodes:jlc.rows.filter(row => !String(row['嘉立创元件编号'] || '').trim()).length,
    };

    await page.evaluate(() => showPanelDirect('compare'));
    await page.locator('#fileB').setInputFiles(jlcPath);
    await page.waitForFunction(() => document.getElementById('msgB')?.textContent.includes('✅'), null, { timeout:15000 });
    await page.locator('#boardName').fill('TP1211-MK36主板');
    await page.locator('#boardErp').fill('A-01-02-00259');
    await page.locator('#boardVersion').fill('V1.0');
    await page.locator('#goBtn').click();
    await page.waitForFunction(() => !document.getElementById('fmtAB').disabled, null, { timeout:15000 });

    const authority = await page.evaluate(async () => {
      window.__realAuthority = await verifyBomAuthority(B.rows);
      return {
        mismatches:window.__realAuthority.mismatches || [],
        failedCodes:window.__realAuthority.failedCodes || [],
        rfCandidates:(window.__realAuthority.rfCandidates || []).map(item => ({
          refs:item.row && item.row['位号'], identity:item.identity,
        })),
      };
    });
    results.offlineAuthority = authority;
    assert.equal(authority.mismatches.length, 0, `offline authority mismatches: ${JSON.stringify(authority.mismatches)}`);

    const offlineDownloadPromise = page.waitForEvent('download', { timeout:30000 });
    await page.evaluate(() => fmtCore('AB', window.__realAuthority.byCode));
    const offlineDownload = await offlineDownloadPromise;
    const offlinePath = path.join(output, 'A-01-02-00259-TP1211-MK36_V1.0_实际生成线下BOM.xlsx');
    await offlineDownload.saveAs(offlinePath);
    await page.screenshot({ path:path.join(output, '02-offline-conversion.png'), fullPage:true });

    const offline = readOfflineBom(offlinePath);
    const review = reviewEngine.analyze(reviewEngine.readWorkbook(offline.workbook, XLSX, { name:path.basename(offlinePath) }));
    const offlineRefs = offline.rows.flatMap(row => refs(row['位号']));
    const jlcRefs = jlc.rows.flatMap(row => refs(row.Designator));
    const missingRefs = jlcRefs.filter(ref => !offlineRefs.includes(ref));
    const extraRefs = offlineRefs.filter(ref => !jlcRefs.includes(ref));
    const quantityErrors = offline.rows.filter(row => Number(row['数量']) !== refs(row['位号']).length)
      .map(row => ({ refs:row['位号'], quantity:row['数量'] }));
    const smallCaps = offline.rows.filter(row => {
      const match = String(row['型号'] || '').match(/(\d+(?:\.\d+)?)\s*pF/i);
      return match && Number(match[1]) < 10;
    });
    const smallCapErrors = smallCaps.filter(row => !/±\s*0\.1\s*pF/i.test(String(row['参数描述'] || '')));
    const inductors = offline.rows.filter(row => refs(row['位号']).some(ref => /^(L|FB)\d+/i.test(ref)));
    results.offlineBom = {
      path:offlinePath, bytes:fs.statSync(offlinePath).size, sha256:sha256(offlinePath),
      rows:offline.rows.length, refs:offlineRefs.length,
      missingRefs, extraRefs, quantityErrors,
      review:{ abnormal:review.auditCounts.abnormal, unverified:review.auditCounts.unverified },
      smallCaps:smallCaps.map(row => ({ refs:row['位号'], model:row['型号'], specification:row['参数描述'] })),
      smallCapErrors:smallCapErrors.map(row => row['位号']),
      inductors:inductors.map(row => ({
        refs:row['位号'], name:row['物料名称'], model:row['型号'], package:row['封装'],
        specification:row['参数描述'], lcsc:row['立创编号'], remark:row['备注'],
      })),
    };
    assert.equal(missingRefs.length, 0, `offline BOM missing refs: ${missingRefs.join(',')}`);
    assert.equal(extraRefs.length, 0, `offline BOM has extra refs: ${extraRefs.join(',')}`);
    assert.equal(quantityErrors.length, 0, `offline BOM quantity/ref mismatch: ${JSON.stringify(quantityErrors)}`);
    assert.equal(review.auditCounts.abnormal, 0, 'offline BOM review found definite model/spec/package/ref/quantity anomalies');
    assert.equal(smallCapErrors.length, 0, `small capacitors violate ±0.1pF rule: ${smallCapErrors.map(row => row['位号']).join(',')}`);
    assert.equal(pageErrors.length, 0, pageErrors.join('\n'));
    results.dialogs = await page.evaluate(() => window.__realDialogs || []);
    fs.writeFileSync(path.join(output, 'real-pipeline-results.json'), JSON.stringify(results, null, 2));
    console.log('PASS', JSON.stringify(results));
  } catch (error) {
    results.dialogs = await page.evaluate(() => window.__realDialogs || []).catch(() => []);
    results.failure = error.stack || String(error);
    fs.writeFileSync(path.join(output, 'real-pipeline-results.json'), JSON.stringify(results, null, 2));
    throw error;
  } finally {
    await browser.close();
    await new Promise(resolve => server.close(resolve));
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
