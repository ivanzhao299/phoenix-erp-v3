import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { ProductMasterService, ProductSku } from '../services/product-master.service';

/**
 * ProductSkusController — /api/product-master/skus
 *
 * SKU 主数据 CRUD。
 */
@Controller('api/product-master/skus')
@UseGuards(AuthGuard('jwt'))
export class ProductSkusController {
  constructor(private readonly svc: ProductMasterService) {}

  @Get()
  @UseGuards(MenuGuard)
  @RequireMenu('MENU_MASTER_SKU', 'V')
  async list(
    @Query('product_code') product_code?: string,
    @Query('grade_code')   grade_code?: string,
    @Query('spec_code')    spec_code?: string,
    @Query('status')       status?: string,
  ) {
    const rows = await this.svc.listSkus({ product_code, grade_code, spec_code, status });
    return { code: 200, data: rows };
  }

  @Get(':skuCode')
  @UseGuards(MenuGuard)
  @RequireMenu('MENU_MASTER_SKU', 'V')
  async detail(@Param('skuCode') skuCode: string) {
    const data = await this.svc.getSku(skuCode);
    return { code: 200, data };
  }

  @Post()
  @UseGuards(MenuGuard)
  @RequireMenu('MENU_MASTER_SKU', 'E')
  async create(@Body() dto: ProductSku) {
    const data = await this.svc.createSku(dto);
    return { code: 200, data };
  }

  @Put(':skuCode')
  @UseGuards(MenuGuard)
  @RequireMenu('MENU_MASTER_SKU', 'E')
  async update(@Param('skuCode') skuCode: string, @Body() dto: Partial<ProductSku>) {
    const data = await this.svc.updateSku(skuCode, dto);
    return { code: 200, data };
  }
}
