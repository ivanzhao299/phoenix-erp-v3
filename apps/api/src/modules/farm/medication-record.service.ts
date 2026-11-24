import { validateVetFlock } from './vet-flock';
import { assertVetSiteAccess, assertStockWarehouse, batchIdentity, checkStockUnit, listVetLots, resolveVetMaterial, stockQuantity, stockUnit } from './vet-stock';
import { deriveOrgScope,scopeWhere } from './farm.service';
import { lockManagedActivity,recordFlockActivity,vetCareJoin } from './flock-activity-source';
import { lockTempProductionReferences } from '../wms/temp-production-reversal';
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
import { INV_LEDGER_CHANGE_TYPE } from '../wms/inv-ledger-change-types';
import { writeInvLedger } from '../wms/inventory-ledger.writer';

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<any[]> };

export interface MedicationRecordCreateInput {
  record_no?: string;
  course_no?: string;
  site_code: string;
  company_code: string;
  farm_code: string;
  flock_no: string;
  house_code?: string;
  medication_code?: string;
  material_code?: string;
  indication?: string;
  start_date: string;
  end_date?: string;
  days_used?: number | string;
  dose_value?: number | string;
  dose_unit?: string;
  actual_heads?: number | string;
  actual_qty: number | string;
  qty_unit?: string;
  usage_route?: string;
  withdraw_days?: number | string;
  remark?: string;
  warehouse_code?: string;
  inventory_batch_no?: string;
}

interface InventoryAllocation {
  unit: string;
  material_code: string | null;
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
  if (!Number.isFinite(result.getTime()) || result.getUTCFullYear()>9999) throw new BadRequestException('疗程或休药天数超出有效日期范围');
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
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  private scope(): DataScopeContext | undefined {
    return this.cls?.get<DataScopeContext | undefined>('dataScope');
  }

  private assertWriteScope(input: Pick<MedicationRecordCreateInput, 'site_code' | 'farm_code' | 'company_code'>): void {
    const context=this.scope();
    if(!context)throw new ForbiddenException('缺少养殖数据范围');
    if(!['allowedBreedingCompanyCodes','allowedBreedingSiteCodes','allowedBreedingFarmCodes'].some(key=>Object.prototype.hasOwnProperty.call(context,key))) {
      if(context.isGlobal)return;
      if(!context.allowedCompanyCodes.includes(input.company_code) || context.allowedSiteCodes.length>0&&!context.allowedSiteCodes.includes(input.site_code) || context.allowedFarmCodes.length>0&&!context.allowedFarmCodes.includes(input.farm_code)) throw new ForbiddenException('无权写入该公司/场区/农场养殖记录');
      return;
    }
    const scope=deriveOrgScope({dataScope:context});
    if(scope.isGlobal || scope.companyCodes?.includes(input.company_code) || scope.farmCodes?.includes(input.farm_code) || scope.siteCodes?.includes(input.site_code))return;
    throw new ForbiddenException('无权写入该公司/场区/农场养殖记录');
  }

  private assertReadScope(row: { site_code?: string | null; farm_code?: string | null; company_code?: string | null }): void {
    this.assertWriteScope({company_code:row.company_code??'',farm_code:row.farm_code??'',site_code:row.site_code??''});
  }

  private assertWarehouseScope(warehouseCode: string): void {
    assertStockWarehouse(this.scope(), warehouseCode);
  }

  private async resolveMedicineWarehouses(
    queryable: Queryable,
    companyCode: string,
    siteCode: string,
    requestedWarehouse?: string,
  ): Promise<string[]> {
    assertStockWarehouse(this.scope(), requestedWarehouse);
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
        WHERE domain='OPERATIONAL' AND status = 'ACTIVE' AND type = 'MEDICINE'
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
    const context=this.scope();if(!context)return '1=0';
    if(!['allowedBreedingCompanyCodes','allowedBreedingSiteCodes','allowedBreedingFarmCodes'].some(key=>Object.prototype.hasOwnProperty.call(context,key))) {
      if(context.isGlobal)return '1=1';if(!context.allowedCompanyCodes.length)return '1=0';
      const filters=[];for(const [key,codes] of [['company_code',context.allowedCompanyCodes],['site_code',context.allowedSiteCodes],['farm_code',context.allowedFarmCodes]] as const) if(codes.length){params.push(codes);filters.push(`${alias}.${key}=ANY($${params.length})`);}
      return filters.join(' AND ');
    }
    const scope=deriveOrgScope({dataScope:context});
    return scopeWhere(scope,params,`${alias}.`) || '1=1';
  }

  private async insertLedger(
    queryable: Queryable,
    input: {
      batchNo: string;
      qty: number;
      unit?: string;
      materialCode?: string;
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
    const [schema] = input.houseCode ? await queryable.query(
      "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='inv_ledger' AND column_name='house_code') AS has_house",
    ) : [];
    return writeInvLedger(queryable, {
      batchNo: input.batchNo,
      changeType: input.qty < 0 ? INV_LEDGER_CHANGE_TYPE.MED_OUTBOUND : INV_LEDGER_CHANGE_TYPE.MED_INBOUND,
      qtyChange: input.qty,
      operator: input.operator,
      storeCode: input.storeCode,
      refNo: input.refNo,
      note: input.note,
      logDate: input.logDate,
      warehouseCode: input.warehouseCode ?? null,
      companyCode: input.companyCode,
      businessType: 'FARM_MEDICATION',
      unit: input.unit, materialCode: input.materialCode,
      houseCode: schema?.has_house ? input.houseCode : undefined,
    });
  }

  private async resolveLots(
    manager: Queryable,
    input: MedicationRecordCreateInput,
    startDate: string,
    quantity: number,
  ): Promise<InventoryAllocation[]> {
    const params: unknown[] = [input.material_code];
    assertStockWarehouse(this.scope(), input.warehouse_code);
    const clauses = ["mat.material_code=$1","mat.status='ACTIVE'","mat.effective_vet_kind='MEDICATION'"];
    const stockScope = this.scope()!;
    if (!stockScope.isGlobal) clauses.push(`b.warehouse_code = ANY($${params.push(stockScope.allowedWarehouseCodes)})`);
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
              b.company_code, b.warehouse_code, b.material_code, ${stockUnit} AS unit,
              w.site_code AS warehouse_site_code,
              w.company_code AS warehouse_company_code,
              w.status AS warehouse_status,
              w.type AS warehouse_type
         FROM brd_vet_material_catalog mat
         JOIN inv_batches b ON ${batchIdentity}
         JOIN wms_warehouses w ON w.warehouse_code = b.warehouse_code AND w.domain='OPERATIONAL'
        WHERE ${clauses.join(' AND ')}
        ORDER BY b.expire_date ASC NULLS LAST, b.inbound_date ASC NULLS LAST,
                 b.created_at ASC, b.batch_no ASC
        FOR UPDATE OF b FOR SHARE OF w`,
      params,
    );
    if (input.inventory_batch_no) {
      const row = rows[0];
      if (!row) throw stockConflict('MEDICATION_STOCK_NOT_FOUND', `库存批次 ${input.inventory_batch_no} 不在授权实体药品仓，请核对物料或先办理调拨`);
      if (row.warehouse_code) this.assertWarehouseScope(String(row.warehouse_code));
      if (input.warehouse_code && row.warehouse_code && row.warehouse_code !== input.warehouse_code) {
        throw stockConflict('MEDICATION_STOCK_CROSS_SITE', `库存批次 ${input.inventory_batch_no} 不属于指定药品仓`);
      }
      if (!(row.company_code || row.warehouse_company_code) || !(row.store_code && row.store_code !== 'ALL' || row.warehouse_site_code))
        throw stockConflict('MEDICATION_STOCK_CROSS_SITE','库存批次缺少公司或场站归属');
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
      if (row.warehouse_status !== 'ACTIVE') {
        throw stockConflict('MEDICATION_STOCK_UNAVAILABLE', `库存批次 ${input.inventory_batch_no} 所属仓库不可用`);
      }
      if (row.warehouse_type !== 'MEDICINE') {
        throw stockConflict('MEDICATION_STOCK_UNAVAILABLE', `库存批次 ${input.inventory_batch_no} 不是药品仓库存`);
      }
      if (row.inbound_date && row.inbound_date > startDate)
        throw stockConflict('MEDICATION_STOCK_UNAVAILABLE','库存批次在用药开始日尚未入库');
      if (row.expire_date && row.expire_date < startDate) {
        throw stockConflict('MEDICATION_STOCK_EXPIRED', `库存批次 ${input.inventory_batch_no} 已过期`);
      }
      if (row.status !== 'AVAILABLE') {
        throw stockConflict('MEDICATION_STOCK_UNAVAILABLE', `库存批次 ${input.inventory_batch_no} 当前不可用`);
      }
      const available = Math.min(Number(row.qty), Number(row.qty_available ?? row.qty ?? 0));
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
      row.status === 'AVAILABLE'
      && Math.min(Number(row.qty), Number(row.qty_available ?? row.qty ?? 0)) > 0
      && (!row.inbound_date || row.inbound_date <= startDate)
      && (!row.expire_date || row.expire_date >= startDate)
      && (row.company_code || row.warehouse_company_code) === input.company_code
      && ((row.store_code && row.store_code !== 'ALL' ? row.store_code : row.warehouse_site_code) === input.site_code)
      && (!row.store_code || row.store_code === 'ALL' || row.store_code === input.site_code)
      && (!row.company_code || row.company_code === input.company_code)
      && row.warehouse_status === 'ACTIVE'
      && row.warehouse_type === 'MEDICINE'
      && (!row.warehouse_site_code || row.warehouse_site_code === input.site_code)
      && (!row.warehouse_company_code || row.warehouse_company_code === input.company_code)
      && (!warehouses || warehouses.includes(String(row.warehouse_code ?? input.warehouse_code ?? ''))),
    );
    let remaining = quantity;
    const allocations: InventoryAllocation[] = [];
    for (const row of eligibleRows) {
      if (!input.inventory_batch_no && input.qty_unit && input.qty_unit !== row.unit) continue;
      if (remaining <= 0) break;
      const available = Math.min(Number(row.qty), Number(row.qty_available ?? row.qty ?? 0));
      if (!Number.isFinite(available) || available <= 0) continue;
      const allocated = Math.min(available, remaining);
      checkStockUnit(row.unit, input.qty_unit || allocations[0]?.unit);
      allocations.push({
        unit: row.unit, material_code: row.material_code ?? null,
        batch_no: String(row.batch_no),
        qty: allocated,
        expire_date: row.expire_date ?? null,
        inbound_date: row.inbound_date ?? null,
        ...(row.warehouse_code ? { warehouse_code: row.warehouse_code } : {}),
      });
      remaining = Math.round((remaining - allocated) * 1000) / 1000;
    }
    if (remaining > 0.0000001) {
      const expired = rows.some(row => row.expire_date && row.expire_date < startDate);
      const unavailable = rows.some(row => (row.status ?? 'AVAILABLE') !== 'AVAILABLE' || Math.min(Number(row.qty), Number(row.qty_available ?? row.qty ?? 0)) <= 0);
      if (expired && eligibleRows.length === 0) {
        throw stockConflict('MEDICATION_STOCK_EXPIRED', `药品 ${input.material_code} 没有有效期内库存`);
      }
      if (unavailable && eligibleRows.length === 0) {
        throw stockConflict('MEDICATION_STOCK_UNAVAILABLE', `药品 ${input.material_code} 没有可用库存`);
      }
      throw stockConflict('MEDICATION_STOCK_INSUFFICIENT', `药品 ${input.material_code} 可用库存不足，缺少 ${remaining}`);
    }
    return allocations;
  }

  async getLots(materialCode: string, siteCode: string, companyCode: string, warehouseCode?: string, startDate?: string) {
    const medication = String(materialCode || '').trim();
    const site = String(siteCode ?? '').trim();
    const company = String(companyCode ?? '').trim();
    if (!medication || !site || !company) throw new BadRequestException('material_code、site_code、company_code不能为空');
    await assertVetSiteAccess(this.ds,this.scope(),site,company);
    const day = normalizeDate(startDate,'start_date',false) ?? todayString();
    if (day > todayString()) throw new BadRequestException('实际用药开始日期不能在未来');
    return listVetLots(this.ds, this.scope(), medication, site, company, day, warehouseCode,false);
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
    if (!normalized.site_code || !normalized.company_code || !normalized.farm_code || !normalized.flock_no || !(normalized.material_code || normalized.medication_code)) {
      throw new BadRequestException('场站、公司、农场、鸡群和药品编码不能为空');
    }
    const startDate = normalizeDate(normalized.start_date, 'start_date') as string;
    if(startDate>todayString())throw new BadRequestException('实际用药开始日期不能在未来；计划不提前扣药');
    let endDate = normalizeDate(normalized.end_date, 'end_date', false);
    if (normalized.days_used != null && String(normalized.days_used).trim()) {
      const days=Number(normalized.days_used);
      if (!Number.isSafeInteger(days) || days<1) throw new BadRequestException('疗程天数必须为正整数');
      const lastDay=addDays(startDate,days-1);
      if (endDate && lastDay!==endDate) throw new BadRequestException('结束日期与疗程天数不符');
      endDate=lastDay;
    }
    if (!endDate || endDate<startDate) throw new BadRequestException('请填写有效疗程天数或不早于开始日的结束日期');
    if (normalized.actual_heads == null) throw new BadRequestException('请填写实际用药羽数');
    const quantity = stockQuantity(normalized.actual_qty);
    const doseValue = normalized.dose_value === undefined || normalized.dose_value === '' ? null : positiveNumber(normalized.dose_value, 'dose_value');
    const safeOperator = String(operator ?? '').trim() || 'unknown';
    const recordNo = String(normalized.record_no ?? '').trim() || generatedKey('MED');
    const courseNo = String(normalized.course_no ?? '').trim() || generatedKey('COURSE');

    return this.ds.transaction(async manager => {
      const occupancy=await lockManagedActivity(manager,normalized.flock_no);
      normalized.house_code = await validateVetFlock(manager, normalized, normalized.actual_heads);
      const medication=await resolveVetMaterial(manager,normalized.material_code,'MEDICATION');
      normalized.material_code=medication.material_code;
      const enteredWithdrawDays=String(normalized.withdraw_days ?? '').trim();
      if (!enteredWithdrawDays && medication.vet_withdraw_days == null) throw new BadRequestException('请填写休药天数，或在物料档案维护默认休药天数');
      const withdrawDays = nonNegativeInteger(enteredWithdrawDays, 'withdraw_days', Number(medication.vet_withdraw_days ?? 0));
      const withdrawUntil = addDays(endDate, withdrawDays);
      const businessDate = todayString();
      const status = medicationStatus(businessDate, endDate, withdrawUntil);
      const allocations = await this.resolveLots(manager, normalized, startDate, quantity);
      const sourceIssueNo = generatedKey('MED-ISSUE');
      const recordRows = await manager.query(
        `INSERT INTO brd_medication_records
          (record_no, course_no, inventory_batch_no, medication_code, flock_no, house_code,
           farm_code, site_code, company_code, indication, start_date, end_date, withdraw_until,
           dose_value, dose_unit, actual_qty, qty_unit, withdraw_days, usage_route, executor,
           status, source_issue_no, remark, created_by, updated_by, actual_heads, material_code, material_name, days_used, store_code, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,COALESCE($12::date-$11::date+1,0),$8,NOW(),NOW())
         ON CONFLICT DO NOTHING RETURNING id, record_no, course_no, withdraw_until, status`,
        [
          recordNo,
          courseNo,
          allocations[0]?.batch_no ?? normalized.inventory_batch_no ?? null,
          null,
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
          normalized.dose_unit || 'UNIT',
          quantity,
          allocations[0].unit,
          withdrawDays,
          normalized.usage_route || null,
          safeOperator,
          status,
          sourceIssueNo,
          normalized.remark || null,
          safeOperator,
          safeOperator,
          normalized.actual_heads ?? null,
          medication.material_code,medication.material_name,
        ],
      );
      const record = recordRows[0];
      if (!record) throw new ConflictException('该用药登记已存在，请刷新核对记录');
      await recordFlockActivity(manager,'MEDICATION',record.id,occupancy,startDate);
      for (const allocation of allocations) {
        const updated = await manager.query(
          `WITH changed AS (UPDATE inv_batches
              SET qty = COALESCE(qty, 0) - $1::numeric,
                  qty_available = COALESCE(qty_available, qty, 0) - $1::numeric,
                  updated_at = NOW()
            WHERE batch_no = $2
              AND status = 'AVAILABLE'
              AND qty >= $1::numeric AND COALESCE(qty_available, qty, 0) >= $1::numeric
            RETURNING batch_no) SELECT * FROM changed`,
          [allocation.qty, allocation.batch_no],
        );
        if (updated.length === 0) throw new ConflictException(`库存批次 ${allocation.batch_no} 可用量不足`);
        const ledgerId = await this.insertLedger(manager, {
          batchNo: allocation.batch_no,
          qty: -allocation.qty,
          unit: allocation.unit, materialCode: medication.material_code,
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
             (medication_record_id, inventory_batch_no, medication_code, qty, unit_code, inv_ledger_id, material_code, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
          [record.id, allocation.batch_no, null, allocation.qty, allocation.unit, ledgerId,medication.material_code],
        );
      }
      return { ...record, allocated: allocations };
    });
  }

  async list(query: { site_code?: string; farm_code?: string; status?: string } = {}) {
    const params: unknown[] = [];
    const clauses = [this.buildScope('care', params)];
    if (query.site_code) {
      params.push(String(query.site_code).trim());
      clauses.push(`care.site_code = $${params.length}`);
    }
    if (query.farm_code) {
      params.push(String(query.farm_code).trim());
      clauses.push(`care.farm_code = $${params.length}`);
    }
    const businessDate = todayString();
    const dateParam = params.length + 1;
    params.push(businessDate);
    const status = String(query.status || '').trim().toUpperCase();
    const statusFilter = status ? `WHERE records.effective_status=$${params.push(status)}` : '';
    return this.ds.query(
      `SELECT * FROM (SELECT r.*, care.house_code AS current_house_code, care.farm_code AS current_farm_code, care.site_code AS current_site_code, CASE
         WHEN r.status = 'CANCELLED' THEN 'CANCELLED'
         WHEN r.withdraw_until IS NULL THEN r.status
         WHEN $${dateParam} <= r.end_date THEN 'USING'
         WHEN $${dateParam} <= r.withdraw_until THEN 'IN_WITHDRAWAL'
         ELSE 'CLEARED' END AS effective_status
         FROM brd_medication_records r ${vetCareJoin('r')}
        WHERE ${clauses.join(' AND ')}
        ) records ${statusFilter} ORDER BY records.start_date DESC, records.id DESC`,
      params,
    );
  }

  async withdrawals(query: { site_code?: string; farm_code?: string } = {}) {
    const params: unknown[] = [];
    const clauses = [this.buildScope('care', params), `r.status <> 'CANCELLED'`];
    if (query.site_code) {
      params.push(String(query.site_code).trim());
      clauses.push(`care.site_code = $${params.length}`);
    }
    if (query.farm_code) {
      params.push(String(query.farm_code).trim());
      clauses.push(`care.farm_code = $${params.length}`);
    }
    const businessDate = todayString();
    const dateParam = params.length + 1;
    clauses.push(`r.start_date <= $${dateParam} AND (r.withdraw_until IS NULL OR $${dateParam} <= r.withdraw_until)`);
    return this.ds.query(
      `SELECT r.*, care.house_code AS current_house_code, care.farm_code AS current_farm_code, care.site_code AS current_site_code, CASE WHEN r.withdraw_until IS NULL OR $${dateParam} <= r.end_date THEN 'USING' ELSE 'IN_WITHDRAWAL' END AS effective_status
         FROM brd_medication_records r ${vetCareJoin('r')}
        WHERE ${clauses.join(' AND ')}
        ORDER BY r.withdraw_until ASC, r.id ASC`,
      [...params, businessDate],
    );
  }

  async cancel(id: number, operator: string) {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) throw new BadRequestException('用药记录 id 无效');
    const safeOperator = String(operator ?? '').trim() || 'unknown';
    return this.ds.transaction(async manager => {
      const [identity]=await manager.query('SELECT flock_no FROM brd_medication_records WHERE id=$1',[numericId]);
      const occupancy=identity?await lockManagedActivity(manager,identity.flock_no):null;
      if(occupancy)this.assertReadScope(occupancy); // Current caretaker must authorize withdrawal changes after transfer.
      const rows = await manager.query(`SELECT * FROM brd_medication_records WHERE id = $1 FOR UPDATE`, [numericId]);
      const record = rows[0];
      if (!record) throw new NotFoundException('用药记录不存在');
      try {
        this.assertReadScope(record);
      } catch (error) {
        if (occupancy && error instanceof ForbiddenException) throw new ForbiddenException('撤销会退回原药品批次，须同时具有原用药场区及当前照管场区权限');
        throw error;
      }
      if (record.status === 'CANCELLED') throw new BadRequestException('用药记录已撤销');
      const lines = await manager.query(
        `SELECT l.id, l.inventory_batch_no, l.qty, l.unit_code, w.domain AS warehouse_domain,w.type AS warehouse_type,w.status AS warehouse_status,w.site_code AS warehouse_site,w.company_code AS warehouse_company, b.material_code, b.status AS batch_status, b.warehouse_code, original.warehouse_code AS issued_warehouse, b.store_code, b.company_code
           FROM brd_medication_issue_lines l
           JOIN inv_batches b ON b.batch_no = l.inventory_batch_no
           LEFT JOIN LATERAL (SELECT domain,type,status,site_code,company_code FROM wms_warehouses
             WHERE warehouse_code=b.warehouse_code FOR SHARE) w ON true
           LEFT JOIN inv_ledger original ON original.id=l.inv_ledger_id
          WHERE l.medication_record_id = $1
          ORDER BY b.expire_date ASC NULLS LAST, b.inbound_date ASC NULLS LAST, b.created_at, b.batch_no
          FOR UPDATE OF l,b`,
        [numericId],
      );
      const reverseRef = generatedKey('MED-CANCEL');
      await lockTempProductionReferences(manager, lines.map((line: any) => line.inventory_batch_no));
      for (const line of lines) {
        if (line.warehouse_domain!=='OPERATIONAL' || line.warehouse_type!=='MEDICINE' || line.warehouse_status!=='ACTIVE') {
          throw new ConflictException('原仓已非启用的实体药品仓，请核对后冲回');
        }
        if ((line.company_code || line.warehouse_company)!==record.company_code ||
          (line.warehouse_company && line.warehouse_company!==record.company_code) ||
          ((line.store_code && line.store_code!=='ALL' ? line.store_code : line.warehouse_site)!==record.site_code) ||
          (line.warehouse_site && line.warehouse_site!==record.site_code)) {
          throw stockConflict('MEDICATION_STOCK_CROSS_SITE','原批次与药品仓归属不匹配，无法冲回');
        }
        if (line.issued_warehouse && line.issued_warehouse !== line.warehouse_code) throw new ConflictException('原批次仓库已变更，无法原仓冲回');
        if (line.warehouse_code) this.assertWarehouseScope(line.warehouse_code);
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
          `WITH changed AS (UPDATE inv_batches
              SET qty = COALESCE(qty, 0) + $1::numeric,
                  qty_available = CASE WHEN status='AVAILABLE' THEN COALESCE(qty_available,qty,0) + $1::numeric ELSE qty_available END,
                  updated_at = NOW()
            WHERE ${restoreClauses.join(' AND ')}
            RETURNING batch_no) SELECT * FROM changed`,
          restoreParams,
        );
        if (updated.length === 0) throw new BadRequestException(`库存批次 ${line.inventory_batch_no} 不存在，无法撤销`);
        await this.insertLedger(manager, {
          batchNo: line.inventory_batch_no,
          qty: quantity,
          unit: line.unit_code, materialCode: record.material_code ?? line.material_code,
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
        `WITH changed AS (UPDATE brd_medication_records
            SET status = 'CANCELLED', updated_by = $1, updated_at = NOW()
          WHERE id = $2 AND status <> 'CANCELLED'
          RETURNING id, record_no, status) SELECT * FROM changed`,
        [safeOperator, numericId],
      );
      return updatedRecords[0];
    });
  }
}
