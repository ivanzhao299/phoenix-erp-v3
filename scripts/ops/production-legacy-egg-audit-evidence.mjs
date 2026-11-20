/** Read-only evidence for the narrow legacy egg audit review. This module grants no release authority. */
import { createHash } from 'node:crypto';
import { auditSql } from './audit-daily-egg-inbound.mjs';
import { LEDGER_SQL } from './chanjet-admission-schema-receipt.mjs';
import { canonicalDigest, HASH, SHA } from './production-maintenance-receipts.mjs';

const originalBlockingCounters = [
  'daily_duplicate_groups', 'daily_unknown_identity_rows', 'daily_mixed_summary_groups',
  'duplicate_source_groups', 'unbalanced_production_batches',
];
const rawReferenceTables = [
  'sal_order_items', 'sal_order_item_batch_allocations', 'store_sale_allocations', 'wms_transfer_items',
  'pkg_source_batches', 'fin_ar_invoices', 'fin_ap_invoices', 'chanjet_voucher_drafts',
];
const softReferenceTables = new Set([
  ...rawReferenceTables,
  'inv_flock_source_links', 'wms_inbound', 'wms_inbound_items', 'wms_outbound', 'wms_outbound_items',
  'wms_transfer', 'wms_stocktake', 'wms_stocktake_items', 'wms_defect_dispositions', 'wms_stock_balance',
  'wms_stock_ledger', 'sal_return_items', 'sal_return_orders', 'sal_store_sale_items', 'pos_sale_items',
  'qa_inspections', 'qa_non_conformance', 'lbl_records', 'pkg_tasks', 'pkg_grading_source_links',
  'pkg_grading_records', 'pkg_packing_records', 'chanjet_writeback_outbox', 'fin_inv_cost_layers',
  'brd_vaccinations', 'brd_vaccination_issue_lines', 'brd_medication_records', 'brd_medication_issue_lines',
]);
const neverReferences = new Set(['inv_batches', 'inv_ledger', 'brd_daily_logs']);
const sha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');
const isToken = value => typeof value === 'string' && value === value.trim() && value.length > 0 && value.length <= 128;
const isQty = value => Number.isSafeInteger(value) && value > 0;
const quote = name => '"' + name.replaceAll('"','""') + '"';
const compare = (a,b) => a === b ? 0 : a < b ? -1 : 1;

export const LEGACY_EGG_TEST_MANIFEST = 'phoenix.legacy-egg-test-manifest/v1';
export const LEGACY_EGG_SCOPE_CLASSIFICATIONS = Object.freeze(['HISTORICAL_TEST','USER_CONFIRMED_TEST_OR_MISENTRY']);

function observedGroups(audit) {
  if (!Number.isSafeInteger(audit.overposted_grade_groups) || audit.overposted_grade_groups < 1
      || !Array.isArray(audit.overposted_grades) || audit.overposted_grades.length !== audit.overposted_grade_groups) {
    return null;
  }
  const observations = new Map();
  for (const group of audit.overposted_grades) {
    const { log_date: date, house_code: houseCode, grade: gradeCode, reported_qty: reported,
      inbound_qty: quantity, over_qty: over, inbound_batches: batches, inbound_ledger: ledger } = group;
    if (![date, houseCode, gradeCode].every(isToken) || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || reported !== 0 || !isQty(quantity) || over !== quantity
      || !Array.isArray(batches) || !batches.length || !Array.isArray(ledger) || ledger.length !== batches.length) {
      return null;
    }
    const key = JSON.stringify([date, houseCode, gradeCode]);
    if (observations.has(key)) return null;
    const identities = [];
    for (const batch of batches) {
      const { batch_no: batchNo, company_code: companyCode, warehouse_code: warehouseCode,
        product_code: productCode, sku_code: skuCode, source_no: sourceNo } = batch;
      const entries = ledger.filter(entry => entry.batch_no === batchNo);
      const entry = entries[0];
      if (![batchNo, companyCode, warehouseCode, productCode, skuCode, sourceNo].every(isToken)
        || companyCode === 'ALL' || !isQty(batch.qty) || batch.qty_available !== batch.qty
        || batch.source_type !== 'TEMP_PRODUCTION' || batch.material_code != null
        || batch.egg_date !== date || batch.collection_batch_ref !== 'HOUSE-' + houseCode
        || (batch.grade_code_std ?? batch.quality_grade) !== gradeCode
        || batch.packaging_batch_ref != null || String(batch.legacy_source ?? '').includes('DAILY_EGG_DUPLICATE_RETIRED')
        || entries.length !== 1 || !isQty(entry.id) || entry.change_type !== 'TEMP_PRODUCTION_INBOUND'
        || entry.qty_change !== batch.qty || entry.company_code !== companyCode || entry.ref_no !== sourceNo
        || (entry.sku_code != null && entry.sku_code !== skuCode)
        || (entry.warehouse_code != null && entry.warehouse_code !== warehouseCode)) return null;
      identities.push({ batchNo, companyCode, warehouseCode, productCode, skuCode, sourceNo,
        quantity: batch.qty, batchSha256: canonicalDigest(batch), ledgerSha256: canonicalDigest(entry) });
    }
    if (new Set(identities.map(b => b.batchNo)).size !== identities.length
        || identities.reduce((sum, batch) => sum + batch.quantity, 0) !== quantity) return null;
    observations.set(key, { date, houseCode, gradeCode, quantity,
      batches: identities.sort((a, b) => compare(a.batchNo,b.batchNo)) });
  }
  return [...observations.values()].sort((a,b) => compare(JSON.stringify(a),JSON.stringify(b)));
}

async function referencesFor(client, batches, localSchema) {
  const { rows: catalog } = await client.query(`SELECT n.nspname AS namespace,c.relname,c.relkind,
      array_agg(a.attname::text ORDER BY a.attname) FILTER(WHERE a.attnum>0 AND NOT a.attisdropped) AS columns
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      LEFT JOIN pg_attribute a ON a.attrelid=c.oid
    WHERE n.nspname<>'information_schema' AND n.nspname !~ '^pg_' AND c.relkind IN('r','p','f','m','v')
    GROUP BY n.nspname,c.relname,c.relkind ORDER BY n.nspname,c.relname`);
  const present = new Set(catalog.filter(row => row.namespace === localSchema && ['r','p'].includes(row.relkind)).map(row => row.relname));
  const missing = rawReferenceTables.filter(table => !present.has(table));
  const coverage = { inspected: [], missing, uninspectedSources: [], matches: [] };
  if (missing.length) return coverage;
  const numbers = batches.map(batch => batch.batchNo);
  const tokens = [...new Set(batches.flatMap(batch => [batch.batchNo, batch.sourceNo]))];
  const { rows: links } = await client.query(`SELECT n.nspname AS namespace,source.relname AS relation,
        array_agg(a.attname::text ORDER BY a.attname) AS columns
    FROM pg_constraint fk
    JOIN pg_class source ON source.oid=fk.conrelid JOIN pg_namespace n ON n.oid=source.relnamespace
    JOIN pg_attribute a ON a.attrelid=source.oid AND a.attnum=ANY(fk.conkey)
    WHERE fk.contype='f' AND fk.confrelid=to_regclass(format('%I.inv_batches',current_schema()))
    GROUP BY n.nspname,source.relname ORDER BY n.nspname,source.relname`);
  const fkTables = new Map(links.map(row => [JSON.stringify([row.namespace,row.relation]), row.columns]));
  const { rows: current } = await client.query('SELECT id::text, batch_no FROM inv_batches WHERE batch_no=ANY($1::text[]) ORDER BY batch_no', [numbers]);
  const ids = current.map(row => row.id);
  const inspections = [];
  for (const { namespace, relname: table, relkind, columns } of catalog) {
    if (namespace === localSchema && neverReferences.has(table) && table !== 'inv_batches') continue;
    const isRoot = namespace === localSchema && table === 'inv_batches';
    const foreignColumns = fkTables.get(JSON.stringify([namespace,table])) ?? [];
    const batchFields = (columns ?? []).filter(name => /batch_?(no|id|code|ref)($|_)/i.test(name)
      && (!isRoot || name !== 'batch_no'));
    const soft = softReferenceTables.has(table);
    if (!isRoot && !soft && !foreignColumns.length && !batchFields.length) continue;
    const label = namespace === localSchema ? table : namespace + '.' + table;
    // Do not execute foreign or view queries through a read-only evidence reader.
    if (relkind === 'v' || relkind === 'f') { coverage.uninspectedSources.push(label); continue; }
    const condition = [
      ...(soft ? [
        'EXISTS(SELECT 1 FROM unnest($1::text[]) token WHERE position(token IN to_jsonb(f)::text)>0)',
        `EXISTS(SELECT 1 FROM jsonb_path_query(to_jsonb(f),'lax $.** ? (@.type() == "object").keyvalue()') value
          WHERE value->>'key' ~* 'batch_?id$' AND value->>'value'=ANY($2::text[]))`,
      ] : []),
      ...batchFields.map(name => `f.${quote(name)}::text=ANY($1::text[])${/id$/i.test(name) ? ` OR f.${quote(name)}::text=ANY($2::text[])` : ''}`),
      ...foreignColumns.map(name => `f.${quote(name)}::text=ANY($1::text[]) OR f.${quote(name)}::text=ANY($2::text[])`),
      ...(isRoot ? [
        `(f.source_no=ANY($1::text[]) AND NOT EXISTS(SELECT 1 FROM inv_batches earlier WHERE earlier.batch_no=ANY($3::text[])
          AND earlier.source_no=f.source_no AND f.source_type='TEMP_PRODUCTION' AND earlier.company_code=f.company_code
          AND earlier.warehouse_code=f.warehouse_code AND earlier.egg_date=f.egg_date AND earlier.collection_batch_ref=f.collection_batch_ref))
          OR f.packaging_batch_ref=ANY($1::text[])`,
      ] : []),
    ];
    const recorded = isRoot ? 'inv_batches.descendants' : label;
    inspections.push({ recorded, sql: `SELECT ${inspections.length} AS ordinal, EXISTS(SELECT 1 FROM ${quote(namespace)}.${quote(table)} f
      WHERE ($1::text[] IS NOT NULL AND $2::text[] IS NOT NULL AND $3::text[] IS NOT NULL)
        AND (${condition.join(' OR ')}) ${isRoot ? 'AND NOT(f.batch_no=ANY($3::text[]))' : ''}) AS present` });
  }
  // Each branch still checks the same source and predicates. Bound the batch
  // so the native statement timeout continues to apply to small groups.
  const batchSize = 6;
  for (let first = 0; first < inspections.length; first += batchSize) {
    const group = inspections.slice(first, first + batchSize);
    const { rows } = await client.query(group.map(({sql}) => sql).join(' UNION ALL ') + ' ORDER BY ordinal', [tokens,ids,numbers]);
    if (rows.length !== group.length || rows.some((row, index) => row.ordinal !== first + index || typeof row.present !== 'boolean')) {
      throw new Error('LEGACY_EGG_AUDIT_REFERENCE_RESULT_REQUIRED');
    }
    for (const [index, {recorded}] of group.entries()) {
      coverage.inspected.push(recorded);
      if (rows[index].present) coverage.matches.push(recorded);
    }
  }
  return coverage;
}

/**
 * Use a newly leased connection to the reviewed database. Original SQL and reference checks share a read-only snapshot.
 * Keep the returned audit bytes with protected release evidence. Current field custody and trusted business approval
 * are independently verified by the release owner before any decision to migrate.
 */
export async function collectLegacyEggAuditEvidence(client, {
  targetSha, floorSha, runningApiSha, ledgerSha256, migrationEvidenceSha256, databaseIdentity, manifest = null,
}, {confirmScopeInSnapshot} = {}) {
  if (![targetSha,floorSha,runningApiSha].every(value => typeof value === 'string' && SHA.test(value))
    || ![ledgerSha256,migrationEvidenceSha256].every(value => typeof value === 'string' && HASH.test(value))) throw new Error('LEGACY_EGG_AUDIT_BINDING_REQUIRED');
  if (![databaseIdentity?.name,databaseIdentity?.schema].every(isToken)
    || !/^[1-9]\d{0,19}$/.test(databaseIdentity?.systemIdentifier ?? '')) throw new Error('LEGACY_EGG_AUDIT_DATABASE_IDENTITY_REQUIRED');
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await client.query("SET LOCAL statement_timeout='20s'");
    await client.query("SET LOCAL lock_timeout='3s'");
    await client.query('SET LOCAL row_security=off');
    const { rows: [observedDatabaseIdentity] } = await client.query(`SELECT current_database() AS name,current_schema() AS schema,
      system_identifier::text AS "systemIdentifier" FROM pg_control_system()`);
    if (canonicalDigest(observedDatabaseIdentity) !== canonicalDigest(databaseIdentity)) throw new Error('LEGACY_EGG_AUDIT_DATABASE_IDENTITY_MISMATCH');
    await client.query("SELECT set_config('search_path', format('%I,pg_catalog',$1::text),true)", [databaseIdentity.schema]);
    const { rows: [{ jsonb_build_object: originalLedger }] } = await client.query(LEDGER_SQL);
    const observedLedgerSha256 = sha256(JSON.stringify(JSON.parse(originalLedger)));
    const { rows: [{ jsonb_build_object: originalAudit }] } = await client.query(auditSql);
    // The caller can verify its frozen daily rows against the same actual
    // audit bytes while this native read-only snapshot is still open.
    if (confirmScopeInSnapshot) await confirmScopeInSnapshot(originalAudit);
    const audit = JSON.parse(originalAudit);
    const evidence = { schema: 'phoenix.legacy-egg-audit-evidence/v1',
      targetSha, floorSha, runningApiSha, ledgerSha256, observedLedgerSha256, migrationEvidenceSha256,
      databaseIdentity: observedDatabaseIdentity, capturedAt: audit.checked_at,
      originalAuditSha256: sha256(originalAudit),
      originalConclusion: audit.conclusion, disposition: 'HOLD', reason: null, groups: null, referenceCoverage: null,
      manifestSha256: null, verifiedTestScope: false, releaseAuthorized: false };
    const done = reason => {
      evidence.reason = reason;
      return { originalAudit, evidence: { ...evidence, evidenceSha256: canonicalDigest(evidence) } };
    };
    if (observedLedgerSha256 !== ledgerSha256) return done('MIGRATION_LEDGER_MOVED');
    if (audit.conclusion === 'GO' && originalBlockingCounters.every(name => audit[name] === 0) && audit.overposted_grade_groups === 0) {
      evidence.disposition = 'ORIGINAL_AUDIT_GO';
      return done(null);
    }
    if (audit.conclusion !== 'HOLD' || !originalBlockingCounters.every(name => audit[name] === 0)) {
      return done('ORIGINAL_STRUCTURAL_OR_LEDGER_HOLD');
    }
    const groups = observedGroups(audit);
    if (!groups?.length) return done('UNRESOLVED_OR_PARTIAL_OVERPOSTED_GROUP');
    evidence.groups = groups;
    const batches = groups.flatMap(group => group.batches.map(batch => ({ ...batch, houseCode: group.houseCode })));
    if (new Set(batches.map(b => b.batchNo)).size !== batches.length) return done('BATCH_IDENTITY_OVERLAP');
    for (const batch of batches) {
      const { rows: [identity] } = await client.query(`SELECT
        (SELECT count(*)::int FROM brd_houses house JOIN brd_farms farm ON farm.farm_code=house.farm_code
          WHERE house.house_code=$1 AND farm.company_code=$2) AS houses,
        (SELECT count(*)::int FROM wms_warehouses WHERE warehouse_code=$3 AND company_code=$2) AS warehouses,
        (SELECT count(*)::int FROM product_skus WHERE sku_code=$4 AND product_code=$5) AS skus`,
        [batch.houseCode,batch.companyCode,batch.warehouseCode,batch.skuCode,batch.productCode]);
      if (!identity || Object.values(identity).some(count => count !== 1)) return done('CUSTODY_IDENTITY_UNRESOLVED');
    }
    const references = await referencesFor(client,batches,databaseIdentity.schema);
    evidence.referenceCoverage = references;
    if (references.missing.length || references.matches.length || references.uninspectedSources.length) return done('LEGACY_BUSINESS_REFERENCES_UNRESOLVED');
    if (!manifest || manifest.schema !== LEGACY_EGG_TEST_MANIFEST || !LEGACY_EGG_SCOPE_CLASSIFICATIONS.includes(manifest.classification)
        || typeof manifest.businessEvidenceSha256 !== 'string' || !HASH.test(manifest.businessEvidenceSha256)
        || !Array.isArray(manifest.groups) || canonicalDigest(manifest.groups) !== canonicalDigest(groups)) {
      return done('MATCHING_FROZEN_TEST_MANIFEST_REQUIRED');
    }
    evidence.manifestSha256 = canonicalDigest(manifest);
    return done('MATCHED_CLAIM_PENDING_INDEPENDENT_REVIEW');
  } finally {
    await client.query('ROLLBACK');
  }
}

// Shared pure extraction for independent release evidence cross-checks.
export { observedGroups as observedLegacyEggGroups };
