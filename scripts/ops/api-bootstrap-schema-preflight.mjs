import { execFileSync } from 'node:child_process';

export function bootstrapSchemaRequirements(contract) {
  const tables = { ...contract.tables };
  for (const [table, columns] of Object.entries(contract.prePromotionTables || {})) {
    if (!Array.isArray(columns) || !columns.length) throw Error('CONFIG_HOLD=BOOTSTRAP_SCHEMA_CONTRACT');
    tables[table] = [...new Set([...(tables[table] || []), ...columns])];
  }
  return tables;
}

export function validateBootstrapSchemaContract(contract) {
  const name = /^[a-z][a-z0-9_]{0,62}$/;
  if (contract.version !== 1 || !contract.tables || !Object.keys(contract.tables).length
    || !contract.prePromotionTables || Array.isArray(contract.prePromotionTables) || !Object.keys(contract.prePromotionTables).length
    || !Array.isArray(contract.extensions) || !contract.extensions.length || contract.extensions.some(x=>!/^[a-z][a-z0-9-]{0,62}$/.test(x))
    || !Array.isArray(contract.absentConstraints) || contract.absentConstraints.some(x=>!name.test(x))) throw Error('CONFIG_HOLD=BOOTSTRAP_SCHEMA_CONTRACT');
  for (const [table, columns] of Object.entries(bootstrapSchemaRequirements(contract))) {
    if (!name.test(table) || !Array.isArray(columns) || !columns.length || columns.some(x=>!name.test(x))) throw Error('CONFIG_HOLD=BOOTSTRAP_SCHEMA_CONTRACT');
  }
}
export function bootstrapSchemaSql(contract) {
  validateBootstrapSchemaContract(contract);
  const array = values => `ARRAY[${values.map(x=>`'${x}'`).join(',')}]::text[]`;
  return `SELECT json_build_object(
    'columns', (SELECT COALESCE(json_agg(json_build_object('table',table_name,'column',column_name)), '[]'::json) FROM information_schema.columns WHERE table_schema='public' AND table_name=ANY(${array(Object.keys(bootstrapSchemaRequirements(contract)))})),
    'extensions', (SELECT COALESCE(json_agg(extname), '[]'::json) FROM pg_catalog.pg_extension WHERE extname=ANY(${array(contract.extensions)})),
    'retiredConstraints', (SELECT COALESCE(json_agg(c.conname), '[]'::json) FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='public' AND c.conname=ANY(${array(contract.absentConstraints)}))
  );`;
}
export function assertBootstrapSchemaEvidence(contract, evidence) {
  validateBootstrapSchemaContract(contract);
  if (!Array.isArray(evidence.columns) || !Array.isArray(evidence.extensions) || !Array.isArray(evidence.retiredConstraints)) throw Error('CONFIG_HOLD=BOOTSTRAP_SCHEMA_EVIDENCE');
  const missing = [];
  for (const [table, columns] of Object.entries(bootstrapSchemaRequirements(contract))) {
    for (const column of columns) if (!evidence.columns.some(x=>x.table===table&&x.column===column)) missing.push(`${table}.${column}`);
  }
  for (const name of contract.extensions) if (!evidence.extensions.includes(name)) missing.push(`pg_extension.${name}`);
  if (missing.length || evidence.retiredConstraints.length) {
    const error = Error('CONFIG_HOLD=BOOTSTRAP_SCHEMA_GAP');
    error.evidence = { missing, retiredConstraints: evidence.retiredConstraints };
    throw error;
  }
  return { status: 'PASS', tables: Object.keys(bootstrapSchemaRequirements(contract)).length, columns: evidence.columns.length, extensions: contract.extensions, retiredConstraints: [] };
}
export function readBootstrapSchemaEvidence(contract, run = execFileSync) {
  const output = run('docker', ['exec','-i','-e','PGOPTIONS=-c default_transaction_read_only=on','phoenix-v3-db','sh','-c','exec psql -X -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "${POSTGRES_DB:-$POSTGRES_USER}"'], {
    env: { PATH:'/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin', DOCKER_CONFIG:'/home/phoenix-codex-deploy/.docker', DOCKER_HOST:'unix:///var/run/docker.sock' },
    input: `BEGIN READ ONLY; SET LOCAL statement_timeout='15s'; SET LOCAL lock_timeout='3s'; ${bootstrapSchemaSql(contract)} ROLLBACK;`,
    encoding:'utf8', stdio:['pipe','pipe','pipe'],
  });
  const line = output.split('\n').find(x=>x.startsWith('{'));
  if (!line) throw Error('CONFIG_HOLD=BOOTSTRAP_SCHEMA_EVIDENCE');
  return JSON.parse(line);
}
