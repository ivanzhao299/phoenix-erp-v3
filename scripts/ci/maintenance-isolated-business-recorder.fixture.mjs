/** Independent owned local sink + read-only PG recorder. All operations refer
 * to an explicit isolated test database and frozen operation inventory. Never
 * production business reconciliation, authority, or an installed factory. */
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fork, execFileSync } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import { canonicalDigest, bindingDigest, same, validateMaintenanceContext } from '../ops/production-maintenance-receipts.mjs';

const SOURCE = 'OWNED_LOCAL_SCENARIOS_NOT_PRODUCTION';
const KIND = 'maintenance-business-evidence';
const domains = ['NOTIFICATION_EXTERNAL_SEND', 'IOT_PARTIAL_COMMITS', 'CHANJET_AUTH_REQUESTS', 'DATABASE_TRANSACTIONS', 'PERSISTENT_TASKS'];
const hash = b => createHash('sha256').update(b).digest('hex');
const fail = code => { throw Error('ISOLATED_RECORDER_HOLD=' + code); };
const exact = (v, keys) => v && Object.getPrototypeOf(v) === Object.prototype && same(Object.keys(v).sort(), [...keys].sort());
function validate(input) {
  if (!exact(input, ['context', 'database', 'expected', 'directory'])) fail('FIXED_INITIAL_REQUIRED');
  if (Buffer.byteLength(JSON.stringify(input)) > 65536) fail('INITIAL_BYTE_BUDGET');
  validateMaintenanceContext(input.context);
  const d = input.database;
  if (!exact(d, ['id', 'imageId', 'startedAt']) || !/^[a-f0-9]{64}$/.test(d.id) || !/^sha256:[a-f0-9]{64}$/.test(d.imageId)
    || typeof d.startedAt !== 'string' || !Number.isFinite(Date.parse(d.startedAt))) fail('OWNED_DATABASE_REQUIRED');
  if (!exact(input.expected, domains)) fail('FROZEN_DOMAIN_INVENTORY_REQUIRED');
  const all = [];
  for (const domain of domains) {
    const ids = input.expected[domain];
    if (!Array.isArray(ids) || ids.length < 1 || ids.length > 64 || ids.some(id => typeof id !== 'string' || !/^[a-z][a-z0-9_-]{0,63}$/.test(id))) fail('FROZEN_OPERATION_IDS_REQUIRED');
    all.push(...ids);
  }
  if (new Set(all).size !== all.length) fail('UNIQUE_OPERATION_IDS_REQUIRED');
  if (!path.isAbsolute(input.directory) || path.normalize(input.directory) !== input.directory || fs.realpathSync(input.directory) !== input.directory) fail('OWNED_DIRECTORY_REQUIRED');
  const st = fs.lstatSync(input.directory);
  if (!st.isDirectory() || st.isSymbolicLink() || st.uid !== process.getuid() || (st.mode & 0o777) !== 0o700) fail('OWNED_DIRECTORY_REQUIRED');
  return structuredClone(input);
}

// Fixed SELECT only, on a dedicated fixture role with default_transaction_read_only.
// Observed foreign owners/IDs are returned too; a WHERE owner filter cannot hide them.
const sql = `BEGIN READ ONLY;
SELECT json_build_object('database',current_database(),'user',current_user,
 'readOnly',current_setting('transaction_read_only'),
 'operations',COALESCE((SELECT json_agg(row_to_json(t) ORDER BY domain,id,step)
   FROM (SELECT owner,domain,id,step,status,payload_sha256,http_status FROM fixture_operations) t),'[]'::json),
 'jobs',COALESCE((SELECT json_agg(row_to_json(t) ORDER BY id)
   FROM (SELECT owner,id,status FROM fixture_jobs) t),'[]'::json),
 'sessions',COALESCE((SELECT json_agg(json_build_object('pid',pid,'applicationName',application_name,'state',state,'transactionOpen',xact_start IS NOT NULL) ORDER BY pid)
   FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid()),'[]'::json),
 'prepared',COALESCE((SELECT json_agg(json_build_object('gid',gid,'owner',owner,'database',database) ORDER BY gid)
   FROM pg_prepared_xacts WHERE database=current_database()),'[]'::json)); COMMIT;`;
function readDatabase(initial) {
  const run = args => execFileSync('/usr/bin/docker', ['--host', 'unix:///var/run/docker.sock', ...args], {
    env: { PATH: '/usr/bin:/bin' }, encoding: 'utf8', timeout: 2000, maxBuffer: 131072, stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  const pin = () => {
    const r = JSON.parse(run(['inspect', initial.database.id, '--format', '[{{json .Id}},{{json .Image}},{{json .State.StartedAt}},{{json .State.Running}},{{json .RestartCount}},{{json .Config.Labels}}]']));
    if (!same(r.slice(0,3), [initial.database.id, initial.database.imageId, initial.database.startedAt]) || r[3] !== true || r[4] !== 0
      || r[5]?.['phoenix.test.kind'] !== KIND || r[5]?.['phoenix.test.owner'] !== initial.context.owner) fail('DATABASE_IDENTITY_CHANGED');
    return canonicalDigest(r);
  };
  const before = pin(), startedAt = new Date().toISOString();
  const value = JSON.parse(run(['exec', initial.database.id, 'psql', '-U', 'fixture_recorder', '-d', 'maintenance_business', '-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-c', sql]));
  if (pin() !== before || value.database !== 'maintenance_business' || value.user !== 'fixture_recorder' || value.readOnly !== 'on'
    || ['operations','jobs','sessions','prepared'].some(k => !Array.isArray(value[k]))) fail('DATABASE_OBSERVATION_UNVERIFIED');
  return { startedAt, finishedAt: new Date().toISOString(), databasePinSha256: before, value };
}

/** Evaluation consumes independently read facts and the pre-execution inventory.
 * Exported for distinguishing negative tests, never an evidence-authority API. */
export function evaluateIsolatedBusinessFacts(initialInput, facts, sink) {
  const initial = validate(initialInput), expected = initial.expected, owner = initial.context.owner;
  if (!facts || !exact(facts.value, ['database','user','readOnly','operations','jobs','sessions','prepared'])
    || !Array.isArray(sink)) fail('OBSERVED_FACTS_REQUIRED');
  const rows = facts.value.operations, jobs = facts.value.jobs;
  if ([rows,jobs,facts.value.sessions,facts.value.prepared].some(v => !Array.isArray(v))) fail('OBSERVED_FACTS_REQUIRED');
  const reports = domains.map(domain => {
    const ids = expected[domain], r = rows.filter(x => x.domain === domain), remote = sink.filter(x => x.domain === domain), problems = [];
    const expectedRows = domain === 'IOT_PARTIAL_COMMITS' ? ids.flatMap(id => [1,2].map(step => ({ id, step }))) : ids.map(id => ({ id, step: 0 }));
    const terminals = domain === 'PERSISTENT_TASKS' ? jobs : r;
    const actualIds = terminals.map(x => x.id).sort();
    const requireTerminals = () => {
      if (terminals.length !== expectedRows.length || terminals.some(x => x.owner !== owner || x.status !== 'COMPLETE')
        || !same(terminals.map(x => ({ id: x.id, step: x.step ?? 0 })).sort((a,b) => a.id.localeCompare(b.id) || a.step-b.step), expectedRows.slice().sort((a,b) => a.id.localeCompare(b.id) || a.step-b.step))) problems.push('MISSING_EXTRA_OR_NONTERMINAL_RECORD');
    };
    requireTerminals();
    if (['NOTIFICATION_EXTERNAL_SEND','CHANJET_AUTH_REQUESTS'].includes(domain)) {
      if (remote.length !== ids.length || !same(remote.map(x => x.id).sort(), ids.slice().sort()) || remote.some(x => x.owner !== owner
        || x.httpStatus !== (domain === 'CHANJET_AUTH_REQUESTS' ? 503 : 202)
        || x.bodySha256 !== hash(`owned:${owner}:${x.id}`)
        || !r.some(y => y.id === x.id && y.payload_sha256 === x.bodySha256 && y.http_status === x.httpStatus))) problems.push('SINK_AND_DATABASE_MISMATCH');
    } else if (remote.length) problems.push('UNEXPECTED_SINK_EFFECT');
    if (domain === 'DATABASE_TRANSACTIONS' && (facts.value.sessions.length || facts.value.prepared.length)) problems.push('DATABASE_WORK_REMAINS');
    if (domain === 'PERSISTENT_TASKS' && r.length) problems.push('UNEXPECTED_JOB_OPERATION_LOG');
    // A row with an unknown domain must not disappear from per-domain filtering.
    if (rows.some(x => !domains.includes(x.domain)) || sink.some(x => !domains.includes(x.domain))) problems.push('UNCLASSIFIED_EFFECT');
    return { domain, expectedOperationIds: ids, observedOperationIds: actualIds, sourceRecordDigests: {
      database: canonicalDigest({ rows: r, jobs: domain === 'PERSISTENT_TASKS' ? jobs : [],
        sessions: domain === 'DATABASE_TRANSACTIONS' ? facts.value.sessions : [], prepared: domain === 'DATABASE_TRANSACTIONS' ? facts.value.prepared : [] }),
      independentSink: canonicalDigest(remote) }, problems,
      disposition: problems.length ? 'UNKNOWN' : 'RECONCILED', unknownEffects: problems.length,
      pendingWrites: terminals.filter(x => x.status !== 'COMPLETE').length,
      requiresReplay: false, requiresBusinessMutation: false };
  });
  return { schema: 'phoenix.isolated-business-reconciliation/v1', source: SOURCE, fixtureOnly: true, productionReceipt: false,
    owner, contextDigest: bindingDigest(initial.context), expectedInventorySha256: canonicalDigest(expected),
    observationStart: facts.startedAt, observationEnd: facts.finishedAt, sourceFactsSha256: canonicalDigest(facts),
    independentSinkSha256: canonicalDigest(sink), observedFacts: structuredClone({ database: facts, independentSink: sink }), domains: reports,
    result: 'SNAPSHOT_ONLY', evaluation: reports.some(r => r.disposition !== 'RECONCILED') ? 'HOLD' : 'RECONCILED',
    coverage: 'FROZEN_LOCAL_OPERATION_IDS_POINT_IN_TIME', continuousFenceProof: false, workerLifecycleProof: false,
    actualProductionDomainsCovered: false, admissionOrApprovalGranted: false };
}

async function childMain() {
  let initial, server, journal, journalPin, shutdown = false, sinkFatal = false, pendingHttp = 0, sealStarted = false, sealed = false;
  const sink = [], sockets = new Map();
  process.on('disconnect', () => { shutdown = true; server?.close(); });
  const sourceSha256 = hash(fs.readFileSync(fileURLToPath(import.meta.url)));
  const pinnedJournal = () => {
    const st = fs.lstatSync(journal);
    if (!st.isFile() || st.isSymbolicLink() || st.uid !== process.getuid() || st.nlink !== 1 || (st.mode & 0o777) !== 0o600
      || st.dev !== journalPin.dev || st.ino !== journalPin.ino) fail('SINK_JOURNAL_CHANGED');
    const records = fs.readFileSync(journal, 'utf8').split('\n').filter(Boolean).map(JSON.parse);
    if (!same(records, sink)) fail('SINK_JOURNAL_CHANGED'); return records;
  };
  const persist = event => {
    try {
      if (sink.length >= 1024) fail('SINK_BUDGET'); pinnedJournal();
      const fd = fs.openSync(journal, fs.constants.O_WRONLY | fs.constants.O_APPEND | fs.constants.O_NOFOLLOW);
      try { const st = fs.fstatSync(fd); if (st.ino !== journalPin.ino || st.dev !== journalPin.dev || st.nlink !== 1 || (st.mode & 0o777) !== 0o600) fail('SINK_JOURNAL_CHANGED'); fs.writeSync(fd, JSON.stringify(event)+'\n'); fs.fsyncSync(fd); }
      finally { fs.closeSync(fd); }
      sink.push(event);
    } catch (error) { sinkFatal = true; throw error; }
  };
  const unclassified = category => {
    sinkFatal = true;
    // Error categories are compiled constants; never retain parser bytes,
    // exception text, arbitrary URLs, headers or submitted bodies.
    try { persist({ owner: initial.context.owner, domain: 'UNCLASSIFIED_REQUEST', id: category, bodySha256: hash(''), httpStatus: 400 }); }
    catch { /* Sticky uncertainty still forbids collection if journaling fails. */ }
  };
  process.on('message', async request => {
    try {
      if (!process.send || shutdown || !request || Buffer.byteLength(JSON.stringify(request)) > 65536 || typeof request.id !== 'string') fail('FIXED_REQUEST_REQUIRED');
      let value;
      if (request.operation === 'INIT') {
        if (initial || !exact(request, ['id','operation','value'])) fail('INIT_ONCE_REQUIRED'); initial = validate(request.value);
        journal = path.join(initial.directory, 'independent-sink.jsonl'); fs.writeFileSync(journal, '', { mode: 0o600, flag: 'wx' }); journalPin = fs.lstatSync(journal);
        server = http.createServer((req, res) => {
          const connection = sockets.get(req.socket); if (!connection) sinkFatal = true; else connection.requests++;
          pendingHttp++; let finished = false;
          const settled = () => { if (!finished) { finished = true; pendingHttp--; } };
          let responseFinished = false;
          res.once('close',() => { if (!responseFinished || !req.complete) sinkFatal = true; settled(); });
          res.once('finish',() => { responseFinished = true; if (req.complete && connection) connection.completed++; else sinkFatal = true; settled(); });
          const parts = req.url?.match(/^\/(notify|auth)\/([a-z][a-z0-9_-]{0,63})$/), chunks = []; let size = 0;
          const rejected = () => persist({ owner: initial.context.owner, domain: 'UNCLASSIFIED_REQUEST', id: 'rejected_request', bodySha256: hash(Buffer.concat(chunks)), httpStatus: 400 });
          if (req.method !== 'POST' || !parts) { try { rejected(); res.writeHead(400); res.end(); req.resume(); } catch { res.destroy(); } return; }
          req.on('error', () => { sinkFatal = true; });
          req.on('aborted', () => { sinkFatal = true; });
          req.on('data', b => { size += b.length; if (size > 256) { try { rejected(); } catch {} req.destroy(); } else chunks.push(b); });
          req.on('end', () => {
            try {
              if (size > 256 || shutdown || sinkFatal) fail('SINK_BUDGET');
              const domain = parts[1] === 'notify' ? domains[0] : domains[2], id = parts[2], bodySha256 = hash(Buffer.concat(chunks));
              const event = { owner: initial.context.owner, domain, id, bodySha256, httpStatus: parts[1] === 'notify' ? 202 : 503 };
              // Persist and fsync before acknowledging even a deliberate provider503.
              persist(event); res.writeHead(event.httpStatus); res.end();
            } catch { sinkFatal = true; res.destroy(); }
          });
        });
        server.on('connection', socket => {
          const connection = { bytes: 0, requests: 0, completed: 0, closed: null };
          connection.closed = new Promise(resolve => socket.once('close', () => {
            if (connection.bytes > 0 && !connection.requests) unclassified('unparsed_connection');
            if (connection.requests !== connection.completed) unclassified('unfinished_request');
            sockets.delete(socket); resolve();
          }));
          sockets.set(socket,connection);
          socket.on('data', bytes => { connection.bytes = Math.min(Number.MAX_SAFE_INTEGER,connection.bytes+bytes.length); });
        });
        server.on('clientError', (_error,socket) => { unclassified('http_parser_error'); socket.destroy(); });
        server.on('connect', (_request,socket) => { unclassified('unsupported_connect'); socket.destroy(); });
        server.on('upgrade', (_request,socket) => { unclassified('unsupported_upgrade'); socket.destroy(); });
        server.on('checkExpectation', (_request,response) => {
          unclassified('unsupported_expectation'); response.writeHead(417,{Connection:'close'}); response.end();
        });
        await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0, '127.0.0.1', resolve); });
        value = { source: SOURCE, sourceSha256, childPid: process.pid, port: server.address().port, contextDigest: bindingDigest(initial.context) };
      } else if (['COLLECT','HEALTH','SEAL'].includes(request.operation)) {
        if (!initial || !exact(request, ['id','operation','nonce']) || !/^[a-f0-9-]{36}$/.test(request.nonce)) fail('FIXED_READ_REQUIRED');
        let seal;
        if (request.operation === 'SEAL') {
          if (sealStarted) fail('SEAL_SINGLE_ATTEMPT_REQUIRED'); sealStarted = true;
          const startedAt = new Date().toISOString();
          // No force-close or reopening. Partial requests retain actual debt;
          // an outer timeout cannot turn that debt into a successful seal.
          await new Promise((resolve,reject) => server.close(error => error ? reject(error) : resolve()));
          await Promise.all([...sockets.values()].map(connection => connection.closed));
          const count = await new Promise((resolve,reject) => server.getConnections((error,n) => error ? reject(error) : resolve(n)));
          if (server.listening || count !== 0 || sockets.size || pendingHttp || sinkFatal) fail('SEAL_HTTP_CLOSURE_UNVERIFIED');
          sealed = true; seal = { startedAt, closedAt: new Date().toISOString(), originalListenerClosed: true,
            originalConnectionsClosed: true, connectionCount: count, pendingRequests: pendingHttp,
            idleConnectionPolicy: 'CLOSED_EMPTY_CONNECTION_WITH_ZERO_RECEIVED_BYTES_IS_NOT_A_REQUEST',
            executorStopOrIsolation: 'NOT_PROVED_REQUIRES_INDEPENDENT_UPPER_LAYER_EVIDENCE' };
        }
        if (pendingHttp || sinkFatal) fail('SINK_HTTP_WORK_REMAINS_OR_UNVERIFIED');
        const records = pinnedJournal(), facts = readDatabase(initial);
        const report = evaluateIsolatedBusinessFacts(initial, facts, records);
        if (seal) { report.result = report.evaluation === 'RECONCILED' ? 'SEALED_RECONCILED' : 'HOLD'; report.seal = seal; report.coverage = 'SEALED_OWNED_LISTENER_AND_FROZEN_LOCAL_OPERATION_IDS'; }
        value = { source: SOURCE, sourceSha256, childPid: process.pid, contextDigest: bindingDigest(initial.context), nonce: request.nonce,
          report, independentRecorder: true };
      } else if (request.operation === 'CLOSE') {
        if (!exact(request, ['id','operation'])) fail('FIXED_CLOSE_REQUIRED'); shutdown = true;
        if (server && !sealed) await new Promise(resolve => server.close(resolve));
        if (journal) pinnedJournal();
        process.send({ id: request.id, ok: true, value: { originalServerClosed: true } }, () => process.disconnect()); return;
      } else fail('UNKNOWN_OPERATION');
      process.send({ id: request.id, ok: true, value });
    } catch { process.send?.({ id: request?.id, ok: false }); }
  });
}

export async function openIsolatedBusinessRecorder(input, { registerOwnedChild, timeoutMs = 10000 } = {}) {
  const initial = validate(input), sourceSha256 = hash(fs.readFileSync(fileURLToPath(import.meta.url)));
  if (typeof registerOwnedChild !== 'function' || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) fail('OWNED_REGISTRATION_REQUIRED');
  const child = fork(fileURLToPath(import.meta.url), ['--owned-business-recorder'], {
    execPath: process.execPath, execArgv: [], env: { PATH: '/usr/bin:/bin' }, stdio: ['ignore','ignore','ignore','ipc'] });
  let closed = false, fatal = false, closing; const pending = new Map();
  const joined = new Promise(resolve => child.once('close', (code, signal) => { closed = true; if (!closing) fatal = true;
    for (const p of pending.values()) p.reject(Error('ISOLATED_RECORDER_HOLD=ORIGINAL_CHILD_CLOSED')); pending.clear(); resolve({ code, signal }); }));
  child.on('error', () => { fatal = true; });
  child.on('message', response => {
    if (!response || Buffer.byteLength(JSON.stringify(response)) > 262144) { fatal = true; return; }
    const p = pending.get(response?.id);
    if (!p || !(exact(response, ['id','ok','value']) && response.ok === true || exact(response, ['id','ok']) && response.ok === false)) { fatal = true; return; }
    pending.delete(response.id); response.ok ? p.resolve(response.value) : p.reject(Error('ISOLATED_RECORDER_HOLD=READ_REFUSED'));
  });
  const rpc = async (operation, fields, { timeoutMs = 30000, signal } = {}) => {
    if ((fatal && operation !== 'CLOSE') || closed || !child.connected || pending.size >= 16 || !Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000
      || (signal && !(signal instanceof AbortSignal)) || signal?.aborted) fail('DEADLINE_OR_UNAVAILABLE');
    const start = performance.now(), wall = Date.now(), id = randomUUID(); let timer, abort;
    const work = new Promise((resolve,reject) => { pending.set(id, { resolve, reject });
      const sent = child.send({ id, operation, ...fields }, error => { if (error) { fatal = true; reject(Error('ISOLATED_RECORDER_HOLD=SEND_FAILED')); } });
      if (!sent) { fatal = true; reject(Error('ISOLATED_RECORDER_HOLD=SEND_BACKPRESSURE')); } });
    try {
      const value = await Promise.race([work, new Promise((_,reject) => {
        abort = () => { fatal = true; reject(Error('ISOLATED_RECORDER_HOLD=DEADLINE_OR_ABORT')); };
        timer = setTimeout(abort, timeoutMs); signal?.addEventListener('abort',abort,{ once: true });
      })]);
      if (fatal && operation !== 'CLOSE') fail('FAILED_CONTROLLER');
      if (performance.now()-start >= timeoutMs || Date.now()<wall || Date.now()-wall >= timeoutMs || signal?.aborted) fail('DEADLINE_OR_ABORT');
      return value;
    } catch (error) { fatal = true; throw error; }
    finally { clearTimeout(timer); signal?.removeEventListener('abort',abort); }
  };
  try {
    registerOwnedChild(child);
    const ready = await rpc('INIT', { value: initial }, { timeoutMs });
    if (ready.source !== SOURCE || ready.sourceSha256 !== sourceSha256 || ready.childPid !== child.pid
      || ready.contextDigest !== bindingDigest(initial.context) || !Number.isSafeInteger(ready.port) || ready.port < 1 || ready.port > 65535) fail('ORIGINAL_HANDSHAKE_REQUIRED');
    const read = async (operation, options = {}) => {
      const nonce = options.nonce ?? randomUUID(), response = await rpc(operation, { nonce }, options);
      if (response.source !== SOURCE || response.sourceSha256 !== sourceSha256 || response.childPid !== child.pid
        || response.contextDigest !== bindingDigest(initial.context) || response.nonce !== nonce || response.independentRecorder !== true
        || response.report?.fixtureOnly !== true || response.report?.productionReceipt !== false) { fatal = true; fail('ORIGINAL_RESPONSE_REQUIRED'); }
      return response;
    };
    return Object.freeze({ childPid: child.pid, sourceSha256, endpoint: `http://127.0.0.1:${ready.port}`,
      collect: options => read('COLLECT',options), health: options => read('HEALTH',options), seal: options => read('SEAL',options),
      cleanupDebt: () => ({ originalChildClosed: closed, pendingReads: pending.size, fatal, fixtureOnly: true, productionReceipt: false }),
      close: ({ timeoutMs = 10000 } = {}) => {
        if (closing) return closing;
        if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000) return Promise.reject(Error('ISOLATED_RECORDER_HOLD=FIXED_CLOSE_BUDGET_REQUIRED'));
        if (pending.size) return Promise.reject(Error('ISOLATED_RECORDER_HOLD=PENDING_WORK_REQUIRES_SUPERVISION'));
        return closing = (async () => {
          const start = performance.now(); await rpc('CLOSE', {}, { timeoutMs }); let timer;
          try {
            const value = await Promise.race([joined, new Promise((_,reject) => { timer = setTimeout(() => reject(Error('ISOLATED_RECORDER_HOLD=ORIGINAL_CLOSE_UNVERIFIED')), Math.max(1,timeoutMs-(performance.now()-start))); })]);
            if (value.code !== 0 || value.signal !== null || performance.now()-start >= timeoutMs) fail('ORIGINAL_CLOSE_UNVERIFIED');
            return { originalChildClosed: true, childPid: child.pid, fixtureOnly: true, productionReceipt: false };
          } finally { clearTimeout(timer); }
        })();
      }
    });
  } catch (error) {
    // The registration callback itself may have thrown. The creator still owns
    // this exact ChildProcess and original close waiter; PID-only handoff is
    // insufficient. One typed graceful close is attempted, never guessed kill.
    let cleanupFailure = null;
    try {
      await rpc('CLOSE', {}, { timeoutMs: 1000 }); let timer;
      try { await Promise.race([joined,new Promise((_,reject) => { timer=setTimeout(()=>reject(Error('ISOLATED_RECORDER_HOLD=BOOTSTRAP_CLOSE_UNVERIFIED')),1000); })]); }
      finally { clearTimeout(timer); }
    } catch (failure) { cleanupFailure = failure; }
    throw Object.assign(error, { originalChild: child, originalClose: joined, originalChildPid: child.pid,
      originalChildClosed: closed, cleanupAttempted: true, cleanupFailure: cleanupFailure?.message ?? null, supervisionRequired: !closed });
  }
}

/** Fixed compiled graph adapter. HEALTH verifies recorder integrity and a fresh
 * actual PG read, not completed business work. SEAL is a distinct capability;
 * neither the health response nor a snapshot grants reconciliation approval. */
export function prepareIsolatedBusinessRecorderParticipant(input) {
  const initial = validate(input), sourceSha256 = hash(fs.readFileSync(fileURLToPath(import.meta.url)));
  let client, attempted = false;
  const current = () => { if (!client) fail('RECORDER_NOT_STARTED'); return client; };
  const definition = Object.freeze({ role: 'EVIDENCE_RECORDER', sourceSha256,
    async start({ registerOwnedChild, timeoutMs, signal }) {
      if (attempted || signal?.aborted) fail('START_SINGLE_ATTEMPT_REQUIRED'); attempted = true;
      client = await openIsolatedBusinessRecorder(initial,{ registerOwnedChild, timeoutMs }); return client;
    },
    async probe(handle,{ nonce,timeoutMs,signal }) {
      if (handle !== current()) fail('ORIGINAL_RECORDER_REQUIRED');
      const response = await handle.health({ nonce,timeoutMs,signal }), debt = handle.cleanupDebt();
      if (response.report.result !== 'SNAPSHOT_ONLY' || response.report.contextDigest !== bindingDigest(initial.context)
        || response.report.expectedInventorySha256 !== canonicalDigest(initial.expected)
        || debt.originalChildClosed || debt.fatal || debt.pendingReads !== 0) fail('RECORDER_HEALTH_UNVERIFIED');
      return { schema:'phoenix.maintenance-control-participant-health/v1',role:'EVIDENCE_RECORDER',owner:initial.context.owner,
        contextDigest:bindingDigest(initial.context),sourceSha256,childPid:handle.childPid,nonce,healthy:true,pending:debt.pendingReads,protocolVersion:1 };
    },
    async close(handle,{ timeoutMs }) { if (handle !== current()) fail('ORIGINAL_RECORDER_REQUIRED'); return handle.close({ timeoutMs }); }
  });
  return Object.freeze({ definition,reader:Object.freeze({
    endpoint:()=>current().endpoint, collect:options=>current().collect(options), seal:options=>current().seal(options)
  }),fixtureOnly:true,productionAuthorized:false });
}

if (process.argv[1] === fileURLToPath(import.meta.url) && process.argv[2] === '--owned-business-recorder') await childMain();
