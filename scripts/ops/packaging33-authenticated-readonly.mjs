// Official password login only; token stays in memory. No business POST or retries.
import { mkdirSync, writeFileSync } from 'node:fs';
const base = 'https://erp.eggslao.com';
const output = 'artifacts/packaging33-authenticated-readonly.json';
const report = { at: new Date().toISOString(), runId: process.env.GITHUB_RUN_ID || 'local', businessWrites: 0, requests: [] };
const pick = (v, fields) => Object.fromEntries(fields.filter(k => v?.[k] !== undefined).map(k => [k, v[k]]));
async function call(path, options = {}) {
  const response = await fetch(base + path, { ...options, redirect: 'error', signal: AbortSignal.timeout(20000) });
  const body = await response.json().catch(() => null);
  report.requests.push({ path, method: options.method || 'GET', httpStatus: response.status, code: typeof body?.code === 'number' ? body.code : null, at: new Date().toISOString() });
  return { response, body, entry: report.requests.at(-1) };
}
try {
  if (!process.env.RUNNER_PASS) throw new Error('CREDENTIAL_UNAVAILABLE');
  const login = await call('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'svc_bug_intake_runner', password: process.env.RUNNER_PASS }) });
  if (!login.response.ok || typeof login.body?.token !== 'string' || !login.body.token) throw new Error('OFFICIAL_LOGIN_FAILED');
  const headers = { Authorization: `Bearer ${login.body.token}`, 'x-packaging-mode': 'real' };
  const me = await call('/api/auth/me', { headers });
  if (!me.response.ok) throw new Error('OFFICIAL_IDENTITY_FAILED');
  const user = me.body?.user || me.body?.data?.user || {};
  me.entry.identity = pick(user, ['userId', 'username', 'role', 'roles']);
  const code = 'PKG-20260910-163616';
  const status = await call(`/api/packaging/terminal/warehouse/status?packingCode=${code}`, { headers });
  status.entry.data = pick(status.body?.data, ['packingCode', 'state', 'committed', 'handoverCode', 'boxCount', 'handoverQuantity', 'inventoryBatchCount', 'totalInbound', 'ledgerInbound', 'inventoryMode', 'inventoryPosted', 'committedAt']);
  const summary = await call('/api/packaging/terminal/reports/shift-summary?date=2026-09-10&shiftId=56', { headers });
  summary.entry.data = pick(summary.body?.data, ['receivedQty', 'receivedWeight', 'openExceptionCount', 'closedExceptionCount', 'gradingOutputs', 'gradedQty', 'shiftPackedBoxes', 'shiftPackedEggs', 'shiftLabelCount', 'shiftWarehousedBoxes', 'shiftWarehousedPallets']);
  summary.entry.shift = pick(summary.body?.data?.shift, ['id', 'production_date', 'site_id', 'status', 'is_test']);
  report.status = report.requests.every(r => r.httpStatus === 200 && (r.code === null || r.code === 200)) ? 'READONLY_HTTP_OK' : 'HTTP_ERROR';
} catch (e) {
  // Do not serialize network exceptions, response bodies, credentials, or headers.
  report.status = ['CREDENTIAL_UNAVAILABLE', 'OFFICIAL_LOGIN_FAILED', 'OFFICIAL_IDENTITY_FAILED'].includes(e?.message) ? e.message : 'TRANSPORT_OR_TOOL_ERROR';
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  mkdirSync('artifacts', { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify(report));
}
