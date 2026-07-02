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
import { ALLOWED_TABLES } from './crud.constants';
import { hasPerm, PermCode } from '../../auth/permissions.util';

@Controller('api/crud')
@UseGuards(AuthGuard('jwt'))
export class GenericCrudController {
  constructor(private readonly crudService: GenericCrudService) {}

  /**
   * V2 Runtime 表前缀黑名单 — 禁止通过 Generic CRUD 直接访问。
   * 这些表由各自的 Runtime API（ProcurementV2、SalesV2、FinanceV2、ApprovalEngine）独家管理，
   * 任何绕过 Runtime 的直接写入都会破坏业务状态机完整性。
   * 即使某个表被意外加入 ALLOWED_TABLES，此处也会拦截。
   */
  private static readonly RUNTIME_V2_PREFIXES = [
    'prc2_',              // Procurement V2 Runtime
    'sal_',               // Sales V2 Runtime (sal_orders, sal_price_books 等)
    'wf_approval_',       // Approval Engine Runtime
    'fin_ar_',            // Finance V2 AR (fin_ar_invoices, fin_ar_receipts 等)
    'fin_ap_',            // Finance V2 AP (fin_ap_invoices)
    'fin_cash_',          // Finance V2 Cash (fin_cash_accounts, fin_cash_transactions)
    'fin_fund_',          // Finance V2 Fund Transfers
    'fin_shareholder_',   // Finance V2 Shareholder
    'fin_expense_',       // Finance V2 Expense Requests
    'fin_reimbursement',  // Finance V2 Reimbursements
    'sys_approval_',      // [Phase 2C] 旧审批规则/日志表已停用，禁止 Generic CRUD 直接访问
    'ord_',               // [Phase 2D] 旧销售订单表 — 由 Sales V2 专属 Runtime API 管理
    'b2b_',               // [Phase 2D] 旧 B2B 分销表 — 由 Sales V2 专属 Runtime API 管理
    'log_',               // [Phase 2D] 旧配送日志表 — 由 Sales V2 Delivery Runtime 管理
  ];
  private static readonly RUNTIME_V2_EXACT = new Set([
    'sys_exchange_rates',  // Procurement V2 汇率表（SysExchangeRateEntity）
    'fin_exchange_rates',  // Finance V2 汇率表
    'fin_transactions',    // [Phase 2D] 旧总账流水表 — 已废弃，禁止新增写入
  ]);

  private checkTableAccess(table: string, req: any, method: string) {
    // ─── V2 Runtime 表强制拦截（优先于 ALLOWED_TABLES 检查）──────────────────
    const isRuntimeTable =
      GenericCrudController.RUNTIME_V2_PREFIXES.some(p => table.startsWith(p)) ||
      GenericCrudController.RUNTIME_V2_EXACT.has(table);
    if (isRuntimeTable) {
      throw new ForbiddenException(
        `Runtime table [${table}] is managed exclusively by its dedicated Runtime API — ` +
        `direct Generic CRUD access is disabled to protect business state integrity`
      );
    }

    if (!ALLOWED_TABLES.includes(table)) {
      throw new ForbiddenException('Forbidden Table');
    }

    if (method === 'GET' && ['sys_dict'].includes(table)) {
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

    // G21-1：彻底走 PBAC（菜单权限），删除 TABLE_PERM_MAP role 白名单。
    //   G19-D 已 PBAC-first 并验证稳定（a08af4e/b7c34fa），白名单 fallback 已无价值。
    //   新角色必须走菜单权限赋权（sys_role_menu_permission），不能再靠加 hardcode 白名单。
    //   流程：JWT.permissions menu+op check 通过 → 放行；否则 403。
    // G33-A：method → PermCode 映射独立 DELETE='D'（防 'E' 权限误开删除权）
    //   旧：PUT/DELETE 都用 'E' → 持 E 权角色可 DELETE 生产数据（宋明光被实证可删 brd_flocks）
    //   新：DELETE 需独立 'D' perm；多数业务方角色不持 'D'，admin '*' 永远通过
    const fallbackMenu = this.tableToFallbackMenu(table);
    if (fallbackMenu) {
      const requiredOp: PermCode = method === 'GET' ? 'V'
        : method === 'POST'   ? 'C'
        : method === 'DELETE' ? 'D'   // G33-A：DELETE 升级为 D 权限
        : 'E';
      if (hasPerm(perms, fallbackMenu, requiredOp)) return;
      // F9(task #27 加固)：部分表后端主码与前端 usePermission 域刻意不同
      //   （brd_vaccinations/medications：BE=MENU_FARM_DATA 录入域 / FE=MENU_FARM_VET 兽医防疫域，
      //    见 G33-B 与 G18-1/G24-A）。补 altMenu OR：持任一域对应操作权即放行，让兽医防疫域用户
      //   （如宋明光持 FARM_VET 无 FARM_DATA）按 FE 意图录入而不被 BE 误 403。
      for (const alt of this.tableToAltMenus(table)) {
        if (hasPerm(perms, alt, requiredOp)) return;
      }
    }

    throw new ForbiddenException(`权限不足：您（角色=${userRole}）无权 ${method} 访问 [${table}]，需 menu=${fallbackMenu ?? '-'} 的对应权限`);
  }

  /**
   * F9：表名 → 备选菜单码（OR 关系）。用于 FE/BE 域刻意不同的表，避免持 FE 域权的用户被 BE 误 403。
   */
  private tableToAltMenus(table: string): string[] {
    if (table === 'brd_vaccinations' || table === 'brd_medications') return ['MENU_FARM_VET'];
    return [];
  }

  /**
   * 表名 → 业务菜单 menu_code 映射（与 sidebar perm 一致）
   * 用于 RBAC fallback：持有该菜单对应操作权限即可访问该表。
   */
  private tableToFallbackMenu(table: string): string | null {
    // G33-B：brd_* 主档 vs 业务记录拆分（A1 menu 粒度收口）
    //   主档表（houses/farms/flocks 档案）→ MENU_FARM_MASTER（高权限）
    //   业务记录表（daily_logs/medication_records/vaccinations）→ MENU_FARM_DATA（业务录入权）
    //   宋明光持 MENU_FARM_DATA:V,C,E 但不持 MENU_FARM_MASTER → 主档建/改/删都拒
    if (table === 'brd_houses' || table === 'brd_farms') return 'MENU_FARM_MASTER';
    if (table.startsWith('brd_'))            return 'MENU_FARM_DATA';
    // G33-D：product_grades / product_specs 等等级/规格主档
    if (table === 'product_grades' || table === 'product_specs' || table === 'product_packaging') return 'MENU_MASTER_GRADE';
    if (table === 'sys_role' || table === 'sys_user_role' || table === 'sys_role_menu_permission' || table === 'sys_role_conflict' || table === 'sys_menu' || table === 'sys_permissions') {
      return 'MENU_SETTINGS_ROLE';
    }
    if (table === 'sys_user')                return 'MENU_SETTINGS_USER';
    if (table === 'sys_dict')                return 'MENU_SYS_DICT';
    if (table === 'sys_approval_log' || table === 'sys_audit_log') return 'MENU_SETTINGS_AUDIT';
    if (table === 'sys_approval_flows')      return 'MENU_WORKFLOW_CONFIG';
    if (table === 'sys_approval_rule')       return 'MENU_WORKFLOW_RULES';
    if (table === 'sys_settings')            return 'MENU_SETTINGS_CONFIG';
    if (table === 'pda_terminals')           return 'MENU_SETTINGS_TERMINAL';
    if (table.startsWith('fin_cash_'))       return 'MENU_FIN2_CASH_VIEW';
    if (table.startsWith('fin_ar_'))         return 'MENU_FIN2_AR';
    if (table.startsWith('fin_ap_'))         return 'MENU_FIN2_AP';
    if (table.startsWith('fin_expense'))     return 'MENU_FIN2_EXPENSE';
    if (table.startsWith('fin_shareholder')) return 'MENU_FIN2_SHAREHOLDER';
    if (table === 'fin_payments' || table === 'fin_pay_records') return 'MENU_FIN2_AP';
    if (table === 'fin_store_settlements')   return 'MENU_FIN2_REPORT';
    if (table.startsWith('fin_'))            return null;
    if (table === 'inv_batches' || table === 'inv_ledger') return 'MENU_WMS_VIEW';
    if (table.startsWith('inv_'))            return 'MENU_WMS_VIEW';
    if (table.startsWith('wms_'))            return 'MENU_WMS_INOUT';
    if (table.startsWith('prc_purchase_request')) return 'MENU_PRC2_REQUEST';
    if (table.startsWith('prc_purchase_payment')) return 'MENU_PRC2_PAYMENT';
    if (table.startsWith('prc_receipt'))     return 'MENU_PRC2_RECEIPT';
    if (table.startsWith('prc_supplier'))    return 'MENU_PRC2_SUPPLIER';
    if (table.startsWith('prc_purchase'))    return 'MENU_PRC2_ORDER';
    if (table.startsWith('prc_'))            return null;
    if (table.startsWith('prc2_purchase'))   return 'MENU_PRC2_ORDER';
    if (table.startsWith('prc2_'))           return null;
    if (table === 'sal_customers')           return 'MENU_SALES2_CUSTOMER';
    if (table === 'sal_channels')            return 'MENU_SALES2_CHANNEL';
    if (table === 'sal_price_books' || table === 'sal_price_items') return 'MENU_SALES2_PRICE';
    if (table === 'sal_sales_orders' || table === 'sal_order_items') return 'MENU_SALES2_ORDER';
    if (table.startsWith('sal_delivery') || table === 'sal_receipts') return 'MENU_SALES2_DELIVERY';
    if (table.startsWith('sal_return'))      return 'MENU_SALES2_RETURN';
    if (table === 'sal_drivers')             return 'MENU_MD_DRIVER';
    if (table === 'sal_vehicles')            return 'MENU_MD_VEHICLE';
    if (table.startsWith('sal_'))            return null;
    if (table.startsWith('pkg_'))            return 'MENU_PKG_OP';
    // M2 修:质检记录表(qa_inspections/qa_product_inspections)原无映射→落 null→非管理员恒 403,
    //   质检员无法管质检记录(页面形同管理员专属)。映射到 MENU_QA_OP,让质检操作角色可用,前端同码门控。
    if (table.startsWith('qa_'))             return 'MENU_QA_OP';
    // 门店 / POS 业务表（pos_sales/pos_sessions/store_receiving/store_losses/store_replenish_req…）
    //   → 门店工作台菜单；店长持 MENU_STORE_MGR/MENU_POS_STORE，行级 store_code 隔离保证仅本店数据。
    //   修复：原无此映射 → 门店工作台拉 pos_sales/store_receiving 报 403（店长自己工作台报权限错）。
    if (table.startsWith('pos_'))            return 'MENU_POS_STORE';
    if (table.startsWith('store_'))          return 'MENU_STORE_MGR';
    if (table === 'mst_stores')              return 'MENU_MD_STORE';
    if (table === 'mst_products')            return 'MENU_MD_PRODUCT';
    if (table === 'mst_suppliers')           return 'MENU_MD_SUPPLIER';
    if (table === 'mst_customers')           return 'MENU_MD_CUSTOMER';
    if (table === 'mst_skus')                return 'MENU_MD_SKU';
    if (table.startsWith('mst_'))            return null;
    return null;
  }

  private filterBlockedFields(table: string, body: any) {
    const COLUMN_BLACKLIST: Record<string, string[]> = {
      // 评分加固：键名修正 sys_users(复数,已下架)→ sys_user(实表)。原 typo 使该黑名单形同虚设，
      //   持 MENU_SETTINGS_USER:E 者可经 /api/crud 直写 password_hash/role/status 提权。两名都列以防回归。
      sys_user: ['password_hash', 'salt', 'role', 'status', 'org_id'],
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

    // 行级租户隔离：非全局角色自动注入 store_code 过滤，防止跨站点数据泄露
    const userStoreCode: string | undefined = req.user?.storeCode;
    const roles: string[] = req.user?.roles || (req.user?.role ? [req.user.role] : []);
    // G125：集团层级角色（超管/CEO/集团财务）视为全局——修「ROLE_ADMIN 被默认绑单场(如孟赛)后
    //   username≠'admin' → 被判非全局 → brd_daily_logs 等行级注入 store/site → 只看一个场」。
    const GLOBAL_ROLES = new Set(['ROLE_ADMIN', 'ROLE_CEO', 'ROLE_GROUP_FINANCE']);
    const isGlobal =
      !userStoreCode ||
      userStoreCode === 'ALL' ||
      (req.user?.permissions || []).includes('*') ||
      req.user?.username === 'admin' ||
      roles.some((r) => GLOBAL_ROLES.has(r));

    // 行级 scope 字段映射（2026-06-06 修）：
    // 历史上 brd_* 一律按 farm_code 过滤，但 userStoreCode 是 SITE 维度（如
    // 'SITE-MENGSAI-LAYER'），而 brd_daily_logs.farm_code 是 farm 维度（如
    // 'LPH_MENGSAI'），永远不匹配 → 宋明光"数据看不见"假象。
    // MDM-1 后 brd_daily_logs 有 site_code、brd_farms 有 mapped_site_code，
    // 改按这些列过滤即可与 userStoreCode 同维度对齐。
    const BRD_SCOPE_FIELD: Record<string, string | null> = {
      brd_daily_logs:   'site_code',         // mdm1_05 已加 + 回填
      brd_farms:        'mapped_site_code',  // mdm1_03 已加 + 回填
      brd_medications:        'store_code',  // v3_schema 已有（主档表）
      brd_medication_records: 'site_code',   // G21-4 业务记录表按 site 隔离
      brd_vaccinations: null,  // G33-C：表无 store_code/site_code 列，注入 SQL 500；scope 留待 schema 补 site_code 列
      brd_houses:       null,                // 无可靠 site 列，暂不行级隔离（受 RBAC 限制）
      brd_flocks:       null,
    };
    // G17：WMS / INV 类表按 site_code 隔离（与 SITE-* storeCode 同维度）
    const WMS_SCOPE_FIELD: Record<string, string | null> = {
      wms_outbound: 'site_code',
      wms_inbound:  'site_code',
      // 其余 wms_* 默认 store_code（不在 map 走默认）
    };
    // G21-NEW：sys_* / mst_* / 字典/产品/等级等全局系统表无 store_code 列 → scopeField=null 不做行级过滤
    //   之前 sys_dict 走默认 'store_code' → 注入 WHERE store_code='SITE-MENGSAI-LAYER'
    //   → 列不存在 SQL 报错 → DictSelect 全失败 → 入库类型/出库类型等下拉空
    const GLOBAL_TABLES = new Set([
      'sys_dict', 'sys_menu', 'sys_role', 'sys_organizations', 'sys_approval_flows', 'sys_permissions',
      'mst_currencies', 'product_grades', 'product_specs', 'product_packaging',
      // G30：仓储主数据无 store_code 列（cause warehouse 看板 500），统一全局可读
      'wms_warehouses', 'wms_zones', 'wms_locations',
      // 其他常用主数据表
      'mst_skus', 'mst_products', 'mst_customers', 'mst_suppliers',
    ]);
    let scopeField: string | null;
    if (GLOBAL_TABLES.has(table)) {
      scopeField = null;  // 全局表不做行级过滤
    } else if (table.startsWith('brd_')) {
      scopeField = table in BRD_SCOPE_FIELD ? BRD_SCOPE_FIELD[table] : 'store_code';
    } else if (table in WMS_SCOPE_FIELD) {
      scopeField = WMS_SCOPE_FIELD[table];
    } else {
      scopeField = 'store_code';
    }

    const effectiveQuery = (isGlobal || !scopeField)
      ? query
      : { ...query, [scopeField]: userStoreCode };

    const data = await this.crudService.findAll(table, effectiveQuery);
    return { code: 200, data };
  }

  @Post(':table')
  async create(@Param('table') table: string, @Body() body: any, @Req() req: any) {
    this.checkTableAccess(table, req, 'POST');
    
    // Auto populate store_code if not present, and auto populated created_by
    if (!body.store_code && req.user?.storeCode) {
        body.store_code = req.user.storeCode;
    }
    // G17：wms_outbound/inbound 走 site_code 隔离 — 自动注入 site_code
    const sc: string | undefined = req.user?.storeCode;
    if ((table === 'wms_outbound' || table === 'wms_inbound') && !body.site_code && sc && sc.startsWith('SITE-')) {
      body.site_code = sc;
    }

    // G31：自动注入 operator/picker/auditor/executor 默认 = 当前登录用户
    //   业务方原话："谁操作不就应该默认是谁吗？"
    //   G33 修：限定白名单表（之前对所有 generic-crud 表注入，导致主档表如
    //   brd_flocks 触发 AutoRepair 加列失败 → INSERT 异常 → 测试 fail）
    const currentUser: string = req.user?.username || '';
    const TABLES_WITH_OPERATOR: Record<string, string[]> = {
      wms_inbound:             ['operator'],
      wms_outbound:            ['operator', 'picker'],
      wms_transfer:            ['operator'],
      wms_stocktake:           ['operator', 'auditor'],
      wms_loss:                ['operator'],
      pkg_inbound:             ['operator'],
      brd_medication_records:  ['executor'],
      brd_vaccinations:        ['executor'],
      fin_cash_transactions:   ['operator'],
    };
    if (currentUser && TABLES_WITH_OPERATOR[table]) {
      for (const f of TABLES_WITH_OPERATOR[table]) {
        if (body[f] === undefined || body[f] === null || body[f] === '') {
          body[f] = currentUser;
        }
      }
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
    brd_flocks:       'flock_no',
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
  };
  return PK_MAP[table] ?? 'id';
}
