import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Post, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { EGG_SOURCE_HOUSE_ACTIONS,type EggSourceOrganizationGrant } from '../../../auth/egg-source-organization-grants';
import { requireEggSourceAdministrator,lockEggSourceGrantEditor } from '../../../auth/egg-source-organization-grants';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';
import { lockEggSourceHouse,readEggSourceOwner,sourceDigest,sourceText } from '../services/egg-source-change-policy';
import { MenuGuard, RequireMenu } from '../../../common/guards/menu.guard';
import {
  rehydrate,
  getMenuRegistryStats,
} from '../../../common/guards/menu-registry.service';

/**
 * MenuAdminController — menu-registry 管理（G6 收紧 · 2026-06-06）
 * ════════════════════════════════════════════════════════════════════════
 * 业务方在主数据中心新增/启停菜单后，可调 reload 端点立即生效，
 * 无需重启 API 服务。
 */
@Controller('api/sys/menu-registry')
@UseGuards(MenuGuard)
export class MenuAdminController {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  /** GET /api/sys/menu-registry/stats — 调试用，查看当前内存 Set 大小与数据源 */
  @Get('stats')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY', 'V')
  stats() {
    return { code: 200, data: getMenuRegistryStats() };
  }

  /** Explicit catalog install after pilot approval. Does not grant a role, change a period or enable inventory. */
  @Post('install-production-finance-review')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY', 'E')
  async installProductionFinanceReview() {
    const menuCode = 'MENU_PROD_FIN_REVIEW';
    const route = '/breeding/production-finance-review';
    const installed = await this.em.transaction(async m => {
      await m.query("SELECT pg_advisory_xact_lock(hashtext('menu-registry-install'),hashtext($1))",[menuCode]);
      const [existing] = await m.query('SELECT route,domain FROM sys_menu WHERE menu_code=$1',[menuCode]);
      if (existing) {
        if (existing.route !== route || existing.domain !== 'FARM') throw new ConflictException('已有菜单登记与生产财务核签不一致');
        return false;
      }
      await m.query(`INSERT INTO sys_menu(menu_code,menu_name_zh,menu_name_lo,domain,sort_order,route)
        VALUES($1,'生产财务核签','ກວດການເງິນການຜະລິດ','FARM',18,$2)`,[menuCode,route]);
      return true;
    });
    await rehydrate(this.em);
    return { menuCode, installed };
  }

  @Get('egg-source-write-control')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY', 'V')
  async eggSourceWriteControl(@Req() req: any) {
    await requireEggSourceAdministrator(this.em, req.user);
    const [data] = await this.em.query(`SELECT writes_enabled,changed_at,changed_by,change_reason
      FROM md_egg_source_write_control WHERE id=1`);
    if (!data) throw new ConflictException('蛋品来源写开关未登记');
    return { code:200,data };
  }

  @Post('egg-source-write-control')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY', 'E')
  async setEggSourceWriteControl(@Req() req: any,
    @Body() body: { expectedEnabled:boolean; enabled:boolean; reason:string }) {
    const reason = typeof body?.reason==='string' ? body.reason.trim() : '';
    if (!reason || reason.length>500 || typeof body?.enabled!=='boolean' || typeof body?.expectedEnabled!=='boolean'
      || body.enabled===body.expectedEnabled) throw new BadRequestException('须提供当前状态、目标状态和变更依据');
    return this.em.transaction(async manager=>{
      const id = await requireEggSourceAdministrator(manager,req.user);
      const rows = await manager.query(`WITH changed AS (UPDATE md_egg_source_write_control
        SET writes_enabled=$1,ever_enabled=ever_enabled OR $1,changed_by=$2,change_reason=$3,changed_at=clock_timestamp()
        WHERE id=1 AND writes_enabled=$4 RETURNING writes_enabled,changed_at,changed_by,change_reason)
        SELECT * FROM changed`,[body.enabled,id,reason,body.expectedEnabled]);
      if (!rows.length) throw new ConflictException('蛋品来源写开关状态已变化');
      return { code:200,data:rows[0] };
    });
  }

  @Get('egg-source-house-write-control')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY', 'V')
  async houseWriteControl(@Req() req:any) {
    await requireEggSourceAdministrator(this.em,req.user);
    const [data] = await this.em.query(`SELECT house_writes_enabled AS writes_enabled,house_changed_at AS changed_at,
      house_changed_by AS changed_by,house_change_reason AS change_reason FROM md_egg_source_write_control WHERE id=1`);
    if (!data) throw new ConflictException('新版写入开关未登记');
    return {code:200,data};
  }

  @Post('egg-source-house-write-control')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY', 'E')
  async setHouseWriteControl(@Req() req:any,@Body() body:{expectedEnabled:boolean;enabled:boolean;reason:string}) {
    const reason = sourceText(body?.reason,'发布依据',500);
    if (typeof body.enabled!=='boolean' || typeof body.expectedEnabled!=='boolean' || body.expectedEnabled===body.enabled) {
      throw new BadRequestException('须提供当前和目标写入状态');
    }
    return this.em.transaction(async m=>{
      const actor = await requireEggSourceAdministrator(m,req.user);
      const [data] = await m.query(`WITH changed AS (UPDATE md_egg_source_write_control
        SET house_writes_enabled=$1,house_writes_ever_enabled=house_writes_ever_enabled OR $1,
          house_changed_by=$2,house_change_reason=$3,house_changed_at=clock_timestamp()
        WHERE id=1 AND house_writes_enabled=$4 RETURNING *)
        SELECT house_writes_enabled AS writes_enabled,house_changed_at AS changed_at,
          house_changed_by AS changed_by,house_change_reason AS change_reason FROM changed`,
      [body.enabled,actor,reason,body.expectedEnabled]);
      if (!data) throw new ConflictException('新版写入开关已变化，请重新读取');
      return {code:200,data};
    });
  }

  @Get('egg-source-house-rollouts')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY','V')
  async houseRollouts(@Req() req:any) {
    await requireEggSourceAdministrator(this.em,req.user);
    return {code:200,data:await this.em.query(`SELECT company_code,house_code,enabled,changed_by::text,changed_at,change_reason
      FROM md_egg_source_house_rollouts ORDER BY company_code,house_code`)};
  }

  @Put('egg-source-house-rollouts/:house')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY','E')
  async setHouseRollout(@Req() req:any,@Param('house') house:string,
    @Body() body:{expectedEnabled:boolean|null;enabled:boolean;reason:string}) {
    const reason = sourceText(body?.reason,'鸡舍切换依据',500);
    if (typeof body.enabled!=='boolean' || (body.expectedEnabled!==null && typeof body.expectedEnabled!=='boolean') ||
        body.expectedEnabled===body.enabled || body.expectedEnabled===null && !body.enabled) {
      throw new BadRequestException('须提供当前和目标开放状态');
    }
    return this.em.transaction(async m=>{
      const actor = await requireEggSourceAdministrator(m,req.user);
      await lockEggSourceHouse(m,house);
      const owner = await readEggSourceOwner(m,house,body.enabled,true);
      const [before] = await m.query(`SELECT enabled FROM md_egg_source_house_rollouts
        WHERE company_code=$1 AND house_code=$2 FOR UPDATE`,[owner.companyCode,owner.houseCode]);
      if ((before?.enabled??null)!==body.expectedEnabled) throw new ConflictException('鸡舍开放状态已变化，请刷新');
      await m.query("SELECT set_config('phoenix.egg_source_rollout_editor','1',true)");
      const rows = await m.query(`WITH changed AS (INSERT INTO md_egg_source_house_rollouts
        (company_code,house_code,enabled,changed_by,change_reason) VALUES($1,$2,$3,$4,$5)
        ON CONFLICT(company_code,house_code) DO UPDATE SET enabled=EXCLUDED.enabled,
          changed_by=EXCLUDED.changed_by,change_reason=EXCLUDED.change_reason,changed_at=clock_timestamp()
        RETURNING *) SELECT company_code,house_code,enabled,changed_by::text,changed_at,change_reason FROM changed`,
      [owner.companyCode,owner.houseCode,body.enabled,actor,reason]);
      await this.eggSourceAudit(m,actor,req.user?.username,'EGG_SOURCE_HOUSE_ROLLOUT',owner.houseCode,before??null,rows[0]);
      return {code:200,data:rows[0]};
    });
  }

  private organizationOptions(m:EntityManager,scope:string,search:string,exact=false) {
    const queries = {
      HOUSE:`SELECT h.house_code AS code,h.house_name AS name,f.company_code FROM brd_houses h
        JOIN ${OrgOwnershipService.FARM_TABLE} f USING(farm_code)
        WHERE h.status='ACTIVE' AND h.house_type='LAYER' AND f.status='ACTIVE'
          AND ${OrgOwnershipService.FARM_SITE_SQL} IS NOT NULL`,
      FARM:`SELECT f.farm_code AS code,f.farm_name AS name,f.company_code FROM ${OrgOwnershipService.FARM_TABLE} f
        WHERE f.status='ACTIVE' AND ${OrgOwnershipService.FARM_SITE_SQL} IS NOT NULL`,
      SITE:`SELECT org_code AS code,org_name AS name,company_code FROM sys_organizations
        WHERE status='ACTIVE' AND org_type='SITE' AND company_code IS NOT NULL`,
      COMPANY:`SELECT COALESCE(NULLIF(company_code,''),org_code) AS code,org_name AS name,
        COALESCE(NULLIF(company_code,''),org_code) AS company_code FROM sys_organizations
        WHERE status='ACTIVE' AND org_type='COMPANY'`,
    };
    if (!Object.prototype.hasOwnProperty.call(queries,scope)) throw new BadRequestException('组织范围类型无效');
    const query = queries[scope as keyof typeof queries];
    return m.query(`SELECT DISTINCT ON(code,company_code) code,name,company_code AS "companyCode" FROM (${query}) source
      WHERE company_code IS NOT NULL AND ${exact ? 'code=$1' : "(code ILIKE '%'||$1||'%' OR name ILIKE '%'||$1||'%')"}
      ORDER BY code,company_code,name LIMIT 50`,[search]);
  }

  @Get('egg-source-organizations')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY','V')
  async eggSourceOrganizations(@Req() req:any,@Query('scope') scope:string,@Query('search') search='') {
    await requireEggSourceAdministrator(this.em,req.user);
    if (typeof search!=='string' || search.length>100) throw new BadRequestException('组织查询无效');
    return {code:200,data:await this.organizationOptions(this.em,scope,search.trim())};
  }

  private async houseGrantSubject(m:EntityManager,subject:string,code:string,lock=false) {
    sourceText(code,'角色或权限集编码',64);
    if (subject!=='role' && subject!=='set') throw new BadRequestException('授权主体无效');
    const column = subject==='role' ? 'role_id' : 'set_id';
    const [result] = await m.query(subject==='role'
      ? `SELECT role_id::text AS id FROM sys_role WHERE role_code=$1 AND status='ACTIVE' AND role_code<>'ROLE_ADMIN' ${lock?'FOR UPDATE':''}`
      : `SELECT set_id::text AS id FROM sys_permission_set WHERE set_code=$1 ${lock?'FOR UPDATE':''}`,[code]);
    if (!result) throw new BadRequestException('角色或权限集不存在或未启用');
    const rows:EggSourceOrganizationGrant[] = await m.query(`SELECT scope_type,scope_code,company_code,actions
      FROM md_egg_source_organization_grants WHERE ${column}=$1 ORDER BY scope_type,scope_code`,[result.id]);
    return { id:result.id as string,column,rows,digest:sourceDigest(rows) };
  }

  @Get('egg-source-organization-grants/:subject/:code')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY','V')
  async getHouseGrants(@Req() req:any,@Param('subject') subject:string,@Param('code') code:string) {
    await requireEggSourceAdministrator(this.em,req.user);
    const {rows,digest} = await this.houseGrantSubject(this.em,subject,code);
    return {code:200,data:{rows,digest}};
  }

  @Put('egg-source-organization-grants/:subject/:code')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY','E')
  async setHouseGrants(@Req() req:any,@Param('subject') subject:string,@Param('code') code:string,
    @Body() body:{rows:EggSourceOrganizationGrant[];expectedDigest:string;reason:string}) {
    const reason = sourceText(body?.reason,'授权变更依据',500);
    if (!Array.isArray(body.rows) || body.rows.length>100 || typeof body.expectedDigest!=='string') {
      throw new BadRequestException('组织授权内容无效');
    }
    return this.em.transaction(async m=>{
      await lockEggSourceGrantEditor(m);
      const actor = await requireEggSourceAdministrator(m,req.user);
      const before = await this.houseGrantSubject(m,subject,code,true);
      if (before.digest!==body.expectedDigest) throw new ConflictException('组织授权已变化，请刷新后再保存');
      const seen = new Set<string>();
      const rows:EggSourceOrganizationGrant[] = [];
      for (const row of body.rows) {
        const scope = row?.scope_type;
        const scopeCode = sourceText(row?.scope_code,'组织范围编码',64);
        const key = JSON.stringify([scope,scopeCode]);
        const [organization,...duplicates] = await this.organizationOptions(m,scope,scopeCode,true);
        const existing = before.rows.find(row=>row.scope_type===scope && row.scope_code===scopeCode);
        if (seen.has(key) || !Array.isArray(row.actions) || !row.actions.length ||
          row.actions.some(action=>!EGG_SOURCE_HOUSE_ACTIONS.includes(action)) ||
          !organization || duplicates.length || (row.company_code!=null && row.company_code!==organization.companyCode) ||
          (existing && existing.company_code!==organization.companyCode)) {
          throw new BadRequestException('存在重复、无效或未启用的组织授权');
        }
        seen.add(key);
        rows.push({scope_type:scope,scope_code:scopeCode,company_code:organization.companyCode,actions:EGG_SOURCE_HOUSE_ACTIONS.filter(action=>row.actions.includes(action))});
      }
      await m.query("SELECT set_config('phoenix.egg_source_organization_editor','1',true)");
      await m.query(`DELETE FROM md_egg_source_organization_grants WHERE ${before.column}=$1`,[before.id]);
      if (rows.length) await m.query(`INSERT INTO md_egg_source_organization_grants(${before.column},scope_type,scope_code,company_code,actions)
        SELECT $1,r.scope_type,r.scope_code,r.company_code,r.actions FROM jsonb_to_recordset($2::jsonb)
        r(scope_type text,scope_code text,company_code text,actions text[])`,[before.id,JSON.stringify(rows)]);
      const affected = subject==='role' ? 'SELECT user_id FROM sys_user_role WHERE role_id=$1' :
        `SELECT user_id FROM sys_user_permission_set WHERE set_id=$1 UNION
          SELECT ur.user_id FROM sys_user_role ur JOIN sys_role_permission_set ps USING(role_id) WHERE ps.set_id=$1`;
      await m.query(`UPDATE sys_user SET perms_version=COALESCE(perms_version,0)+1
        WHERE user_id IN (${affected})`,[before.id]);
      const after = await this.houseGrantSubject(m,subject,code);
      await this.eggSourceAudit(m,actor,req.user?.username,'EGG_SOURCE_HOUSE_GRANT',code,before.rows,{subject,reason,rows:after.rows});
      return {code:200,data:{rows:after.rows,digest:after.digest}};
    });
  }

  private eggSourceAudit(m:EntityManager,actor:string,userName:unknown,action:string,code:string,before:unknown,after:unknown) {
    return m.query(`INSERT INTO sys_audit_log(user_id,user_name,action,entity_type,entity_id,before_value,after_value)
      VALUES ($1,$2,$3,'EGG_SOURCE_HOUSE',$4,$5::jsonb,$6::jsonb)`,
    [actor,typeof userName==='string' ? userName.slice(0,64) : actor,action,code,JSON.stringify(before),JSON.stringify(after)]);
  }

  /** POST /api/sys/menu-registry/reload — 强制重新从 sys_menu 加载 menu_codes */
  @Post('reload')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY', 'E')
  async reload() {
    await rehydrate(this.em);
    return { code: 200, data: getMenuRegistryStats(), message: 'menu-registry reloaded' };
  }
}
