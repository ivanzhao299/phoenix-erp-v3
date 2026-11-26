import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { DataScopeContext } from '../org/services/data-scope.service';
import { officialInventoryPredicate } from '../wms/official-inventory';

/**
 * V3 Terminal Service
 * 替代已删除的 TerminalV2CompatService，所有逻辑均直接操作 V3 数据表
 */
@Injectable()
export class TerminalService {
  constructor(
    @InjectEntityManager()
    private readonly em: EntityManager,
  ) {}

  // ─── 包装与分级配置 ─────────────────────────────────────────────────────────
  // [Fix Pack 1 — HIGH-4] 从 product_grades 主数据表读取等级配置
  // 不再读取 sys_dict.PKG_EGG_GRADE（H2 迁移后统一来源为 product_grades）
  // 前端 grading/page.tsx 期望 { grades: [...] } 格式（非 { data: [...] }）
  async getGradeConfig() {
    try {
      const rows = await this.em.query(
        `SELECT grade_code, grade_name, grade_name_lo, sort_order, is_saleable, is_storable
         FROM product_grades WHERE status = 'ACTIVE'
         ORDER BY sort_order ASC`,
      );
      const grades = rows.map((r: any, idx: number) => ({
        code:        r.grade_code,
        name:        r.grade_name,
        nameZh:      r.grade_name,
        nameLo:      r.grade_name_lo   || '',
        nameEn:      r.grade_code,
        weightRange: '',
        saleable:    r.is_saleable !== false,
        productCode: `PRD-EGG-${r.grade_code}`,
        sort_no:     r.sort_order ?? idx,
      }));
      return { code: 200, grades };
    } catch (e: any) {
      console.warn('[getGradeConfig][WARN]', e?.message);
      return { code: 200, grades: [] };
    }
  }

  async submitPackagingTask(body: any, userId: number) {
    await this.em.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO sys_audit_log (user_id, module, action, description)
         VALUES ($1, $2, $3, $4)`,
        [userId, 'TERMINAL_PACKAGING', 'SUBMIT', JSON.stringify(body)],
      );
    });
    return { code: 200, msg: '包装任务上报成功' };
  }

  // ─── PDA 手持扫码终端 ────────────────────────────────────────────────────────
  private requireScope(scope?: DataScopeContext): DataScopeContext {
    if (!scope) throw new ForbiddenException('缺少仓库数据范围');
    return scope;
  }

  async pdaSyncInventory(warehouseCode: string, dataScope?: DataScopeContext) {
    const scope = this.requireScope(dataScope);
    if (!warehouseCode || (!scope.isGlobal && !scope.allowedWarehouseCodes.includes(warehouseCode))) {
      throw new ForbiddenException('无权查看该仓库存');
    }
    const data = await this.em.query(
      `SELECT b.batch_no,b.product_code,b.qty,b.status,b.warehouse_code,b.location_code,b.created_at
       FROM inv_batches b
       JOIN wms_warehouses w ON w.warehouse_code=b.warehouse_code AND w.domain='OPERATIONAL'
       WHERE b.warehouse_code=$1 AND b.qty>0 AND ${officialInventoryPredicate('b')}
       ORDER BY b.egg_date DESC NULLS LAST,b.batch_no DESC,b.id DESC`, [warehouseCode]);
    return { code: 200, data };
  }

  async pdaScanBarcode(barcode: string, dataScope?: DataScopeContext) {
    const scope = this.requireScope(dataScope);
    if (typeof barcode !== 'string' || !barcode.trim() || barcode.length > 128) throw new BadRequestException('条码无效');
    const [batch] = await this.em.query(
      `SELECT b.batch_no,b.product_code,b.qty FROM inv_batches b
       JOIN wms_warehouses w ON w.warehouse_code=b.warehouse_code AND w.domain='OPERATIONAL'
       WHERE b.batch_no=$1 AND ($2::boolean OR b.warehouse_code=ANY($3::text[]))
         AND ${officialInventoryPredicate('b')}`, [barcode.trim(), scope.isGlobal, scope.allowedWarehouseCodes]);
    return { code: 200, data: batch
      ? { barcode, status: 'VALID', type: 'BATCH', ...batch }
      : { barcode, status: 'UNKNOWN' } };
  }

  // ─── 标签打印 (Zebra ZPL) ───────────────────────────────────────────────────
  async generateZpl(templateId: string, params: any) {
    const zpl = `^XA^FO50,50^A0N,50,50^FD${params.text || 'TEST'}^FS^XZ`;
    return { code: 200, data: { zpl, template_id: templateId } };
  }

  async logPrint(body: any, userId: number) {
    try {
      await this.em.query(
        `INSERT INTO sys_audit_log (user_id, module, action, description)
         VALUES ($1, $2, $3, $4)`,
        [userId, 'LABEL_PRINT', 'PRINT', JSON.stringify(body)],
      );
    } catch { /* 审计日志写失败不阻断主流程 */ }
    return { code: 200, msg: '打印日志记录成功' };
  }

  // ─── 盘点与日结 ──────────────────────────────────────────────────────────────
  async getStocktakeTasks(dataScope?: DataScopeContext) {
    const scope = this.requireScope(dataScope);
    const data = await this.em.query(
      `SELECT s.* FROM wms_stocktake s
       JOIN wms_warehouses w ON w.warehouse_code=s.warehouse_code AND w.domain='OPERATIONAL'
       WHERE s.status='PENDING' AND s.document_kind='STOCKTAKE'
         AND ($1::boolean OR s.warehouse_code=ANY($2::text[]))
       ORDER BY s.created_at DESC,s.id DESC`, [scope.isGlobal, scope.allowedWarehouseCodes]);
    return { code: 200, data };
  }
}
