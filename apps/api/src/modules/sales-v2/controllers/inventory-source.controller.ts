import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import {
  InventorySourceModeService, InventorySourceMode, ScopeLevel,
} from '../services/inventory-source-mode.service';
import { ProductionInboundService } from '../services/production-inbound.service';

/**
 * InventorySourceController — 库存来源模式治理 Phase P1A
 *
 * 路由前缀：/api/v2/inventory
 *   GET  source/mode        当前生效模式（支持按鸡舍核对命中范围）         — MENU_INV_SOURCE_MODE:V
 *   GET  source/configs     全部模式配置                                — MENU_INV_SOURCE_MODE:V
 *   GET  source/audit       切换审计日志                                — MENU_INV_SOURCE_MODE:V
 *   POST source/assess-risk 切换前风险评估（只读，不切换）             — MENU_INV_SOURCE_MODE:V
 *   POST source/switch      执行切换（仅 ADMIN/CEO/FACTORY_MGR，'A' 权）— MENU_INV_SOURCE_MODE:A
 *   GET  production-inbound/availability  按鸡舍核验临时入库入口  — MENU_PROD_INBOUND:V
 *   POST production-inbound  临时生产入库（日产蛋直接形成销售库存）     — MENU_PROD_INBOUND:C
 */
@Controller('api/v2/inventory')
@UseGuards(AuthGuard('jwt'), MenuGuard, DataScopeGuard)
export class InventorySourceController {
  constructor(
    private readonly modeSvc: InventorySourceModeService,
    private readonly prodInbound: ProductionInboundService,
  ) {}

  @Get('source/mode')
  @RequireMenu('MENU_INV_SOURCE_MODE', 'V')
  async getMode(@Query('siteCode') siteCode?: string, @Query('companyCode') companyCode?: string, @Query('houseCode') houseCode?: string) {
    if (houseCode !== undefined) return this.prodInbound.effectiveSourceMode(houseCode);
    const mode = await this.modeSvc.resolveMode({ siteCode, companyCode });
    return { mode };
  }

  @Get('source/configs')
  @RequireMenu('MENU_INV_SOURCE_MODE', 'V')
  listConfigs() {
    return this.modeSvc.listConfigs();
  }

  @Get('source/audit')
  @RequireMenu('MENU_INV_SOURCE_MODE', 'V')
  listAudit(@Query('limit') limit?: string) {
    return this.modeSvc.listAudit(limit ? Number(limit) : 50);
  }

  @Post('source/assess-risk')
  @RequireMenu('MENU_INV_SOURCE_MODE', 'V')
  assessRisk(@Body() body: { scopeLevel: ScopeLevel; scopeCode: string; newMode: InventorySourceMode }) {
    return this.modeSvc.assessSwitchRisk(body.scopeLevel, body.scopeCode, body.newMode);
  }

  // 切换需 'A' 权限（sys_role_menu_permission 中仅 ADMIN/CEO/FACTORY_MGR 持有 MENU_INV_SOURCE_MODE:A）
  @Post('source/switch')
  @RequireMenu('MENU_INV_SOURCE_MODE', 'A')
  switchMode(@Body() body: {
    scopeLevel: ScopeLevel; scopeCode: string; newMode: InventorySourceMode;
    remark?: string; confirmRisk?: boolean;
  }) {
    return this.modeSvc.switchMode(body);
  }

  @Get('production-inbound/availability')
  @RequireMenu('MENU_PROD_INBOUND', 'V')
  productionInboundAvailability(@Query('houseCode') houseCode: string, @Query('eggDate') eggDate?: string) {
    return this.prodInbound.temporaryAvailability(houseCode, eggDate);
  }

  @Get('production-inbound/locations')
  @RequireMenu('MENU_PROD_INBOUND', 'V')
  productionInboundLocations(@Query('houseCode') houseCode: string, @Query('warehouseCode') warehouseCode: string) {
    return this.prodInbound.temporaryLocations(houseCode, warehouseCode);
  }

  @Post('production-inbound')
  @RequireMenu('MENU_PROD_INBOUND', 'C')
  productionInbound(@Body() body: {
    companyCode?: string; siteCode?: string; houseCode?: string; warehouseCode?: string; locationCode?: string;
    eggDate: string; items: Array<{ grade: string; qty: number; spec?: string }>;
    operator?: string; remark?: string; idempotencyKey?: string;
  }) {
    return this.prodInbound.recordProductionInbound(body);
  }
}
