const PG16 = Object.freeze({
  major: 16,
  volumeDestination: '/var/lib/postgresql/data',
  dataDirectory: '/var/lib/postgresql/data',
});
const PG18 = Object.freeze({
  major: 18,
  volumeDestination: '/var/lib/postgresql',
  dataDirectory: '/var/lib/postgresql/18/docker',
});

export function modernSchemaPostgresProfile(serverVersionNum) {
  if (!Number.isSafeInteger(serverVersionNum)) return null;
  const major = Math.trunc(serverVersionNum / 10000);
  return major === 16 ? PG16 : major === 18 ? PG18 : null;
}

export function nativePostgresToolMajor(tool, output) {
  if (!['pg_dump', 'pg_restore'].includes(tool) || typeof output !== 'string') return null;
  const match = /^(pg_dump|pg_restore) \(PostgreSQL\) (\d+)\.\d+(?:\.\d+)?(?:[ \t]+[^\r\n]+)?$/.exec(output.trim());
  return match?.[1] === tool ? Number(match[2]) : null;
}

export function matchesModernSchemaRehearsalVolume(mounts, record) {
  if (!Number.isInteger(record?.databaseMajor)) return false;
  const profile = modernSchemaPostgresProfile(record.databaseMajor * 10000);
  return !!profile && Array.isArray(mounts) && mounts.length === 1 && mounts[0]?.Type === 'volume' &&
    /^[a-f0-9]{64}$/.test(record.volume ?? '') && mounts[0].Name === record.volume &&
    mounts[0].Destination === profile.volumeDestination && mounts[0].RW === true;
}
