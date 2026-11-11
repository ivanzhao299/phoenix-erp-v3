import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { promisify } from 'node:util';

/** Read-only review evidence, not a quote resolver or SKU activation authority.
 * Schema references: PriceRuntimeService.resolvePrice, quantity-contract.resolveQuantity,
 * SkuPolicy.usableSql, and the product-master H2 schema. No writes or guessed prices.
 * --host runs trusted target bytes on stdin in the existing API. CLI never decrypts.
 */

export const VERSION = 'phoenix.sku-pricing-sealed/v1';
export const TARGET_COMPANIES = Object.freeze(['COMP-LAO-AGRI', 'COMP-LAO-XINGCHI']);
export const ROW_HARD_CAP = 10000;
export const BYTE_HARD_CAP = 8 * 1024 * 1024;
export const LEGACY_SCOPE = 'ALL';
const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const SAFE_COLUMNS = Object.freeze({
  sal_price_books: ['id', 'price_book_no', 'company_code', 'store_code', 'channel_code', 'customer_code', 'priority', 'publish_version', 'effective_from', 'effective_to', 'status', 'created_at', 'updated_at'],
  sal_price_items: ['id', 'price_book_id', 'product_code', 'grade_code', 'packaging_spec', 'unit_price', 'floor_price', 'ceiling_price', 'min_qty', 'max_qty', 'currency_code', 'status', 'sku_code', 'grade_code_std', 'spec_code', 'quantity_snapshot', 'created_at'],
  product_skus: ['sku_code', 'product_code', 'product_name', 'sku_name', 'grade_code', 'spec_code', 'status', 'variety_code', 'org_context_required', 'effective_date', 'expire_date'],
  mst_products: ['product_code', 'product_name', 'product_name_zh', 'variety_code', 'unit', 'unit_zh', 'status'],
  product_grades: ['grade_code', 'grade_name', 'is_saleable', 'is_storable', 'status'],
  packaging_specs: ['spec_code', 'spec_name', 'qty_per_unit', 'base_unit', 'display_unit', 'status'],
});
const FORBIDDEN = /(?:customer|remark|note|phone|mobile|email|password|secret|token|credential|amount|total|customer_name|customer_phone)/i;

export class AuditError extends Error {
  constructor(code) { super(code); this.code = code; this.name = 'AuditError'; }
}

function fail(code) { throw new AuditError(code); }
function assertSafeColumn(name) {
  if (!/^[a-z_][a-z0-9_]*$/.test(name) || (FORBIDDEN.test(name) && name !== 'customer_code')) fail('ERR_UNSAFE_COLUMN');
}
function quoted(name) { assertSafeColumn(name); return `"${name}"`; }

export function validatePublicKey(pem) {
  if (typeof pem !== 'string' || /PRIVATE KEY|RSA PUBLIC KEY/.test(pem)
    || (pem.match(/-----BEGIN PUBLIC KEY-----/g) || []).length !== 1
    || (pem.match(/-----END PUBLIC KEY-----/g) || []).length !== 1
    || !/^\s*-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----\s*$/.test(pem)) fail('ERR_PUBLIC_KEY');
  let key;
  try { key = crypto.createPublicKey(pem); } catch { fail('ERR_PUBLIC_KEY'); }
  if (key.asymmetricKeyType !== 'rsa' || (key.asymmetricKeyDetails?.modulusLength ?? 0) < 3072) fail('ERR_RSA_KEY');
  return key;
}

export function publicKeyFingerprint(pem) {
  const key = validatePublicKey(pem);
  return crypto.createHash('sha256').update(key.export({ type: 'spki', format: 'der' })).digest('hex');
}

export function validateDbEnv(env = process.env) {
  if (env.DATABASE_URL) fail('ERR_DATABASE_URL_FORBIDDEN');
  for (const key of ['DB_HOST', 'DB_PORT', 'DB_USER', 'DB_PASSWORD', 'DB_NAME']) if (!env[key]) fail('ERR_DB_CONFIG');
  if (!/^\d{1,5}$/.test(env.DB_PORT) || Number(env.DB_PORT) < 1 || Number(env.DB_PORT) > 65535) fail('ERR_DB_CONFIG');
  return { host: env.DB_HOST, port: Number(env.DB_PORT), user: env.DB_USER, password: env.DB_PASSWORD, database: env.DB_NAME, options: '-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000' };
}

export async function probeColumns(client, table) {
  if (!Object.hasOwn(SAFE_COLUMNS, table)) fail('ERR_TABLE');
  const rows = await client.query(
    'SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2',
    ['public', table],
  );
  const available = new Set(rows.rows.map(r => r.column_name));
  return SAFE_COLUMNS[table].filter(c => available.has(c));
}

function bounded(rows) {
  const bytes = Buffer.byteLength(JSON.stringify(rows), 'utf8');
  if (rows.length > ROW_HARD_CAP || bytes > BYTE_HARD_CAP) fail('ERR_RESULT_HARD_CAP');
  return rows;
}

async function boundedQuery(client, sql, params) {
  // Compute the row/byte budget in PostgreSQL before any financial row crosses
  // into the API process. A cap breach returns a HOLD marker, never truncation.
  const wrapped = `WITH audit_rows AS MATERIALIZED (${sql} LIMIT ${ROW_HARD_CAP + 1}),
    audit_budget AS (SELECT count(*)>${ROW_HARD_CAP} OR COALESCE(sum(octet_length(row_to_json(r)::text)),0)>${BYTE_HARD_CAP} AS hold FROM audit_rows r)
    SELECT false AS audit_hold, row_to_json(r) AS audit_row FROM audit_rows r WHERE NOT (SELECT hold FROM audit_budget)
    UNION ALL SELECT true AS audit_hold, NULL AS audit_row WHERE (SELECT hold FROM audit_budget)`;
  const result = await client.query(wrapped, params);
  if (result.rows.some(row => row.audit_hold)) fail('ERR_RESULT_HARD_CAP');
  return bounded(result.rows.map(row => row.audit_row));
}

function selectList(columns, alias) {
  return columns.map(c => {
    if (c === 'quantity_snapshot') {
      const keys = ['version','basis','productCode','gradeCode','skuCode','specCode','baseUnit','tradeUnit','factor','baseQty','packageFactor','priceFactor','priceUnit'];
      return `CASE WHEN ${alias}."quantity_snapshot" IS NULL THEN NULL ELSE jsonb_build_object(${keys.map(k => `'${k}', ${alias}."quantity_snapshot"::jsonb->'${k}'`).join(', ')}) END AS "quantity_snapshot"`;
    }
    // PostgreSQL JSON numbers otherwise lose numeric(18,2)/bigint precision in
    // JavaScript. Evidence retains these source values as exact decimal strings.
    const exact = ['id','price_book_id','unit_price','floor_price','ceiling_price','min_qty','max_qty','qty_per_unit'].includes(c) ? '::text' : '';
    return `${alias}.${quoted(c)}${exact} AS ${quoted(c)}`;
  }).join(', ');
}

export async function readSnapshot(client, { companies = TARGET_COMPANIES } = {}) {
  if (!Array.isArray(companies) || companies.length !== 2 || companies.some((c, i) => c !== TARGET_COMPANIES[i])) fail('ERR_SCOPE');
  let totalRows = 0;
  let totalBytes = 0;
  const query = async (sql, params) => {
    const rows = await boundedQuery(client, sql, params);
    totalRows += rows.length;
    totalBytes += Buffer.byteLength(JSON.stringify(rows), 'utf8');
    if (totalRows > ROW_HARD_CAP || totalBytes > BYTE_HARD_CAP) fail('ERR_RESULT_HARD_CAP');
    return rows;
  };
  const schema = {};
  for (const table of Object.keys(SAFE_COLUMNS)) schema[table] = await probeColumns(client, table);
  const missing = {};
  for (const table of Object.keys(SAFE_COLUMNS)) missing[table] = SAFE_COLUMNS[table].filter(c => !schema[table].includes(c));
  const fieldStatus = Object.fromEntries(Object.entries(SAFE_COLUMNS).map(([table, fields]) => [table, Object.fromEntries(fields.map(field => [field, schema[table].includes(field) ? 'PRESENT' : 'MISSING']))]));
  const result = { schema: { columns: schema, missing, fieldStatus }, scope: { companies, legacy: 'REVIEW_ONLY_NOT_AUTHORIZED' }, priceBooks: [], priceItems: [], skus: [], legacyPricebooks: [], masters: {} };

  const pbRequired = ['id', 'price_book_no', 'company_code', 'status'];
  const piRequired = ['id', 'price_book_id', 'product_code', 'status'];
  if (pbRequired.every(c => schema.sal_price_books.includes(c))) {
    const cols = schema.sal_price_books;
    const q = `SELECT ${selectList(cols, 'pb')} FROM "public"."sal_price_books" pb WHERE pb."company_code" = ANY($1::text[]) ORDER BY pb."company_code", pb."id"`;
    result.priceBooks = await query(q, [companies]);
    if (piRequired.every(c => schema.sal_price_items.includes(c))) {
      const icols = schema.sal_price_items;
      const iq = `SELECT ${selectList(icols, 'pi')} FROM "public"."sal_price_items" pi JOIN "public"."sal_price_books" pb ON pb."id"=pi."price_book_id" WHERE pb."company_code" = ANY($1::text[]) ORDER BY pb."company_code", pi."id"`;
      result.priceItems = await query(iq, [companies]);
    }
  }
  if (pbRequired.every(c => schema.sal_price_books.includes(c))) {
    result.legacyPricebooks = await query(`SELECT ${selectList(schema.sal_price_books, 'pb')} FROM "public"."sal_price_books" pb WHERE pb."company_code"=$1 ORDER BY pb."id"`, [LEGACY_SCOPE]);
    result.legacyReviewItems = [];
    if (piRequired.every(c => schema.sal_price_items.includes(c))) {
      result.legacyReviewItems = await query(`SELECT ${selectList(schema.sal_price_items, 'pi')} FROM "public"."sal_price_items" pi JOIN "public"."sal_price_books" pb ON pb."id"=pi."price_book_id" WHERE pb."company_code"=$1 ORDER BY pi."id"`, [LEGACY_SCOPE]);
    }
  }
  if (['sku_code', 'product_code', 'status'].every(c => schema.product_skus.includes(c))) {
    const cols = schema.product_skus;
    // Only candidate identities related to scoped pricebook products; includes disabled
    // new SKUs for review, never treats legacy ALL as company authorization.
    const products = [...new Set([...result.priceItems, ...(result.legacyReviewItems || [])].map(row => row.product_code).filter(value => typeof value === 'string'))];
    result.skus = await query(`SELECT ${selectList(cols, 's')} FROM "public"."product_skus" s WHERE s."product_code" = ANY($1::text[]) ORDER BY s."sku_code"`, [products]);
    for (const [table, code] of [['mst_products', 'product_code'], ['product_grades', 'grade_code'], ['packaging_specs', 'spec_code']]) {
      if (!schema[table].includes(code)) continue;
      const codes = [...new Set(result.skus.map(row => row[code]).filter(value => typeof value === 'string'))];
      result.masters[table] = await query(`SELECT ${selectList(schema[table], 'm')} FROM "public".${quoted(table)} m WHERE m.${quoted(code)}=ANY($1::text[]) ORDER BY m.${quoted(code)}`, [codes]);
    }
  }
  return result;
}

export async function collectReadOnly(client, options = {}) {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await client.query('SET LOCAL default_transaction_read_only = on');
    await client.query("SET LOCAL statement_timeout = '5s'");
    await client.query("SET LOCAL lock_timeout = '1s'");
    const provenance = (await client.query(`SELECT current_database() AS name,
      (SELECT oid::text FROM pg_database WHERE datname=current_database()) AS oid,
      current_schema() AS schema, current_setting('server_version') AS "serverVersion",
      current_setting('TimeZone') AS timezone,
      to_char(transaction_timestamp() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS "asOfUTC"`)).rows[0];
    if (!provenance) fail('ERR_DB_PROVENANCE');
    const snapshot = await readSnapshot(client, options);
    snapshot.databaseProvenance = provenance;
    if (Buffer.byteLength(JSON.stringify(snapshot), 'utf8') > BYTE_HARD_CAP) fail('ERR_RESULT_HARD_CAP');
    await client.query('COMMIT');
    return snapshot;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    if (error instanceof AuditError) throw error;
    fail('ERR_DB_QUERY');
  }
}

function canonicalJson(value) { return JSON.stringify(value); }

export async function sealSnapshot(snapshot, publicKeyPem, randomBytes = crypto.randomBytes) {
  const key = validatePublicKey(publicKeyPem);
  const json = canonicalJson(snapshot);
  if (Buffer.byteLength(json, 'utf8') > BYTE_HARD_CAP) fail('ERR_RESULT_HARD_CAP');
  const plaintext = await gzip(Buffer.from(json, 'utf8'));
  const contentKey = randomBytes(32);
  const nonce = randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', contentKey, nonce);
  cipher.setAAD(Buffer.from(`${VERSION}:${publicKeyFingerprint(publicKeyPem)}`));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const wrapped = crypto.publicEncrypt({ key, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, contentKey);
  contentKey.fill(0);
  plaintext.fill(0);
  return {
    version: VERSION,
    public_key_fingerprint: publicKeyFingerprint(publicKeyPem),
    nonce: nonce.toString('base64'),
    tag: tag.toString('base64'),
    wrapped_key: wrapped.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
  };
}

export async function openSealed(sealed, privateKeyPem) {
  if (!sealed || sealed.version !== VERSION) fail('ERR_SEALED_VERSION');
  let key;
  try { key = crypto.privateDecrypt({ key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: 'sha256' }, Buffer.from(sealed.wrapped_key, 'base64')); } catch { fail('ERR_KEY_UNWRAP'); }
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.nonce, 'base64'));
    decipher.setAAD(Buffer.from(`${VERSION}:${sealed.public_key_fingerprint}`));
    decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
    const compressed = Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, 'base64')), decipher.final()]);
    return JSON.parse((await gunzip(compressed)).toString('utf8'));
  } catch { fail('ERR_AUTH_TAG'); }
}

export function safeError(error) { return error instanceof AuditError && /^ERR_[A-Z0-9_]+$/.test(error.code) ? error.code : 'ERR_INTERNAL'; }

async function main(provenance = {}) {
  try {
    const publicKey = process.env.SEALED_AUDIT_PUBLIC_KEY || (process.env.SEALED_AUDIT_PUBLIC_KEY_B64 ? Buffer.from(process.env.SEALED_AUDIT_PUBLIC_KEY_B64, 'base64').toString('utf8') : undefined);
    validatePublicKey(publicKey);
    const db = validateDbEnv();
    const { createRequire } = await import('node:module');
    const { Client } = createRequire('/app/package.json')('pg');
    const client = new Client(db);
    client.on('error', () => { process.stderr.write('ERR_DB_CONNECTION\n'); process.exitCode = 1; });
    await client.connect();
    try {
      const snapshot = await collectReadOnly(client);
      snapshot.provenance = provenance;
      const sealed = await sealSnapshot(snapshot, publicKey);
      process.stdout.write(JSON.stringify(sealed) + '\n');
      process.stderr.write(`sealed_audit_ok price_books=${snapshot.priceBooks.length} price_items=${snapshot.priceItems.length} skus=${snapshot.skus.length} legacy_review=${snapshot.legacyPricebooks.length}\n`);
    } finally { await client.end(); }
  } catch (error) {
    process.stderr.write(`${safeError(error)}\n`);
    process.exitCode = 1;
  }
}

// Host driver shares this file to avoid adding a separate transport surface.
// Only encrypted container stdout is ever buffered by the host.
export async function runHost() {
  const { execFileSync } = await import('node:child_process');
  const { CONTRACT, verifyContext, git } = await import('./production-config-guard.mjs');
  const { executionEnv } = await import('./capture-production-runtime.mjs');
  const target = process.env.TARGET_SHA;
  const runId = process.env.AUDIT_RUN_ID;
  const publicKeyB64 = process.env.SEALED_AUDIT_PUBLIC_KEY_B64;
  if (!/^[a-f0-9]{40}$/.test(target || '') || !/^[0-9]+-[0-9]+$/.test(runId || '') || !/^[A-Za-z0-9+/]+={0,2}$/.test(publicKeyB64 || '')) fail('ERR_INPUT');
  validatePublicKey(Buffer.from(publicKeyB64, 'base64').toString('utf8'));
  const root = CONTRACT.repository;
  verifyContext(root, process.env.STATE_DIR || CONTRACT.stateDirectory);
  if (git(root, ['branch', '--show-current']) !== 'main' || git(root, ['status', '--porcelain', '--untracked-files=all'])) fail('ERR_CLEAN_MAIN');
  if (git(root, ['ls-remote', '--exit-code', 'origin', 'refs/heads/main']) !== `${target}\trefs/heads/main`) fail('ERR_REMOTE_MAIN');
  const execute = (args, options = {}) => execFileSync('docker', args, { encoding: 'utf8', env: executionEnv(), timeout: 120000, maxBuffer: 32 * 1024 * 1024, stdio: ['pipe', 'pipe', 'pipe'], ...options });
  const before = JSON.parse(execute(['inspect', 'phoenix-v3-api', '--format', '{"Id":{{json .Id}},"Image":{{json .Image}},"State":{{json .State}}}']));
  if (!/^[a-f0-9]{64}$/.test(before.Id || '') || !/^sha256:[a-f0-9]{64}$/.test(before.Image || '') || before.State?.Running !== true || before.State?.Health?.Status !== 'healthy') fail('ERR_API_IDENTITY');
  const source = git(root, ['show', `${target}:scripts/ops/sku-pricing-sealed-audit.mjs`]);
  const sealed = execute(['exec', '-i', '-e', 'SEALED_AUDIT_PUBLIC_KEY_B64', before.Id, 'node', '--input-type=module'], { env: { ...executionEnv(), SEALED_AUDIT_PUBLIC_KEY_B64: publicKeyB64 }, input: `${source}\nawait main(${JSON.stringify({ target_sha: target, run_id: runId, container_id: before.Id, image_id: before.Image })});\n` });
  const envelope = JSON.parse(sealed);
  if (Object.keys(envelope).sort().join(',') !== ['version','public_key_fingerprint','nonce','tag','wrapped_key','ciphertext'].sort().join(',')) fail('ERR_ENVELOPE');
  if (envelope.version !== VERSION || envelope.public_key_fingerprint !== publicKeyFingerprint(Buffer.from(publicKeyB64, 'base64').toString('utf8'))) fail('ERR_ENVELOPE');
  for (const name of ['nonce','tag','wrapped_key','ciphertext']) if (!/^[A-Za-z0-9+/]+={0,2}$/.test(envelope[name] || '')) fail('ERR_ENVELOPE');
  process.stdout.write(JSON.stringify(envelope) + '\n');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] === '--host') runHost().catch(() => { process.stderr.write('ERR_HOST_AUDIT\n'); process.exitCode = 1; });
  else if (process.argv.length > 2) { process.stderr.write('ERR_CLI_MODE\n'); process.exitCode = 1; }
  else main();
}
