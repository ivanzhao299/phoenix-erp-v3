// Inspect an already-loaded release image. Runs no API bootstrap or business action.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const [candidate, image] = process.argv.slice(2);
assert.match(candidate || '', /^[a-f0-9]{40}$/);
assert.match(image || '', /^sha256:[a-f0-9]{64}$/);
const root = fileURLToPath(new URL('../../', import.meta.url));
const docker = (...args) => execFileSync('docker', args, {encoding:'utf8', cwd:root}).trim();
const git = (...args) => execFileSync('git', args, {encoding:'utf8', cwd:root}).trim();
const revision = docker('image','inspect',image,'--format','{{.Id}} {{index .Config.Labels "org.opencontainers.image.revision"}}');
assert.equal(revision, image+' '+candidate);
const modules = git('diff','--name-only','6bb88544275dfef591cb96c0078f73e88496433b',candidate,'--','apps/api/src/database/migrations')
  .split('\n').filter(file => /^apps\/api\/src\/database\/migrations\/\d{13}-\w+\.ts$/.test(file))
  .map(file=>file.split('/').pop().slice(0,-3));
assert.deepEqual(modules, [
  '1795400100000-ProductionDocumentContinuations',
  '1795400200000-ProductionFinanceReview',
  '1795400300000-CutoverStateReceipts',
  '1795478400000-EggWithdrawalReview',
  '1795500000000-VetMaterialAllocation',
  '1795500100000-VetMaterialIdentity',
], 'expected reviewed post-20 extension set');
const code = `
const assert = require('node:assert/strict');
const fs = require('node:fs');
const {createHash} = require('node:crypto');
require('reflect-metadata');
const base = '/app/dist/';
const contract = require(base+'common/database/api-bootstrap-schema-contract.json');
const guard = require(base+'common/guards/menu.guard.js');
const registry = require(base+'common/guards/menu-registry.service.js');
const finance = require(base+'modules/sales-v2/controllers/production-finance-review.controller.js');
assert.equal(typeof registry.hydrateMenuRegistry,'function');
const policy = Reflect.getMetadata(guard.REQUIRE_MENU_KEY,finance.ProductionFinanceReviewController);
assert.ok([policy,...(policy.altPermissions||[])].some(rule=>rule.menu==='MENU_PROD_FIN_REVIEW' && rule.perm==='V'));
const hashes = {};
for (const stem of JSON.parse(process.argv[1])) {
  const file = base+'database/migrations/'+stem+'.js';
  const [stamp,name] = stem.split('-');
  assert.equal(typeof require(file)[name+stamp],'function');
  hashes[stem] = createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}
console.log(JSON.stringify({contract,hashes}));
`;
const result = JSON.parse(docker('run','--rm','--pull=never','--network','none','--read-only','--user','phoenix',
  '--entrypoint','node',image,'-e',code,JSON.stringify(modules)));
assert.deepEqual(result.contract,JSON.parse(git('show',candidate+':apps/api/src/common/database/api-bootstrap-schema-contract.json')));
console.log(JSON.stringify({candidate,image,bootstrapContract:true,financeReadPermission:'MENU_PROD_FIN_REVIEW:V',compiled:result.hashes}));
