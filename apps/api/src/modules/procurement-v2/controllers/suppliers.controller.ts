import {
  Controller, Get, Post, Patch,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../../modules/org/guards/data-scope.guard';

import { SuppliersService } from '../services/suppliers.service';
import { CreateSupplierDto } from '../dto/create-supplier.dto';
import { UpdateSupplierDto } from '../dto/update-supplier.dto';
import { QuerySupplierDto } from '../dto/query-supplier.dto';
import { UpdateSupplierStatusDto } from '../dto/update-supplier-status.dto';

const MENU_SUPPLIER = 'MENU_PRC2_SUPPLIER';

@Controller('api/v2/procurement/suppliers')
@UseGuards(MenuGuard, DataScopeGuard)
export class SuppliersController {
  constructor(private readonly svc: SuppliersService) {}

  /** GET /api/v2/procurement/suppliers  — 分页列表 */
  @Get()
  @RequireMenu(MENU_SUPPLIER, 'V')
  list(@Query() query: QuerySupplierDto) {
    return this.svc.list(query);
  }

  /** GET /api/v2/procurement/suppliers/:id  — 详情 */
  @Get(':id')
  @RequireMenu(MENU_SUPPLIER, 'V')
  findById(@Param('id') id: string) {
    return this.svc.findById(id);
  }

  /** POST /api/v2/procurement/suppliers  — 新建 */
  @Post()
  @RequireMenu(MENU_SUPPLIER, 'C')
  create(@Body() dto: CreateSupplierDto) {
    return this.svc.create(dto);
  }

  /** PATCH /api/v2/procurement/suppliers/:id  — 更新 */
  @Patch(':id')
  @RequireMenu(MENU_SUPPLIER, 'E')
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.svc.update(id, dto);
  }

  /** PATCH /api/v2/procurement/suppliers/:id/status  — 状态切换 */
  @Patch(':id/status')
  @RequireMenu(MENU_SUPPLIER, 'E')
  updateStatus(@Param('id') id: string, @Body() dto: UpdateSupplierStatusDto) {
    return this.svc.updateStatus(id, dto);
  }
}
