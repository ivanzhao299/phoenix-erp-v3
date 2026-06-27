import {
  Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards, ParseIntPipe,
} from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { WorkflowService } from './workflow.service';
import {
  WorkflowFormRuntimeService,
  CreateFormDto,
  CreateVersionDto,
  SubmitFormDto,
} from './workflow-form-runtime.service';

/**
 * Workflow Form Controller
 *
 * 路由声明顺序（NestJS 按声明顺序匹配，静态路由必须在动态路由前声明）：
 *   GET    /                        — 表单定义列表（兼容旧接口）
 *   POST   /                        — 创建表单定义（兼容旧接口）
 *   POST   /from-data-source        — 从数据源创建（兼容旧接口）
 *   GET    /submissions              — 提交列表（Phase H）
 *   GET    /submissions/:id          — 提交详情（Phase H）
 *   POST   /versions/:versionId/publish — 发布版本（Phase H）
 *   GET    /:idOrCode                — 按 ID 或 code 获取（兼容旧接口 + Phase H）
 *   PUT    /:id                      — 更新表单（兼容旧接口）
 *   POST   /:id/publish              — 发布表单（兼容旧接口）
 *   GET    /:id/designer             — 设计器视图（兼容旧接口）
 *   POST   /:id/versions             — 创建新版本（Phase H）
 *   POST   /:code/submit             — 提交表单数据（Phase H）
 */
// [Phase R1 — HIGH-3] 添加 DataScopeGuard
@Controller('api/workflow/forms')
@UseGuards(MenuGuard, DataScopeGuard)
export class WorkflowFormController {
  constructor(
    private readonly workflow: WorkflowService,
    private readonly runtimeSvc: WorkflowFormRuntimeService,
  ) {}

  // ── 表单定义列表 ─────────────────────────────────────────────────────────────

  @Get()
  @RequireMenu('MENU_WORKFLOW_FORM', 'V')
  list(@Query() query: {
    status?:   string;
    bizType?:  string;
    keyword?:  string;
    page?:     string;
    pageSize?: string;
  }) {
    return this.runtimeSvc.listForms({
      status:    query.status,
      bizType:   query.bizType,
      keyword:   query.keyword,
      page:      query.page     ? Number(query.page)     : 1,
      pageSize:  query.pageSize ? Number(query.pageSize) : 20,
    });
  }

  // ── 创建表单定义 ─────────────────────────────────────────────────────────────

  @Post()
  @RequireMenu('MENU_WORKFLOW_FORM', 'C')
  create(@Body() body: CreateFormDto) {
    return this.runtimeSvc.createForm(body);
  }

  // ── 从数据源创建（旧接口，兼容保留）──────────────────────────────────────────

  @Post('from-data-source')
  @RequireMenu('MENU_WORKFLOW_FORM', 'C')
  createFromDataSource(@Body() body: any, @Req() req: any) {
    return this.workflow.createFormFromDataSource(body, req.user);
  }

  // ── 提交列表（GET /submissions 必须在 GET /:id 之前声明）───────────────────

  @Get('submissions')
  @RequireMenu('MENU_WORKFLOW_FORM', 'V')
  listSubmissions(@Query() query: {
    formCode?:  string;
    status?:    string;
    page?:      string;
    pageSize?:  string;
  }) {
    return this.runtimeSvc.listSubmissions({
      formCode:  query.formCode,
      status:    query.status,
      page:      query.page     ? Number(query.page)     : 1,
      pageSize:  query.pageSize ? Number(query.pageSize) : 20,
    });
  }

  // ── 提交详情（GET /submissions/:id 必须在 GET /:id 之前声明）───────────────

  @Get('submissions/:id')
  @RequireMenu('MENU_WORKFLOW_FORM', 'V')
  getSubmission(@Param('id') id: string) {
    return this.runtimeSvc.getSubmission(Number(id));
  }

  // ── 启动审批（Phase I；静态前缀 submissions/，必须在 /:id 之前声明）─────────

  @Post('submissions/:id/start-approval')
  @RequireMenu('MENU_WORKFLOW_FORM', 'E')
  startApproval(@Param('id') id: string) {
    return this.runtimeSvc.startApprovalFromSubmission(Number(id));
  }

  // ── 发布版本（静态前缀 versions/，必须在 /:id 之前声明）────────────────────

  @Post('versions/:versionId/publish')
  @RequireMenu('MENU_WORKFLOW_FORM', 'E')
  publishVersion(@Param('versionId') versionId: string) {
    return this.runtimeSvc.publishVersion(Number(versionId));
  }

  // ── 按 ID 或 code 获取表单定义（动态路由）──────────────────────────────────

  /**
   * GET /:idOrCode
   * - 若参数为纯数字 → 按 ID 获取（含旧 WorkflowService.getFormDesigner 兼容数据）
   * - 否则 → 按 code 获取（返回当前发布版本 + 版本列表）
   */
  @Get(':idOrCode')
  @RequireMenu('MENU_WORKFLOW_FORM', 'V')
  get(@Param('idOrCode') idOrCode: string) {
    const asNum = Number(idOrCode);
    if (Number.isInteger(asNum) && asNum > 0) {
      return this.runtimeSvc.getFormById(asNum);
    }
    return this.runtimeSvc.getFormByCode(idOrCode.toUpperCase());
  }

  // ── 更新表单基本信息 ─────────────────────────────────────────────────────────

  @Put(':id')
  @RequireMenu('MENU_WORKFLOW_FORM', 'E')
  update(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.updateForm(Number(id), body, req.user);
  }

  // ── 旧发布接口（兼容保留；Phase H 用 POST /versions/:versionId/publish）─────

  @Post(':id/publish')
  @RequireMenu('MENU_WORKFLOW_FORM', 'E')
  publishLegacy(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.publishForm(Number(id), body, req.user);
  }

  // ── 表单设计器视图（旧接口，兼容保留）──────────────────────────────────────

  @Get(':id/designer')
  @RequireMenu('MENU_WORKFLOW_FORM', 'V')
  designer(@Param('id') id: string) {
    return this.workflow.getFormDesigner(Number(id));
  }

  // ── 创建新版本（Phase H）────────────────────────────────────────────────────

  @Post(':id/versions')
  @RequireMenu('MENU_WORKFLOW_FORM', 'C')
  createVersion(@Param('id') id: string, @Body() body: CreateVersionDto) {
    return this.runtimeSvc.createVersion(Number(id), body);
  }

  // ── 提交表单数据（Phase H）──────────────────────────────────────────────────

  @Post(':code/submit')
  @RequireMenu('MENU_WORKFLOW_FORM', 'E')
  submitForm(@Param('code') code: string, @Body() body: SubmitFormDto) {
    return this.runtimeSvc.submitForm(code.toUpperCase(), body);
  }
}
