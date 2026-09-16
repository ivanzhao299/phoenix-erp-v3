#!/usr/bin/env node
// Read-only response checker. It never prints response bodies or field values.
import { readFileSync } from 'node:fs';

const [kind, status, file] = process.argv.slice(2);
if (!kind || !/^\d{3}$/.test(status || '') || !file) process.exit(2);
let body;
try { body = JSON.parse(readFileSync(file, 'utf8')); } catch { console.error(`FAIL ${kind} invalid-json`); process.exit(2); }
const fail = reason => { console.error(`FAIL ${kind} ${reason}`); process.exit(2); };
const expect = (ok, reason) => { if (!ok) fail(reason); };
const top = body && typeof body === 'object' && !Array.isArray(body) ? body : null;
if (kind === 'unauth') { expect(status === '401', `status=${status}`); console.log('PASS unauth status=401'); process.exit(0); }
if (kind === 'sentinel') { expect(status === '404', `status=${status}`); console.log('PASS sentinel status=404'); process.exit(0); }
if (kind === 'list') {
  expect(status === '200', `status=${status}`); expect(top?.code === 200, 'envelope-code');
  const d=top.data; expect(d && Array.isArray(d.items), 'items-array');
  for (const k of ['totalMatching','hasMore','asOfId','filters','snapshotAt','nextCursor']) expect(Object.prototype.hasOwnProperty.call(d,k), `missing-${k}`);
  const allowed=new Set(['record','shift','ownership','outputs','sources','inventory','handover','receipt','boxes','identityStatus','expectedBoxCount','revision','actions','sectionsComplete','snapshotAt']);
  for(const item of d.items) for(const k of Object.keys(item)) expect(allowed.has(k), `field-${k}`);
  console.log(`PASS list status=200 items=${d.items.length} fields=${d.items.flatMap(x=>Object.keys(x)).filter((x,i,a)=>a.indexOf(x)===i).length}`); process.exit(0);
}
if (kind === 'detail') {
  expect(status === '200', `status=${status}`); expect(top?.code === 200, 'envelope-code');
  const d=top.data; expect(d && typeof d==='object' && !Array.isArray(d), 'data-object');
  for (const k of ['record','shift','ownership','outputs','sources','inventory','handover','receipt','revision','actions']) expect(Object.prototype.hasOwnProperty.call(d,k), `missing-${k}`);
  console.log(`PASS detail status=200 fields=${Object.keys(d).length}`); process.exit(0);
}
fail('unknown-kind');
