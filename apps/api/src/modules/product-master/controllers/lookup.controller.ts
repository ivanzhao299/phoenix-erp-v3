import { BadRequestException, Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { AuthGuard } from '@nestjs/passport';
import { ClsService } from 'nestjs-cls';
import { ProductMasterService } from '../services/product-master.service';
import { DataScopeService } from '../../org/services/data-scope.service';
import { MasterDataRuntimeService } from '../../master-data/master-data-runtime.service';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';

/**
 * LookupController — /api/lookup/*
 *
 * 业务录入页面（生产端 / 移动端）所需的"基础查找"端点。
 * 不绑 MenuGuard：等级、规格等是全局只读主数据，任何已登录用户都应能查询；
 * 写操作仍走 ProductGradesController / PackagingSpecsController（MENU_MASTER_* 守护）。
 *
 * 设立动机：原 /api/product-master/* 全部绑 MENU_MASTER_*，导致宋明光等业务录入用户
 * 在日产蛋入库等页面无法拉等级下拉。多个页面绕道用硬编码 EGG_GRADES 或 sys_dict
 * 镜像，造成全局等级数据源漂移（PKG_EGG_GRADE / 0-5 / AA-D 并存）。
 * 收口方案：所有"业务录入"前端走 /api/lookup，权威源唯一 = product_grades。
 */
@Controller('api/lookup')
@UseGuards(AuthGuard('jwt'))
export class LookupController {
  constructor(
    private readonly svc: ProductMasterService,
    @InjectEntityManager() private readonly em: EntityManager,
    private readonly cls: ClsService,
    private readonly dataScope: DataScopeService,
    private readonly masterDataRuntime: MasterDataRuntimeService,
  ) {}

  /**
   * 解析当前登录用户的公司 DataScope。
   * user 由全局 AuditLogInterceptor 在 handler 前写入 CLS；本路由只挂 AuthGuard，
   * 不经 DataScopeGuard，故此处主动调 DataScopeService.resolve 取 allowedCompanyCodes。
   * 解析失败 → 兜底 isGlobal=true（不因解析异常把下拉清空）。
   */
  private async resolveCompanyScope(): Promise<{ isGlobal: boolean; companyCodes: string[]; farmCodes: string[]; warehouseCodes: string[] }> {
    try {
      const user = this.cls.get('user') as Record<string, unknown> | undefined;
      if (!user) return { isGlobal: true, companyCodes: [], farmCodes: [], warehouseCodes: [] };
      const roles: string[] = (user['roles'] as string[] | undefined)
        ?? (user['role'] ? [user['role'] as string] : []);
      const userId = String(user['userId'] ?? user['id'] ?? '');
      const scope = await this.dataScope.resolve(userId, roles, 'MENU_MASTER_DATA');
      return {
        isGlobal: !!scope.isGlobal,
        companyCodes: scope.allowedCompanyCodes ?? [],
        farmCodes: scope.allowedFarmCodes ?? [],   // G87 场授权清单
        warehouseCodes: scope.allowedWarehouseCodes ?? [],
      };
    } catch {
      return { isGlobal: true, companyCodes: [], farmCodes: [], warehouseCodes: [] };
    }
  }

  // G8 性能：进程内 5min 缓存
  // 业务录入页面下拉调用极高频（每次进入页面），主数据变化频率低（小时到天级）。
  // 缓存命中 → 0ms，未命中走 DB（实测 2-5ms）。
  // 主数据更新场景靠 TTL 到期自然刷新，关键性强一致场景走原 /api/product-master/* 写端点。
  private static readonly TTL_MS = 5 * 60 * 1000;
  private cache = new Map<string, { data: any; expireAt: number }>();
  private async cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const hit = this.cache.get(key);
    if (hit && hit.expireAt > now) return hit.data;
    const data = await loader();
    this.cache.set(key, { data, expireAt: now + LookupController.TTL_MS });
    return data;
  }

  private async tableExists(tableName: string): Promise<boolean> {
    const rows = await this.em.query(
      `SELECT 1
         FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
        LIMIT 1`,
      [tableName],
    );
    return rows.length > 0;
  }

  /** GET /api/lookup/product-grades — 仅 ACTIVE 等级，供前端下拉 */
  @Get('product-grades')
  async productGrades() {
    const data = await this.cached('product-grades', () => this.svc.listGrades());
    return { code: 200, data };
  }

  /** GET /api/lookup/packaging-specs — 仅 ACTIVE 规格 */
  @Get('packaging-specs')
  async packagingSpecs() {
    const data = await this.cached('packaging-specs', () => this.svc.listSpecs());
    return { code: 200, data };
  }

  /**
   * GET /api/lookup/companies — 公司组织下拉
   * 替代 /api/org/organizations?type=COMPANY（需 MENU_SYS_ORG:V，业务录入用户拉不到）。
   * 返回 sys_organizations 中 type=COMPANY 的 ACTIVE 行，字段精简供前端下拉。
   */
  @Get('companies')
  async companies() {
    // G37：公司下拉按 DataScope 过滤。
    // 原实现返回全集团公司 → 出纳王玮华等受限用户能在股东资金/财务单据里选到
    // 不归属自己的公司（如万象食品厂 COMP-LAO-FOOD）。非全局用户只返回 allowedCompanyCodes。
    const scope = await this.resolveCompanyScope();
    if (scope.isGlobal) {
      const rows = await this.cached('companies:global', () => this.em.query(
        `SELECT org_code AS "orgCode", COALESCE(company_code, org_code) AS "companyCode",
                org_name AS "orgName", org_name_cn AS "orgNameCn",
                org_short_name AS "orgShortName", status
           FROM sys_organizations
           WHERE org_type='COMPANY' AND status='ACTIVE'
           ORDER BY sort_order NULLS LAST, org_code`,
      ));
      return { code: 200, data: rows };
    }
    if (!scope.companyCodes.length) return { code: 200, data: [] };
    const key = `companies:${[...scope.companyCodes].sort().join(',')}`;
    const rows = await this.cached(key, () => this.em.query(
      `SELECT org_code AS "orgCode", COALESCE(company_code, org_code) AS "companyCode",
              org_name AS "orgName", org_name_cn AS "orgNameCn",
              org_short_name AS "orgShortName", status
         FROM sys_organizations
         WHERE org_type='COMPANY' AND status='ACTIVE' AND COALESCE(company_code, org_code) = ANY($1)
         ORDER BY sort_order NULLS LAST, org_code`,
      [scope.companyCodes],
    ));
    return { code: 200, data: rows };
  }

  /**
   * GET /api/lookup/projects — 项目下拉
   * 业务录入页面（养殖/采购/财务）通用，仅 ACTIVE。
   */
  @Get('projects')
  async projects(@Query('companyCode') companyCode?: string, @Query('company_code') companyCodeSnake?: string) {
    const scope = await this.resolveCompanyScope();
    if (!scope.isGlobal && scope.companyCodes.length === 0) return { code: 200, data: [] };
    const buildScopedFilter = () => {
      const params: any[] = [];
      const conds = [`status='ACTIVE'`];
      if (!scope.isGlobal) {
        params.push(scope.companyCodes);
        conds.push(`company_code = ANY($${params.length})`);
      }
      const requestedCompanyCode = (companyCode || companyCodeSnake || '').trim();
      if (requestedCompanyCode) {
        params.push(requestedCompanyCode);
        conds.push(`company_code = $${params.length}`);
      }
      return { params, conds };
    };

    const requestedCompanyCode = (companyCode || companyCodeSnake || '').trim();
    const cacheKey = `projects:${scope.isGlobal ? 'global' : scope.companyCodes.slice().sort().join(',')}:${requestedCompanyCode || '*'}`;
    const rows = await this.cached(cacheKey, async () => {
      let primaryRows: any[] = [];
      if (await this.tableExists('biz_projects')) {
        const { params, conds } = buildScopedFilter();
        primaryRows = await this.em.query(
          `SELECT project_code AS "projectCode", project_name AS "projectName",
                  company_code AS "companyCode", status, 'biz_projects' AS "sourceTable"
             FROM biz_projects
             WHERE ${conds.join(' AND ')}
             ORDER BY project_code`,
          params,
        );
      }
      if (primaryRows.length > 0) return primaryRows;

      // 生产兼容：MDM-1 统一项目主表上线前，部分历史采购项目仍保存在
      // prc2_projects。业务单据只需要引用 ACTIVE 项目，不应因数据尚未完全
      // 迁入 biz_projects 而出现“项目无可选项”。
      if (!(await this.tableExists('prc2_projects'))) return [];
      const { params, conds } = buildScopedFilter();
      return this.em.query(
        `SELECT project_code AS "projectCode", project_name AS "projectName",
                company_code AS "companyCode", status, 'prc2_projects' AS "sourceTable"
           FROM prc2_projects
           WHERE ${conds.join(' AND ')}
           ORDER BY project_code`,
        params,
      );
    });
    return { code: 200, data: rows };
  }

  /**
   * GET /api/lookup/sites — 站点下拉
   * 替代 /api/organizations/by-type?type=SITE。
   */
  @Get('sites')
  async sites() {
    const scope = await this.resolveCompanyScope();
    if (!scope.isGlobal && scope.companyCodes.length === 0) return { code: 200, data: [] };
    const params: any[] = [];
    const conds = [`org_type='SITE'`, `status='ACTIVE'`];
    if (!scope.isGlobal) {
      params.push(scope.companyCodes);
      conds.push(`company_code = ANY($${params.length})`);
    }
    const rows = await this.em.query(
      `SELECT org_code AS "orgCode", org_name AS "orgName", company_code AS "companyCode",
              site_business_type AS "siteBusinessType", status
         FROM sys_organizations
         WHERE ${conds.join(' AND ')}
         ORDER BY sort_order NULLS LAST, org_code`,
      params,
    );
    return { code: 200, data: rows };
  }

  // ─── G5-B 业务录入必备下拉（2026-06-06）─────────────────────────────────────

  /** GET /api/lookup/customers — 客户下拉（替代 /master-data/runtime/customer/active） */
  @Get('customers')
  async customers() {
    const scope = await this.resolveCompanyScope();
    if (!scope.isGlobal && scope.companyCodes.length === 0) return { code: 200, data: [] };
    const params: any[] = [];
    const conds = [`status='ACTIVE'`];
    if (!scope.isGlobal) {
      params.push(scope.companyCodes);
      conds.push(`company_code = ANY($${params.length})`);
    }
    const rows = await this.em.query(
      `SELECT customer_no AS code, customer_name AS name, customer_type AS "customerType",
              company_code AS "companyCode", status, risk_level AS "riskLevel"
         FROM sal_customers
         WHERE ${conds.join(' AND ')}
         ORDER BY customer_no`,
      params,
    );
    return { code: 200, data: rows };
  }

  /** GET /api/lookup/suppliers — 供应商下拉（替代 /master-data/runtime/supplier/active） */
  @Get('suppliers')
  async suppliers() {
    const scope = await this.resolveCompanyScope();
    const params: any[] = [];
    const conds = [`status='ACTIVE'`, `is_active=true`];
    if (!scope.isGlobal) {
      params.push(scope.companyCodes);
      conds.push(`(shared_scope='GROUP' OR owner_company_code = ANY($${params.length}))`);
    }
    const rows = await this.em.query(
      `SELECT supplier_code AS code, supplier_name AS name, country_code AS "countryCode",
              supplier_type AS "supplierType", default_currency AS "defaultCurrency",
              shared_scope AS "sharedScope", owner_company_code AS "ownerCompanyCode", status
         FROM prc2_suppliers
         WHERE ${conds.join(' AND ')}
         ORDER BY supplier_code`,
      params,
    );
    return { code: 200, data: rows };
  }

  /** G91 物料下拉（仅 JWT，采购录入用户可拉——与主数据管理权限解耦；
   *  原 MaterialPicker 误接 /master-data/runtime/material/active 受 MasterDataTypeGuard 门控→采购员 403）。 */
  @Get('materials')
  async materials() {
    const rows = await this.em.query(
      `SELECT material_code AS code, material_name AS name, material_type AS "materialType",
              spec, unit, default_currency AS "defaultCurrency", status
         FROM mst_materials
         WHERE status='ACTIVE'
         ORDER BY material_type, material_name`,
    );
    return { code: 200, data: rows };
  }

  /**
   * POST /api/lookup/materials/quick — 采购录入页就地快建物料。
   *
   * 查询下拉保持 JWT-only；写入必须走菜单权限。采购申请/订单高频场景允许
   * 使用采购创建权限快速补物料，同时复用主数据 Runtime 的编码、校验与审计。
   */
  @Post('materials/quick')
  @UseGuards(MenuGuard)
  @RequireMenu('MENU_PRC2_REQUEST', 'C', ['MENU_PRC2_ORDER', 'MENU_MD_MATERIAL', 'MENU_MASTER_DATA'])
  async createMaterialQuick(@Body() body: Record<string, unknown>, @Req() req: any) {
    const name = String(body?.material_name ?? body?.materialName ?? body?.name ?? '').trim();
    if (!name) throw new BadRequestException('物料名称不能为空');
    if (name.length > 120) throw new BadRequestException('物料名称过长');

    const materialType = String(body?.material_type ?? body?.materialType ?? 'OTHER').trim() || 'OTHER';
    const dto = {
      material_name: name,
      material_type: materialType,
      spec: String(body?.spec ?? '').trim() || undefined,
      unit: String(body?.unit ?? '').trim() || undefined,
      default_currency: String(body?.default_currency ?? body?.defaultCurrency ?? 'CNY').trim() || 'CNY',
      remark: String(body?.remark ?? '').trim() || undefined,
    };
    const operator = req?.user?.username ?? req?.user?.name ?? req?.user?.userId ?? 'PROCUREMENT_QUICK_CREATE';
    const created = await this.masterDataRuntime.createQuick('material', dto, operator);
    this.cache.delete('materials');
    return {
      code: 200,
      data: {
        material_code: created.code,
        material_name: created.name,
        material_type: dto.material_type,
        spec: dto.spec,
        unit: dto.unit,
        default_currency: dto.default_currency,
        status: 'ACTIVE',
      },
    };
  }

  /**
   * GET /api/lookup/shareholders?companyCode= — 股东下拉
   * 替代 /api/shareholders（需 MENU_SHAREHOLDER_VIEW:V，出纳/财务录入用户拉不到 → 股东下拉空）。
   * 仅 JWT 守卫；股东资金记录等财务录入页据此选股东。
   *
   * G39：传 companyCode 时，仅返回「在该公司名下项目持股」的股东
   * （shr_project_equity → shr_projects.company_code 派生，权威投资关系）。
   * 股东资金记录抽屉「先选公司 → 股东按公司收窄」即用此过滤，杜绝股东/公司错配。
   * 不传 companyCode 时返回全部 ACTIVE（兼容付款单等其它调用方）。
   */
  @Get('shareholders')
  async shareholders(@Query('companyCode') companyCode?: string) {
    if (companyCode) {
      const rows = await this.cached(`shareholders:${companyCode}`, () => this.em.query(
        `SELECT DISTINCT s.shareholder_code AS code, s.shareholder_name AS name, s.status
           FROM shr_shareholders s
           JOIN shr_project_equity e ON e.shareholder_code = s.shareholder_code
           JOIN shr_projects p ON p.project_code = e.project_code
          WHERE s.status='ACTIVE' AND p.company_code = $1
          ORDER BY s.shareholder_code`,
        [companyCode],
      ));
      return { code: 200, data: rows };
    }
    const rows = await this.cached('shareholders', () => this.em.query(
      `SELECT shareholder_code AS code, shareholder_name AS name, status
         FROM shr_shareholders
         WHERE status='ACTIVE'
         ORDER BY shareholder_code`,
    ));
    return { code: 200, data: rows };
  }

  /** GET /api/lookup/users?storeCode= — 操作员/用户下拉
   *   G30：加 storeCode 过滤（如 SITE-MENGSAI-LAYER），防止业务页"操作员"下拉拉全集团。
   *   不传 storeCode 时返全部（admin 管理用）
   */
  @Get('users')
  async users(@Query('storeCode') storeCode?: string) {
    const params: any[] = [];
    let where = `status=1`;
    if (storeCode) {
      params.push(storeCode);
      where += ` AND store_code=$${params.length}`;
    }
    const rows = await this.em.query(
      `SELECT user_id AS "userId", username, real_name AS "realName",
              store_code AS "storeCode", status
         FROM sys_user
         WHERE ${where}
         ORDER BY username`,
      params,
    );
    return { code: 200, data: rows };
  }

  /**
   * GET /api/lookup/warehouses?companyCode=&siteCode=&type=
   * 仓库下拉 — G15 后支持按 site / type 过滤
   * type 枚举：EGG_FARM / EGG_SALES / MEDICINE / FEED / RAW_MATERIAL / PURCHASE_RECV / FINISHED
   */
  @Get('warehouses')
  async warehouses(
    @Query('companyCode') companyCode?: string,
    @Query('siteCode') siteCode?: string,
    @Query('type') type?: string,
  ) {
    const scope = await this.resolveCompanyScope();
    if (!scope.isGlobal && scope.companyCodes.length === 0) return { code: 200, data: [] };
    const params: any[] = [];
    const conds: string[] = [`status='ACTIVE'`];
    if (companyCode) { params.push(companyCode); conds.push(`company_code=$${params.length}`); }
    if (siteCode)    { params.push(siteCode);    conds.push(`site_code=$${params.length}`); }
    if (type)        { params.push(type);        conds.push(`type=$${params.length}`); }
    if (!scope.isGlobal) { params.push(scope.companyCodes); conds.push(`company_code = ANY($${params.length})`); }
    const rows = await this.em.query(
      `SELECT warehouse_code AS "warehouseCode",
              COALESCE(warehouse_name_zh, warehouse_name) AS "warehouseName",
              company_code AS "companyCode", site_code AS "siteCode",
              type AS "warehouseType", status
         FROM wms_warehouses
         WHERE ${conds.join(' AND ')}
         ORDER BY warehouse_code`,
      params,
    );
    return { code: 200, data: rows };
  }

  /** GET /api/lookup/stores — 门店下拉（替代 /crud/mst_stores） */
  @Get('stores')
  async stores(@Query('companyCode') companyCode?: string) {
    const scope = await this.resolveCompanyScope();
    if (!scope.isGlobal && scope.companyCodes.length === 0) return { code: 200, data: [] };
    const params: any[] = [];
    let where = `status='ACTIVE'`;
    if (companyCode) { params.push(companyCode); where += ` AND company_code=$${params.length}`; }
    if (!scope.isGlobal) { params.push(scope.companyCodes); where += ` AND company_code = ANY($${params.length})`; }
    const rows = await this.em.query(
      `SELECT store_code AS "storeCode", store_name AS "storeName",
              company_code AS "companyCode", status
         FROM mst_stores
         WHERE ${where}
         ORDER BY store_code`,
      params,
    );
    return { code: 200, data: rows };
  }

  /** GET /api/lookup/farms — 养殖场下拉（替代 /crud/brd_farms） */
  @Get('farms')
  async farms() {
    const rows: Array<{ farmCode: string; companyCode: string | null }> = await this.cached('farms', () => this.em.query(
      `SELECT farm_code AS "farmCode", farm_name AS "farmName", location, status,
              houses, capacity, company_code AS "companyCode"
         FROM brd_farms
         WHERE status='ACTIVE'
         ORDER BY farm_code`,
    ));
    // G87 数据范围收窄：缓存存全量、出口按当前用户过滤（严禁在共享缓存内做按人过滤）。
    //   ①有场授权清单 → 只看清单内的场；②公司维度收窄（场未挂公司 NULL 保留）。
    const { isGlobal, companyCodes, farmCodes } = await this.resolveCompanyScope();
    if (isGlobal) return { code: 200, data: rows };
    let out = rows;
    if (farmCodes.length > 0) out = out.filter(r => farmCodes.includes(r.farmCode));
    if (companyCodes.length > 0) out = out.filter(r => !r.companyCode || companyCodes.includes(r.companyCode));
    return { code: 200, data: out };
  }

  /** GET /api/lookup/houses?farmCode=&siteCode= — 鸡舍下拉
   *   G17: 加 siteCode 支持。宋明光 store_code='SITE-MENGSAI-LAYER' 走 siteCode 过滤。
   */
  @Get('houses')
  async houses(@Query('farmCode') farmCode?: string, @Query('siteCode') siteCode?: string) {
    const params: any[] = [];
    let where = `status='ACTIVE'`;
    if (farmCode) { params.push(farmCode); where += ` AND farm_code=$${params.length}`; }
    if (siteCode) { params.push(siteCode); where += ` AND site_code=$${params.length}`; }
    const rows = await this.em.query(
      `SELECT house_code AS "houseCode", house_name AS "houseName",
              farm_code AS "farmCode", site_code AS "siteCode", house_type AS "houseType",
              capacity, current_birds AS "currentBirds", status
         FROM brd_houses
         WHERE ${where}
         ORDER BY house_code`,
      params,
    );
    return { code: 200, data: rows };
  }

  /** GET /api/lookup/flocks?houseCode=&farmCode=&siteCode= — 鸡群下拉 */
  @Get('flocks')
  async flocks(@Query('houseCode') houseCode?: string, @Query('farmCode') farmCode?: string, @Query('siteCode') siteCode?: string) {
    const params: any[] = [];
    let where = `status='ACTIVE'`;
    if (houseCode) { params.push(houseCode); where += ` AND house_code=$${params.length}`; }
    if (farmCode)  { params.push(farmCode);  where += ` AND farm_code=$${params.length}`; }
    if (siteCode)  { params.push(siteCode);  where += ` AND site_code=$${params.length}`; }
    const rows = await this.em.query(
      `SELECT flock_no AS "flockNo", house_code AS "houseCode", farm_code AS "farmCode",
              strain, placement_date AS "placementDate", current_qty AS "currentQty", status
         FROM brd_flocks
         WHERE ${where}
         ORDER BY flock_no`,
      params,
    );
    return { code: 200, data: rows };
  }

  /** GET /api/lookup/cash-accounts?currency=&company= — 资金账户下拉（替代 /v2/finance/cash/accounts）
   *  G106-C：支持 company 过滤——付款单按所选公司收窄银行账户，杜绝用他司账户付款。 */
  @Get('cash-accounts')
  async cashAccounts(@Query('currency') currency?: string, @Query('company') company?: string) {
    const scope = await this.resolveCompanyScope();
    if (!scope.isGlobal && scope.companyCodes.length === 0) return { code: 200, data: [] };
    const params: any[] = [];
    let where = `status='ACTIVE'`;
    if (currency) { params.push(currency); where += ` AND currency_code=$${params.length}`; }
    if (company)  { params.push(company);  where += ` AND company_code=$${params.length}`; }
    if (!scope.isGlobal) { params.push(scope.companyCodes); where += ` AND company_code = ANY($${params.length})`; }
    const rows = await this.em.query(
      `SELECT account_code AS "accountCode", account_name AS "accountName",
              company_code AS "companyCode", currency_code AS "currencyCode",
              account_type AS "accountType", current_balance AS "currentBalance", status
         FROM fin_cash_accounts
         WHERE ${where}
         ORDER BY account_code`,
      params,
    );
    return { code: 200, data: rows };
  }

  /**
   * GET /api/lookup/batches — 库存批次下拉
   * 数据源 inv_batches（库存唯一台账），仅列还有可用量的批次（qty_available > 0）。
   * 供质检等业务录入页面选批次；与其它 lookup 端点一致仅挂 AuthGuard，不强制 DataScope。
   */
  @Get('batches')
  async batches() {
    const scope = await this.resolveCompanyScope();
    const params: any[] = [];
    const conds = [`qty_available > 0`];
    if (!scope.isGlobal && scope.warehouseCodes.length > 0) {
      params.push(scope.warehouseCodes);
      conds.push(`warehouse_code = ANY($${params.length})`);
    } else if (!scope.isGlobal && scope.companyCodes.length === 0 && scope.warehouseCodes.length === 0) {
      return { code: 200, data: [] };
    }
    const rows = await this.em.query(
      `SELECT batch_no AS "batch_no", sku_code AS "sku_code", product_code AS "product_code",
              qty_available AS "qty_available", status, warehouse_code AS "warehouse_code",
              store_code AS "store_code", expire_date AS "expire_date"
         FROM inv_batches
         WHERE ${conds.join(' AND ')}
         ORDER BY expire_date NULLS LAST, batch_no
         LIMIT 500`,
      params,
    );
    return { code: 200, data: rows };
  }

  /** GET /api/lookup/dict/:dictType — 字典下拉（替代 /crud/sys_dict?dict_type=...） */
  @Get('dict/:dictType')
  async dict(@Param('dictType') dictType: string) {
    if (!/^[A-Z][A-Z0-9_]*$/.test(dictType)) {
      return { code: 400, data: [], message: 'invalid dict_type' };
    }
    const rows = await this.em.query(
      `SELECT dict_code AS code, dict_label_zh AS "labelZh", dict_label_lo AS "labelLo",
              dict_label_en AS "labelEn", sort_no AS "sortNo", status
         FROM sys_dict
         WHERE dict_type=$1 AND status='ACTIVE'
         ORDER BY sort_no NULLS LAST, dict_code`,
      [dictType],
    );
    return { code: 200, data: rows };
  }
}
