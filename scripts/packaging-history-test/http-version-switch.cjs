// Isolated API version switch for a committed synthetic record with temporary query grants.
// No repository environment files are loaded; server children bind loopback only.
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync, fork } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const apiDeps = path.join(root, 'apps/api/node_modules');

function serve() {
  const appRoot = path.resolve(process.argv[3]);
  const port = Number(process.argv[4]);
  const appDeps = require('node:fs').existsSync(path.join(appRoot, 'apps/api/node_modules'))
    ? path.join(appRoot, 'apps/api/node_modules') : apiDeps;
  const allowPort = 55432;
  for (const key of Object.keys(process.env)) if (!['PATH', 'LANG', 'LC_ALL', 'TZ', 'NODE_PATH', 'JWT_SECRET'].includes(key)) delete process.env[key];
  Object.assign(process.env, {
    NODE_ENV: 'test', DB_HOST: '127.0.0.1', DB_PORT: String(allowPort), DB_USER: 'postgres',
    DB_NAME: 'packaging_history_test', DB_PASSWORD: '', PORT: String(port), ENABLE_DEV_LOGIN: 'false',
  });
  const socketConnect = require('node:net').Socket.prototype.connect;
  require('node:net').Socket.prototype.connect = function (...args) {
    let address = args[0]; if (Array.isArray(address)) address = address[0];
    const host = typeof address === 'object' ? address.host : typeof args[1] === 'string' ? args[1] : 'localhost';
    const remotePort = typeof address === 'object' ? address.port : address;
    if (!['127.0.0.1', 'localhost', '::1'].includes(host || 'localhost') || ![allowPort, port].includes(Number(remotePort))) {
      throw Error('ISOLATED_TEST_OUTBOUND_BLOCKED');
    }
    return socketConnect.apply(this, args);
  };
  const ts = require(path.join(appDeps, 'typescript'));
  require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(require('node:fs').readFileSync(filename, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2021, experimentalDecorators: true,
      emitDecoratorMetadata: true, esModuleInterop: true },
  }).outputText, filename);
  require(path.join(appDeps, 'reflect-metadata'));
  (async () => {
    const { NestFactory } = require(path.join(appDeps, '@nestjs/core'));
    const config = require(path.join(appDeps, '@nestjs/config')).ConfigModule;
    const configRoot = config.forRoot; config.forRoot = function (options) { return configRoot.call(this, { ...options, ignoreEnvFile: true }); };
    const schedule = require(path.join(appDeps, '@nestjs/schedule')).ScheduleModule;
    const scheduleRoot = schedule.forRoot; schedule.forRoot = function (options) { return scheduleRoot.call(this, { ...options, cronJobs: false, intervals: false, timeouts: false }); };
    const { AppModule } = require(path.join(appRoot, 'apps/api/src/app.module.ts'));
    const { DataSource } = require(path.join(appDeps, 'typeorm'));
    const app = await NestFactory.create(AppModule, { logger: false, abortOnError: false });
    const ds = app.get(DataSource);
    const [identity] = await ds.query("SELECT current_database() db,current_setting('server_version_num') version");
    if (identity.db !== 'packaging_history_test' || Number(identity.version) < 180000) throw Error('ISOLATION_REQUIRED');
    await require(path.join(appRoot, 'apps/api/src/common/guards/menu-registry.service.ts')).hydrateMenuRegistry(ds.manager);
    const { PackagingWorkflowPolicy } = require(path.join(appRoot, 'apps/api/src/modules/bff/packaging-workflow-policy.ts'));
    const policy = app.get(PackagingWorkflowPolicy);
    policy.get = async (company, site) => {
      if (!String(company).startsWith('TEST-') || !String(site).startsWith('TEST-')) return {
        version: 'DRILL-NONTEST', R: false, B: false, P: false, V: false, H: false, Q: false,
        encodingVersion: 'TEST-NON-BUSINESS-v1', receiptMode: 'C',
      };
      const [row] = await ds.query("SELECT config_json FROM sys_dict WHERE dict_type='PKG_HISTORY_TEST_POLICY' AND dict_code=$1", [company + ':' + site]);
      return { version: row ? 'DRILL-CLOSED' : 'DRILL-OPEN', R: !row, B: !row, P: !row, V: !row, H: !row, Q: !row,
        encodingVersion: 'TEST-NON-BUSINESS-v1', receiptMode: 'C' };
    };
    await app.listen(port, '127.0.0.1');
    process.stdout.write(`API_READY ${port} ${identity.db} ${appRoot}\n`);
  })().catch(error => { process.stderr.write(`API_FAILED ${error.name} ${String(error.message).slice(0, 300)}\n`); process.exit(2); });
}

async function main() {
  const currentRoot = root;
  if (!process.argv[2]) throw Error('BASELINE_WORKTREE_REQUIRED');
  const baselineRoot = path.resolve(process.argv[2]);
  const baselineSha = execFileSync('git',['-C',baselineRoot,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
  if (baselineSha !== '562ac964b63db7fde176bd275a419ff6f6054754') throw Error('PACKAGING_BASELINE_REVISION_MISMATCH');
  const port = Number(process.argv[3] || 3111);
  const baselineFile = path.join(baselineRoot, 'apps/api/src/modules/bff/packaging-handover.service.ts');
  if (!require('node:fs').existsSync(baselineFile)) throw Error('BASELINE_WORKTREE_REQUIRED');
  const { DataSource } = require(path.join(apiDeps, 'typeorm'));
  const ds = new DataSource({ type: 'postgres', host: '127.0.0.1', port: 55432, username: 'postgres',
    database: 'packaging_history_test', entities: [], logging: false });
  await ds.initialize();
  try {
    const [identity] = await ds.query("SELECT current_database() db,current_setting('server_version_num') version");
    if (identity.db !== 'packaging_history_test' || Number(identity.version) < 180000) throw Error('ISOLATION_REQUIRED');
    const [record] = await ds.query(`SELECT p.id::text packing_id,p.code,p.shift_id::text,s.site_id,
        f.company_code,op.actor_id::text actor_id,op.idempotency_key,op.result_event_id::text result_event_id,
        label.normalized_code label_code,label.output_ordinal,receipt_group.group_data->>'batchNo' mapped_batch_no,
        receipt_group.group_data->>'ledgerId' mapped_ledger_id,wh.warehouse_code
      FROM pkg_packing_records p JOIN pkg_work_shifts s ON s.id=p.shift_id
      JOIN pkg_source_batches sb ON sb.shift_id=p.shift_id JOIN brd_houses h ON h.house_code=sb.house_code
      JOIN brd_farms f ON f.farm_code=h.farm_code
      JOIN pkg_handover_records hr ON hr.packing_code=p.code
      JOIN LATERAL (SELECT actor_id,idempotency_key,result_event_id FROM pkg_packing_operations WHERE packing_id=p.id AND action='CONFIRM' AND state='COMMITTED' LIMIT 1) op ON true
      JOIN pkg_packing_events event ON event.id=op.result_event_id AND event.event_type='COMMIT_RECEIPT'
      JOIN LATERAL jsonb_array_elements(event.payload->'groups') receipt_group(group_data)
        ON jsonb_typeof(receipt_group.group_data->'outputOrdinals')='array'
          AND jsonb_array_length(receipt_group.group_data->'outputOrdinals')>0
      JOIN LATERAL (SELECT c.normalized_code,b.output_ordinal
        FROM pkg_packing_code_claims c JOIN pkg_packing_boxes b ON b.id=c.box_id
        JOIN pkg_packing_code_registry r ON r.normalized_code=c.normalized_code AND r.state='BOUND' AND r.owner_box_id=c.box_id
        WHERE b.packing_id=p.id AND c.kind='CANONICAL' AND c.status='ACTIVE'
          AND b.output_ordinal=ANY(ARRAY(SELECT jsonb_array_elements_text(receipt_group.group_data->'outputOrdinals')::int))
        ORDER BY b.output_ordinal,b.box_ordinal LIMIT 1) label ON true
      JOIN inv_batches ib ON ib.batch_no=receipt_group.group_data->>'batchNo'
      JOIN wms_warehouses wh ON wh.warehouse_code=ib.warehouse_code
      WHERE p.code LIKE 'TEST-%' AND f.company_code LIKE 'TEST-%' AND s.site_id LIKE 'TEST-%'
        AND event.payload->>'originalShiftId'=p.shift_id::text
      ORDER BY event.server_at DESC LIMIT 1`);
    if (!record || !record.actor_id || !record.label_code || !record.mapped_batch_no || !record.mapped_ledger_id || !record.warehouse_code)
      throw Error('COMMITTED_TEST_RECEIPT_WITH_ACTIVE_MAPPED_BOX_REQUIRED');
    let [account] = await ds.query('SELECT username,real_name,perms_version FROM sys_user WHERE user_id=$1', [record.actor_id]);
    if (!account) throw Error('FIXTURE_ACTOR_REQUIRED');
    const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 10);
    const [role] = await ds.query(`INSERT INTO sys_role(role_code,role_name_zh,role_type) VALUES($1,$1,'BUSINESS') RETURNING role_id`, ['ROLLBACK-HTTP-' + suffix]);
    await ds.query('INSERT INTO sys_user_role(user_id,role_id,is_primary) VALUES($1,$2,false)', [record.actor_id, role.role_id]);
    await ds.query(`INSERT INTO sys_role_menu_permission(role_id,menu_id,perm_codes)
      SELECT $1,menu_id,'V,E' FROM sys_menu WHERE menu_code=ANY($2::text[])`, [role.role_id, ['MENU_PKG_OP', 'MENU_TRACEABILITY_VIEW']]);
    const [org] = await ds.query(`SELECT id FROM sys_organizations WHERE org_type='COMPANY' AND company_code=$1 LIMIT 1`, [record.company_code]);
    if (!org) throw Error('FIXTURE_COMPANY_ORG_REQUIRED');
    const hadOrgScope = (await ds.query('SELECT 1 FROM sys_user_orgs WHERE user_id=$1 AND org_id=$2', [record.actor_id, org.id])).length > 0;
    const hadFarmScope = (await ds.query('SELECT 1 FROM sys_user_farm_scopes WHERE user_id=$1 AND farm_code=$2', [record.actor_id, record.site_id])).length > 0;
    await ds.query('INSERT INTO sys_user_orgs(user_id,org_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [record.actor_id, org.id]);
    await ds.query('INSERT INTO sys_user_farm_scopes(user_id,farm_code) VALUES($1,$2) ON CONFLICT DO NOTHING', [record.actor_id, record.site_id]);
    const hadWarehouseScope = (await ds.query('SELECT 1 FROM sys_user_warehouse_scopes WHERE user_id=$1 AND warehouse_code=$2',
      [record.actor_id, record.warehouse_code])).length > 0;
    await ds.query('INSERT INTO sys_user_warehouse_scopes(user_id,warehouse_code) VALUES($1,$2) ON CONFLICT DO NOTHING',
      [record.actor_id, record.warehouse_code]);
    [account] = await ds.query('SELECT username,real_name,perms_version FROM sys_user WHERE user_id=$1', [record.actor_id]);
    const counts = async () => (await ds.query(`SELECT
      (SELECT count(*)::int FROM inv_batches WHERE packaging_batch_ref=$1) batches,
      (SELECT count(*)::int FROM inv_ledger WHERE ref_no=$1) ledger,
      (SELECT count(*)::int FROM pkg_handover_records WHERE packing_code=$1) receipts`, [record.code]))[0];
    const expectedCounts = await counts();
    const roleCode = 'ROLLBACK-HTTP-' + suffix;
    const jwtSecret = crypto.randomBytes(32).toString('hex');
    const jwt = require(path.join(apiDeps, 'jsonwebtoken'));
    const token = jwt.sign({ sub: String(record.actor_id), userId: String(record.actor_id), username: account.username,
      real_name: account.real_name, role: roleCode, roles: [roleCode],
      permissions: ['MENU_PKG_OP:V,E', 'MENU_TRACEABILITY_VIEW:V'],
      store_code: 'ALL', locale: 'zh-CN', perms_version: Number(account.perms_version || 1) }, jwtSecret, { expiresIn: '1h' });
    let child;
    const start = async appRoot => {
      child = fork(__filename, ['--serve', appRoot, String(port)], { env: {
        PATH: process.env.PATH || '', NODE_PATH: apiDeps, TZ: 'UTC', JWT_SECRET: jwtSecret,
      }, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
      let output = '';
      child.stdout.on('data', data => { output += data.toString(); });
      child.stderr.on('data', data => { output += data.toString(); });
      for (let i = 0; i < 120; i++) {
        if (output.includes('API_READY')) return;
        if (child.exitCode !== null) throw Error('API_START_FAILED ' + output.slice(-800));
        await new Promise(resolve => setTimeout(resolve, 500));
      }
      throw Error('API_START_TIMEOUT ' + output.slice(-800));
    };
    const stop = async () => {
      if (!child || child.exitCode !== null) return;
      child.kill('SIGTERM');
      await Promise.race([new Promise(resolve => child.once('exit', resolve)), new Promise(resolve => setTimeout(resolve, 10000))]);
      if (child.exitCode === null) child.kill('SIGKILL');
      child = null;
    };
    const detail = async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/packaging/terminal/history/${encodeURIComponent(record.code)}`,
        { headers: { Authorization: 'Bearer ' + token } });
      const body = await response.json();
      if (response.status !== 200) throw Error('DETAIL_HTTP_' + response.status + '_' + JSON.stringify(body).slice(0, 300));
      return body.data;
    };
    const operation = async () => {
      const url = new URL(`http://127.0.0.1:${port}/api/packaging/terminal/operations/${record.idempotency_key}`);
      url.searchParams.set('action', 'CONFIRM'); url.searchParams.set('packingCode', record.code);
      const response = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      const body = await response.json();
      if (response.status !== 200) throw Error('OPERATION_HTTP_' + response.status + '_' + JSON.stringify(body).slice(0, 300));
      return body.data;
    };
    const labelTrace = async () => {
      const response = await fetch(`http://127.0.0.1:${port}/api/traceability/label/${encodeURIComponent(record.label_code)}`,
        { headers: { Authorization: 'Bearer ' + token } });
      const body = await response.json();
      if (response.status !== 200) throw Error('LABEL_TRACE_HTTP_' + response.status + '_' + JSON.stringify(body).slice(0, 300));
      return body;
    };
    try {
      const [authoritative] = await ds.query(`SELECT e.id::text event_id,e.payload FROM pkg_packing_operations o
        JOIN pkg_packing_events e ON e.id=o.result_event_id WHERE o.idempotency_key=$1 AND o.actor_id=$2 AND o.packing_id=$3 AND o.action='CONFIRM'`,
      [record.idempotency_key, record.actor_id, record.packing_id]);
      if (!authoritative) throw Error('AUTHORITATIVE_COMMIT_EVENT_REQUIRED');
      await start(currentRoot);
      const candidateDetail = await detail();
      const candidateOperation = await operation();
      const candidateLabel = await labelTrace();
      if (candidateDetail.handover.state !== 'COMMITTED' || candidateOperation.eventId !== authoritative.event_id ||
          JSON.stringify(candidateOperation.result) !== JSON.stringify(authoritative.payload) || !candidateLabel.found ||
          candidateLabel.packaging?.packingCode !== record.code ||
          candidateLabel.packaging?.outputOrdinal !== Number(record.output_ordinal) ||
          candidateLabel.outputGroup?.batchNo !== record.mapped_batch_no ||
          candidateLabel.outputGroup?.ledgerId !== record.mapped_ledger_id ||
          candidateLabel.inventory?.batch?.batch_no !== record.mapped_batch_no ||
          candidateLabel.inventory?.ledger?.id !== record.mapped_ledger_id)
        throw Error('CANDIDATE_HTTP_EVIDENCE_MISMATCH');
      await stop();

      await ds.query(`INSERT INTO sys_dict(dict_type,dict_code,status,config_json)
        VALUES('PKG_HISTORY_TEST_POLICY',$1,'ACTIVE','{}'::jsonb)
        ON CONFLICT(dict_type,dict_code) DO UPDATE SET status='ACTIVE',config_json='{}'::jsonb`, [record.company_code + ':' + record.site_id]);
      await start(baselineRoot);
      const rollbackDetail = await detail();
      const rollbackOperation = await operation();
      const rollbackLabel = await labelTrace();
      if (rollbackDetail.handover.state !== 'COMMITTED' || rollbackOperation.eventId !== authoritative.event_id ||
          JSON.stringify(rollbackOperation.result) !== JSON.stringify(authoritative.payload) || rollbackDetail.policy?.H !== false ||
          rollbackLabel.outputGroup || rollbackLabel.inventory?.mappingPrecision === 'OUTPUT_GROUP')
        throw Error('BASELINE_ROLLBACK_EVIDENCE_MISMATCH');
      const finalCounts = await counts();
      if (JSON.stringify(finalCounts) !== JSON.stringify(expectedCounts)) throw Error('HTTP_READ_CHANGED_STOCK_COUNTS');
      process.stdout.write(JSON.stringify({ result: 'PASS', record: record.code, labelCode: record.label_code,
        candidateHttp: 'receipt, operation and label-to-output-group/batch/ledger matched authoritative evidence',
        rollbackHttp: 'baseline served original receipt and operation with policy gates closed; new group mapping was not asserted',
        countsBefore: expectedCounts, countsAfter: finalCounts }) + '\n');
    } finally {
      await stop();
      await ds.query("DELETE FROM sys_dict WHERE dict_type='PKG_HISTORY_TEST_POLICY' AND dict_code=$1", [record.company_code + ':' + record.site_id]);
      await ds.query('DELETE FROM sys_user_role WHERE user_id=$1 AND role_id=$2', [record.actor_id, role.role_id]);
      await ds.query('DELETE FROM sys_role_menu_permission WHERE role_id=$1', [role.role_id]);
      await ds.query('DELETE FROM sys_role WHERE role_id=$1', [role.role_id]);
      if (!hadOrgScope) await ds.query('DELETE FROM sys_user_orgs WHERE user_id=$1 AND org_id=$2', [record.actor_id, org.id]);
      if (!hadFarmScope) await ds.query('DELETE FROM sys_user_farm_scopes WHERE user_id=$1 AND farm_code=$2', [record.actor_id, record.site_id]);
      if (!hadWarehouseScope) await ds.query('DELETE FROM sys_user_warehouse_scopes WHERE user_id=$1 AND warehouse_code=$2', [record.actor_id, record.warehouse_code]);
    }
  } finally { await ds.destroy(); }
}

if (process.argv[2] === '--serve') serve();
else main().catch(error => { process.stderr.write(`HTTP_SWITCH_FAILED ${error.name} ${String(error.message).slice(0, 600)}\n`); process.exitCode = 1; });
