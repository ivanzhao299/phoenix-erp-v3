#!/usr/bin/env node

import { atomicWriteJson, appendJsonEvent } from './bug-runner-platform.mjs';

const argv = process.argv.slice(2).map((arg) => arg.replace(/^–+/, '--'));
const readArg = (name, fallback = '') => {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : fallback;
};

const wakeFile = readArg('--wake-file', '/tmp/phoenix-erp-bug-runner-wakeup.json');
const eventFile = readArg('--event-file', '/tmp/phoenix-erp-bug-runner-events.jsonl');
const event = {
  type: 'runner_wakeup_requested',
  reason: readArg('--reason', 'manual'),
  bug_no: readArg('--bug-no', null),
  requested_at: new Date().toISOString(),
  requested_by: process.env.USER || 'unknown',
};

atomicWriteJson(wakeFile, event);
appendJsonEvent(eventFile, event);
console.log(JSON.stringify({ decision: 'WAKEUP_RECORDED', wake_file: wakeFile, event }, null, 2));
