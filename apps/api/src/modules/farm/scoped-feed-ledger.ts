import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import type { DataScopeContext } from '../org/services/data-scope.service';
import { deriveOrgScope } from './farm.service';

export type FeedWarehouseScope = { isGlobal: boolean; allowedWarehouseCodes: string[] };
type Farm = { farm_code: string; farm_name: string; company_code: string; site_code: string; status: string };
type FeedItem = { materialCode: string; unit: string; consumed: number | null; counted: number | null; note: string };

function ledgerDate(date: unknown) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
    throw new BadRequestException('请选择有效的业务日期');
  }
  return date;
}

export async function feedFarms(db: EntityManager, scope: DataScopeContext) {
  if (!scope) throw new ForbiddenException('缺少饲料台账的数据范围');
  const target = deriveOrgScope({ dataScope: scope });
  const farms: Farm[] = await db.query(`SELECT farm_code,farm_name,company_code,mapped_site_code AS site_code,status
    FROM brd_farms WHERE NULLIF(company_code,'') IS NOT NULL
      AND ($1 OR company_code=ANY($2::text[]) OR farm_code=ANY($3::text[]) OR mapped_site_code=ANY($4::text[]))
    ORDER BY company_code,farm_code`,
    [target.isGlobal, target.companyCodes ?? [], target.farmCodes ?? [], target.siteCodes ?? []]);
  return farms;
}

async function requireFeedFarm(db: EntityManager, scope: DataScopeContext, farmCode: unknown, companyCode: unknown) {
  const farm = (await feedFarms(db, scope)).find(row => row.farm_code === farmCode && row.company_code === companyCode);
  if (!farm) throw new ForbiddenException('当前权限无法访问该公司和农场的饲料台账');
  return farm;
}

export async function readFeedDay(db: EntityManager, scope: DataScopeContext, input: Record<string, unknown>, warehouses: FeedWarehouseScope) {
  const date = ledgerDate(input.date);
  const farm = await requireFeedFarm(db, scope, input.farmCode, input.companyCode);
  const params = [farm.company_code, farm.farm_code, date, warehouses.isGlobal, warehouses.allowedWarehouseCodes] as const;
  const [header] = await db.query('SELECT version FROM farm_feed_days WHERE company_code=$1 AND farm_code=$2 AND ledger_date=$3', params.slice(0, 3));
  const rows = await db.query(`WITH issues AS (
    SELECT l.material_code,l.unit,SUM(-l.qty_change)::numeric AS issued,
      jsonb_agg(jsonb_build_object('houseCode',l.destination_code,'batchNo',l.batch_no,
        'outboundNo',l.ref_no,'quantity',-l.qty_change) ORDER BY l.id) AS movements
    FROM inv_ledger l
    JOIN wms_outbound o ON o.outbound_no=l.ref_no AND o.warehouse_code=l.warehouse_code AND o.company_code=l.company_code
    JOIN brd_houses h ON h.house_code=l.destination_code AND h.farm_code=$2
    WHERE l.company_code=$1 AND l.change_type='FEED_ISSUE' AND l.business_type='FEED_DISTRIBUTION'
      AND l.destination_type='HOUSE' AND l.qty_change<0 AND l.material_code IS NOT NULL AND l.unit IS NOT NULL
      AND o.type='FEED_DISTRIBUTION' AND o.status='DONE' AND o.date=$3
      AND o.destination_type='HOUSE' AND COALESCE(NULLIF(o.destination_house_code,''),o.destination_code)=h.house_code AND ($4 OR l.warehouse_code=ANY($5::text[]))
    GROUP BY l.material_code,l.unit
  ), keys AS (
    SELECT material_code,unit FROM mst_materials WHERE material_type='FEED_RAW' AND status='ACTIVE' AND NULLIF(unit,'') IS NOT NULL
    UNION SELECT material_code,unit FROM issues
    UNION SELECT material_code,unit FROM farm_feed_day_items WHERE company_code=$1 AND farm_code=$2 AND ledger_date IN ($3::date,$3::date-1)
  )
  SELECT k.material_code AS "materialCode",COALESCE(m.material_name,k.material_code) AS name,k.unit,
    prior.counted AS opening,day.consumed,day.counted,COALESCE(day.note,'') AS note,
    CASE WHEN $4 OR cardinality($5::text[])>0 THEN COALESCE(i.issued,0) END AS issued,
    COALESCE(i.movements,'[]'::jsonb) AS movements
  FROM keys k
  LEFT JOIN mst_materials m ON m.material_code=k.material_code
  LEFT JOIN issues i ON i.material_code=k.material_code AND i.unit=k.unit
  LEFT JOIN farm_feed_day_items day ON day.material_code=k.material_code AND day.unit=k.unit
    AND day.company_code=$1 AND day.farm_code=$2 AND day.ledger_date=$3::date
  LEFT JOIN farm_feed_day_items prior ON prior.material_code=k.material_code AND prior.unit=k.unit
    AND prior.company_code=$1 AND prior.farm_code=$2 AND prior.ledger_date=$3::date-1
  ORDER BY name,k.unit,k.material_code`, [...params]);
  return {
    ...farm, date, version: header?.version ?? 0, rows,
    warehouseCoverage: warehouses.isGlobal ? 'ALL' : warehouses.allowedWarehouseCodes.length ? 'AUTHORIZED' : 'NONE',
  };
}

export async function writeFeedDay(db: EntityManager, scope: DataScopeContext, input: Record<string, unknown>, operator: string, warehouses: FeedWarehouseScope) {
  const date = ledgerDate(input.date);
  const version = input.version;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0 ||
      !Array.isArray(input.items) || input.items.length > 300 || !input.items.length) {
    throw new BadRequestException('饲料台账版本或明细无效，请刷新');
  }
  const quantity = (value: unknown, line: number) => {
    if (value == null) return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 ||
      value >= 100000000000 || Math.abs(value * 1000 - Math.round(value * 1000)) > 0.00001) {
      throw new BadRequestException('第 ' + line + ' 行数量无效，请填非负数，最多三位小数');
    }
    return value;
  };
  const items: FeedItem[] = input.items.map((row, index) => {
    if (!row || typeof row.materialCode !== 'string' || !row.materialCode ||
        typeof row.unit !== 'string' || !row.unit || typeof row.note !== 'string' || row.note.length > 200) {
      throw new BadRequestException('第 ' + (index + 1) + ' 行物料、计量单位或备注无效');
    }
    return { materialCode: row.materialCode, unit: row.unit,
      consumed: quantity(row.consumed, index + 1), counted: quantity(row.counted, index + 1), note: row.note };
  });
  if (new Set(items.map(item => JSON.stringify([item.materialCode, item.unit]))).size !== items.length) {
    throw new BadRequestException('物料与计量单位组合重复');
  }
  return db.transaction(async tx => {
    const farm = await requireFeedFarm(tx, scope, input.farmCode, input.companyCode);
    if (farm.status !== 'ACTIVE') throw new ForbiddenException('停用农场只能查询饲料台账');
    const key = [farm.company_code, farm.farm_code, date];
    await tx.query(`INSERT INTO farm_feed_days(company_code,farm_code,ledger_date,operator) VALUES($1,$2,$3,$4)
      ON CONFLICT DO NOTHING`, [...key, operator]);
    const [current] = await tx.query('SELECT version FROM farm_feed_days WHERE company_code=$1 AND farm_code=$2 AND ledger_date=$3 FOR UPDATE', key);
    if (current.version !== version) {
      throw new ConflictException({ code: 'FEED_LEDGER_VERSION_CHANGED', currentVersion: current.version, message: '同一场日台账已更新，请核对当前版本后再保存' });
    }
    for (const item of items) {
      const [material] = await tx.query(`SELECT material_code FROM mst_materials
        WHERE material_code=$1 AND material_type='FEED_RAW' AND unit=$2 AND status='ACTIVE' FOR SHARE`, [item.materialCode, item.unit]);
      if (!material) throw new BadRequestException('物料或单位已变化，请核对后保存：' + item.materialCode);
      await tx.query(`INSERT INTO farm_feed_day_items(company_code,farm_code,ledger_date,material_code,unit,consumed,counted,note)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (company_code,farm_code,ledger_date,material_code,unit)
        DO UPDATE SET consumed=EXCLUDED.consumed,counted=EXCLUDED.counted,note=EXCLUDED.note`,
        [...key, item.materialCode, item.unit, item.consumed, item.counted, item.note]);
    }
    await tx.query('UPDATE farm_feed_days SET version=version+1,operator=$4 WHERE company_code=$1 AND farm_code=$2 AND ledger_date=$3', [...key, operator]);
    return readFeedDay(tx, scope, input, warehouses);
  });
}
