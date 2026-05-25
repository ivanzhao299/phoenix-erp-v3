import {
  Controller, Get, Post, Patch,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../../modules/org/guards/data-scope.guard';

import { OrdersService }                  from '../services/orders.service';
import { CreatePurchaseOrderDto }         from '../dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto }         from '../dto/update-purchase-order.dto';
import { QueryPurchaseOrderDto }          from '../dto/query-purchase-order.dto';
import { SubmitPurchaseOrderDto }         from '../dto/submit-purchase-order.dto';
import { ApprovePurchaseOrderDto }        from '../dto/approve-purchase-order.dto';
import { RejectPurchaseOrderDto }         from '../dto/reject-purchase-order.dto';
import { CancelPurchaseOrderDto }         from '../dto/cancel-purchase-order.dto';
import { ConvertRequestToOrderDto }       from '../dto/convert-request-to-order.dto';

@Controller('api/v2/procurement')
@UseGuards(MenuGuard, DataScopeGuard)
export class OrdersController {
  constructor(private readonly svc: OrdersService) {}

  // ── 采购订单（PO）─────────────────────────────────────────────────────────

  /** GET /api/v2/procurement/orders — 分页列表 */
  @Get('orders')
  @RequireMenu('MENU_PRC2_ORDER', 'V')
  list(@Query() query: QueryPurchaseOrderDto) {
    return this.svc.list(query);
  }

  /** GET /api/v2/procurement/orders/:id — 详情 */
  @Get('orders/:id')
  @RequireMenu('MENU_PRC2_ORDER', 'V')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  /** GET /api/v2/procurement/orders/:id/approvals — 审批日志 */
  @Get('orders/:id/approvals')
  @RequireMenu('MENU_PRC2_ORDER', 'V')
  getApprovals(@Param('id') id: string) {
    return this.svc.getApprovals(id);
  }

  /** GET /api/v2/procurement/orders/:id/ap-ledger — AP 台账 */
  @Get('orders/:id/ap-ledger')
  @RequireMenu('MENU_PRC2_ORDER', 'V')
  getApLedger(@Param('id') id: string) {
    return this.svc.getApLedger(id);
  }

  /** POST /api/v2/procurement/orders — 直接新建 PO */
  @Post('orders')
  @RequireMenu('MENU_PRC2_ORDER', 'C')
  create(@Body() dto: CreatePurchaseOrderDto) {
    return this.svc.create(dto);
  }

  /** PATCH /api/v2/procurement/orders/:id — 编辑（仅 DRAFT） */
  @Patch('orders/:id')
  @RequireMenu('MENU_PRC2_ORDER', 'E')
  update(@Param('id') id: string, @Body() dto: UpdatePurchaseOrderDto) {
    return this.svc.update(id, dto);
  }

  /** POST /api/v2/procurement/orders/:id/submit — 提交审批 */
  @Post('orders/:id/submit')
  @RequireMenu('MENU_PRC2_ORDER', 'E')
  submit(@Param('id') id: string, @Body() dto: SubmitPurchaseOrderDto) {
    return this.svc.submit(id, dto);
  }

  /** POST /api/v2/procurement/orders/:id/approve — 审批通过 */
  @Post('orders/:id/approve')
  @RequireMenu('MENU_PRC2_ORDER', 'A')
  approve(@Param('id') id: string, @Body() dto: ApprovePurchaseOrderDto) {
    return this.svc.approve(id, dto);
  }

  /** POST /api/v2/procurement/orders/:id/reject — 审批拒绝 */
  @Post('orders/:id/reject')
  @RequireMenu('MENU_PRC2_ORDER', 'A')
  reject(@Param('id') id: string, @Body() dto: RejectPurchaseOrderDto) {
    return this.svc.reject(id, dto);
  }

  /** POST /api/v2/procurement/orders/:id/cancel — 取消 */
  @Post('orders/:id/cancel')
  @RequireMenu('MENU_PRC2_ORDER', 'E')
  cancel(@Param('id') id: string, @Body() dto: CancelPurchaseOrderDto) {
    return this.svc.cancel(id, dto);
  }

  // ── PR 转 PO ──────────────────────────────────────────────────────────────

  /** POST /api/v2/procurement/requests/:id/convert-to-order — 从 APPROVED PR 转 PO */
  @Post('requests/:id/convert-to-order')
  @RequireMenu('MENU_PRC2_ORDER', 'C')
  convertFromRequest(
    @Param('id') id: string,
    @Body() dto: ConvertRequestToOrderDto,
  ) {
    return this.svc.convertFromRequest(id, dto);
  }
}
