/**
 * MDM-1 §6 — biz_projects 端点
 *
 * 路由：/api/biz/projects
 *   GET /active            列出所有 ACTIVE 项目（可按 company_code 过滤）
 *   GET /                  列出全部（含 DRAFT/INACTIVE）
 *   GET /:code             取单条
 *
 * 数据源：biz_projects 表（MDM-1 统一项目主表）。
 * 兼容：若表未建（biz_projects 未在生产 DB 创建），所有端点返回 [] 不报错。
 */

import { Controller, Get, Param, Query, Logger, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { DataSource } from 'typeorm';
import { InjectDataSource } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { DataScopeContext, DataScopeService } from '../org/services/data-scope.service';

@Controller('api/biz/projects')
@UseGuards(AuthGuard('jwt'), MenuGuard, DataScopeGuard)
@RequireMenu('MENU_PRC2_PROJECT', 'V', ['MENU_MD_PROJECT'])
export class BizProjectsController {
  private readonly logger = new Logger(BizProjectsController.name);

  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly dataScope: DataScopeService,
    private readonly cls: ClsService,
  ) {}

  /**
   * 列出 ACTIVE 项目，可按 company_code 过滤
   * GET /api/biz/projects/active?company_code=COMP-LAO-AGRI
   */
  @Get('active')
  async listActive(@Query('company_code') companyCode?: string, @Req() req?: any) {
    return this.listInternal('ACTIVE', companyCode, req);
  }

  /**
   * 列出全部（含 DRAFT/INACTIVE）— 管理界面用
   * GET /api/biz/projects?company_code=COMP-LAO-AGRI
   */
  @Get()
  async listAll(@Query('company_code') companyCode?: string, @Query('status') status?: string, @Req() req?: any) {
    return this.listInternal(status, companyCode, req);
  }

  /**
   * 取单条
   * GET /api/biz/projects/:code
   */
  @Get(':code')
  async getOne(@Param('code') code: string, @Req() req?: any) {
    if (!(await this.tableExists())) return null;
    const scope = await this.companyScope(req);
    const rows = await this.ds.query(
      `SELECT id, project_code, project_name, project_short_name, project_type,
              company_code, accounting_subject, budget_amount, budget_currency,
              start_date, end_date, status, manager_user_id, manager_name,
              sort_order, remark, created_at, updated_at
         FROM biz_projects
        WHERE project_code = $1 AND deleted_at IS NULL
          AND ($2::boolean = true OR company_code = ANY($3::text[]))
        LIMIT 1`,
      [code, scope.isGlobal, scope.companyCodes],
    );
    return rows[0] || null;
  }

  // ── 内部辅助 ─────────────────────────────────────────────────────────────
  private async tableExists(): Promise<boolean> {
    try {
      const rows = await this.ds.query(
        `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='biz_projects' LIMIT 1`,
      );
      return rows.length > 0;
    } catch (e) {
      return false;
    }
  }

  private async companyScope(req: any): Promise<{ isGlobal: boolean; companyCodes: string[] }> {
    const clsScope = this.cls.get<DataScopeContext | undefined>('dataScope');
    if (clsScope) {
      return { isGlobal: !!clsScope.isGlobal, companyCodes: clsScope.allowedCompanyCodes ?? [] };
    }

    const user = req?.user ?? {};
    const roles: string[] = Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
    const userId = String(user.userId ?? user.id ?? '');
    try {
      const scope = await this.dataScope.resolve(userId, roles, 'MENU_PRC2_PROJECT');
      return { isGlobal: !!scope.isGlobal, companyCodes: scope.allowedCompanyCodes ?? [] };
    } catch {
      return { isGlobal: false, companyCodes: [] };
    }
  }

  private async listInternal(status?: string, companyCode?: string, req?: any) {
    if (!(await this.tableExists())) {
      this.logger.warn(
        'biz_projects 表未建。请运维执行 migrations/mdm1_01_biz_projects.sql 后此端点才会返回数据。',
      );
      return [];
    }
    const conditions: string[] = ['deleted_at IS NULL'];
    const params: any[] = [];
    const scope = await this.companyScope(req);
    if (status) {
      params.push(status);
      conditions.push(`status = $${params.length}`);
    }
    if (companyCode) {
      params.push(companyCode);
      conditions.push(`company_code = $${params.length}`);
    }
    if (!scope.isGlobal) {
      if (!scope.companyCodes.length) return [];
      params.push(scope.companyCodes);
      conditions.push(`company_code = ANY($${params.length})`);
    }
    const sql = `
      SELECT id, project_code, project_name, project_short_name, project_type,
             company_code, accounting_subject, budget_amount, budget_currency,
             start_date, end_date, status, manager_user_id, manager_name,
             sort_order, remark, created_at, updated_at
        FROM biz_projects
       WHERE ${conditions.join(' AND ')}
       ORDER BY sort_order ASC, project_code ASC`;
    return await this.ds.query(sql, params);
  }
}
