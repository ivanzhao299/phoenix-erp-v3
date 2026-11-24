import { assertStockWarehouse, stockQuantity } from './vet-stock';
import { BadRequestException, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { DataScopeHelper } from '../org/helpers/data-scope.helper';
import { DataScopeContext } from '../org/services/data-scope.service';
import { INV_LEDGER_CHANGE_TYPE } from '../wms/inv-ledger-change-types';
import { writeInvLedger } from '../wms/inventory-ledger.writer';
import { lockTempProductionReferences } from '../wms/temp-production-reversal';

const catalogUnit = "COALESCE(NULLIF(trim(b.unit),''),mat.unit,NULLIF(NULLIF(m.unit_code,'UNIT'),''),NULLIF(m.dosage,''),m.unit_code)";
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
  material_code?:string;
  qty?: number | string;
  quantity?: number | string;
  warehouse_code?: string;
  warehouseCode?: string;
  company_code?: string;
  companyCode?: string;
  site_code?: string;
  siteCode?: string;
  batch_no?: string;
  batchNo?: string;
  expire_date?: string;
  manufacturer_batch_no?: string;
  expireDate?: string;
  note?: string;
};

type Queryable = {
  query: (sql: string, params?: unknown[]) => Promise<any[]>;
};

type LedgerWrite = {
  batchNo: string;
  unit?: string;
  materialCode?: string;
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

interface MedicineInboundItem {
  material_code: string;
  qty: number;
  note?: string;
  warehouse_code?: string;
  company_code?: string;
  site_code?: string;
  batch_no?: string;
  expire_date?: string;
  manufacturer_batch_no?: string;
}

function normalizeItems(items: unknown): MedicineInboundItem[] {
  if (!Array.isArray(items)) throw new BadRequestException('items 必须为数组');
  const normalized: MedicineInboundItem[] = [];
  for (const raw of items as RawMedItem[]) {
    if (!raw || typeof raw !== 'object') continue;
    const code = String(raw.material_code ?? '').trim();
    const qty = Number(raw.qty ?? raw.quantity ?? 0);
    if (!Number.isFinite(qty) || qty <= 0) continue;
    if (!code) throw new BadRequestException('请选择实际库存物料 material_code');
    normalized.push({
      material_code: code,
      qty: stockQuantity(qty),
      warehouse_code: String(raw.warehouse_code ?? raw.warehouseCode ?? '').trim() || undefined,
      company_code: String(raw.company_code ?? raw.companyCode ?? '').trim() || undefined,
      site_code: String(raw.site_code ?? raw.siteCode ?? '').trim() || undefined,
      batch_no: String(raw.batch_no ?? raw.batchNo ?? '').trim() || undefined,
      manufacturer_batch_no:String(raw.manufacturer_batch_no ?? '').trim() || undefined,
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
    assertStockWarehouse(scope, warehouseCode);
    if (scope!.isGlobal) return;
    if (!scope?.allowedCompanyCodes.includes(companyCode)) {
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

    const warehouseParams: unknown[] = [item.material_code];
    const warehouseScope = scope?.allowedWarehouseCodes.length
      ? ` AND w.warehouse_code = ANY($2)`
      : '';
    if (scope?.allowedWarehouseCodes.length) warehouseParams.push(scope.allowedWarehouseCodes);
    const rows = await queryable.query(
      `SELECT w.warehouse_code, w.company_code, w.site_code
         FROM wms_warehouses w
         JOIN mst_materials mat ON mat.material_code=$1
        WHERE mat.material_type='VET_DRUG' AND mat.status='ACTIVE'
          AND w.domain='OPERATIONAL' AND w.type = 'MEDICINE'
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
    if (!scope) return '1=0';
    if (scope.isGlobal) return '1=1';
    if (!scope.allowedWarehouseCodes.length) return '1=0';
    let index = offset;
    const clauses: string[] = [];
    if (scope.allowedCompanyCodes.length === 0) return '1=0';
    params.push(scope.allowedCompanyCodes);
    clauses.push(`COALESCE(${alias}.company_code,w.company_code) = ANY($${++index})`);
    if (scope.allowedSiteCodes.length > 0) {
      params.push(scope.allowedSiteCodes);
      clauses.push(`COALESCE(NULLIF(${alias}.store_code,'ALL'),w.site_code) = ANY($${++index}) AND (w.site_code IS NULL OR w.site_code = ANY($${index}))`);
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

  /**
   * 写药品流水（INV-301a：改调共享写入器，替换 information_schema 动态列
   * 拼接写法；列集合 = 旧动态写法的全量列。house_code 不在迁移链内、部分
   * 环境缺列，writer 仅在有值时写入（旧门控无值时同样不产生该列）。
   * 读侧 getLedger 的列门控保留，不受影响。
   */
  private async insertLedger(queryable: Queryable, entry: LedgerWrite): Promise<void> {
    await writeInvLedger(queryable, {
      batchNo: entry.batchNo,
      changeType: entry.changeType,
      unit: entry.unit, materialCode: entry.materialCode,
      qtyChange: entry.qtyChange,
      operator: entry.operator,
      storeCode: entry.storeCode,
      refNo: entry.refNo,
      note: entry.note,
      logDate: entry.logDate,
      warehouseCode: entry.warehouseCode,
      companyCode: entry.companyCode,
      houseCode: entry.houseCode ?? null,
    });
  }

  async inboundWarehouses() {
    const scope = this.scope();
    if (!scope || (!scope.isGlobal && !scope.allowedWarehouseCodes.length)) return [];
    const args: unknown[] = [];
    const where = ["w.domain='OPERATIONAL'","w.type='MEDICINE'","w.status='ACTIVE'","NULLIF(w.company_code,'') IS NOT NULL","NULLIF(w.site_code,'') IS NOT NULL"];
    if (!scope.isGlobal) {
      where.push(`w.warehouse_code=ANY($${args.push(scope.allowedWarehouseCodes)})`);
      where.push(`w.company_code=ANY($${args.push(scope.allowedCompanyCodes)})`);
      if (scope.allowedSiteCodes.length) where.push(`w.site_code=ANY($${args.push(scope.allowedSiteCodes)})`);
    }
    return this.ds.query(`SELECT w.warehouse_code,w.site_code,w.company_code FROM wms_warehouses w
      WHERE ${where.join(' AND ')} ORDER BY w.site_code,w.warehouse_code`,args);
  }

  /** 药品目录 */
  async getCatalog(): Promise<MedStockRow[]> {
    const context = this.scope();
    if (!context) return [];
    const medicationParams: unknown[] = [];
    const legacyScope = !context.isGlobal && context.allowedSiteCodes.length
      ? `AND (m.store_code = ANY($${medicationParams.push(context.allowedSiteCodes)}) OR m.store_code='ALL' OR m.store_code IS NULL)` : '';
    const historyScope = this.inventoryScope('historical',medicationParams,medicationParams.length);
    const meds = await this.ds.query<any[]>(`
      SELECT mat.material_code,mat.material_code AS medication_code,mat.material_name AS medication_name,mat.spec AS dosage,mat.unit
      FROM mst_materials mat WHERE mat.status='ACTIVE' AND mat.material_type='VET_DRUG'
      UNION ALL
      SELECT NULL,m.medication_code,m.medication_name,m.dosage,COALESCE(NULLIF(NULLIF(m.unit_code,'UNIT'),''),NULLIF(m.dosage,''),m.unit_code)
      FROM brd_medications m WHERE m.status='ACTIVE' ${legacyScope} AND EXISTS (SELECT 1 FROM inv_batches historical JOIN wms_warehouses w ON w.warehouse_code=historical.warehouse_code WHERE ${historyScope} AND w.domain='OPERATIONAL' AND w.type='MEDICINE' AND historical.product_code=m.medication_code AND historical.material_code IS NULL AND historical.item_type IS NULL AND historical.sku_code IS NULL)
      ORDER BY medication_name,medication_code`,medicationParams);
    if (meds.length === 0) return [];

    const stockParams: unknown[] = [];
    const stockScope = this.inventoryScope('b', stockParams);
    const stocks = await this.ds.query<any[]>(
      `SELECT COALESCE(mat.material_code,m.medication_code) AS medication_code,mat.material_code,${catalogUnit} AS unit,
              SUM(LEAST(b.qty,COALESCE(b.qty_available,b.qty,0))) AS qty
       FROM inv_batches b
       LEFT JOIN brd_medications m ON m.medication_code=b.product_code AND b.material_code IS NULL AND b.item_type IS NULL AND b.sku_code IS NULL
       LEFT JOIN mst_materials mat ON mat.material_type='VET_DRUG' AND
         (b.item_type='MATERIAL' AND b.sku_code IS NULL AND mat.material_code=b.material_code)
       JOIN wms_warehouses w ON w.warehouse_code = b.warehouse_code
       WHERE (mat.status='ACTIVE' OR (mat.material_code IS NULL AND m.status='ACTIVE'))
         AND b.status = 'AVAILABLE'
         AND COALESCE(b.qty_available, b.qty, 0) > 0
         AND (b.expire_date IS NULL OR b.expire_date >= CURRENT_DATE)
         AND w.domain='OPERATIONAL' AND w.type = 'MEDICINE'
         AND w.status = 'ACTIVE'
         AND (w.company_code=b.company_code OR w.company_code IS NULL OR b.company_code IS NULL)
         AND (w.site_code=b.store_code OR w.site_code IS NULL OR b.store_code IS NULL OR b.store_code='ALL')
         AND ${stockScope}
       GROUP BY mat.material_code,COALESCE(mat.material_code,m.medication_code), ${catalogUnit}`,
      stockParams,
    );
    return meds.map(m => {
      const balances = stocks.filter(row => row.medication_code === m.medication_code && row.material_code===m.material_code);
      return {
        material_code:m.material_code, medication_code: m.medication_code, medication_name: m.medication_name, dosage: m.dosage ?? '',
        qty: Number(balances.find(row => row.unit === m.unit)?.qty ?? 0), unit: m.unit,
        other_units: balances.filter(row => row.unit !== m.unit).map(row => ({qty:Number(row.qty), unit:row.unit})),
      };
    });
  }

  /** 按日期范围查流水 */
  async getLedger(startDate: string, endDate: string): Promise<MedLedgerEntry[]> {
    const ledgerColumns = await this.getInvLedgerColumns();
    const dateExpr = ledgerColumns.has('log_date') ? 'COALESCE(l.log_date,l.created_at::date)' : 'l.created_at::date';
    const houseExpr = ledgerColumns.has('house_code') ? 'l.house_code' : 'NULL::text';
    const dateFilter = `${dateExpr} BETWEEN $1::date AND $2::date`;
    const params: unknown[] = [normalizeDate(startDate), normalizeDate(endDate)];
    const ledgerScope = this.inventoryScope('b', params, 2);

    return this.ds.query<MedLedgerEntry[]>(
      `SELECT l.id, ${dateExpr}::text AS log_date, l.change_type,
              COALESCE(mat.material_code,m.medication_code) AS medication_code,
              COALESCE(mat.material_name,m.medication_name,b.product_code) AS medication_name, COALESCE(l.unit,${catalogUnit}) AS unit,
              l.qty_change, ${houseExpr} AS house_code, l.note, l.operator,
              l.created_at::text
       FROM inv_ledger l
       JOIN inv_batches b ON b.batch_no = l.batch_no
       LEFT JOIN mst_materials mat ON mat.material_code=COALESCE(l.material_code,b.material_code) AND mat.material_type='VET_DRUG'
       LEFT JOIN brd_medications m ON m.medication_code=b.product_code AND b.material_code IS NULL AND b.item_type IS NULL AND b.sku_code IS NULL
       JOIN wms_warehouses w ON w.warehouse_code = b.warehouse_code
       WHERE (mat.material_code IS NOT NULL OR m.medication_code IS NOT NULL) AND ${dateFilter}
         AND w.domain='OPERATIONAL' AND w.type = 'MEDICINE'
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

    await this.ds.transaction(async manager => {
      // No quantity-pool acquisition follows this medicine-only path.
      await lockTempProductionReferences(manager, safeItems.map(item => item.batch_no));
      for (const item of safeItems) {
        const qty = item.qty;
        const expireDate = item.expire_date ? normalizeDate(item.expire_date, 'expire_date') : null;
        const identity = await this.resolveInventoryIdentity(manager, item);
        const bn = item.batch_no ?? generatedBatchNo(item.material_code);
        const rows = await manager.query(
          `INSERT INTO inv_batches
             (batch_no, product_code, material_code, item_type, material_type, unit, qty, qty_available,
              warehouse_code, store_code, company_code, source_type, source_no, status, inbound_date, expire_date,manufacturer_batch_no)
           SELECT $1::varchar, NULL, mat.material_code,'MATERIAL',mat.material_type,mat.unit,
                  $3::numeric,$3::numeric,$4::varchar,$5::varchar,$6::varchar,$7::varchar,$8::varchar,
                  'AVAILABLE',$9::date,$10::date,$11::varchar
             FROM mst_materials mat
             JOIN wms_warehouses w ON w.warehouse_code=$4 AND w.domain='OPERATIONAL' AND w.type='MEDICINE' AND w.status='ACTIVE'
            WHERE mat.material_code=$2 AND mat.material_type='VET_DRUG'
              AND mat.status='ACTIVE' AND NULLIF(trim(mat.unit),'') IS NOT NULL
              AND w.site_code=$5 AND w.company_code=$6 FOR SHARE OF w,mat
           ON CONFLICT (batch_no) DO UPDATE SET
             qty = COALESCE(inv_batches.qty, 0) + EXCLUDED.qty,
             qty_available = COALESCE(inv_batches.qty_available, inv_batches.qty, 0) + EXCLUDED.qty,
             updated_at = NOW()
           WHERE inv_batches.warehouse_code = EXCLUDED.warehouse_code
             AND inv_batches.company_code = EXCLUDED.company_code AND inv_batches.store_code = EXCLUDED.store_code
             AND inv_batches.product_code IS NOT DISTINCT FROM EXCLUDED.product_code
             AND inv_batches.material_code IS NOT DISTINCT FROM EXCLUDED.material_code
             AND inv_batches.item_type IS NOT DISTINCT FROM EXCLUDED.item_type AND inv_batches.sku_code IS NULL
             AND inv_batches.unit IS NOT DISTINCT FROM EXCLUDED.unit AND inv_batches.status='AVAILABLE'
             AND inv_batches.inbound_date IS NOT DISTINCT FROM EXCLUDED.inbound_date
             AND inv_batches.manufacturer_batch_no IS NOT DISTINCT FROM EXCLUDED.manufacturer_batch_no
             AND inv_batches.expire_date IS NOT DISTINCT FROM EXCLUDED.expire_date
           RETURNING batch_no,material_code,unit`,
          [
            bn,
            item.material_code,
            qty,
            identity.warehouseCode,
            identity.siteCode,
            identity.companyCode,
            SOURCE_TYPE,
            'MED_INBOUND',
            safeDate,
            expireDate,item.manufacturer_batch_no ?? null,
          ],
        );
        if (rows.length === 0) {
          throw new BadRequestException(`药品 ${item.material_code} 、物料、药品仓或现有批次的身份/单位不匹配`);
        }
        await this.insertLedger(manager, {
          batchNo: bn,
          unit: rows[0].unit, materialCode: rows[0].material_code,
          changeType: INV_LEDGER_CHANGE_TYPE.MED_INBOUND,
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
