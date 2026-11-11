import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { DataScopeContext } from '../org/services/data-scope.service';

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<any[]> };

export interface MedicationRecordCreateInput {
  record_no?: string;
  course_no?: string;
  site_code: string;
  company_code: string;
  farm_code: string;
  flock_no: string;
  house_code?: string;
  medication_code: string;
  indication?: string;
  start_date: string;
  end_date?: string;
  dose_value?: number | string;
  dose_unit?: string;
  actual_qty: number | string;
  qty_unit?: string;
  usage_route?: string;
  withdraw_days?: number | string;
  remark?: string;
  warehouse_code?: string;
  inventory_batch_no?: string;
}

interface InventoryAllocation {
  batch_no: string;
  qty: number;
  expire_date: string | null;
  inbound_date: string | null;
  warehouse_code?: string | null;
}

type StockErrorCode =
  | 'MEDICATION_STOCK_NOT_FOUND'
  | 'MEDICATION_STOCK_CROSS_SITE'
  | 'MEDICATION_STOCK_EXPIRED'
  | 'MEDICATION_STOCK_UNAVAILABLE'
  | 'MEDICATION_STOCK_INSUFFICIENT';

function normalizeDate(value: unknown, label: string, required = true): string | null {
  const text = String(value ?? '').trim();
  if (!text) {
    if (required) throw new BadRequestException(`${label}不能为空`);
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    throw new BadRequestException(`${label}必须为 YYYY-MM-DD`);
  }
  const [year, month, day] = text.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new BadRequestException(`${label}不是有效日历日期`);
  }
  return text;
}

function positiveNumber(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new BadRequestException(`${label}必须大于 0`);
  return parsed;
}

function nonNegativeInteger(value: unknown, label: string, fallback = 0): number {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new BadRequestException(`${label}必须为非负整数`);
  return parsed;
}

function addDays(date: string, days: number): string {
  const result = new Date(`${date}T00:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

function todayString(): string {
  const timeZone = process.env.PHOENIX_BUSINESS_TIMEZONE || 'Asia/Singapore';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function generatedKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function medicationStatus(businessDate: string, endDate: string | null, withdrawUntil: string | null): 'USING' | 'IN_WITHDRAWAL' | 'CLEARED' {
  if (endDate && businessDate <= endDate) return 'USING';
  if (withdrawUntil && businessDate <= withdrawUntil) return 'IN_WITHDRAWAL';
  return withdrawUntil ? 'CLEARED' : 'USING';
}

function stockConflict(code: StockErrorCode, message: string): ConflictException {
  return new ConflictException({ code, message });
}

@Injectable()
export class MedicationRecordService {
  private invLedgerColumnsPromise: Promise<Set<string>> | null = null;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  private scope(): DataScopeContext | undefined {
    return this.cls?.get<DataScopeContext | undefined>('dataScope');
  }

  private assertWriteScope(input: Pick<MedicationRecordCreateInput, 'site_code' | 'farm_code' | 'company_code'>): void {
    const scope = this.scope();
    if (!scope || scope.isGlobal) return;
    if (scope.allowedCompanyCodes.length === 0 || !scope.allowedCompanyCodes.includes(input.company_code)) {
      throw new ForbiddenException('无权写入该用药记录（公司范围不匹配）');
    }
    if (scope.allowedSiteCodes.length > 0 && !scope.allowedSiteCodes.includes(input.site_code)) {
      throw new ForbiddenException('无权写入该用药记录（场站范围不匹配）');
    }
    if (scope.allowedFarmCodes.length > 0 && !scope.allowedFarmCodes.includes(input.farm_code)) {
      throw new ForbiddenException('无权写入该用药记录（农场范围不匹配）');
    }
  }

  private async assertFlock(
    queryable: Queryable,
    input: Pick<MedicationRecordCreateInput, 'flock_no' | 'farm_code' | 'house_code' | 'site_code' | 'company_code'>,
  ): Promise<void> {
    const rows = await queryable.query(
      `SELECT f.flock_no, f.house_code, f.farm_code, f.status,
              to_jsonb(farm)->>'mapped_site_code' AS mapped_site_code,
              to_jsonb(farm)->>'company_code' AS farm_company_code
         FROM brd_flocks f
         LEFT JOIN brd_farms farm ON farm.farm_code = f.farm_code
        WHERE f.flock_no = $1
        FOR SHARE OF f`,
      [input.flock_no],
    );
    const flock = rows[0];
    if (!flock) throw new BadRequestException(`鸡群 ${input.flock_no} 不存在`);
    const status = String(flock.status ?? 'ACTIVE').toUpperCase();
    if (['INACTIVE', 'CANCELLED', 'CLOSED', 'DELETED'].includes(status)) {
      throw new BadRequestException(`鸡群 ${input.flock_no} 不可用于用药`);
    }
    if (flock.farm_code && String(flock.farm_code) !== input.farm_code) {
      throw new BadRequestException('鸡群与农场归属不一致');
    }
    if (input.house_code && flock.house_code && String(flock.house_code) !== input.house_code) {
      throw new BadRequestException('鸡群与鸡舍归属不一致');
    }
    if (flock.mapped_site_code && String(flock.mapped_site_code) !== input.site_code) {
      throw new BadRequestException('鸡群与场站归属不一致');
    }
    if (flock.farm_company_code && String(flock.farm_company_code) !== input.company_code) {
      throw new BadRequestException('鸡群与公司归属不一致');
    }
  }

  private assertReadScope(row: { site_code?: string | null; farm_code?: string | null; company_code?: string | null }): void {
    const scope = this.scope();
    if (!scope || scope.isGlobal) return;
    if (scope.allowedCompanyCodes.length === 0 || !row.company_code || !scope.allowedCompanyCodes.includes(row.company_code)) {
      throw new ForbiddenException('无权访问该用药记录（公司范围不匹配）');
    }
    if (scope.allowedSiteCodes.length > 0 && row.site_code && !scope.allowedSiteCodes.includes(row.site_code)) {
      throw new ForbiddenException('无权访问该用药记录（场站范围不匹配）');
    }
    if (scope.allowedFarmCodes.length > 0 && row.farm_code && !scope.allowedFarmCodes.includes(row.farm_code)) {
      throw new ForbiddenException('无权访问该用药记录（农场范围不匹配）');
    }
  }

  private assertSiteCompanyScope(siteCode: string, companyCode: string): void {
    const scope = this.scope();
    if (!scope || scope.isGlobal) return;
    if (scope.allowedCompanyCodes.length === 0 || !scope.allowedCompanyCodes.includes(companyCode)) {
      throw new ForbiddenException('无权访问该药品库存（公司范围不匹配）');
    }
    if (scope.allowedSiteCodes.length === 0 && scope.allowedFarmCodes.length > 0) {
      throw new ForbiddenException('无权访问该药品库存（缺少场站范围）');
    }
    if (scope.allowedSiteCodes.length > 0 && !scope.allowedSiteCodes.includes(siteCode)) {
      throw new ForbiddenException('无权访问该药品库存（场站范围不匹配）');
    }
  }

  private assertWarehouseScope(warehouseCode: string): void {
    const scope = this.scope();
    if (!scope || scope.isGlobal || scope.allowedWarehouseCodes.length === 0) return;
    if (!scope.allowedWarehouseCodes.includes(warehouseCode)) {
      throw new ForbiddenException('无权访问该药品库存（仓库范围不匹配）');
    }
  }

  private async resolveMedicineWarehouses(
    queryable: Queryable,
    companyCode: string,
    siteCode: string,
    requestedWarehouse?: string,
  ): Promise<string[]> {
    const requested = String(requestedWarehouse ?? '').trim();
    if (requested) {
      this.assertWarehouseScope(requested);
      return [requested];
    }
    const scoped = this.scope()?.allowedWarehouseCodes ?? [];
    if (scoped.length > 0) return scoped;
    const rows = await queryable.query(
      `SELECT warehouse_code
         FROM wms_warehouses
        WHERE status = 'ACTIVE' AND type = 'MEDICINE'
          AND (company_code = $1 OR company_code IS NULL)
          AND (site_code = $2 OR site_code IS NULL)
        ORDER BY warehouse_code`,
      [companyCode, siteCode],
    );
    const warehouses = rows.map(row => String(row.warehouse_code ?? '').trim()).filter(Boolean);
    if (warehouses.length === 0) {
      throw new BadRequestException('未找到该公司/场站的 ACTIVE 药品仓，请明确指定 warehouse_code');
    }
    return warehouses;
  }

  private buildScope(alias: string, params: unknown[]): string {
    const scope = this.scope();
    if (!scope || scope.isGlobal) return '1=1';
    const clauses: string[] = [];
    if (scope.allowedCompanyCodes.length === 0) return '1=0';
    params.push(scope.allowedCompanyCodes);
    clauses.push(`${alias}.company_code = ANY($${params.length})`);
    if (scope.allowedSiteCodes.length > 0) {
      params.push(scope.allowedSiteCodes);
      clauses.push(`${alias}.site_code = ANY($${params.length})`);
    }
    if (scope.allowedFarmCodes.length > 0) {
      params.push(scope.allowedFarmCodes);
      clauses.push(`${alias}.farm_code = ANY($${params.length})`);
    }
    return clauses.join(' AND ');
  }

  private async getInvLedgerColumns(): Promise<Set<string>> {
    if (!this.invLedgerColumnsPromise) {
      this.invLedgerColumnsPromise = this.ds
        .query<Array<{ column_name: string }>>(
          `SELECT column_name FROM information_schema.columns
             WHERE table_schema = current_schema() AND table_name = 'inv_ledger'`,
        )
        .then(rows => new Set(rows.map(row => row.column_name)));
    }
    return this.invLedgerColumnsPromise;
  }

  private async insertLedger(
    queryable: Queryable,
    columns: Set<string>,
    input: {
      batchNo: string;
      qty: number;
      companyCode: string;
      storeCode: string;
      operator: string;
      refNo: string;
      note: string;
      logDate: string;
      warehouseCode?: string | null;
      houseCode?: string | null;
    },
  ): Promise<number | null> {
    const names = ['batch_no', 'change_type', 'qty_change'];
    const values: unknown[] = [input.batchNo, input.qty < 0 ? 'MED_OUTBOUND' : 'MED_INBOUND', input.qty];
    const optional: Record<string, unknown> = {
      log_date: input.logDate,
      warehouse_code: input.warehouseCode ?? null,
      company_code: input.companyCode,
      store_code: input.storeCode,
      operator: input.operator,
      ref_no: input.refNo,
      business_type: 'FARM_MEDICATION',
      note: input.note,
      house_code: input.houseCode ?? null,
    };
    for (const [column, value] of Object.entries(optional)) {
      if (columns.has(column)) {
        names.push(column);
        values.push(value);
      }
    }
    const placeholders = names.map((_, index) => `$${index + 1}`).join(', ');
    const rows = await queryable.query(
      `INSERT INTO inv_ledger (${names.join(', ')}) VALUES (${placeholders}) RETURNING id`,
      values,
    );
    return rows[0]?.id ? Number(rows[0].id) : null;
  }

  private async resolveLots(
    manager: Queryable,
    input: MedicationRecordCreateInput,
    startDate: string,
    quantity: number,
  ): Promise<InventoryAllocation[]> {
    const params: unknown[] = [input.medication_code];
    const clauses = ['b.product_code = $1'];
    if (input.inventory_batch_no) {
      params.push(input.inventory_batch_no);
      clauses.push(`b.batch_no = $${params.length}`);
    }
    if (input.warehouse_code && !input.inventory_batch_no) {
      this.assertWarehouseScope(input.warehouse_code);
      params.push(input.warehouse_code);
      clauses.push(`b.warehouse_code = $${params.length}`);
    } else if (!input.inventory_batch_no) {
      const warehouses = await this.resolveMedicineWarehouses(manager, input.company_code, input.site_code);
      params.push(warehouses);
      clauses.push(`b.warehouse_code = ANY($${params.length})`);
    }
    const rows = await manager.query(
      `SELECT b.batch_no, b.product_code, b.qty, b.qty_available, b.status,
              b.expire_date::text, b.inbound_date::text, b.store_code,
              b.company_code, b.warehouse_code,
              w.site_code AS warehouse_site_code,
              w.company_code AS warehouse_company_code,
              w.status AS warehouse_status,
              w.type AS warehouse_type
         FROM inv_batches b
         JOIN brd_medications m ON m.medication_code = b.product_code AND m.status = 'ACTIVE'
         JOIN wms_warehouses w ON w.warehouse_code = b.warehouse_code
        WHERE ${clauses.join(' AND ')}
        ORDER BY b.expire_date ASC NULLS LAST, b.inbound_date ASC NULLS LAST,
                 b.created_at ASC, b.batch_no ASC
        FOR UPDATE OF b`,
      params,
    );
    if (input.inventory_batch_no) {
      const row = rows[0];
      if (!row) throw stockConflict('MEDICATION_STOCK_NOT_FOUND', `库存批次 ${input.inventory_batch_no} 不存在`);
      if (row.warehouse_code) this.assertWarehouseScope(String(row.warehouse_code));
      if (input.warehouse_code && row.warehouse_code && row.warehouse_code !== input.warehouse_code) {
        throw stockConflict('MEDICATION_STOCK_CROSS_SITE', `库存批次 ${input.inventory_batch_no} 不属于指定药品仓`);
      }
      if (row.store_code && row.store_code !== 'ALL' && row.store_code !== input.site_code) {
        throw stockConflict('MEDICATION_STOCK_CROSS_SITE', `库存批次 ${input.inventory_batch_no} 不属于场站 ${input.site_code}`);
      }
      if (row.company_code && row.company_code !== input.company_code) {
        throw stockConflict('MEDICATION_STOCK_CROSS_SITE', `库存批次 ${input.inventory_batch_no} 不属于公司 ${input.company_code}`);
      }
      if (row.warehouse_site_code && row.warehouse_site_code !== input.site_code) {
        throw stockConflict('MEDICATION_STOCK_CROSS_SITE', `库存批次 ${input.inventory_batch_no} 所属仓库不属于场站 ${input.site_code}`);
      }
      if (row.warehouse_company_code && row.warehouse_company_code !== input.company_code) {
        throw stockConflict('MEDICATION_STOCK_CROSS_SITE', `库存批次 ${input.inventory_batch_no} 所属仓库不属于公司 ${input.company_code}`);
      }
      if (row.warehouse_status && row.warehouse_status !== 'ACTIVE') {
        throw stockConflict('MEDICATION_STOCK_UNAVAILABLE', `库存批次 ${input.inventory_batch_no} 所属仓库不可用`);
      }
      if (row.warehouse_type && row.warehouse_type !== 'MEDICINE') {
        throw stockConflict('MEDICATION_STOCK_UNAVAILABLE', `库存批次 ${input.inventory_batch_no} 不是药品仓库存`);
      }
      if (row.expire_date && row.expire_date < startDate) {
        throw stockConflict('MEDICATION_STOCK_EXPIRED', `库存批次 ${input.inventory_batch_no} 已过期`);
      }
      if (row.status !== 'AVAILABLE') {
        throw stockConflict('MEDICATION_STOCK_UNAVAILABLE', `库存批次 ${input.inventory_batch_no} 当前不可用`);
      }
      const available = Number(row.qty_available ?? row.qty ?? 0);
      if (!Number.isFinite(available) || available <= 0) {
        throw stockConflict('MEDICATION_STOCK_UNAVAILABLE', `库存批次 ${input.inventory_batch_no} 无可用库存`);
      }
      if (available < quantity) {
        throw stockConflict('MEDICATION_STOCK_INSUFFICIENT', `库存批次 ${input.inventory_batch_no} 可用库存不足，缺少 ${quantity - available}`);
      }
    }
    const scope = this.scope();
    const warehouses = input.warehouse_code
      ? [input.warehouse_code]
      : scope?.allowedWarehouseCodes?.length ? scope.allowedWarehouseCodes : undefined;
    const eligibleRows = rows.filter(row =>
      (row.status ?? 'AVAILABLE') === 'AVAILABLE'
      && Number(row.qty_available ?? row.qty ?? 0) > 0
      && (!row.expire_date || row.expire_date >= startDate)
      && (!row.store_code || row.store_code === 'ALL' || row.store_code === input.site_code)
      && (!row.company_code || row.company_code === input.company_code)
      && (!warehouses || warehouses.includes(String(row.warehouse_code ?? input.warehouse_code ?? ''))),
    );
    let remaining = quantity;
    const allocations: InventoryAllocation[] = [];
    for (const row of eligibleRows) {
      if (remaining <= 0) break;
      const available = Number(row.qty_available ?? row.qty ?? 0);
      if (!Number.isFinite(available) || available <= 0) continue;
      const allocated = Math.min(available, remaining);
      allocations.push({
        batch_no: String(row.batch_no),
        qty: allocated,
        expire_date: row.expire_date ?? null,
        inbound_date: row.inbound_date ?? null,
        ...(row.warehouse_code ? { warehouse_code: row.warehouse_code } : {}),
      });
      remaining -= allocated;
    }
    if (remaining > 0.0000001) {
      const expired = rows.some(row => row.expire_date && row.expire_date < startDate);
      const unavailable = rows.some(row => (row.status ?? 'AVAILABLE') !== 'AVAILABLE' || Number(row.qty_available ?? row.qty ?? 0) <= 0);
      if (expired && eligibleRows.length === 0) {
        throw stockConflict('MEDICATION_STOCK_EXPIRED', `药品 ${input.medication_code} 没有有效期内库存`);
      }
      if (unavailable && eligibleRows.length === 0) {
        throw stockConflict('MEDICATION_STOCK_UNAVAILABLE', `药品 ${input.medication_code} 没有可用库存`);
      }
      throw stockConflict('MEDICATION_STOCK_INSUFFICIENT', `药品 ${input.medication_code} 可用库存不足，缺少 ${remaining}`);
    }
    return allocations;
  }

  async getLots(medicationCode: string, siteCode: string, companyCode: string, warehouseCode?: string) {
    const medication = String(medicationCode ?? '').trim();
    const site = String(siteCode ?? '').trim();
    const company = String(companyCode ?? '').trim();
    if (!medication || !site || !company) throw new BadRequestException('medication_code、site_code、company_code不能为空');
    this.assertSiteCompanyScope(site, company);
    const params: unknown[] = [medication, site, company, todayString()];
    const clauses = [
      `b.product_code = $1`,
      `b.warehouse_code IS NOT NULL`,
      `w.status = 'ACTIVE'`,
      `w.type = 'MEDICINE'`,
      `(w.site_code = $3 OR w.site_code IS NULL)`,
      `(w.company_code = $4 OR w.company_code IS NULL)`,
      `b.status = 'AVAILABLE'`,
      `COALESCE(b.qty_available, b.qty, 0) > 0`,
      `(b.store_code = $2 OR b.store_code = 'ALL' OR b.store_code IS NULL)`,
      `(b.company_code = $3 OR b.company_code IS NULL)`,
      `(b.expire_date IS NULL OR b.expire_date >= $4::date)`,
      `EXISTS (
         SELECT 1 FROM wms_warehouses w
          WHERE w.warehouse_code = b.warehouse_code
            AND w.status = 'ACTIVE'
            AND w.type = 'MEDICINE'
            AND (w.site_code = $2 OR w.site_code IS NULL)
            AND (w.company_code = $3 OR w.company_code IS NULL)
       )`,
    ];
    if (warehouseCode) {
      this.assertWarehouseScope(warehouseCode);
      params.push(warehouseCode);
      clauses.push(`b.warehouse_code = $${params.length}`);
    } else {
      const warehouses = await this.resolveMedicineWarehouses(this.ds, company, site);
      params.push(warehouses);
      clauses.push(`b.warehouse_code = ANY($${params.length})`);
    }
    return this.ds.query(
      `SELECT b.batch_no, b.product_code AS medication_code,
              COALESCE(b.qty_available, b.qty, 0) AS qty_available,
              b.unit, b.expire_date::text, b.inbound_date::text, b.warehouse_code, b.store_code
         FROM inv_batches b
         JOIN brd_medications m ON m.medication_code = b.product_code AND m.status = 'ACTIVE'
        WHERE ${clauses.join(' AND ')}
        ORDER BY b.expire_date ASC NULLS LAST, b.inbound_date ASC NULLS LAST, b.created_at ASC, b.batch_no ASC`,
      params,
    );
  }

  async create(input: MedicationRecordCreateInput, operator: string) {
    const normalized = {
      ...input,
      site_code: String(input.site_code ?? '').trim(),
      company_code: String(input.company_code ?? '').trim(),
      farm_code: String(input.farm_code ?? '').trim(),
      flock_no: String(input.flock_no ?? '').trim(),
      medication_code: String(input.medication_code ?? '').trim(),
    };
    this.assertWriteScope(normalized);
    if (!normalized.site_code || !normalized.company_code || !normalized.farm_code || !normalized.flock_no || !normalized.medication_code) {
      throw new BadRequestException('场站、公司、农场、鸡群和药品编码不能为空');
    }
    const startDate = normalizeDate(normalized.start_date, 'start_date') as string;
    const endDate = normalizeDate(normalized.end_date, 'end_date', false);
    if (endDate && endDate < startDate) throw new BadRequestException('end_date不能早于start_date');
    const quantity = positiveNumber(normalized.actual_qty, 'actual_qty');
    const doseValue = normalized.dose_value === undefined || normalized.dose_value === '' ? null : positiveNumber(normalized.dose_value, 'dose_value');
    const safeOperator = String(operator ?? '').trim() || 'unknown';
    const ledgerColumns = await this.getInvLedgerColumns();
    const recordNo = String(normalized.record_no ?? '').trim() || generatedKey('MED');
    const courseNo = String(normalized.course_no ?? '').trim() || generatedKey('COURSE');

    return this.ds.transaction(async manager => {
      await this.assertFlock(manager, normalized);
      const medicationRows = await manager.query(
        `SELECT medication_code, medication_name, unit_code, default_withdraw_days
           FROM brd_medications
          WHERE medication_code = $1 AND status = 'ACTIVE'
            AND (store_code = $2 OR store_code = 'ALL' OR store_code IS NULL)
          LIMIT 1`,
        [normalized.medication_code, normalized.site_code],
      );
      const medication = medicationRows[0];
      if (!medication) throw new BadRequestException(`药品 ${normalized.medication_code} 不存在或已停用`);
      const withdrawDays = nonNegativeInteger(normalized.withdraw_days, 'withdraw_days', Number(medication.default_withdraw_days ?? 0));
      const withdrawUntil = endDate ? addDays(endDate, withdrawDays) : null;
      const businessDate = todayString();
      const status = medicationStatus(businessDate, endDate, withdrawUntil);
      const allocations = await this.resolveLots(manager, normalized, startDate, quantity);
      const sourceIssueNo = generatedKey('MED-ISSUE');
      const recordRows = await manager.query(
        `INSERT INTO brd_medication_records
          (record_no, course_no, inventory_batch_no, medication_code, flock_no, house_code,
           farm_code, site_code, company_code, indication, start_date, end_date, withdraw_until,
           dose_value, dose_unit, actual_qty, qty_unit, withdraw_days, usage_route, executor,
           status, source_issue_no, remark, created_by, updated_by, store_code, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$8,NOW(),NOW())
         RETURNING id, record_no, course_no, withdraw_until, status`,
        [
          recordNo,
          courseNo,
          allocations[0]?.batch_no ?? normalized.inventory_batch_no ?? null,
          normalized.medication_code,
          normalized.flock_no,
          normalized.house_code || null,
          normalized.farm_code,
          normalized.site_code,
          normalized.company_code,
          normalized.indication || null,
          startDate,
          endDate,
          withdrawUntil,
          doseValue,
          normalized.dose_unit || medication.unit_code || 'UNIT',
          quantity,
          normalized.qty_unit || medication.unit_code || 'UNIT',
          withdrawDays,
          normalized.usage_route || null,
          safeOperator,
          status,
          sourceIssueNo,
          normalized.remark || null,
          safeOperator,
          safeOperator,
        ],
      );
      const record = recordRows[0];
      if (!record) throw new BadRequestException('用药记录创建失败');
      for (const allocation of allocations) {
        const updated = await manager.query(
          `UPDATE inv_batches
              SET qty = COALESCE(qty, 0) - $1::numeric,
                  qty_available = COALESCE(qty_available, qty, 0) - $1::numeric,
                  updated_at = NOW()
            WHERE batch_no = $2
              AND status = 'AVAILABLE'
              AND COALESCE(qty_available, qty, 0) >= $1::numeric
            RETURNING batch_no`,
          [allocation.qty, allocation.batch_no],
        );
        if (updated.length === 0) throw new ConflictException(`库存批次 ${allocation.batch_no} 可用量不足`);
        const ledgerId = await this.insertLedger(manager, ledgerColumns, {
          batchNo: allocation.batch_no,
          qty: -allocation.qty,
          companyCode: normalized.company_code,
          storeCode: normalized.site_code,
          operator: safeOperator,
          refNo: sourceIssueNo,
          note: `用药记录 ${record.record_no}`,
          logDate: startDate,
          warehouseCode: allocation.warehouse_code,
          houseCode: normalized.house_code || null,
        });
        await manager.query(
          `INSERT INTO brd_medication_issue_lines
             (medication_record_id, inventory_batch_no, medication_code, qty, unit_code, inv_ledger_id, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
          [record.id, allocation.batch_no, normalized.medication_code, allocation.qty, normalized.qty_unit || medication.unit_code || 'UNIT', ledgerId],
        );
      }
      return { ...record, allocated: allocations };
    });
  }

  async list(query: { site_code?: string; farm_code?: string; status?: string } = {}) {
    const params: unknown[] = [];
    const clauses = [this.buildScope('r', params)];
    if (query.site_code) {
      params.push(String(query.site_code).trim());
      clauses.push(`r.site_code = $${params.length}`);
    }
    if (query.farm_code) {
      params.push(String(query.farm_code).trim());
      clauses.push(`r.farm_code = $${params.length}`);
    }
    if (query.status) {
      params.push(String(query.status).trim());
      clauses.push(`r.status = $${params.length}`);
    }
    const businessDate = todayString();
    const dateParam = params.length + 1;
    return this.ds.query(
      `SELECT r.*, CASE
         WHEN r.status = 'CANCELLED' THEN 'CANCELLED'
         WHEN r.withdraw_until IS NULL THEN r.status
         WHEN $${dateParam} <= r.end_date THEN 'USING'
         WHEN $${dateParam} <= r.withdraw_until THEN 'IN_WITHDRAWAL'
         ELSE 'CLEARED' END AS effective_status
         FROM brd_medication_records r
        WHERE ${clauses.join(' AND ')}
        ORDER BY r.start_date DESC, r.id DESC`,
      [...params, businessDate],
    );
  }

  async withdrawals(query: { site_code?: string; farm_code?: string } = {}) {
    const params: unknown[] = [];
    const clauses = [this.buildScope('r', params), `r.status <> 'CANCELLED'`, `r.withdraw_until IS NOT NULL`];
    if (query.site_code) {
      params.push(String(query.site_code).trim());
      clauses.push(`r.site_code = $${params.length}`);
    }
    if (query.farm_code) {
      params.push(String(query.farm_code).trim());
      clauses.push(`r.farm_code = $${params.length}`);
    }
    const businessDate = todayString();
    const dateParam = params.length + 1;
    clauses.push(`$${dateParam} <= r.withdraw_until`);
    return this.ds.query(
      `SELECT r.*, CASE WHEN $${dateParam} <= r.end_date THEN 'USING' ELSE 'IN_WITHDRAWAL' END AS effective_status
         FROM brd_medication_records r
        WHERE ${clauses.join(' AND ')}
        ORDER BY r.withdraw_until ASC, r.id ASC`,
      [...params, businessDate],
    );
  }

  async cancel(id: number, operator: string) {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) throw new BadRequestException('用药记录 id 无效');
    const ledgerColumns = await this.getInvLedgerColumns();
    const safeOperator = String(operator ?? '').trim() || 'unknown';
    return this.ds.transaction(async manager => {
      const rows = await manager.query(`SELECT * FROM brd_medication_records WHERE id = $1 FOR UPDATE`, [numericId]);
      const record = rows[0];
      if (!record) throw new NotFoundException('用药记录不存在');
      this.assertReadScope(record);
      if (record.status === 'CANCELLED') throw new BadRequestException('用药记录已撤销');
      const lines = await manager.query(
        `SELECT l.id, l.inventory_batch_no, l.qty, b.warehouse_code, b.store_code, b.company_code
           FROM brd_medication_issue_lines l
           LEFT JOIN inv_batches b ON b.batch_no = l.inventory_batch_no
          WHERE l.medication_record_id = $1
          ORDER BY l.id
          FOR UPDATE OF l`,
        [numericId],
      );
      const reverseRef = generatedKey('MED-CANCEL');
      for (const line of lines) {
        const quantity = positiveNumber(line.qty, 'issue line qty');
        if ((line.store_code && line.store_code !== 'ALL' && line.store_code !== record.site_code)
          || (line.company_code && line.company_code !== record.company_code)) {
          throw stockConflict('MEDICATION_STOCK_CROSS_SITE', `库存批次 ${line.inventory_batch_no} 不属于用药记录场站`);
        }
        const restoreParams: unknown[] = [quantity, line.inventory_batch_no];
        const restoreClauses: string[] = ['batch_no = $2'];
        if (line.store_code) {
          restoreParams.push(record.site_code);
          restoreClauses.push(`(store_code = $${restoreParams.length} OR store_code = 'ALL' OR store_code IS NULL)`);
        }
        if (line.company_code) {
          restoreParams.push(record.company_code);
          restoreClauses.push(`(company_code = $${restoreParams.length} OR company_code IS NULL)`);
        }
        const updated = await manager.query(
          `UPDATE inv_batches
              SET qty = COALESCE(qty, 0) + $1::numeric,
                  qty_available = COALESCE(qty_available, qty, 0) + $1::numeric,
                  status = 'AVAILABLE', updated_at = NOW()
            WHERE ${restoreClauses.join(' AND ')}
            RETURNING batch_no`,
          restoreParams,
        );
        if (updated.length === 0) throw new BadRequestException(`库存批次 ${line.inventory_batch_no} 不存在，无法撤销`);
        await this.insertLedger(manager, ledgerColumns, {
          batchNo: line.inventory_batch_no,
          qty: quantity,
          companyCode: record.company_code,
          storeCode: record.site_code,
          operator: safeOperator,
          refNo: reverseRef,
          note: `撤销用药记录 ${record.record_no}`,
          logDate: todayString(),
          warehouseCode: line.warehouse_code,
          houseCode: record.house_code ?? null,
        });
      }
      const updatedRecords = await manager.query(
        `UPDATE brd_medication_records
            SET status = 'CANCELLED', updated_by = $1, updated_at = NOW()
          WHERE id = $2 AND status <> 'CANCELLED'
          RETURNING id, record_no, status`,
        [safeOperator, numericId],
      );
      return updatedRecords[0];
    });
  }
}
