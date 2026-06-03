import { Controller, Get, Param, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { TraceabilityService } from './traceability.service';

/**
 * TraceabilityController — 统一追溯 API（R5）
 * 路由前缀：/api/traceability
 * 权限：MENU_TRACEABILITY_VIEW（查看）；导出另用 MENU_TRACEABILITY_EXPORT。
 * DataScope：按 company_code 限制（普通用户禁止跨公司）。
 */
@Controller('api/traceability')
@UseGuards(AuthGuard('jwt'), MenuGuard, DataScopeGuard)
export class TraceabilityController {
  constructor(private readonly trace: TraceabilityService) {}

  /** 用户可见公司 scope（DataScopeGuard 注入 req.dataScope）；admin/空 → 不限制 */
  private scope(req: any): string[] | undefined {
    const s = req?.dataScope ?? req?.user?.dataScope;
    const codes = s?.allowedCompanyCodes ?? s?.companyCodes;
    if (!codes || !Array.isArray(codes) || codes.length === 0) return undefined; // 不限制（admin/全局）
    return codes;
  }

  @Get('batch/:batchNo')
  @RequireMenu('MENU_TRACEABILITY_VIEW', 'V')
  byBatch(@Param('batchNo') batchNo: string, @Req() req: any) {
    return this.trace.traceByBatch(batchNo, this.scope(req));
  }

  @Get('packaging/:packingCode')
  @RequireMenu('MENU_TRACEABILITY_VIEW', 'V')
  byPackaging(@Param('packingCode') packingCode: string, @Req() req: any) {
    return this.trace.traceByPackaging(packingCode, this.scope(req));
  }

  @Get('label/:labelCode')
  @RequireMenu('MENU_TRACEABILITY_VIEW', 'V')
  byLabel(@Param('labelCode') labelCode: string, @Req() req: any) {
    return this.trace.traceByLabel(labelCode, this.scope(req));
  }

  @Get('sales-order/:orderNo')
  @RequireMenu('MENU_TRACEABILITY_VIEW', 'V')
  bySalesOrder(@Param('orderNo') orderNo: string, @Req() req: any) {
    return this.trace.traceBySalesOrder(orderNo, this.scope(req));
  }

  @Get('customer/:customerCode')
  @RequireMenu('MENU_TRACEABILITY_VIEW', 'V')
  byCustomer(@Param('customerCode') customerCode: string, @Req() req: any) {
    return this.trace.traceByCustomer(customerCode, this.scope(req));
  }
}
