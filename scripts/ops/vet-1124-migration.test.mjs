import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { baseline, reviewedHeadFile, readerRepairPaths, units, reviewedSource, reviewSnapshot, readAuditSnapshot, verifyAppliedLedger } from './vet-1124-migration.mjs';
import { candidateCi, evidenceArgs } from './vet-1124-ci.mjs';
import { fixedScopeFixture } from '../ci/modern-schema-release.fixture.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const repo = 'ivanzhao299/phoenix-erp-v3';
const target = 'b'.repeat(40);
const digest = 'sha256:' + '1'.repeat(64);
const image = component => 'ghcr.io/' + repo + '/' + component + '@' + digest;
function fixture() {
  const fixed = fixedScopeFixture();
  const originalAudit = JSON.stringify({ ...JSON.parse(fixed.originalAudit), legacy_daily_farm_in_rows:54,
    legacy_daily_farm_in_qty:1650405, retired_duplicate_batches:10, retired_duplicate_qty:0 });
  return { ...fixed, originalAudit, source: { target }, runtime: { api:{revision:baseline,imageId:digest}, web:{revision:baseline,imageId:digest} },
  checkout: baseline, pending: units.join(' '), ledgerSha256: '8'.repeat(64), ciSha256: '9'.repeat(64), apiImage: image('api') };
}

test('a real git merge admits exactly the three reviewed blobs and the entire sealed tree', t => {
  const dir = fs.mkdtempSync(path.join(root, '.vet-source-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const git = (...args) => execFileSync('git', ['-c','user.name=Fixture','-c','user.email=fixture@localhost',
    '-c','core.hooksPath=/dev/null', ...args], { cwd: dir, encoding: 'utf8' }).trim();
  const write = (p, value) => { fs.mkdirSync(path.dirname(path.join(dir, p)), { recursive: true }); fs.writeFileSync(path.join(dir,p), value); };
  const commit = message => { git('add', '.'); git('commit', '-qm', message); return git('rev-parse','HEAD'); };
  git('init','-q');
  write('base','runtime'); const base = commit('base');
  const files = units.map(u => 'apps/api/src/database/migrations/' + u + '.ts');
  readerRepairPaths.forEach(p => write(p, 'original reader'));
  files.forEach(p => write(p, 'reviewed ' + p)); write(reviewedHeadFile, 'PENDING\n');
  const reviewed = commit('reviewed');
  write(reviewedHeadFile, reviewed + '\n'); const sealed = commit('seal');
  const tree = git('rev-parse','HEAD^{tree}');
  const merge = (first, second, content = tree) => git('commit-tree', content, '-p', first, '-p', second, '-m', 'merge');
  const merged = merge(base, sealed);
  const accepted = reviewedSource(merged, dir, base);
  assert.equal(accepted.reviewed, reviewed);
  assert.deepEqual(accepted.migrations, files.map(p => ({ path:p, blob:git('rev-parse', reviewed + ':' + p) })));
  assert.throws(() => reviewedSource(merged, dir), /EXACT_MAIN_MERGE/);
  assert.throws(() => reviewedSource(merge(merged, sealed), dir, base), /EXACT_MAIN_MERGE/);
  assert.throws(() => reviewedSource(merge(base, sealed, git('rev-parse',reviewed+'^{tree}')), dir, base), /REVIEWED_TREE/);
  write(files[0], 'late edit'); git('add','.'); const badTree = git('write-tree');
  const alteredSeal = git('commit-tree', badTree,'-p',reviewed,'-m','changed migration while sealing');
  assert.throws(() => reviewedSource(merge(base, alteredSeal, badTree), dir, base), /REVIEWED_TREE/);
  // A genuinely reviewed but wider migration surface is also ineligible.
  write(reviewedHeadFile, 'PENDING\n'); write('apps/api/ddl/extra.sql','SELECT 1;'); const extra = commit('extra sql');
  write(reviewedHeadFile, extra + '\n'); const extraSeal = commit('seal extra');
  assert.throws(() => reviewedSource(merge(base, extraSeal, git('write-tree')), dir, base), /MIGRATION_SET/);
  git('switch','-qc','reader-repair',merged);
  for (const file of readerRepairPaths) write(file, file === reviewedHeadFile ? 'PENDING\n' : 'reviewed reader repair');
  const repair = commit('repair');
  write(reviewedHeadFile,repair+'\n'); const repairSeal = commit('seal reader');
  const repairedTree = git('write-tree');
  const repaired = merge(merged,repairSeal,repairedTree);
  const evidence = reviewedSource(repaired,dir,base,merged);
  assert.deepEqual(evidence.migrations,accepted.migrations);
  assert.equal(evidence.reviewed,repair);
  assert.throws(() => reviewedSource(repaired,dir,base),/EXACT_MAIN_MERGE/);
  write(files[0],'different DDL');git('add','.');
  assert.throws(() => reviewedSource(merge(merged,repairSeal,git('write-tree')),dir,base,merged),/READER_REPAIR_TREE/);

});

test('only hosted job logs opt in to reading control characters through a pipe', () => {
  const flag = '--allow-escape-sequences';
  assert.ok(evidenceArgs('actions/jobs/321/logs',true).includes(flag));
  for (const path of ['actions/runs/321/jobs','actions/jobs/321/logs?extra','actions/jobs/0/logs']) {
    assert.ok(!evidenceArgs(path,true).includes(flag));
  }
  assert.ok(!evidenceArgs('actions/jobs/321/logs',false).includes(flag));
});

test('only the fixed facts yield scoped GO; the raw audit and original directive stay independent', () => {
  const f = fixture();
  delete f.sourceDirectiveSha256;
  const original = f.originalAudit;
  const result = reviewSnapshot(f);
  assert.equal(f.originalAudit, original);
  assert.equal(result.originalConclusion, 'HOLD');
  assert.equal(result.scopedConclusion, 'GO_VET_1124_EXACT_CANDIDATE');
  assert.deepEqual(result.sourceRuns, ['45352175233','45351436581']);
  const drift = update => {
    const copy = structuredClone(f); update(copy); return reviewSnapshot(copy).inspectionSha256;
  };
  assert.equal(drift(c => {const a=JSON.parse(c.originalAudit);a.checked_at='later';c.originalAudit=JSON.stringify(a);}), result.inspectionSha256);
  for (const change of [c=>c.ledgerSha256='7'.repeat(64), c=>c.ciSha256='0'.repeat(64),
    c=>c.apiImage=c.apiImage.replaceAll('1','2'), c=>c.dailyRowsRaw=c.dailyRowsRaw.replace('"shift"', '"memo":"changed","shift"'),
    c=>c.source.target='c'.repeat(40)]) assert.notEqual(drift(change), result.inspectionSha256);
  for (const change of [c=>c.runtime.api.revision=target,c=>c.runtime.web.revision=target,c=>c.checkout=target,
    c=>c.pending='',c=>c.pending+=' extra',c=>c.pending=units[0],c=>c.apiImage='api:sha-'+target,
    c=>c.originalAudit=c.originalAudit.replace('"HOLD"','"GO"'),c=>c.originalAudit=c.originalAudit.replace('"id":413','"id":414'),
    c=>c.originalAudit=c.originalAudit.replace('"daily_duplicate_groups":0','"daily_duplicate_groups":1'),
    c=>c.originalAudit=c.originalAudit.replace('"retired_duplicate_qty":0','"retired_duplicate_qty":1'),
    c=>c.dailyRowsRaw=c.dailyRowsRaw.replace('"GRADE_0":540','"GRADE_0":540.00000000000001')]) assert.throws(() => drift(change));
});

test('run 45351436581 historical totals remain evidence and new stock or blocking discrepancies are refused', () => {
  const f = fixture();
  const audit = JSON.parse(f.originalAudit);
  const inspect = patch => reviewSnapshot({ ...f, originalAudit: JSON.stringify({ ...audit, ...patch }) });
  const reviewed = inspect({});
  assert.equal(reviewed.originalConclusion, 'HOLD');
  assert.equal(reviewed.scopedConclusion, 'GO_VET_1124_EXACT_CANDIDATE');
  for (const key of ['legacy_daily_farm_in_rows','legacy_daily_farm_in_qty','retired_duplicate_batches']) {
    assert.notEqual(inspect({[key]:audit[key]+1}).inspectionSha256, reviewed.inspectionSha256);
    assert.throws(() => inspect({[key]:undefined}), /HISTORY_EVIDENCE/);
  }
  for (const qty of [1,-1,null,undefined]) assert.throws(() => inspect({retired_duplicate_qty:qty}), /RETIRED_BATCH_STOCK/);
  for (const key of ['daily_duplicate_groups','daily_unknown_identity_rows','daily_mixed_summary_groups',
    'duplicate_source_groups','unbalanced_production_batches']) assert.throws(() => inspect({[key]:1}));
  const changed = structuredClone(audit.overposted_grades);
  changed[0].inbound_batches[0].qty_available--;
  assert.throws(() => inspect({overposted_grades:changed}));
});

test('after ledger has precisely the three new effective names and preserves historical rows', () => {
  const before = { legacy: [{ filename:'a' }], typeorm: [{timestamp:1,name:'Historic1'}] };
  const added = units.map(unit => { const [ts, name] = unit.split('-'); return {timestamp:Number(ts),name:name+ts}; });
  const after = {legacy:before.legacy,typeorm:[...before.typeorm,...added]};
  verifyAppliedLedger(before,after);
  for (const mutate of [a=>a.typeorm.pop(),a=>a.typeorm.push(added[0]),a=>a.typeorm[0].name='moved',
    a=>a.legacy=[],a=>a.typeorm[2].name='Wrong']) {
    const copy = structuredClone(after); mutate(copy); assert.throws(() => verifyAppliedLedger(before,copy), /AFTER_LEDGER_DELTA/);
  }
});

function ciRead(mutate = () => {}) {
  return endpoint => {
    const file = /^actions\/workflows\/([^/]+)/.exec(endpoint)?.[1];
    let result;
    if (file) {
      const run = { id:55, run_attempt:1, repository:{full_name:repo}, head_repository:{full_name:repo}, head_sha:target,
        event:'push', head_branch:'main', path:'.github/workflows/'+file, status:'completed', conclusion:'success' };
      result={total_count:1,workflow_runs:[run]};
    } else if (endpoint.includes('/attempts/1/jobs')) {
      const jobs = ['Type-check & Regression','Build & Push api','Build & Push web'].map((name,i) => ({
        name,id:100+i,run_id:55,head_sha:target,status:'completed',conclusion:'success',
        steps:[{name:'Build & push '+name.split(' ').at(-1)+' image',conclusion:'success'},
          {name:'Verify published API/Web OCI revision contract',conclusion:'success'}] }));
      result={total_count:jobs.length,jobs};
    } else if (/^actions\/jobs\/(101|102)\/logs$/.test(endpoint)) {
      result='2026-11-24T03:00:00Z   PUBLISHED_IMAGE: '+image(endpoint.includes('101')?'api':'web')+'\n';
    } else throw Error('unrecognized fixture endpoint');
    return typeof result === 'string' ? (mutate(endpoint,result) ?? result) : JSON.stringify(mutate(endpoint,result) ?? result);
  };
}

test('CI and digest come from successful push jobs on the exact merge, including real image steps', () => {
  assert.equal(candidateCi(target,ciRead()).images.api, image('api'));
  for (const change of [(e,r)=>{if(r.workflow_runs) r.workflow_runs[0].head_sha=baseline;},
    (e,r)=>{if(r.workflow_runs) r.workflow_runs[0].event='pull_request';},
    (e,r)=>{if(r.workflow_runs) r.workflow_runs[0].head_repository.full_name='foreign/fork';},
    (e,r)=>{if(e.includes('ci-build.yml')) r.workflow_runs[0].conclusion='failure';},
    (e,r)=>{if(r.jobs) r.jobs[1].steps[0].conclusion='skipped';},
    (e,r)=>{if(r.jobs) r.jobs[2].steps.pop();}, (e,r)=>{if(r.jobs) r.jobs[1].head_sha=baseline;},
    (e,r)=>{if(r.jobs) r.jobs.push(r.jobs[1]);}, (e,r)=>{if(typeof r==='string') return r+r;},
    (e,r)=>{if(typeof r==='string') return r.replace('@sha256:',':sha-');}]) {
    assert.throws(() => candidateCi(target,ciRead(change)), /CI_HOLD/);
  }
});

test('the actual post-DDL workflow invocation passes the timestamp and class to node', () => {
  const workflow = fs.readFileSync(path.join(root,'.github/workflows/controlled-pending-migration-apply.yml'),'utf8');
  const cmd = workflow.match(/APPLIED_JSON="\$LEDGER_JSON_LINE_AFTER" node -e '[\s\S]+?'[^\n]*?(?= \|\| PENDING_AFTER)/)?.[0];
  assert.ok(cmd);
  const env = { ...process.env, ts:'1795478400000', cls:'EggWithdrawalReview' };
  const run = typeorm => spawnSync('bash',['-c',cmd],{env:{...env,LEDGER_JSON_LINE_AFTER:JSON.stringify({typeorm})}}).status;
  assert.equal(run([{timestamp:env.ts,name:env.cls+env.ts}]),0);
  assert.equal(run([]),1);
});

test('owned PG18 clone returns raw HOLD and the two fixed rows in one read-only snapshot',
  { skip: process.env.VET_1124_SCOPE_PG !== '1' }, () => {
    const container = 'phoenix-temp-reversal-20261118';
    assert.equal(execFileSync('docker',['inspect',container,'--format','{{index .Config.Labels "phoenix.fixture"}}'],
      {encoding:'utf8'}).trim(), 'temp-reversal');
    const snapshot = readAuditSnapshot((cmd,args,options) => {
      const i = args.indexOf('phoenix-v3-db');
      assert.ok(i > 0);
      args.splice(i,1,'-e','POSTGRES_USER=postgres','-e','POSTGRES_DB=modern_schema_fixed_scope_20261119',container);
      return execFileSync(cmd,args,options);
    });
    assert.equal(JSON.parse(snapshot.originalAudit).database, 'modern_schema_fixed_scope_20261119');
    const scoped = reviewSnapshot({...fixture(),...snapshot});
    assert.equal(scoped.originalConclusion,'HOLD');
    assert.equal(scoped.scopedConclusion,'GO_VET_1124_EXACT_CANDIDATE');
  });

test('workflow inspect exits read-only and apply reaches backup only after the matching CAS and audit', () => {
  const workflow = fs.readFileSync(path.join(root,'.github/workflows/controlled-pending-migration-apply.yml'),'utf8');
  const start = workflow.indexOf('            if [ "$AUDIT_SCOPE" = vet-1124 ]; then\n              VET_INSPECTION_SHA256=');
  const end = workflow.indexOf('# BEGIN pending-migration backup:',start);
  assert.ok(start > 0 && end > start);
  const script = ['set -euo pipefail',
    'vet_inspection() { [ "$SNAPSHOT" != invalid ] || return 1; echo "$SNAPSHOT"; }',
    'run_audit() { echo HOLD; }',
    'docker() { case "$1" in image) echo "$TARGET_SHA";; login|pull) echo "docker:$1" >&2;; *) return 1;; esac; }',
    workflow.slice(start,end), 'echo REACHED_BACKUP; fi'].join('\n');
  const env = { ...process.env, PHASE:'apply', AUDIT_SCOPE:'vet-1124', SNAPSHOT:'inspection', EXPECTED_VET_INSPECTION_SHA256:'inspection',
    TARGET_SHA:target, LEDGER_SHA256:'ledger', EXPECTED_BEFORE_LEDGER_SHA256:'ledger', GHCR_LOGIN_USER:'fixture', GHCR_LOGIN_TOKEN:'fixture',
    VET_API_IMAGE:image('api'), MIGRATION_PATHS:'reviewed', PENDING_CLASSES:units.join(' ') };
  const run = fields => spawnSync('bash',['-c',script],{env:{...env,...fields},encoding:'utf8'});
  const inspect = run({PHASE:'inspect'});
  assert.equal(inspect.status,0); assert.match(inspect.stdout,/INSPECT=COMPLETE/);
  assert.doesNotMatch(inspect.stdout + inspect.stderr,/docker:|REACHED_BACKUP/);
  const apply = run({}); assert.equal(apply.status,0,apply.stderr); assert.match(apply.stdout,/REACHED_BACKUP/);
  for (const fields of [{AUDIT_SCOPE:'ordinary'},{SNAPSHOT:'invalid'},{SNAPSHOT:'drift'},
    {EXPECTED_VET_INSPECTION_SHA256:''},{EXPECTED_BEFORE_LEDGER_SHA256:'moved'}]) {
    const denied = run(fields); assert.notEqual(denied.status,0); assert.doesNotMatch(denied.stdout+denied.stderr,/docker:|REACHED_BACKUP/);
  }
});
