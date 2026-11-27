import { officialInventoryPredicate } from './official-inventory';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { createHash } from 'node:crypto';
import { DataSource, EntityManager } from 'typeorm';
import { DataScopeContext } from '../org/services/data-scope.service';

const inbound = ['INBOUND', 'PURCHASE_INBOUND', 'PRODUCTION_INBOUND', 'PACKAGING_INBOUND',
  'TEMP_PRODUCTION_INBOUND', 'TRANSFER_IN', 'TRANSFER_DAMAGE_INBOUND', 'DEFECT_TRANSFER_IN', 'INBOUND_BROKEN',
  'SALES_RETURN_INBOUND', 'SALE_RETURN', 'MED_INBOUND', 'OPENING_INBOUND', 'CONVERSION_IN'];
const outbound = ['OUTBOUND', 'FIFO_OUT', 'SALE_OUTBOUND', 'TRANSFER_OUT', 'DEFECT_TRANSFER_OUT',
  'PRODUCTION_ISSUE', 'FEED_ISSUE', 'MEDICINE_ISSUE', 'LOGISTICS_ISSUE', 'SPARE_PART_ISSUE',
  'OFFICE_ISSUE', 'MAINTENANCE_ISSUE', 'SCRAP_OUTBOUND', 'PURCHASE_RETURN_OUT', 'MED_OUTBOUND',
  'VACCINE_OUTBOUND', 'CONVERSION_OUT', 'DEFECT_PROCESSING', 'DEFECT_CLEANING_RECHECK',
  'DEFECT_WASTE', 'DEFECT_RETURN_TO_SOURCE'];
const adjustments = ['STOCKTAKE_UP', 'STOCKTAKE_DOWN', 'LOSS'];
const corrections = ['TEMP_PRODUCTION_REVERSAL', 'PRODUCTION_INBOUND_REVERSAL'];
const nonPhysical = ['RESERVED', 'RELEASED', 'RECEIVE_OVER', 'RECEIVE_SHORT', 'EXPIRE_WRITEOFF', 'FARM_IN', 'FARM_REVERSED'];

@Injectable()
export class WarehouseDailyCloseService {
  constructor(@InjectDataSource() private readonly ds: DataSource, private readonly cls: ClsService) {}

  private scope(): DataScopeContext {
    const scope = this.cls.get<DataScopeContext>('dataScope');
    if (!scope?.isGlobal && !scope?.allowedWarehouseCodes.length) throw new ForbiddenException('无仓库日结范围');
    return scope;
  }

  async warehouses() {
    const scope = this.scope();
    const data = await this.ds.query(
      `SELECT warehouse_code,warehouse_name,company_code FROM wms_warehouses
       WHERE domain='OPERATIONAL' AND company_code IS NOT NULL AND company_code NOT IN ('','ALL')
         AND ($1::boolean OR warehouse_code=ANY($2::text[]))
       ORDER BY warehouse_code`, [scope.isGlobal, scope.allowedWarehouseCodes]);
    return { code: 200, data };
  }

  private validateDay(date: string) {
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)
      || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date) {
      throw new BadRequestException('业务日必须为真实 YYYY-MM-DD');
    }
  }

  private async company(manager: EntityManager, warehouse: string) {
    const scope = this.scope();
    if (typeof warehouse !== 'string' || !warehouse.trim() || warehouse.length > 64) throw new BadRequestException('请选择日结仓库');
    if (!scope.isGlobal && !scope.allowedWarehouseCodes.includes(warehouse)) throw new ForbiddenException('无该仓权限');
    const [row] = await manager.query(
      `SELECT company_code FROM wms_warehouses WHERE warehouse_code=$1 AND domain='OPERATIONAL'
       AND company_code IS NOT NULL AND company_code NOT IN ('','ALL')`, [warehouse]);
    if (!row) throw new NotFoundException('日结作业仓不存在或公司尚未核定');
    return row.company_code as string;
  }

  private async snapshot(manager: EntityManager, warehouse: string, date: string) {
    const company = await this.company(manager, warehouse);
    const [closed] = await manager.query(
      'SELECT id::text,closed_at,closed_by,snapshot FROM wms_daily_closes WHERE company_code=$1 AND warehouse_code=$2 AND business_date=$3',
      [company, warehouse, date]);
    if (closed) return { closed, company };

    const [calendar] = await manager.query(
      `SELECT ((clock_timestamp() AT TIME ZONE 'Asia/Singapore')::date)::text AS today,
              (((SELECT initialized_at FROM wms_close_capture_epoch) AT TIME ZONE 'Asia/Singapore')::date+1)::text AS first,
              (MAX(business_date)+1)::text AS next
       FROM wms_daily_closes WHERE company_code=$1 AND warehouse_code=$2`, [company, warehouse]);
    const [activation] = await manager.query(
      'SELECT first_business_date::text,enabled FROM wms_daily_close_activation WHERE company_code=$1 AND warehouse_code=$2',
      [company, warehouse]);
    const firstDay = activation?.first_business_date && activation.first_business_date > calendar.first
      ? activation.first_business_date : calendar.first;
    const nextDay = calendar.next ?? firstDay;
    if (date < firstDay) return { company, historical: true, nextDay };
    const [facts] = await manager.query(`
      WITH captured AS MATERIALIZED (
        SELECT e.*,( (SELECT min(x.recorded_at) FROM wms_close_capture x WHERE x.source_xid=e.source_xid)
                      AT TIME ZONE 'Asia/Singapore')::date AS day
        FROM wms_close_capture e
        WHERE e.warehouse_code=$2 AND NOT EXISTS (SELECT 1 FROM wms_close_event_claims c WHERE c.event_id=e.id)
      ), classified AS MATERIALIZED (
        SELECT *,
               CASE WHEN event_kind='PHYSICAL' THEN 'PHYSICAL'
                    WHEN movement_type=ANY($4::text[]) AND quantity>0 THEN 'IN'
                    WHEN movement_type=ANY($5::text[]) AND quantity<0 THEN 'OUT'
                    WHEN movement_type=ANY($6::text[]) THEN 'ADJUSTMENT'
                    WHEN movement_type=ANY($7::text[]) THEN 'CORRECTION'
                    WHEN movement_type=ANY($8::text[]) THEN 'INFORMATION'
                    WHEN movement_type='DAMAGE_WRITEOFF' AND quantity>0 THEN 'DAMAGE_AUDIT'
                    ELSE 'UNMAPPED' END AS category
          FROM captured WHERE day<=$3::date
      ), damage_check AS (
        SELECT source_xid,batch_no,company_code,unit,
               COALESCE(sum(quantity) FILTER (WHERE category='PHYSICAL'),0)
                - COALESCE(sum(quantity) FILTER (WHERE category IN ('IN','OUT','ADJUSTMENT','CORRECTION')),0) AS remainder,
               sum(quantity) FILTER (WHERE category='DAMAGE_AUDIT') AS damage
        FROM classified GROUP BY source_xid,batch_no,company_code,unit
      ), due AS MATERIALIZED (
        SELECT c.*, CASE WHEN c.category <> 'DAMAGE_AUDIT' THEN c.category
                         WHEN d.remainder=0 THEN 'INFORMATION'
                         WHEN d.remainder=d.damage THEN 'IN'
                         ELSE 'UNMAPPED' END AS settled_category
        FROM classified c JOIN damage_check d ON d.source_xid=c.source_xid
          AND d.batch_no IS NOT DISTINCT FROM c.batch_no AND d.company_code IS NOT DISTINCT FROM c.company_code
          AND d.unit IS NOT DISTINCT FROM c.unit
      ), reconciled AS (
        SELECT source_xid,batch_no,company_code,unit,
               count(*) FILTER (WHERE settled_category='UNMAPPED' OR quantity IS NULL) AS unresolved,
               COALESCE(sum(quantity) FILTER (WHERE settled_category='PHYSICAL'),0) AS physical,
               COALESCE(sum(quantity) FILTER (WHERE settled_category IN ('IN','OUT','ADJUSTMENT','CORRECTION')),0) AS journal
        FROM due GROUP BY source_xid,batch_no,company_code,unit
      ), balances AS (
        SELECT unit,sum(qty) AS current_qty FROM inv_batches b
         WHERE warehouse_code=$2 AND company_code=$1 AND ${officialInventoryPredicate('b')} GROUP BY unit
      ), changes AS (
        SELECT unit, sum(quantity) FILTER (WHERE settled_category='PHYSICAL') AS physical,
               sum(quantity) FILTER (WHERE settled_category='PHYSICAL' AND day<$3::date AND day<$9::date) AS initial_carry,
               sum(quantity) FILTER (WHERE settled_category='IN' AND day>=$9::date) AS inbound,
               sum(-quantity) FILTER (WHERE settled_category='OUT' AND day>=$9::date) AS outbound,
               sum(quantity) FILTER (WHERE settled_category='ADJUSTMENT' AND day>=$9::date) AS adjustment,
               sum(quantity) FILTER (WHERE settled_category='CORRECTION' AND day>=$9::date) AS correction,
               sum(-quantity) FILTER (WHERE movement_type='RESERVED' AND day>=$9::date) AS reserved,
               sum(quantity) FILTER (WHERE movement_type='RELEASED' AND day>=$9::date) AS released
          FROM due WHERE company_code=$1 GROUP BY unit
      ), future AS (
        SELECT unit,sum(quantity) AS physical FROM captured
         WHERE day>$3::date AND company_code=$1 AND event_kind='PHYSICAL' GROUP BY unit
      ), unit_keys AS (
        SELECT unit FROM balances UNION SELECT unit FROM changes UNION SELECT unit FROM future
      ), units AS (
        SELECT k.unit,
               (COALESCE(b.current_qty,0)-COALESCE(f.physical,0)-COALESCE(m.physical,0)+COALESCE(m.initial_carry,0))::text AS opening,
               COALESCE(m.inbound,0)::text AS inbound, COALESCE(m.outbound,0)::text AS outbound,
               COALESCE(m.adjustment,0)::text AS adjustment, COALESCE(m.correction,0)::text AS correction,
               COALESCE(m.reserved,0)::text AS reserved, COALESCE(m.released,0)::text AS released,
               (COALESCE(b.current_qty,0)-COALESCE(f.physical,0))::text AS closing
          FROM unit_keys k
          LEFT JOIN balances b ON b.unit IS NOT DISTINCT FROM k.unit
          LEFT JOIN changes m ON m.unit IS NOT DISTINCT FROM k.unit
          LEFT JOIN future f ON f.unit IS NOT DISTINCT FROM k.unit
      )
      , prior_units AS (
        SELECT line.unit,line.closing
        FROM wms_daily_closes c
        CROSS JOIN LATERAL jsonb_to_recordset(c.snapshot->'units') AS line(unit text,closing numeric)
        WHERE c.company_code=$1 AND c.warehouse_code=$2 AND c.business_date=$3::date-1
      ), continuity AS (
        SELECT COUNT(*)::int AS gaps FROM units u FULL JOIN prior_units p ON u.unit=p.unit
        WHERE (COALESCE(u.opening::numeric,0) <> COALESCE(p.closing,0))
          AND EXISTS (SELECT 1 FROM wms_daily_closes c WHERE c.company_code=$1 AND c.warehouse_code=$2 AND c.business_date=$3::date-1)
      )
      SELECT COALESCE((SELECT jsonb_agg(id::text ORDER BY id) FROM due),'[]') AS event_ids,
             (SELECT gaps FROM continuity) AS continuity_gaps,
             COALESCE((SELECT jsonb_agg(units ORDER BY unit) FROM units),'[]') AS units,
             (SELECT count(*)::int FROM due WHERE day<$3::date AND day>=$9::date) AS late_events,
             ((SELECT count(*) FROM reconciled WHERE company_code IS DISTINCT FROM $1 OR batch_no IS NULL OR NULLIF(unit,'') IS NULL
                  OR unresolved<>0 OR physical<>journal OR EXISTS (
                    SELECT 1 FROM inv_batches excluded WHERE excluded.batch_no=reconciled.batch_no
                      AND NOT (${officialInventoryPredicate('excluded')}))) +
              (SELECT count(*) FROM wms_close_capture pending
                 WHERE pending.company_code=$1 AND NULLIF(pending.warehouse_code,'') IS NULL
                   AND (pending.recorded_at AT TIME ZONE 'Asia/Singapore')::date<=$3::date
                   AND NOT EXISTS (SELECT 1 FROM wms_close_event_claims consumed WHERE consumed.event_id=pending.id)) +
              (SELECT count(*) FROM inv_batches WHERE warehouse_code=$2 AND
                (company_code IS DISTINCT FROM $1 OR qty IS NULL OR NULLIF(unit,'') IS NULL) AND (qty IS NULL OR qty<>0)) + (SELECT gaps FROM continuity))::int AS unresolved
      `, [company, warehouse, date, inbound, outbound, adjustments, corrections, nonPhysical, firstDay]);
    const enabled = activation?.enabled === true;
    const eligible = enabled && date === nextDay && date < calendar.today && facts.unresolved === 0;
    const version = createHash('sha256').update(JSON.stringify([company, warehouse, date, facts])).digest('hex');
    return { company, nextDay, today: calendar.today, facts, eligible, enabled, version };
  }

  async summary(warehouse: string, date: string) {
    this.validateDay(date);
    const result = await this.ds.transaction('REPEATABLE READ', manager => this.snapshot(manager, warehouse, date));
    const { facts, ...data } = result;
    return { code: 200, data: { ...data, totals: facts ? { units: facts.units, unresolved: facts.unresolved, late_events: facts.late_events, continuity_gaps: facts.continuity_gaps } : null } };
  }

  async close(warehouse: string, date: string, version: string, key: string, actor: unknown) {
    this.validateDay(date);
    if (typeof version !== 'string' || !/^[0-9a-f]{64}$/.test(version)
      || typeof key !== 'string' || !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(key)
      || !['number', 'string'].includes(typeof actor) || !String(actor).trim()) {
      throw new BadRequestException('日结预览、提交键或操作人无效');
    }
    await this.company(this.ds.manager, warehouse);
    const runner = this.ds.createQueryRunner();
    await runner.connect();
    const lockKey = 'wms-daily-close:' + warehouse;
    try {
      await runner.query('SELECT pg_advisory_lock(hashtextextended($1,0))', [lockKey]);
      await runner.startTransaction('REPEATABLE READ');
      const result = await this.snapshot(runner.manager, warehouse, date);
      const [used] = await runner.query(
        'SELECT company_code,warehouse_code,business_date::text,version FROM wms_daily_closes WHERE request_key=$1', [key]);
      if (used && (used.company_code !== result.company || used.warehouse_code !== warehouse
        || used.business_date !== date || used.version !== version)) throw new ConflictException('日结提交键已使用');
      let closed = result.closed;
      if (!closed) {
        if (!result.eligible || result.version !== version) throw new ConflictException('日结数据已改变或存在待核差异，请重新预览');
        const { event_ids, ...totals } = result.facts;
        [closed] = await runner.query(
          `INSERT INTO wms_daily_closes(company_code,warehouse_code,business_date,request_key,version,closed_by,snapshot)
           VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb) RETURNING id::text,closed_at,closed_by,snapshot`,
          [result.company, warehouse, date, key, version, String(actor), JSON.stringify(totals)]);
        await runner.query(
          'INSERT INTO wms_close_event_claims(event_id,close_id) SELECT unnest($1::bigint[]),$2', [event_ids, closed.id]);
      }
      await runner.commitTransaction();
      return { code: 200, data: { closed, company: result.company } };
    } catch (error) {
      const db = (error as { driverError?: { code?: string; constraint?: string } }).driverError;
      if (db?.code === '23505' && db.constraint === 'wms_daily_closes_request_key_key') {
        throw new ConflictException('日结提交键已使用');
      }
      throw error;
    } finally {
      try {
        if (runner.isTransactionActive) await runner.rollbackTransaction();
        await runner.query('SELECT pg_advisory_unlock(hashtextextended($1,0))', [lockKey]);
      } finally {
        await runner.release();
      }
    }
  }
}
