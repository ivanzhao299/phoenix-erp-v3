import {
  Controller, Get, Post, Body, Query,
  UseGuards, ParseIntPipe, DefaultValuePipe,
} from '@nestjs/common';
import { AuthGuard }        from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { EggInventoryService }          from '../services/egg-inventory.service';
import { EggInventorySchedulerService } from '../services/egg-inventory-scheduler.service';

/**
 * EggInventoryController — Sales V2 Phase 7 + Phase H4
 *
 * 鸡蛋库存 Runtime REST API。
 *
 * Phase H4 新增参数：
 *   - GET  /batches     支持 skuCode 查询参数（PATH A 精确匹配）
 *   - POST /batches     支持 skuCode 创建批次（自动推导 product/grade/spec）
 *   - POST /allocate    支持 skuCode FIFO 分配（PATH A）
 *
 * 路由前缀：/api/v2/sales/inventory
 * 权限：    MENU_SALES2_INVENTORY
 */
@Controller('api/v2/sales/inventory')
@UseGuards(AuthGuard('jwt'), MenuGuard, DataScopeGuard)
export class EggInventoryController {
  constructor(
    private readonly eggInv:    EggInventoryService,
    private readonly scheduler: EggInventorySchedulerService,
  ) {}

  // ── 批次列表 ──────────────────────────────────────────────────────────────

  @Get('batches')
  @RequireMenu('MENU_SALES2_INVENTORY', 'V')
  getBatches(
    @Query('productCode')     productCode?:     string,
    @Query('companyCode')     companyCode?:     string,
    @Query('gradeCode')       gradeCode?:       string,
    @Query('includeExpiring') includeExpiring?: string,
    /** Phase H4: SKU 精确过滤（优先于 productCode + gradeCode） */
    @Query('skuCode')         skuCode?:         string,
  ) {
    return this.eggInv.getAvailableBatches({
      productCode:       productCode ?? (skuCode ? undefined : 'EGG'),
      companyCode,
      gradeCode,
      includingExpiring: includeExpiring === 'true',
      skuCode,
    });
  }

  // ── 临期库存 ──────────────────────────────────────────────────────────────

  @Get('expiring')
  @RequireMenu('MENU_SALES2_INVENTORY', 'V')
  getExpiring(
    @Query('companyCode') companyCode?: string,
    @Query('days', new DefaultValuePipe(7), ParseIntPipe) days?: number,
  ) {
    return this.eggInv.getExpiringBatches({ companyCode, days });
  }

  // ── Dashboard 统计 ────────────────────────────────────────────────────────

  @Get('stats')
  @RequireMenu('MENU_SALES2_INVENTORY', 'V')
  getStats(@Query('companyCode') companyCode?: string) {
    return this.eggInv.getDashboardStats(companyCode);
  }

  // ── 损耗分析 ──────────────────────────────────────────────────────────────

  @Get('loss-analysis')
  @RequireMenu('MENU_SALES2_INVENTORY', 'V')
  getLossAnalysis(@Query('companyCode') companyCode?: string) {
    return this.eggInv.getLossAnalysis(companyCode);
  }

  // ── 创建生产批次 ──────────────────────────────────────────────────────────

  @Post('batches')
  @RequireMenu('MENU_SALES2_INVENTORY', 'C')
  createBatch(@Body() body: {
    companyCode:    string;
    warehouseCode?: string;
    eggDate:        string;
    qualityGrade?:  string;
    packagingSpec?: string;
    productCode:    string;
    qty:            number;
    shelfDays?:     number;
    sourceNo?:      string;
    /** Phase H4: 优先使用 SKU 填充产品/等级/规格 */
    skuCode?:       string;
    gradeCodeStd?:  string;
    specCode?:      string;
  }) {
    return this.eggInv.createProductionBatch(body);
  }

  // ── FIFO 手动分配（测试/调整用） ─────────────────────────────────────────

  @Post('allocate')
  @RequireMenu('MENU_SALES2_INVENTORY', 'E')
  allocate(@Body() body: {
    productCode:  string;
    gradeCode?:   string;
    companyCode:  string;
    qty:          number;
    refNo:        string;
    note?:        string;
    /** Phase H4: SKU 优先分配路径 */
    skuCode?:     string;
  }) {
    return this.eggInv.allocateByFIFO({
      productCode: body.productCode,
      gradeCode:   body.gradeCode,
      companyCode: body.companyCode,
      qty:         body.qty,
      refNo:       body.refNo,
      note:        body.note ?? '手动分配',
      skuCode:     body.skuCode,
    });
  }

  // ── 手动标记过期（管理员） ────────────────────────────────────────────────

  @Post('mark-expired')
  @RequireMenu('MENU_SALES2_INVENTORY', 'A')
  markExpired(@Query('companyCode') companyCode?: string) {
    return this.eggInv.markExpiredBatches(companyCode);
  }

  // ── 手动触发 Scheduler ────────────────────────────────────────────────────

  @Post('trigger-scheduler')
  @RequireMenu('MENU_SALES2_INVENTORY', 'A')
  triggerScheduler() {
    return this.scheduler.runManually();
  }
}
