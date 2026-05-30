import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { ProductMasterService } from '../services/product-master.service';

/**
 * ProductCatalogController — /api/product-master/catalog
 *
 * 产品目录聚合查询，供各 Runtime 下拉框、Workflow 数据源等使用。
 * 查看权限（V）即可访问，不区分等级/规格/SKU 单独权限。
 * [Fix Pack 1 — HIGH-3] 统一至类级 MenuGuard + DataScopeGuard
 */
@Controller('api/product-master/catalog')
@UseGuards(MenuGuard, DataScopeGuard)
export class ProductCatalogController {
  constructor(private readonly svc: ProductMasterService) {}

  /** GET /api/product-master/catalog/grades — 供前端下拉框：仅返回 ACTIVE 等级 */
  @Get('grades')
  @RequireMenu('MENU_MASTER_PRODUCT', 'V')
  async grades() {
    const data = await this.svc.listGrades();
    return { code: 200, data };
  }

  /** GET /api/product-master/catalog/specs — 供前端下拉框：仅返回 ACTIVE 规格 */
  @Get('specs')
  @RequireMenu('MENU_MASTER_PRODUCT', 'V')
  async specs() {
    const data = await this.svc.listSpecs();
    return { code: 200, data };
  }

  /** GET /api/product-master/catalog/skus?product_code=xxx — 按产品过滤 SKU */
  @Get('skus')
  @RequireMenu('MENU_MASTER_PRODUCT', 'V')
  async skus(@Query('product_code') productCode?: string) {
    const data = await this.svc.listSkus({ product_code: productCode, status: 'ACTIVE' });
    return { code: 200, data };
  }

  /** GET /api/product-master/catalog/products — 产品档案列表 */
  @Get('products')
  @RequireMenu('MENU_MASTER_PRODUCT', 'V')
  async products() {
    const data = await this.svc.listProducts();
    return { code: 200, data };
  }
}
