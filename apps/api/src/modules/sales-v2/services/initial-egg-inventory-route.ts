import { ConflictException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

type EntryMode = 'PACKAGING' | 'TEMP_PRODUCTION';

export function initialEggStockHouseReferences(batch: string, date: string) {
  return `SELECT substring(${batch}.collection_batch_ref from 7) AS house_code WHERE ${batch}.collection_batch_ref LIKE 'HOUSE-%'
    UNION SELECT substring(${batch}.source_no from length('TEMP-'||${date}::date::text||'-')+1)
      WHERE ${batch}.source_no LIKE 'TEMP-'||${date}::date::text||'-%'
    UNION SELECT p->>'houseCode' FROM jsonb_array_elements(
      CASE WHEN jsonb_typeof(${batch}.source_profile_snapshot)='array' THEN ${batch}.source_profile_snapshot ELSE '[]'::jsonb END
    ) p`;
}

export const identifiableEggStockHouse = "COALESCE(upper(btrim(house_code)),'') NOT IN ('','ALL','GLOBAL','UNKNOWN')";

/** Called after the sorted daily-house locks, before the first stock write. */
export async function claimInitialEggInventoryRoute(
  manager: EntityManager,
  source: { companyCode: string; houseCodes: string[]; eggDate: string },
  mode: EntryMode,
): Promise<void> {
  const { companyCode, houseCodes, eggDate } = source;
  const competingMode = mode === 'PACKAGING' ? 'TEMP_PRODUCTION' : 'PACKAGING';
  // Before the flock baseline, the route table was not written for every
  // receipt. Persisted original inventory identity still blocks the other path,
  // even for depleted batches or when mode has changed since the original post.
  const [prior] = await manager.query(
    `SELECT b.batch_no FROM inv_batches b
      CROSS JOIN LATERAL (
        SELECT array_agg(btrim(house_code)) FILTER (WHERE ${identifiableEggStockHouse}) houses
        FROM (
          ${initialEggStockHouseReferences('b', '$2')}
          UNION SELECT src.house_code FROM pkg_packing_records pk
            JOIN pkg_grading_records g ON g.code=pk.grading_code OR g.code IN (
              SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(pk.grading_codes_json)='array'
                THEN pk.grading_codes_json ELSE '[]'::jsonb END))
            JOIN pkg_grading_source_links link ON link.grading_id=g.id
            JOIN pkg_source_batches src ON src.id=link.source_batch_id
            WHERE b.source_type='PACKAGING' AND (pk.code=b.packaging_batch_ref OR pk.code=b.source_no)
        ) origins
      ) proof
      WHERE b.company_code=$1 AND b.egg_date=$2 AND b.source_type=$4
        AND (proof.houses IS NULL OR proof.houses && $3::text[])
      LIMIT 1`,
    [companyCode, eggDate, houseCodes, competingMode],
  );
  if (prior) throw new ConflictException('同一产蛋来源已有另一入库路径的库存凭据，禁止重复入库');

  await manager.query(
    `INSERT INTO brd_egg_day_routes(company_code,house_code,production_date,entry_mode)
     SELECT $1,h,$2,$4 FROM unnest($3::text[]) h ORDER BY h
     ON CONFLICT DO NOTHING`,
    [companyCode, eggDate, houseCodes, mode],
  );
  const [conflict] = await manager.query(
    `SELECT 1 FROM brd_egg_day_routes WHERE company_code=$1 AND production_date=$2
      AND house_code=ANY($3::text[]) AND entry_mode<>$4 LIMIT 1`,
    [companyCode, eggDate, houseCodes, mode],
  );
  if (conflict) throw new ConflictException('同一产蛋来源已采用另一入库路径，禁止重复入库');
}
