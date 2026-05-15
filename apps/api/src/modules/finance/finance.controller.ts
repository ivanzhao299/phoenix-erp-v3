import { Controller, Post, Get, Body, Req, Param, UseGuards, Query } from '@nestjs/common';
import { FinanceService } from './finance.service';
import { AuthGuard } from '@nestjs/passport';

@Controller('api/finance')
@UseGuards(AuthGuard('jwt'))
export class FinanceController {
  constructor(private readonly financeService: FinanceService) {}

  @Get('ar-aging')
  async getArAging() {
    return await this.financeService.getArAging();
  }

  // V2 fidelity: 单客户 AR 账龄明细
  @Get('ar-aging/customer/:customer_code')
  async getArAgingByCustomer(@Param('customer_code') code: string) {
    return await this.financeService.getArAgingByCustomer(code);
  }

  @Get('ap-aging')
  async getApAging() {
    return await this.financeService.getApAging();
  }

  // V2 fidelity: AP 凭证生成（幂等 by po_no）
  @Post('ap-invoice')
  async createApInvoice(@Body() body: any, @Req() req: any) {
    return await this.financeService.createApInvoice(body, req.user);
  }

  // V2 fidelity: AP 付款核销
  @Post('ap-payment')
  async payApInvoice(@Body() body: any, @Req() req: any) {
    return await this.financeService.payApInvoice(body, req.user);
  }

  // V2 fidelity: 登记收入 / AR 自动核销 (POST 不与现有 GET income 冲突)
  @Post('income')
  async registerIncome(@Body() body: any, @Req() req: any) {
    return await this.financeService.registerIncome(body, req.user);
  }

  // V2 fidelity: 三级费用审批（独立路径，不影响旧单步 approve）
  @Post('expense/:txn_id/approve-chain')
  async approveExpenseChain(@Param('txn_id') txnId: string, @Body() body: any, @Req() req: any) {
    return await this.financeService.approveExpenseChain(txnId, body, req.user);
  }

  @Get('cashflow')
  async getCashflow(@Query('period') period: string) {
    return await this.financeService.getCashflow(period);
  }

  @Get('summary')
  async getSummary() {
    return await this.financeService.getSummary();
  }

  @Post('expense')
  async submitExpense(@Body() dto: any, @Req() req: any) {
    const userId = req.user?.userId || 1;
    return await this.financeService.submitExpense(dto, userId);
  }

  @Post('expense/:txn_id/approve')
  async approveExpense(@Param('txn_id') txnId: string) {
    return await this.financeService.approveExpense(txnId);
  }

  @Get('aging-overview')
  async getAgingOverview() {
    return await this.financeService.getAgingOverview();
  }


  @Get('invoices')
  async getInvoices() {
    return { code: 200, data: [] };
  }

  // ─── 移动端资金账户与流水（MobileCashDiary） ──────────────────────────────
  @Get('accounts')
  async getAccounts() {
    return await this.financeService.getAccounts();
  }

  @Get('transactions')
  async getTransactions(@Query('account_code') accountCode?: string) {
    return await this.financeService.getTransactions(accountCode);
  }

  // ─── 移动端客户应收（MobileCustomerAR） ───────────────────────────────────
  @Get('income')
  async getIncome(@Query('month') month?: string) {
    return await this.financeService.getIncome(month);
  }
}

