import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * QualityService — V2 fidelity 质量追溯 + 质检记录 + 不合格品 NCR
 *
 * V2 来源：_archive/phoenix-backend-v2-sqlite/src/routes/qualityTrace.js
 *
 * 端点：
 *   - GET  /api/quality/trace/forward    正向追溯（批次 → 流向 → 销售）
 *   - GET  /api/quality/trace/backward   逆向追溯（销售 → 批次 → 来源）
 *   - GET  /api/quality/inspections      质检记录列表
 *   - POST /api/quality/inspections      创建质检记录（自动抓取环境快照）
 *   - GET  /api/quality/inspections/:no  单条质检详情
 *   - GET  /api/quality/non-conformances NCR 列表
 *   - POST /api/quality/non-conformances 创建 NCR
 *   - GET  /api/quality/standards        质量标准
 */
@Injectable()
export class QualityService {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  // ═════════════════════════════════════════════════════════════════════
  // 正向追溯（批次 → 流向）
  // ═════════════════════════════════════════════════════════════════════
  async traceForward(batchNo: string) {
    if (!batchNo) throw new BadRequestException('batch_no 必填');

    const batch = (await this.em.query(
      `SELECT b.*, p.product_name_lo, p.price_retail
         FROM inv_batches b
         LEFT JOIN mst_products p ON b.product_code = p.product_code
        WHERE b.batch_no = $1 LIMIT 1`,
      [batchNo],
    ).catch(() => []))[0] || null;
    if (!batch) return { code: 404, msg: `批次 ${batchNo} 不存在`, batch: null };

    const ledger = await this.em.query(
      `SELECT change_type, qty_change, operator, store_code, ref_no, note, created_at
         FROM inv_ledger WHERE batch_no = $1 ORDER BY created_at ASC`,
      [batchNo],
    ).catch(() => []);

    const sales = await this.em.query(
      `SELECT s.sale_no, s.store_code, s.cashier, s.net_amount, s.pay_method,
              si.qty, si.subtotal, s.created_at
         FROM pos_sale_items si
         JOIN pos_sales s ON si.sale_no = s.sale_no
        WHERE si.batch_no = $1
        ORDER BY s.created_at DESC LIMIT 50`,
      [batchNo],
    ).catch(() => []);

    const receiving = await this.em.query(
      `SELECT r.order_no, r.store_code, r.status, r.created_at,
              i.qty_expected, i.qty_actual, i.qty_damaged
         FROM store_receiving_items i
         JOIN store_receiving r ON i.order_no = r.order_no
        WHERE i.batch_no = $1`,
      [batchNo],
    ).catch(() => []);

    const inspections = await this.em.query(
      `SELECT inspect_no, "checkType", inspector, result, "checkTime", remark
         FROM qa_inspections
        WHERE items_json LIKE $1
        LIMIT 10`,
      [`%${batchNo}%`],
    ).catch(() => []);

    // 汇总流向门店
    const storeFlow: Record<string, { in: number; out: number }> = {};
    for (const l of ledger) {
      const sc = l.store_code || 'UNKNOWN';
      if (!storeFlow[sc]) storeFlow[sc] = { in: 0, out: 0 };
      const qty = Number(l.qty_change) || 0;
      if (qty > 0) storeFlow[sc].in += qty;
      else storeFlow[sc].out += Math.abs(qty);
    }

    return {
      code: 200,
      trace_type: 'FORWARD',
      batch,
      summary: {
        total_distributed: ledger
          .filter((l: any) => Number(l.qty_change) < 0)
          .reduce((a: number, l: any) => a + Math.abs(Number(l.qty_change)), 0),
        total_sold: sales.reduce((a: number, s: any) => a + Number(s.qty || 0), 0),
        store_count: Object.keys(storeFlow).length,
        sale_count: sales.length,
      },
      store_flow: Object.entries(storeFlow).map(([store, v]) => ({ store_code: store, ...v })),
      ledger,
      sales,
      receiving,
      inspections,
    };
  }

  // ═════════════════════════════════════════════════════════════════════
  // 逆向追溯（销售 → 批次 → 来源 + 召回评估）
  // ═════════════════════════════════════════════════════════════════════
  async traceBackward(query: { sale_no?: string; batch_no?: string; keyword?: string }) {
    const { sale_no, batch_no, keyword } = query;
    if (!sale_no && !batch_no && !keyword) {
      throw new BadRequestException('请提供 sale_no / batch_no / keyword 之一');
    }

    let batches: Array<{ batch_no: string; product_name_zh?: string; product_code?: string }> = [];

    if (sale_no) {
      batches = await this.em.query(
        `SELECT DISTINCT si.batch_no, si.product_name_zh, si.product_code
           FROM pos_sale_items si WHERE si.sale_no = $1 AND si.batch_no IS NOT NULL`,
        [sale_no],
      ).catch(() => []);
    } else if (batch_no) {
      batches = [{ batch_no }];
    } else if (keyword) {
      batches = await this.em.query(
        `SELECT batch_no, product_name_zh, product_code
           FROM inv_batches WHERE product_name_zh LIKE $1 OR product_code LIKE $1 LIMIT 20`,
        [`%${keyword}%`],
      ).catch(() => []);
    }

    const traces = await Promise.all(batches.map(async (b) => {
      const batchDetail = (await this.em.query(
        `SELECT b.*, p.product_name_lo, p.price_retail
           FROM inv_batches b
           LEFT JOIN mst_products p ON b.product_code = p.product_code
          WHERE b.batch_no = $1 LIMIT 1`,
        [b.batch_no],
      ).catch(() => []))[0] || null;

      const purchaseSource = (await this.em.query(
        `SELECT receipt_no, po_no, supplier, arrival_date, conclusion, actual_qty
           FROM prc_receipts WHERE receipt_no LIKE $1 LIMIT 1`,
        [`%${b.batch_no}%`],
      ).catch(() => []))[0] || null;

      const wmsSource = await this.em.query(
        `SELECT change_type, qty_change, operator, ref_no, note, created_at
           FROM inv_ledger
          WHERE batch_no = $1
            AND change_type IN ('PURCHASE_IN','STORE_IN','RECV_IN','INBOUND','PACK_DONE','EGG_GRADED')
          ORDER BY created_at ASC LIMIT 5`,
        [b.batch_no],
      ).catch(() => []);

      const qaRecords = await this.em.query(
        `SELECT inspect_no, "checkType", inspector, result, "checkTime", remark
           FROM qa_inspections WHERE items_json LIKE $1 LIMIT 5`,
        [`%${b.batch_no}%`],
      ).catch(() => []);

      const ncRecords = await this.em.query(
        `SELECT nc_no, issue_type, severity, batch_no, store_code, action_taken, status, created_at
           FROM qa_non_conformance WHERE batch_no = $1`,
        [b.batch_no],
      ).catch(() => []);

      const remaining = (await this.em.query(
        `SELECT COALESCE(qty_available, qty) AS qty_available, status, store_code
           FROM inv_batches WHERE batch_no = $1 LIMIT 1`,
        [b.batch_no],
      ).catch(() => []))[0] || null;

      return {
        batch_no: b.batch_no,
        batch_detail: batchDetail,
        purchase_source: purchaseSource,
        wms_inbound: wmsSource,
        qa_inspections: qaRecords,
        non_conformances: ncRecords,
        current_stock: remaining,
        recall_assessment: {
          can_recall: !!(remaining && Number(remaining.qty_available) > 0),
          qty_at_risk: Number(remaining?.qty_available) || 0,
          status: remaining?.status || 'UNKNOWN',
        },
      };
    }));

    return {
      code: 200,
      trace_type: 'BACKWARD',
      query,
      batch_count: batches.length,
      traces,
    };
  }

  // ═════════════════════════════════════════════════════════════════════
  // 质检记录 CRUD
  // ═════════════════════════════════════════════════════════════════════
  async listInspections(query: any) {
    const { checkType, result, start_date, end_date } = query || {};
    const where: string[] = ['1=1'];
    const params: any[] = [];
    if (checkType) { where.push(`"checkType" = $${params.length + 1}`); params.push(checkType); }
    if (result)    { where.push(`result = $${params.length + 1}`); params.push(result); }
    if (start_date){ where.push(`"checkTime" >= $${params.length + 1}`); params.push(start_date); }
    if (end_date)  { where.push(`"checkTime" <= $${params.length + 1}`); params.push(end_date); }
    const rows = await this.em.query(
      `SELECT * FROM qa_inspections WHERE ${where.join(' AND ')} ORDER BY "checkTime" DESC LIMIT 100`,
      params,
    ).catch(() => []);
    return { code: 200, data: rows, total: rows.length };
  }

  async createInspection(body: any, user: any) {
    const { henhouse, house_code, checkType, inspector, items, failItems, result, checkTime, remark } = body || {};
    if (!checkType || !inspector || !result) {
      throw new BadRequestException('checkType / inspector / result 必填');
    }
    const inspectNo = `INS-${Date.now()}`;
    const houseCode = house_code || henhouse || null;

    // V2 fidelity: 自动抓取该鸡舍的实时环境快照
    let envSnapshotJson: string | null = null;
    if (houseCode) {
      const snap = await this.em.query(
        `SELECT property_code, name_zh, value, unit, is_alarm, collect_time
           FROM farm_device_realtime_snapshot
          WHERE erp_house_code = $1
          ORDER BY property_code`,
        [houseCode],
      ).catch(() => []);
      if (snap.length > 0) {
        envSnapshotJson = JSON.stringify({
          captured_at: new Date().toISOString(),
          house_code: houseCode,
          properties: snap,
        });
      }
    }

    // V3 schema: items/failItems 列是 integer 计数；JSON 详情存在新增的 *_json 列
    const itemsArr = Array.isArray(items) ? items : [];
    const failArr  = Array.isArray(failItems) ? failItems : [];
    await this.em.query(
      `INSERT INTO qa_inspections
         (inspect_no, henhouse, house_code, "checkType", inspector,
          items, "failItems", items_json, fail_items_json,
          result, "checkTime", remark, env_snapshot_json, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now())`,
      [
        inspectNo, henhouse || houseCode || '', houseCode, checkType, inspector,
        itemsArr.length, failArr.length,
        JSON.stringify(itemsArr), JSON.stringify(failArr),
        result, checkTime || new Date().toISOString().slice(0, 10),
        remark || '', envSnapshotJson,
      ],
    );

    return {
      code: 200, msg: '质检记录已创建',
      data: { inspect_no: inspectNo, env_captured: !!envSnapshotJson },
    };
  }

  async getInspection(inspectNo: string) {
    const rows = await this.em.query(
      `SELECT * FROM qa_inspections WHERE inspect_no = $1 LIMIT 1`,
      [inspectNo],
    );
    if (rows.length === 0) throw new NotFoundException(`质检 ${inspectNo} 不存在`);
    const r = rows[0];
    const safe = <T>(v: any): T | null => { try { return typeof v === 'string' ? JSON.parse(v) : v; } catch { return null; } };
    return {
      code: 200,
      data: {
        ...r,
        items_parsed:     safe(r.items_json),
        failItems_parsed: safe(r.fail_items_json),
        env_snapshot:     safe(r.env_snapshot_json),
      },
    };
  }

  // ═════════════════════════════════════════════════════════════════════
  // 不合格品 NCR
  // ═════════════════════════════════════════════════════════════════════
  async listNonConformances(query: any) {
    const { status, severity } = query || {};
    const where: string[] = ['1=1'];
    const params: any[] = [];
    if (status)   { where.push(`status = $${params.length + 1}`); params.push(status); }
    if (severity) { where.push(`severity = $${params.length + 1}`); params.push(severity); }
    const rows = await this.em.query(
      `SELECT * FROM qa_non_conformance WHERE ${where.join(' AND ')} ORDER BY created_at DESC LIMIT 100`,
      params,
    ).catch(() => []);
    return { code: 200, data: rows };
  }

  async createNonConformance(body: any, user: any) {
    const { issue_type, severity, batch_no, store_code, description, action_taken } = body || {};
    if (!issue_type || !severity) throw new BadRequestException('issue_type / severity 必填');
    const ncNo = `NC-${Date.now()}`;
    await this.em.query(
      `INSERT INTO qa_non_conformance
         (nc_no, issue_type, severity, batch_no, store_code, description, action_taken, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN', now())`,
      [ncNo, issue_type, severity, batch_no || null, store_code || null, description || '', action_taken || ''],
    );
    return { code: 200, msg: '不合格品记录已创建', data: { nc_no: ncNo } };
  }

  // ═════════════════════════════════════════════════════════════════════
  // 质量标准
  // ═════════════════════════════════════════════════════════════════════
  async listStandards() {
    const rows = await this.em.query(
      `SELECT * FROM qa_standards ORDER BY product_type, standard_code`,
    ).catch(() => []);
    return { code: 200, data: rows };
  }
}
