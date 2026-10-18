import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { LEGACY_SHA, sourceBuiltLegacyIdentity, validateStoppedLegacy, planSyntheticSeedCleanup, identifyBlockedLegacyAuthStartup, legacyTransportPreload, normalizeRouteTable, cidrsOverlap, requirePrivateFixtureSubnet, validateNetworkSnapshot, verifyNetworkDelta, classifyOwnedNetworkDelta } from './maintenance-legacy-erp.fixture.mjs';

test('fixture transport guard actually throws before remote fetch/TCP implementations', async () => {
  const events = []; let transportCalls = 0;
  class Socket { connect() { transportCalls++; } }
  class Client { constructor() { this.connectionParameters = {}; } connect() {} }
  const dependencies = { fs: { appendFileSync: (_path, raw) => events.push(JSON.parse(raw)) }, net: { Socket }, pg: { Client } };
  const scope = { process: { env: { LEGACY_ERP_FIXTURE: 'unit-owned', DB_HOST: 'fixture-db', DB_NAME: 'api_bootstrap_fixture', ERP_CAPTURE_APP: 'unit-app' } },
    require: name => dependencies[name], URL, Error, JSON, Date, fetch: async () => { transportCalls++; } };
  scope.global = scope;
  vm.runInNewContext(legacyTransportPreload('unit-owned'), scope, { filename: 'legacy-preload-unit.cjs' });
  await assert.rejects(scope.fetch('https://unreachable-fixture.invalid'), /EXTERNAL_FETCH_FORBIDDEN/);
  assert.throws(() => new Socket().connect({ host: 'unreachable-fixture.invalid', port: 443 }), /EXTERNAL_TCP_FORBIDDEN/);
  assert.equal(transportCalls, 0); assert.equal(events.length, 2);
  assert.deepEqual(events.map(event => event.kind), ['FORBIDDEN_FETCH_ATTEMPT', 'FORBIDDEN_TCP_ATTEMPT']);
});

test('source-built old ERP is exact source and never production-image equivalence', () => {
  assert.equal(sourceBuiltLegacyIdentity(LEGACY_SHA, 'p', 'p', 'l', 'l').productionImageEquivalent, false);
  assert.throws(() => sourceBuiltLegacyIdentity('a'.repeat(40), 'p', 'p', 'l', 'l'));
  assert.throws(() => sourceBuiltLegacyIdentity(LEGACY_SHA, 'p', 'q', 'l', 'l'));
  assert.throws(() => sourceBuiltLegacyIdentity(LEGACY_SHA, 'p', 'p', 'l', 'm'));
});
test('only the precisely observed blocked auth startup request is identified, all requests remain HOLD', () => {
  const event = { kind: 'FORBIDDEN_FETCH_ATTEMPT', caller: 'CHANJET_AUTH_TRIGGER_APP_TICKET' };
  const warning = '启动自愈 triggerAppTicket 失败: LEGACY_FIXTURE_EXTERNAL_FETCH_FORBIDDEN';
  const known = identifyBlockedLegacyAuthStartup([event], warning);
  assert.equal(known.knownBlockedAuthStartupAttempts, 1); assert.equal(known.productionEligible, false); assert.equal(known.chanjetAuthRequests, 'HOLD');
  assert.equal(identifyBlockedLegacyAuthStartup([event], '').unidentifiedBlockedRequests, 1);
  assert.equal(identifyBlockedLegacyAuthStartup([event, event], warning).unidentifiedBlockedRequests, 2);
  assert.equal(identifyBlockedLegacyAuthStartup([{ ...event, caller: 'UNCLASSIFIED' }], warning).unidentifiedBlockedRequests, 1);
});
test('fixture resets never touch protected TRUNCATE guarded relations or accept their seeded rows', () => {
  assert.deepEqual(planSyntheticSeedCleanup([{ name: 'business', rows: 4 }, { name: 'audit', rows: 0 }], ['audit']),
    { truncateTables: ['business'], unchangedProtectedEmptyTables: ['audit'] });
  assert.throws(() => planSyntheticSeedCleanup([{ name: 'audit', rows: 1 }], ['audit']));
});
test('two stopped samples never turn legacy unknown effects into a drain PASS', () => {
  const before = { Id: 'a'.repeat(64), Image: `sha256:${'b'.repeat(64)}`, RestartCount: 0, State: { StartedAt: '2026-10-18T01:00:00Z', Running: true } };
  const stopped = { ...before, State: { ...before.State, Running: false, OOMKilled: false, ExitCode: 143 } };
  const result = validateStoppedLegacy(before, [stopped, stopped], 0);
  assert.equal(result.legacyDrainResult, 'UNSUPPORTED'); assert.equal(result.businessReconciliation, 'HOLD');
  assert.throws(() => validateStoppedLegacy(before, [stopped, { ...stopped, RestartCount: 1 }], 0));
  const dangling = validateStoppedLegacy(before, [stopped, stopped], 2);
  assert.equal(dangling.actualRemainingSessions, 2); assert.equal(dangling.noSessionProof, 'FAILED_NONZERO'); assert.equal(dangling.productionEligible, false);
  assert.throws(() => validateStoppedLegacy(before, [stopped, { ...stopped, State: { ...stopped.State, ExitCode: 137 } }], 0));
  const forced = { ...stopped, State: { ...stopped.State, ExitCode: 137 } };
  const observation = validateStoppedLegacy(before, [forced, forced], 0);
  assert.equal(observation.forcedAfterTimeout, true); assert.equal(observation.productionEligible, false);
  assert.equal(observation.legacyDrainResult, 'UNSUPPORTED'); assert.equal(observation.businessReconciliation, 'HOLD');
});

test('route tables normalize decimal strings without converting unknown values to zero', () => {
  assert.equal(normalizeRouteTable('2'), 2); assert.equal(normalizeRouteTable('254'), 254);
  assert.equal(normalizeRouteTable('main'), 'main'); assert.equal(normalizeRouteTable(), 'main');
  for (const value of ['unreviewed', null, '', -1, Infinity, '9007199254740993']) assert.throws(() => normalizeRouteTable(value));
});
test('CIDR allocation checks both families and only permits explicit RFC1918 /24 fixtures', () => {
  assert.equal(cidrsOverlap('10.203.0.0/24', '10.203.0.7/32'), true);
  assert.equal(cidrsOverlap('10.203.0.0/24', '10.204.0.0/16'), false);
  assert.equal(cidrsOverlap('fd00::/8', 'fd00:12::1/128'), true);
  assert.equal(cidrsOverlap('fd00::/8', 'fe80::/64'), false);
  assert.equal(cidrsOverlap('10.203.0.0/24', 'fd00::/8'), false);
  assert.equal(requirePrivateFixtureSubnet('10.203.0.0/24'), '10.203.0.0/24');
  for (const value of ['8.8.8.0/24','172.32.0.0/24','10.203.0.0/16','fd00::/24','invalid']) assert.throws(() => requirePrivateFixtureSubnet(value));
});
test('live daemon namespace and pre/post network drift are mandatory before database start', () => {
  const network = { id: 'a'.repeat(64), driver: 'bridge', internal: true, prefixes: ['172.31.0.0/24'], metadataDigest: 'fixed' };
  const route = { destination: '172.31.0.0/24', table: 'main', digest: 'existing' };
  const before = { networks: [network], routes: [route] }, id = 'b'.repeat(64), subnet = '10.203.0.0/24';
  assert.equal(validateNetworkSnapshot(before, subnet), true);
  assert.throws(() => validateNetworkSnapshot({ networks: [network], routes: [] }, subnet));
  assert.throws(() => validateNetworkSnapshot({ networks: [network], routes: [...before.routes, { destination: '10.0.0.0/8', table: 'main' }] }, subnet));
  const deviceDigest = 'c'.repeat(64);
  const after = { networks: [...before.networks, { id, driver: 'bridge', internal: true, enableIPv6: false, prefixes: [subnet], ipam: [{ subnet, gateway: '10.203.0.1' }] }],
    routes: [...before.routes, { family: 4, destination: subnet, type: 'unicast', table: 'main', digest: 'new', deviceDigest },
      { family: 4, destination: '10.203.0.1', type: 'local', table: 'local', digest: 'gateway', deviceDigest },
      { family: 4, destination: '10.203.0.255', type: 'broadcast', table: 'local', digest: 'broadcast', deviceDigest }] };
  assert.equal(verifyNetworkDelta(before, after, id, subnet), true);
  assert.throws(() => verifyNetworkDelta(before, { ...after, networks: [{ ...network, metadataDigest: 'changed' }, after.networks[1]] }, id, subnet));
  assert.throws(() => verifyNetworkDelta(before, { ...after, routes: [{ ...route, digest: 'changed' }, after.routes[1]] }, id, subnet));
  assert.throws(() => verifyNetworkDelta(before, { ...after, routes: [...after.routes, { destination: 'fd12::/64', table: 'main', digest: 'foreign' }] }, id, subnet));
});

test('same-device broad prefixes, IPv6, wrong tables/types and forged expected flags never escape drift checks', () => {
  const id = 'b'.repeat(64), subnet = '10.203.0.0/24', deviceDigest = 'c'.repeat(64);
  const before = { networks: [], routes: [] };
  const after = { networks: [{ id, driver: 'bridge', internal: true, enableIPv6: false, prefixes: [subnet], ipam: [{ subnet, gateway: '10.203.0.1' }] }], routes: [
    { family: 4, destination: subnet, type: 'unicast', table: 'main', digest: 'subnet', deviceDigest },
    { family: 4, destination: '10.203.0.1', type: 'local', table: 'local', digest: 'gateway', deviceDigest },
    { family: 4, destination: '10.203.0.255', type: 'broadcast', table: 'local', digest: 'broadcast', deviceDigest }] };
  assert.equal(verifyNetworkDelta(before, after, id, subnet), true);
  assert.equal(classifyOwnedNetworkDelta(before, after, id, subnet).routes.filter(route => route.expectedNewNetwork).length, 3);
  const corruptions = [{ destination: '10.0.0.0/8' }, { destination: 'fe80::/10', family: 6 }, { table: '2' }, { type: 'blackhole' }, { deviceDigest: 'd'.repeat(64) }];
  for (const patch of corruptions) {
    const next = structuredClone(after); Object.assign(next.routes[0], patch, { expectedNewNetwork: true });
    assert.throws(() => verifyNetworkDelta(before, next, id, subnet));
  }
  for (const patch of [{ destination: '10.0.0.0/8', family: 4 }, { destination: 'fe80::/10', family: 6 }]) {
    const next = structuredClone(after); next.routes.push({ ...after.routes[0], ...patch, digest: 'foreign', expectedNewNetwork: true });
    assert.throws(() => verifyNetworkDelta(before, next, id, subnet));
  }
  for (const index of [1,2]) for (const patch of [{ table: 'main' }, { type: 'unicast' }, { destination: '10.203.0.0/24' }]) {
    const next = structuredClone(after); Object.assign(next.routes[index], patch); assert.throws(() => verifyNetworkDelta(before, next, id, subnet));
  }
  const wrongGateway = structuredClone(after); wrongGateway.networks[0].ipam[0].gateway = '10.203.0.2';
  assert.throws(() => verifyNetworkDelta(before, wrongGateway, id, subnet));
  const ipv6 = structuredClone(after); ipv6.networks[0].enableIPv6 = true;
  assert.throws(() => verifyNetworkDelta(before, ipv6, id, subnet));
});
