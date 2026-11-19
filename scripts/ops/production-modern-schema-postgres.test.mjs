import assert from 'node:assert/strict';
import test from 'node:test';
import {
  matchesModernSchemaRehearsalVolume,
  modernSchemaPostgresProfile,
  nativePostgresToolMajor,
} from './production-modern-schema-postgres.mjs';

test('only demonstrated server majors have a fixed PostgreSQL filesystem layout', () => {
  assert.deepEqual(modernSchemaPostgresProfile(160014), {
    major: 16,
    volumeDestination: '/var/lib/postgresql/data',
    dataDirectory: '/var/lib/postgresql/data',
  });
  assert.deepEqual(modernSchemaPostgresProfile(180001), {
    major: 18,
    volumeDestination: '/var/lib/postgresql',
    dataDirectory: '/var/lib/postgresql/18/docker',
  });
  for (const value of [150007, 170002, 190000, '160014', 160014.2, null]) {
    assert.equal(modernSchemaPostgresProfile(value), null);
  }
});

test('native tool evidence cannot substitute another major, utility or multiline output', () => {
  assert.equal(nativePostgresToolMajor('pg_dump', 'pg_dump (PostgreSQL) 16.14\n'), 16);
  assert.equal(nativePostgresToolMajor('pg_restore', 'pg_restore (PostgreSQL) 18.1 (Debian 18.1-1)'), 18);
  assert.equal(nativePostgresToolMajor('pg_dump', 'pg_restore (PostgreSQL) 16.14'), null);
  assert.equal(nativePostgresToolMajor('pg_dump', 'pg_dump (PostgreSQL) 16.14\npg_restore (PostgreSQL) 16.14'), null);
  assert.equal(nativePostgresToolMajor('psql', 'psql (PostgreSQL) 16.14'), null);
});

test('owned rehearsal DB requires exactly one writable volume for its recorded major', () => {
  const owner = { volume: 'a'.repeat(64), databaseMajor: 16 };
  const mount = { Type: 'volume', Name: owner.volume, Destination: '/var/lib/postgresql/data', RW: true };
  const pg18 = { ...mount, Destination: '/var/lib/postgresql' };
  assert.equal(matchesModernSchemaRehearsalVolume([mount], owner), true);
  assert.equal(matchesModernSchemaRehearsalVolume([pg18], { ...owner, databaseMajor: 18 }), true);
  assert.equal(matchesModernSchemaRehearsalVolume([pg18], owner), false);
  assert.equal(matchesModernSchemaRehearsalVolume([pg18, mount], { ...owner, databaseMajor: 18 }), false);
  assert.equal(matchesModernSchemaRehearsalVolume([{ ...mount, RW: false }], owner), false);
  assert.equal(matchesModernSchemaRehearsalVolume([{ ...mount, Name: 'b'.repeat(64) }], owner), false);
  assert.equal(matchesModernSchemaRehearsalVolume([mount], { ...owner, databaseMajor: '16' }), false);
  assert.equal(matchesModernSchemaRehearsalVolume([mount], { ...owner, databaseMajor: 17 }), false);
});
