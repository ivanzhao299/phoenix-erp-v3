import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  Req,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { GenericCrudService } from './generic-crud.service';
import { AuthGuard } from '@nestjs/passport';
import { ALLOWED_TABLES, TABLE_PERM_MAP } from './crud.constants';

@Controller('api/crud')
@UseGuards(AuthGuard('jwt'))
export class GenericCrudController {
  constructor(private readonly crudService: GenericCrudService) {}

  private checkTableAccess(table: string, req: any, method: string) {
    if (!ALLOWED_TABLES.includes(table)) {
      throw new ForbiddenException('Forbidden Table');
    }

    if (method === 'GET' && ['sys_dict', 'sys_orgs'].includes(table)) {
      return;
    }

    // 超管旁路：permissions=['*'] 或 username=admin（与 auth.service.ts L91 保持一致）
    const perms: string[] = req.user?.permissions || [];
    if (perms.includes('*') || req.user?.username === 'admin') {
      return;
    }

    const userRole = req.user?.role;
    const userRoles = Array.isArray(req.user?.roles) ? req.user.roles : [userRole];

    // UAT-BRD-905: 专门放行 CEO 角色对养殖表 (brd_*) 的只读 (GET) 权限
    if (method === 'GET' && userRoles.includes('ROLE_CEO') && table.startsWith('brd_')) {
      return;
    }

    const requiredRoles = TABLE_PERM_MAP[table];

    if (requiredRoles) {
      const hasAccess = requiredRoles.some((r) => userRoles.includes(r) || userRole === r);
      if (!hasAccess) {
        throw new ForbiddenException(
          `权限不足：您的角色无权访问 [${table}] 表`,
        );
      }
    }
  }

  private filterBlockedFields(table: string, body: any) {
    const COLUMN_BLACKLIST: Record<string, string[]> = {
      sys_users: ['password_hash', 'salt', 'role', 'status', 'org_id'],
      _global: ['id', 'created_at'],
    };

    const tableBlacklist = COLUMN_BLACKLIST[table] || [];
    const globalBlacklist = COLUMN_BLACKLIST['_global'];
    
    const safeBody = { ...body };
    for (const key of Object.keys(safeBody)) {
      if (tableBlacklist.includes(key) || globalBlacklist.includes(key)) {
        delete safeBody[key];
      }
    }
    return safeBody;
  }



  @Get(':table')
  async findAll(@Param('table') table: string, @Query() query: any, @Req() req: any) {
    this.checkTableAccess(table, req, 'GET');
    const data = await this.crudService.findAll(table, query);
    return { code: 200, data };
  }

  @Post(':table')
  async create(@Param('table') table: string, @Body() body: any, @Req() req: any) {
    this.checkTableAccess(table, req, 'POST');
    
    // Auto populate store_code if not present, and auto populated created_by
    if (!body.store_code && req.user?.storeCode) {
        body.store_code = req.user.storeCode;
    }
    
    // Minimal safety check
    const fields = Object.keys(body);
    if (!fields.every((f) => /^[a-zA-Z0-9_]+$/.test(f))) {
      throw new BadRequestException('Security Violation: Invalid field names detected');
    }

    const result = await this.crudService.create(table, body);
    return { code: 200, msg: result.msg };
  }

  @Put(':table/:idColumn/:id')
  async updateWithColumn(
    @Param('table') table: string,
    @Param('idColumn') idColumn: string,
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    this.checkTableAccess(table, req, 'PUT');
    const safeBody = this.filterBlockedFields(table, body);
    
    const fields = Object.keys(safeBody);
    if (!fields.every((f) => /^[a-zA-Z0-9_]+$/.test(f)) || !/^[a-zA-Z0-9_]+$/.test(idColumn)) {
      throw new BadRequestException('Security Violation: Invalid field names detected');
    }

    const result = await this.crudService.update(table, idColumn, id, safeBody);
    return { code: 200, msg: result.msg };
  }

  @Put(':table/:id')
  async update(
    @Param('table') table: string,
    @Param('id') id: string,
    @Body() body: any,
    @Req() req: any,
  ) {
    console.log(`[CTRL PUT] /${table}/${id} | body=${JSON.stringify(body)} | user=${req.user?.username}`);
    return this.updateWithColumn(table, getPkColumn(table), id, body, req);
  }

  @Delete(':table/:idColumn/:id')
  async removeWithColumn(
    @Param('table') table: string,
    @Param('idColumn') idColumn: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    this.checkTableAccess(table, req, 'DELETE');
    if (!/^[a-zA-Z0-9_]+$/.test(idColumn)) {
      throw new BadRequestException('Security Violation: Invalid primary key column');
    }
    const result = await this.crudService.remove(table, idColumn, id);
    return { code: 200, msg: result.msg };
  }

  @Delete(':table/:id')
  async remove(
    @Param('table') table: string,
    @Param('id') id: string,
    @Req() req: any,
  ) {
    return this.removeWithColumn(table, getPkColumn(table), id, req);
  }
}

// ── 主键列名映射（非 id 主键的表）──────────────────────────
function getPkColumn(table: string): string {
  const PK_MAP: Record<string, string> = {
    // 主数据
    brd_farms:        'farm_code',
    brd_houses:       'house_code',
    brd_flocks:       'flock_code',
    // 仓储
    wms_warehouses:   'warehouse_code',
    wms_locations:    'location_code',
    wms_zones:        'zone_code',
    // 采购
    prc_suppliers:    'supplier_code',
    // 门店
    mst_stores:       'store_code',
    // 产品
    mst_products:     'product_code',
    // 系统 RBAC（V3 单数表名，PK 多为 code 列）
    sys_role:         'role_code',
    sys_menu:         'menu_code',
    sys_user:         'user_id',
    sys_store:        'store_code',
  };
  return PK_MAP[table] ?? 'id';
}
