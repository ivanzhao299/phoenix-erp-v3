import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { FarmEggService } from './farm-egg.service';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';

// [Fix Pack 1 — HIGH-2] 替换 AuthGuard → MenuGuard，添加 RequireMenu
// [Phase R1 — HIGH-3] 添加 DataScopeGuard
@Controller('api/farm/egg')
@UseGuards(MenuGuard, DataScopeGuard)
@RequireMenu('MENU_BREEDING', 'V')
export class FarmEggController {
  constructor(private svc: FarmEggService) {}

  /** GET /api/farm/egg/stock */
  @Get('stock')
  async getStock() {
    return { code: 200, data: await this.svc.getStock() };
  }

  /** GET /api/farm/egg/ledger?start=YYYY-MM-DD&end=YYYY-MM-DD */
  @Get('ledger')
  async getLedger(
    @Query('start') start: string,
    @Query('end') end: string,
  ) {
    const today = new Date();
    const fmt = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const s = start || fmt(today);
    const e = end   || fmt(today);
    return { code: 200, data: await this.svc.getLedger(s, e) };
  }

  // ── R1：Farm Egg 库存写能力已删除 ────────────────────────────────────────
  //   inbound / outbound / write-off 不再写库存。库存来源唯一由 InventorySourceMode 控制
  //   （TEMP_PRODUCTION_INBOUND / PACKAGING_INBOUND）。保留端点仅返回冻结提示，避免前端 404。
  private static readonly FROZEN = {
    code: 410,
    message:
      '鸡蛋库存已由库存来源模式统一管理（本入口不再生成库存）。请使用「日产蛋入库（临时生产入库）」或「包装作业中心」。',
  };

  /** POST /api/farm/egg/inbound —— R1 冻结（不再写库存） */
  @Post('inbound')
  async inbound() {
    return FarmEggController.FROZEN;
  }

  /** POST /api/farm/egg/outbound —— R1 冻结（不再扣库存） */
  @Post('outbound')
  async outbound() {
    return FarmEggController.FROZEN;
  }

  /** POST /api/farm/egg/write-off —— R1 冻结（不再报损库存） */
  @Post('write-off')
  async writeOff() {
    return FarmEggController.FROZEN;
  }
}
