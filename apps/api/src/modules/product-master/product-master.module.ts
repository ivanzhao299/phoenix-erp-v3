import { Module } from '@nestjs/common';
import { ProductMasterService } from './services/product-master.service';
import { ProductGradesController } from './controllers/product-grades.controller';
import { PackagingSpecsController } from './controllers/packaging-specs.controller';
import { ProductSkusController } from './controllers/product-skus.controller';
import { ProductCatalogController } from './controllers/product-catalog.controller';
import { LookupController } from './controllers/lookup.controller';

/**
 * ProductMasterModule — Phase H2
 *
 * 产品主数据基础层：
 *   - product_grades   等级主数据
 *   - packaging_specs  包装规格主数据
 *   - product_skus     SKU 主数据
 *
 * Phase H2 约束：只管理主数据层，不修改任何交易表（sal_、inv_、pos_ 前缀表）。
 * 为 H3（价格接 SKU）和 H4（库存批次统一 grade_code）做准备。
 */
@Module({
  controllers: [
    ProductGradesController,
    PackagingSpecsController,
    ProductSkusController,
    ProductCatalogController,
    LookupController,
  ],
  providers: [ProductMasterService],
  exports: [ProductMasterService],
})
export class ProductMasterModule {}
