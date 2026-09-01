import { Controller, Post, Put, Delete, Get, Query, Req, UseGuards, GoneException } from '@nestjs/common';
import { StoreService } from './store.service';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';

// [Fix Pack 1 — HIGH-3] 添加 DataScopeGuard
@Controller('api/v3/store')
@UseGuards(MenuGuard, DataScopeGuard)
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  @Post('daily-close')
  @RequireMenu('MENU_FIN_CLOSE', 'C') // 结账操作映射到财务结算相关的菜单权限
  async submitDailyClose() {
    throw legacyStoreWriteGone();
  }

  @Put('daily-close/:id')
  @RequireMenu('MENU_FIN_CLOSE', 'E')
  async updateDailyClose() {
    throw legacyStoreWriteGone();
  }

  @Post('daily-close/:id/close')
  @RequireMenu('MENU_FIN_CLOSE', 'A') // 提交给财务，需要较高权限或者复核权限
  async closeStoreDay() {
    throw legacyStoreWriteGone();
  }

  // ─── V2 fidelity: 门店日结双账联动 ────────────────────────────────────────
  // 来源：_archive/phoenix-backend-v2-sqlite/src/routes/dailyClose.js
  // 路径：/api/v3/store/daily-close-v2/* (与现有 entity-based 路由共存)

  /** 日结预览 — 聚合 pos_sales */
  @Get('daily-close-v2/preview')
  @RequireMenu('MENU_FIN_CLOSE', 'V')
  async previewV2DailyClose(@Query() query: any, @Req() req: any) {
    return await this.storeService.previewDailyClose(query, req.user);
  }

  /** 日结提交 — 原子事务 + acc_ledger + fin_transactions */
  @Post('daily-close-v2/submit')
  @RequireMenu('MENU_FIN_CLOSE', 'C')
  async submitV2DailyClose() {
    throw legacyStoreWriteGone();
  }

  /** 日结历史 */
  @Get('daily-close-v2')
  @RequireMenu('MENU_FIN_CLOSE', 'V')
  async listV2DailyClose(@Query() query: any, @Req() req: any) {
    return await this.storeService.listDailyClose(query, req.user);
  }
}

@Controller('api/v3/pos')
export class RetiredPosController {
  @Post('sales')
  createSale() { throw legacyStoreWriteGone(); }

  @Put('sales/:id')
  updateSale() { throw legacyStoreWriteGone(); }

  @Delete('sales/:id')
  deleteSale() { throw legacyStoreWriteGone(); }

  @Post('sales/:id/refund')
  refundSale() { throw legacyStoreWriteGone(); }

  @Post('sessions')
  openSession() { throw legacyStoreWriteGone(); }

  @Post('sessions/close')
  closeSession() { throw legacyStoreWriteGone(); }

  @Post('losses/:id/approve')
  approveLoss() { throw legacyStoreWriteGone(); }

  @Post('receiving/:id/confirm')
  confirmReceiving() { throw legacyStoreWriteGone(); }

  @Post('replenish/:id/approve')
  approveReplenishment() { throw legacyStoreWriteGone(); }
}

function legacyStoreWriteGone(): GoneException {
  return new GoneException('旧门店 POS/日结写链已退役，请使用 /api/v2/store-sales 与 /api/v2/store-settlements');
}
