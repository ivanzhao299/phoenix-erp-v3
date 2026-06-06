import { Controller, Get, UseGuards } from '@nestjs/common';
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

  /** GET /api/lookup/product-grades — 仅 ACTIVE 等级，供前端下拉 */
  @Get('product-grades')
  async productGrades() {
    const data = await this.svc.listGrades();
    return { code: 200, data };
  }

  /** GET /api/lookup/packaging-specs — 仅 ACTIVE 规格 */
  @Get('packaging-specs')
  async packagingSpecs() {
    const data = await this.svc.listSpecs();
    return { code: 200, data };
  }

  /**
   * GET /api/lookup/companies — 公司组织下拉
   * 替代 /api/org/organizations?type=COMPANY（需 MENU_SYS_ORG:V，业务录入用户拉不到）。
   * 返回 sys_organizations 中 type=COMPANY 的 ACTIVE 行，字段精简供前端下拉。
   */
  @Get('companies')
  async companies() {
    const rows = await this.em.query(
      `SELECT org_code AS "orgCode", org_name AS "orgName", org_name_cn AS "orgNameCn",
              org_short_name AS "orgShortName", status
         FROM sys_organizations
         WHERE org_type='COMPANY' AND status='ACTIVE'
         ORDER BY sort_order NULLS LAST, org_code`,
    );
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
}
