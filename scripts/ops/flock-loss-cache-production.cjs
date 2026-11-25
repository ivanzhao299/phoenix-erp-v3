'use strict';

const { createHash } = require('node:crypto');

const sha256 = value => createHash('sha256').update(value).digest('hex');
const codePattern = /^[A-Za-z0-9_./-]{1,80}$/;
const dayPattern = /^\d{4}-\d{2}-\d{2}$/;

function partitionInventory(rows) {
  const scopes = [];
  const scopeSizes = [];
  const holds = { missingCompany: 0, missingOccupancy: 0, unsupportedIdentity: 0, oversizedHouseDay: 0 };
  const companies = new Map();
  const months = new Map();
  let inventoryRows = 0;
  let plannedRows = 0;

  for (const row of rows) {
    const count = Number(row.report_count);
    const managed = Number(row.managed_count);
    if (!Number.isSafeInteger(count) || !Number.isSafeInteger(managed) || managed < 0 || managed > count || count < 1) {
      throw new Error('INVALID_INVENTORY_COUNTS');
    }
    inventoryRows += count;
    if (!row.company) {
      holds.missingCompany += count;
      continue;
    }
    if (!companies.has(row.company)) companies.set(row.company, { missingOccupancy: 0, unsupportedIdentity: 0, oversizedHouseDay: 0 });
    const companyHolds = companies.get(row.company);
    holds.missingOccupancy += count - managed;
    companyHolds.missingOccupancy += count - managed;
    if (!managed) continue;
    if (!codePattern.test(row.company) || !codePattern.test(row.house) || !dayPattern.test(row.day)) {
      holds.unsupportedIdentity += managed;
      companyHolds.unsupportedIdentity += managed;
      continue;
    }
    const key = row.company + ':' + row.day.slice(0, 7);
    if (!months.has(key)) months.set(key, { company: row.company, houses: new Map() });
    const houses = months.get(key).houses;
    if (!houses.has(row.house)) houses.set(row.house, []);
    houses.get(row.house).push({ day: row.day, managed });
  }

  const addScope = (company, houses, from, through, count) => {
    scopes.push({ company, houses, from, through });
    scopeSizes.push(count);
    plannedRows += count;
  };
  for (const { company, houses } of months.values()) {
    let shared = { houses: [], from: null, through: null, count: 0 };
    const addHouse = (house, series) => {
      const count = series.reduce((sum, row) => sum + row.managed, 0);
      if (count > 5000) {
        // A busy house uses disjoint day windows and is omitted from the shared group.
        let first = null;
        let last = null;
        let subtotal = 0;
        const flushWindow = () => {
          if (subtotal) addScope(company, [house], first, last, subtotal);
          first = null;
          subtotal = 0;
        };
        for (const row of series) {
          if (subtotal + row.managed > 5000) flushWindow();
          if (row.managed > 5000) {
            holds.oversizedHouseDay += row.managed;
            companies.get(company).oversizedHouseDay += row.managed;
            continue;
          }
          first ??= row.day;
          last = row.day;
          subtotal += row.managed;
        }
        flushWindow();
        return;
      }
      if (shared.houses.length === 100 || shared.count + count > 5000) {
        addScope(company, shared.houses, shared.from, shared.through, shared.count);
        shared = { houses: [], from: null, through: null, count: 0 };
      }
      shared.houses.push(house);
      const first = series[0].day;
      const last = series.at(-1).day;
      shared.from = shared.from && shared.from < first ? shared.from : first;
      shared.through = shared.through && shared.through > last ? shared.through : last;
      shared.count += count;
    };
    for (const house of [...houses.keys()].sort()) {
      addHouse(house, houses.get(house).sort((a, b) => a.day.localeCompare(b.day)));
    }
    if (shared.houses.length) addScope(company, shared.houses, shared.from, shared.through, shared.count);
  }
  const excluded = Object.values(holds).reduce((sum, count) => sum + count, 0);
  if (plannedRows + excluded !== inventoryRows) throw new Error('INVENTORY_RECONCILIATION_FAILED');
  return { scopes, scopeSizes, holds, inventoryRows, plannedRows, companyCount: companies.size, companyHolds: Object.fromEntries(companies) };
}

const inventorySql = `
  SELECT f.company_code AS company,d.house_code AS house,d.log_date::text AS day,
    count(*)::text AS report_count, count(d.occupancy_id)::text AS managed_count
  FROM brd_daily_logs d LEFT JOIN brd_houses h ON h.house_code=d.house_code
  LEFT JOIN brd_farms f ON f.farm_code=h.farm_code
  GROUP BY f.company_code,d.house_code,d.log_date
  ORDER BY f.company_code COLLATE "C",d.log_date,d.house_code COLLATE "C"`;

async function collectPlan(dataSource, plan, authority) {
  return dataSource.transaction('REPEATABLE READ', async manager => {
    await manager.query("SET TRANSACTION READ ONLY; SET LOCAL statement_timeout='60s'; SET LOCAL TIME ZONE 'UTC'");
    const [guard] = await manager.query(`SELECT current_setting('transaction_read_only')='on'
      AND current_setting('default_transaction_read_only')='on'
      AND NOT pg_is_in_recovery() AS ready`);
    if (!guard?.ready) throw new Error('PRIMARY_READ_ONLY_REQUIRED');
    const inventory = partitionInventory(await manager.query(inventorySql));
    const batches = [];
    const reasons = {};
    let eligible = 0;
    let held = 0;
    let fingerprint = null;

    // The deployed per-batch planner normally opens its own transaction. Reuse
    // this read-only manager so the inventory and every batch see one snapshot.
    const snapshot = {
      transaction: (isolation, work) => {
        if (isolation !== 'REPEATABLE READ') throw new Error('READ_SNAPSHOT_REQUIRED');
        return work(manager);
      },
    };
    for (const [i, scope] of inventory.scopes.entries()) {
      const result = await plan(snapshot, scope);
      if (!Number.isSafeInteger(result.eligible) || result.eligible < 0 || result.eligible > result.rows.length
        || result.rows.length > inventory.scopeSizes[i]) throw new Error('PLAN_COUNTS_MISMATCH');
      if (fingerprint && fingerprint !== result.targetFingerprint) throw new Error('PLAN_TARGET_CHANGED');
      fingerprint = result.targetFingerprint;
      for (const row of result.rows) {
        for (const reason of row.holds) reasons[reason] = (reasons[reason] ?? 0) + 1;
      }
      eligible += result.eligible;
      held += result.rows.length - result.eligible;
      if (result.rows.length) batches.push(result);
    }
    if (held < 0 || eligible + held > inventory.plannedRows) throw new Error('PLAN_COUNTS_MISMATCH');

    const report = {
      schema: 'phoenix.flock-loss-cache-production-plan/v1',
      authority,
      inventory,
      targetFingerprint: fingerprint,
      batches,
      receipt: {
        companies: inventory.companyCount,
        scopesChecked: inventory.scopes.length,
        batchesWithDifferences: batches.length,
        inventoried: inventory.inventoryRows,
        inventoriedInScope: inventory.plannedRows,
        eligible,
        held,
        unclassified: inventory.holds,
        reasons,
      },
    };
    return { ...report, receipt: { ...report.receipt, digest: sha256(JSON.stringify(report)) } };
  });
}

async function main() {
  const [apiSha, workflowSha, runId, runAttempt, containerId, imageId, programSha256] = process.argv.slice(2);
  if (![apiSha, workflowSha].every(value => /^[a-f0-9]{40}$/.test(value ?? ''))
    || ![runId, runAttempt].every(value => /^[1-9][0-9]{0,19}$/.test(value ?? ''))
    || ![containerId, programSha256].every(value => /^[a-f0-9]{64}$/.test(value ?? ''))
    || !/^sha256:[a-f0-9]{64}$/.test(imageId ?? '')
    || !process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_NAME || !process.env.DB_PASSWORD) {
    throw new Error('EXACT_PRODUCTION_PLAN_CONTEXT_REQUIRED');
  }

  // node - runs inside the pinned API image. DB credentials remain in the container.
  const { DataSource } = require('typeorm');
  const { planFlockLossCache } = require('./dist/tools/flock-loss-cache-repair.js');
  const dataSource = await new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || '5432'),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    synchronize: false,
    migrationsRun: false,
    installExtensions: false,
    extra: { options: '-c default_transaction_read_only=on -c timezone=UTC', max: 1 },
  }).initialize();
  try {
    process.stdout.write(JSON.stringify(await collectPlan(dataSource, planFlockLossCache, { apiSha, workflowSha, runId, runAttempt, containerId, imageId, programSha256 })) + '\n');
  } finally {
    await dataSource.destroy();
  }
}

if (!module.parent) {
  void main().catch(error => {
    const code = /^[A-Z_]+$/.test(error?.message ?? '') ? error.message : 'FLOCK_CACHE_PRODUCTION_PLAN_FAILED';
    process.stderr.write(code + '\n');
    process.exitCode = 1;
  });
}

module.exports = { partitionInventory, collectPlan };
