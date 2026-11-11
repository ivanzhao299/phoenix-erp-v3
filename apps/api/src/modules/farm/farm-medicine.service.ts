import { BadRequestException, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { DataScopeHelper } from '../org/helpers/data-scope.helper';
import { DataScopeContext } from '../org/services/data-scope.service';

const SOURCE_TYPE = 'FARM_MEDICINE';

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function generatedBatchNo(code: string): string {
  return `MED-${code}-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

function normalizeDate(input: string | null | undefined, label = '日期'): string {
  const value = String(input ?? '').trim();
  if (!value) return todayString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException(`${label}格式必须为 YYYY-MM-DD`);
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new BadRequestException(`${label}不是有效日历日期`);
  }
  return value;
}

type RawMedItem = {
  medication_code?: string;
  medicationCode?: string;
  medicine_code?: string;
  code?: string;
  qty?: number | string;
  quantity?: number | string;
  house_code?: string;
  houseCode?: string;
  warehouse_code?: string;
  warehouseCode?: string;
  company_code?: string;
  companyCode?: string;
  site_code?: string;
  siteCode?: string;
  batch_no?: string;
  batchNo?: string;
  expire_date?: string;
  expireDate?: string;
  note?: string;
};

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<any[]>;
};

type LedgerWrite = {
  batchNo: string;
  changeType: 'MED_INBOUND' | 'MED_OUTBOUND';
  qtyChange: number;
  logDate: string;
  warehouseCode: string;
  companyCode: string;
  storeCode: string;
  operator: string;
  refNo: string;
  note: string;
  houseCode?: string;
};

function normalizeItems(items: unknown): Array<{
  medication_code: string;
  qty: number;
  house_code?: string;
  note?: string;
  warehouse_code?: string;
  company_code?: string;
  site_code?: string;
  batch_no?: string;
  expire_date?: string;
}> {
  if (!Array.isArray(items)) {
    throw new BadRequestException('items 必须为数组');
  }

  const normalized: Array<{
    medication_code: string;
    qty: number;
    house_code?: string;
    note?: string;
    warehouse_code?: string;
    company_code?: string;
    site_code?: string;
    batch_no?: string;
    expire_date?: string;
  }> = [];
  for (const raw of items as RawMedItem[]) {
    if (!raw || typeof raw !== 'object') continue;
    const code = String(raw.medication_code ?? raw.medicationCode ?? raw.medicine_code ?? raw.code ?? '').trim();
    const qty = Number(raw.qty ?? raw.quantity ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    if (!code) throw new BadRequestException('药品编码不能为空');
    normalized.push({
      medication_code: code,
      qty,
      house_code: String(raw.house_code ?? raw.houseCode ?? '').trim() || undefined,
      warehouse_code: String(raw.warehouse_code ?? raw.warehouseCode ?? '').trim() || undefined,
      company_code: String(raw.company_code ?? raw.companyCode ?? '').trim() || undefined,
      site_code: String(raw.site_code ?? raw.siteCode ?? '').trim() || undefined,
      batch_no: String(raw.batch_no ?? raw.batchNo ?? '').trim() || undefined,
      expire_date: String(raw.expire_date ?? raw.expireDate ?? '').trim() || undefined,
      note: raw.note,
    });
  }

  if (normalized.length === 0) {
    throw new BadRequestException('至少提交一条数量大于 0 的药品明细');
  }
  return normalized;
}

export interface MedStockRow {
  medication_code: string;
  medication_name: string;
  dosage:          string;
  qty:             number;
  unit:            string;
}

export interface MedLedgerEntry {
  id:              number;
  log_date:        string;
  change_type:     string;
  medication_code: string;
  medication_name: string;
  qty_change:      number;
  house_code:      string | null;
  note:            string | null;
  operator:        string;
  created_at:      string;
}

@Injectable()
export class FarmMedicineService {
  private invLedgerColumnsPromise: Promise<Set<string>> | null = null;

  constructor(
    @InjectDataSource() private ds: DataSource,
    private readonly scopeHelper: DataScopeHelper,
    @Optional() private readonly cls?: ClsService,
  ) {}

  private scope(): DataScopeContext | undefined {
    return this.cls?.get<DataScopeContext | undefined>('dataScope');
  }

  private assertScopeIdentity(companyCode: string, siteCode: string, warehouseCode: string): void {
    const scope = this.scope();
    if (!scope || scope.isGlobal) return;
    if (scope.allowedCompanyCodes.length === 0 || !scope.allowedCompanyCodes.includes(companyCode)) {
      throw new ForbiddenException('药品库存公司范围不匹配');
    }
    if (scope.allowedSiteCodes.length > 0 && !scope.allowedSiteCodes.includes(siteCode)) {
      throw new ForbiddenException('药品库存场站范围不匹配');
    }
    if (scope.allowedWarehouseCodes.length > 0 && !scope.allowedWarehouseCodes.includes(warehouseCode)) {
      throw new ForbiddenException('药品库存仓库范围不匹配');
    }
  }

  private async resolveInventoryIdentity(
    queryable: Queryable,
    item: ReturnType<typeof normalizeItems>[number],
  ): Promise<{ warehouseCode: string; companyCode: string; siteCode: string }> {
    const scope = this.scope();
    const warehouseCode = item.warehouse_code
      ?? (scope?.allowedWarehouseCodes.length === 1 ? scope.allowedWarehouseCodes[0] : undefined);
    const companyCode = item.company_code
      ?? (scope?.allowedCompanyCodes.length === 1 ? scope.allowedCompanyCodes[0] : undefined);
    const siteCode = item.site_code
      ?? (scope?.allowedSiteCodes.length === 1 ? scope.allowedSiteCodes[0] : undefined);
    if (warehouseCode && companyCode && siteCode) {
      this.assertScopeIdentity(companyCode, siteCode, warehouseCode);
      this.scopeHelper.assertWritableWarehouse(warehouseCode, '药品库存');
      return { warehouseCode, companyCode, siteCode };
    }

    const warehouseParams: unknown[] = [item.medication_code];
    const warehouseScope = scope?.allowedWarehouseCodes.length
      ? ` AND w.warehouse_code = ANY($2)`
      : '';
    if (scope?.allowedWarehouseCodes.length) warehouseParams.push(scope.allowedWarehouseCodes);
    const rows = await queryable.query(
      `SELECT w.warehouse_code, w.company_code, w.site_code
         FROM wms_warehouses w
         JOIN brd_medications m ON (m.store_code = w.site_code OR m.store_code = 'ALL' OR m.store_code IS NULL)
        WHERE m.medication_code = $1
          AND m.status = 'ACTIVE'
          AND w.type = 'MEDICINE'
          AND w.status = 'ACTIVE'${warehouseScope}
        ORDER BY w.warehouse_code`,
      warehouseParams,
    );
    if (rows.length !== 1) {
      throw new BadRequestException('无法唯一确定药品仓、公司和场站，请在请求中明确指定 warehouse_code、company_code、site_code');
    }
    const resolved = {
      warehouseCode: String(rows[0].warehouse_code),
      companyCode: String(rows[0].company_code ?? ''),
      siteCode: String(rows[0].site_code ?? ''),
    };
    if (!resolved.companyCode || !resolved.siteCode) {
      throw new BadRequestException('药品仓缺少公司或场站归属');
    }
    this.assertScopeIdentity(resolved.companyCode, resolved.siteCode, resolved.warehouseCode);
    this.scopeHelper.assertWritableWarehouse(resolved.warehouseCode, '药品库存');
    return resolved;
  }

  private inventoryScope(alias: string, params: unknown[], offset = 0): string {
    const scope = this.scope();
    if (!scope || scope.isGlobal) return '1=1';
    let index = offset;
    const clauses: string[] = [];
    if (scope.allowedCompanyCodes.length === 0) return '1=0';
    params.push(scope.allowedCompanyCodes);
    clauses.push(`${alias}.company_code = ANY($${++index})`);
    if (scope.allowedSiteCodes.length > 0) {
      params.push(scope.allowedSiteCodes);
      clauses.push(`${alias}.store_code = ANY($${++index})`);
    }
    if (scope.allowedWarehouseCodes.length > 0) {
      params.push(scope.allowedWarehouseCodes);
      clauses.push(`${alias}.warehouse_code = ANY($${++index})`);
    }
    return clauses.join(' AND ');
  }

  private getInvLedgerColumns(): Promise<Set<string>> {
    if (!this.invLedgerColumnsPromise) {
      this.invLedgerColumnsPromise = this.ds
        .query<Array<{ column_name: string }>>(
          `SELECT column_name
             FROM information_schema.columns
            WHERE table_schema = current_schema()
              AND table_name = 'inv_ledger'`,
        )
        .then(rows => new Set(rows.map(row => row.column_name)));
    }
    return this.invLedgerColumnsPromise;
  }

  private async insertLedger(queryable: Queryable, columns: Set<string>, entry: LedgerWrite): Promise<void> {
    const insertColumns = ['batch_no', 'change_type', 'qty_change'];
    const values: unknown[] = [entry.batchNo, entry.changeType, entry.qtyChange];
    const addIfPresent = (column: string, value: unknown) => {
      if (!columns.has(column)) return;
      insertColumns.push(column);
      values.push(value);
    };

    addIfPresent('log_date', entry.logDate);
    addIfPresent('warehouse_code', entry.warehouseCode);
    addIfPresent('company_code', entry.companyCode);
    addIfPresent('store_code', entry.storeCode);
    addIfPresent('operator', entry.operator);
    addIfPresent('ref_no', entry.refNo);
    addIfPresent('house_code', entry.houseCode ?? null);
    addIfPresent('note', entry.note);

    const placeholders = insertColumns.map((_, index) => `$${index + 1}`).join(', ');
    await queryable.query(
      `INSERT INTO inv_ledger (${insertColumns.join(', ')}) VALUES (${placeholders})`,
      values,
    );
  }

  /** 药品目录 */
  async getCatalog(): Promise<MedStockRow[]> {
    const medicationParams: unknown[] = [];
    const medicationScope = this.scope();
    const medicationWhere = ["status = 'ACTIVE'"];
    if (medicationScope && !medicationScope.isGlobal && medicationScope.allowedSiteCodes.length > 0) {
      medicationParams.push(medicationScope.allowedSiteCodes);
      medicationWhere.push(`(store_code = ANY($${medicationParams.length}) OR store_code = 'ALL' OR store_code IS NULL)`);
    }
    const meds = await this.ds.query<any[]>(
      `SELECT medication_code, medication_name, dosage FROM brd_medications
       WHERE ${medicationWhere.join(' AND ')} ORDER BY medication_code`,
      medicationParams,
    );
    if (meds.length === 0) return [];

    const stockParams: unknown[] = [];
    const stockScope = this.inventoryScope('b', stockParams);
    const stocks = await this.ds.query<any[]>(
      `SELECT b.product_code, SUM(COALESCE(b.qty_available, b.qty, 0)) AS qty
       FROM inv_batches b
       JOIN wms_warehouses w ON w.warehouse_code = b.warehouse_code
       JOIN brd_medications m ON m.medication_code = b.product_code AND m.status = 'ACTIVE'
       WHERE b.product_code IS NOT NULL
         AND b.status = 'AVAILABLE'
         AND COALESCE(b.qty_available, b.qty, 0) > 0
         AND (b.expire_date IS NULL OR b.expire_date >= CURRENT_DATE)
         AND w.type = 'MEDICINE'
         AND w.status = 'ACTIVE'
         AND ${stockScope}
       GROUP BY b.product_code`,
      stockParams,
    );
    const stockMap = new Map(stocks.map(s => [s.product_code as string, Number(s.qty)]));

    return meds.map(m => ({
      medication_code: m.medication_code,
      medication_name: m.medication_name,
      dosage:          m.dosage ?? '',
      qty:             stockMap.get(m.medication_code) ?? 0,
      unit:            (m.dosage ?? '').match(/[^\d/]+$/)?.[0] ?? '单位',
    }));
  }

  /** 按日期范围查流水 */
  async getLedger(startDate: string, endDate: string): Promise<MedLedgerEntry[]> {
    const ledgerColumns = await this.getInvLedgerColumns();
    const dateExpr = ledgerColumns.has('log_date') ? 'l.log_date::text' : 'l.created_at::date::text';
    const houseExpr = ledgerColumns.has('house_code') ? 'l.house_code' : 'NULL::text';
    const dateFilter = ledgerColumns.has('log_date')
      ? 'l.log_date BETWEEN $1 AND $2'
      : 'l.created_at::date BETWEEN $1::date AND $2::date';
    const params: unknown[] = [normalizeDate(startDate), normalizeDate(endDate)];
    const ledgerScope = this.inventoryScope('b', params, 2);

    return this.ds.query<MedLedgerEntry[]>(
      `SELECT l.id, ${dateExpr} AS log_date, l.change_type,
              b.product_code AS medication_code, m.medication_name,
              l.qty_change, ${houseExpr} AS house_code, l.note, l.operator,
              l.created_at::text
       FROM inv_ledger l
       JOIN inv_batches b ON b.batch_no = l.batch_no
       JOIN brd_medications m ON m.medication_code = b.product_code AND m.status = 'ACTIVE'
       JOIN wms_warehouses w ON w.warehouse_code = b.warehouse_code
       WHERE ${dateFilter}
         AND w.type = 'MEDICINE'
         AND w.status = 'ACTIVE'
         AND b.status = 'AVAILABLE'
         AND (b.expire_date IS NULL OR b.expire_date >= CURRENT_DATE)
         AND ${ledgerScope}
       ORDER BY l.created_at DESC, l.id DESC`,
      params,
    );
  }

  /** 入库（采购/领用入库） */
  async inbound(
    logDate: string,
    items: unknown,
    operator: string,
  ): Promise<void> {
    const safeDate = normalizeDate(logDate);
    const safeItems = normalizeItems(items);
    const ledgerColumns = await this.getInvLedgerColumns();

    await this.ds.transaction(async manager => {
      for (const item of safeItems) {
        const qty = item.qty;
        const expireDate = item.expire_date ? normalizeDate(item.expire_date, 'expire_date') : null;
        const identity = await this.resolveInventoryIdentity(manager, item);
        const bn = item.batch_no ?? generatedBatchNo(item.medication_code);
        const rows = await manager.query(
          `INSERT INTO inv_batches
             (batch_no, product_code, qty, qty_available, warehouse_code, store_code,
              company_code, source_type, source_no, status, inbound_date, expire_date, created_at, updated_at)
           SELECT $1::varchar, $2::varchar, $3::numeric, $3::numeric,
                  $4::varchar, $5::varchar, $6::varchar, $7::varchar,
                  $8::varchar, 'AVAILABLE', $9::date, $10::date, NOW(), NOW()
           WHERE EXISTS (
             SELECT 1
               FROM brd_medications
              WHERE medication_code = $2::varchar
                AND status = 'ACTIVE'
           )
           ON CONFLICT (batch_no) DO UPDATE SET
             qty = COALESCE(inv_batches.qty, 0) + EXCLUDED.qty,
             qty_available = COALESCE(inv_batches.qty_available, inv_batches.qty, 0) + EXCLUDED.qty,
             warehouse_code = EXCLUDED.warehouse_code,
             store_code = EXCLUDED.store_code,
             company_code = EXCLUDED.company_code,
             source_type = EXCLUDED.source_type,
             source_no = EXCLUDED.source_no,
             inbound_date = CASE
               WHEN inv_batches.inbound_date IS NULL THEN EXCLUDED.inbound_date
               WHEN EXCLUDED.inbound_date IS NULL THEN inv_batches.inbound_date
               ELSE LEAST(inv_batches.inbound_date, EXCLUDED.inbound_date)
             END,
             expire_date = EXCLUDED.expire_date,
             status = 'AVAILABLE',
             updated_at = NOW()
           RETURNING batch_no`,
          [
            bn,
            item.medication_code,
            qty,
            identity.warehouseCode,
            identity.siteCode,
            identity.companyCode,
            SOURCE_TYPE,
            'MED_INBOUND',
            safeDate,
            expireDate,
          ],
        );
        if (rows.length === 0) {
          throw new BadRequestException(`药品 ${item.medication_code} 不存在或已停用`);
        }
        await this.insertLedger(manager, ledgerColumns, {
          batchNo: bn,
          changeType: 'MED_INBOUND',
          qtyChange: qty,
          logDate: safeDate,
          warehouseCode: identity.warehouseCode,
          companyCode: identity.companyCode,
          storeCode: identity.siteCode,
          operator,
          refNo: 'MED_INBOUND',
          note: item.note ?? '采购入库',
        });
      }
    });
  }

  /** 出库（用药） */
  async outbound(
    _logDate: string,
    _items: unknown,
    _operator: string,
  ): Promise<void> {
    throw new BadRequestException('治疗用药出库已停用，请通过 /api/farm/medication-records 创建用药记录');
  }
}
