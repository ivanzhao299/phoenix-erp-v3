import { Controller, Post, Get, Body, Param, Query, UseGuards, Req } from '@nestjs/common';
import { PosService } from './pos.service';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';

/**
 * POS 收银控制器
 * 路由前缀 /api/v3/pos
 * [Fix Pack 1 — HIGH-3] 添加 DataScopeGuard
 */
@Controller('api/v3/pos')
@UseGuards(MenuGuard, DataScopeGuard)
export class PosController {
  constructor(private readonly posService: PosService) {}

  /** 创建销售单（含 items；自动扣库存 + 写 inv_ledger SALE_OUT） */
  @Post('sales')
  @RequireMenu('MENU_POS', 'C')
  async createSale(@Body() body: any, @Req() req: any) {
    return await this.posService.createSale(body, req.user);
  }

  /** 退款（反向加库存 + SALE_REFUND ledger） */
  @Post('sales/:sale_no/refund')
  @RequireMenu('MENU_POS', 'E')
  async refundSale(@Param('sale_no') saleNo: string, @Body() body: any, @Req() req: any) {
    return await this.posService.refundSale(saleNo, body, req.user);
  }

  /** 作废（仅当日 COMPLETED 销售单；类退款但 ledger 类型为 SALE_VOID） */
  @Post('sales/:sale_no/void')
  @RequireMenu('MENU_POS', 'E')
  async voidSale(@Param('sale_no') saleNo: string, @Body() body: any, @Req() req: any) {
    return await this.posService.voidSale(saleNo, body, req.user);
  }

  // ─── 门店运营（store losses / receiving / replenish）—— A3+A4+A5 ───────────

  /** A3 门店损耗审批 — 扣 inv_batches + store_inventory + 写 STORE_LOSS ledger */
  @Post('losses/:loss_no/approve')
  @RequireMenu('MENU_STORE', 'E')
  async approveStoreLoss(@Param('loss_no') lossNo: string, @Body() body: any, @Req() req: any) {
    return await this.posService.approveStoreLoss({ ...body, loss_no: lossNo }, req.user);
  }

  /** A4 门店收货验收 — 增 store_inventory + 写 STORE_RECV ledger */
  @Post('receiving/:order_no/confirm')
  @RequireMenu('MENU_STORE', 'E')
  async confirmStoreReceiving(@Param('order_no') orderNo: string, @Body() body: any, @Req() req: any) {
    return await this.posService.confirmStoreReceiving(orderNo, body, req.user);
  }

  /** A5 补货申请审批 — APPROVED 时同步建 wms_outbound 工单 */
  @Post('replenish/:req_no/approve')
  @RequireMenu('MENU_STORE', 'E')
  async approveReplenishReq(@Param('req_no') reqNo: string, @Body() body: any, @Req() req: any) {
    return await this.posService.approveReplenishReq(reqNo, body, req.user);
  }

  // ─── V2 fidelity: POS sessions ─────────────────────────────────────────────

  /** 开班 — store_code/cashier 强制取自 Token (SEC-04) */
  @Post('sessions')
  @RequireMenu('MENU_POS', 'C')
  async openSession(@Body() body: any, @Req() req: any) {
    return await this.posService.openSession(body, req.user);
  }

  /** 查询当前 OPEN 班次 */
  @Get('sessions')
  @RequireMenu('MENU_POS', 'V')
  async getCurrentSession(@Query('store_code') storeCode: string, @Req() req: any) {
    return await this.posService.getCurrentSession(storeCode, req.user);
  }

  /** 结班 — 汇总销售并归档 */
  @Post('sessions/close')
  @RequireMenu('MENU_POS', 'E')
  async closeSession(@Body() body: any, @Req() req: any) {
    return await this.posService.closeSession(body, req.user);
  }

  /** 当日销售汇总（按门店） */
  @Get('today')
  @RequireMenu('MENU_POS', 'V')
  async getTodaySummary(@Query('store_code') storeCode: string, @Req() req: any) {
    return await this.posService.getTodaySummary(storeCode, req.user);
  }
}
