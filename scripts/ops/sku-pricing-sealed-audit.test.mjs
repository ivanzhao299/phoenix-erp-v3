import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { collectReadOnly, openSealed, sealSnapshot, validateDbEnv, validatePublicKey, readSnapshot, TARGET_COMPANIES } from './sku-pricing-sealed-audit.mjs';

function keys() { return crypto.generateKeyPairSync('rsa', { modulusLength: 3072 }); }
function pem(k) { return k.export({ type: 'spki', format: 'pem' }); }

 test('sealed payload keeps price and customer-like fields out of envelope and opens with correct key only', async () => {
  const { publicKey, privateKey } = keys();
  const snapshot = { priceItems: [{ unit_price: '123.45', floor_price: '99.00', product_code: 'P' }], priceBooks: [], skus: [], legacyPricebooks: [], schema: {}, scope: { companies: TARGET_COMPANIES } };
  const sealed = await sealSnapshot(snapshot, pem(publicKey));
  const text = JSON.stringify(sealed);
  assert.doesNotMatch(text, /123\.45|99\.00|customer|phone/i);
  assert.deepEqual(await openSealed(sealed, privateKey.export({ format: 'pem', type: 'pkcs8' })), snapshot);
  const wrong = keys().privateKey.export({ format: 'pem', type: 'pkcs8' });
  await assert.rejects(() => openSealed(sealed, wrong), /ERR_KEY_UNWRAP/);
  const tampered = { ...sealed, tag: Buffer.alloc(16).toString('base64') };
  await assert.rejects(() => openSealed(tampered, privateKey.export({ format: 'pem', type: 'pkcs8' })), /ERR_AUTH_TAG/);
  const ciphertext = Buffer.from(sealed.ciphertext, 'base64'); ciphertext[0] ^= 1;
  await assert.rejects(() => openSealed({ ...sealed, ciphertext: ciphertext.toString('base64') }, privateKey.export({ format: 'pem', type: 'pkcs8' })), /ERR_AUTH_TAG/);
  await assert.rejects(() => openSealed({ ...sealed, public_key_fingerprint: '0'.repeat(64) }, privateKey.export({ format: 'pem', type: 'pkcs8' })), /ERR_AUTH_TAG/);
  const fresh = await sealSnapshot(snapshot, pem(publicKey));
  assert.notEqual(fresh.nonce, sealed.nonce);
  assert.notEqual(fresh.wrapped_key, sealed.wrapped_key);
});

test('public key requires RSA 3072 or larger', () => {
  const small = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  assert.throws(() => validatePublicKey(pem(small.publicKey)), /ERR_RSA_KEY/);
  const valid = keys();
  const pub = pem(valid.publicKey);
  const priv = valid.privateKey.export({ format: 'pem', type: 'pkcs8' });
  for (const input of [priv, pub + priv, pub + pub, 'prefix' + pub, pub + 'suffix']) {
    assert.throws(() => validatePublicKey(input), /ERR_PUBLIC_KEY/);
  }
});

test('database URL is forbidden and DB defaults are explicit', () => {
  assert.throws(() => validateDbEnv({ DB_HOST: 'db', DB_USER: 'api', DB_NAME: 'erp', DATABASE_URL: 'postgres://secret' }), /ERR_DATABASE_URL_FORBIDDEN/);
  assert.throws(() => validateDbEnv({ DB_HOST: 'db', DB_USER: 'api', DB_NAME: 'erp' }), /ERR_DB_CONFIG/);
  assert.deepEqual(validateDbEnv({ DB_HOST: 'db', DB_PORT: '5433', DB_USER: 'api', DB_NAME: 'erp', DB_PASSWORD: 'fixture' }), { host: 'db', port: 5433, user: 'api', password: 'fixture', database: 'erp', options: '-c default_transaction_read_only=on -c statement_timeout=5000 -c lock_timeout=1000' });
});

test('collector starts a read-only repeatable transaction and restricts scope', async () => {
  const calls = [];
  const columns = {
    sal_price_books: ['id','price_book_no','company_code','status'],
    sal_price_items: ['id','price_book_id','product_code','status','unit_price'],
    product_skus: ['sku_code','product_code','status'],
  };
  const client = { query: async (sql, params) => {
    calls.push({ sql, params });
    if (sql.startsWith('SELECT current_database()')) return { rows: [{ name: 'fixture', oid: '1', schema: 'public', serverVersion: '18', timezone: 'UTC', asOfUTC: '2026-01-01T00:00:00.000Z' }] };
    if (sql.startsWith('SELECT column_name')) return { rows: (columns[params[1]] || []).map(column_name => ({ column_name })) };
    return { rows: [] };
  }};
  await collectReadOnly(client);
  assert.match(calls[0].sql, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(calls[1].sql, /default_transaction_read_only/);
  assert.equal(calls.at(-1).sql, 'COMMIT');
  assert.ok(calls.every(c => !/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER|DROP)\b/i.test(c.sql)));
  assert.deepEqual(calls.find(c => c.params?.[0]?.length === 2)?.params[0], TARGET_COMPANIES);
  assert.deepEqual(TARGET_COMPANIES, ['COMP-LAO-AGRI', 'COMP-LAO-XINGCHI']);
  await assert.rejects(() => collectReadOnly(client, { companies: ['ALL'] }), /ERR_SCOPE/);
  await assert.rejects(() => collectReadOnly(client, { companies: ['COMP-LAO-AGRI', 'XINGCHI'] }), /ERR_SCOPE/);
  assert.ok(calls.some(call => /statement_timeout/.test(call.sql)));
  assert.ok(calls.some(call => /lock_timeout/.test(call.sql)));
});

test('readSnapshot only selects allowlisted columns and marks missing optional fields', async () => {
  const seen = [];
  const client = { query: async (sql, params) => {
    seen.push({ sql, params });
    if (sql.startsWith('SELECT column_name')) {
      const table = params[1];
      const avail = { sal_price_books: ['id','price_book_no','company_code','status'], sal_price_items: ['id','price_book_id','product_code','status','unit_price'], product_skus: [], ord_prices: [] };
      return { rows: (avail[table] || []).map(column_name => ({ column_name })) };
    }
    return { rows: [] };
  }};
  const out = await readSnapshot(client);
  assert.deepEqual(out.schema.missing.sal_price_items.includes('floor_price'), true);
  assert.equal(out.schema.fieldStatus.sal_price_items.floor_price, 'MISSING');
  assert.ok(seen.every(x => !/customer_name|remark|phone|password|SELECT\s+\*/i.test(x.sql)));
  assert.equal(out.scope.legacy, 'REVIEW_ONLY_NOT_AUTHORIZED');
  const financial = seen.filter(x => /FROM "public"\."sal_price_(?:books|items)"/.test(x.sql));
  assert.ok(financial.every(x => /company_code/.test(x.sql) && x.params?.length === 1));
  assert.ok(financial.some(x => x.params[0] === 'ALL'));
});

test('DB errors roll back and never repeat a driver message', async () => {
  const queries = [];
  const client = { query: async sql => {
    queries.push(sql);
    if (sql.startsWith('SELECT')) throw new Error('secret-fixture-error-amount');
    return { rows: [] };
  }};
  await assert.rejects(() => collectReadOnly(client), error => error.message === 'ERR_DB_QUERY');
  assert.equal(queries.at(-1), 'ROLLBACK');
});

test('CLI has no open or plaintext export mode', () => {
  for (const flag of ['--open', '--export', '--plaintext']) {
    const result = spawnSync(process.execPath, ['scripts/ops/sku-pricing-sealed-audit.mjs', flag], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, 'ERR_CLI_MODE\n');
  }
});

test('stdin source load is inert until the host appends the explicit API invocation', () => {
  const source = fs.readFileSync('scripts/ops/sku-pricing-sealed-audit.mjs', 'utf8');
  const result = spawnSync(process.execPath, ['--input-type=module'], { input: source, encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(result.stdout, '');
  assert.equal(result.stderr, '');
  assert.match(source, /createRequire\('\/app\/package\.json'\)\('pg'\)/);
  assert.match(source, /verifyContext\(root,/);
  assert.match(source, /before\.Id, 'node', '--input-type=module'/);
});

test('workflow transport keeps key stdin-only and redirects native SSH output straight to sealed artifact', () => {
  const source = fs.readFileSync('.github/workflows/sku-pricing-sealed-readonly.yml', 'utf8');
  assert.match(source, /ssh-add -/);
  assert.match(source, /SHA256:Y4WEXMJ24a4r1KxOw0det4qcCFNxj65mZeIG9oQOJcI/);
  assert.match(source, />sealed\.json/);
  assert.match(source, /path: sealed\.json/);
  assert.doesNotMatch(source, /uses: appleboy|capture_stdout:|docker cp|git checkout|migrations:run|ssh -i /);
  assert.match(source, /production-control-bootstrap\.sh/);
  assert.match(source, /git_safe show "\$TARGET_SHA:scripts\/ops\/\$helper"/);
});

test('PG18 owned loopback fixture validates actual projections, read-only behavior and fail-closed budgets', { skip: process.env.SKU_PRICING_PG_FIXTURE !== '1' }, async () => {
  const { createRequire } = await import('node:module');
  const { Client } = createRequire(new URL('../../apps/api/package.json', import.meta.url))('pg');
  // No URL, remote host, existing fixture database, or production credentials can be supplied.
  if (!process.env.SKU_PRICING_PG_PASSWORD) throw Error('PG_FIXTURE_PASSWORD_REQUIRED');
  const base = { host: '127.0.0.1', port: 54329, user: 'phoenix_v3', password: process.env.SKU_PRICING_PG_PASSWORD, connectionTimeoutMillis: 3000 };
  const ownedName = `sku_pricing_audit_fixture_${crypto.randomBytes(8).toString('hex')}`;
  const marker = `sku-pricing-sealed-owned:${crypto.randomUUID()}`;
  assert.match(ownedName, /^sku_pricing_audit_fixture_[a-f0-9]{16}$/);
  const admin = new Client({ ...base, database: 'postgres' });
  let setup; let ro; let created = false;
  try {
    await admin.connect();
    const version = Number((await admin.query("SELECT current_setting('server_version_num') AS version")).rows[0].version);
    assert.ok(version >= 180000 && version < 190000);
    await admin.query(`CREATE DATABASE "${ownedName}"`);
    created = true;
    await admin.query(`COMMENT ON DATABASE "${ownedName}" IS '${marker}'`);
    setup = new Client({ ...base, database: ownedName });
    await setup.connect();
    await setup.query(`CREATE TABLE fixture_owner (marker text NOT NULL);
      CREATE TABLE sal_price_books (id bigint PRIMARY KEY,price_book_no text,company_code text,status text,customer_code text,customer_name text,phone text,remark text,store_code text,channel_code text);
      CREATE TABLE sal_price_items (id bigint PRIMARY KEY,price_book_id bigint,product_code text,status text,unit_price numeric,floor_price numeric,quantity_snapshot jsonb,remark text);
      CREATE TABLE product_skus (sku_code text,product_code text,product_name text,sku_name text,grade_code text,spec_code text,status text);
      CREATE TABLE mst_products (product_code text,product_name text,product_name_zh text,variety_code text,unit text,unit_zh text,status text);
      CREATE TABLE product_grades (grade_code text,grade_name text,is_saleable boolean,is_storable boolean,status text);
      CREATE TABLE packaging_specs (spec_code text,spec_name text,qty_per_unit numeric,base_unit text,display_unit text,status text);`);
    await setup.query('INSERT INTO fixture_owner VALUES ($1)', [marker]);
    for (const [i, company] of ['COMP-LAO-AGRI','COMP-LAO-XINGCHI','XINGCHI','ALL','COMP-OTHER'].entries()) {
      await setup.query('INSERT INTO sal_price_books VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [i + 1, `PB${i}`, company, 'ACTIVE', 'SYNTH_CUSTOMER_CODE', 'SYNTH_CUSTOMER_NAME', 'SYNTH_PHONE', 'SYNTH_REMARK', 'STORE-CODE', 'CHANNEL-CODE']);
      await setup.query('INSERT INTO sal_price_items VALUES ($1,$2,$3,$4,$5,$6,$7,$8)', [i + 1, i + 1, 'PRODUCT1', 'ACTIVE', '82346.79', '71235.68', { version: 1, basis: 'PACKAGE', factor: 30, productCode: 'PRODUCT1', remark: 'SYNTH_JSON_REMARK', customerName: 'SYNTH_CUSTOMER_NAME' }, 'SYNTH_ITEM_REMARK']);
    }
    await setup.query("INSERT INTO product_skus VALUES ('SKU1','PRODUCT1','红粉蛋','红粉蛋30枚托','A','TRAY30','DISABLED'); INSERT INTO mst_products VALUES ('PRODUCT1','红粉蛋','红粉蛋中文','RED','枚','枚','ACTIVE'); INSERT INTO product_grades VALUES ('A','A级',true,true,'ACTIVE'); INSERT INTO packaging_specs VALUES ('TRAY30','30枚每托',30,'枚','托','ACTIVE')");
    ro = new Client({ ...base, ...validateDbEnv({ DB_HOST: base.host, DB_PORT: String(base.port), DB_USER: base.user, DB_PASSWORD: base.password, DB_NAME: ownedName }) });
    await ro.connect();
    assert.equal((await ro.query('SHOW default_transaction_read_only')).rows[0].default_transaction_read_only, 'on');
    assert.equal((await ro.query('SHOW statement_timeout')).rows[0].statement_timeout, '5s');
    assert.equal((await ro.query('SHOW lock_timeout')).rows[0].lock_timeout, '1s');
    await assert.rejects(() => ro.query('CREATE TABLE forbidden_write (id int)'), error => error.code === '25006');
    const snapshot = await collectReadOnly(ro);
    assert.deepEqual(snapshot.priceBooks.map(row => row.company_code).sort(), ['COMP-LAO-AGRI','COMP-LAO-XINGCHI']);
    assert.deepEqual(snapshot.legacyPricebooks.map(row => row.company_code), ['ALL']);
    assert.equal(snapshot.scope.legacy, 'REVIEW_ONLY_NOT_AUTHORIZED');
    assert.equal(snapshot.schema.fieldStatus.sal_price_items.ceiling_price, 'MISSING');
    assert.equal(snapshot.skus[0].sku_name, '红粉蛋30枚托');
    assert.equal(snapshot.masters.mst_products[0].variety_code, 'RED');
    assert.equal(snapshot.masters.product_grades[0].is_storable, true);
    assert.equal(snapshot.masters.packaging_specs[0].qty_per_unit, '30');
    assert.equal(snapshot.priceItems[0].unit_price, '82346.79');
    assert.equal(snapshot.priceItems[0].floor_price, '71235.68');
    assert.equal(snapshot.databaseProvenance.name, ownedName);
    assert.equal(snapshot.databaseProvenance.schema, 'public');
    assert.match(snapshot.databaseProvenance.oid, /^\d+$/);
    assert.match(snapshot.databaseProvenance.asOfUTC, /Z$/);
    assert.doesNotMatch(JSON.stringify(snapshot), /SYNTH_CUSTOMER_NAME|SYNTH_PHONE|SYNTH_REMARK|SYNTH_ITEM_REMARK|SYNTH_JSON_REMARK/);
    const pair = keys();
    const sealed = await sealSnapshot(snapshot, pem(pair.publicKey));
    assert.doesNotMatch(JSON.stringify(sealed), /82346\.79|71235\.68|SYNTH_CUSTOMER_CODE|红粉蛋|PRODUCT1/);
    assert.deepEqual(await openSealed(sealed, pair.privateKey.export({ type: 'pkcs8', format: 'pem' })), snapshot);
    await assert.rejects(() => collectReadOnly(ro, { companies: ['COMP-LAO-AGRI','XINGCHI'] }), /ERR_SCOPE/);
    assert.equal((await ro.query('SELECT 1 AS alive')).rows[0].alive, 1, 'rollback recovered connection');
    await setup.query("INSERT INTO sal_price_books SELECT n,'CAP-'||n,'COMP-LAO-AGRI','ACTIVE',NULL,NULL,NULL,NULL,NULL,NULL FROM generate_series(10,10011) n");
    await assert.rejects(() => collectReadOnly(ro), /ERR_RESULT_HARD_CAP/);
    assert.equal((await ro.query('SELECT 1 AS alive')).rows[0].alive, 1);
    await setup.query('DELETE FROM sal_price_books WHERE id>=10');
    await setup.query('UPDATE product_skus SET sku_name=repeat($1, $2)', ['x', 8388609]);
    await assert.rejects(() => collectReadOnly(ro), /ERR_RESULT_HARD_CAP/);
    assert.equal((await ro.query('SELECT 1 AS alive')).rows[0].alive, 1);
  } catch { throw Error('PG_FIXTURE_ASSERTION_FAILED'); }
  finally {
    if (ro) await ro.end().catch(() => {});
    if (setup) await setup.end().catch(() => {});
    try {
      if (created) {
        const proof = await admin.query("SELECT shobj_description(oid,'pg_database') AS marker FROM pg_database WHERE datname=$1", [ownedName]);
        if (proof.rows[0]?.marker !== marker || !/^sku_pricing_audit_fixture_[a-f0-9]{16}$/.test(ownedName)) throw Error('PG_FIXTURE_OWNER_MARKER_MISMATCH');
        await admin.query(`DROP DATABASE "${ownedName}"`);
      }
    } finally { await admin.end().catch(() => {}); }
  }
});
