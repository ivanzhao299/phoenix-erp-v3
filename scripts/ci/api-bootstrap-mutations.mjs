import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
const hash = text => crypto.createHash('sha256').update(text).digest('hex');
const run = (command, args, opts = {}) => execFileSync(command, args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], ...opts });
const fixtureDatabase = 'api_bootstrap_fixture';
export function classifySql(sql) {
  const clean = sql.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim();
  if (/\b(?:CREATE|ALTER|DROP|TRUNCATE|COMMENT|REINDEX|GRANT|REVOKE)\b/i.test(clean)) return 'SCHEMA_MUTATION';
  if (/\b(?:setval|nextval)\s*\(/i.test(clean)) return 'SEQUENCE_MUTATION';
  if (/\b(?:INSERT|UPDATE|DELETE|MERGE|COPY|CALL|DO)\b/i.test(clean)) return 'BUSINESS_DATA_MUTATION';
  if (/^SELECT\b/i.test(clean)) {
    // Treat unknown executable SQL functions as writes until explicitly audited.
    const functions = [...clean.matchAll(/\b([a-z_][a-z0-9_]*)\s*\(/gi)].map(m => m[1].toLowerCase());
    const safe = new Set(['version', 'current_schema', 'current_database', 'any', 'in', 'where', 'and', 'or', 'as', 'not', 'case', 'when', 'exists', 'coalesce', 'nullif', 'count', 'max', 'min', 'lower', 'upper', 'to_regclass']);
    return functions.some(name => !safe.has(name)) ? 'UNKNOWN_EXECUTABLE_SQL' : 'READ';
  }
  return /^(?:SHOW|SET|RESET|BEGIN|COMMIT|ROLLBACK)\b/i.test(clean) ? 'SESSION' : 'UNKNOWN_SQL';
}
export function capturedDatabaseStatements(log, database) {
  const records = [];let record;
  for (const line of log.split('\n')) {
    if (/bootstrap-db=/.test(line)) {
      if (record) records.push(record);record=undefined;
      if ((!database || line.includes(`bootstrap-db=${database} `)) && /(?:LOG:\s+(?:statement:|execute [^:]+:)|STATEMENT:)/.test(line)) {
        const app=line.match(/ app=(.*?) pid=/)?.[1] ?? '';
        record={app,database:line.match(/bootstrap-db=([^ ]+)/)?.[1],sql:line.replace(/^.*?(?:LOG:\s+(?:statement:|execute [^:]+:)|STATEMENT:)\s*/, '')};
      }
    } else if (record !== undefined) record.sql+='\n'+line;
  }
  if(record)records.push(record);return records;
}
export function capturedStatements(log, app) {
  const database=log.match(/bootstrap-db=([^ ]+)/)?.[1];
  return capturedDatabaseStatements(log,database).filter(record=>record.app===app).map(record=>record.sql);
}
export function sliceCapturedWindow(log, begin, end, controlApp) {
  const records=capturedDatabaseStatements(log);
  const normalize=sql=>sql.trim().replace(/;$/, '');
  const first=records.findIndex(record=>record.app===controlApp&&normalize(record.sql)===begin);
  const last=records.findIndex((record,index)=>index>first&&record.app===controlApp&&normalize(record.sql)===end);
  if(first<0||last<0)throw Error('BOOTSTRAP_SERVER_BOUNDARY_REQUIRED');
  return records.slice(first+1,last);
}
export async function verifyBootstrap() {
  let evidenceDir, state;
  const save = () => { if (evidenceDir && state) fs.writeFileSync(path.join(evidenceDir,'summary.json'),JSON.stringify(state,null,2),{mode:0o600}); };
  try {
  const container = process.env.BOOTSTRAP_FIXTURE_CONTAINER;
  const admin = process.env.PGUSER;
  const port = process.env.PGPORT || '5432';
  const httpPort = process.env.BOOTSTRAP_FIXTURE_HTTP_PORT || '35179';
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(container || '') || !['bootstrap_fixture', 'phoenix_v3'].includes(admin)
    || process.env.PGDATABASE !== fixtureDatabase || !['127.0.0.1', 'localhost'].includes(process.env.PGHOST)) throw Error('BOOTSTRAP_FIXTURE_CONTEXT_REQUIRED');
  evidenceDir = process.env.BOOTSTRAP_EVIDENCE_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'api-bootstrap-evidence-'));
  fs.mkdirSync(evidenceDir,{recursive:true,mode:0o700});
  state={schema:'phoenix.api-bootstrap-mutation-evidence/v1',outcome:'RUNNING',phase:'PREPARATION',database:fixtureDatabase,profiles:[],productionMutation:false};save();
  const sql = query => run('docker', ['exec', '-i', container, 'psql', '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-U', admin, '-d', fixtureDatabase], { input: query });
  if (!sql('SELECT current_database();').includes(fixtureDatabase)) throw Error('BOOTSTRAP_FIXTURE_DATABASE_REQUIRED');
  // CI owns a dedicated ephemeral service container. Set logging before capture only.
  sql("ALTER SYSTEM SET log_statement='all';");
  sql("ALTER SYSTEM SET log_line_prefix='bootstrap-db=%d user=%u app=%a pid=%p ';");
  sql('SELECT pg_reload_conf();');
  if (!sql('SHOW log_statement;').includes('all') || !sql('SHOW log_line_prefix;').includes('app=%a')) throw Error('BOOTSTRAP_SQL_CAPTURE_REQUIRED');
  sql(`DO $$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='bootstrap_runtime_ro') THEN CREATE ROLE bootstrap_runtime_ro LOGIN PASSWORD 'bootstrap-role-fixture-only'; END IF; END $$;
      ALTER ROLE bootstrap_runtime_ro SET default_transaction_read_only=on;
      GRANT CONNECT ON DATABASE api_bootstrap_fixture TO bootstrap_runtime_ro;
      GRANT USAGE ON SCHEMA public TO bootstrap_runtime_ro;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO bootstrap_runtime_ro;
      GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO bootstrap_runtime_ro;
      INSERT INTO sys_chanjet_state(key,app_ticket,certificate,tokens) VALUES('singleton','fixture-ticket','fixture-certificate',NULL)
      ON CONFLICT(key) DO UPDATE SET app_ticket=EXCLUDED.app_ticket,certificate=EXCLUDED.certificate,tokens=NULL;`);
  // Deliberately retain states that the old startup repair would overwrite.
  sql(`INSERT INTO fin_invoices(invoice_no,direction,amount) SELECT 'BOOTSTRAP-FIXTURE-INVOICE',NULL,123.45 WHERE NOT EXISTS(SELECT 1 FROM fin_invoices WHERE invoice_no='BOOTSTRAP-FIXTURE-INVOICE');
      INSERT INTO fin_transactions(transaction_no,txn_no,amount) SELECT 'BOOTSTRAP-FIXTURE-TXN',NULL,234.56 WHERE NOT EXISTS(SELECT 1 FROM fin_transactions WHERE transaction_no='BOOTSTRAP-FIXTURE-TXN');
      INSERT INTO ord_customers(customer_code,customer_name) SELECT 'BOOTSTRAP-FIXTURE-CUSTOMER','Synthetic existing customer' WHERE NOT EXISTS(SELECT 1 FROM ord_customers WHERE customer_code='BOOTSTRAP-FIXTURE-CUSTOMER');
      INSERT INTO chanjet_sync_jobs(job_type,book_id,company_code,period,status,request_scope) SELECT 'BOOK_REFRESH','fixture-book','fixture-company','202610','RUNNING','{"orchestrationRunId":"CHANJET-RO-FIXTURE-INTERRUPTED","lifecycleState":"RUNNING"}'::jsonb WHERE NOT EXISTS(SELECT 1 FROM chanjet_sync_jobs WHERE book_id='fixture-book');`);
  const quote = name => '"' + name.replaceAll('"', '""') + '"';
  const fingerprint = () => {
    const tables = sql("SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;").trim().split('\n').filter(Boolean);
    const literal = name => "'" + name.replaceAll("'", "''") + "'";
    const dataSql = tables.map(table => `SELECT ${literal(table)} AS table_name, count(*)::text AS rows, md5(COALESCE(string_agg(md5(row_to_json(t)::text),'' ORDER BY md5(row_to_json(t)::text)),'')) AS digest FROM public.${quote(table)} t`).join(' UNION ALL ');
    const data = sql(`BEGIN READ ONLY; ${dataSql} ORDER BY table_name; ROLLBACK;`);
    const sequences = sql("SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename;").trim().split('\n').filter(Boolean);
    const sequenceSql = sequences.map(name => `SELECT ${literal(name)} AS sequence_name,last_value,is_called FROM public.${quote(name)}`).join(' UNION ALL ');
    const sequenceState = sequences.length ? sql(`BEGIN READ ONLY; ${sequenceSql} ORDER BY sequence_name; ROLLBACK;`) : '';
    const schema = run('docker', ['exec', container, 'pg_dump', '-U', admin, '-d', fixtureDatabase, '--schema-only', '--no-owner', '--no-privileges']).replace(/^\\(?:un)?restrict .*$/gm, '');
    return { schema: hash(schema), data: hash(JSON.stringify(data)), sequences: hash(JSON.stringify(sequenceState)), tables: tables.length, sequenceCount: sequences.length };
  };
  const profiles = [{ name: 'writer-restored-auth', readonly: false, missingTicket: false }, { name: 'readonly-restored-auth', readonly: true, missingTicket: false }, { name: 'writer-auth-maintenance', readonly: false, missingTicket: true }, { name: 'missing-schema-hold', readonly: false, missingTicket: false, missingSchema: true }, { name: 'retired-iot-fk-hold', readonly: false, missingTicket: false, retiredConstraint: true }];
  const results = [];
  const vapid=crypto.createECDH('prime256v1');vapid.generateKeys();
  for (const profile of profiles) {
    state.phase=profile.name;state.currentProfile={profile:profile.name,outcome:'RUNNING'};save();
    sql(`UPDATE sys_chanjet_state SET app_ticket=${profile.missingTicket ? 'NULL' : "'fixture-ticket'"} WHERE key='singleton';`);
    if (profile.missingSchema) sql('DROP TABLE sys_settings;');
    if (profile.retiredConstraint) sql('ALTER TABLE mon_device_realtime_snapshot ADD CONSTRAINT mon_device_realtime_snapshot_property_code_fkey FOREIGN KEY(property_code) REFERENCES mon_device_property_dict(property_code);');
    const before = fingerprint();
    const app = `boot_${crypto.randomUUID().replaceAll('-', '')}`;
    const network = path.join(evidenceDir, profile.name + '-network.jsonl');
    fs.writeFileSync(network, '', { mode: 0o600 });
    const controlApp=`control_${app}`;
    const marker=statement=>run('docker',['exec','-i','-e',`PGAPPNAME=${controlApp}`,container,'psql','-X','-At','-v','ON_ERROR_STOP=1','-U',admin,'-d',fixtureDatabase],{input:statement+';'});
    const beginStatement=`SELECT 'BOOTSTRAP_CAPTURE_BEGIN_${app}'`;
    const endStatement=`SELECT 'BOOTSTRAP_CAPTURE_END_${app}'`;
    const drainStatement="SELECT count(*) FROM pg_catalog.pg_stat_activity WHERE backend_type='client backend' AND pid<>pg_backend_pid()";
    const start = new Date().toISOString();
    marker(beginStatement);
    const fixtureEnv = {
      VAPID_PUBLIC_KEY:vapid.getPublicKey().toString('base64url'),VAPID_PRIVATE_KEY:vapid.getPrivateKey().toString('base64url'),VAPID_SUBJECT:'mailto:fixture@example.invalid',
      NODE_ENV: 'production', APP_ENV: 'production', ENABLE_DEV_LOGIN: 'false', PORT: process.env.BOOTSTRAP_RUNTIME_DOCKER_NODE === 'true' ? '3100' : httpPort,
      DB_HOST: '127.0.0.1', DB_PORT: process.env.BOOTSTRAP_RUNTIME_DOCKER_NODE === 'true' ? '5432' : port,
      DB_USER: profile.readonly ? 'bootstrap_runtime_ro' : admin, DB_PASSWORD: profile.readonly ? 'bootstrap-role-fixture-only' : process.env.PGPASSWORD,
      DB_NAME: fixtureDatabase, JWT_SECRET: 'bootstrap_fixture_only_jwt_min_length_32_chars', JWT_SECRET_PREV: '',
      CHANJET_SYNC_POLICY: 'HOLD', CHANJET_READONLY_SYNC_ENABLED: 'false', CHANJET_ERP_INBOUND_SYNC_ENABLED: 'false', CHANJET_READONLY_APPROVAL: '',
      CHANJET_APP_KEY: 'bootstrap-fixture-app', CHANJET_APP_SECRET: 'bootstrap-fixture-secret', CHANJET_CERT: 'fixture-certificate', CHANJET_ORG_ID: 'bootstrap-fixture-org',
      BOOTSTRAP_FIXTURE_DATABASE: fixtureDatabase, BOOTSTRAP_CAPTURE_APP: app, BOOTSTRAP_NETWORK_EVIDENCE: network,
      NODE_OPTIONS: `--require=${path.resolve('scripts/ci/api-bootstrap-transport-fixture.cjs')}`,
    };
    let command = process.execPath, args = [path.resolve('apps/api/dist/main.js')];
    if (process.env.BOOTSTRAP_RUNTIME_DOCKER_NODE === 'true') {
      command = 'docker';
      args = ['run', '--rm', '--network', `container:${container}`, '--user', `${process.getuid()}:${process.getgid()}`, '-v', `${process.env.BOOTSTRAP_WORKSPACE_ROOT}:${process.env.BOOTSTRAP_WORKSPACE_ROOT}`, '-v', `${evidenceDir}:${evidenceDir}`, '-w', process.cwd(), ...Object.entries(fixtureEnv).flatMap(([k,v]) => ['-e',`${k}=${v}`]), 'node:20-bookworm-slim', 'node', path.resolve('apps/api/dist/main.js')];
    }
    const runtimeContainer = `api-bootstrap-runtime-${app}`;
    if (command==='docker') args.splice(1,0,'--name',runtimeContainer);
    const child = spawn(command, args, { cwd: process.cwd(), env: { PATH: process.env.PATH, ...fixtureEnv }, stdio: ['ignore','pipe','pipe'] });
    let output = '';child.stdout.on('data', x => output += x);child.stderr.on('data', x => output += x);
    try {
      let ready = false;
      for (let i=0;i<40;i++) {
        if (child.exitCode !== null) break;
        try { const response = await fetch(`http://127.0.0.1:${httpPort}/api/readiness`, {signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break;} } catch {}
        await new Promise(r=>setTimeout(r,500));
      }
      const shouldHold = !!(profile.missingSchema || profile.retiredConstraint);
      if (shouldHold) {
        if (ready || !/SCHEMA_MISMATCH|数据库结构不兼容/.test(output)) throw Error('BOOTSTRAP_SCHEMA_HOLD_REQUIRED');
      } else if (!ready) throw Error(`BOOTSTRAP_NOT_READY:${profile.name}`);
      // Covers setImmediate startup auth, while fixed clock keeps runtime cron ticks separate.
      await new Promise(r=>setTimeout(r,2500));
      if (!shouldHold) {
        const brand = await fetch(`http://127.0.0.1:${httpPort}/api/system/brand`, {signal:AbortSignal.timeout(2000)});
        if (!brand.ok) throw Error('BOOTSTRAP_BRAND_EXISTING_SCHEMA_REQUIRED');
      }
    } finally {
      if (command==='docker') { try { run('docker',['stop','--time','1',runtimeContainer]); } catch {} }
      child.kill('SIGTERM');
      if (child.exitCode === null) await new Promise(resolve => { const timer=setTimeout(()=>{child.kill('SIGKILL');resolve();},5000);child.once('exit',()=>{clearTimeout(timer);resolve();}); });
      fs.writeFileSync(path.join(evidenceDir,profile.name+'-private-runtime.log'),output,{mode:0o600});
    }
    let drained=false;
    for(let i=0;i<20;i++) {
      if(marker(drainStatement).trim()==='0'){drained=true;break;}
      await new Promise(resolve=>setTimeout(resolve,100));
    }
    if(!drained)throw Error('BOOTSTRAP_DATABASE_SESSION_DRAIN_TIMEOUT');
    marker(endStatement);
    let window;
    for(let i=0;i<20;i++) {
      try {window=sliceCapturedWindow(spawnSyncLogs(container,start),beginStatement,endStatement,controlApp);break;}
      catch {await new Promise(resolve=>setTimeout(resolve,100));}
    }
    if(!window)throw Error('BOOTSTRAP_SERVER_BOUNDARY_REQUIRED');
    const allSessions=window.filter(record=>!(record.app===controlApp&&record.sql.trim().replace(/;$/,'')===drainStatement));
    const after = fingerprint();
    if (allSessions.some(record=>record.database!==fixtureDatabase)) {state.currentProfile.foreignDatabaseStatementHashes=allSessions.filter(record=>record.database!==fixtureDatabase).map(record=>hash(record.sql));save();throw Error('BOOTSTRAP_UNEXPECTED_DATABASE_CONNECTION');}
    const statements = allSessions.map(record=>record.sql);
    const unmarkedSessions = allSessions.filter(record=>record.app!==app);
    if (unmarkedSessions.length) {state.currentProfile.unmarkedSessionStatementHashes=unmarkedSessions.map(record=>hash(record.sql));state.currentProfile.unmarkedSqlKinds=unmarkedSessions.map(record=>classifySql(record.sql));save();throw Error('BOOTSTRAP_UNMARKED_DATABASE_CONNECTION');}
    if (!statements.length) throw Error('BOOTSTRAP_SQL_CAPTURE_EMPTY');
    const counts = {};
    for (const statement of statements) {const kind=classifySql(statement);counts[kind]=(counts[kind]||0)+1;}
    state.currentProfile={...state.currentProfile,actualSqlCount:statements.length,sqlKinds:counts,statementHashes:statements.map(hash),before,after,allDatabaseSessionsCaptured:true};save();
    const networkEvents = fs.readFileSync(network,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse);
    const remoteAuth = networkEvents.filter(x=>x.kind==='CHANJET_AUTH_APP_TICKET_RESEND').length;
    if(networkEvents.some(x=>x.kind!=='CHANJET_AUTH_APP_TICKET_RESEND') || remoteAuth !== (profile.missingTicket?1:0)) throw Error('BOOTSTRAP_REMOTE_BOUNDARY');
    if(Object.keys(counts).some(k=>!['READ','SESSION'].includes(k))) throw Error('BOOTSTRAP_UNAUTHORIZED_SQL:'+JSON.stringify(counts));
    if(JSON.stringify(before)!==JSON.stringify(after)) throw Error('BOOTSTRAP_FINGERPRINT_CHANGED');
    results.push({profile:profile.name,productionMode:true,fullAppModule:true,readonlyRole:profile.readonly,actualSqlCount:statements.length,sqlKinds:counts,statementHashes:statements.map(hash),before,after,approvedAuthProtocolRequests:remoteAuth,remoteBusinessRequests:0,unauthorizedWrites:0,schemaMutations:0,businessMutations:0,sequenceMutations:0,expectedSchemaHold:!!(profile.missingSchema||profile.retiredConstraint),allDatabaseSessionsCaptured:true});
    state.profiles=results;state.currentProfile=null;save();
    if (profile.missingSchema) sql(fs.readFileSync('scripts/ci/api-bootstrap-schema-fixture.sql','utf8'));
    if (profile.retiredConstraint) sql('ALTER TABLE mon_device_realtime_snapshot DROP CONSTRAINT mon_device_realtime_snapshot_property_code_fkey;');
  }
  // Prove the detector catches rejected attempts, including a swallowed-error scenario.
  const canaryApp='boot_detector_negative';
  const beforeCanary=fingerprint();
  const sequence=sql("SELECT sequencename FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename LIMIT 1;").trim();
  const probes=["CREATE TABLE bootstrap_detector_forbidden(id int)", "UPDATE sys_settings SET value='fixture-forbidden'", `SELECT setval('public.${quote(sequence)}', 9000)`];
  const canaryStart=new Date().toISOString();
  let rejected=0;
  for(const probe of probes) {
    try { run('docker',['exec','-i','-e',`PGAPPNAME=${canaryApp}`,container,'psql','-X','-At','-v','ON_ERROR_STOP=1','-U','bootstrap_runtime_ro','-d',fixtureDatabase],{input:probe+';'}); }
    catch(e) {if(!/read-only|permission denied/.test(String(e.stderr)))throw Error('BOOTSTRAP_READONLY_CANARY_NOT_VALID');rejected++;}
  }
  const canaryEnd=new Date().toISOString();
  const detected=capturedStatements(spawnSyncLogs(container,canaryStart,canaryEnd),canaryApp).map(classifySql);
  if(rejected!==3||!['SCHEMA_MUTATION','BUSINESS_DATA_MUTATION','SEQUENCE_MUTATION'].every(kind=>detected.includes(kind))||JSON.stringify(beforeCanary)!==JSON.stringify(fingerprint()))throw Error('BOOTSTRAP_WRITE_DETECTOR_CANARY_FAILED');
  const detectorCanary={rejectedAttempts:rejected,detectedKinds:detected,actualMutations:0};
  const report={outcome:'PASS',detectorCanary,schema:'phoenix.api-bootstrap-mutation-evidence/v1',database:fixtureDatabase,profiles:results,productionMutation:false};
  fs.writeFileSync(path.join(evidenceDir,'summary.json'),JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify(report));
  return report;
  } catch(error) {
    const code=String(error.message).match(/^(?:BOOTSTRAP|CONFIG_HOLD)[A-Z0-9_=:]*/)?.[0]?.split(':')[0]||'BOOTSTRAP_FIXTURE_OPERATION_FAILED';
    if(state){state.outcome='FAIL';state.failureCode=code;save();}
    throw Error(code);
  }
}
function spawnSyncLogs(container,start,end) {
  // Server marker confirms log visibility; startup uses no client-clock cutoff.
  const output=end ? run('sh',['-c','exec docker logs --since "$1" --until "$2" "$3" 2>&1','bootstrap-log',start,end,container]) : run('sh',['-c','exec docker logs --since "$1" "$2" 2>&1','bootstrap-log',start,container]);
  return output;
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try { await verifyBootstrap(); } catch(e) { console.error(String(e.message));process.exitCode=1; }
}
