import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { ProductMasterService, PackagingSpec } from '../services/product-master.service';

/**
 * PackagingSpecsController — /api/product-master/specs
 *
 * 包装规格主数据 CRUD。
 */
@Controller('api/product-master/specs')
@UseGuards(AuthGuard('jwt'))
export class PackagingSpecsController {
  constructor(private readonly svc: ProductMasterService) {}

  @Get()
  @UseGuards(MenuGuard)
  @RequireMenu('MENU_MASTER_PACKAGING', 'V')
  async list(@Query('status') status?: string) {
    const rows = status === 'ALL'
      ? await this.svc.listAllSpecs()
      : await this.svc.listSpecs(status);
    return { code: 200, data: rows };
  }

  @Get(':specCode')
  @UseGuards(MenuGuard)
  @RequireMenu('MENU_MASTER_PACKAGING', 'V')
  async detail(@Param('specCode') specCode: string) {
    const data = await this.svc.getSpec(specCode);
    return { code: 200, data };
  }

  @Post()
  @UseGuards(MenuGuard)
  @RequireMenu('MENU_MASTER_PACKAGING', 'E')
  async create(@Body() dto: PackagingSpec) {
    const data = await this.svc.createSpec(dto);
    return { code: 200, data };
  }

  @Put(':specCode')
  @UseGuards(MenuGuard)
  @RequireMenu('MENU_MASTER_PACKAGING', 'E')
  async update(@Param('specCode') specCode: string, @Body() dto: Partial<PackagingSpec>) {
    const data = await this.svc.updateSpec(specCode, dto);
    return { code: 200, data };
  }
}
