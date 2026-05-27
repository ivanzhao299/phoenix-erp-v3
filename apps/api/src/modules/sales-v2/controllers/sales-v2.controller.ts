import { Controller, Get } from '@nestjs/common';
import { SalesV2Service } from '../services/sales-v2.service';

/**
 * Sales V2 Controller — Phase 0 Clean Baseline
 *
 * 路由前缀：/api/v2/sales
 *
 * Phase 0 仅暴露：
 *   GET /api/v2/sales/health   — 模块健康探针（无需鉴权）
 *
 * Phase 路线图：
 *   Phase 0 — 基线建立：Entity 骨架、Health API、前端占位、Legacy Freeze   ✅
 *   Phase 1 — Customer + Channel Runtime：统一客户主档，DataScope 对齐
 *   Phase 2 — Price Runtime：统一定价引擎，价格审批 Workflow
 *   Phase 3 — Sales Order Runtime：状态机、AR 联动、Workflow 审批
 *   Phase 4 — Delivery Runtime：配送单、时间戳、订单关联
 *   Phase 5 — AR Integration + Credit Control：欠款账龄、账期逾期冻结
 *   Phase 6 — Sales Return Runtime：退货 + Credit Note + 库存回退
 *   Phase 7 — Egg Inventory Enhancement：按品级/规格/生产日期管库存
 *   Phase 8 — Sales Reports：日报/欠款账龄/渠道/价格异常
 *   Phase 9 — Mobile Sales + Delivery App：动态定价、移动端重构
 *
 * 设计原则：
 *   · company_code DataScope — 与 Finance V2 对齐，禁用 store_code 作为主隔离
 *   · Workflow 2.0 — 唯一审批引擎（价格审批、赊销审批、退货审批）
 *   · Finance V2 fin_ar_invoices — 唯一应收 Runtime，禁止写 fin_transactions
 *   · 不修改 Procurement V2 / Finance V2 / Workflow 2.0 现有逻辑
 */
@Controller('api/v2/sales')
export class SalesV2Controller {
  constructor(private readonly salesV2Svc: SalesV2Service) {}

  /**
   * GET /api/v2/sales/health
   * Sales V2 模块健康探针
   * @public（MenuGuard 对无 @RequireMenu 的端点放行）
   */
  @Get('health')
  health() {
    return this.salesV2Svc.health();
  }
}
