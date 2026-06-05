/**
 * Phoenix ERP V3 — G6 AnalyticsModule
 *
 * 经营分析中心聚合层。
 *
 * 原则（任务约束）：
 *   - 不新增业务流程 / 单据 / 模块
 *   - 只消费 G0-G5 已治理的可信数据
 *   - 业务模块禁止直接做跨域聚合 — 全部走本模块
 *
 * 8 个子中心（A-H）：
 *   A 集团经营  group       /api/v2/analytics/group
 *   B 财务      finance     /api/v2/analytics/finance
 *   C 销售      sales       /api/v2/analytics/sales        ← 复用 sales-v2/sales-analytics
 *   D 库存      inventory   /api/v2/analytics/inventory
 *   E 生产      production  /api/v2/analytics/production
 *   F 股东      shareholders /api/v2/analytics/shareholders
 *   G 异常      exceptions  /api/v2/analytics/exceptions   ← 转发 G5 /api/data-quality/alerts
 *   H 预测      forecast    /api/v2/analytics/forecast     ← 第一阶段简单预测（线性 / 移动平均）
 */
import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics.controller';
import { GroupAnalyticsService } from './services/group-analytics.service';
import { FinanceAnalyticsService } from './services/finance-analytics.service';
import { SalesAnalyticsAggregatorService } from './services/sales-analytics-aggregator.service';
import { InventoryAnalyticsService } from './services/inventory-analytics.service';
import { ProductionAnalyticsService } from './services/production-analytics.service';
import { ShareholderAnalyticsService } from './services/shareholder-analytics.service';
import { ExceptionAnalyticsService } from './services/exception-analytics.service';
import { ForecastAnalyticsService } from './services/forecast-analytics.service';
import { DataQualityModule } from '../data-quality/data-quality.module';

@Module({
  imports: [DataQualityModule],
  controllers: [AnalyticsController],
  providers: [
    GroupAnalyticsService,
    FinanceAnalyticsService,
    SalesAnalyticsAggregatorService,
    InventoryAnalyticsService,
    ProductionAnalyticsService,
    ShareholderAnalyticsService,
    ExceptionAnalyticsService,
    ForecastAnalyticsService,
  ],
})
export class AnalyticsModule {}
