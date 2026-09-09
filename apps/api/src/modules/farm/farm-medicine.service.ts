import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { DataScopeHelper } from '../org/helpers/data-scope.helper';

const WAREHOUSE = 'LPH_MS_MEDICINE';
const LEGACY_WAREHOUSE = 'MEDICINE';
const WAREHOUSE_CODES = [WAREHOUSE, LEGACY_WAREHOUSE];
const COMPANY_CODE = 'COMP-LAO-AGRI';
const STORE_CODE = 'SITE-MENGSAI-LAYER';
const SOURCE_TYPE = 'FARM_MEDICINE';

function batchNo(code: string): string {
  return `MED-STOCK-${code}`;
}

function todayString(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function normalizeDate(input: string | null | undefined): string {
  const value = String(input ?? '').trim();
  if (!value) return todayString();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new BadRequestException('日期格式必须为 YYYY-MM-DD');
  }
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month - 1 ||
    parsed.getUTCDate() !== day
  ) {
    throw new BadRequestException('日期不是有效日历日期');
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

function normalizeItems(items: unknown): Array<{ medication_code: string; qty: number; house_code?: string; note?: string }> {
  if (!Array.isArray(items)) {
    throw new BadRequestException('items 必须为数组');
  }

  const normalized: Array<{ medication_code: string; qty: number; house_code?: string; note?: string }> = [];
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
  ) {}

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
    const meds = await this.ds.query<any[]>(
      `SELECT medication_code, medication_name, dosage FROM brd_medications
       WHERE status = 'ACTIVE' ORDER BY medication_code`,
    );
    if (meds.length === 0) return [];

    const stocks = await this.ds.query<any[]>(
      `SELECT product_code, SUM(COALESCE(qty_available, qty, 0)) AS qty
       FROM inv_batches
       WHERE warehouse_code = ANY($1)
         AND product_code IS NOT NULL
       GROUP BY product_code`,
      [WAREHOUSE_CODES],
    );
    const stockMap = new Map(stocks.map(s => [s.product_code as string, Number(s.qty)]));

    return meds.map(m => ({
      medication_code: m.medication_code,
      medication_name: m.medication_name,
      dosage:          m.dosage ?? '',
      qty:             stockMap.get(m.medication_code) ?? 0,
      unit:            (m.dosage ?? '').match(/[^\d\/]+$/)?.[0] ?? '单位',
    }));
  }

  /** 按日期范围查流水 */
  async getLedger(startDate: string, endDate: string): Promise<MedLedgerEntry[]> {
    const ledgerColumns = await this.getInvLedgerColumns();
    const dateExpr = ledgerColumns.has('log_date') ? 'l.log_date::text' : 'l.created_at::date::text';
    const dateFilter = ledgerColumns.has('log_date')
      ? 'l.log_date BETWEEN $2 AND $3'
      : 'l.created_at::date BETWEEN $2::date AND $3::date';

    return this.ds.query<MedLedgerEntry[]>(
      `SELECT l.id, ${dateExpr} AS log_date, l.change_type,
              b.product_code AS medication_code, m.medication_name,
              l.qty_change, NULL::text AS house_code, l.note, l.operator,
              l.created_at::text
       FROM inv_ledger l
       JOIN inv_batches b ON b.batch_no = l.batch_no
       LEFT JOIN brd_medications m ON m.medication_code = b.product_code
       WHERE b.warehouse_code = ANY($1)
         AND ${dateFilter}
       ORDER BY l.created_at DESC, l.id DESC`,
      [WAREHOUSE_CODES, normalizeDate(startDate), normalizeDate(endDate)],
    );
  }

  /** 入库（采购/领用入库） */
  async inbound(
    logDate: string,
    items: unknown,
    operator: string,
  ): Promise<void> {
    this.scopeHelper.assertWritableWarehouse(WAREHOUSE, '药品库存');
    const safeDate = normalizeDate(logDate);
    const safeItems = normalizeItems(items);
    const ledgerColumns = await this.getInvLedgerColumns();

    await this.ds.transaction(async manager => {
      for (const item of safeItems) {
        const qty = item.qty;
        const bn = batchNo(item.medication_code);
        const rows = await manager.query(
          `INSERT INTO inv_batches
             (batch_no, product_code, qty, qty_available, warehouse_code, store_code,
              company_code, source_type, source_no, status, inbound_date, created_at, updated_at)
           SELECT $1::varchar, $2::varchar, $3::numeric, $3::numeric,
                  $4::varchar, $5::varchar, $6::varchar, $7::varchar,
                  $8::varchar, 'AVAILABLE', $9::date, NOW(), NOW()
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
             status = 'AVAILABLE',
             updated_at = NOW()
           RETURNING batch_no`,
          [bn, item.medication_code, qty, WAREHOUSE, STORE_CODE, COMPANY_CODE, SOURCE_TYPE, 'MED_INBOUND', safeDate],
        );
        if (rows.length === 0) {
          throw new BadRequestException(`药品 ${item.medication_code} 不存在或已停用`);
        }
        await this.insertLedger(manager, ledgerColumns, {
          batchNo: bn,
          changeType: 'MED_INBOUND',
          qtyChange: qty,
          logDate: safeDate,
          warehouseCode: WAREHOUSE,
          companyCode: COMPANY_CODE,
          storeCode: STORE_CODE,
          operator,
          refNo: 'MED_INBOUND',
          note: item.note ?? '采购入库',
        });
      }
    });
  }

  /** 出库（用药） */
  async outbound(
    logDate: string,
    items: unknown,
    operator: string,
  ): Promise<void> {
    this.scopeHelper.assertWritableWarehouse(WAREHOUSE, '药品库存');
    const safeDate = normalizeDate(logDate);
    const safeItems = normalizeItems(items);
    const ledgerColumns = await this.getInvLedgerColumns();

    await this.ds.transaction(async manager => {
      for (const item of safeItems) {
        const qty = item.qty;
        const bn = batchNo(item.medication_code);
        const rows = await manager.query(
          `UPDATE inv_batches
           SET qty = GREATEST(0, qty - $1),
               qty_available = GREATEST(0, COALESCE(qty_available, qty, 0) - $1),
               updated_at = NOW()
           WHERE batch_no = $2
           RETURNING batch_no`,
          [qty, bn],
        );
        if (rows.length === 0) {
          throw new BadRequestException(`药品 ${item.medication_code} 库存不存在，请先入库`);
        }
        await this.insertLedger(manager, ledgerColumns, {
          batchNo: bn,
          changeType: 'MED_OUTBOUND',
          qtyChange: -qty,
          logDate: safeDate,
          warehouseCode: WAREHOUSE,
          companyCode: COMPANY_CODE,
          storeCode: STORE_CODE,
          operator,
          refNo: 'MED_OUTBOUND',
          houseCode: item.house_code,
          note: item.note ?? (item.house_code ? `用药出库 house=${item.house_code}` : '用药出库'),
        });
      }
    });
  }
}
