import {
  Injectable, Logger, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { WorkflowFormValidationService } from './workflow-form-validation.service';

// ── DTO 类型 ───────────────────────────────────────────────────────────────────

export interface CreateFormDto {
  code:         string;
  name:         string;
  bizType?:     string;
  moduleCode?:  string;
  category?:    string;
  remark?:      string;
}

export interface CreateVersionDto {
  schemaJson:     Record<string, any>;
  uiSchemaJson?:  Record<string, any>;
  validationJson?: Record<string, any>;
}

export interface SubmitFormDto {
  data:         Record<string, any>;
  bizType?:     string;
  bizId?:       string;
  bizNo?:       string;
  companyCode?: string;
  companyName?: string;
  projectCode?: string;
  projectName?: string;
}

// ── Row 类型 ───────────────────────────────────────────────────────────────────

export interface FormRow {
  id:                 number;
  code:               string;
  name:               string;
  biz_type:           string | null;
  module_code:        string | null;
  category:           string | null;
  remark:             string | null;
  status:             string;
  current_version_id: number | null;
  created_at:         string;
  updated_at:         string;
}

export interface VersionRow {
  id:              number;
  form_id:         number;
  version_no:      number;
  status:          string;
  schema_json:     Record<string, any>;
  ui_schema_json:  Record<string, any>;
  validation_json: Record<string, any>;
  published_by:    number | null;
  published_at:    string | null;
  created_at:      string;
  updated_at:      string;
}

/**
 * Workflow Form Runtime Service
 *
 * 提供表单定义管理、版本管理、表单提交快照。
 * 与旧 WorkflowService 中的简单 CRUD 分离，专注 Form Runtime 语义。
 */
@Injectable()
export class WorkflowFormRuntimeService {
  private readonly logger = new Logger(WorkflowFormRuntimeService.name);

  constructor(
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly validationSvc: WorkflowFormValidationService,
  ) {}

  // ── 用户上下文 ─────────────────────────────────────────────────────────────

  private currentUser() {
    const u = this.cls.get('user') as any;
    return {
      userId:   Number(u?.userId ?? u?.id ?? 0),
      userName: String(u?.name ?? u?.username ?? u?.realNameZh ?? ''),
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 表单定义
  // ────────────────────────────────────────────────────────────────────────────

  /** 列表（分页 + 过滤） */
  async listForms(query: {
    status?:     string;
    bizType?:    string;
    keyword?:    string;
    page?:       number;
    pageSize?:   number;
  }) {
    const page     = Math.max(1, query.page     ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const offset   = (page - 1) * pageSize;

    const [rows, total] = await Promise.all([
      this.ds.query<FormRow[]>(`
        SELECT id, code, name, biz_type, module_code, category, remark,
               status, current_version_id, created_at, updated_at
          FROM wf_form_definition
         WHERE ($1::text IS NULL OR status = $1)
           AND ($2::text IS NULL OR biz_type = $2)
           AND ($3::text IS NULL OR name ILIKE '%' || $3 || '%' OR code ILIKE '%' || $3 || '%')
         ORDER BY updated_at DESC, id DESC
         LIMIT $4 OFFSET $5
      `, [query.status ?? null, query.bizType ?? null, query.keyword ?? null, pageSize, offset]),

      this.ds.query<[{ cnt: string }]>(`
        SELECT COUNT(*) AS cnt
          FROM wf_form_definition
         WHERE ($1::text IS NULL OR status = $1)
           AND ($2::text IS NULL OR biz_type = $2)
           AND ($3::text IS NULL OR name ILIKE '%' || $3 || '%' OR code ILIKE '%' || $3 || '%')
      `, [query.status ?? null, query.bizType ?? null, query.keyword ?? null]),
    ]);

    return { items: rows, total: Number(total[0]?.cnt ?? 0), page, pageSize };
  }

  /**
   * 按 code 获取表单定义（含当前发布版本的完整信息）。
   * 同时返回所有版本列表（仅摘要）。
   */
  async getFormByCode(code: string) {
    const rows = await this.ds.query<FormRow[]>(
      `SELECT * FROM wf_form_definition WHERE code = $1 LIMIT 1`,
      [code],
    );
    const form = rows[0];
    if (!form) throw new NotFoundException(`表单 "${code}" 不存在`);

    const [currentVersion, versions] = await Promise.all([
      form.current_version_id
        ? this.ds.query<VersionRow[]>(
            `SELECT * FROM wf_form_version WHERE id = $1 LIMIT 1`,
            [form.current_version_id],
          ).then(r => r[0] ?? null)
        : Promise.resolve(null),

      this.ds.query<Pick<VersionRow, 'id' | 'version_no' | 'status' | 'published_at' | 'created_at'>[]>(`
        SELECT id, version_no, status, published_at, created_at
          FROM wf_form_version
         WHERE form_id = $1
         ORDER BY version_no DESC
      `, [form.id]),
    ]);

    return { form, currentVersion, versions };
  }

  /**
   * 按 ID 获取表单定义（兼容旧接口）。
   */
  async getFormById(id: number) {
    const rows = await this.ds.query<FormRow[]>(
      `SELECT * FROM wf_form_definition WHERE id = $1 LIMIT 1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException(`表单 ID=${id} 不存在`);
    const form = rows[0];
    const versions = await this.ds.query<VersionRow[]>(`
      SELECT * FROM wf_form_version
       WHERE form_id = $1
       ORDER BY version_no DESC
    `, [form.id]);
    return { form, versions };
  }

  /** 创建表单定义 */
  async createForm(dto: CreateFormDto) {
    const { userId } = this.currentUser();
    const code = String(dto.code ?? '').trim().toUpperCase();
    if (!code) throw new BadRequestException('form code 不能为空');
    if (!dto.name) throw new BadRequestException('表单名称不能为空');
    if (!/^[A-Z0-9_]{1,80}$/.test(code)) throw new BadRequestException('form code 只允许大写字母、数字和下划线');

    const rows = await this.ds.query<FormRow[]>(`
      INSERT INTO wf_form_definition
        (code, name, biz_type, module_code, category, remark, status, created_by, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,'DRAFT',$7,NOW(),NOW())
      RETURNING *
    `, [code, dto.name, dto.bizType ?? null, dto.moduleCode ?? null, dto.category ?? null, dto.remark ?? null, userId || null]);

    this.logger.log(`[FormRuntime] created form code=${code} by user=${userId}`);
    return rows[0];
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 表单版本
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * 为指定表单创建新版本（DRAFT 状态）。
   * 新版本号 = 当前最大版本号 + 1。
   */
  async createVersion(formId: number, dto: CreateVersionDto) {
    const { userId } = this.currentUser();

    // 检查表单存在
    const formRows = await this.ds.query<[{ id: number }]>(
      `SELECT id FROM wf_form_definition WHERE id = $1 LIMIT 1`,
      [formId],
    );
    if (!formRows[0]) throw new NotFoundException(`表单 ID=${formId} 不存在`);

    // 验证 schema_json 基本结构
    const schema = dto.schemaJson;
    if (!schema || typeof schema !== 'object' || schema.type !== 'object') {
      throw new BadRequestException('schema_json 必须是 type=object 的 JSON Schema');
    }

    const [latest] = await this.ds.query<[{ max_ver: string }]>(
      `SELECT COALESCE(MAX(version_no), 0)::int AS max_ver FROM wf_form_version WHERE form_id = $1`,
      [formId],
    );
    const versionNo = Number(latest?.max_ver ?? 0) + 1;

    const rows = await this.ds.query<VersionRow[]>(`
      INSERT INTO wf_form_version
        (form_id, version_no, status, schema_json, ui_schema_json, validation_json,
         published_by, created_at, updated_at)
      VALUES ($1,$2,'DRAFT',$3::jsonb,$4::jsonb,$5::jsonb,NULL,NOW(),NOW())
      RETURNING *
    `, [
      formId,
      versionNo,
      JSON.stringify(schema),
      JSON.stringify(dto.uiSchemaJson ?? {}),
      JSON.stringify(dto.validationJson ?? {}),
    ]);

    this.logger.log(`[FormRuntime] created version v${versionNo} for form=${formId} by user=${userId}`);
    return rows[0];
  }

  /**
   * 发布表单版本：DRAFT → PUBLISHED，并将表单 current_version_id 指向此版本。
   */
  async publishVersion(versionId: number) {
    const { userId } = this.currentUser();

    const versionRows = await this.ds.query<VersionRow[]>(
      `SELECT * FROM wf_form_version WHERE id = $1 LIMIT 1`,
      [versionId],
    );
    const version = versionRows[0];
    if (!version) throw new NotFoundException(`表单版本 ID=${versionId} 不存在`);
    if (version.status === 'PUBLISHED') {
      return version; // 幂等：已发布则直接返回
    }

    const [updated] = await this.ds.query<VersionRow[]>(`
      UPDATE wf_form_version
         SET status = 'PUBLISHED',
             published_by = $2,
             published_at = NOW(),
             updated_at   = NOW()
       WHERE id = $1
       RETURNING *
    `, [versionId, userId || null]);

    // 更新表单当前版本
    await this.ds.query(`
      UPDATE wf_form_definition
         SET current_version_id = $1,
             status             = 'ACTIVE',
             updated_at         = NOW()
       WHERE id = $2
    `, [versionId, version.form_id]);

    this.logger.log(`[FormRuntime] published version id=${versionId} for form=${version.form_id} by user=${userId}`);
    return updated;
  }

  /** 获取单个版本详情 */
  async getVersion(versionId: number) {
    const rows = await this.ds.query<VersionRow[]>(
      `SELECT * FROM wf_form_version WHERE id = $1 LIMIT 1`,
      [versionId],
    );
    if (!rows[0]) throw new NotFoundException(`表单版本 ID=${versionId} 不存在`);
    return rows[0];
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 表单提交
  // ────────────────────────────────────────────────────────────────────────────

  /**
   * 提交表单数据：
   *   1. 查找 ACTIVE 表单 + 当前发布版本
   *   2. 校验数据
   *   3. 写入 wf_form_submission
   *   4. 返回提交编号
   */
  async submitForm(code: string, dto: SubmitFormDto) {
    const { userId, userName } = this.currentUser();

    // 1. 查找表单
    const formRows = await this.ds.query<FormRow[]>(
      `SELECT * FROM wf_form_definition WHERE code = $1 AND status = 'ACTIVE' LIMIT 1`,
      [code],
    );
    const form = formRows[0];
    if (!form) throw new NotFoundException(`表单 "${code}" 不存在或未启用`);
    if (!form.current_version_id) throw new BadRequestException(`表单 "${code}" 没有已发布版本，无法提交`);

    // 2. 加载发布版本
    const versionRows = await this.ds.query<VersionRow[]>(
      `SELECT * FROM wf_form_version WHERE id = $1 AND status = 'PUBLISHED' LIMIT 1`,
      [form.current_version_id],
    );
    const version = versionRows[0];
    if (!version) throw new BadRequestException(`表单 "${code}" 的当前版本不是已发布状态`);

    // 3. 校验数据
    const validationErrors = this.validationSvc.validate(version.schema_json, dto.data);
    if (Object.keys(validationErrors).length > 0) {
      throw new BadRequestException({ message: '表单校验失败', errors: validationErrors });
    }

    // 4. 生成提交编号
    const submissionNo = `FS${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).substring(2, 5).toUpperCase()}`;

    // 5. 写入提交记录
    const rows = await this.ds.query(`
      INSERT INTO wf_form_submission
        (submission_no, form_code, form_version_id, biz_type, biz_id, biz_no,
         submitted_by, submitted_by_name,
         company_code, company_name, project_code, project_name,
         data_json, status, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,'SUBMITTED',NOW(),NOW())
      RETURNING *
    `, [
      submissionNo,
      code,
      version.id,
      dto.bizType      ?? form.biz_type ?? null,
      dto.bizId        ?? null,
      dto.bizNo        ?? null,
      userId || null,
      userName || null,
      dto.companyCode  ?? null,
      dto.companyName  ?? null,
      dto.projectCode  ?? null,
      dto.projectName  ?? null,
      JSON.stringify(dto.data),
    ]);

    this.logger.log(`[FormRuntime] form submitted: no=${submissionNo} form=${code} user=${userId}`);

    return {
      submissionNo,
      submissionId:  rows[0].id,
      formCode:      code,
      formVersionId: version.id,
      versionNo:     version.version_no,
      status:        'SUBMITTED',
    };
  }

  /** 获取提交详情 */
  async getSubmission(id: number | string) {
    const rows = await this.ds.query(`
      SELECT s.*,
             fd.name   AS form_name,
             fv.version_no,
             fv.schema_json,
             fv.ui_schema_json
        FROM wf_form_submission s
        JOIN wf_form_version    fv ON fv.id = s.form_version_id
        JOIN wf_form_definition fd ON fd.id = fv.form_id
       WHERE s.id = $1
    `, [Number(id)]);
    if (!rows[0]) throw new NotFoundException(`提交记录 ID=${id} 不存在`);
    return rows[0];
  }

  /** 提交列表（分页） */
  async listSubmissions(query: {
    formCode?:  string;
    status?:    string;
    submittedBy?: number;
    page?:      number;
    pageSize?:  number;
  }) {
    const page     = Math.max(1, query.page     ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const offset   = (page - 1) * pageSize;

    const [rows, total] = await Promise.all([
      this.ds.query(`
        SELECT s.id, s.submission_no, s.form_code, s.form_version_id,
               s.biz_type, s.biz_no, s.submitted_by, s.submitted_by_name,
               s.status, s.created_at,
               fd.name AS form_name, fv.version_no
          FROM wf_form_submission s
          JOIN wf_form_version    fv ON fv.id = s.form_version_id
          JOIN wf_form_definition fd ON fd.id = fv.form_id
         WHERE ($1::text IS NULL OR s.form_code = $1)
           AND ($2::text IS NULL OR s.status    = $2)
           AND ($3::int  IS NULL OR s.submitted_by = $3)
         ORDER BY s.created_at DESC, s.id DESC
         LIMIT $4 OFFSET $5
      `, [query.formCode ?? null, query.status ?? null, query.submittedBy ?? null, pageSize, offset]),

      this.ds.query<[{ cnt: string }]>(`
        SELECT COUNT(*) AS cnt
          FROM wf_form_submission
         WHERE ($1::text IS NULL OR form_code    = $1)
           AND ($2::text IS NULL OR status       = $2)
           AND ($3::int  IS NULL OR submitted_by = $3)
      `, [query.formCode ?? null, query.status ?? null, query.submittedBy ?? null]),
    ]);

    return { items: rows, total: Number(total[0]?.cnt ?? 0), page, pageSize };
  }
}
