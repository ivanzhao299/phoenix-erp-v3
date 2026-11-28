// Synthetic queue-scale benchmark. Writes only to a dedicated local PG18 clone.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');
const ts = require('../../apps/api/node_modules/typescript');
require.extensions['.ts'] = (module, filename) => module._compile(
  ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2021,
      experimentalDecorators: true,
      emitDecoratorMetadata: true,
    },
  }).outputText,
  filename,
);

const { DataSource } = require('../../apps/api/node_modules/typeorm');
const { PackagingHistoryService } = require('../../apps/api/src/modules/bff/packaging-history.service.ts');
const { PackagingWorkQueueService } = require('../../apps/api/src/modules/bff/packaging-work-queue.service.ts');
const reportDir = path.resolve('artifacts/packaging-history-local');
const fixturePath = path.join(reportDir, 'work-queue-performance-fixture.json');
const targetUrl = new URL(process.env.PACKAGING_QUEUE_PERF_DATABASE_URL || '');
if (process.env.NODE_ENV !== 'test'
  || targetUrl.protocol !== 'postgresql:'
  || !['127.0.0.1', 'localhost'].includes(targetUrl.hostname)
  || targetUrl.port !== '55432'
  || targetUrl.username !== 'postgres'
  || targetUrl.password
  || targetUrl.pathname !== '/packaging_queue_perf'
  || targetUrl.search
  || targetUrl.hash) {
  throw new Error('EXPLICIT_LOCAL_PACKAGING_QUEUE_PERF_DATABASE_REQUIRED');
}

function percentile(samples, fraction) {
  const sorted = [...samples].sort((a, b) => a - b);
  return sorted[Math.ceil(fraction * sorted.length) - 1];
}

function sourceHashes() {
  return Object.fromEntries(['apps/api/src/modules/bff/packaging-work-queue.service.ts',
    'apps/api/src/modules/bff/packaging-history.service.ts',
    'apps/api/src/modules/sales-v2/services/initial-egg-inventory-route.ts'].map(file => [
    file,
    crypto.createHash('sha256').update(fs.readFileSync(path.resolve(file))).digest('hex'),
  ]));
}

async function seed(ds) {
  if (fs.existsSync(fixturePath)) {
    const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
    const [count] = await ds.query("SELECT count(*)::int n FROM pkg_handover_records WHERE code LIKE $1||'-PARTIAL-%'", [fixture.prefix]);
    if (count.n === 0) {
      await ds.query(`INSERT INTO pkg_handover_records(code,shift_id,packing_code,boxes_json,box_count,location,receiver,production_date)
        SELECT $1||'-PARTIAL-'||n,$2,$1||'-PACK-'||n,'["TEST-PARTIAL-BOX"]',1,$3,'TEST ONLY','2026-01-02'
        FROM generate_series(1,2000) n`,
      [fixture.prefix, fixture.shiftId, fixture.prefix+'-L']);
    }
    return fixture;
  }
  const guardDataSource = new Proxy(ds, {
    get(target, property) {
      if (property === 'options') return { ...target.options, database: 'packaging_history_test' };
      if (property === 'query') return async (sql, params) => {
        if (String(sql).includes('current_database()')) return [{ name: 'packaging_history_test' }];
        return target.query(sql, params);
      };
      return Reflect.get(target, property, target);
    },
  });
  const { packingHistoryFixture } = require('../../apps/api/src/modules/bff/packaging-history.fixture.ts');
  const fixture = await packingHistoryFixture(guardDataSource);
  const scale = 5000;
  await ds.query("UPDATE pkg_work_shifts SET status='OPEN' WHERE id=$1", [fixture.shiftId]);
  await ds.query(`INSERT INTO pkg_source_batches(batch_code,house_code,shift_id,production_date,received_qty,batch_status)
    SELECT $1||'-WAIT-'||n,$2,$3,'2026-01-02',50,'RECEIVED' FROM generate_series(1,$4::int) n`,
    [fixture.prefix, fixture.house, fixture.shiftId, scale]);
  await ds.query(`INSERT INTO pkg_source_batches(batch_code,house_code,shift_id,production_date,received_qty,batch_status)
    SELECT $1||'-GRADED-'||n,$2,$3,'2026-01-02',50,'RECEIVED' FROM generate_series(1,$4::int) n`,
    [fixture.prefix, fixture.house, fixture.shiftId, scale]);
  await ds.query(`INSERT INTO pkg_grading_records(code,shift_id,production_date,idempotency_key,payload_hash,outputs_json,total_output)
    SELECT $1||'-GRADE-'||n,$2,'2026-01-02',$1||'-GRADE-'||n,'PERF-TEST','{}',50
    FROM generate_series(1,$3::int) n`,
    [fixture.prefix, fixture.shiftId, scale]);
  await ds.query(`INSERT INTO pkg_grading_source_links(grading_id,source_batch_id,input_qty)
    SELECT g.id,s.id,50 FROM pkg_grading_records g
    JOIN pkg_source_batches s ON s.batch_code=replace(g.code,'-GRADE-','-GRADED-')
    WHERE g.code LIKE $1 AND g.shift_id=$2`,
    [fixture.prefix+'-GRADE-%', fixture.shiftId]);
  await ds.query(`INSERT INTO pkg_packing_records(code,shift_id,production_date,grading_codes_json,total_eggs,total_boxes)
    SELECT $1||'-PACK-'||n,$2,'2026-01-02',jsonb_build_array($1||'-GRADE-'||n),50,2
    FROM generate_series(1,$3::int) n`,
    [fixture.prefix, fixture.shiftId, scale]);
  await ds.query(`INSERT INTO pkg_handover_records(code,shift_id,packing_code,boxes_json,box_count,location,receiver,production_date)
    SELECT $1||'-PARTIAL-'||n,$2,$1||'-PACK-'||n,'["TEST-PARTIAL-BOX"]',1,$3,'TEST ONLY','2026-01-02'
    FROM generate_series(1,2000) n`,
    [fixture.prefix, fixture.shiftId, fixture.location]);
  await ds.query("UPDATE pkg_work_shifts SET status='CLOSED' WHERE id=$1", [fixture.shiftId]);
  await ds.query('ANALYZE');
  const result = {
    prefix: fixture.prefix,
    farm: fixture.farm,
    shiftId: String(fixture.shiftId),
    syntheticScale: scale,
  };
  fs.mkdirSync(reportDir, { recursive: true });
  fs.writeFileSync(fixturePath, JSON.stringify(result, null, 2));
  return result;
}

async function main() {
  const ds = new DataSource({ type: 'postgres', url: targetUrl.toString(), entities: [], logging: false });
  await ds.initialize();
  try {
    const [identity] = await ds.query('SELECT current_database() AS database, current_setting(\'server_version_num\')::int AS version');
    if (identity.database !== 'packaging_queue_perf' || identity.version < 180000) throw new Error('ISOLATED_PG18_REQUIRED');
    const fixture = await seed(ds);
    const sourceBefore = sourceHashes();
    const actual = await ds.query(`SELECT
      (SELECT count(*)::int FROM pkg_source_batches WHERE batch_code LIKE $1||'-WAIT-%') AS waiting_sources,
      (SELECT count(*)::int FROM pkg_source_batches WHERE batch_code LIKE $1||'-GRADED-%') AS graded_sources,
      (SELECT count(*)::int FROM pkg_grading_records WHERE code LIKE $1||'-GRADE-%') AS gradings,
      (SELECT count(*)::int FROM pkg_packing_records WHERE code LIKE $1||'-PACK-%') AS packings,
      (SELECT count(*)::int FROM pkg_grading_source_links l JOIN pkg_grading_records g ON g.id=l.grading_id WHERE g.code LIKE $1||'-GRADE-%') AS source_links,
      (SELECT count(*)::int FROM pkg_handover_records WHERE code LIKE $1||'-PARTIAL-%') AS partial_handovers`,
    [fixture.prefix]);
    if (actual[0].waiting_sources !== fixture.syntheticScale
      || actual[0].graded_sources !== fixture.syntheticScale
      || actual[0].gradings !== fixture.syntheticScale
      || actual[0].packings !== fixture.syntheticScale
      || actual[0].source_links !== fixture.syntheticScale
      || actual[0].partial_handovers !== 2000) throw new Error('FIXTURE_MANIFEST_MISMATCH');
    const scope = {
      isGlobal: false,
      allowedCompanyCodes: [fixture.prefix+'-C'],
      allowedFarmCodes: [fixture.farm],
      allowedWarehouseCodes: [fixture.prefix+'-W'],
      alternatives: [{
        isGlobal: false,
        allowedCompanyCodes: [fixture.prefix+'-C'],
        allowedFarmCodes: [fixture.farm],
        allowedWarehouseCodes: [fixture.prefix+'-W'],
      }],
    };
    const userReq = { user: { userId: fixture.prefix+'-ACTOR', roles: ['PERF_TEST'], permissions: ['MENU_PKG_OP:V'], perms_version: 1 } };
    const history = new PackagingHistoryService(ds.manager, { resolve: async () => scope });
    const queue = new PackagingWorkQueueService(history);
    const tracked = [];
    const createQueryRunner = ds.createQueryRunner.bind(ds);
    ds.createQueryRunner = (...args) => {
      const runner = createQueryRunner(...args);
      const runQuery = runner.query.bind(runner);
      runner.query = async (sql, ...parameters) => {
        tracked.push(String(sql).slice(0,80));
        return runQuery(sql, ...parameters);
      };
      return runner;
    };
    const operations = [
      { name: 'carryover-first-25', bucket: 'CARRYOVER', pageSize: 25 },
      { name: 'carryover-next-25', bucket: 'CARRYOVER', pageSize: 25, next: true },
      { name: 'carryover-first-100', bucket: 'CARRYOVER', pageSize: 100 },
      { name: 'carryover-next-100', bucket: 'CARRYOVER', pageSize: 100, next: true },
      { name: 'current-first-25', bucket: 'CURRENT', pageSize: 25 },
      { name: 'current-next-25', bucket: 'CURRENT', pageSize: 25, next: true },
      { name: 'current-first-100', bucket: 'CURRENT', pageSize: 100 },
      { name: 'current-next-100', bucket: 'CURRENT', pageSize: 100, next: true },
      { name: 'review-first-25', bucket: 'REVIEW', pageSize: 25 },
      { name: 'review-next-25', bucket: 'REVIEW', pageSize: 25, next: true },
      { name: 'review-first-100', bucket: 'REVIEW', pageSize: 100 },
      { name: 'review-next-100', bucket: 'REVIEW', pageSize: 100, next: true },
    ];
    if (process.argv.includes('--plan')) {
      const planBucket = process.argv.includes('--plan-review') ? 'REVIEW' : 'CURRENT';
      await ds.query('UPDATE pkg_work_shifts SET status=$2 WHERE id=$1',
        [fixture.shiftId, planBucket === 'CURRENT' ? 'OPEN' : 'CLOSED']);
      let captured;
      const runQuery = ds.manager.query.bind(ds.manager);
      ds.manager.query = async (sql, parameters) => {
        if (/^WITH (?:visible|site_packings) AS/.test(String(sql))) captured = { sql, parameters };
        return runQuery(sql, parameters);
      };
      const planRequest = { bucket:planBucket, siteCode:fixture.farm, pageSize:'25' };
      if (planBucket === 'CURRENT') planRequest.shiftId = fixture.shiftId;
      await queue.list(planRequest, userReq);
      const plans = {};
      for (const enabled of [true, false]) {
        await ds.query('SET jit='+ (enabled ? 'on' : 'off'));
        plans[enabled ? 'jitOn' : 'jitOff'] = await ds.query(
          'EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) '+captured.sql, captured.parameters);
      }
      const planPath = path.join(reportDir, 'work-queue-plan-'+planBucket.toLowerCase()+'-'+Date.now()+'.json');
      fs.mkdirSync(reportDir, { recursive:true });
      fs.writeFileSync(planPath, JSON.stringify({
        identity,
        fixture,
        sourceBefore,
        sourceAfter:sourceHashes(),
        request:{...planRequest,pageSize:25},
        sql:captured.sql,
        parameters:captured.parameters,
        plans,
      }, null, 2));
      console.log('QUEUE_PLAN', planPath);
      return;
    }
    const measurements = {};
    for (const operation of operations) {
      await ds.query('UPDATE pkg_work_shifts SET status=$2 WHERE id=$1',
        [fixture.shiftId, operation.bucket === 'CURRENT' ? 'OPEN' : 'CLOSED']);
      const params = { bucket: operation.bucket, siteCode: fixture.farm, pageSize: String(operation.pageSize) };
      if (operation.bucket === 'CURRENT') params.shiftId = fixture.shiftId;
      if (operation.next) {
        const first = await queue.list(params, userReq);
        if (!first.nextCursor) throw new Error(operation.name+'_FIRST_PAGE_HAS_NO_CURSOR');
        params.cursor = first.nextCursor;
      }
      tracked.length = 0;
      const samples = [];
      const statementCounts = [];
      let count = 0;
      for (let i=0; i<25; i++) {
        tracked.length = 0;
        const start = performance.now();
        const response = await queue.list(params, userReq);
        samples.push(performance.now()-start);
        count = tracked.length;
        statementCounts.push(count);
        if (response.items.length !== operation.pageSize) throw new Error(operation.name+'_PAGE_SIZE_MISMATCH');
      }
      measurements[operation.name] = {
        samples: samples.length,
        sqlQueriesPerPage: count,
        firstMs: Number(samples[0].toFixed(2)),
        p95Ms: Number(percentile(samples.slice(1), .95).toFixed(2)),
        p99Ms: Number(percentile(samples.slice(1), .99).toFixed(2)),
        statementCountsPerRequest:[...new Set(statementCounts)],
      };
    }
    await ds.query("UPDATE pkg_work_shifts SET status='CLOSED' WHERE id=$1", [fixture.shiftId]);
    const reportStatementCounts = {};
    const reportDataStatementCounts = {};
    for (const [name,dateTo] of [['production-summary-1day','2026-01-02'],['production-summary-7day','2026-01-08']]) {
      const summarySamples = [];
      const summaryQueryCounts = [];
      const summaryDataQueryCounts = [];
      for (let i=0; i<25; i++) {
        tracked.length = 0;
        const start = performance.now();
        await history.summary({ dateFrom:'2026-01-02', dateTo, aggregation:'DAY' }, userReq);
        summarySamples.push(performance.now()-start);
        summaryQueryCounts.push(tracked.length);
        summaryDataQueryCounts.push(tracked.filter(statement => /^\s*(SELECT|WITH)\b/i.test(statement)).length);
      }
      reportStatementCounts[name] = [...new Set(summaryQueryCounts)];
      reportDataStatementCounts[name] = [...new Set(summaryDataQueryCounts)];
      measurements[name] = {
        samples: summarySamples.length,
        firstMs: Number(summarySamples[0].toFixed(2)),
        p95Ms: Number(percentile(summarySamples.slice(1), .95).toFixed(2)),
        p99Ms: Number(percentile(summarySamples.slice(1), .99).toFixed(2)),
      };
    }
    const maxP95ByPageSize = Object.fromEntries([25,100].map(pageSize => [
      pageSize,
      Math.max(...Object.entries(measurements)
        .filter(([name]) => name.endsWith('-'+pageSize) || name.includes('-next-'+pageSize))
        .map(([,result]) => result.p95Ms)),
    ]));
    const queueMeasurements = Object.entries(measurements).filter(([name]) => !name.startsWith('production-summary-'));
    const summaryOneDay = measurements['production-summary-1day'];
    const summarySevenDay = measurements['production-summary-7day'];
    const reportQueryCountStable = JSON.stringify(reportStatementCounts['production-summary-1day'])
      === JSON.stringify(reportStatementCounts['production-summary-7day'])
      && JSON.stringify(reportDataStatementCounts['production-summary-1day'])
      === JSON.stringify(reportDataStatementCounts['production-summary-7day']);
    const reportQueryCountExpected = ['production-summary-1day','production-summary-7day']
      .every(name => JSON.stringify(reportStatementCounts[name]) === '[7]');
    const passed = Object.values(measurements).every(x => x.p95Ms <= 1000)
      && queueMeasurements.every(([,x]) => x.statementCountsPerRequest.length === 1 && x.statementCountsPerRequest[0] === 1)
      && Boolean(summaryOneDay && summarySevenDay && reportQueryCountStable && reportQueryCountExpected);
    const sourceAfter = sourceHashes();
    const sourceUnchanged = JSON.stringify(sourceBefore) === JSON.stringify(sourceAfter);
    const result = {
      generatedAt: new Date().toISOString(),
      identity,
      fixture,
      sourceBefore,
      sourceAfter,
      sourceUnchanged,
      actual,
      workloadMix:{
        waitingSourceBatches:{count:actual[0].waiting_sources,quantityEach:50,unit:'eggs'},
        gradingSourceBatches:{count:actual[0].graded_sources,quantityEach:50,unit:'eggs'},
        gradingRecords:{count:actual[0].gradings,outputEach:50,unit:'eggs'},
        packingRecords:{count:actual[0].packings,quantityEach:50,boxesEach:2},
        partialHandoverRecords:actual[0].partial_handovers,
        pendingHandoverRecords:actual[0].packings-actual[0].partial_handovers,
      },
      environment: { node: process.version, cpu: os.cpus()[0]?.model, logicalCpus: os.cpus().length, concurrency: 1 },
      cacheNote: '25 sequential samples per page type, first sample reported separately, remaining 24 determine p95. Local PG and OS caches are warm, no cold-disk claim.',
      limits: { warmP95Ms: 1000, queueSqlQueriesPerPage: 1 },
      measurements,
      reportStatementCounts,
      reportDataStatementCounts,
      reportStatementCountNote: 'Expected total is 7 TypeORM statements including transaction/session control; SELECT/WITH data statement counts are reported separately.',
      reportQueryCountStable,
      maxP95ByPageSize,
      passed,
    };
    const output = path.join(reportDir, 'work-queue-performance-'+Date.now()+'.json');
    fs.writeFileSync(output, JSON.stringify(result, null, 2));
    console.log(JSON.stringify({ output, fixture: result.fixture, measurements, passed }, null, 2));
    if (!passed || !sourceUnchanged) process.exitCode = 1;
  } finally {
    await ds.destroy();
  }
}

main().catch(error => {
  console.error('QUEUE_PERFORMANCE_FAILED', error.code || error.name, error.message);
  process.exitCode = 1;
});
