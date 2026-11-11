import { Controller, Get, Post, Put, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import { SkuPolicy } from '../services/sku-policy';
import { MenuGuard } from '../../../common/guards/menu.guard';
import { SkuAccessGuard } from '../../../common/guards/sku-access.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { ProductMasterService, ProductSku } from '../services/product-master.service';

/**
 * ProductSkusController — /api/product-master/skus
 *
 * SKU 主数据 CRUD。
 * JWT + explicit SKU permission compatibility; global ACTIVE lookup needs no edit permission.
 */
@Controller('api/product-master/skus')
@UseGuards(MenuGuard, SkuAccessGuard)
export class ProductSkusController {
  constructor(private readonly svc: ProductMasterService) {}

  @Get()
  async list(
    @Query('product_code') product_code?: string,
    @Query('grade_code')   grade_code?: string,
    @Query('spec_code')    spec_code?: string,
    @Query('status')       status?: string,
    @Query('usage') usage?: string,
  ) {
    const rows = await this.svc.listSkus({ product_code, grade_code, spec_code, status, usage: SkuPolicy.usage(usage) });
    return { code: 200, data: rows };
  }

  @Get('commercial-candidates')
  @UseGuards(DataScopeGuard)
  async commercialCandidates(
    @Query('companyCode') companyCode: string,
    @Query('product_code') product_code?: string,
    @Query('grade_code') grade_code?: string,
    @Query('spec_code') spec_code?: string,
    @Query('usage') usage?: string,
  ) {
    const rows = await this.svc.listCommercialSkus({ companyCode, product_code, grade_code, spec_code,
      usage: SkuPolicy.usage(usage ?? 'sale-stock') });
    return { code: 200, data: rows };
  }

  @Get(':skuCode')
  async detail(@Param('skuCode') skuCode: string) {
    const data = await this.svc.getSku(skuCode);
    return { code: 200, data };
  }

  @Post()
  async create(@Body() dto: ProductSku, @Req() req: any) {
    const data = await this.svc.createSku(dto, req.user?.username);
    return { code: 200, data };
  }

  @Put(':skuCode')
  async update(@Param('skuCode') skuCode: string, @Body() dto: Partial<ProductSku>, @Req() req: any) {
    const data = await this.svc.updateSku(skuCode, dto, req.user?.username);
    return { code: 200, data };
  }
}
