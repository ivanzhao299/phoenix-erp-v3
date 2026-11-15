#!/usr/bin/env node
/**
 * Issue #549 inbound identity reconciliation.
 *
 * Default mode is read-only dry-run. Use --apply together with
 * ISSUE549_BACKFILL_CONFIRM=YES only after reviewing the dry-run report.
 * The script never changes product_code; it writes only the new canonical
 * identity columns introduced by AddWmsInboundItemIdentity1794800000000.
 */
import { Client } from 'pg';
import fs from 'node:fs/promises';
import process from 'node:process';

const args = new Set(process.argv.slice(2));
const apply = args.has('--apply');
const reportIndex = process.argv.indexOf('--report');
const reportPath = reportIndex >= 0 ? process.argv[reportIndex + 1] : null;
const limitIndex = process.argv.indexOf('--limit');
const parsedLimit = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : 0;
const limit = Number.isInteger(parsedLimit) && parsedLimit > 0 ? parsedLimit : 0;

if (apply && process.env.ISSUE549_BACKFILL_CONFIRM !== 'YES') {
  throw new Error('ISSUE549_BACKFILL_CONFIRM=YES is required for --apply');
}

const code = value => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
};

if (!dbConfig.user || !dbConfig.database) {
  throw new Error('DB_USER and DB_NAME are required');
}

const client = new Client(dbConfig);
const report = {
  version: 1,
  mode: apply ? 'apply' : 'dry-run',
  scanned: 0,
  resolved: 0,
  alreadyCanonical: 0,
  ambiguous: 0,
  inactive: 0,
  missing: 0,
  conflicts: 0,
  skipped: 0,
  rows: [],
};

function addRow(row, status, reason, identity = null) {
  report.rows.push({
    id: String(row.id),
    task_no: row.task_no,
    legacy_product_code: row.product_code,
    status,
    reason,
    identity,
  });
}

async function queryCandidates(client, legacyCode) {
  const materials = await client.query(
    `SELECT material_code, material_type, unit, status
       FROM mst_materials
      WHERE material_code = $1`,
    [legacyCode],
  );
  const skus = await client.query(
    `SELECT sku_code, product_code, base_unit, status
       FROM product_skus
      WHERE sku_code = $1`,
    [legacyCode],
  );
  return {
    materials: materials.rows,
    skus: skus.rows,
  };
}

function chooseIdentity(row, candidates) {
  const itemType = code(row.item_type)?.toUpperCase();
  const materialCode = code(row.material_code);
  const skuCode = code(row.sku_code);
  const legacyCode = code(materialCode || skuCode || row.product_code);

  if (itemType && !['MATERIAL', 'SKU'].includes(itemType)) {
    return { status: 'CONFLICT', reason: 'UNSUPPORTED_ITEM_TYPE' };
  }
  if (itemType === 'MATERIAL' && skuCode) {
    return { status: 'CONFLICT', reason: 'MATERIAL_HAS_SKU_CODE' };
  }
  if (itemType === 'SKU' && materialCode) {
    return { status: 'CONFLICT', reason: 'SKU_HAS_MATERIAL_CODE' };
  }
  if (!legacyCode) return { status: 'MISSING', reason: 'NO_LEGACY_CODE' };

  const activeMaterials = candidates.materials.filter(r => r.status === 'ACTIVE');
  const activeSkus = candidates.skus.filter(r => r.status === 'ACTIVE');
  const selectedAll = itemType === 'MATERIAL'
    ? candidates.materials
    : itemType === 'SKU' ? candidates.skus : [...candidates.materials, ...candidates.skus];
  const selectedActive = itemType === 'MATERIAL'
    ? activeMaterials
    : itemType === 'SKU' ? activeSkus : [...activeMaterials, ...activeSkus];

  if (selectedActive.length > 1 || selectedAll.length > 1) {
    return { status: 'AMBIGUOUS', reason: 'MULTIPLE_MASTER_MATCHES' };
  }
  if (selectedAll.length > 0 && selectedActive.length === 0) {
    return { status: 'INACTIVE', reason: 'MASTER_NOT_ACTIVE' };
  }
  if (selectedActive.length === 0) {
    return { status: 'MISSING', reason: 'MASTER_NOT_FOUND' };
  }

  if (itemType === 'MATERIAL' || (!itemType && activeMaterials.length === 1)) {
    const material = activeMaterials[0];
    return {
      status: 'RESOLVED',
      reason: 'ACTIVE_MATERIAL_MATCH',
      identity: {
        item_type: 'MATERIAL',
        material_code: material.material_code,
        sku_code: null,
        material_type: material.material_type || null,
        unit: material.unit || '件',
      },
    };
  }

  if (itemType === 'SKU' || (!itemType && activeSkus.length === 1)) {
    const sku = activeSkus[0];
    return {
      status: 'RESOLVED',
      reason: 'ACTIVE_SKU_MATCH',
      identity: {
        item_type: 'SKU',
        material_code: null,
        sku_code: sku.sku_code,
        material_type: 'FINISHED_PRODUCT',
        unit: sku.base_unit || '枚',
        product_code: sku.product_code || null,
      },
    };
  }

  return { status: 'AMBIGUOUS', reason: 'IDENTITY_NOT_UNIQUE' };
}

async function main() {
  await client.connect();
  try {
    await client.query('SET statement_timeout = \'30s\'');
    if (!apply) await client.query('SET default_transaction_read_only = on');

    const table = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
         WHERE table_schema = current_schema() AND table_name = 'wms_inbound_items'
      ) AS exists
    `);
    if (!table.rows[0]?.exists) throw new Error('wms_inbound_items does not exist; run the additive migration first');

    const where = `
      WHERE (item_type IS NULL OR item_type = ''
        OR (item_type = 'MATERIAL' AND material_code IS NULL)
        OR (item_type = 'SKU' AND sku_code IS NULL))
    `;
    const rows = await client.query(`
      SELECT id, task_no, product_code, item_type, material_code, sku_code,
             material_type, unit, identity_snapshot
        FROM wms_inbound_items
        ${where}
       ORDER BY id
       ${limit ? `LIMIT ${limit}` : ''}
    `);

    if (apply) await client.query('BEGIN');
    for (const row of rows.rows) {
      report.scanned += 1;
      const candidates = await queryCandidates(client, code(row.material_code || row.sku_code || row.product_code));
      const decision = chooseIdentity(row, candidates);
      if (decision.status === 'RESOLVED') {
        const identity = decision.identity;
        const snapshot = {
          version: 1,
          source: 'ISSUE549_LEGACY_BACKFILL',
          legacyProductCode: code(row.product_code),
          itemType: identity.item_type,
          materialCode: identity.material_code,
          skuCode: identity.sku_code,
          productCode: identity.product_code || null,
          materialType: identity.material_type,
          unit: identity.unit,
        };
        if (apply) {
          await client.query(
            `UPDATE wms_inbound_items
                SET item_type = $1,
                    material_code = $2,
                    sku_code = $3,
                    material_type = $4,
                    unit = $5,
                    identity_snapshot = $6::jsonb
              WHERE id = $7
                AND (item_type IS NULL OR item_type = ''
                  OR (item_type = 'MATERIAL' AND material_code IS NULL)
                  OR (item_type = 'SKU' AND sku_code IS NULL))`,
            [identity.item_type, identity.material_code, identity.sku_code,
              identity.material_type, identity.unit, JSON.stringify(snapshot), row.id],
          );
        }
        report.resolved += 1;
        addRow(row, 'RESOLVED', decision.reason, identity);
      } else if (decision.status === 'AMBIGUOUS') {
        report.ambiguous += 1;
        addRow(row, 'AMBIGUOUS', decision.reason);
      } else if (decision.status === 'INACTIVE') {
        report.inactive += 1;
        addRow(row, 'INACTIVE', decision.reason);
      } else if (decision.status === 'CONFLICT') {
        report.conflicts += 1;
        addRow(row, 'CONFLICT', decision.reason);
      } else {
        report.missing += 1;
        addRow(row, 'MISSING', decision.reason);
      }
    }
    if (apply) await client.query('COMMIT');
  } catch (error) {
    if (apply) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }

  report.skipped = report.ambiguous + report.inactive + report.missing + report.conflicts;
  const output = JSON.stringify(report, null, 2);
  if (reportPath) await fs.writeFile(reportPath, `${output}\n`, 'utf8');
  console.log(output);
}

main().catch(error => {
  console.error(`ISSUE549_BACKFILL_FAILED=${error instanceof Error ? error.message : 'UNKNOWN'}`);
  process.exitCode = 1;
});
