import { Controller, Post, Get, Body, Req, Param, UseGuards, Query } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';

@Controller('api/finance')
@UseGuards(MenuGuard, DataScopeGuard)
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  // ─── AR 账龄 ─────────────────────────────────────────────────────────────────
  @Get('ar-aging')
  @RequireMenu('MENU_FINANCE', 'V')
  async getArAging() {
    return await this.financeService.getArAging();
  }

  // V2 fidelity: 单客户 AR 账龄明细
  @Get('ar-aging/customer/:customer_code')
  @RequireMenu('MENU_FINANCE', 'V')
  async getArAgingByCustomer(@Param('customer_code') code: string) {
    return await this.financeService.getArAgingByCustomer(code);
  }

  // ─── AP 账龄 ─────────────────────────────────────────────────────────────────
  @Get('ap-aging')
  @RequireMenu('MENU_FINANCE', 'V')
  async getApAging() {
    return await this.financeService.getApAging();
  }

  // V2 fidelity: AP 凭证生成（幂等 by po_no）
  @Post('ap-invoice')
  @RequireMenu('MENU_FINANCE', 'C')
  async createApInvoice(@Body() body: any, @Req() req: any) {
    return await this.financeService.createApInvoice(body, req.user);
  }

  // V2 fidelity: AP 付款核销
  @Post('ap-payment')
  @RequireMenu('MENU_FINANCE', 'C')
  async payApInvoice(@Body() body: any, @Req() req: any) {
    return await this.financeService.payApInvoice(body, req.user);
  }

  // V2 fidelity: 登记收入 / AR 自动核销
  @Post('income')
  @RequireMenu('MENU_FIN_CLOSE', 'C')
  async registerIncome(@Body() body: any, @Req() req: any) {
    return await this.financeService.registerIncome(body, req.user);
  }

  // V2 fidelity: 三级费用审批
  @Post('expense/:txn_id/approve-chain')
  @RequireMenu('MENU_FINANCE', 'A')
  async approveExpenseChain(@Param('txn_id') txnId: string, @Body() body: any, @Req() req: any) {
    return await this.financeService.approveExpenseChain(txnId, body, req.user);
  }

  // ─── 现金流 ───────────────────────────────────────────────────────────────────
  @Get('cashflow')
  @RequireMenu('MENU_FINANCE', 'V')
  async getCashflow(@Query('period') period: string) {
    return await this.financeService.getCashflow(period);
  }

  // ─── 财务总览 ─────────────────────────────────────────────────────────────────
  @Get('summary')
  @RequireMenu('MENU_FINANCE', 'V')
  async getSummary() {
    return await this.financeService.getSummary();
  }

  // ─── 费用报销 ─────────────────────────────────────────────────────────────────
  @Post('expense')
  @RequireMenu('MENU_FINANCE', 'C')
  async submitExpense(@Body() dto: any, @Req() req: any) {
    const userId = req.user?.userId || 1;
    return await this.financeService.submitExpense(dto, userId);
  }

  @Post('expense/:txn_id/approve')
  @RequireMenu('MENU_FINANCE', 'A')
  async approveExpense(@Param('txn_id') txnId: string) {
    return await this.financeService.approveExpense(txnId);
  }

  // ─── 账龄总览 ─────────────────────────────────────────────────────────────────
  @Get('aging-overview')
  @RequireMenu('MENU_FINANCE', 'V')
  async getAgingOverview() {
    return await this.financeService.getAgingOverview();
  }

  @Get('invoices')
  @RequireMenu('MENU_FINANCE', 'V')
  async getInvoices() {
    return { code: 200, data: [] };
  }

  // ─── 移动端资金账户与流水 ─────────────────────────────────────────────────────
  @Get('accounts')
  @RequireMenu('MENU_FIN_CLOSE', 'V')
  async getAccounts() {
    return await this.financeService.getAccounts();
  }

  @Get('transactions')
  @RequireMenu('MENU_FIN_CLOSE', 'V')
  async getTransactions(@Query('account_code') accountCode?: string) {
    return await this.financeService.getTransactions(accountCode);
  }

  // ─── 移动端客户应收 ───────────────────────────────────────────────────────────
  @Get('income')
  @RequireMenu('MENU_FIN_CLOSE', 'V')
  async getIncome(@Query('month') month?: string) {
    return await this.financeService.getIncome(month);
  }
}
