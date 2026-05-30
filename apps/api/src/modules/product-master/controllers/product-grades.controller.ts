import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import { DataScopeGuard } from '../../org/guards/data-scope.guard';
import { ProductMasterService, ProductGrade } from '../services/product-master.service';

/**
 * ProductGradesController — /api/product-master/grades
 *
 * 等级主数据 CRUD。写操作需要 MENU_MASTER_GRADE E 权限（ADMIN / PRODUCT_MGR）。
 * 读操作需要 MENU_MASTER_GRADE V 权限（ADMIN / PRODUCT_MGR / HQ_FINANCE / AUDITOR）。
 * [Fix Pack 1 — HIGH-3] 统一至类级 MenuGuard + DataScopeGuard
 */
@Controller('api/product-master/grades')
@UseGuards(MenuGuard, DataScopeGuard)
export class ProductGradesController {
  constructor(private readonly svc: ProductMasterService) {}

  /** GET /api/product-master/grades — 查询所有等级（默认仅 ACTIVE）*/
  @Get()
  @RequireMenu('MENU_MASTER_GRADE', 'V')
  async list(@Query('status') status?: string) {
    const rows = status === 'ALL'
      ? await this.svc.listAllGrades()
      : await this.svc.listGrades(status);
    return { code: 200, data: rows };
  }

  /** GET /api/product-master/grades/:gradeCode */
  @Get(':gradeCode')
  @RequireMenu('MENU_MASTER_GRADE', 'V')
  async detail(@Param('gradeCode') gradeCode: string) {
    const data = await this.svc.getGrade(gradeCode);
    return { code: 200, data };
  }

  /** POST /api/product-master/grades — 新建等级（需 E 权限）*/
  @Post()
  @RequireMenu('MENU_MASTER_GRADE', 'E')
  async create(@Body() dto: ProductGrade) {
    const data = await this.svc.createGrade(dto);
    return { code: 200, data };
  }

  /** PUT /api/product-master/grades/:gradeCode — 更新等级（需 E 权限）*/
  @Put(':gradeCode')
  @RequireMenu('MENU_MASTER_GRADE', 'E')
  async update(@Param('gradeCode') gradeCode: string, @Body() dto: Partial<ProductGrade>) {
    const data = await this.svc.updateGrade(gradeCode, dto);
    return { code: 200, data };
  }
}
