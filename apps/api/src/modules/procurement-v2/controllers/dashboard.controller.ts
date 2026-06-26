import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../../modules/org/guards/data-scope.guard';
import { DashboardService }       from '../services/dashboard.service';
import { QueryDashboardDto }       from '../dto/query-dashboard.dto';

@Controller('api/v2/procurement/dashboard')
@UseGuards(MenuGuard, DataScopeGuard)
export class DashboardController {
  constructor(private readonly svc: DashboardService) {}

  // GET /api/v2/procurement/dashboard/summary
  @Get('summary')
  @RequireMenu('MENU_PRC2_DASHBOARD', 'V')
  getSummary(@Query() q: QueryDashboardDto) {
    return this.svc.getSummary(q);
  }

  // GET /api/v2/procurement/dashboard/ap-aging
  @Get('ap-aging')
  @RequireMenu('MENU_PRC2_DASHBOARD', 'V', ['MENU_PRC2_PAYMENT'])
  getApAging(@Query() q: QueryDashboardDto) {
    return this.svc.getApAging(q);
  }

  // GET /api/v2/procurement/dashboard/project-cost
  @Get('project-cost')
  @RequireMenu('MENU_PRC2_DASHBOARD', 'V', ['MENU_PRC2_PROJECT', 'MENU_PRC2_ORDER'])
  getProjectCost(@Query() q: QueryDashboardDto) {
    return this.svc.getProjectCost(q);
  }

  // GET /api/v2/procurement/dashboard/payment-trend
  @Get('payment-trend')
  @RequireMenu('MENU_PRC2_DASHBOARD', 'V', ['MENU_PRC2_PAYMENT'])
  getPaymentTrend(@Query() q: QueryDashboardDto) {
    return this.svc.getPaymentTrend(q);
  }

  // GET /api/v2/procurement/dashboard/shareholder-summary
  @Get('shareholder-summary')
  @RequireMenu('MENU_PRC2_FUND', 'V')
  getShareholderSummary(@Query() q: QueryDashboardDto) {
    return this.svc.getShareholderSummary(q);
  }

  // GET /api/v2/procurement/dashboard/shipment-status
  @Get('shipment-status')
  @RequireMenu('MENU_PRC2_DASHBOARD', 'V', ['MENU_PRC2_SHIPMENT', 'MENU_PRC2_RECEIPT'])
  getShipmentStatus(@Query() q: QueryDashboardDto) {
    return this.svc.getShipmentStatus(q);
  }

  // GET /api/v2/procurement/dashboard/supplier-performance
  @Get('supplier-performance')
  @RequireMenu('MENU_PRC2_DASHBOARD', 'V', ['MENU_PRC2_SUPPLIER', 'MENU_PRC2_ORDER'])
  getSupplierPerformance(@Query() q: QueryDashboardDto) {
    return this.svc.getSupplierPerformance(q);
  }
}
