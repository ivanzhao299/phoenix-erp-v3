import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { CodeGeneratorService } from './code-generator.service';
import { MasterDataAuditService } from './master-data-audit.service';
import { MasterDataReferencesService } from './master-data-references.service'; // G5.5-C
import { DictGovernanceService } from './dict-governance.service';               // G5.5-D
import { MasterDataGovernanceService } from './governance.service';              // G5.5-D
import { MasterDataOperationsService } from './operations.service';              // G5.5-E

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

  // ══ G5.5-E 运营平台端点 ════════════════════════════════════════════════════
  /** 6 中心实时统计（首页运营工作台用） */
  @Get('operations/centers')
  @RequireMenu('MENU_MD_CENTER', 'V', ['MENU_MASTER_DATA'])
  async opsCenters() { return this.ops.getCenters(); }

  /** 全局主数据搜索 */
  @Get('operations/search')
  @RequireMenu('MENU_MD_CENTER', 'V', ['MENU_MASTER_DATA'])
  async opsSearch(@Query('keyword') keyword: string) { return this.ops.search(keyword); }

  /** 30 天趋势 */
  @Get('operations/trend')
  @RequireMenu('MENU_MD_CENTER', 'V', ['MENU_MASTER_DATA'])
  async opsTrend(@Query('days') days?: string) {
    return this.ops.getTrend(days ? parseInt(days, 10) : 30);
  }

  /** 运营待办（待审批 / 缺资料 / 重复 / 归档阻断） */
  @Get('operations/todo')
  @RequireMenu('MENU_MD_CENTER', 'V', ['MENU_MASTER_DATA'])
  async opsTodo() { return this.ops.getOperationsTodo(); }

  /** G5.5-D 治理驾驶舱：总评分 + 5 子评分 */
  @Get('governance/scores')
  @RequireMenu('MENU_MD_QUALITY', 'V', ['MENU_MASTER_DATA'])
  async governanceScores() { return this.gov.computeScores(); }

  /** G5.5-D 字典覆盖率 */
  @Get('governance/dict-coverage')
  @RequireMenu('MENU_MD_QUALITY', 'V', ['MENU_MASTER_DATA'])
  async dictCoverage() { return this.dictGov.coverage(); }

  /** G5.5-D 字典依赖图 */
  @Get('governance/dict-dependency-map')
  @RequireMenu('MENU_MD_QUALITY', 'V', ['MENU_MASTER_DATA'])
  async dictDependencyMap() { return this.dictGov.dependencyMap(); }

  /**
   * G5.5-C：引用关系中心
   * 输入：(objectType, objectCode)；输出：被哪些业务单据引用
   */
  @Get('references/:objectType/:objectCode')
  @RequireMenu('MENU_MASTER_DATA', 'V')
  async references(
    @Param('objectType') objectType: string,
    @Param('objectCode') objectCode: string,
  ) {
    return this.refs.compute(objectType, objectCode);
  }

  /** 生成下一个主数据编码 */
  @Post('code/next')
  @RequireMenu('MENU_MASTER_DATA', 'C')
  async nextCode(@Body() body: { prefix: string }) {
    const code = await this.codeGen.next(body?.prefix);
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
