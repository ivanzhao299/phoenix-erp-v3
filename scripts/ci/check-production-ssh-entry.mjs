/** Parse the fixed production workflow; validate its actual SSH/SCP steps.
 * No network, credential reading, deploy action or environment approval. */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { load, JSON_SCHEMA } from 'js-yaml';
export const APPROVED_PRODUCTION_SSH = Object.freeze({ host: '47.236.122.224', port: '22', fingerprint: 'SHA256:Y4WEXMJ24a4r1KxOw0det4qcCFNxj65mZeIG9oQOJcI' });
const fail = reason => { throw new Error('PRODUCTION_SSH_ENTRY_HOLD=' + reason); };
const mapping = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function parseProductionSshEntries(text) {
  if (typeof text !== 'string' || Buffer.byteLength(text) > 512 * 1024) fail('WORKFLOW_REQUIRED');
  let document;
  try { document = load(text, { schema: JSON_SCHEMA, json: false, onWarning: () => fail('YAML_WARNING') }); }
  catch { fail('YAML_PARSE_UNVERIFIED'); }
  if (!mapping(document) || !mapping(document.jobs) || Object.hasOwn(document, '<<') || Object.hasOwn(document.jobs, '<<')) fail('JOBS_MAPPING_REQUIRED');
  const jobs = Object.entries(document.jobs), entries = [];let stepCount = 0;
  if (!jobs.length || jobs.length > 64) fail('JOB_INVENTORY_UNVERIFIED');
  for (const [name, job] of jobs) {
    if (!mapping(job) || Object.hasOwn(job, '<<') || !Array.isArray(job.steps)) fail('JOB_STEPS_REQUIRED');
    for (let index = 0; index < job.steps.length; index++) {
      if (++stepCount > 2048) fail('STEP_INVENTORY_UNVERIFIED');
      const step = job.steps[index];
      if (!mapping(step) || Object.hasOwn(step, '<<')) fail('STEP_MAPPING_REQUIRED');
      const action = step.uses;
      if (action === undefined) continue;
      if (typeof action !== 'string') fail('ACTION_REFERENCE_REQUIRED');
      if (!/^appleboy\/(?:ssh|scp)-action(?:@|$)/i.test(action)) continue;
      if (!['appleboy/ssh-action@v1', 'appleboy/scp-action@v1'].includes(action)) fail('ACTION_REF_NOT_APPROVED');
      const values = step.with;
      if (!mapping(values) || Object.hasOwn(values, '<<')) fail('WITH_MAPPING_REQUIRED');
      for (const [key, expected] of Object.entries(APPROVED_PRODUCTION_SSH)) if (String(values[key]) !== expected) fail(key.toUpperCase() + '_NOT_APPROVED');
      if (Object.keys(values).some(key => key.startsWith('proxy_'))) fail('PROXY_NOT_APPROVED');
      entries.push({ action, job: name, step: index + 1 });
    }
  }
  return entries;
}
export function validateProductionSshEntries(text) {
  const entries = parseProductionSshEntries(text);
  if (entries.length !== 3 || entries.filter(x => x.action === 'appleboy/scp-action@v1').length !== 1) fail('ENTRY_INVENTORY_CHANGED');
  return entries;
}
export function validateRestorationSshEntry(text) {
  const entries = parseProductionSshEntries(text);
  if (entries.length !== 1 || entries[0].action !== 'appleboy/ssh-action@v1' || entries[0].job !== 'restore') fail('RESTORATION_ENTRY_INVENTORY_CHANGED');
  return entries;
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const entries=validateProductionSshEntries(fs.readFileSync(new URL('../../.github/workflows/deploy.yml', import.meta.url),'utf8'));
    const restoration=validateRestorationSshEntry(fs.readFileSync(new URL('../../.github/workflows/chanjet-readonly-restoration.yml', import.meta.url),'utf8'));
    console.log('PRODUCTION_SSH_ENTRY=PASS deploy='+entries.length+' restoration='+restoration.length);
  }
  catch(error) { console.error(/^PRODUCTION_SSH_ENTRY_HOLD=[A-Z_]+$/.test(error.message)?error.message:'PRODUCTION_SSH_ENTRY_HOLD=VALIDATION_FAILED');process.exitCode=1; }
}
