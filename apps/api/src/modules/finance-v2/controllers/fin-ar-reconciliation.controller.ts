import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { ArReconciliationService } from '../services/ar-reconciliation.service';

/**
 * g199-C AR 三方对账(/api/v2/finance/ar-reconciliation)
 * 业务侧 fin_ar_invoices ↔ ERP fin_ar_ledger ↔ 好业财 chanjet_ar_snapshot
 *
 * 权限:沿用 MENU_FIN2_AR_LEDGER:V(看总账即可看对账;入账权 E 在 chanjet-sync 页)
 */
@Controller('api/v2/finance/ar-reconciliation')
@UseGuards(MenuGuard, DataScopeGuard)
export class FinArReconciliationController {
  constructor(private readonly svc: ArReconciliationService) {}

  /** 公司 / 期间筛选维度 */
  @Get('dimensions')
  @RequireMenu('MENU_FIN2_AR_LEDGER', 'V')
  dimensions() {
    return this.svc.dimensions();
  }

  /** 三方对账主表 */
  @Get()
  @RequireMenu('MENU_FIN2_AR_LEDGER', 'V')
  async reconcile(
    @Query('companyCode') companyCode: string,
    @Query('periodDate') periodDate: string,
  ) {
    if (!periodDate) return { success: false, error: 'periodDate 必填(YYYY-MM-DD)' };
    try {
      const r = await this.svc.reconcile(companyCode || undefined, periodDate);
      return { success: true, ...r };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  }
}
