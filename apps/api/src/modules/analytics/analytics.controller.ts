import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { GroupAnalyticsService } from './services/group-analytics.service';
import { FinanceAnalyticsService } from './services/finance-analytics.service';
import { SalesAnalyticsAggregatorService } from './services/sales-analytics-aggregator.service';
import { InventoryAnalyticsService } from './services/inventory-analytics.service';
import { ProductionAnalyticsService } from './services/production-analytics.service';
import { ShareholderAnalyticsService } from './services/shareholder-analytics.service';
import { ExceptionAnalyticsService } from './services/exception-analytics.service';
import { ForecastAnalyticsService } from './services/forecast-analytics.service';

/**
 * G6 经营分析中心 — 统一对外入口
 *
 * 所有端点支持可选过滤：
 *   ?companyCode=...     单公司过滤
 *   ?projectCode=...     项目过滤
 *   ?dateFrom=YYYY-MM-DD ?dateTo=YYYY-MM-DD
 */
@Controller('api/v2/analytics')
@UseGuards(AuthGuard('jwt'), MenuGuard)
@RequireMenu('MENU_DASHBOARD', 'V', ['MENU_ANALYTICS'])
export class AnalyticsController {
  constructor(
    private readonly group:        GroupAnalyticsService,
    private readonly finance:      FinanceAnalyticsService,
    private readonly sales:        SalesAnalyticsAggregatorService,
    private readonly inventory:    InventoryAnalyticsService,
    private readonly production:   ProductionAnalyticsService,
    private readonly shareholders: ShareholderAnalyticsService,
    private readonly exceptions:   ExceptionAnalyticsService,
    private readonly forecast:     ForecastAnalyticsService,
  ) {}

  @Get('group')         group_(@Query() q: any) { return this.group.compute(q); }
  @Get('finance')       finance_(@Query() q: any) { return this.finance.compute(q); }
  @Get('sales')         sales_(@Query() q: any) { return this.sales.compute(q); }
  @Get('inventory')     inventory_(@Query() q: any) { return this.inventory.compute(q); }
  @Get('production')    production_(@Query() q: any) { return this.production.compute(q); }
  @Get('shareholders')  shareholders_(@Query() q: any) { return this.shareholders.compute(q); }
  @Get('exceptions')    exceptions_() { return this.exceptions.list(); }
  @Get('forecast')      forecast_(@Query() q: any) { return this.forecast.compute(q); }
}
