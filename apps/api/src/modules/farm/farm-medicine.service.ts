import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

const WAREHOUSE = 'MEDICINE';

function batchNo(code: string): string {
  return `MED-STOCK-${code}`;
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
  constructor(@InjectDataSource() private ds: DataSource) {}

  /** 药品目录 */
  async getCatalog(): Promise<MedStockRow[]> {
    const meds = await this.ds.query<any[]>(
      `SELECT medication_code, medication_name, dosage FROM brd_medications
       WHERE status = 'ACTIVE' ORDER BY medication_code`,
    );
    if (meds.length === 0) return [];

    // 确保每个药品都有 inv_batches 行
    for (const m of meds) {
      await this.ds.query(
        `INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, warehouse_code, status)
         VALUES ($1, $2, 0, 0, $3, 'AVAILABLE')
         ON CONFLICT (batch_no) DO NOTHING`,
        [batchNo(m.medication_code), m.medication_code, WAREHOUSE],
      );
    }

    const stocks = await this.ds.query<any[]>(
      `SELECT product_code, COALESCE(qty_available, qty, 0) AS qty
       FROM inv_batches WHERE warehouse_code = $1`,
      [WAREHOUSE],
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
    return this.ds.query<MedLedgerEntry[]>(
      `SELECT l.id, l.log_date::text, l.change_type,
              b.product_code AS medication_code, m.medication_name,
              l.qty_change, l.house_code, l.note, l.operator,
              l.created_at::text
       FROM inv_ledger l
       JOIN inv_batches b ON b.batch_no = l.batch_no
       LEFT JOIN brd_medications m ON m.medication_code = b.product_code
       WHERE b.warehouse_code = $1
         AND l.log_date BETWEEN $2 AND $3
       ORDER BY l.created_at DESC`,
      [WAREHOUSE, startDate, endDate],
    );
  }

  /** 入库（采购/领用入库） */
  async inbound(
    logDate: string,
    items: Array<{ medication_code: string; qty: number; note?: string }>,
    operator: string,
  ): Promise<void> {
    for (const item of items) {
      if (!item.qty || item.qty <= 0) continue;
      const bn = batchNo(item.medication_code);
      await this.ds.query(
        `UPDATE inv_batches
         SET qty = qty + $1, qty_available = COALESCE(qty_available, qty, 0) + $1, updated_at = NOW()
         WHERE batch_no = $2`,
        [item.qty, bn],
      );
      await this.ds.query(
        `INSERT INTO inv_ledger
           (batch_no, change_type, qty_change, log_date, warehouse_code, operator, note)
         VALUES ($1, 'MED_INBOUND', $2, $3, $4, $5, $6)`,
        [bn, item.qty, logDate, WAREHOUSE, operator, item.note ?? '采购入库'],
      );
    }
  }

  /** 出库（用药） */
  async outbound(
    logDate: string,
    items: Array<{ medication_code: string; qty: number; house_code?: string; note?: string }>,
    operator: string,
  ): Promise<void> {
    for (const item of items) {
      if (!item.qty || item.qty <= 0) continue;
      const bn = batchNo(item.medication_code);
      await this.ds.query(
        `UPDATE inv_batches
         SET qty = GREATEST(0, qty - $1),
             qty_available = GREATEST(0, COALESCE(qty_available, qty, 0) - $1),
             updated_at = NOW()
         WHERE batch_no = $2`,
        [item.qty, bn],
      );
      await this.ds.query(
        `INSERT INTO inv_ledger
           (batch_no, change_type, qty_change, log_date, warehouse_code, house_code, operator, note)
         VALUES ($1, 'MED_OUTBOUND', $2, $3, $4, $5, $6, $7)`,
        [bn, -item.qty, logDate, WAREHOUSE, item.house_code ?? null, operator, item.note ?? '用药出库'],
      );
    }
  }
}
