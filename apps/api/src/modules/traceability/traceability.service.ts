import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * TraceabilityService — 统一追溯 Runtime（R5）
 * ════════════════════════════════════════════════════════════════════════
 * 依据：docs/production-runtime-rebuild-phase-r5-traceability-runtime.md
 *
 * 唯一追溯链（正向 + 反向）：
 *   鸡舍 brd_houses → 鸡群 brd_flocks → 生产 brd_daily_logs → 集蛋 pkg_source_batches
 *     → 分级 pkg_grading_records → 包装 pkg_packing_records → 库存 inv_batches / inv_ledger
 *       → 销售 sal_sales_orders / sal_store_sales → 客户/门店 → 财务 fin_ar_invoices / fin_cash_*
 *
 * 设计：防御式查询（每段 try/catch，缺表/缺列不崩，返回空段），统一返回追溯树。
 * 入口：batch / packaging / label / sales-order / customer。
 */
@Injectable()
export class TraceabilityService {
  private readonly logger = new Logger(TraceabilityService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** 防御式查询：异常返回 [] */
  private async q<T = any>(sql: string, args: unknown[] = []): Promise<T[]> {
    try { return await this.ds.query(sql, args); } catch (e: any) {
      this.logger.warn(`[Trace] query skipped: ${e?.message}`);
      return [];
    }
  }

  // ── 入口 1：按库存批次（EGG-YYYYMMDD-NNNNN）──────────────────────────────────
  async traceByBatch(batchNo: string, companyScope?: string[]): Promise<any> {
    const [batch] = await this.q(
      `SELECT batch_no, product_code, sku_code, grade_code_std, quality_grade, spec_code, packaging_spec,
              qty, qty_available, egg_date, expire_date, company_code, source_type, source_no,
              packaging_batch_ref, collection_batch_ref, status, created_at
         FROM inv_batches WHERE batch_no = $1 LIMIT 1`,
      [batchNo],
    );
    if (!batch) return { found: false, entry: 'batch', key: batchNo };
    if (companyScope && companyScope.length && !companyScope.includes(batch.company_code)) {
      return { found: false, denied: true, reason: '无权查看该公司数据', entry: 'batch', key: batchNo };
    }
    return this.assembleTree(batch);
  }

  // ── 入口 2：按包装批次（PKG-YYYYMMDD-XXXX）──────────────────────────────────
  async traceByPackaging(packingCode: string, companyScope?: string[]): Promise<any> {
    const batches = await this.q(
      `SELECT batch_no FROM inv_batches WHERE packaging_batch_ref = $1 ORDER BY batch_no`,
      [packingCode],
    );
    const traces = [];
    for (const b of batches) traces.push(await this.traceByBatch(b.batch_no, companyScope));
    const [pkg] = await this.q(
      `SELECT code, production_date, total_boxes, total_eggs, shift_id FROM pkg_packing_records WHERE code = $1 LIMIT 1`,
      [packingCode],
    );
    return { found: !!pkg || traces.length > 0, entry: 'packaging', key: packingCode, packaging: pkg ?? null, traces };
  }

  // ── 入口 3：按标签/箱码（label_no）──────────────────────────────────────────
  async traceByLabel(labelCode: string, companyScope?: string[]): Promise<any> {
    const [lbl] = await this.q(
      `SELECT label_no, batch_no, product_code, qty, status, printed_at FROM lbl_records WHERE label_no = $1 LIMIT 1`,
      [labelCode],
    );
    if (!lbl) return { found: false, entry: 'label', key: labelCode };
    const tree = lbl.batch_no ? await this.traceByBatch(lbl.batch_no, companyScope) : { found: false };
    return { found: true, entry: 'label', key: labelCode, label: lbl, trace: tree };
  }

  // ── 入口 4：按销售订单（order_no）──────────────────────────────────────────
  async traceBySalesOrder(orderNo: string, companyScope?: string[]): Promise<any> {
    const [order] = await this.q(
      `SELECT id, order_no, customer_code, customer_name, company_code, status, total_amount,
              delivered_at, received_at, ar_invoice_id
         FROM sal_sales_orders WHERE order_no = $1 LIMIT 1`,
      [orderNo],
    );
    if (!order) return { found: false, entry: 'sales-order', key: orderNo };
    if (companyScope && companyScope.length && !companyScope.includes(order.company_code)) {
      return { found: false, denied: true, reason: '无权查看该公司数据', entry: 'sales-order', key: orderNo };
    }
    const items = await this.q(
      `SELECT product_code, grade_code, sku_code, qty, allocated_batch_no, allocated_qty
         FROM sal_order_items WHERE sales_order_id = $1`,
      [order.id],
    );
    // 反向追溯：allocated_batch_no 可能是逗号分隔多批次
    const batchNos = new Set<string>();
    for (const it of items) {
      (it.allocated_batch_no ? String(it.allocated_batch_no).split(',') : [])
        .map(s => s.trim()).filter(Boolean).forEach(b => batchNos.add(b));
    }
    const traces = [];
    for (const b of batchNos) traces.push(await this.traceByBatch(b, companyScope));
    return { found: true, entry: 'sales-order', key: orderNo, order, items, traces };
  }

  // ── 入口 5：按客户（customer_code）→ 历史购买批次 ──────────────────────────
  async traceByCustomer(customerCode: string, companyScope?: string[]): Promise<any> {
    const orders = await this.q(
      `SELECT order_no, company_code, status, total_amount, created_at
         FROM sal_sales_orders WHERE customer_code = $1
         ${companyScope && companyScope.length ? 'AND company_code = ANY($2)' : ''}
         ORDER BY created_at DESC LIMIT 50`,
      companyScope && companyScope.length ? [customerCode, companyScope] : [customerCode],
    );
    // 历史购买批次（按门店 POS）
    const storeBatches = await this.q(
      `SELECT DISTINCT i.batch_no, i.product_code, i.grade_code, i.sku_code, s.sale_no, s.completed_at
         FROM sal_store_sale_items i JOIN sal_store_sales s ON s.id = i.sale_id
        WHERE s.customer_code = $1 AND i.batch_no IS NOT NULL
        ORDER BY s.completed_at DESC LIMIT 50`,
      [customerCode],
    );
    return { found: orders.length > 0 || storeBatches.length > 0, entry: 'customer', key: customerCode, orders, storeBatches };
  }

  // ── 核心：从库存批次组装完整追溯树 ─────────────────────────────────────────
  private async assembleTree(batch: any): Promise<any> {
    const packingCode = batch.packaging_batch_ref as string | null;

    // 包装段
    let packaging: any = null;
    let shiftId: number | null = null;
    if (packingCode) {
      const [pkg] = await this.q(
        `SELECT code, production_date, grading_code, grading_codes_json, batches_json,
                total_boxes, total_eggs, shift_id
           FROM pkg_packing_records WHERE code = $1 LIMIT 1`,
        [packingCode],
      );
      packaging = pkg ?? null;
      shiftId = pkg?.shift_id ?? null;
    }

    // 班次/场站/产线/人员
    let shift: any = null;
    if (shiftId) {
      const [ws] = await this.q(
        `SELECT id, shift_code, site_id, line_id, operator_name, supervisor_name, production_date
           FROM pkg_work_shifts WHERE id = $1 LIMIT 1`,
        [shiftId],
      );
      shift = ws ?? null;
    }

    // 分级段（按生产日期）
    const grading = packaging?.production_date
      ? await this.q(
          `SELECT code, source_batch_code, production_date, outputs_json, total_output
             FROM pkg_grading_records WHERE production_date = $1 ORDER BY created_at ASC LIMIT 20`,
          [packaging.production_date],
        )
      : [];

    // 集蛋/原蛋来源 + 鸡舍
    const source = packaging?.production_date
      ? await this.q(
          `SELECT batch_code, house_code, flock_code, lay_date, production_date, received_qty
             FROM pkg_source_batches WHERE production_date = $1 ORDER BY created_at ASC LIMIT 20`,
          [packaging.production_date],
        )
      : [];

    // 生产域：鸡舍 → 场站；鸡群；日产蛋
    const houseCodes = [...new Set(source.map((s: any) => s.house_code).filter(Boolean))];
    let houses: any[] = [], flocks: any[] = [], dailyLogs: any[] = [];
    if (houseCodes.length) {
      houses = await this.q(
        `SELECT h.house_code, h.farm_code, f.farm_name
           FROM brd_houses h LEFT JOIN brd_farms f ON f.farm_code = h.farm_code
          WHERE h.house_code = ANY($1)`,
        [houseCodes],
      );
      flocks = await this.q(
        `SELECT flock_no, house_code, farm_code, current_qty, breed_type
           FROM brd_flocks WHERE house_code = ANY($1) LIMIT 20`,
        [houseCodes],
      );
      if (packaging?.production_date) {
        dailyLogs = await this.q(
          `SELECT house_code, flock_no, log_date, eggs_produced
             FROM brd_daily_logs WHERE house_code = ANY($1) AND log_date = $2 LIMIT 20`,
          [houseCodes, packaging.production_date],
        );
      }
    }

    // 标签
    const labels = await this.q(
      `SELECT label_no, batch_no, qty, status, printed_at FROM lbl_records WHERE batch_no = $1 ORDER BY printed_at DESC LIMIT 50`,
      [batch.batch_no],
    );

    // 库存流水（时间线）
    const ledger = await this.q(
      `SELECT change_type, qty_change, ref_no, operator, sku_code, note, created_at
         FROM inv_ledger WHERE batch_no = $1 ORDER BY created_at ASC LIMIT 100`,
      [batch.batch_no],
    );

    // 销售去向：销售订单（allocated_batch_no 含本批次）
    const salesOrders = await this.q(
      `SELECT DISTINCT o.order_no, o.customer_code, o.customer_name, o.company_code, o.status,
              o.delivered_at, o.received_at, o.ar_invoice_id, i.allocated_qty
         FROM sal_order_items i JOIN sal_sales_orders o ON o.id = i.sales_order_id
        WHERE i.allocated_batch_no LIKE $1
        ORDER BY o.order_no DESC LIMIT 50`,
      [`%${batch.batch_no}%`],
    );
    // 门店 POS 去向
    const storeSales = await this.q(
      `SELECT DISTINCT s.sale_no, s.store_code, s.customer_code, s.company_code, s.total_amount,
              s.payment_method, s.ar_invoice_id, s.cash_account_id, s.completed_at, i.qty
         FROM sal_store_sale_items i JOIN sal_store_sales s ON s.id = i.sale_id
        WHERE i.batch_no = $1 ORDER BY s.completed_at DESC LIMIT 50`,
      [batch.batch_no],
    );

    // 财务：AR + 现金（按销售单/门店单 source_no）
    const sourceNos = [
      ...salesOrders.map((o: any) => o.order_no),
      ...storeSales.map((s: any) => s.sale_no),
    ].filter(Boolean);
    let ar: any[] = [], cash: any[] = [];
    if (sourceNos.length) {
      ar = await this.q(
        `SELECT source_type, source_no, amount_original, balance_amount_original, status, collection_status
           FROM fin_ar_invoices WHERE source_no = ANY($1) LIMIT 50`,
        [sourceNos],
      );
      cash = await this.q(
        `SELECT txn_no, direction, amount, source_type, source_no, created_at
           FROM fin_cash_transactions WHERE source_no = ANY($1) LIMIT 50`,
        [sourceNos],
      );
    }

    // 退货：RET-/inv_ledger SALE_RETURN
    const returns = await this.q(
      `SELECT change_type, qty_change, ref_no, note, created_at
         FROM inv_ledger WHERE batch_no = $1 AND change_type IN ('SALE_RETURN','DAMAGE_WRITEOFF') ORDER BY created_at DESC LIMIT 50`,
      [batch.batch_no],
    );

    return {
      found: true,
      entry: 'batch',
      key: batch.batch_no,
      production: { site: shift?.site_id ?? null, line: shift?.line_id ?? null, houses, flocks, dailyLogs, source, productionDate: packaging?.production_date ?? batch.egg_date },
      packaging: packaging ? {
        packingCode, gradingCode: packaging.grading_code, grading,
        totalBoxes: packaging.total_boxes, totalEggs: packaging.total_eggs,
        operator: shift?.operator_name ?? null, supervisor: shift?.supervisor_name ?? null,
        shiftCode: shift?.shift_code ?? null,
      } : null,
      label: { count: labels.length, records: labels },
      inventory: {
        batchNo: batch.batch_no, productCode: batch.product_code, skuCode: batch.sku_code,
        grade: batch.grade_code_std ?? batch.quality_grade, specCode: batch.spec_code,
        qty: batch.qty, qtyAvailable: batch.qty_available,
        eggDate: batch.egg_date, expireDate: batch.expire_date, companyCode: batch.company_code,
        sourceType: batch.source_type, status: batch.status, createdAt: batch.created_at,
        ledger,
      },
      sales: { salesOrders, storeSales },
      finance: { ar, cash },
      returns,
    };
  }
}
