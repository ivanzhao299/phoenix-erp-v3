import {
  Controller, Get, Query, UseGuards, DefaultValuePipe, ParseIntPipe,
} from '@nestjs/common';
import { AuthGuard }           from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { SalesAnalyticsService } from '../services/sales-analytics.service';

/**
 * SalesAnalyticsController — Sales V2 Phase 8
 *
 * 经营分析 Runtime REST API。
 *
 * 路由前缀：/api/v2/sales/analytics
 * 权限：    MENU_SALES2_REPORT
 *
 * 全部只读。全部 DataScope（company_code）。
 */
@Controller('api/v2/sales/analytics')
@UseGuards(AuthGuard('jwt'), MenuGuard, DataScopeGuard)
export class SalesAnalyticsController {
  constructor(private readonly analytics: SalesAnalyticsService) {}

  // ── 1. 经营总览 ────────────────────────────────────────────────────────────

  @Get('overview')
  @RequireMenu('MENU_SALES2_REPORT', 'V')
  getOverview(@Query('companyCode') companyCode?: string) {
    return this.analytics.getOverview(companyCode);
  }

  // ── 2. 销售趋势 ────────────────────────────────────────────────────────────

  @Get('sales-trend')
  @RequireMenu('MENU_SALES2_REPORT', 'V')
  getSalesTrend(
    @Query('dateFrom')   dateFrom?: string,
    @Query('dateTo')     dateTo?: string,
    @Query('groupBy')    groupBy?: 'day' | 'week' | 'month',
    @Query('companyCode') companyCode?: string,
  ) {
    return this.analytics.getSalesTrend({ dateFrom, dateTo, groupBy, companyCode });
  }

  // ── 3. TOP 客户 ────────────────────────────────────────────────────────────

  @Get('top-customers')
  @RequireMenu('MENU_SALES2_REPORT', 'V')
  getTopCustomers(
    @Query('companyCode') companyCode?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.analytics.getTopCustomers(companyCode, limit);
  }

  // ── 4. TOP 产品 ────────────────────────────────────────────────────────────

  @Get('top-products')
  @RequireMenu('MENU_SALES2_REPORT', 'V')
  getTopProducts(
    @Query('companyCode') companyCode?: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit = 20,
  ) {
    return this.analytics.getTopProducts(companyCode, limit);
  }

  // ── 5. 渠道分析 ────────────────────────────────────────────────────────────

  @Get('channel-analysis')
  @RequireMenu('MENU_SALES2_REPORT', 'V')
  getChannelAnalysis(@Query('companyCode') companyCode?: string) {
    return this.analytics.getChannelAnalysis(companyCode);
  }

  // ── 6. 价格异常 ────────────────────────────────────────────────────────────

  @Get('price-anomalies')
  @RequireMenu('MENU_SALES2_REPORT', 'V')
  getPriceAnomalies(
    @Query('companyCode') companyCode?: string,
    @Query('threshold', new DefaultValuePipe(5), ParseIntPipe) threshold = 5,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe)   limit = 100,
  ) {
    return this.analytics.getPriceAnomalies({ companyCode, threshold, limit });
  }

  // ── 7. 配送分析 ────────────────────────────────────────────────────────────

  @Get('delivery-performance')
  @RequireMenu('MENU_SALES2_REPORT', 'V')
  getDeliveryPerformance(
    @Query('companyCode') companyCode?: string,
    @Query('dateFrom')    dateFrom?: string,
    @Query('dateTo')      dateTo?: string,
  ) {
    return this.analytics.getDeliveryPerformance({ companyCode, dateFrom, dateTo });
  }

  // ── 8. 退货分析 ────────────────────────────────────────────────────────────

  @Get('return-analysis')
  @RequireMenu('MENU_SALES2_REPORT', 'V')
  getReturnAnalysis(@Query('companyCode') companyCode?: string) {
    return this.analytics.getReturnAnalysis(companyCode);
  }

  // ── 9. 损耗分析 ────────────────────────────────────────────────────────────

  @Get('loss-analysis')
  @RequireMenu('MENU_SALES2_REPORT', 'V')
  getLossAnalysis(@Query('companyCode') companyCode?: string) {
    return this.analytics.getLossAnalysis(companyCode);
  }

  // ── 10. 库存周转 ────────────────────────────────────────────────────────────

  @Get('inventory-turnover')
  @RequireMenu('MENU_SALES2_REPORT', 'V')
  getInventoryTurnover(@Query('companyCode') companyCode?: string) {
    return this.analytics.getInventoryTurnover(companyCode);
  }

  // ── 11. 信用风险 ────────────────────────────────────────────────────────────

  @Get('credit-risk')
  @RequireMenu('MENU_SALES2_REPORT', 'V')
  getCreditRisk(@Query('companyCode') companyCode?: string) {
    return this.analytics.getCreditRisk(companyCode);
  }
}
