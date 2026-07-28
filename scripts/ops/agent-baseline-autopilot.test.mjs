import assert from 'node:assert/strict';
import test from 'node:test';
import { classifyMainAuthority } from './agent-baseline-autopilot.mjs';

test('baseline authority accepts aligned and one-way local-ahead histories', () => {
  assert.equal(classifyMainAuthority({
    localHead: 'same',
    remoteHead: 'same',
  }), 'aligned');
  assert.equal(classifyMainAuthority({
    localHead: 'local',
    remoteHead: 'remote',
    remoteIsAncestorOfLocal: true,
  }), 'local-ahead');
});

test('baseline authority fast-forwards only a one-way local-behind history', () => {
  assert.equal(classifyMainAuthority({
    localHead: 'local',
    remoteHead: 'remote',
    localIsAncestorOfRemote: true,
  }), 'local-behind');
});

test('baseline authority fails closed on diverged histories', () => {
  assert.equal(classifyMainAuthority({
    localHead: 'local',
    remoteHead: 'remote',
  }), 'diverged');
});
