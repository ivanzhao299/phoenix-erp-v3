import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const policy = fs.readFileSync(path.join(root, 'full-reset-regenerable-runtime-policy.csv'), 'utf8').trim().split(/\r?\n/);
assert.equal(policy.length, 3, 'runtime policy must contain exactly two approved rows');
assert(policy[1].startsWith('sys_cron_heartbeat,'), 'heartbeat policy missing');
assert(policy[2].startsWith('sys_notifications,'), 'notification policy missing');
assert(policy[2].includes("notification_type='SYSTEM_ALERT'"), 'notification predicate must be exact');
assert(policy[2].includes("biz_type='SYS_ALERT'"), 'notification business predicate must be exact');
assert(!policy[2].includes('sys_notifications,,'), 'notification table may not be globally exempted');
const report = fs.readFileSync(path.join(root, 'docs/uat-data-governance/full-reset-r4-runtime-baseline-policy.md'), 'utf8');
assert(report.includes('ZERO_REQUIRED_BUSINESS_STATE'), 'zero-required class missing');
assert(report.includes('REGENERABLE_SYSTEM_RUNTIME'), 'regenerable class missing');
assert(report.includes('UNEXPECTED_RUNTIME_DRIFT_TABLES=0'), 'unexpected drift gate missing');
console.log('R4.1 runtime baseline policy checks passed');
