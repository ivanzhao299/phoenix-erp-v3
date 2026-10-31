import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { DataSource } from 'typeorm';
import { DataScopeContext } from '../org/services/data-scope.service';

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<any[]> };

export interface ImmunePlanCreateInput {
  record_no?: string;
  site_code: string;
  company_code: string;
  farm_code: string;
  flock_no: string;
  house_code?: string;
  vaccine_code?: string;
  vaccine?: string;
  vaccine_batch_no?: string;
  inventory_batch_no?: string;
  vaccine_expire_date?: string;
  plan_date: string;
  next_due_date?: string;
  planned_heads?: number | string;
  method_code?: string;
  method?: string;
  dose_value?: number | string;
  dose_unit?: string;
  dose?: string;
  remark?: string;
}

interface VaccineAllocation {
  batch_no: string;
  qty: number;
  expire_date: string | null;
  inbound_date: string | null;
  warehouse_code: string | null;
}

function dateValue(value: unknown, label: string, required = true): string | null {
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

function nonNegativeInteger(value: unknown, label: string, fallback = 0): number {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) throw new BadRequestException(`${label}必须为非负整数`);
  return parsed;
}

function positiveNumber(value: unknown, label: string, fallback?: number): number {
  const parsed = value === undefined || value === null || value === '' ? fallback : Number(value);
  if (parsed === undefined || !Number.isFinite(parsed) || parsed <= 0) {
    throw new BadRequestException(`${label}必须大于 0`);
  }
  return parsed;
}

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function generatedKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

@Injectable()
export class ImmuneService {
  private invLedgerColumnsPromise: Promise<Set<string>> | null = null;

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  private scope(): DataScopeContext | undefined {
    return this.cls?.get<DataScopeContext | undefined>('dataScope');
  }

  private assertWriteScope(input: Pick<ImmunePlanCreateInput, 'site_code' | 'farm_code' | 'company_code'>): void {
    const scope = this.scope();
    if (!scope || scope.isGlobal) return;
    if (scope.allowedCompanyCodes.length === 0 || !scope.allowedCompanyCodes.includes(input.company_code)) {
      throw new ForbiddenException('无权写入该免疫计划（公司范围不匹配）');
    }
    if (scope.allowedSiteCodes.length > 0 && !scope.allowedSiteCodes.includes(input.site_code)) {
      throw new ForbiddenException('无权写入该免疫计划（场站范围不匹配）');
    }
    if (scope.allowedFarmCodes.length > 0 && !scope.allowedFarmCodes.includes(input.farm_code)) {
      throw new ForbiddenException('无权写入该免疫计划（农场范围不匹配）');
    }
  }

  private assertReadScope(row: { site_code?: string | null; farm_code?: string | null; company_code?: string | null }): void {
    const scope = this.scope();
    if (!scope || scope.isGlobal) return;
    if (scope.allowedCompanyCodes.length === 0 || !row.company_code || !scope.allowedCompanyCodes.includes(row.company_code)) {
      throw new ForbiddenException('无权访问该免疫计划（公司范围不匹配）');
    }
    if (scope.allowedSiteCodes.length > 0 && row.site_code && !scope.allowedSiteCodes.includes(row.site_code)) {
      throw new ForbiddenException('无权访问该免疫计划（场站范围不匹配）');
    }
    if (scope.allowedFarmCodes.length > 0 && row.farm_code && !scope.allowedFarmCodes.includes(row.farm_code)) {
      throw new ForbiddenException('无权访问该免疫计划（农场范围不匹配）');
    }
  }

  private buildScope(alias: string, params: unknown[]): string {
    const scope = this.scope();
    if (!scope || scope.isGlobal) return '1=1';
    if (scope.allowedCompanyCodes.length === 0) return '1=0';
    const clauses: string[] = [];
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
      siteCode: string;
      warehouseCode: string | null;
      operator: string;
      refNo: string;
      note: string;
      logDate: string;
    },
  ): Promise<number | null> {
    const names = ['batch_no', 'change_type', 'qty_change'];
    const values: unknown[] = [input.batchNo, 'VACCINE_OUTBOUND', -input.qty];
    const optional: Record<string, unknown> = {
      log_date: input.logDate,
      warehouse_code: input.warehouseCode,
      company_code: input.companyCode,
      store_code: input.siteCode,
      operator: input.operator,
      ref_no: input.refNo,
      business_type: 'FARM_IMMUNIZATION',
      note: input.note,
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

  private async assertFlock(
    queryable: Queryable,
    input: Pick<ImmunePlanCreateInput, 'flock_no' | 'farm_code' | 'house_code' | 'site_code' | 'company_code'>,
    heads?: number,
  ): Promise<void> {
    const rows = await queryable.query(
      `SELECT f.flock_no, f.house_code, f.farm_code, f.current_qty, f.status,
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
    const flockStatus = String(flock.status ?? 'ACTIVE').toUpperCase();
    if (['INACTIVE', 'CANCELLED', 'CLOSED', 'DELETED'].includes(flockStatus)) {
      throw new BadRequestException(`鸡群 ${input.flock_no} 不可用于免疫`);
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
    if (heads !== undefined && flock.current_qty !== null && heads > Number(flock.current_qty)) {
      throw new BadRequestException(`免疫头数不能超过鸡群当前存栏 ${flock.current_qty}`);
    }
  }

  private async resolveVaccine(queryable: Queryable, vaccineCode: string, siteCode: string): Promise<any> {
    const rows = await queryable.query(
      `SELECT medication_code, medication_name, unit_code, product_type
         FROM brd_medications
        WHERE medication_code = $1
          AND status = 'ACTIVE'
          -- Legacy G10 rows were seeded before product_type existed. Keep those
          -- explicitly named vaccine rows usable while new rows require VACCINE.
          AND (
            UPPER(COALESCE(product_type, '')) = 'VACCINE'
            OR (UPPER(COALESCE(product_type, '')) = 'MEDICATION' AND medication_name LIKE '%疫苗%')
          )
          AND (store_code = $2 OR store_code = 'ALL' OR store_code IS NULL)
        LIMIT 1`,
      [vaccineCode, siteCode],
    );
    if (!rows[0]) throw new BadRequestException(`疫苗 ${vaccineCode} 不存在、非 ACTIVE 或类型不是 VACCINE`);
    return rows[0];
  }

  async create(input: ImmunePlanCreateInput, operator: string) {
    const normalized = {
      ...input,
      site_code: String(input.site_code ?? '').trim(),
      company_code: String(input.company_code ?? '').trim(),
      farm_code: String(input.farm_code ?? '').trim(),
      flock_no: String(input.flock_no ?? '').trim(),
      house_code: String(input.house_code ?? '').trim() || undefined,
      vaccine_code: String(input.vaccine_code ?? input.vaccine ?? '').trim(),
    };
    if (!normalized.site_code || !normalized.company_code || !normalized.farm_code || !normalized.flock_no || !normalized.vaccine_code) {
      throw new BadRequestException('场站、公司、农场、鸡群和疫苗编码不能为空');
    }
    this.assertWriteScope(normalized);
    const planDate = dateValue(normalized.plan_date, 'plan_date') as string;
    const nextDueDate = dateValue(normalized.next_due_date, 'next_due_date', false);
    if (nextDueDate && nextDueDate < planDate) throw new BadRequestException('next_due_date不能早于plan_date');
    const plannedHeads = nonNegativeInteger(normalized.planned_heads, 'planned_heads');
    if (plannedHeads <= 0) throw new BadRequestException('planned_heads必须大于 0');
    const doseValue = normalized.dose_value === undefined || normalized.dose_value === ''
      ? null
      : positiveNumber(normalized.dose_value, 'dose_value');
    const vaccineBatchNo = String(normalized.vaccine_batch_no ?? '').trim() || null;
    const inventoryBatchNo = String(normalized.inventory_batch_no ?? '').trim() || null;
    const safeOperator = String(operator ?? '').trim() || 'unknown';
    const recordNo = String(normalized.record_no ?? '').trim() || generatedKey('VAC');
    const status = planDate < todayString() ? 'OVERDUE' : 'PLANNED';

    return this.ds.transaction(async manager => {
      await this.assertFlock(manager, normalized, plannedHeads);
      const vaccine = await this.resolveVaccine(manager, normalized.vaccine_code!, normalized.site_code);
      const rows = await manager.query(
        `INSERT INTO brd_vaccinations
          (record_no, flock_no, house_code, farm_code, site_code, company_code,
           vaccine_code, vaccine, vaccine_name, plan_date, next_due_date,
           vaccine_batch_no, inventory_batch_no, vaccine_expire_date,
           planned_heads, actual_heads, flock_count, method_code, method,
           dose_value, dose_unit, dose, status, created_by, updated_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,0,$15,$16,$16,$17,$18,$19,$20,$21,$21,NOW(),NOW())
         RETURNING *`,
        [
          recordNo,
          normalized.flock_no,
          normalized.house_code ?? null,
          normalized.farm_code,
          normalized.site_code,
          normalized.company_code,
          normalized.vaccine_code,
          normalized.vaccine_code,
          vaccine.medication_name,
          planDate,
          nextDueDate,
          vaccineBatchNo,
          inventoryBatchNo,
          dateValue(normalized.vaccine_expire_date, 'vaccine_expire_date', false),
          plannedHeads,
          normalized.method_code ?? normalized.method ?? null,
          doseValue,
          normalized.dose_unit || vaccine.unit_code || 'UNIT',
          normalized.dose ?? null,
          status,
          safeOperator,
        ],
      );
      if (!rows[0]) throw new BadRequestException('免疫计划创建失败');
      return rows[0];
    });
  }

  async list(query: { site_code?: string; farm_code?: string; status?: string } = {}) {
    const params: unknown[] = [];
    const clauses = [this.buildScope('v', params)];
    if (query.site_code) {
      params.push(String(query.site_code).trim());
      clauses.push(`v.site_code = $${params.length}`);
    }
    if (query.farm_code) {
      params.push(String(query.farm_code).trim());
      clauses.push(`v.farm_code = $${params.length}`);
    }
    if (query.status) {
      const status = String(query.status).trim().toUpperCase();
      if (status === 'OVERDUE') clauses.push(`(v.status = 'OVERDUE' OR (v.status = 'PLANNED' AND v.plan_date < CURRENT_DATE))`);
      else if (status === 'EXECUTED') clauses.push(`(v.status = 'EXECUTED' OR v.actual_date IS NOT NULL)`);
      else clauses.push(`v.status = $${params.push(status)}`);
    }
    const rows = await this.ds.query<Array<Record<string, unknown>>>(
      `SELECT v.*,
              CASE
                WHEN v.status = 'CANCELLED' THEN 'CANCELLED'
                WHEN v.status = 'EXECUTED' OR v.actual_date IS NOT NULL THEN 'EXECUTED'
                WHEN v.status = 'PLANNED' AND v.plan_date < CURRENT_DATE THEN 'OVERDUE'
                ELSE v.status
              END AS effective_status
         FROM brd_vaccinations v
        WHERE ${clauses.join(' AND ')}
        ORDER BY v.plan_date DESC, v.id DESC`,
      params,
    );
    return rows.map(row => ({ ...row, status: row.effective_status ?? row.status }));
  }

  private async resolveLots(
    manager: Queryable,
    input: { vaccineCode: string; siteCode: string; companyCode: string; requestedBatchNo?: string },
    issueDate: string,
    quantity: number,
  ): Promise<VaccineAllocation[]> {
    const params: unknown[] = [input.vaccineCode, issueDate, input.siteCode, input.companyCode];
    const clauses = [
      `b.product_code = $1`,
      `b.status = 'AVAILABLE'`,
      `COALESCE(b.qty_available, b.qty, 0) > 0`,
      `(b.expire_date IS NULL OR b.expire_date >= $2::date)`,
      `(b.store_code = $3 OR b.store_code = 'ALL' OR b.store_code IS NULL)`,
      `(b.company_code = $4 OR b.company_code = 'ALL' OR b.company_code IS NULL)`,
      `EXISTS (
         SELECT 1 FROM wms_warehouses w
          WHERE w.warehouse_code = b.warehouse_code
            AND w.status = 'ACTIVE'
            AND w.type = 'MEDICINE'
            AND (w.site_code = $3 OR w.site_code IS NULL)
            AND (w.company_code = $4 OR w.company_code IS NULL)
       )`,
    ];
    const scope = this.scope();
    if (scope && !scope.isGlobal && scope.allowedWarehouseCodes.length === 0) {
      throw new ForbiddenException('无权访问疫苗库存（未配置仓库范围）');
    }
    if (scope && !scope.isGlobal && scope.allowedWarehouseCodes.length > 0) {
      params.push(scope.allowedWarehouseCodes);
      clauses.push(`b.warehouse_code = ANY($${params.length})`);
    }
    if (input.requestedBatchNo) {
      params.push(input.requestedBatchNo);
      clauses.push(`b.batch_no = $${params.length}`);
    }
    const rows = await manager.query(
      `SELECT b.batch_no, b.qty, b.qty_available, b.expire_date::text, b.inbound_date::text, b.warehouse_code
         FROM inv_batches b
         JOIN brd_medications m ON m.medication_code = b.product_code
        WHERE ${clauses.join(' AND ')}
          AND m.status = 'ACTIVE'
          AND (
            UPPER(COALESCE(m.product_type, '')) = 'VACCINE'
            OR (UPPER(COALESCE(m.product_type, '')) = 'MEDICATION' AND m.medication_name LIKE '%疫苗%')
          )
        ORDER BY b.expire_date ASC NULLS LAST, b.inbound_date ASC NULLS LAST, b.created_at ASC, b.batch_no ASC
        FOR UPDATE`,
      params,
    );
    let remaining = quantity;
    const allocations: VaccineAllocation[] = [];
    for (const row of rows) {
      if (remaining <= 0.0000001) break;
      const available = Number(row.qty_available ?? row.qty ?? 0);
      if (!Number.isFinite(available) || available <= 0) continue;
      const allocated = Math.min(available, remaining);
      allocations.push({
        batch_no: String(row.batch_no),
        qty: allocated,
        expire_date: row.expire_date ?? null,
        inbound_date: row.inbound_date ?? null,
        warehouse_code: row.warehouse_code ?? null,
      });
      remaining -= allocated;
    }
    if (remaining > 0.0000001) throw new ConflictException(`疫苗 ${input.vaccineCode} 可用库存不足，缺少 ${remaining}`);
    return allocations;
  }

  async execute(id: number, input: { actual_heads?: number | string; dose_value?: number | string; inventory_batch_no?: string; vaccine_batch_no?: string } = {}, operator: string) {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) throw new BadRequestException('免疫计划 id 无效');
    const safeOperator = String(operator ?? '').trim() || 'unknown';
    const ledgerColumns = await this.getInvLedgerColumns();
    return this.ds.transaction(async manager => {
      const rows = await manager.query(`SELECT * FROM brd_vaccinations WHERE id = $1 FOR UPDATE`, [numericId]);
      const plan = rows[0];
      if (!plan) throw new NotFoundException('免疫计划不存在');
      this.assertReadScope(plan);
      if (plan.status === 'EXECUTED' || plan.actual_date) return plan;
      if (plan.status === 'CANCELLED') throw new BadRequestException('已取消的免疫计划不能执行');
      const actualHeads = nonNegativeInteger(input.actual_heads, 'actual_heads', Number(plan.planned_heads ?? 0));
      if (actualHeads <= 0) throw new BadRequestException('actual_heads必须大于 0');
      await this.assertFlock(manager, plan, actualHeads);
      const vaccineCode = String(plan.vaccine_code ?? plan.vaccine ?? '').trim();
      if (!vaccineCode) throw new BadRequestException('免疫计划缺少疫苗编码');
      const vaccine = await this.resolveVaccine(manager, vaccineCode, String(plan.site_code));
      const doseValue = input.dose_value === undefined || input.dose_value === ''
        ? (plan.dose_value == null ? 1 : positiveNumber(plan.dose_value, 'dose_value'))
        : positiveNumber(input.dose_value, 'dose_value');
      const requiredQty = actualHeads * doseValue;
      // vaccine_batch_no is the manufacturer lot recorded for traceability.
      // Inventory allocation must use the ERP inventory batch identity only.
      const requestedBatchNo = String(input.inventory_batch_no ?? plan.inventory_batch_no ?? '').trim() || undefined;
      const actualDate = todayString();
      const allocations = await this.resolveLots(manager, {
        vaccineCode,
        siteCode: String(plan.site_code),
        companyCode: String(plan.company_code),
        requestedBatchNo,
      }, actualDate, requiredQty);
      const sourceIssueNo = String(plan.source_issue_no ?? '').trim() || generatedKey('VAC-ISSUE');
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
        if (updated.length === 0) throw new ConflictException(`疫苗库存批次 ${allocation.batch_no} 可用量不足`);
        await this.insertLedger(manager, ledgerColumns, {
          batchNo: allocation.batch_no,
          qty: allocation.qty,
          companyCode: String(plan.company_code),
          siteCode: String(plan.site_code),
          warehouseCode: allocation.warehouse_code,
          operator: safeOperator,
          refNo: sourceIssueNo,
          note: `免疫计划 ${plan.record_no}`,
          logDate: actualDate,
        });
      }
      const updatedRows = await manager.query(
        `UPDATE brd_vaccinations
            SET actual_date = $1,
                actual_heads = $2,
                dose_value = $3,
                inventory_batch_no = $4,
                source_issue_no = $5,
                executor = $6,
                updated_by = $6,
                status = 'EXECUTED',
                updated_at = NOW()
          WHERE id = $7 AND status IN ('PLANNED', 'OVERDUE') AND actual_date IS NULL
          RETURNING *`,
        [actualDate, actualHeads, doseValue, allocations[0]?.batch_no ?? requestedBatchNo ?? null, sourceIssueNo, safeOperator, numericId],
      );
      if (updatedRows.length === 0) throw new ConflictException('免疫计划已被其他请求执行');
      return { ...updatedRows[0], allocated: allocations, vaccine_name: vaccine.medication_name };
    });
  }

  async cancel(id: number, operator: string) {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) throw new BadRequestException('免疫计划 id 无效');
    const safeOperator = String(operator ?? '').trim() || 'unknown';
    return this.ds.transaction(async manager => {
      const rows = await manager.query(`SELECT * FROM brd_vaccinations WHERE id = $1 FOR UPDATE`, [numericId]);
      const plan = rows[0];
      if (!plan) throw new NotFoundException('免疫计划不存在');
      this.assertReadScope(plan);
      if (plan.status === 'CANCELLED') return plan;
      if (plan.status === 'EXECUTED' || plan.actual_date) throw new BadRequestException('已执行的免疫计划不能直接取消');
      const updated = await manager.query(
        `UPDATE brd_vaccinations
            SET status = 'CANCELLED', updated_by = $1, updated_at = NOW()
          WHERE id = $2 AND status IN ('PLANNED', 'OVERDUE') AND actual_date IS NULL
          RETURNING *`,
        [safeOperator, numericId],
      );
      if (!updated[0]) throw new ConflictException('免疫计划状态已发生变化');
      return updated[0];
    });
  }
}
