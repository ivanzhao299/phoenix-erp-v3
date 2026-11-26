import { readInventoryLineage, readOutboundTrace } from '../traceability/inventory-lineage';
import { readPosAllocationTrace, TracePagination } from '../traceability/pos-allocation-trace';
import { DataScopeContext } from '../org/services/data-scope.service';
import { Injectable, BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { lockTempProductionReferences } from '../wms/temp-production-reversal';

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
  private async traceBatches(scope: DataScopeContext | undefined, batchNos: string[] | null, keyword?: string) {
    if (!scope) throw new ForbiddenException('缺少追溯权限范围');
    return this.em.query(
      `SELECT b.batch_no,b.product_code,b.sku_code,b.qty,b.qty_available,b.unit,b.status,
              b.warehouse_code,w.warehouse_name,w.warehouse_name_zh,w.warehouse_name_en,w.warehouse_name_lo,
              b.location_code,loc.location_name,b.company_code,b.expire_date,b.egg_date,b.source_type,b.source_no,p.product_name_zh
       FROM inv_batches b LEFT JOIN mst_products p ON p.product_code=b.product_code
       LEFT JOIN wms_warehouses w ON w.warehouse_code=b.warehouse_code
       LEFT JOIN wms_locations loc ON loc.location_code=b.location_code AND loc.warehouse_code=b.warehouse_code
       WHERE ($1::boolean OR (b.company_code=ANY($2::text[]) AND b.warehouse_code=ANY($3::text[])))
         AND ($4::text[] IS NULL OR b.batch_no=ANY($4))
         AND ($5::text IS NULL OR strpos(lower(concat_ws(' ',b.batch_no,b.product_code,p.product_name_zh)),lower($5))>0)
       ORDER BY b.batch_no LIMIT 200`,
      [scope.isGlobal === true, scope.allowedCompanyCodes, scope.allowedWarehouseCodes, batchNos, keyword ?? null],
    );
  }

  async traceForward(batchNo: string, scope?: DataScopeContext, page?: TracePagination) {
    if (!scope) throw new ForbiddenException('缺少追溯权限范围');
    const [batch] = await this.traceBatches(scope, [batchNo]);
    if (!batch) throw new NotFoundException('批次不存在');
    const lineage = await readInventoryLineage(this.em, batchNo, scope);
    const batches = [...new Set<string>([batchNo, ...lineage
      .filter((edge: { downstream: boolean }) => edge.downstream)
      .map((edge: { child_batch_no: string }) => edge.child_batch_no)])];
    const [salesPage, shipments] = await Promise.all([
      readPosAllocationTrace(this.em, 'batch', batchNo, scope, page, batches),
      readOutboundTrace(this.em, scope, { batches }),
    ]);
    return { code: 200, trace_type: 'FORWARD', batch, sales: salesPage.rows, salesPage, shipments, lineage,
      completeness: salesPage.completeness };
  }

  async traceBackward(query: { sale_no?: string; batch_no?: string; keyword?: string },
    scope?: DataScopeContext, page?: TracePagination) {
    if (!scope) throw new ForbiddenException('缺少追溯权限范围');
    const { sale_no, batch_no, keyword } = query;
    if ([sale_no, batch_no, keyword].filter(value => typeof value === 'string' && value.trim()).length !== 1) {
      throw new BadRequestException('请提供一个销售单号、批次号或关键词');
    }
    const [allocationPage, shipments] = await Promise.all([
      sale_no ? readPosAllocationTrace(this.em, 'sale', sale_no, scope, page) : null,
      sale_no ? readOutboundTrace(this.em, scope, { orderNo: sale_no }) : [],
    ]);
    const roots = allocationPage ? [...new Set<string>([...allocationPage.rows, ...shipments].map((row: { batch_no: string }) => row.batch_no))]
      : batch_no ? [batch_no] : null;
    const lineage = roots ? (await readInventoryLineage(this.em, roots, scope)).filter((edge: { upstream: boolean }) => edge.upstream) : [];
    const selected = roots ? [...new Set<string>([...roots, ...lineage
      .filter((edge: { kind: string }) => edge.kind !== 'RAW_RECEIPT')
      .map((edge: { parent_batch_no: string }) => edge.parent_batch_no)])] : null;
    const batches = await this.traceBatches(scope, selected, keyword);
    const traces = batches.map((batch: any) => ({
      batch_no: batch.batch_no, batch_detail: batch, current_stock: batch,
      recall_assessment: { can_recall: null, qty_at_risk: null, status: batch.status },
    }));
    return { code: 200, trace_type: 'BACKWARD', batch_count: traces.length, traces,
      allocations: allocationPage?.rows ?? [], allocationPage, shipments, lineage, completeness: 'VERIFIED_FACTS_ONLY' };
  }

  async listInspections(query: any) {
    const { checkType, result, start_date, end_date } = query || {};
    const where: string[] = ['1=1'];
    const params: any[] = [];
    if (checkType) { where.push(`"checkType" = $${params.length + 1}`); params.push(checkType); }
    if (result)    { where.push(`result = $${params.length + 1}`); params.push(result); }
    if (start_date){ where.push(`"checkTime" >= $${params.length + 1}`); params.push(start_date); }
    if (end_date)  { where.push(`"checkTime" <= $${params.length + 1}`); params.push(end_date); }
    const rows = await this.em.query(
      `SELECT * FROM qa_inspections WHERE ${where.join(' AND ')} ORDER BY "checkTime" DESC, id DESC LIMIT 100`,
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
      `SELECT * FROM qa_non_conformance WHERE ${where.join(' AND ')} ORDER BY created_at DESC, id DESC LIMIT 100`,
      params,
    ).catch(() => []);
    return { code: 200, data: rows };
  }

  async createNonConformance(body: any, user: any) {
    const { issue_type, severity, batch_no, store_code, description, action_taken } = body || {};
    if (!issue_type || !severity) throw new BadRequestException('issue_type / severity 必填');
    const ncNo = `NC-${Date.now()}`;
    await this.em.transaction(async manager => {
    // New OPEN non-conformance is a business obligation. Historical reads stay unchanged.
    await lockTempProductionReferences(manager, [batch_no]);
    await manager.query(
      `INSERT INTO qa_non_conformance
         (nc_no, issue_type, severity, batch_no, store_code, description, action_taken, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, 'OPEN', now())`,
      [ncNo, issue_type, severity, batch_no || null, store_code || null, description || '', action_taken || ''],
    );
    });
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
