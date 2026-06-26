import { Controller, Get, Post, Body, Param, Query, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { isMenuRegistered } from '../../common/guards/menu-registry.service';
import { hasPerm, PermCode } from '../../auth/permissions.util';
import { CodeGeneratorService } from './code-generator.service';
import { MasterDataAuditService } from './master-data-audit.service';
import { MasterDataReferencesService } from './master-data-references.service'; // G5.5-C
import { DictGovernanceService } from './dict-governance.service';               // G5.5-D
import { MasterDataGovernanceService } from './governance.service';              // G5.5-D
import { MasterDataOperationsService } from './operations.service';              // G5.5-E

const REFERENCE_OBJECT_TO_MENU: Record<string, string> = {
  CUSTOMER: 'MENU_MD_CUSTOMER',
  SUPPLIER: 'MENU_MD_SUPPLIER',
  PROJECT: 'MENU_MD_PROJECT',
  MATERIAL: 'MENU_MD_MATERIAL',
  PRODUCT: 'MENU_MD_PRODUCT',
  GRADE: 'MENU_MD_GRADE',
  SPEC: 'MENU_MD_PACKAGING',
  PACKAGING: 'MENU_MD_PACKAGING',
  SKU: 'MENU_MD_SKU',
  WAREHOUSE: 'MENU_MD_WAREHOUSE',
  STORE: 'MENU_MD_STORE',
  DRIVER: 'MENU_MD_DRIVER',
  VEHICLE: 'MENU_MD_VEHICLE',
  CASH_ACCOUNT: 'MENU_MD_CASH_ACCOUNT',
  BANK_ACCOUNT: 'MENU_MD_BANK_ACCOUNT',
  ORGANIZATION: 'MENU_MD_ORG',
  COMPANY: 'MENU_MD_COMPANY',
  BUSINESS_UNIT: 'MENU_MD_BUSINESS_UNIT',
};

const CODE_PREFIX_TO_MENU: Record<string, string> = {
  CUS: 'MENU_MD_CUSTOMER',
  SUP: 'MENU_MD_SUPPLIER',
  PRJ: 'MENU_MD_PROJECT',
  MAT: 'MENU_MD_MATERIAL',
  CASH: 'MENU_MD_CASH_ACCOUNT',
  PRD: 'MENU_MD_PRODUCT',
  STR: 'MENU_MD_STORE',
  BANK: 'MENU_MD_BANK_ACCOUNT',
  SKU: 'MENU_MD_SKU',
  WH: 'MENU_MD_WAREHOUSE',
  GRD: 'MENU_MD_GRADE',
  SPEC: 'MENU_MD_PACKAGING',
  DRV: 'MENU_MD_DRIVER',
  VEH: 'MENU_MD_VEHICLE',
  ORG: 'MENU_MD_ORG',
  COMP: 'MENU_MD_COMPANY',
  BU: 'MENU_MD_BUSINESS_UNIT',
};

const OPERATION_TYPE_TO_MENU: Record<string, string> = {
  organization: 'MENU_MD_ORG',
  company: 'MENU_MD_COMPANY',
  project: 'MENU_MD_PROJECT',
  customer: 'MENU_MD_CUSTOMER',
  supplier: 'MENU_MD_SUPPLIER',
  store: 'MENU_MD_STORE',
  product: 'MENU_MD_PRODUCT',
  grade: 'MENU_MD_GRADE',
  spec: 'MENU_MD_PACKAGING',
  sku: 'MENU_MD_SKU',
  warehouse: 'MENU_MD_WAREHOUSE',
  driver: 'MENU_MD_DRIVER',
  vehicle: 'MENU_MD_VEHICLE',
  'cash-account': 'MENU_MD_CASH_ACCOUNT',
  'bank-account': 'MENU_MD_BANK_ACCOUNT',
  dict: 'MENU_SETTINGS_DATA',
  site: 'MENU_MD_ORG',
  'business-unit': 'MENU_MD_BUSINESS_UNIT',
  shareholder: 'MENU_SHAREHOLDER_VIEW',
};

function normalizeCode(value: string | undefined | null) {
  return String(value || '').trim().toUpperCase();
}

/**
 * MasterDataCenterController — 主数据中心后端 API（G1）
 * 路由前缀：/api/master-data
 *   · 编码生成：POST /api/master-data/code/next
 *   · 审计历史：GET  /api/master-data/audit/:objectType/:objectCode
 *   · 数据质量：GET  /api/master-data/quality
 */
@Controller('api/master-data')
@UseGuards(AuthGuard('jwt'), MenuGuard)
export class MasterDataCenterController {
  constructor(
    private readonly codeGen: CodeGeneratorService,
    private readonly audit: MasterDataAuditService,
    private readonly refs: MasterDataReferencesService, // G5.5-C
    private readonly dictGov: DictGovernanceService,    // G5.5-D
    private readonly gov: MasterDataGovernanceService,  // G5.5-D
    private readonly ops: MasterDataOperationsService,  // G5.5-E
  ) {}

  private assertMasterDataPermission(req: any, menu: string, perm: PermCode) {
    const user = req?.user;
    if (!user) throw new ForbiddenException('User context not found.');
    if (!isMenuRegistered(menu)) throw new ForbiddenException('MENU_PERMISSION_NOT_REGISTERED');

    if (Array.isArray(user.roles) && user.roles.includes('ROLE_ADMIN')) return;
    if (user.role === 'ROLE_ADMIN') return;

    if (hasPerm(user.permissions, menu, perm)) return;
    throw new ForbiddenException('MENU_PERMISSION_DENIED');
  }

  private allowedOperationTypes(req: any): Set<string> | undefined {
    const user = req?.user;
    if (!user) throw new ForbiddenException('User context not found.');
    if (Array.isArray(user.roles) && user.roles.includes('ROLE_ADMIN')) return undefined;
    if (user.role === 'ROLE_ADMIN') return undefined;
    const allowed = new Set<string>();
    for (const [type, menu] of Object.entries(OPERATION_TYPE_TO_MENU)) {
      if (!isMenuRegistered(menu)) continue;
      if (hasPerm(user.permissions, menu, 'V')) allowed.add(type);
    }
    return allowed;
  }

  // ══ G5.5-E 运营平台端点 ════════════════════════════════════════════════════
  /** 6 中心实时统计（首页运营工作台用） */
  @Get('operations/centers')
  @RequireMenu('MENU_MD_CENTER', 'V')
  async opsCenters(@Req() req: any) { return this.ops.getCenters(this.allowedOperationTypes(req)); }

  /** 全局主数据搜索 */
  @Get('operations/search')
  @RequireMenu('MENU_MD_CENTER', 'V')
  async opsSearch(@Query('keyword') keyword: string, @Req() req: any) {
    return this.ops.search(keyword, this.allowedOperationTypes(req));
  }

  /** 30 天趋势 */
  @Get('operations/trend')
  @RequireMenu('MENU_MD_CENTER', 'V')
  async opsTrend(@Query('days') days?: string) {
    return this.ops.getTrend(days ? parseInt(days, 10) : 30);
  }

  /** 运营待办（待审批 / 缺资料 / 重复 / 归档阻断） */
  @Get('operations/todo')
  @RequireMenu('MENU_MD_CENTER', 'V')
  async opsTodo(@Req() req: any) { return this.ops.getOperationsTodo(this.allowedOperationTypes(req)); }

  /** G5.5-D 治理驾驶舱：总评分 + 5 子评分 */
  @Get('governance/scores')
  @RequireMenu('MENU_MD_QUALITY', 'V')
  async governanceScores() { return this.gov.computeScores(); }

  /** G5.5-D 字典覆盖率 */
  @Get('governance/dict-coverage')
  @RequireMenu('MENU_MD_QUALITY', 'V')
  async dictCoverage() { return this.dictGov.coverage(); }

  /** G5.5-D 字典依赖图 */
  @Get('governance/dict-dependency-map')
  @RequireMenu('MENU_MD_QUALITY', 'V')
  async dictDependencyMap() { return this.dictGov.dependencyMap(); }

  /**
   * G5.5-C：引用关系中心
   * 输入：(objectType, objectCode)；输出：被哪些业务单据引用
   */
  @Get('references/:objectType/:objectCode')
  async references(
    @Param('objectType') objectType: string,
    @Param('objectCode') objectCode: string,
    @Req() req: any,
  ) {
    const menu = REFERENCE_OBJECT_TO_MENU[normalizeCode(objectType)] ?? 'MENU_MD_AUDIT';
    this.assertMasterDataPermission(req, menu, 'V');
    return this.refs.compute(objectType, objectCode);
  }

  /** 生成下一个主数据编码 */
  @Post('code/next')
  async nextCode(@Body() body: { prefix: string }, @Req() req: any) {
    const prefix = normalizeCode(body?.prefix);
    const menu = CODE_PREFIX_TO_MENU[prefix];
    if (!menu) throw new ForbiddenException('MENU_PERMISSION_DENIED');
    this.assertMasterDataPermission(req, menu, 'C');
    const code = await this.codeGen.next(prefix);
    return { code };
  }

  /** 主数据审计历史 */
  @Get('audit/:objectType/:objectCode')
  @RequireMenu('MENU_MD_AUDIT', 'V')
  async auditHistory(
    @Param('objectType') objectType: string,
    @Param('objectCode') objectCode: string,
  ) {
    return { items: await this.audit.history(objectType, objectCode) };
  }

  /** 数据质量检查（数据质量中心 Dashboard） */
  @Get('quality')
  @RequireMenu('MENU_MD_QUALITY', 'V')
  async quality() {
    const checks = await this.audit.qualityChecks();
    const totalIssues = checks.filter(c => c.count > 0).reduce((s, c) => s + c.count, 0);
    const available = checks.filter(c => c.count >= 0);
    // 数据质量评分：无问题=100；每类问题按权重扣分（简化：满分 100 - 问题项占比 * 100）
    const issueItems = available.filter(c => c.count > 0).length;
    const score = available.length === 0 ? 100 : Math.max(0, Math.round(100 - (issueItems / available.length) * 100));
    return { score, totalIssues, checks };
  }
}
