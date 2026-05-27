import {
  Controller, Get, Post, Param, Query, UseGuards,
  ParseIntPipe, DefaultValuePipe, NotFoundException,
} from '@nestjs/common';
import { AuthGuard }        from '@nestjs/passport';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource }       from 'typeorm';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { CustomerCreditService }           from '../services/customer-credit.service';
import { CustomerCreditSchedulerService }  from '../services/customer-credit-scheduler.service';

/**
 * 客户信用控制 API
 * Sales V2 Phase 5
 *
 * 所有接口均需：
 *   · JwtAuthGuard    — JWT 认证
 *   · MenuGuard       — MENU_SALES2_CREDIT 角色检查
 *
 * 路由：/api/v2/sales/credit/... + /api/v2/sales/customers/:id/credit-*
 */
@Controller('api/v2/sales')
@UseGuards(AuthGuard('jwt'), MenuGuard)
export class CustomerCreditController {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly creditService:    CustomerCreditService,
    private readonly schedulerService: CustomerCreditSchedulerService,
  ) {}

  // ── 内部：按 ID 取 customer_no + company_code ─────────────────────────────

  private async resolveCustomer(id: string) {
    const rows = await this.ds.query(
      `SELECT customer_no, company_code FROM sal_customers WHERE id = $1`, [id],
    );
    if (!rows?.length) throw new NotFoundException(`客户 ${id} 不存在`);
    return rows[0] as { customer_no: string; company_code: string };
  }

  // ── 1. 客户信用分析快照 ──────────────────────────────────────────────────

  @Get('customers/:id/credit-analysis')
  @RequireMenu('MENU_SALES2_CREDIT', 'V')
  async getCreditAnalysis(@Param('id') id: string) {
    const { customer_no, company_code } = await this.resolveCustomer(id);
    return this.creditService.getCustomerArSnapshot(customer_no, company_code);
  }

  // ── 2. 客户 AR 账龄分析 ──────────────────────────────────────────────────

  @Get('customers/:id/ar-aging')
  @RequireMenu('MENU_SALES2_CREDIT', 'V')
  async getArAging(@Param('id') id: string) {
    return this.creditService.getArAging(id);
  }

  // ── 3. 刷新客户信用 ──────────────────────────────────────────────────────

  @Post('customers/:id/refresh-credit')
  @RequireMenu('MENU_SALES2_CREDIT', 'V')
  async refreshCredit(@Param('id') id: string) {
    await this.creditService.refreshCustomerCredit(id);
    const { customer_no, company_code } = await this.resolveCustomer(id);
    const snapshot = await this.creditService.getCustomerArSnapshot(customer_no, company_code);
    return { ok: true, snapshot };
  }

  // ── 4. 手动解冻客户 ──────────────────────────────────────────────────────

  @Post('customers/:id/unfreeze')
  @RequireMenu('MENU_SALES2_CREDIT', 'V')
  async unfreeze(@Param('id') id: string) {
    return this.creditService.unfreezeCustomer(id);
  }

  // ── 5. 逾期客户列表 ──────────────────────────────────────────────────────

  @Get('credit/overdue-customers')
  @RequireMenu('MENU_SALES2_CREDIT', 'V')
  async listOverdueCustomers(
    @Query('companyCode') companyCode?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.creditService.listOverdueCustomers(companyCode, page, limit);
  }

  // ── 6. 高风险客户列表 ────────────────────────────────────────────────────

  @Get('credit/high-risk-customers')
  @RequireMenu('MENU_SALES2_CREDIT', 'V')
  async listHighRiskCustomers(
    @Query('companyCode') companyCode?: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page?: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    return this.creditService.listHighRiskCustomers(companyCode, page, limit);
  }

  // ── 7. 手动触发全量信用刷新（管理员 / 财务） ─────────────────────────────

  @Post('credit/trigger-refresh')
  @RequireMenu('MENU_SALES2_CREDIT', 'V')
  async triggerRefresh() {
    return this.schedulerService.runManually();
  }
}
