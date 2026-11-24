import { inactiveFlockStates, validateVetFlock, vetFlockSource } from './vet-flock';
import { assertVetSiteAccess, checkStockUnit, listVetLots, resolveVetMaterial, stockQuantity } from './vet-stock';
import { deriveOrgScope,scopeWhere } from './farm.service';
import { lockManagedActivity,recordFlockActivity,vetCareJoin } from './flock-activity-source';
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
import { INV_LEDGER_CHANGE_TYPE } from '../wms/inv-ledger-change-types';
import { writeInvLedger } from '../wms/inventory-ledger.writer';

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<any[]> };

export interface ImmunePlanCreateInput {
  record_no?: string;
  site_code: string;
  company_code: string;
  farm_code: string;
  flock_no: string;
  house_code?: string;
  material_code?: string;
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
  issue_lines?: ImmuneIssueLineInput[];
}

interface VaccineAllocation {
  unit: string;
  material_code: string | null;
  batch_no: string;
  qty: number;
  expire_date: string | null;
  inbound_date: string | null;
  warehouse_code: string | null;
  manufacturer_batch_no?: string | null;
}

interface ImmuneIssueLineInput {
  inventory_batch_no?: string;
  qty?: number | string;
  unit_code?: string;
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

@Injectable()
export class ImmuneService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  private scope(): DataScopeContext | undefined {
    return this.cls?.get<DataScopeContext | undefined>('dataScope');
  }

  private assertWriteScope(input: Pick<ImmunePlanCreateInput, 'site_code' | 'farm_code' | 'company_code'>): void {
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

  /**
   * 写疫苗出库流水（INV-301a：改调共享写入器，替换 information_schema 动态
   * 列拼接写法；列集合 = 旧动态写法的全量列，store_code 沿用场站码约定）。
   * 旧实现按 DB 实存列门控写入；所涉及列均被 egg/wms 引擎静态写入生产库，
   * 显式列形态是更安全的选择。返回值语义保持：mock 无行 → 0（旧为 null，
   * 真实 PG 必返回 id，FK 消费方不受影响）。
   */
  private async insertLedger(
    queryable: Queryable,
    input: {
      batchNo: string;
      unit: string;
      materialCode: string | null;
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
    return writeInvLedger(queryable, {
      batchNo: input.batchNo,
      changeType: INV_LEDGER_CHANGE_TYPE.VACCINE_OUTBOUND,
      qtyChange: -input.qty,
      operator: input.operator,
      storeCode: input.siteCode,
      refNo: input.refNo,
      note: input.note,
      logDate: input.logDate,
      warehouseCode: input.warehouseCode ?? null,
      companyCode: input.companyCode,
      businessType: 'FARM_IMMUNIZATION',
      unit: input.unit,
      materialCode: input.materialCode,
    });
  }

  async listVaccines(query: { site_code?: string; company_code?: string } = {}, vaccinesOnly = true) {
    const siteCode = String(query.site_code ?? '').trim();
    const companyCode = String(query.company_code ?? '').trim();
    const scope = this.scope();
    if (!scope) throw new ForbiddenException('缺少养殖数据范围');
    if (!scope.isGlobal || (siteCode && companyCode)) {
      if (!siteCode || !companyCode) return [];
      await assertVetSiteAccess(this.ds,scope,siteCode,companyCode);
    }
    return this.ds.query(`SELECT material_code,material_name,unit,vet_withdraw_days AS default_withdraw_days
      FROM brd_vet_material_catalog WHERE status='ACTIVE' AND effective_vet_kind=$1 AND NULLIF(trim(unit),'') IS NOT NULL
      ORDER BY material_name,material_code`,[vaccinesOnly?'VACCINE':'MEDICATION']);
  }

  async flockOptions() {
    const params: unknown[] = [];
    const filter = this.buildScope('v', params);
    return this.ds.query(`SELECT v.* FROM (${vetFlockSource}) v WHERE ${filter}
      AND v.closed_on IS NULL AND v.current_qty>0 AND NOT (UPPER(v.status)=ANY($${params.push(inactiveFlockStates)}))
      AND NULLIF(v.site_code,'') IS NOT NULL AND NULLIF(v.company_code,'') IS NOT NULL AND NULLIF(v.house_code,'') IS NOT NULL
      ORDER BY v.farm_code,v.house_code,v.flock_no`,params);
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
    if (!normalized.site_code || !normalized.company_code || !normalized.farm_code || !normalized.flock_no || !(normalized.material_code || normalized.vaccine_code)) {
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
      const occupancy=await lockManagedActivity(manager,normalized.flock_no);
      normalized.house_code = await validateVetFlock(manager, normalized, plannedHeads);
      const vaccine = await resolveVetMaterial(manager,normalized.material_code,'VACCINE');
      if (normalized.issue_lines !== undefined && !Array.isArray(normalized.issue_lines)) throw new BadRequestException('批次分配格式无效');
      const plannedLines = normalized.issue_lines?.length
        ? await this.allocate(manager, {vaccineCode: vaccine.material_code, siteCode: normalized.site_code, companyCode: normalized.company_code}, normalized.issue_lines)
        : [];
      if (inventoryBatchNo && !plannedLines.some(line => line.batch_no === inventoryBatchNo)) {
        const lots = await listVetLots(manager,this.scope(),vaccine.material_code,normalized.site_code,normalized.company_code,
          todayString(),undefined,true,[inventoryBatchNo]);
        if (!lots.length) throw new BadRequestException('所选批次在本群所属公司、场站及授权药品仓不可用，请核对库存或先办理调拨');
      }
      const rows = await manager.query(
        `INSERT INTO brd_vaccinations
          (record_no, flock_no, house_code, farm_code, site_code, company_code,
           vaccine_code, vaccine, vaccine_name, plan_date, next_due_date,
           vaccine_batch_no, inventory_batch_no, vaccine_expire_date,
           planned_heads, actual_heads, flock_count, method_code, method,
           dose_value, dose_unit, dose, status, planned_issue_lines, material_code, stock_unit, created_by, updated_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,0,$15,$16,$16,$17,$18,$19,$20,$22::jsonb,$23,$24,$21,$21,NOW(),NOW())
         ON CONFLICT DO NOTHING RETURNING *`,
        [
          recordNo,
          normalized.flock_no,
          normalized.house_code ?? null,
          normalized.farm_code,
          normalized.site_code,
          normalized.company_code,
          null,
          vaccine.material_code,
          vaccine.material_name,
          planDate,
          nextDueDate,
          vaccineBatchNo,
          inventoryBatchNo,
          dateValue(normalized.vaccine_expire_date, 'vaccine_expire_date', false),
          plannedHeads,
          normalized.method_code ?? normalized.method ?? null,
          doseValue,
          normalized.dose_unit || 'UNIT',
          normalized.dose ?? null,
          status,
          safeOperator,
          JSON.stringify(plannedLines.map(line => ({inventory_batch_no: line.batch_no, qty: line.qty, unit_code: line.unit}))),
          vaccine.material_code,vaccine.unit,
        ],
      );
      if (!rows[0]) throw new ConflictException('该单号或本群同日同物料的免疫计划已存在，请刷新查看');
      await recordFlockActivity(manager,'IMMUNE_PLAN',rows[0].id,occupancy,todayString());
      return rows[0];
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
    if (query.status) {
      const status = String(query.status).trim().toUpperCase();
      if (status === 'OVERDUE') clauses.push(`(v.status = 'OVERDUE' OR (v.status = 'PLANNED' AND v.plan_date < CURRENT_DATE))`);
      else if (status === 'EXECUTED') clauses.push(`(v.status = 'EXECUTED' OR v.actual_date IS NOT NULL)`);
      else clauses.push(`v.status = $${params.push(status)}`);
    }
    const rows = await this.ds.query<Array<Record<string, unknown>>>(
      `SELECT v.*, care.house_code AS current_house_code, care.farm_code AS current_farm_code, care.site_code AS current_site_code, execution.house_code AS executed_house_code,
              COALESCE((
                SELECT json_agg(json_build_object(
                  'inventory_batch_no', l.inventory_batch_no,
                  'manufacturer_batch_no', l.manufacturer_batch_no,
                  'vaccine_code', l.vaccine_code, 'material_code',l.material_code,
                  'qty', l.qty,
                  'unit_code', l.unit_code,
                  'inv_ledger_id', l.inv_ledger_id
                ) ORDER BY l.id)
                  FROM brd_vaccination_issue_lines l
                 WHERE l.vaccination_id = v.id
              ), '[]'::json) AS issue_lines,
              CASE
                WHEN v.status = 'CANCELLED' THEN 'CANCELLED'
                WHEN v.status = 'EXECUTED' OR v.actual_date IS NOT NULL THEN 'EXECUTED'
                WHEN v.status = 'PLANNED' AND v.plan_date < CURRENT_DATE THEN 'OVERDUE'
                ELSE v.status
              END AS effective_status
         FROM brd_vaccinations v ${vetCareJoin('v')}
         LEFT JOIN brd_flock_activity_sources execution ON execution.activity_type='IMMUNE_EXECUTION' AND execution.activity_id=v.id::text
        WHERE ${clauses.join(' AND ')}
        ORDER BY v.plan_date DESC, v.id DESC`,
      params,
    );
    return rows.map(row => ({ ...row, status: row.effective_status ?? row.status }));
  }

  private async allocate(manager: Queryable, input: {vaccineCode:string;siteCode:string;companyCode:string},
    lines: ImmuneIssueLineInput[], actualQty?: number, preferredBatch?: string, requestedUnit?: string): Promise<VaccineAllocation[]> {
    const requests = new Map<string, {qty:number;unit?:string}>();
    for (const line of lines) {
      const batch = String(line?.inventory_batch_no ?? '').trim();
      if (!batch || requests.has(batch)) throw new BadRequestException('免疫库存批次不能重复且不能为空');
      requests.set(batch,{qty:stockQuantity(line.qty),unit:line.unit_code});
    }
    // The same FEFO order locks all requested rows, regardless of the operator's entry order.
    const selected = requests.size ? [...requests.keys()] : preferredBatch ? [preferredBatch] : [];
    const rows = await listVetLots(manager,this.scope(),input.vaccineCode,input.siteCode,input.companyCode,
      todayString(),undefined,true,selected);
    if (selected.length && rows.length !== selected.length) {
      throw new ConflictException('所选批次在本群所属公司、场站及授权药品仓不可用，请核对物料或先办理调拨');
    }
    let remaining = actualQty ?? 0;
    const allocations: VaccineAllocation[] = [];
    for (const row of rows) {
      const req = requests.get(row.batch_no);
      const available = Number(row.qty_available);
      if (!requests.size && !preferredBatch && requestedUnit && row.unit !== requestedUnit) continue;
      const qty = req?.qty ?? Math.min(remaining,available);
      if (qty <= 0) break;
      if (qty > available) throw new ConflictException(`库存批次 ${row.batch_no} 可用量不足`);
      checkStockUnit(row.unit, req?.unit);
      if (allocations.length) checkStockUnit(row.unit, allocations[0].unit);
      allocations.push({batch_no:row.batch_no,qty,unit:row.unit,material_code:row.material_code ?? null,
        expire_date:row.expire_date,inbound_date:row.inbound_date,warehouse_code:row.warehouse_code,
        manufacturer_batch_no:row.manufacturer_batch_no});
      remaining = Math.round((remaining-qty)*1000)/1000;
    }
    if (remaining > 0) throw new ConflictException(`疫苗 ${input.vaccineCode} 可用库存不足，缺少 ${remaining}`);
    return allocations;
  }

  async getLots(materialCode: string, siteCode: string, companyCode: string, warehouseCode?: string) {
    const vaccine = String(materialCode || '').trim();
    const site = String(siteCode ?? '').trim();
    const company = String(companyCode ?? '').trim();
    if (!vaccine || !site || !company) {
      throw new BadRequestException('material_code、site_code、company_code不能为空');
    }
    await assertVetSiteAccess(this.ds,this.scope(),site,company);
    return listVetLots(this.ds, this.scope(), vaccine, site, company, todayString(), warehouseCode, true);
  }

  async execute(id: number, input: { material_code?: string; actual_qty?: number | string; qty_unit?: string; actual_heads?: number | string; dose_value?: number | string; inventory_batch_no?: string; vaccine_batch_no?: string; issue_lines?: ImmuneIssueLineInput[] } = {}, operator: string) {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) throw new BadRequestException('免疫计划 id 无效');
    const safeOperator = String(operator ?? '').trim() || 'unknown';
    return this.ds.transaction(async manager => {
      const [identity]=await manager.query('SELECT flock_no FROM brd_vaccinations WHERE id=$1',[numericId]);
      const occupancy=identity?await lockManagedActivity(manager,identity.flock_no):null;
      const rows = await manager.query(`SELECT * FROM brd_vaccinations WHERE id = $1 FOR UPDATE`, [numericId]);
      const plan = rows[0];
      if (!plan) throw new NotFoundException('免疫计划不存在');
      if(occupancy)this.assertReadScope(occupancy);else this.assertReadScope(plan);
      if (plan.status === 'EXECUTED' || plan.actual_date) return plan;
      if (plan.status === 'CANCELLED') throw new BadRequestException('已取消的免疫计划不能执行');
      const actualHeads = nonNegativeInteger(input.actual_heads, 'actual_heads');
      if (actualHeads <= 0) throw new BadRequestException('actual_heads必须大于 0');
      if(occupancy) {
        const current={...plan,house_code:occupancy.house_code,farm_code:occupancy.farm_code,site_code:occupancy.site_code,company_code:occupancy.company_code};
        this.assertReadScope(current);
        await validateVetFlock(manager,current,actualHeads);
        // Keep plan's original location; execution location is an immutable separate fact.
        plan.house_code=current.house_code;plan.farm_code=current.farm_code;plan.site_code=current.site_code;plan.company_code=current.company_code;
      } else await validateVetFlock(manager, plan, actualHeads);
      if (plan.material_code && input.material_code && input.material_code!==plan.material_code)
        throw new BadRequestException('执行物料必须与免疫计划一致');
      const vaccine=await resolveVetMaterial(manager,plan.material_code || input.material_code,'VACCINE');
      const vaccineCode=String(vaccine.material_code);
      const doseValue = input.dose_value === undefined || input.dose_value === ''
        ? (plan.dose_value == null ? null : positiveNumber(plan.dose_value, 'dose_value'))
        : positiveNumber(input.dose_value, 'dose_value');

      // vaccine_batch_no is the manufacturer lot recorded for traceability.
      // Inventory allocation must use the ERP inventory batch identity only.
      const requestedBatchNo = String(input.inventory_batch_no ?? plan.inventory_batch_no ?? '').trim() || undefined;
      const actualDate = todayString();
      const allocationInput = {
        vaccineCode,
        siteCode: String(plan.site_code),
        companyCode: String(plan.company_code),
      };
      if (input.issue_lines !== undefined && !Array.isArray(input.issue_lines)) throw new BadRequestException('批次分配格式无效');
      const allocations = Array.isArray(input.issue_lines) && input.issue_lines.length > 0
        ? await this.allocate(manager, allocationInput, input.issue_lines)
        : await this.allocate(manager,allocationInput,[],stockQuantity(input.actual_qty),requestedBatchNo,input.qty_unit);
      for (const line of allocations) checkStockUnit(line.unit, input.qty_unit ?? allocations[0].unit);
      if (input.actual_qty !== undefined && Math.abs(stockQuantity(input.actual_qty) - allocations.reduce((sum,line)=>sum+line.qty,0)) > 1e-7)
        throw new BadRequestException('实际耗用量与批次分配合计不一致');
      const sourceIssueNo = String(plan.source_issue_no ?? '').trim() || generatedKey('VAC-ISSUE');
      const manufacturerBatchNo = String(input.vaccine_batch_no ?? plan.vaccine_batch_no ?? '').trim() || null;
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
        if (updated.length === 0) throw new ConflictException(`疫苗库存批次 ${allocation.batch_no} 可用量不足`);
        const ledgerId = await this.insertLedger(manager, {
          batchNo: allocation.batch_no,
          qty: allocation.qty,
          unit: allocation.unit, materialCode: allocation.material_code,
          companyCode: String(plan.company_code),
          siteCode: String(plan.site_code),
          warehouseCode: allocation.warehouse_code,
          operator: safeOperator,
          refNo: sourceIssueNo,
          note: `免疫计划 ${plan.record_no}`,
          logDate: actualDate,
        });
        await manager.query(
          `INSERT INTO brd_vaccination_issue_lines
             (vaccination_id, inventory_batch_no, vaccine_code, qty, unit_code, inv_ledger_id, manufacturer_batch_no, material_code, created_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())`,
          [numericId, allocation.batch_no, plan.vaccine_code ?? null, allocation.qty, allocation.unit, ledgerId, allocation.manufacturer_batch_no ?? manufacturerBatchNo ?? null, vaccineCode],
        );
      }
      const updatedRows = await manager.query(
        `WITH changed AS (UPDATE brd_vaccinations
            SET actual_date = $1,
                actual_heads = $2,
                dose_value = $3,
                inventory_batch_no = $4,
                vaccine_batch_no = $5,
                source_issue_no = $6,
                executor = $7,
                updated_by = $7,
                material_code = $9, stock_unit = $10, executed_material_name=$11,
                status = 'EXECUTED',
                updated_at = NOW()
          WHERE id = $8 AND status IN ('PLANNED', 'OVERDUE') AND actual_date IS NULL
          RETURNING *) SELECT * FROM changed`,
        [actualDate, actualHeads, doseValue, allocations[0]?.batch_no ?? requestedBatchNo ?? null, manufacturerBatchNo, sourceIssueNo, safeOperator, numericId,vaccineCode,allocations[0].unit,vaccine.material_name],
      );
      if (updatedRows.length === 0) throw new ConflictException('免疫计划已被其他请求执行');
      await recordFlockActivity(manager,'IMMUNE_EXECUTION',numericId,occupancy,actualDate);
      return { ...updatedRows[0], allocated: allocations };
    });
  }

  async cancel(id: number, operator: string) {
    const numericId = Number(id);
    if (!Number.isInteger(numericId) || numericId <= 0) throw new BadRequestException('免疫计划 id 无效');
    const safeOperator = String(operator ?? '').trim() || 'unknown';
    return this.ds.transaction(async manager => {
      const [identity]=await manager.query('SELECT flock_no FROM brd_vaccinations WHERE id=$1',[numericId]);
      const occupancy=identity?await lockManagedActivity(manager,identity.flock_no):null;
      const rows = await manager.query(`SELECT * FROM brd_vaccinations WHERE id = $1 FOR UPDATE`, [numericId]);
      const plan = rows[0];
      if (!plan) throw new NotFoundException('免疫计划不存在');
      if(occupancy)this.assertReadScope(occupancy);else this.assertReadScope(plan);
      if (plan.status === 'CANCELLED') return plan;
      if (plan.status === 'EXECUTED' || plan.actual_date) throw new BadRequestException('已执行的免疫计划不能直接取消');
      const updated = await manager.query(
        `WITH changed AS (UPDATE brd_vaccinations
            SET status = 'CANCELLED', updated_by = $1, updated_at = NOW()
          WHERE id = $2 AND status IN ('PLANNED', 'OVERDUE') AND actual_date IS NULL
          RETURNING *) SELECT * FROM changed`,
        [safeOperator, numericId],
      );
      if (!updated[0]) throw new ConflictException('免疫计划状态已发生变化');
      return updated[0];
    });
  }
}
