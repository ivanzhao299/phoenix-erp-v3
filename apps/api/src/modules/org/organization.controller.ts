/**
 * Phoenix ERP V3 — OrganizationController
 * Organization Runtime Phase 1
 * 路由前缀：/api/organizations
 * 2026-05-31
 *
 * ── 与 OrgController(/api/org) 的边界（G80 评估，2026-06-10）──
 * 本控制器=组织树 Runtime 视角（MENU_ORG_VIEW，树/CRUD/启停，master-data/organizations
 * 与 UserOrgBindingPanel 在用）；/api/org/*=管理视角（绑定/数据范围/成员）。
 * 二者故意分离、不合并（详见 org.controller.ts 头注）。
 *
 * 端点一览：
 *  GET  /api/organizations/tree            → 完整组织树（嵌套结构）
 *  GET  /api/organizations                 → 平铺列表
 *  GET  /api/organizations/by-type         → ?type=SITE 按类型过滤
 *  GET  /api/organizations/user-scopes/:userId → 用户组织授权范围
 *  GET  /api/organizations/:code           → 按 orgCode 查单条
 *  POST /api/organizations                 → 创建组织
 *  PATCH /api/organizations/:code          → 更新组织
 *  POST /api/organizations/:code/disable   → 禁用组织
 *  POST /api/organizations/:code/enable    → 启用组织
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from './guards/data-scope.guard';
import { OrgService } from './services/org.service';
import { SysOrganizationEntity } from './entities/sys-organization.entity';
import { CreateOrgDto } from './dto/create-org.dto';
import { UpdateOrgDto } from './dto/update-org.dto';

const ORG_MENU = 'MENU_MD_ORG';
const USER_MENU = 'MENU_SETTINGS_USER';
const LEGACY_ORG_VIEW_MENU = 'MENU_ORG_VIEW';
const LEGACY_ORG_MANAGE_MENU = 'MENU_ORG_MANAGE';
const LEGACY_SYS_ORG_MENU = 'MENU_SYS_ORG';

// ── 本地工具类型 ──────────────────────────────────────────────────────────────

type OrgTreeNode = SysOrganizationEntity & { children: OrgTreeNode[] };

/** 将平铺列表组装成嵌套树（按 parentId 关联） */
function buildTree(orgs: SysOrganizationEntity[]): OrgTreeNode[] {
  const map = new Map<number, OrgTreeNode>();
  const roots: OrgTreeNode[] = [];

  for (const org of orgs) {
    map.set(org.id, { ...org, children: [] });
  }

  for (const node of map.values()) {
    if (node.parentId && map.has(node.parentId)) {
      map.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  return roots;
}

// ── Controller ────────────────────────────────────────────────────────────────

@Controller('api/organizations')
@UseGuards(MenuGuard, DataScopeGuard)
export class OrganizationController {
  constructor(private readonly orgService: OrgService) {}

  // ── GET /api/organizations/tree ──────────────────────────────────────────────

  /**
   * 获取完整组织树（嵌套结构）
   * 注意：NestJS 路由匹配按声明顺序优先，静态段 tree 必须置于 :code 之前
   */
  @Get('tree')
  @RequireMenu(ORG_MENU, 'V', [USER_MENU, LEGACY_ORG_VIEW_MENU, LEGACY_SYS_ORG_MENU])
  async getOrgTree() {
    const orgs = await this.orgService.listOrgs();
    const tree = buildTree(orgs);
    return { code: 200, data: tree };
  }

  // ── GET /api/organizations/by-type ───────────────────────────────────────────

  /**
   * 按组织类型过滤
   * 示例：GET /api/organizations/by-type?type=SITE
   */
  @Get('by-type')
  @RequireMenu(ORG_MENU, 'V', [USER_MENU, LEGACY_ORG_VIEW_MENU, LEGACY_SYS_ORG_MENU])
  async getOrgsByType(@Query('type') type: string) {
    const orgs = await this.orgService.listOrgs();
    const data = type
      ? orgs.filter((o) => o.orgType === type)
      : orgs;
    return { code: 200, data };
  }

  // ── GET /api/organizations/user-scopes/:userId ───────────────────────────────

  /**
   * 获取指定用户的组织授权范围（含项目授权 + 仓库授权）
   */
  @Get('user-scopes/:userId')
  @RequireMenu(ORG_MENU, 'V', [USER_MENU, LEGACY_ORG_VIEW_MENU, LEGACY_SYS_ORG_MENU])
  async getUserOrgScopes(@Param('userId') userId: string) {
    const id = parseInt(userId, 10);
    const [userOrgs, scopes] = await Promise.all([
      this.orgService.getUserOrgs(id),
      this.orgService.getUserScopes(id),
    ]);
    return {
      code: 200,
      data: {
        orgs: userOrgs,
        projects: scopes.projects,
        warehouses: scopes.warehouses,
      },
    };
  }

  // ── GET /api/organizations ───────────────────────────────────────────────────

  /**
   * 平铺列表（按 level + orgCode 排序，由 OrgService.listOrgs 保证）
   */
  @Get()
  @RequireMenu(ORG_MENU, 'V', [USER_MENU, LEGACY_ORG_VIEW_MENU, LEGACY_SYS_ORG_MENU])
  async listOrgs() {
    const data = await this.orgService.listOrgs();
    return { code: 200, data };
  }

  // ── GET /api/organizations/:code ─────────────────────────────────────────────

  /**
   * 按 orgCode 查单条组织
   * OrgService.getOrg 接受 id，此处先通过 listOrgs 定位 orgCode 对应的记录
   */
  @Get(':code')
  @RequireMenu(ORG_MENU, 'V', [USER_MENU, LEGACY_ORG_VIEW_MENU, LEGACY_SYS_ORG_MENU])
  async getOrgByCode(@Param('code') code: string) {
    const orgs = await this.orgService.listOrgs();
    const org = orgs.find((o) => o.orgCode === code);
    if (!org) throw new NotFoundException(`Organization with code "${code}" not found`);
    return { code: 200, data: org };
  }

  // ── POST /api/organizations ──────────────────────────────────────────────────

  /**
   * 创建新组织
   */
  @Post()
  @RequireMenu(ORG_MENU, 'C', [LEGACY_ORG_MANAGE_MENU, LEGACY_SYS_ORG_MENU])
  @HttpCode(HttpStatus.OK)
  async createOrg(@Body() dto: CreateOrgDto) {
    const data = await this.orgService.createOrg(dto);
    return { code: 200, data };
  }

  // ── PATCH /api/organizations/:code ───────────────────────────────────────────

  /**
   * 更新组织（先按 orgCode 解析 id，再调用 updateOrg(id, dto)）
   */
  @Patch(':code')
  @RequireMenu(ORG_MENU, 'E', [LEGACY_ORG_MANAGE_MENU, LEGACY_SYS_ORG_MENU])
  @HttpCode(HttpStatus.OK)
  async updateOrg(
    @Param('code') code: string,
    @Body() dto: UpdateOrgDto,
  ) {
    const orgs = await this.orgService.listOrgs();
    const org = orgs.find((o) => o.orgCode === code);
    if (!org) throw new NotFoundException(`Organization with code "${code}" not found`);
    const data = await this.orgService.updateOrg(org.id, dto);
    return { code: 200, data };
  }

  // ── POST /api/organizations/:code/disable ────────────────────────────────────

  /**
   * 禁用组织（将 status 设为 INACTIVE）
   */
  @Post(':code/disable')
  @RequireMenu(ORG_MENU, 'E', [LEGACY_ORG_MANAGE_MENU, LEGACY_SYS_ORG_MENU])
  @HttpCode(HttpStatus.OK)
  async disableOrg(@Param('code') code: string) {
    const orgs = await this.orgService.listOrgs();
    const org = orgs.find((o) => o.orgCode === code);
    if (!org) throw new NotFoundException(`Organization with code "${code}" not found`);
    const data = await this.orgService.updateOrg(org.id, { status: 'INACTIVE' });
    return { code: 200, data };
  }

  // ── POST /api/organizations/:code/enable ─────────────────────────────────────

  /**
   * 启用组织（将 status 设为 ACTIVE）
   */
  @Post(':code/enable')
  @RequireMenu(ORG_MENU, 'E', [LEGACY_ORG_MANAGE_MENU, LEGACY_SYS_ORG_MENU])
  @HttpCode(HttpStatus.OK)
  async enableOrg(@Param('code') code: string) {
    const orgs = await this.orgService.listOrgs();
    const org = orgs.find((o) => o.orgCode === code);
    if (!org) throw new NotFoundException(`Organization with code "${code}" not found`);
    const data = await this.orgService.updateOrg(org.id, { status: 'ACTIVE' });
    return { code: 200, data };
  }

  // ── DELETE /api/organizations/:code ──────────────────────────────────────────

  /**
   * G88 删除组织（硬删，需 'D' 操作位）。
   * service 双守卫：有子节点不可删、有成员绑定不可删（提示先迁移/移除）。
   */
  @Delete(':code')
  @RequireMenu(ORG_MENU, 'D', [LEGACY_ORG_MANAGE_MENU, LEGACY_SYS_ORG_MENU])
  @HttpCode(HttpStatus.OK)
  async deleteOrg(@Param('code') code: string) {
    const orgs = await this.orgService.listOrgs();
    const org = orgs.find((o) => o.orgCode === code);
    if (!org) throw new NotFoundException(`Organization with code "${code}" not found`);
    await this.orgService.deleteOrg(org.id);
    return { code: 200, message: 'deleted' };
  }
}
