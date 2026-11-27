import { readEggSourceReleaseEvidence } from '../services/egg-source-cutover-release';
import { beginEggSourceVerification,eggSourceGovernedSites,eligibleEggSourceHouses,lockEggSourceRetirementRoster,readEggSourceVerification,verifyRetirementChallenge } from '../services/egg-source-retirement-verification';
import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, NotFoundException, Post, Get, Param, Put, Query, Req, UseGuards } from '@nestjs/common';
import { archiveLegacyBatch,legacyCleanupInventory,withdrawLegacyGrant } from '../services/egg-source-legacy-cleanup';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { EGG_SOURCE_MENU } from '../../../auth/egg-source-permissions';
import { EGG_SOURCE_HOUSE_ACTIONS,type EggSourceHouseAction,type EggSourceOrganizationGrant } from '../../../auth/egg-source-organization-grants';
import { requireEggSourceAdministrator,lockEggSourceGrantEditor,withEggSourceGrantEditorSnapshot } from '../../../auth/egg-source-organization-grants';
import { OrgOwnershipService } from '../../org/services/org-ownership.service';
import { canAccessEggSource,lockEggSourceHouse,readEggSourceOwner,sourceDigest,sourceText,sourceUuid } from '../services/egg-source-change-policy';
import { EggSourceAccessService } from '../services/egg-source-access.service';
import { applyHouseRollout, cancelSourceOperation, houseRolloutReadiness, readHouseRollout, readSourceOperationReceipt, type RolloutCommand } from '../services/egg-source-rollout';
import { candidateWarehouses,houseCreationFacts,sourceCreationReadiness,sourceCreatePolicy } from '../services/egg-source-change-read';
import { cutoverKey, cutoverReplay, digestInput, recordCutover } from '../services/egg-source-cutover-ledger';
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
  constructor(@InjectEntityManager() private readonly em: EntityManager,private readonly sourceAccess:EggSourceAccessService) {}

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
    const [data] = await this.em.query(`SELECT writes_enabled,changed_at,changed_at::text AS revision,changed_by,change_reason
      FROM md_egg_source_write_control WHERE id=1`);
    if (!data) throw new ConflictException('蛋品来源写开关未登记');
    return { code:200,data };
  }

  @Post('egg-source-write-control')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY', 'E')
  async setEggSourceWriteControl(@Req() req: any,
    @Body() body: { expectedEnabled:boolean; expectedRevision?:string|null; enabled:boolean; reason:string }) {
    const reason = typeof body?.reason==='string' ? body.reason.trim() : '';
    if (!reason || reason.length>500 || typeof body?.enabled!=='boolean' || typeof body?.expectedEnabled!=='boolean'
      || body.enabled===body.expectedEnabled) throw new BadRequestException('须提供当前状态、目标状态和变更依据');
    return this.em.transaction(async manager=>{
      const id = await requireEggSourceAdministrator(manager,req.user);
      const [before]=await manager.query(`SELECT writes_enabled,changed_at::text AS revision,changed_by,change_reason
        FROM md_egg_source_write_control WHERE id=1 FOR UPDATE`);
      if (body.expectedRevision!==undefined && body.expectedRevision!==before?.revision) throw new ConflictException('来源总写入状态已变化');
      const rows = await manager.query(`WITH changed AS (UPDATE md_egg_source_write_control
        SET writes_enabled=$1,ever_enabled=ever_enabled OR $1,changed_by=$2,change_reason=$3,changed_at=clock_timestamp()
        WHERE id=1 AND writes_enabled=$4 RETURNING writes_enabled,changed_at,changed_at::text AS revision,changed_by,change_reason)
        SELECT * FROM changed`,[body.enabled,id,reason,body.expectedEnabled]);
      if (!rows.length) throw new ConflictException('蛋品来源写开关状态已变化');
      await this.eggSourceAudit(manager,id,req.user?.username,'EGG_SOURCE_WRITE_CONTROL','global',before,rows[0]);
      return { code:200,data:rows[0] };
    });
  }

  @Get('egg-source-house-write-control')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY', 'V')
  async houseWriteControl(@Req() req:any) {
    await requireEggSourceAdministrator(this.em,req.user);
    const [data] = await this.em.query(`SELECT house_writes_enabled AS writes_enabled,house_changed_at AS changed_at,house_changed_at::text AS revision,
      house_changed_by AS changed_by,house_change_reason AS change_reason FROM md_egg_source_write_control WHERE id=1`);
    if (!data) throw new ConflictException('新版写入开关未登记');
    return {code:200,data};
  }

  @Post('egg-source-house-write-control')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY', 'E')
  async setHouseWriteControl(@Req() req:any,@Body() body:{expectedEnabled:boolean;expectedRevision?:string|null;enabled:boolean;reason:string}) {
    const reason = sourceText(body?.reason,'发布依据',500);
    if (typeof body.enabled!=='boolean' || typeof body.expectedEnabled!=='boolean' || body.expectedEnabled===body.enabled) {
      throw new BadRequestException('须提供当前和目标写入状态');
    }
    return this.em.transaction(async m=>{
      const actor = await requireEggSourceAdministrator(m,req.user);
      const [before]=await m.query(`SELECT house_writes_enabled AS writes_enabled,house_changed_at::text AS revision,
        house_changed_by AS changed_by,house_change_reason AS change_reason
        FROM md_egg_source_write_control WHERE id=1 FOR UPDATE`);
      if (body.expectedRevision!==undefined && body.expectedRevision!==before?.revision) throw new ConflictException('新版写入状态已变化');
      const [data] = await m.query(`WITH changed AS (UPDATE md_egg_source_write_control
        SET house_writes_enabled=$1,house_writes_ever_enabled=house_writes_ever_enabled OR $1,
          house_changed_by=$2,house_change_reason=$3,house_changed_at=clock_timestamp()
        WHERE id=1 AND house_writes_enabled=$4 RETURNING *)
        SELECT house_writes_enabled AS writes_enabled,house_changed_at AS changed_at,house_changed_at::text AS revision,
          house_changed_by AS changed_by,house_change_reason AS change_reason FROM changed`,
      [body.enabled,actor,reason,body.expectedEnabled]);
      if (!data) throw new ConflictException('新版写入开关已变化，请重新读取');
      await this.eggSourceAudit(m,actor,req.user?.username,'EGG_SOURCE_WRITE_CONTROL','house',before,data);
      return {code:200,data};
    });
  }

  private async legacyCreationState(m:EntityManager,lock=false) {
    const [gate] = await m.query(`SELECT legacy_creates_enabled AS enabled,writes_enabled,house_writes_enabled,
      changed_at::text AS revision,house_changed_at::text AS house_revision
      FROM md_egg_source_write_control WHERE id=1 ${lock ? 'FOR UPDATE' : ''}`);
    if (!gate) throw new ConflictException('蛋品来源写入控制未登记');
    const roster: {house_code:string;house_name:string;company_code:string|null;site_code:string|null;enabled:boolean|null;revision:string|null}[] = gate.enabled ? await m.query(`
      SELECT h.house_code,h.house_name,f.company_code,${OrgOwnershipService.FARM_SITE_SQL} AS site_code,
        r.enabled,r.changed_at::text AS revision
      FROM brd_houses h JOIN ${OrgOwnershipService.FARM_TABLE} f USING(farm_code)
      LEFT JOIN md_egg_source_house_rollouts r ON r.company_code=f.company_code AND r.house_code=h.house_code
      WHERE ${eligibleEggSourceHouses('$1')} ORDER BY f.company_code,h.house_code`,[eggSourceGovernedSites]) : [];
    const unclassified = roster.filter(row => row.enabled===null || row.enabled&&(!row.site_code||!eggSourceGovernedSites.includes(row.site_code)));
    return { enabled:!!gate.enabled, unclassified:unclassified.map(row=>row.house_code), pendingHouses:unclassified, roster,
      available:!!gate.writes_enabled && !!gate.house_writes_enabled, checklistDigest:sourceDigest({gate,roster}) };
  }

  private async retirementPilot(m:EntityManager, id:string|null=null) {
    const [row] = await m.query(`SELECT c.id::text AS "changeId",c.company_code AS "companyCode",
        c.house_code AS "houseCode", e.action_key::text AS "approvalId"
      FROM md_egg_source_changes c
      JOIN brd_houses h ON h.house_code=c.house_code AND h.farm_code=c.farm_code
      JOIN ${OrgOwnershipService.FARM_TABLE} f ON f.farm_code=h.farm_code AND c.company_code=f.company_code
        AND c.site_code=${OrgOwnershipService.FARM_SITE_SQL}
      JOIN md_egg_source_house_rollouts r ON r.company_code=c.company_code AND r.house_code=c.house_code
      JOIN md_egg_source_change_events e ON e.change_id=c.id AND e.action='approve'
      WHERE ${eligibleEggSourceHouses('$1')} AND r.enabled AND c.contract_version=2 AND c.state='APPROVED'
        AND e.actor_id=c.approved_by AND e.actor_id<>c.created_by AND ($2::uuid IS NULL OR c.id=$2::uuid)
      ORDER BY e.created_at DESC,c.id,e.action_key LIMIT 1`,[eggSourceGovernedSites,id]);
    return row as {changeId:string;companyCode:string;houseCode:string;approvalId:string}|undefined;
  }

  @Get('egg-source-legacy-creation')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY','V')
  async getLegacyCreation(@Req() req:any) {
    return this.em.transaction('REPEATABLE READ', async m => {
      await requireEggSourceAdministrator(m,req.user,false);
      const state=await this.legacyCreationState(m);
      const pilot=state.enabled ? await this.retirementPilot(m) : null;
      return {code:200,data:{...state,pilot:pilot??null,pilotVerified:!!pilot,
        verificationAvailable:state.enabled&&!!await readEggSourceReleaseEvidence()}};
    });
  }

  @Post('egg-source-legacy-creation')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY','E')
  async retireLegacyCreation(@Req() req:any, @Body() body:{
    confirmed:boolean; reason:string; requestId:unknown; checklistDigest:unknown; companyCode:string; houseCode:string;
    method:'PILOT'|'VERIFICATION'; changeId?:unknown; approvalId?:unknown; verificationId?:unknown;
    verificationDigest?:unknown; signedReason?:unknown;
  }) {
    const requestId=cutoverKey(body?.requestId);
    const reason=sourceText(body.reason,'管理员关闸依据',500);
    const companyCode=sourceText(body.companyCode,'核验证据公司',64);
    const houseCode=sourceText(body.houseCode,'核验证据鸡舍',64);
    const checklistDigest=digestInput(body.checklistDigest);
    if (body.confirmed!==true || !['PILOT','VERIFICATION'].includes(body.method)) {
      throw new BadRequestException('须核对业务切换清单并选择验收路径');
    }
    const shared={companyCode,houseCode};
    const challenge=body.method==='VERIFICATION' ? {
      ...shared,id:sourceUuid(body.verificationId,'双岗核验号'),digest:digestInput(body.verificationDigest),
      signedReason:sourceText(body.signedReason,'双岗签署依据',500),
    } : null;
    const pilot=body.method==='PILOT' ? {
      ...shared,changeId:sourceUuid(body.changeId,'首单申请号'),approvalId:sourceUuid(body.approvalId,'首单审批号'),
    } : null;
    const kind=challenge ? 'RETIRE' : 'RETIRE_PILOT';
    const command={reason,checklistDigest,challenge,pilot};
    return this.em.transaction(async m=>{
      await lockEggSourceGrantEditor(m);
      const actor=await requireEggSourceAdministrator(m,req.user);
      await lockEggSourceHouse(m,houseCode);
      const prior=await cutoverReplay(m,requestId,kind,actor,command);
      if (prior) return {code:200,data:prior};
      await lockEggSourceRetirementRoster(m);
      const before=await this.legacyCreationState(m,true);
      if (!before.enabled) throw new ConflictException({code:'LEGACY_ALREADY_RETIRED',message:'旧版新建已经关闭，请按原请求号核对回执'});
      if (before.checklistDigest!==checklistDigest || !before.available || before.unclassified.length) {
        throw new ConflictException({code:'RETIREMENT_CHECKLIST_CHANGED',message:'生产开关或逐舍清单已变化，请重新核对'});
      }
      const verified=challenge ? await verifyRetirementChallenge(m,this.sourceAccess,challenge) : null;
      if (pilot && sourceDigest((await this.retirementPilot(m,pilot.changeId))??null)!==sourceDigest(pilot)) {
        throw new ConflictException({code:'RETIREMENT_EVIDENCE_CHANGED',message:'所选新版审批单或鸡舍状态已变化，请重新核对'});
      }
      await m.query('UPDATE md_egg_source_write_control SET legacy_creates_enabled=false WHERE id=1');
      const receipt={requestId,status:'RECORDED',enabled:false as const,method:body.method,companyCode,houseCode,reason,
        pilot,verification:verified ? {...verified,consumed:true,signedReason:challenge?.signedReason} : null,checklistDigest};
      await this.eggSourceAudit(m,actor,req.user?.username,'EGG_SOURCE_LEGACY_CREATION','1',before,receipt);
      return {code:200,data:await recordCutover(m,requestId,kind,actor,command,receipt,challenge?.id)};
    });
  }

  @Post('egg-source-legacy-verification')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY','E')
  async beginLegacyVerification(@Req() req:any,@Body() body:Parameters<typeof beginEggSourceVerification>[3]) {
    return {code:200,data:await this.em.transaction(m=>beginEggSourceVerification(m,this.sourceAccess,req.user,body))};
  }

  @Get('egg-source-legacy-verification/:id')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY','V')
  async readLegacyVerification(@Req() req:any,@Param('id') id:string) {
    return this.em.transaction('REPEATABLE READ',async m=>{
      await requireEggSourceAdministrator(m,req.user,false);
      return {code:200,data:await readEggSourceVerification(m,this.sourceAccess,id,req.user,true)};
    });
  }

  @Get('egg-source-legacy-cleanup')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY','V')
  async legacyCleanup(@Req() req:any) {
    return this.em.transaction('REPEATABLE READ',async m=>{
      await requireEggSourceAdministrator(m,req.user,false);
      return {code:200,data:await legacyCleanupInventory(m)};
    });
  }

  @Get('egg-source-legacy-cleanup/receipts/:id')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY','V')
  async legacyCleanupReceipt(@Req() req:any,@Param('id') id:string) {
    await requireEggSourceAdministrator(this.em,req.user,false);
    const [data]=await this.em.query(`SELECT kind,receipt,created_at FROM md_egg_source_cutover_records
      WHERE request_id=$1 AND kind IN ('ARCHIVE','UNARCHIVE','LEGACY_GRANT')`,[sourceUuid(id,'操作请求号')]);
    if (!data) throw new NotFoundException('未找到归档或撤权回执');
    return {code:200,data};
  }

  @Post('egg-source-legacy-cleanup/archive')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY','E')
  async archiveLegacy(@Req() req:any,@Body() body:Parameters<typeof archiveLegacyBatch>[2]) {
    return {code:200,data:await this.em.transaction(m=>archiveLegacyBatch(m,req.user,body))};
  }

  @Post('egg-source-legacy-cleanup/grants/:kind/:code')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY','E')
  async withdrawLegacy(@Req() req:any,@Param('kind') kind:string,@Param('code') code:string,
    @Body() body:Parameters<typeof withdrawLegacyGrant>[4]) {
    return {code:200,data:await this.em.transaction(m=>withdrawLegacyGrant(m,req.user,kind,code,body))};
  }

  @Get('egg-source-house-rollouts')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY','V')
  async houseRollouts(@Req() req:any) {
    await requireEggSourceAdministrator(this.em,req.user);
    return {code:200,data:await this.em.query(`SELECT company_code,house_code,enabled,changed_by::text,changed_at,changed_at::text AS revision,change_reason
      FROM md_egg_source_house_rollouts ORDER BY company_code,house_code`)};
  }

  @Get('egg-source-house-access')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY','V')
  async inspectHouseAccess(@Req() req:any,@Query('house') house:string,@Query('username') username:string) {
    return this.em.transaction('REPEATABLE READ',async m=>{
      await requireEggSourceAdministrator(m,req.user,false);
      const owner=await readEggSourceOwner(m,house);
      const policy=await sourceCreatePolicy(m,owner);
      const facts=await houseCreationFacts(m,owner);
      const result=await this.sourceAccess.inspectHouseAccount(m,owner,sourceText(username,'账号',64),true);
      const {accountId,actions,origins,access}=result;
      const legacyView=!!access&&canAccessEggSource(access.scope,owner);
      const warehouses=legacyView&&access ? await candidateWarehouses(m,owner.houseCode,access.scope) : [];
      const legacyActions=access ? warehouses.map(warehouse=>({
        code:warehouse.code,name:warehouse.name,
        actions:[
          'V',
          ...(canAccessEggSource({...access.scope,actionGrants:access.edit},owner,warehouse.code)?['E']:[]),
          ...(canAccessEggSource({...access.scope,actionGrants:access.approve},owner,warehouse.code)?['A']:[]),
        ],
      })) : [];
      const createReason=access ? await sourceCreationReadiness(m,owner,{
        scope:access.scope,actor:access.actor,edit:!!access.edit.length,approve:!!access.approve.length,
        editGrants:access.edit,houseCreateGrants:access.houseCreate,sessionRestriction:access.sessionRestriction,
      },policy,facts.house,facts.businessDay) : policy.blocker??'NO_CREATE_PERMISSION';
      return {code:200,data:{eligibleAccount:!!accountId,actions,origins,diagnostics:result.diagnostics,denials:result.denials??[],
        current:{...policy,createReason,businessDay:facts.businessDay,...facts.house},
        legacy:{view:legacyView,warehouses:legacyActions},
      }};
    });
  }

  @Get('egg-source-house-rollout-readiness')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY', 'V')
  async inspectHouseRolloutReadiness(@Req() req:any, @Query('house') house:string,
    @Query('maker') maker:string, @Query('reviewer') reviewer:string) {
    return this.em.transaction('REPEATABLE READ', async m => {
      await requireEggSourceAdministrator(m, req.user, false);
      const owner = await readEggSourceOwner(m, house);
      const current = await readHouseRollout(m, owner);
      const readiness = await houseRolloutReadiness(m, this.sourceAccess, owner, {
        maker: sourceText(maker, '申请账号', 64), reviewer: sourceText(reviewer, '审核账号', 64),
      }, current);
      const { verifiedAccounts: _, ...data } = readiness;
      return { code: 200, data };
    });
  }

  @Get('egg-source-operation-receipts/:id')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY', 'V')
  async sourceOperationReceipt(@Req() req:any, @Param('id') id:string) {
    return { code: 200, data: await readSourceOperationReceipt(this.em, req.user, id) };
  }

  @Post('egg-source-operation-receipts/:id/cancel')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY', 'E')
  async cancelOperation(@Req() req:any, @Param('id') id:string, @Body() body:{operation:unknown}) {
    return this.em.transaction(async m=>({code:200,data:await cancelSourceOperation(m,req.user,id,body?.operation)}));
  }

  @Put('egg-source-house-rollouts/:house')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY', 'E')
  async setHouseRollout(@Req() req:any, @Param('house') house:string, @Body() body:RolloutCommand) {
    return this.em.transaction(async m => ({
      code: 200, data: await applyHouseRollout(m, this.sourceAccess, req.user, house, body),
    }));
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
    const [audit] = await m.query(`SELECT log_id::text AS revision FROM sys_audit_log
      WHERE action='EGG_SOURCE_HOUSE_GRANT' AND entity_type='EGG_SOURCE_HOUSE' AND entity_id=$1
        AND after_value->>'subject'=$2 ORDER BY log_id DESC LIMIT 1`,[code,subject]);
    const [standard]: {actions:EggSourceHouseAction[];revision:string}[] = await m.query(
      `SELECT actions,revision::text FROM md_egg_source_standard_grants WHERE ${column}=$1`,[result.id]);
    const actions=EGG_SOURCE_HOUSE_ACTIONS.filter(action=>rows.some(row=>row.actions.includes(action)));
    return { id:result.id as string,column,rows,standard:standard??null,actions,
      digest:sourceDigest({revision:audit?.revision??null,rows,standard:standard??null}) };
  }

  @Get('egg-source-organization-grants/:subject/:code')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY','V')
  async getHouseGrants(@Req() req:any,@Param('subject') subject:string,@Param('code') code:string) {
    return this.em.transaction('REPEATABLE READ',async m=>{
      await requireEggSourceAdministrator(m,req.user);
      const snapshot=await this.houseGrantSubject(m,subject,code);
      const {id,rows,digest,standard,actions}=snapshot;
      const inherited=subject==='role' ? await m.query(`SELECT g.scope_type,g.scope_code,g.company_code,g.actions,s.set_code
        FROM sys_role_permission_set rs JOIN sys_permission_set s USING(set_id)
        JOIN md_egg_source_effective_grants g USING(set_id)
        WHERE rs.role_id=$1 ORDER BY s.set_code,g.scope_type,g.scope_code`,[id]) : [];
      const standardDigest=await this.standardScopeDigest(m,subject,id,digest);
      return {code:200,data:{rows,digest,standardDigest,inherited,standard,actions}};
    });
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
      if (before.standard) throw new ConflictException('已切换为标准动作配置，请刷新页面');
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
      rows.sort((a,b)=>a.scope_type.localeCompare(b.scope_type)||a.scope_code.localeCompare(b.scope_code));
      if (sourceDigest(before.rows)===sourceDigest(rows)) return {code:200,data:{rows:before.rows,digest:before.digest}};
      const hasWrite=(grant:EggSourceOrganizationGrant)=>grant.actions.some(action=>action!=='V');
      if (rows.some(hasWrite) && !before.rows.some(hasWrite)) await this.assertSourceRoleSeparation(m,subject,before.id);
      await m.query("SELECT set_config('phoenix.egg_source_organization_editor','1',true)");
      await m.query(`DELETE FROM md_egg_source_organization_grants WHERE ${before.column}=$1`,[before.id]);
      if (rows.length) await m.query(`INSERT INTO md_egg_source_organization_grants(${before.column},scope_type,scope_code,company_code,actions)
        SELECT $1,r.scope_type,r.scope_code,r.company_code,r.actions FROM jsonb_to_recordset($2::jsonb)
        r(scope_type text,scope_code text,company_code text,actions text[])`,[before.id,JSON.stringify(rows)]);
      await this.bumpSourcePermissions(m,subject,before.id);
      await this.eggSourceAudit(m,actor,req.user?.username,'EGG_SOURCE_HOUSE_GRANT',code,before.rows,{subject,reason,rows});
      const after = await this.houseGrantSubject(m,subject,code);
      return {code:200,data:{rows:after.rows,digest:after.digest}};
    });
  }

  @Post('egg-source-standard-grants/:subject/:code/preview')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY','E')
  async previewStandardGrants(@Req() req:any,@Param('subject') subject:string,@Param('code') code:string,
    @Body() body:{actions:EggSourceHouseAction[];expectedDigest:string}) {
    const actions=this.standardActions(body?.actions);
    return this.em.transaction('REPEATABLE READ',async m=>{
      await requireEggSourceAdministrator(m,req.user);
      const before=await this.houseGrantSubject(m,subject,code);
      const currentDigest=await this.standardScopeDigest(m,subject,before.id,before.digest);
      if (currentDigest!==body.expectedDigest) throw new ConflictException('授权已变化，请重新读取后预览');
      const accounts=await m.query(`
        WITH affected AS (
          SELECT user_id FROM sys_user_role WHERE $1='role' AND role_id=$2
          UNION SELECT user_id FROM sys_user_permission_set WHERE $1='set' AND set_id=$2
          UNION SELECT ur.user_id FROM sys_user_role ur JOIN sys_role_permission_set rs USING(role_id)
            WHERE $1='set' AND rs.set_id=$2
        )
        SELECT u.user_id::text AS id,u.username,u.perms_version::int AS version
        FROM sys_user u JOIN affected a USING(user_id)
        WHERE u.status=1 AND u.username IS NOT NULL AND NOT EXISTS (
          SELECT 1 FROM sys_user_role ur JOIN sys_role r USING(role_id)
          WHERE ur.user_id=u.user_id AND COALESCE(ur.is_visible,true) AND r.status='ACTIVE' AND r.role_code='ROLE_ADMIN')
        ORDER BY u.user_id`,[subject,before.id]);
      const houses=await m.query(`
        SELECT f.company_code AS "companyCode",f.farm_code AS "farmCode",
          ${OrgOwnershipService.FARM_SITE_SQL} AS "siteCode",h.house_code AS "houseCode"
        FROM brd_houses h JOIN ${OrgOwnershipService.FARM_TABLE} f USING(farm_code)
        WHERE f.company_code IS NOT NULL AND ${OrgOwnershipService.FARM_SITE_SQL} IS NOT NULL
        ORDER BY f.company_code,h.house_code`);
      const changes=await this.sourceAccess.previewHouseGrants(m,{subject:subject as 'role'|'set',id:before.id,prior:before.rows,actions},
        accounts,houses);
      return {code:200,data:{digest:sourceDigest({currentDigest,actions}),changes,accounts:accounts.length,houses:houses.length}};
    });
  }

  private standardActions(input:unknown) {
    if (!Array.isArray(input) || input.some(action=>!EGG_SOURCE_HOUSE_ACTIONS.includes(action))
      || new Set(input).size!==input.length) throw new BadRequestException('标准动作授权内容无效');
    return EGG_SOURCE_HOUSE_ACTIONS.filter(action=>input.includes(action));
  }

  @Put('egg-source-standard-grants/:subject/:code')
  @RequireMenu('MENU_SETTINGS_MENU_REGISTRY','E')
  async setStandardGrants(@Req() req:any,@Param('subject') subject:string,@Param('code') code:string,
    @Body() body:{actions:EggSourceHouseAction[];expectedDigest:string;reason:string}) {
    const reason=sourceText(body?.reason,'授权变更依据',500);
    const actions=this.standardActions(body?.actions);
    if (typeof body.expectedDigest!=='string') throw new BadRequestException('须先核对授权影响预览');
    return withEggSourceGrantEditorSnapshot(this.em,async m=>{
      const actor=await requireEggSourceAdministrator(m,req.user);
      const before=await this.houseGrantSubject(m,subject,code,true);
      const currentDigest=await this.standardScopeDigest(m,subject,before.id,before.digest);
      if (sourceDigest({currentDigest,actions})!==body.expectedDigest) throw new ConflictException('授权已变化，请重新核对');
      const prior=before.standard?.actions??before.actions;
      const same=actions.length===prior.length && actions.every(action=>prior.includes(action));
      if (before.standard && same) return {code:200,data:{standard:before.standard,digest:currentDigest}};
      // A scoped subject is converted with its exact current actions and original limits.
      // Editing those actions is a separate, audited operation after conversion.
      if (!before.standard && before.rows.length && !same) {
        throw new ConflictException('首次转换须保留既有动作。转换完成后可另行调整');
      }
      if (actions.some(action=>action!=='V') && !prior.some(action=>action!=='V')) {
        await this.assertSourceRoleSeparation(m,subject,before.id);
      }
      await m.query("SELECT set_config('phoenix.egg_source_standard_editor','1',true)");
      await m.query(`INSERT INTO md_egg_source_standard_grants (${before.column},actions) VALUES ($1,$2)
        ON CONFLICT (${before.column}) DO UPDATE SET actions=EXCLUDED.actions,
          revision=md_egg_source_standard_grants.revision+1`,[before.id,actions]);
      await this.bumpSourcePermissions(m,subject,before.id);
      await this.eggSourceAudit(m,actor,req.user?.username,'EGG_SOURCE_STANDARD_GRANT',code,
        {subject,standard:before.standard,actions:prior,retainedScopes:before.rows},
        {subject,actions,reason,retainedScopes:before.rows});
      const after=await this.houseGrantSubject(m,subject,code);
      const digest=await this.standardScopeDigest(m,subject,after.id,after.digest);
      return {code:200,data:{standard:after.standard,digest}};
    }).catch(error=>{
      if ((error as {code?:unknown})?.code==='40001') throw new ConflictException('授权同时发生变化，请重新核对');
      throw error;
    });
  }

  private async standardScopeDigest(m:EntityManager,subject:string,id:string,grantDigest:string) {
    // Fingerprint the dependencies of affected accounts in the same snapshot as the matrix.
    // Only the digest goes to the browser.
    const [row] = await m.query(`
      WITH affected AS (
        SELECT user_id FROM sys_user_role WHERE $1='role' AND role_id=$2
        UNION SELECT user_id FROM sys_user_permission_set WHERE $1='set' AND set_id=$2
        UNION SELECT ur.user_id FROM sys_user_role ur JOIN sys_role_permission_set rs USING(role_id)
          WHERE $1='set' AND rs.set_id=$2
      ), assigned_roles AS (
        SELECT ur.user_id,ur.role_id,ur.is_visible,r.status FROM sys_user_role ur JOIN sys_role r USING(role_id)
        JOIN affected a USING(user_id)
      ), assigned_sets AS (
        SELECT ar.user_id,rs.set_id,ar.role_id FROM assigned_roles ar JOIN sys_role_permission_set rs USING(role_id)
        UNION ALL SELECT us.user_id,us.set_id,NULL::bigint FROM sys_user_permission_set us JOIN affected a USING(user_id)
      ), legacy_access AS (
        SELECT ar.user_id,ar.role_id,NULL::bigint AS set_id,p.perm_codes,p.deny_codes,p.scope_type,p.scope_value
        FROM assigned_roles ar JOIN sys_role_menu_permission p USING(role_id) JOIN sys_menu m USING(menu_id)
        WHERE m.menu_code=$3
        UNION ALL
        SELECT aset.user_id,aset.role_id,aset.set_id,p.perm_codes,p.deny_codes,p.scope_type,p.scope_value
        FROM assigned_sets aset JOIN sys_permission_set_item p USING(set_id) JOIN sys_menu m USING(menu_id)
        WHERE m.menu_code=$3
      ), scoped_grants AS (
        SELECT ar.user_id,g.* FROM assigned_roles ar JOIN md_egg_source_organization_grants g USING(role_id)
        UNION ALL SELECT aset.user_id,g.* FROM assigned_sets aset JOIN md_egg_source_organization_grants g USING(set_id)
      ), standard_grants AS (
        SELECT ar.user_id,g.* FROM assigned_roles ar JOIN md_egg_source_standard_grants g USING(role_id)
        UNION ALL SELECT aset.user_id,g.* FROM assigned_sets aset JOIN md_egg_source_standard_grants g USING(set_id)
      )
      SELECT jsonb_build_object(
        'accounts',(SELECT jsonb_agg(jsonb_build_array(u.user_id,u.status,u.perms_version) ORDER BY u.user_id)
          FROM sys_user u JOIN affected a USING(user_id)),
        'roles',(SELECT jsonb_agg(to_jsonb(ar) ORDER BY user_id,role_id) FROM assigned_roles ar),
        'sets',(SELECT jsonb_agg(to_jsonb(aset) ORDER BY user_id,role_id,set_id) FROM assigned_sets aset),
        'legacy',(SELECT jsonb_agg(to_jsonb(la) ORDER BY user_id,role_id,set_id) FROM legacy_access la),
        'scopedGrants',(SELECT jsonb_agg(to_jsonb(g) ORDER BY user_id,role_id,set_id,scope_type,scope_code) FROM scoped_grants g),
        'standardGrants',(SELECT jsonb_agg(to_jsonb(g) ORDER BY user_id,role_id,set_id) FROM standard_grants g),
        'organizations',(SELECT jsonb_agg(jsonb_build_array(o.id,o.org_code,o.org_type,o.parent_id,o.status,o.company_code,o.site_code,o.warehouse_code)
          ORDER BY o.id) FROM sys_organizations o),
        'organizationBindings',(SELECT jsonb_agg(jsonb_build_array(o.user_id,o.org_id,o.data_scope_level)
          ORDER BY o.user_id,o.org_id,o.data_scope_level) FROM sys_user_orgs o JOIN affected a USING(user_id)),
        'farmBindings',(SELECT jsonb_agg(jsonb_build_array(f.user_id,f.farm_code) ORDER BY f.user_id,f.farm_code)
          FROM sys_user_farm_scopes f JOIN affected a USING(user_id)),
        'warehouseBindings',(SELECT jsonb_agg(jsonb_build_array(w.user_id,w.warehouse_code) ORDER BY w.user_id,w.warehouse_code)
          FROM sys_user_warehouse_scopes w JOIN affected a USING(user_id)),
        'farms',(SELECT jsonb_agg(jsonb_build_array(f.farm_code,f.company_code,f.status,${OrgOwnershipService.FARM_SITE_SQL}) ORDER BY f.farm_code)
          FROM ${OrgOwnershipService.FARM_TABLE} f),
        'houses',(SELECT jsonb_agg(jsonb_build_array(h.house_code,h.farm_code,h.status,h.house_type) ORDER BY h.house_code)
          FROM brd_houses h),
        'warehouses',(SELECT jsonb_agg(jsonb_build_array(w.warehouse_code,w.company_code,w.site_code,w.status,w.domain) ORDER BY w.warehouse_code)
          FROM wms_warehouses w)
      ) AS dependencies`,[subject,id,EGG_SOURCE_MENU]);
    return sourceDigest({grantDigest,dependencies:row.dependencies});
  }

  private async assertSourceRoleSeparation(m:EntityManager,subject:string,id:string) {
    const [conflict]=await m.query(`WITH roles AS (
      SELECT role_id FROM sys_role WHERE $1='role' AND role_id=$2
      UNION SELECT role_id FROM sys_role_permission_set WHERE $1='set' AND set_id=$2
    ), write_menus AS (
      SELECT p.role_id,m.menu_code FROM sys_role_menu_permission p JOIN sys_menu m USING(menu_id)
        JOIN roles r USING(role_id) WHERE p.perm_codes='*' OR string_to_array(p.perm_codes,',') && ARRAY['C','E','D','A']
      UNION SELECT rs.role_id,m.menu_code FROM sys_role_permission_set rs JOIN sys_permission_set_item p USING(set_id)
        JOIN sys_menu m USING(menu_id) JOIN roles r ON r.role_id=rs.role_id
        WHERE p.perm_codes='*' OR string_to_array(p.perm_codes,',') && ARRAY['C','E','D','A']
    ) SELECT c.menu_a,c.menu_b FROM sys_role_conflict c JOIN write_menus w ON
      (c.menu_a=$3 AND c.menu_b=w.menu_code OR c.menu_b=$3 AND c.menu_a=w.menu_code)
      WHERE c.severity='BLOCK'
      AND NOT EXISTS (SELECT 1 FROM write_menus d WHERE d.role_id=w.role_id AND d.menu_code=$3)
      AND NOT EXISTS (SELECT 1 FROM md_egg_source_effective_grants g
        WHERE g.actions && ARRAY['C','E','A']::text[] AND (g.role_id=w.role_id OR g.set_id IN (
          SELECT set_id FROM sys_role_permission_set WHERE role_id=w.role_id))) LIMIT 1`,
      [subject,id,EGG_SOURCE_MENU]);
    if (conflict) throw new ConflictException('新增岗位分离冲突，请核对角色与权限');
  }

  private async bumpSourcePermissions(m:EntityManager,subject:string,id:string) {
    const affected = subject==='role' ? 'SELECT user_id FROM sys_user_role WHERE role_id=$1' :
      `SELECT user_id FROM sys_user_permission_set WHERE set_id=$1 UNION
        SELECT ur.user_id FROM sys_user_role ur JOIN sys_role_permission_set ps USING(role_id) WHERE ps.set_id=$1`;
    await m.query(`UPDATE sys_user SET perms_version=COALESCE(perms_version,0)+1
      WHERE user_id IN (${affected})`,[id]);
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
