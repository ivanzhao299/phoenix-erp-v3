import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { DataSource, EntityManager } from 'typeorm';
import { occupancyLossesSql } from '../modules/farm/production-report-facts';

export interface RepairScope {
  company: string;
  houses: string[];
  from: string;
  through: string;
}

interface CacheDifference {
  id: string;
  house_code: string;
  occupancy_id: string;
  flock_no: string;
  day: string;
  shift: string;
  previous_mortality: number | null;
  previous_cull: number | null;
  mortality: number;
  cull: number;
  sources: string;
  snapshot: string;
  period: string;
  holds: string[];
}

function validateScope(scope: RepairScope) {
  const code = (value: unknown) => typeof value==='string' && /^[A-Za-z0-9_./-]{1,80}$/.test(value);
  const day = (value: unknown) => typeof value==='string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0,10)===value;
  if (!scope || !code(scope.company) || !Array.isArray(scope.houses) || !scope.houses.length || scope.houses.length>100
    || !scope.houses.every(code) || !day(scope.from) || !day(scope.through) || scope.from>scope.through
    || Date.parse(scope.through)-Date.parse(scope.from)>366*86400000) throw Error('INVALID_REPAIR_SCOPE');
  return {company:scope.company,houses:[...new Set(scope.houses)].sort(),from:scope.from,through:scope.through};
}

async function scan(db: EntityManager, scope: RepairScope): Promise<CacheDifference[]> {
  const [guard] = await db.query(`SELECT count(*)=1 AND current_setting('session_replication_role')='origin' AS enabled FROM pg_trigger
    WHERE tgrelid='brd_daily_logs'::regclass AND tgname='trg_official_production_report' AND tgenabled IN ('O','A')`);
  if (!guard?.enabled) throw Error('OFFICIAL_REPORT_GUARD_REQUIRED');
  const [owners] = await db.query(`SELECT count(*)::int AS valid FROM brd_houses h JOIN brd_farms f ON f.farm_code=h.farm_code
    WHERE h.house_code=ANY($1::text[]) AND f.company_code=$2`,[scope.houses,scope.company]);
  if (owners?.valid!==scope.houses.length) throw Error('HOUSE_SCOPE_CHANGED');

  return db.query(`
    WITH reports AS (
      SELECT d.id::text AS id,d.house_code,d.occupancy_id,d.flock_no,d.log_date::text AS day,d.shift,
        d.mortality_qty AS previous_mortality,d.elimination_qty AS previous_cull,
        CASE WHEN d.shift='DAILY' THEN COALESCE(l.mortality_qty,0) ELSE 0 END AS mortality,
        CASE WHEN d.shift='DAILY' THEN COALESCE(l.elimination_qty,0) ELSE 0 END AS cull,
        COALESCE(ev.sources,'[]') AS sources,encode(sha256(convert_to(to_jsonb(d)::text,'UTF8')),'hex') AS snapshot,
        COALESCE(posting.state||':'||posting.version::text,'IMPLICIT_OPEN') AS period,
        ARRAY_REMOVE(ARRAY[
          CASE WHEN o.id IS NULL OR o.company_code<>$1 OR o.farm_code IS DISTINCT FROM d.farm_code
            OR COALESCE(o.site_code,'') IS DISTINCT FROM COALESCE(d.site_code,'') OR o.company_code IS DISTINCT FROM d.company_code
            OR d.business_date IS DISTINCT FROM d.log_date OR b.flock_no IS NULL
            OR d.log_date<o.began_on OR (o.ended_on IS NOT NULL AND d.log_date>=o.ended_on) THEN 'REPORT_IDENTITY' END,
          CASE WHEN d.log_date<b.baseline_on OR d.log_date=b.baseline_on AND EXISTS (
            SELECT 1 FROM brd_flock_events e WHERE e.flock_no=d.flock_no AND e.kind='BASELINE') THEN 'BASELINE_ARCHIVE' END,
          CASE WHEN EXISTS(SELECT 1 FROM production_cutover_scopes s WHERE s.house_code=d.house_code
            AND s.state<>'DRAFT' AND d.log_date<s.first_production_date) THEN 'CUTOVER_ARCHIVE' END,
          CASE WHEN posting.state='CLOSED' THEN 'POSTING_PERIOD_CLOSED' END,
          CASE WHEN (SELECT count(*) FROM production_cutover_scopes s WHERE s.house_code=d.house_code AND s.state<>'DRAFT')>1
            OR EXISTS(SELECT 1 FROM production_cutover_scopes s WHERE s.house_code=d.house_code AND s.state<>'DRAFT' AND s.company_code<>$1)
            THEN 'CUTOVER_SCOPE_IDENTITY' END,
          CASE WHEN d.shift<>'DAILY' AND (
            NOT EXISTS(SELECT 1 FROM production_cutover_scopes s WHERE s.house_code=d.house_code AND s.company_code=$1
              AND s.state<>'DRAFT' AND s.first_production_date<=d.log_date)
            OR NOT EXISTS(SELECT 1 FROM sys_dict k WHERE k.dict_type='PRODUCTION_REPORT_SHIFT' AND k.dict_code=d.shift))
            THEN 'SHIFT_WITHOUT_FORMAL_SCOPE' END,
          CASE WHEN EXISTS (
            SELECT 1 FROM brd_flock_events e LEFT JOIN brd_flock_documents doc ON doc.id=e.document_id
            WHERE e.business_date=d.log_date AND e.kind IN ('MORTALITY','REVERSE_MORTALITY','CULL','REVERSE_CULL')
              AND (e.occupancy_id=d.occupancy_id OR (e.flock_no=d.flock_no AND e.house_code=d.house_code))
              AND (e.occupancy_id IS DISTINCT FROM d.occupancy_id OR e.flock_no IS DISTINCT FROM o.flock_no
                OR e.company_code IS DISTINCT FROM o.company_code OR e.house_code IS DISTINCT FROM o.house_code
                OR e.farm_code IS DISTINCT FROM o.farm_code OR COALESCE(e.site_code,'') IS DISTINCT FROM COALESCE(o.site_code,'')
                OR doc.status IS DISTINCT FROM 'POSTED')
          ) THEN 'LOSS_SOURCE_IDENTITY' END,
          CASE WHEN EXISTS (SELECT 1 FROM brd_flock_documents c WHERE c.kind='REPORT_CORRECTION'
            AND c.status IN ('DRAFT','SUBMITTED','APPROVED') AND c.payload->>'dailyLogId'=d.id::text) THEN 'IN_FLIGHT_REPORT_CORRECTION' END,
          CASE WHEN EXISTS (SELECT 1 FROM production_cutover_manifests m WHERE m.company_code=$1
            AND m.state IN ('READY','APPROVED') AND (m.snapshot->'reports' @> jsonb_build_array(jsonb_build_object('id',d.id))
              OR m.snapshot->'reports' @> jsonb_build_array(jsonb_build_object('id',d.id::text))
              OR m.boundary->'houses' @> jsonb_build_array(jsonb_build_object('houseCode',d.house_code)))) THEN 'FROZEN_CUTOVER_MANIFEST' END,
          CASE WHEN d.shift IS NULL OR EXISTS (SELECT 1 FROM brd_daily_logs x WHERE x.house_code=d.house_code AND x.log_date=d.log_date
            AND x.id<>d.id AND (x.shift=d.shift OR x.shift='DAILY' OR d.shift='DAILY' OR x.occupancy_id IS DISTINCT FROM d.occupancy_id)) THEN 'REPORT_GRAIN_CONFLICT' END,
          CASE WHEN l.mortality_qty<0 OR l.elimination_qty<0 THEN 'NEGATIVE_SOURCE_TOTAL' END
        ],NULL) AS holds
      FROM brd_daily_logs d
      LEFT JOIN brd_flock_occupancies o ON o.id=d.occupancy_id AND o.flock_no=d.flock_no AND o.house_code=d.house_code
      LEFT JOIN brd_flock_balances b ON b.flock_no=d.flock_no AND b.company_code=$1
      LEFT JOIN (${occupancyLossesSql}) l ON l.occupancy_id=d.occupancy_id AND l.log_date=d.log_date
        AND l.company_code=$1 AND l.flock_no=d.flock_no AND l.house_code=d.house_code
        AND l.farm_code=o.farm_code AND l.site_code IS NOT DISTINCT FROM o.site_code
      LEFT JOIN production_posting_periods posting ON posting.company_code=$1 AND posting.period_month=to_char(d.log_date,'YYYY-MM')
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_array(e.id,e.kind,e.quantity_delta) ORDER BY e.id)::text AS sources
        FROM brd_flock_events e WHERE e.occupancy_id=d.occupancy_id AND e.business_date=d.log_date
          AND e.kind IN ('MORTALITY','REVERSE_MORTALITY','CULL','REVERSE_CULL')
      ) ev ON true
      WHERE d.house_code=ANY($2::text[]) AND d.occupancy_id IS NOT NULL AND d.log_date BETWEEN $3 AND $4
    )
    SELECT * FROM reports WHERE mortality IS DISTINCT FROM previous_mortality OR cull IS DISTINCT FROM previous_cull
    ORDER BY house_code,day,shift,id LIMIT 5001`,[scope.company,scope.houses,scope.from,scope.through]);
}

async function batch(db: EntityManager, scope: RepairScope, rows: CacheDifference[]) {
  if (rows.length>5000) throw Error('REPAIR_SCOPE_TOO_LARGE');
  const [target] = await db.query(`SELECT current_database() AS database,current_schema() AS schema,
    inet_server_addr()::text AS server,inet_server_port() AS port,pg_is_in_recovery() AS replica`);
  const targetFingerprint = createHash('sha256').update(JSON.stringify(target)).digest('hex');
  const digest = createHash('sha256').update(JSON.stringify({v:2,scope,targetFingerprint,rows})).digest('hex');
  return {scope,digest,targetFingerprint,rows,eligible:rows.filter(row=>!row.holds.length).length};
}

export async function planFlockLossCache(ds: DataSource, input: RepairScope) {
  const scope = validateScope(input);
  return ds.transaction('REPEATABLE READ',async db=>{
    await db.query('SET TRANSACTION READ ONLY');
    await db.query("SET LOCAL TIME ZONE 'UTC'; SET LOCAL statement_timeout='30s'");
    return batch(db,scope,await scan(db,scope));
  });
}

export async function applyFlockLossCache(ds: DataSource, input: RepairScope, approvedDigest: string) {
  const scope = validateScope(input);
  if (!/^[0-9a-f]{64}$/.test(approvedDigest ?? '')) throw Error('EXACT_APPROVED_PLAN_REQUIRED');
  return ds.transaction('READ COMMITTED',async db=>{
    await db.query("SET LOCAL lock_timeout='5s'; SET LOCAL TIME ZONE 'UTC'; SET LOCAL statement_timeout='30s'");
    // All writers of occupant facts and signed cutover evidence take these locks.
    const lockedHouses = await db.query(`SELECT DISTINCT related.house_code
      FROM brd_flock_occupancies selected JOIN brd_flock_occupancies related ON related.flock_no=selected.flock_no
      WHERE selected.house_code=ANY($1::text[]) AND selected.company_code=$2 ORDER BY related.house_code`,[scope.houses,scope.company]);
    const houseSet = [...new Set([...scope.houses,...lockedHouses.map((row:{house_code:string})=>row.house_code)])].sort();
    for (const house of houseSet) await db.query("SELECT pg_advisory_xact_lock(hashtext('phoenix:daily-house'),hashtext($1))",[house]);
    const [newHouse] = await db.query(`SELECT 1 FROM brd_flock_occupancies selected
      JOIN brd_flock_occupancies related ON related.flock_no=selected.flock_no
      WHERE selected.house_code=ANY($1::text[]) AND selected.company_code=$2 AND NOT(related.house_code=ANY($3::text[])) LIMIT 1`,
      [scope.houses,scope.company,houseSet]);
    if (newHouse) throw Error('HOUSE_LOCK_SCOPE_CHANGED');

    const months: { month: string }[] = await db.query(`SELECT to_char(m,'YYYY-MM') AS month FROM generate_series(
      date_trunc('month',$1::date),date_trunc('month',$2::date),interval '1 month') m`,[scope.from,scope.through]);
    for (const {month} of months) await db.query('SELECT pg_advisory_xact_lock(hashtext($1))',[`production-period:${scope.company}:${month}`]);
    const confirmed = await batch(db,scope,await scan(db,scope));
    if (confirmed.digest!==approvedDigest) throw Error('REPAIR_PLAN_CHANGED');
    const eligible = confirmed.rows.filter(row=>!row.holds.length);
    const updated = await db.query(`
      WITH expected AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(
        id bigint,house_code text,flock_no text,day date,shift text,occupancy_id text,
        mortality int,cull int,previous_mortality int,previous_cull int,snapshot text)),
      changed AS (
        UPDATE brd_daily_logs d SET mortality_qty=r.mortality,elimination_qty=r.cull FROM expected r
        WHERE d.id=r.id AND d.occupancy_id=r.occupancy_id AND d.house_code=r.house_code AND d.flock_no=r.flock_no
          AND d.log_date=r.day AND d.shift=r.shift AND encode(sha256(convert_to(to_jsonb(d)::text,'UTF8')),'hex')=r.snapshot
          AND d.mortality_qty IS NOT DISTINCT FROM r.previous_mortality AND d.elimination_qty IS NOT DISTINCT FROM r.previous_cull
        RETURNING d.id,d.mortality_qty,d.elimination_qty
      )
      SELECT c.id::text AS id FROM changed c JOIN expected r ON r.id=c.id
      WHERE c.mortality_qty=r.mortality AND c.elimination_qty=r.cull ORDER BY c.id`,[JSON.stringify(eligible)]);
    if (updated.length!==eligible.length) throw Error('REPAIR_ROW_CHANGED');
    const updatedIds=updated.map((row:{id:string})=>row.id);
    return {digest:approvedDigest,updatedIds,held:confirmed.rows.length-eligible.length};
  });
}

async function main() {
  const [mode,scopeFile,digest] = process.argv.slice(2);
  const dbUrl = process.env.FLOCK_CACHE_DATABASE_URL;
  if ((mode!=='plan' && mode!=='apply') || !scopeFile || !dbUrl) throw Error('REPAIR_ARGUMENTS_REQUIRED');
  const scope = JSON.parse(readFileSync(scopeFile,'utf8')) as RepairScope;
  const ds = await new DataSource({type:'postgres',url:dbUrl,migrationsRun:false,synchronize:false,installExtensions:false}).initialize();
  try {
    const result = mode==='plan' ? await planFlockLossCache(ds,scope) : await applyFlockLossCache(ds,scope,digest);
    process.stdout.write(JSON.stringify(result,null,2)+'\n');
  } finally {
    await ds.destroy();
  }
}

if (require.main===module) void main().catch((error: unknown)=>{
  const message = error instanceof Error ? error.message : '';
  process.stderr.write((/^[A-Z_]+$/.test(message) ? message : 'REPAIR_FAILED')+'\n');
  process.exitCode=1;
});
