import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { AuthGuard } from '@nestjs/passport';
import { ProductMasterService } from '../services/product-master.service';

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
  ) {}

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
    const rows = await this.cached('companies', () => this.em.query(
      `SELECT org_code AS "orgCode", org_name AS "orgName", org_name_cn AS "orgNameCn",
              org_short_name AS "orgShortName", status
         FROM sys_organizations
         WHERE org_type='COMPANY' AND status='ACTIVE'
         ORDER BY sort_order NULLS LAST, org_code`,
    ));
    return { code: 200, data: rows };
  }

  /**
   * GET /api/lookup/projects — 项目下拉
   * 业务录入页面（养殖/采购/财务）通用，仅 ACTIVE。
   */
  @Get('projects')
  async projects() {
    const rows = await this.em.query(
      `SELECT project_code AS "projectCode", project_name AS "projectName",
              company_code AS "companyCode", status
         FROM biz_projects
         WHERE status='ACTIVE'
         ORDER BY project_code`,
    );
    return { code: 200, data: rows };
  }

  /**
   * GET /api/lookup/sites — 站点下拉
   * 替代 /api/organizations/by-type?type=SITE。
   */
  @Get('sites')
  async sites() {
    const rows = await this.em.query(
      `SELECT org_code AS "orgCode", org_name AS "orgName", company_code AS "companyCode",
              site_business_type AS "siteBusinessType", status
         FROM sys_organizations
         WHERE org_type='SITE' AND status='ACTIVE'
         ORDER BY sort_order NULLS LAST, org_code`,
    );
    return { code: 200, data: rows };
  }

  // ─── G5-B 业务录入必备下拉（2026-06-06）─────────────────────────────────────

  /** GET /api/lookup/customers — 客户下拉（替代 /master-data/runtime/customer/active） */
  @Get('customers')
  async customers() {
    const rows = await this.em.query(
      `SELECT customer_no AS code, customer_name AS name, customer_type AS "customerType",
              company_code AS "companyCode", status, risk_level AS "riskLevel"
         FROM sal_customers
         WHERE status='ACTIVE'
         ORDER BY customer_no`,
    );
    return { code: 200, data: rows };
  }

  /** GET /api/lookup/suppliers — 供应商下拉（替代 /master-data/runtime/supplier/active） */
  @Get('suppliers')
  async suppliers() {
    const rows = await this.em.query(
      `SELECT supplier_code AS code, supplier_name AS name, country_code AS "countryCode",
              supplier_type AS "supplierType", default_currency AS "defaultCurrency", status
         FROM prc2_suppliers
         WHERE status='ACTIVE' AND is_active=true
         ORDER BY supplier_code`,
    );
    return { code: 200, data: rows };
  }

  /** GET /api/lookup/users — 操作员/用户下拉（替代 /users） */
  @Get('users')
  async users() {
    const rows = await this.em.query(
      `SELECT user_id AS "userId", username, real_name AS "realName",
              store_code AS "storeCode", status
         FROM sys_user
         WHERE status=1
         ORDER BY username`,
    );
    return { code: 200, data: rows };
  }

  /** GET /api/lookup/warehouses?companyCode= — 仓库下拉（替代 /crud/wms_warehouses） */
  @Get('warehouses')
  async warehouses(@Query('companyCode') companyCode?: string) {
    const params: any[] = [];
    let where = `status='ACTIVE'`;
    if (companyCode) { params.push(companyCode); where += ` AND company_code=$${params.length}`; }
    const rows = await this.em.query(
      `SELECT warehouse_code AS "warehouseCode", warehouse_name AS "warehouseName",
              company_code AS "companyCode", warehouse_type AS "warehouseType", status
         FROM wms_warehouses
         WHERE ${where}
         ORDER BY warehouse_code`,
      params,
    );
    return { code: 200, data: rows };
  }

  /** GET /api/lookup/stores — 门店下拉（替代 /crud/mst_stores） */
  @Get('stores')
  async stores(@Query('companyCode') companyCode?: string) {
    const params: any[] = [];
    let where = `status='ACTIVE'`;
    if (companyCode) { params.push(companyCode); where += ` AND company_code=$${params.length}`; }
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
    const rows = await this.cached('farms', () => this.em.query(
      `SELECT farm_code AS "farmCode", farm_name AS "farmName", location, status,
              houses, capacity
         FROM brd_farms
         WHERE status='ACTIVE'
         ORDER BY farm_code`,
    ));
    return { code: 200, data: rows };
  }

  /** GET /api/lookup/houses?farmCode= — 鸡舍下拉（替代 /crud/brd_houses） */
  @Get('houses')
  async houses(@Query('farmCode') farmCode?: string) {
    const params: any[] = [];
    let where = `status='ACTIVE'`;
    if (farmCode) { params.push(farmCode); where += ` AND farm_code=$${params.length}`; }
    const rows = await this.em.query(
      `SELECT house_code AS "houseCode", house_name AS "houseName",
              farm_code AS "farmCode", house_type AS "houseType",
              capacity, current_birds AS "currentBirds", status
         FROM brd_houses
         WHERE ${where}
         ORDER BY house_code`,
      params,
    );
    return { code: 200, data: rows };
  }

  /** GET /api/lookup/flocks?houseCode=&farmCode= — 鸡群下拉（替代 /crud/brd_flocks） */
  @Get('flocks')
  async flocks(@Query('houseCode') houseCode?: string, @Query('farmCode') farmCode?: string) {
    const params: any[] = [];
    let where = `status='ACTIVE'`;
    if (houseCode) { params.push(houseCode); where += ` AND house_code=$${params.length}`; }
    if (farmCode)  { params.push(farmCode);  where += ` AND farm_code=$${params.length}`; }
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

  /** GET /api/lookup/cash-accounts?currency= — 资金账户下拉（替代 /v2/finance/cash/accounts） */
  @Get('cash-accounts')
  async cashAccounts(@Query('currency') currency?: string) {
    const params: any[] = [];
    let where = `status='ACTIVE'`;
    if (currency) { params.push(currency); where += ` AND currency_code=$${params.length}`; }
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
