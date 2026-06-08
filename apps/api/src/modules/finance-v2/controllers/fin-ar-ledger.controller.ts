import {
  Controller, Get, Query, UseGuards,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard }         from '../../org/guards/data-scope.guard';
import { DataScopeContext }       from '../../org/services/data-scope.service';
import { ClsService }             from 'nestjs-cls';
import { ArLedgerService }        from '../services/ar-ledger.service';

/**
 * FinArLedgerController — 应收总账（G41）
 *
 * 路由前缀：/api/v2/finance/ar-ledger
 * 权限：MENU_FIN2_AR_LEDGER 'V'（刘杰 ROLE_FINANCE_REVIEW_MANAGER 已授）。
 * 只读；DataScope 在 Service 层按 company_code 过滤（GROUP 用户看全部）。
 */
@Controller('api/v2/finance/ar-ledger')
@UseGuards(MenuGuard, DataScopeGuard)
export class FinArLedgerController {
  constructor(
    private readonly svc: ArLedgerService,
    private readonly cls: ClsService,
  ) {}

  private get scopedUser() {
    const user = this.cls.get('user') as any;
    const scope = this.cls.get('dataScope') as DataScopeContext | undefined;
    return {
      ...user,
      dataScope: {
        scopeAll:     scope ? scope.isGlobal : false,
        companyCodes: scope ? scope.allowedCompanyCodes : [],
      },
    };
  }

  /** 场 / 期间筛选维度 */
  @Get('dimensions')
  @RequireMenu('MENU_FIN2_AR_LEDGER', 'V')
  dimensions() {
    return this.svc.dimensions(this.scopedUser);
  }

  /** 应收总账明细 + 合计 */
  @Get()
  @RequireMenu('MENU_FIN2_AR_LEDGER', 'V')
  list(
    @Query('farmCode') farmCode?: string,
    @Query('periodDate') periodDate?: string,
  ) {
    return this.svc.list(this.scopedUser, { farmCode, periodDate });
  }
}
