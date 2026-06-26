import { Controller, Post, Get, Body, Param, UseGuards, Query } from '@nestjs/common';
import { ProcurementService } from './procurement.service';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';

@Controller('api/procurement')
@UseGuards(AuthGuard('jwt'), MenuGuard)
@RequireMenu('MENU_PRC2', 'V')
export class ProcurementController {
  constructor(private readonly procurementService: ProcurementService) {}

  // ─── 采购看板汇总 ──────────────────────────────────────────────────────────
  @Get('dashboard')
  async getDashboard() {
    return await this.procurementService.getDashboardSummary();
  }

  // ─── 采购申请（草稿/待审批） ────────────────────────────────────────────────
  @Get('requests')
  async getRequests() {
    return await this.procurementService.getRequests();
  }

  // ─── 采购订单（审批后） ────────────────────────────────────────────────────
  @Get('orders')
  async getOrders() {
    return await this.procurementService.getOrders();
  }

  @Post('create')
  @RequireMenu('MENU_PRC2_ORDER', 'C')
  async createPO(@Body() body: any) {
    return await this.procurementService.createPurchaseOrder(body);
  }

  @Post(':poNo/submit')
  @RequireMenu('MENU_PRC2_ORDER', 'E')
  async submitPO(@Param('poNo') poNo: string, @Body() body: any) {
    return await this.procurementService.submitForApproval(poNo, {
      approver_id:   body?.approver_id   ? Number(body.approver_id) : undefined,
      approver_name: body?.approver_name || undefined,
      contract_url:  body?.contract_url  || undefined,
    });
  }

  // ─── 获取审批人列表 ──────────────────────────────���─────────────────────────
  @Get('approvers')
  @RequireMenu('MENU_PRC2_ORDER', 'E')
  async getApprovers() {
    return await this.procurementService.getApprovers();
  }

  // ─── 批准采购单 ─────────────────────���──────────────────────────────────────
  @Post(':poNo/approve')
  @RequireMenu('MENU_PRC2_ORDER', 'A', ['MENU_WORKFLOW'])
  async approvePO(@Param('poNo') poNo: string) {
    return await this.procurementService.approvePO(poNo);
  }

  // ─── 待付款列表（来自PO批准） ──────────────────────────────────────────────
  @Get('pending-payments')
  async getPendingPayments() {
    return await this.procurementService.getPendingPayments();
  }

  // ─── 确认付款 ──────────────────────────────────────────────────────────────
  @Post('payments/:id/confirm')
  @RequireMenu('MENU_PRC2_PAYMENT', 'E')
  async confirmPayment(@Param('id') id: string, @Body() body: any) {
    return await this.procurementService.confirmPayment(Number(id), body);
  }

  // ─── 收货确认 ──────────────────────────────────────────────────────────────
  @Post(':poNo/confirm-receipt')
  @RequireMenu('MENU_PRC2_RECEIPT', 'E')
  async confirmReceipt(@Param('poNo') poNo: string, @Body('items') items: any[]) {
    return await this.procurementService.confirmReceipt(poNo, items || []);
  }

  // 兼容旧路由
  @Post('receipts/:receipt_no/confirm')
  @RequireMenu('MENU_PRC2_RECEIPT', 'E')
  async confirmReceiptLegacy(@Param('receipt_no') poNo: string, @Body('items') items: any[]) {
    return await this.procurementService.confirmReceipt(poNo, items || []);
  }

  // ─── 供应商 ────────────────────────────────────────────────────────────────
  @Get('suppliers')
  async getSuppliers() {
    return await this.procurementService.getSuppliers();
  }

  @Get('supplier-kpi')
  async getSupplierKpi() {
    return await this.procurementService.getSupplierKpi();
  }

  // ─── 三单比对 ──────────────────────────────────────────────────────────────
  @Get('three-way-match/:po_no')
  async getThreeWayMatch(@Param('po_no') poNo: string) {
    return await this.procurementService.getThreeWayMatch(poNo);
  }

  // ─── 饲料耗料对账 ──────────────────────────────────────────────────────────
  @Get('feed-reconciliation')
  async getFeedReconciliation(
    @Query('start_date') startDate: string,
    @Query('end_date') endDate: string,
    @Query('house_code') houseCode?: string,
  ) {
    return await this.procurementService.getFeedReconciliation(startDate, endDate, houseCode);
  }

  // ─── 采购申请 ──────────────────────────────────────────────────────────────
  @Get('purchase-requests')
  async getPurchaseRequests() {
    return await this.procurementService.getPurchaseRequests();
  }

  @Post('purchase-requests')
  @RequireMenu('MENU_PRC2_REQUEST', 'C', ['MENU_PRC2_MASTER'])
  async createPurchaseRequest(@Body() body: any) {
    return await this.procurementService.createPurchaseRequest(body);
  }

  @Post('purchase-requests/:id/convert')
  @RequireMenu('MENU_PRC2_ORDER', 'C')
  async convertRequestToPO(@Param('id') id: string, @Body() body: any) {
    return await this.procurementService.convertRequestToPO(Number(id), body);
  }

  @Post('purchase-requests/:id/reject')
  @RequireMenu('MENU_PRC2_REQUEST', 'A', ['MENU_WORKFLOW'])
  async rejectRequest(@Param('id') id: string, @Body('note') note: string) {
    return await this.procurementService.rejectRequest(Number(id), note);
  }
}
