import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { ConditionEngineService, ConditionNode } from './condition-engine.service';

type WorkflowStatus = 'RUNNING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
type TaskStatus = 'TODO' | 'DONE' | 'CANCELED';
type NodeType = 'start' | 'approval' | 'condition' | 'cc' | 'end';
type FormFieldType = 'text' | 'textarea' | 'number' | 'amount' | 'date' | 'datetime' | 'select' | 'radio' | 'checkbox' | 'reference' | 'readonly';

interface WorkflowUser {
  userId?: number;
  username?: string;
  realNameZh?: string;
  role?: string;
  roles?: string[];
  permissions?: string[];
}

interface GraphNode {
  id: string;
  type: NodeType;
  name?: string;
  x?: number;
  y?: number;
  config?: Record<string, any>;
}

interface GraphEdge {
  id?: string;
  from: string;
  to: string;
  condition?: ConditionRule;
  label?: string;
}

interface WorkflowGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

interface ConditionRule {
  field: string;
  operator: '==' | '!=' | '>' | '>=' | '<' | '<=' | 'in' | 'notIn' | 'contains';
  value: any;
}

interface StartWorkflowDto {
  definition_id?: number;
  definition_code?: string;
  title?: string;
  business_type?: string;
  business_id?: string | number;
  form_data?: Record<string, any>;
  variables?: Record<string, any>;
}

interface QueryDto {
  limit?: string | number;
  offset?: string | number;
  status?: string;
  category?: string;
}

interface IndustryWorkflowTemplate {
  code: string;
  name: string;
  category: string;
  description: string;
  formCode: string;
  formName: string;
  formDescription: string;
  fields: Array<Record<string, any>>;
  approvals: Array<{ id: string; name: string; role: string }>;
}

const ADMIN_ROLES = new Set(['ROLE_ADMIN', 'ROLE_SYSOPS']);
const NODE_TYPES = new Set<NodeType>(['start', 'approval', 'condition', 'cc', 'end']);
const CONDITION_OPERATORS = new Set<ConditionRule['operator']>(['==', '!=', '>', '>=', '<', '<=', 'in', 'notIn', 'contains']);
const FORM_FIELD_TYPES = new Set<FormFieldType>(['text', 'textarea', 'number', 'amount', 'date', 'datetime', 'select', 'radio', 'checkbox', 'reference', 'readonly']);

@Injectable()
export class WorkflowService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    @InjectEntityManager() private readonly em: EntityManager,
    private readonly conditionEngine: ConditionEngineService,
  ) {}

  async onModuleInit() {
    // Workflow schema is managed by migration.
    // Run: psql $DATABASE_URL -f migrations/20260525_workflow_schema.sql
    this.logger.log('WorkflowService initialized. Schema managed by migration file.');
  }

  /** @deprecated Use migration file instead. Kept for reference only. */
  async ensureSchema() {
    const ddl = [
      `CREATE TABLE IF NOT EXISTS wf_form_definition (
         id SERIAL PRIMARY KEY,
         code VARCHAR(80) UNIQUE NOT NULL,
         name VARCHAR(160) NOT NULL,
         description TEXT,
         category VARCHAR(80),
         biz_type VARCHAR(64),
         module_code VARCHAR(64),
         remark TEXT,
         status VARCHAR(20) DEFAULT 'DRAFT',
         current_version_id INT,
         created_by INT,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,
      // 自愈：旧表(无 biz_type/module_code/remark)补列，避免 listForms/createForm 列不存在(PG→400)
      `ALTER TABLE wf_form_definition ADD COLUMN IF NOT EXISTS biz_type VARCHAR(64)`,
      `ALTER TABLE wf_form_definition ADD COLUMN IF NOT EXISTS module_code VARCHAR(64)`,
      `ALTER TABLE wf_form_definition ADD COLUMN IF NOT EXISTS remark TEXT`,
      `CREATE TABLE IF NOT EXISTS wf_form_version (
         id SERIAL PRIMARY KEY,
         form_id INT NOT NULL REFERENCES wf_form_definition(id) ON DELETE CASCADE,
         version_no INT NOT NULL,
         status VARCHAR(20) DEFAULT 'DRAFT',
         schema_json JSONB NOT NULL DEFAULT '{}'::jsonb,
         published_by INT,
         published_at TIMESTAMP,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         UNIQUE(form_id, version_no)
       )`,
      `CREATE TABLE IF NOT EXISTS wf_definition (
         id SERIAL PRIMARY KEY,
         code VARCHAR(80) UNIQUE NOT NULL,
         name VARCHAR(160) NOT NULL,
         description TEXT,
         category VARCHAR(80),
         status VARCHAR(20) DEFAULT 'DRAFT',
         current_version_id INT,
         created_by INT,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,
      `CREATE TABLE IF NOT EXISTS wf_definition_version (
         id SERIAL PRIMARY KEY,
         definition_id INT NOT NULL REFERENCES wf_definition(id) ON DELETE CASCADE,
         version_no INT NOT NULL,
         status VARCHAR(20) DEFAULT 'DRAFT',
         graph_json JSONB NOT NULL DEFAULT '{}'::jsonb,
         form_version_id INT REFERENCES wf_form_version(id),
         published_by INT,
         published_at TIMESTAMP,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         UNIQUE(definition_id, version_no)
       )`,
      `CREATE TABLE IF NOT EXISTS wf_instance (
         id SERIAL PRIMARY KEY,
         instance_no VARCHAR(64) UNIQUE NOT NULL,
         definition_id INT NOT NULL REFERENCES wf_definition(id),
         definition_version_id INT NOT NULL REFERENCES wf_definition_version(id),
         form_version_id INT REFERENCES wf_form_version(id),
         title VARCHAR(200),
         business_type VARCHAR(80),
         business_id VARCHAR(80),
         starter_id INT,
         starter_name VARCHAR(120),
         status VARCHAR(20) DEFAULT 'RUNNING',
         current_node_id VARCHAR(120),
         form_data_json JSONB NOT NULL DEFAULT '{}'::jsonb,
         variables_json JSONB NOT NULL DEFAULT '{}'::jsonb,
         started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         ended_at TIMESTAMP,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,
      `CREATE TABLE IF NOT EXISTS wf_task (
         id SERIAL PRIMARY KEY,
         task_no VARCHAR(64) UNIQUE NOT NULL,
         instance_id INT NOT NULL REFERENCES wf_instance(id) ON DELETE CASCADE,
         node_id VARCHAR(120) NOT NULL,
         node_name VARCHAR(160),
         assignee_user_id INT,
         assignee_role_code VARCHAR(80),
         status VARCHAR(20) DEFAULT 'TODO',
         action_result VARCHAR(40),
         due_at TIMESTAMP,
         claimed_at TIMESTAMP,
         completed_at TIMESTAMP,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,
      `CREATE TABLE IF NOT EXISTS wf_task_action (
         id SERIAL PRIMARY KEY,
         task_id INT REFERENCES wf_task(id) ON DELETE SET NULL,
         instance_id INT NOT NULL REFERENCES wf_instance(id) ON DELETE CASCADE,
         action VARCHAR(40) NOT NULL,
         actor_id INT,
         actor_name VARCHAR(120),
         comment TEXT,
         from_node_id VARCHAR(120),
         to_node_id VARCHAR(120),
         payload_json JSONB NOT NULL DEFAULT '{}'::jsonb,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,
      `CREATE TABLE IF NOT EXISTS wf_instance_variable (
         id SERIAL PRIMARY KEY,
         instance_id INT NOT NULL REFERENCES wf_instance(id) ON DELETE CASCADE,
         var_key VARCHAR(120) NOT NULL,
         var_value TEXT,
         value_type VARCHAR(30),
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,
      `CREATE TABLE IF NOT EXISTS wf_data_source (
         id SERIAL PRIMARY KEY,
         code VARCHAR(80) UNIQUE NOT NULL,
         name VARCHAR(160) NOT NULL,
         source_type VARCHAR(20) NOT NULL,
         config_json JSONB NOT NULL DEFAULT '{}'::jsonb,
         status VARCHAR(20) DEFAULT 'ACTIVE',
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
         updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,
      `ALTER TABLE wf_data_source ADD COLUMN IF NOT EXISTS metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb`,
      `ALTER TABLE wf_data_source ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMP`,
      `CREATE TABLE IF NOT EXISTS wf_cc_task (
         id SERIAL PRIMARY KEY,
         instance_id INT NOT NULL REFERENCES wf_instance(id) ON DELETE CASCADE,
         node_id VARCHAR(120),
         receiver_user_id INT,
         receiver_role_code VARCHAR(80),
         read_at TIMESTAMP,
         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
       )`,
      `CREATE INDEX IF NOT EXISTS idx_wf_task_todo_user ON wf_task(status, assignee_user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_wf_task_todo_role ON wf_task(status, assignee_role_code)`,
      `CREATE INDEX IF NOT EXISTS idx_wf_instance_status ON wf_instance(status)`,
    ];

    for (const sql of ddl) await this.em.query(sql);
    await this.seedDefaults();
  }

  async listDefinitions(query: QueryDto) {
    const { limit, offset } = this.page(query);
    const rows = await this.em.query(
      `SELECT * FROM wf_definition
       WHERE ($1::text IS NULL OR status = $1)
         AND ($2::text IS NULL OR category = $2)
       ORDER BY updated_at DESC, id DESC LIMIT $3 OFFSET $4`,
      [query.status || null, query.category || null, limit, offset],
    );
    return { code: 200, data: rows, total: rows.length };
  }

  async createDefinition(body: any, user: WorkflowUser) {
    this.requireAdmin(user);
    this.assertCode(body.code);
    if (!body.name) throw new BadRequestException('name required');
    const rows = await this.em.query(
      `INSERT INTO wf_definition (code, name, description, category, created_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)
       RETURNING *`,
      [body.code, body.name, body.description || null, body.category || null, user.userId || null],
    );
    return { code: 200, data: rows[0] };
  }

  async generateIndustryTemplates(user: WorkflowUser) {
    this.requireAdmin(user);
    await this.ensureDefaultDataSources();
    const result = await this.seedIndustryTemplates(user.userId || null);
    return { code: 200, data: result };
  }

  async createDefinitionFromDataSource(body: any, user: WorkflowUser) {
    this.requireAdmin(user);
    const sourceCode = String(body?.sourceCode || body?.source_code || '').trim().toUpperCase();
    this.assertCode(sourceCode);
    const definitionCode = body?.code ? String(body.code).trim().toUpperCase() : `${sourceCode}_AUTO_WORKFLOW`;
    this.assertCode(definitionCode);

    const formResult = await this.createFormFromDataSource({
      sourceCode,
      code: body?.formCode || `${sourceCode}_AUTO_FORM`,
      name: body?.formName || `${body?.name || sourceCode}自动表单`,
      category: body?.category || '通用',
      description: body?.formDescription,
    }, user);
    const formVersionId = Number((formResult.data as any)?.version?.id);
    if (!formVersionId) throw new BadRequestException('generated form version missing');

    const name = String(body?.name || `${sourceCode}自动审批流程`).trim();
    if (!name) throw new BadRequestException('name required');
    const description = body?.description || `由工作流数据源 ${sourceCode} 自动生成，包含表单和默认审批节点。`;
    const category = body?.category || '通用';
    const approvalRole = String(body?.approvalRole || body?.approval_role || 'ROLE_ADMIN').trim().toUpperCase();
    this.assertCode(approvalRole);

    const existing = await this.em.query(
      `SELECT id FROM wf_definition WHERE code=$1 LIMIT 1`,
      [definitionCode],
    );
    let definitionId = existing[0]?.id;
    let created = false;
    if (!definitionId) {
      const rows = await this.em.query(
        `INSERT INTO wf_definition (code, name, description, category, status, created_by, updated_at)
         VALUES ($1,$2,$3,$4,'ACTIVE',$5,CURRENT_TIMESTAMP)
         RETURNING *`,
        [definitionCode, name, description, category, user.userId || null],
      );
      definitionId = rows[0].id;
      created = true;
    } else {
      await this.em.query(
        `UPDATE wf_definition
         SET name=$2, description=$3, category=$4, status='ACTIVE', updated_at=CURRENT_TIMESTAMP
         WHERE id=$1`,
        [definitionId, name, description, category],
      );
    }

    const graph = this.templateGraph({
      code: definitionCode,
      name,
      category,
      description,
      formCode: String((formResult.data as any)?.form?.code || `${sourceCode}_AUTO_FORM`),
      formName: String((formResult.data as any)?.form?.name || `${sourceCode}自动表单`),
      formDescription: description,
      fields: [],
      approvals: [{ id: 'auto_approval', name: '管理员审批', role: approvalRole }],
    });
    const latest = await this.em.query(
      `SELECT COALESCE(MAX(version_no),0)::int AS version_no FROM wf_definition_version WHERE definition_id=$1`,
      [definitionId],
    );
    const versionNo = Number(latest[0]?.version_no || 0) + 1;
    const versionRows = await this.em.query(
      `INSERT INTO wf_definition_version
         (definition_id, version_no, status, graph_json, form_version_id, published_by, published_at)
       VALUES ($1,$2,'PUBLISHED',$3::jsonb,$4,$5,CURRENT_TIMESTAMP)
       RETURNING *`,
      [definitionId, versionNo, JSON.stringify(graph), formVersionId, user.userId || null],
    );
    const definitionRows = await this.em.query(
      `UPDATE wf_definition
       SET current_version_id=$2, updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 RETURNING *`,
      [definitionId, versionRows[0].id],
    );

    return {
      code: 200,
      data: {
        definition: definitionRows[0],
        version: versionRows[0],
        form: (formResult.data as any)?.form,
        formVersion: (formResult.data as any)?.version,
        created,
        links: {
          start: `/workflow/start?code=${encodeURIComponent(definitionCode)}`,
          designer: `/workflow/designer/${definitionId}`,
          definitions: '/workflow/definitions',
          formDesigner: `/workflow/form-designer/${Number((formResult.data as any)?.form?.id || 0)}`,
        },
      },
    };
  }

  async cloneDefinition(id: number, body: any, user: WorkflowUser) {
    this.requireAdmin(user);
    this.assertCode(body.code);
    if (!body.name) throw new BadRequestException('name required');

    const sourceRows = await this.em.query(
      `SELECT d.*, v.graph_json, v.form_version_id
       FROM wf_definition d
       LEFT JOIN wf_definition_version v ON v.id = d.current_version_id
       WHERE d.id=$1`,
      [id],
    );
    const source = sourceRows[0];
    if (!source) throw new NotFoundException('workflow definition not found');

    const createdRows = await this.em.query(
      `INSERT INTO wf_definition (code, name, description, category, created_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)
       RETURNING *`,
      [
        body.code,
        body.name,
        body.description || source.description || null,
        body.category || source.category || null,
        user.userId || null,
      ],
    );
    const created = createdRows[0];

    if (source.graph_json) {
      const versionRows = await this.em.query(
        `INSERT INTO wf_definition_version
           (definition_id, version_no, status, graph_json, form_version_id, published_by, published_at)
         VALUES ($1,1,'DRAFT',$2::jsonb,$3,$4,CURRENT_TIMESTAMP)
         RETURNING *`,
        [
          created.id,
          JSON.stringify(source.graph_json),
          source.form_version_id || null,
          user.userId || null,
        ],
      );
      await this.em.query(
        `UPDATE wf_definition SET current_version_id=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        [created.id, versionRows[0].id],
      );
      created.current_version_id = versionRows[0].id;
    }

    return { code: 200, data: created };
  }

  async getDefinition(id: number) {
    const rows = await this.em.query(`SELECT * FROM wf_definition WHERE id=$1`, [id]);
    if (!rows[0]) throw new NotFoundException('workflow definition not found');
    return { code: 200, data: rows[0] };
  }

  async updateDefinition(id: number, body: any, user: WorkflowUser) {
    this.requireAdmin(user);
    const rows = await this.em.query(
      `UPDATE wf_definition
       SET name=COALESCE($2,name), description=$3, category=$4, status=COALESCE($5,status), updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 RETURNING *`,
      [id, body.name || null, body.description ?? null, body.category ?? null, body.status || null],
    );
    if (!rows[0]) throw new NotFoundException('workflow definition not found');
    return { code: 200, data: rows[0] };
  }

  async publishDefinition(id: number, body: any, user: WorkflowUser) {
    this.requireAdmin(user);
    const graph = this.normalizeGraph(body.graph_json || body.graph || {});
    const formVersionId = body.form_version_id ? Number(body.form_version_id) : null;
    if (formVersionId) await this.ensureFormVersion(formVersionId);

    const latest = await this.em.query(
      `SELECT COALESCE(MAX(version_no),0)::int AS version_no FROM wf_definition_version WHERE definition_id=$1`,
      [id],
    );
    const versionNo = Number(latest[0]?.version_no || 0) + 1;
    const versionRows = await this.em.query(
      `INSERT INTO wf_definition_version
         (definition_id, version_no, status, graph_json, form_version_id, published_by, published_at)
       VALUES ($1,$2,'PUBLISHED',$3::jsonb,$4,$5,CURRENT_TIMESTAMP)
       RETURNING *`,
      [id, versionNo, JSON.stringify(graph), formVersionId, user.userId || null],
    );
    await this.em.query(
      `UPDATE wf_definition SET status='ACTIVE', current_version_id=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [id, versionRows[0].id],
    );
    return { code: 200, data: versionRows[0] };
  }

  async getDesigner(id: number) {
    const rows = await this.em.query(
      `SELECT d.*, v.id AS version_id, v.version_no, v.graph_json, v.form_version_id,
              fv.schema_json AS form_schema_json
       FROM wf_definition d
       LEFT JOIN wf_definition_version v ON v.id = d.current_version_id
       LEFT JOIN wf_form_version fv ON fv.id = v.form_version_id
       WHERE d.id=$1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('workflow definition not found');
    return { code: 200, data: rows[0] };
  }

  async listForms(query: QueryDto) {
    const { limit, offset } = this.page(query);
    const rows = await this.em.query(
      `SELECT * FROM wf_form_definition
       WHERE ($1::text IS NULL OR status = $1)
         AND ($2::text IS NULL OR category = $2)
       ORDER BY updated_at DESC, id DESC LIMIT $3 OFFSET $4`,
      [query.status || null, query.category || null, limit, offset],
    );
    return { code: 200, data: rows, total: rows.length };
  }

  async createForm(body: any, user: WorkflowUser) {
    this.requireAdmin(user);
    this.assertCode(body.code);
    if (!body.name) throw new BadRequestException('name required');
    const rows = await this.em.query(
      `INSERT INTO wf_form_definition (code, name, description, category, created_by, updated_at)
       VALUES ($1,$2,$3,$4,$5,CURRENT_TIMESTAMP)
       RETURNING *`,
      [body.code, body.name, body.description || null, body.category || null, user.userId || null],
    );
    return { code: 200, data: rows[0] };
  }

  async createFormFromDataSource(body: any, user: WorkflowUser) {
    this.requireAdmin(user);
    const sourceCode = String(body?.sourceCode || body?.source_code || '').trim().toUpperCase();
    this.assertCode(sourceCode);
    const source = await this.findDataSourceByCode(sourceCode);
    const refreshed = await this.refreshDataSourceForUse(source);
    const metadata = refreshed.metadata_json || {};
    const fields = this.buildFieldSuggestions(refreshed, metadata);
    if (fields.length === 0) throw new BadRequestException('no field suggestions available for data source');

    const code = body?.code ? String(body.code).trim().toUpperCase() : `${sourceCode}_AUTO_FORM`;
    this.assertCode(code);
    const name = String(body?.name || `${refreshed.name}自动表单`).trim();
    if (!name) throw new BadRequestException('name required');
    const description = body?.description || `由工作流数据源 ${refreshed.name} 自动生成，可进入表单设计器继续微调。`;
    const category = body?.category || '通用';
    const schema = this.normalizeFormSchema({
      fields: fields.map((field: any) => ({
        key: field.key,
        label: field.label,
        type: field.type,
        dataSource: field.dataSource,
        required: Boolean(field.required),
        span: field.type === 'textarea' ? 2 : 1,
      })),
      sourceDataSource: sourceCode,
      generatedAt: new Date().toISOString(),
    });

    const existing = await this.em.query(
      `SELECT id, current_version_id FROM wf_form_definition WHERE code=$1 LIMIT 1`,
      [code],
    );
    let formId = existing[0]?.id;
    let created = false;
    if (!formId) {
      const formRows = await this.em.query(
        `INSERT INTO wf_form_definition (code, name, description, category, status, created_by, updated_at)
         VALUES ($1,$2,$3,$4,'ACTIVE',$5,CURRENT_TIMESTAMP)
         RETURNING *`,
        [code, name, description, category, user.userId || null],
      );
      formId = formRows[0].id;
      created = true;
    } else {
      await this.em.query(
        `UPDATE wf_form_definition
         SET name=$2, description=$3, category=$4, status='ACTIVE', updated_at=CURRENT_TIMESTAMP
         WHERE id=$1`,
        [formId, name, description, category],
      );
    }

    const latest = await this.em.query(
      `SELECT COALESCE(MAX(version_no),0)::int AS version_no FROM wf_form_version WHERE form_id=$1`,
      [formId],
    );
    const versionNo = Number(latest[0]?.version_no || 0) + 1;
    const versionRows = await this.em.query(
      `INSERT INTO wf_form_version (form_id, version_no, status, schema_json, published_by, published_at)
       VALUES ($1,$2,'PUBLISHED',$3::jsonb,$4,CURRENT_TIMESTAMP)
       RETURNING *`,
      [formId, versionNo, JSON.stringify(schema), user.userId || null],
    );
    const formRows = await this.em.query(
      `UPDATE wf_form_definition
       SET current_version_id=$2, updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 RETURNING *`,
      [formId, versionRows[0].id],
    );

    return {
      code: 200,
      data: {
        form: formRows[0],
        version: versionRows[0],
        created,
        fields,
        links: {
          designer: `/workflow/form-designer/${formId}`,
          forms: '/workflow/forms',
        },
      },
    };
  }

  async getForm(id: number) {
    const rows = await this.em.query(`SELECT * FROM wf_form_definition WHERE id=$1`, [id]);
    if (!rows[0]) throw new NotFoundException('workflow form not found');
    return { code: 200, data: rows[0] };
  }

  async updateForm(id: number, body: any, user: WorkflowUser) {
    this.requireAdmin(user);
    const rows = await this.em.query(
      `UPDATE wf_form_definition
       SET name=COALESCE($2,name), description=$3, category=$4, status=COALESCE($5,status), updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 RETURNING *`,
      [id, body.name || null, body.description ?? null, body.category ?? null, body.status || null],
    );
    if (!rows[0]) throw new NotFoundException('workflow form not found');
    return { code: 200, data: rows[0] };
  }

  async publishForm(id: number, body: any, user: WorkflowUser) {
    this.requireAdmin(user);
    const schema = this.normalizeFormSchema(body.schema_json || body.schema || {});
    const latest = await this.em.query(
      `SELECT COALESCE(MAX(version_no),0)::int AS version_no FROM wf_form_version WHERE form_id=$1`,
      [id],
    );
    const versionNo = Number(latest[0]?.version_no || 0) + 1;
    const versionRows = await this.em.query(
      `INSERT INTO wf_form_version
         (form_id, version_no, status, schema_json, published_by, published_at)
       VALUES ($1,$2,'PUBLISHED',$3::jsonb,$4,CURRENT_TIMESTAMP)
       RETURNING *`,
      [id, versionNo, JSON.stringify(schema), user.userId || null],
    );
    await this.em.query(
      `UPDATE wf_form_definition SET status='ACTIVE', current_version_id=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [id, versionRows[0].id],
    );
    return { code: 200, data: versionRows[0] };
  }

  async getFormDesigner(id: number) {
    const rows = await this.em.query(
      `SELECT f.*, v.id AS version_id, v.version_no, v.schema_json
       FROM wf_form_definition f
       LEFT JOIN wf_form_version v ON v.id = f.current_version_id
       WHERE f.id=$1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('workflow form not found');
    return { code: 200, data: rows[0] };
  }

  async startWorkflow(body: StartWorkflowDto, user: WorkflowUser) {
    const definition = await this.findActiveDefinition(body);
    const version = await this.findDefinitionVersion(definition.current_version_id);
    const graph = this.normalizeGraph(version.graph_json);
    const formData = version.form_version_id
      ? await this.validateFormData(version.form_version_id, body.form_data || {})
      : (body.form_data || {});
    const variables = { ...formData, ...(body.variables || {}) };
    const starterName = user.realNameZh || user.username || `USER_${user.userId || 0}`;
    const instanceNo = `WF${Date.now()}${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    const title = body.title || `${definition.name}-${starterName}`;

    const instanceRows = await this.em.query(
      `INSERT INTO wf_instance
         (instance_no, definition_id, definition_version_id, form_version_id, title, business_type,
          business_id, starter_id, starter_name, form_data_json, variables_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb)
       RETURNING *`,
      [
        instanceNo,
        definition.id,
        version.id,
        version.form_version_id || null,
        title,
        body.business_type || definition.code,
        body.business_id ? String(body.business_id) : null,
        user.userId || null,
        starterName,
        JSON.stringify(formData),
        JSON.stringify(variables),
      ],
    );
    const instance = instanceRows[0];
    await this.writeVariables(instance.id, variables);
    await this.writeAction(instance.id, null, 'SUBMIT', user, null, null, { formData });
    await this.advance(instance.id, graph, 'start', variables, user);
    return this.getInstance(instance.id, user);
  }

  async listInstances(query: QueryDto, user: WorkflowUser) {
    const { limit, offset } = this.page(query);
    const isAdmin = this.isAdmin(user);
    const rows = await this.em.query(
      `SELECT * FROM wf_instance
       WHERE ($1::text IS NULL OR status=$1)
         AND ($2::boolean OR starter_id=$3 OR EXISTS (
           SELECT 1 FROM wf_task t
           WHERE t.instance_id=wf_instance.id
             AND (t.assignee_user_id=$3 OR t.assignee_role_code = ANY($4::text[]))
         ))
       ORDER BY created_at DESC, id DESC LIMIT $5 OFFSET $6`,
      [query.status || null, isAdmin, user.userId || 0, this.userRoles(user), limit, offset],
    );
    return { code: 200, data: rows, total: rows.length };
  }

  async getAnalytics(user: WorkflowUser, query: QueryDto & { days?: string | number }) {
    this.requireAdmin(user);
    const days = Math.min(Math.max(Number(query.days || 30), 1), 365);
    const windowSql = `i.started_at >= CURRENT_TIMESTAMP - ($1::int * INTERVAL '1 day')`;
    const [summaryRows, statusRows, definitionRows, bottleneckRows, trendRows] = await Promise.all([
      this.em.query(
        `SELECT
           COUNT(*)::int AS total,
           COUNT(*) FILTER (WHERE i.status='RUNNING')::int AS running,
           COUNT(*) FILTER (WHERE i.status='APPROVED')::int AS approved,
           COUNT(*) FILTER (WHERE i.status='REJECTED')::int AS rejected,
           COUNT(*) FILTER (WHERE i.status='CANCELED')::int AS canceled,
           COUNT(*) FILTER (WHERE i.started_at::date=CURRENT_DATE)::int AS started_today,
           COUNT(*) FILTER (WHERE i.ended_at::date=CURRENT_DATE)::int AS completed_today,
           COALESCE(AVG(EXTRACT(EPOCH FROM (i.ended_at - i.started_at)) / 3600) FILTER (WHERE i.ended_at IS NOT NULL), 0)::float AS avg_complete_hours
         FROM wf_instance i
         WHERE ${windowSql}`,
        [days],
      ),
      this.em.query(
        `SELECT i.status, COUNT(*)::int AS count
         FROM wf_instance i
         WHERE ${windowSql}
         GROUP BY i.status
         ORDER BY count DESC`,
        [days],
      ),
      this.em.query(
        `SELECT d.id AS definition_id, d.name AS definition_name, d.category,
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE i.status='RUNNING')::int AS running,
                COUNT(*) FILTER (WHERE i.status='APPROVED')::int AS approved,
                COALESCE(AVG(EXTRACT(EPOCH FROM (i.ended_at - i.started_at)) / 3600) FILTER (WHERE i.ended_at IS NOT NULL), 0)::float AS avg_complete_hours
         FROM wf_instance i
         LEFT JOIN wf_definition d ON d.id=i.definition_id
         WHERE ${windowSql}
         GROUP BY d.id, d.name, d.category
         ORDER BY total DESC, running DESC
         LIMIT 8`,
        [days],
      ),
      this.em.query(
        `SELECT t.node_id, COALESCE(t.node_name, t.node_id) AS node_name,
                COUNT(*)::int AS todo_count,
                COUNT(*) FILTER (WHERE t.due_at IS NOT NULL AND t.due_at < CURRENT_TIMESTAMP)::int AS overdue_count,
                COALESCE(AVG(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - t.created_at)) / 3600), 0)::float AS avg_waiting_hours
         FROM wf_task t
         JOIN wf_instance i ON i.id=t.instance_id
         WHERE t.status='TODO' AND ${windowSql}
         GROUP BY t.node_id, t.node_name
         ORDER BY overdue_count DESC, avg_waiting_hours DESC, todo_count DESC
         LIMIT 8`,
        [days],
      ),
      this.em.query(
        `SELECT i.started_at::date AS day,
                COUNT(*)::int AS started,
                COUNT(*) FILTER (WHERE i.status='APPROVED')::int AS approved,
                COUNT(*) FILTER (WHERE i.status='REJECTED')::int AS rejected
         FROM wf_instance i
         WHERE ${windowSql}
         GROUP BY i.started_at::date
         ORDER BY day ASC`,
        [days],
      ),
    ]);
    const summary = summaryRows[0] || {};
    const finished = Number(summary.approved || 0) + Number(summary.rejected || 0) + Number(summary.canceled || 0);
    const approved = Number(summary.approved || 0);
    return {
      code: 200,
      data: {
        days,
        summary: {
          total: Number(summary.total || 0),
          running: Number(summary.running || 0),
          approved,
          rejected: Number(summary.rejected || 0),
          canceled: Number(summary.canceled || 0),
          startedToday: Number(summary.started_today || 0),
          completedToday: Number(summary.completed_today || 0),
          avgCompleteHours: Number(summary.avg_complete_hours || 0),
          approvalRate: finished > 0 ? approved / finished : 0,
        },
        statuses: statusRows,
        definitions: definitionRows,
        bottlenecks: bottleneckRows,
        trend: trendRows,
      },
    };
  }

  async getInstance(id: number, user: WorkflowUser) {
    const rows = await this.em.query(
      `SELECT i.*, fv.schema_json AS form_schema_json
       FROM wf_instance i
       LEFT JOIN wf_form_version fv ON fv.id=i.form_version_id
       WHERE i.id=$1`,
      [id],
    );
    if (!rows[0]) throw new NotFoundException('workflow instance not found');
    await this.assertInstanceVisible(id, user);
    const tasks = await this.em.query(`SELECT * FROM wf_task WHERE instance_id=$1 ORDER BY id`, [id]);
    const actions = await this.em.query(`SELECT * FROM wf_task_action WHERE instance_id=$1 ORDER BY id`, [id]);
    const cc = await this.em.query(`SELECT * FROM wf_cc_task WHERE instance_id=$1 ORDER BY id`, [id]);
    return { code: 200, data: { ...rows[0], tasks, actions, cc } };
  }

  async cancelInstance(id: number, body: any, user: WorkflowUser) {
    const rows = await this.em.query(`SELECT * FROM wf_instance WHERE id=$1`, [id]);
    const instance = rows[0];
    if (!instance) throw new NotFoundException('workflow instance not found');
    if (instance.status !== 'RUNNING') throw new BadRequestException('only RUNNING instance can be canceled');
    if (!this.isAdmin(user) && Number(instance.starter_id) !== Number(user.userId)) {
      throw new ForbiddenException('only starter or admin can cancel instance');
    }
    await this.em.query(`UPDATE wf_task SET status='CANCELED', action_result='CANCEL', completed_at=CURRENT_TIMESTAMP WHERE instance_id=$1 AND status='TODO'`, [id]);
    await this.em.query(`UPDATE wf_instance SET status='CANCELED', ended_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [id]);
    await this.writeAction(id, null, 'CANCEL', user, instance.current_node_id, null, { comment: body?.comment || '' });
    return this.getInstance(id, user);
  }

  async urgeInstance(id: number, body: any, user: WorkflowUser) {
    const rows = await this.em.query(`SELECT * FROM wf_instance WHERE id=$1`, [id]);
    const instance = rows[0];
    if (!instance) throw new NotFoundException('workflow instance not found');
    if (instance.status !== 'RUNNING') throw new BadRequestException('only RUNNING instance can be urged');
    if (!this.isAdmin(user) && Number(instance.starter_id) !== Number(user.userId)) {
      throw new ForbiddenException('only starter or admin can urge instance');
    }
    const tasks = await this.em.query(
      `SELECT id, node_id, node_name, assignee_user_id, assignee_role_code
       FROM wf_task
       WHERE instance_id=$1 AND status='TODO'
       ORDER BY created_at ASC, id ASC`,
      [id],
    );
    if (tasks.length === 0) throw new BadRequestException('instance has no active task to urge');
    const comment = String(body?.comment || '请尽快处理该流程。').slice(0, 500);
    await this.writeAction(id, null, 'URGE', user, instance.current_node_id, instance.current_node_id, {
      comment,
      targetTaskIds: tasks.map((task: any) => task.id),
      targetNodes: tasks.map((task: any) => task.node_name || task.node_id).filter(Boolean),
    });
    return { code: 200, data: { success: true, urgedTaskCount: tasks.length } };
  }

  async listTodo(user: WorkflowUser, query: QueryDto) {
    return this.listTasks(user, query, 'TODO');
  }

  async listDone(user: WorkflowUser, query: QueryDto) {
    return this.listTasks(user, query, 'DONE');
  }

  async listMonitorTasks(user: WorkflowUser, query: QueryDto) {
    const { limit, offset } = this.page(query);
    const roles = this.userRoles(user);
    const rows = await this.em.query(
      `SELECT t.*, i.title, i.instance_no, i.status AS instance_status, i.started_at, i.starter_id, i.starter_name,
              d.name AS definition_name,
              u.real_name AS assignee_user_name,
              r.role_name_zh AS assignee_role_name,
              EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - t.created_at)) / 3600 AS waiting_hours,
              (t.due_at IS NOT NULL AND t.due_at < CURRENT_TIMESTAMP) AS overdue,
              COALESCE(a.urge_count, 0) AS urge_count,
              a.last_urged_at
       FROM wf_task t
       JOIN wf_instance i ON i.id=t.instance_id
       LEFT JOIN wf_definition d ON d.id=i.definition_id
       LEFT JOIN sys_user u ON u.user_id=t.assignee_user_id
       LEFT JOIN sys_role r ON r.role_code=t.assignee_role_code
       LEFT JOIN (
         SELECT instance_id,
                COUNT(*) FILTER (WHERE action='URGE')::int AS urge_count,
                MAX(created_at) FILTER (WHERE action='URGE') AS last_urged_at
         FROM wf_task_action
         GROUP BY instance_id
       ) a ON a.instance_id=i.id
       WHERE t.status='TODO'
         AND ($1::boolean OR i.starter_id=$2 OR t.assignee_user_id=$2 OR t.assignee_role_code = ANY($3::text[]) OR EXISTS (
           SELECT 1 FROM wf_cc_task c
           WHERE c.instance_id=i.id
             AND (c.receiver_user_id=$2 OR c.receiver_role_code = ANY($3::text[]))
         ))
       ORDER BY (t.due_at IS NOT NULL AND t.due_at < CURRENT_TIMESTAMP) DESC,
                t.due_at ASC NULLS LAST,
                t.created_at ASC,
                t.id ASC
       LIMIT $4 OFFSET $5`,
      [this.isAdmin(user), user.userId || 0, roles, limit, offset],
    );
    return { code: 200, data: rows, total: rows.length };
  }

  async listCcTasks(user: WorkflowUser, query: QueryDto) {
    const { limit, offset } = this.page(query);
    const roles = this.userRoles(user);
    const rows = await this.em.query(
      `SELECT c.*, i.title, i.instance_no, i.status AS instance_status, i.started_at, i.starter_name,
              i.form_data_json, fv.schema_json AS form_schema_json, d.name AS definition_name,
              u.real_name AS receiver_user_name, r.role_name_zh AS receiver_role_name
       FROM wf_cc_task c
       JOIN wf_instance i ON i.id=c.instance_id
       LEFT JOIN wf_definition d ON d.id=i.definition_id
       LEFT JOIN wf_form_version fv ON fv.id=i.form_version_id
       LEFT JOIN sys_user u ON u.user_id=c.receiver_user_id
       LEFT JOIN sys_role r ON r.role_code=c.receiver_role_code
       WHERE $1::boolean OR c.receiver_user_id=$2 OR c.receiver_role_code = ANY($3::text[])
       ORDER BY COALESCE(c.read_at, TIMESTAMP '1970-01-01') ASC, c.created_at DESC, c.id DESC
       LIMIT $4 OFFSET $5`,
      [this.isAdmin(user), user.userId || 0, roles, limit, offset],
    );
    return { code: 200, data: rows, total: rows.length };
  }

  async getTaskSummary(user: WorkflowUser) {
    const roles = this.userRoles(user);
    const isAdmin = this.isAdmin(user);
    const [todoRows, ccRows, overdueRows, runningRows, startedRows] = await Promise.all([
      this.em.query(
        `SELECT COUNT(*)::int AS count
         FROM wf_task t
         WHERE t.status='TODO'
           AND ($1::boolean OR t.assignee_user_id=$2 OR t.assignee_role_code = ANY($3::text[]))`,
        [isAdmin, user.userId || 0, roles],
      ),
      this.em.query(
        `SELECT COUNT(*)::int AS count
         FROM wf_cc_task c
         WHERE c.read_at IS NULL
           AND ($1::boolean OR c.receiver_user_id=$2 OR c.receiver_role_code = ANY($3::text[]))`,
        [isAdmin, user.userId || 0, roles],
      ),
      this.em.query(
        `SELECT COUNT(*)::int AS count
         FROM wf_task t
         WHERE t.status='TODO'
           AND t.due_at IS NOT NULL
           AND t.due_at < CURRENT_TIMESTAMP
           AND ($1::boolean OR t.assignee_user_id=$2 OR t.assignee_role_code = ANY($3::text[]))`,
        [isAdmin, user.userId || 0, roles],
      ),
      this.em.query(
        `SELECT COUNT(*)::int AS count
         FROM wf_instance i
         WHERE i.status='RUNNING'
           AND ($1::boolean OR i.starter_id=$2 OR EXISTS (
             SELECT 1 FROM wf_task t
             WHERE t.instance_id=i.id
               AND (t.assignee_user_id=$2 OR t.assignee_role_code = ANY($3::text[]))
           ) OR EXISTS (
             SELECT 1 FROM wf_cc_task c
             WHERE c.instance_id=i.id
               AND (c.receiver_user_id=$2 OR c.receiver_role_code = ANY($3::text[]))
           ))`,
        [isAdmin, user.userId || 0, roles],
      ),
      this.em.query(
        `SELECT COUNT(*)::int AS count
         FROM wf_instance
         WHERE starter_id=$1 AND status='RUNNING'`,
        [user.userId || 0],
      ),
    ]);
    return {
      code: 200,
      data: {
        todo: Number(todoRows[0]?.count || 0),
        ccUnread: Number(ccRows[0]?.count || 0),
        overdueTodo: Number(overdueRows[0]?.count || 0),
        running: Number(runningRows[0]?.count || 0),
        startedRunning: Number(startedRows[0]?.count || 0),
      },
    };
  }

  async markCcRead(id: number, user: WorkflowUser) {
    const rows = await this.em.query(`SELECT * FROM wf_cc_task WHERE id=$1`, [id]);
    const cc = rows[0];
    if (!cc) throw new NotFoundException('workflow cc task not found');
    await this.assertCcVisible(cc, user);
    const updated = await this.em.query(
      `UPDATE wf_cc_task SET read_at=COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id=$1 RETURNING *`,
      [id],
    );
    return { code: 200, data: updated[0] };
  }

  async approveTask(taskId: number, body: any, user: WorkflowUser) {
    return this.completeTask(taskId, 'APPROVE', body, user);
  }

  async rejectTask(taskId: number, body: any, user: WorkflowUser) {
    return this.completeTask(taskId, 'REJECT', body, user);
  }

  async commentTask(taskId: number, body: any, user: WorkflowUser) {
    const task = await this.findTask(taskId);
    await this.assertTaskVisible(task, user);
    await this.writeAction(task.instance_id, taskId, 'COMMENT', user, task.node_id, task.node_id, { comment: body?.comment || '' });
    return { code: 200, data: { success: true } };
  }

  async transferTask(taskId: number, body: any, user: WorkflowUser) {
    const task = await this.findTask(taskId);
    await this.assertTaskOwner(task, user);
    if (!body?.assignee_user_id && !body?.assignee_role_code) {
      throw new BadRequestException('assignee_user_id or assignee_role_code required');
    }
    await this.em.query(
      `UPDATE wf_task SET assignee_user_id=$2, assignee_role_code=$3 WHERE id=$1`,
      [taskId, body.assignee_user_id || null, body.assignee_role_code || null],
    );
    await this.writeAction(task.instance_id, taskId, 'TRANSFER', user, task.node_id, task.node_id, body);
    return { code: 200, data: { success: true } };
  }

  async listDataSources(query: QueryDto) {
    await this.refreshAllDataSourceMetadata();
    const { limit, offset } = this.page(query);
    const rows = await this.em.query(
      `SELECT * FROM wf_data_source
       WHERE ($1::text IS NULL OR status=$1)
       ORDER BY id DESC LIMIT $2 OFFSET $3`,
      [query.status || null, limit, offset],
    );
    return { code: 200, data: rows, total: rows.length };
  }

  async syncDefaultDataSources(user: WorkflowUser) {
    this.requireAdmin(user);
    await this.ensureDefaultDataSources();
    const rows = await this.refreshAllDataSourceMetadata();
    return { code: 200, data: rows, total: rows.length };
  }

  async refreshDataSourceMetadata(user: WorkflowUser) {
    this.requireAdmin(user);
    const rows = await this.refreshAllDataSourceMetadata();
    return { code: 200, data: rows, total: rows.length };
  }

  async suggestDataSourceFields(code: string, user: WorkflowUser) {
    this.requireAdmin(user);
    this.assertCode(code);
    const source = await this.findDataSourceByCode(code);
    const refreshed = await this.refreshDataSourceForUse(source);
    const metadata = refreshed.metadata_json || {};
    const fields = this.buildFieldSuggestions(refreshed, metadata);
    return {
      code: 200,
      data: {
        source: {
          code: refreshed.code,
          name: refreshed.name,
          source_type: refreshed.source_type,
          last_synced_at: refreshed.last_synced_at,
        },
        metadata,
        fields,
      },
    };
  }

  async createDataSource(body: any, user: WorkflowUser) {
    this.requireAdmin(user);
    this.assertCode(body.code);
    if (!body.name || !body.source_type) throw new BadRequestException('name and source_type required');
    const rows = await this.em.query(
      `INSERT INTO wf_data_source (code, name, source_type, config_json, status, updated_at)
       VALUES ($1,$2,$3,$4::jsonb,COALESCE($5,'ACTIVE'),CURRENT_TIMESTAMP)
       RETURNING *`,
      [body.code, body.name, body.source_type, JSON.stringify(body.config_json || {}), body.status || 'ACTIVE'],
    );
    const refreshed = await this.refreshDataSourceRow(rows[0]);
    return { code: 200, data: refreshed };
  }

  async updateDataSource(id: number, body: any, user: WorkflowUser) {
    this.requireAdmin(user);
    const rows = await this.em.query(
      `UPDATE wf_data_source
       SET name=COALESCE($2,name), source_type=COALESCE($3,source_type),
           config_json=COALESCE($4::jsonb,config_json), status=COALESCE($5,status), updated_at=CURRENT_TIMESTAMP
       WHERE id=$1 RETURNING *`,
      [
        id,
        body.name || null,
        body.source_type || null,
        body.config_json ? JSON.stringify(body.config_json) : null,
        body.status || null,
      ],
    );
    if (!rows[0]) throw new NotFoundException('workflow data source not found');
    const refreshed = await this.refreshDataSourceRow(rows[0]);
    return { code: 200, data: refreshed };
  }

  async previewDataSource(body: any) {
    const source = body.code ? await this.findDataSourceByCode(body.code) : body;
    const config = source.config_json || source.config || {};
    if (source.source_type === 'STATIC') {
      return { code: 200, data: Array.isArray(config.options) ? config.options : [] };
    }
    if (source.source_type === 'DICT') {
      const rows = await this.em.query(
        `SELECT dict_code AS value, COALESCE(dict_label_zh, name, dict_code) AS label
         FROM sys_dict WHERE dict_type=$1 AND COALESCE(status,'ACTIVE')='ACTIVE'
         ORDER BY sort_no NULLS LAST, id LIMIT 200`,
        [config.dict_type],
      );
      return { code: 200, data: rows };
    }
    if (source.source_type === 'TABLE') {
      const table = String(config.table || '');
      const valueField = await this.pickExistingColumn(table, config.valueFields || [config.valueField || 'id']);
      const labelField = await this.pickExistingColumn(table, config.labelFields || [config.labelField || valueField]);
      const statusField = await this.pickOptionalExistingColumn(table, config.statusFields || [config.statusField || 'status']);
      const activeValues = this.normalizeActiveValues(config.activeValues);
      this.assertIdentifier(table);
      this.assertIdentifier(valueField);
      this.assertIdentifier(labelField);
      const whereSql = statusField ? ` WHERE COALESCE("${statusField}"::text,'ACTIVE') = ANY($1::text[])` : '';
      const rows = await this.em.query(
        `SELECT "${valueField}" AS value, "${labelField}" AS label FROM "${table}"${whereSql} LIMIT 200`,
        statusField ? [activeValues] : [],
      );
      return { code: 200, data: rows };
    }
    throw new BadRequestException('unsupported source_type');
  }

  private async completeTask(taskId: number, action: 'APPROVE' | 'REJECT', body: any, user: WorkflowUser) {
    const task = await this.findTask(taskId);
    await this.assertTaskOwner(task, user);
    if (task.status !== 'TODO') throw new BadRequestException('task is not TODO');
    const instanceRows = await this.em.query(`SELECT * FROM wf_instance WHERE id=$1`, [task.instance_id]);
    const instance = instanceRows[0];
    if (!instance || instance.status !== 'RUNNING') throw new BadRequestException('instance is not RUNNING');

    await this.em.query(
      `UPDATE wf_task SET status='DONE', action_result=$2, completed_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [taskId, action],
    );
    await this.writeAction(task.instance_id, taskId, action, user, task.node_id, null, { comment: body?.comment || '' });

    if (action === 'REJECT') {
      await this.em.query(
        `UPDATE wf_task SET status='CANCELED', action_result='CANCELED', completed_at=CURRENT_TIMESTAMP
         WHERE instance_id=$1 AND status='TODO'`,
        [task.instance_id],
      );
      await this.em.query(
        `UPDATE wf_instance SET status='REJECTED', ended_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        [task.instance_id],
      );
      return this.getInstance(task.instance_id, user);
    }

    const pending = await this.em.query(
      `SELECT COUNT(*)::int AS count FROM wf_task WHERE instance_id=$1 AND node_id=$2 AND status='TODO'`,
      [task.instance_id, task.node_id],
    );
    if (Number(pending[0]?.count || 0) === 0) {
      const version = await this.findDefinitionVersion(instance.definition_version_id);
      await this.advance(task.instance_id, this.normalizeGraph(version.graph_json), task.node_id, instance.variables_json || {}, user);
    }
    return this.getInstance(task.instance_id, user);
  }

  private async advance(
    instanceId: number,
    graph: WorkflowGraph,
    fromNodeId: string,
    variables: Record<string, any>,
    user: WorkflowUser,
  ): Promise<void> {
    const startNode = graph.nodes.find(n => n.id === fromNodeId) || graph.nodes.find(n => n.type === 'start');
    if (!startNode) throw new BadRequestException('workflow graph missing start node');
    const nextNode = this.findNextNode(graph, startNode.id, variables);
    if (!nextNode) {
      await this.finishInstance(instanceId, 'APPROVED', startNode.id, null, user);
      return;
    }

    await this.em.query(`UPDATE wf_instance SET current_node_id=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1`, [instanceId, nextNode.id]);

    if (nextNode.type === 'approval') {
      await this.createApprovalTasks(instanceId, nextNode, user);
      await this.writeAction(instanceId, null, 'ENTER_NODE', user, startNode.id, nextNode.id, { nodeType: nextNode.type });
      return;
    }
    if (nextNode.type === 'condition') {
      await this.writeAction(instanceId, null, 'ENTER_NODE', user, startNode.id, nextNode.id, { nodeType: nextNode.type });
      return this.advance(instanceId, graph, nextNode.id, variables, user);
    }
    if (nextNode.type === 'cc') {
      await this.createCcTasks(instanceId, nextNode);
      await this.writeAction(instanceId, null, 'CC', user, startNode.id, nextNode.id, nextNode.config || {});
      return this.advance(instanceId, graph, nextNode.id, variables, user);
    }
    if (nextNode.type === 'end') {
      await this.finishInstance(instanceId, 'APPROVED', startNode.id, nextNode.id, user);
      return;
    }
    return this.advance(instanceId, graph, nextNode.id, variables, user);
  }

  private async createApprovalTasks(instanceId: number, node: GraphNode, user: WorkflowUser) {
    const config = node.config || {};
    const assigneeType = String(config.assigneeType || config.assignee_type || 'STARTER');
    const taskNoBase = `WFT${Date.now()}`;
    const dueAt = config.timeoutHours ? new Date(Date.now() + Number(config.timeoutHours) * 3600_000) : null;
    const values: any[] = [];

    if (assigneeType === 'USER') {
      const users = Array.isArray(config.users) ? config.users : [config.userId || config.assignee_user_id].filter(Boolean);
      users.forEach((uid: any, idx: number) => values.push([`${taskNoBase}${idx}`, instanceId, node.id, node.name || '审批', Number(uid), null, dueAt]));
    } else if (assigneeType === 'ROLE') {
      const roles = Array.isArray(config.roles) ? config.roles : [config.role || config.assignee_role_code].filter(Boolean);
      roles.forEach((role: any, idx: number) => values.push([`${taskNoBase}${idx}`, instanceId, node.id, node.name || '审批', null, String(role), dueAt]));
    } else {
      values.push([`${taskNoBase}0`, instanceId, node.id, node.name || '审批', user.userId || null, null, dueAt]);
    }

    if (values.length === 0) throw new BadRequestException(`approval node ${node.id} missing assignee`);
    for (const row of values) {
      await this.em.query(
        `INSERT INTO wf_task (task_no, instance_id, node_id, node_name, assignee_user_id, assignee_role_code, due_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        row,
      );
    }
  }

  private async createCcTasks(instanceId: number, node: GraphNode) {
    const config = node.config || {};
    const users = Array.isArray(config.users) ? config.users : [];
    const roles = Array.isArray(config.roles) ? config.roles : [];
    for (const uid of users) {
      await this.em.query(`INSERT INTO wf_cc_task (instance_id, node_id, receiver_user_id) VALUES ($1,$2,$3)`, [instanceId, node.id, Number(uid)]);
    }
    for (const role of roles) {
      await this.em.query(`INSERT INTO wf_cc_task (instance_id, node_id, receiver_role_code) VALUES ($1,$2,$3)`, [instanceId, node.id, String(role)]);
    }
  }

  private findNextNode(graph: WorkflowGraph, fromNodeId: string, variables: Record<string, any>) {
    const edges = graph.edges.filter(e => e.from === fromNodeId);
    const edge = edges.find(e => !e.condition || this.conditionEngine.evaluate(e.condition as ConditionNode, variables));
    return edge ? graph.nodes.find(n => n.id === edge.to) : null;
  }

  private async finishInstance(instanceId: number, status: WorkflowStatus, fromNodeId: string | null, toNodeId: string | null, user: WorkflowUser) {
    await this.em.query(
      `UPDATE wf_instance SET status=$2, current_node_id=$3, ended_at=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [instanceId, status, toNodeId],
    );
    await this.writeAction(instanceId, null, status, user, fromNodeId, toNodeId, {});
  }

  private async listTasks(user: WorkflowUser, query: QueryDto, status: TaskStatus) {
    const { limit, offset } = this.page(query);
    const rows = await this.em.query(
      `SELECT t.*, i.title, i.instance_no, i.status AS instance_status, i.started_at, i.starter_name,
              i.form_data_json, fv.schema_json AS form_schema_json, d.name AS definition_name
       FROM wf_task t
       JOIN wf_instance i ON i.id=t.instance_id
       LEFT JOIN wf_definition d ON d.id=i.definition_id
       LEFT JOIN wf_form_version fv ON fv.id=i.form_version_id
       WHERE t.status=$1
         AND ($2::boolean OR t.assignee_user_id=$3 OR t.assignee_role_code = ANY($4::text[]))
       ORDER BY t.created_at DESC, t.id DESC LIMIT $5 OFFSET $6`,
      [status, this.isAdmin(user), user.userId || 0, this.userRoles(user), limit, offset],
    );
    return { code: 200, data: rows, total: rows.length };
  }

  private async findActiveDefinition(body: StartWorkflowDto) {
    const rows = body.definition_id
      ? await this.em.query(`SELECT * FROM wf_definition WHERE id=$1 AND status='ACTIVE'`, [body.definition_id])
      : await this.em.query(`SELECT * FROM wf_definition WHERE code=$1 AND status='ACTIVE'`, [body.definition_code]);
    if (!rows[0]) throw new NotFoundException('active workflow definition not found');
    if (!rows[0].current_version_id) throw new BadRequestException('workflow definition has no published version');
    return rows[0];
  }

  private async findDefinitionVersion(id: number) {
    const rows = await this.em.query(`SELECT * FROM wf_definition_version WHERE id=$1`, [id]);
    if (!rows[0]) throw new NotFoundException('workflow definition version not found');
    return rows[0];
  }

  private async ensureFormVersion(id: number) {
    const rows = await this.em.query(`SELECT id FROM wf_form_version WHERE id=$1`, [id]);
    if (!rows[0]) throw new NotFoundException('workflow form version not found');
  }

  private async findFormVersion(id: number) {
    const rows = await this.em.query(`SELECT * FROM wf_form_version WHERE id=$1`, [id]);
    if (!rows[0]) throw new NotFoundException('workflow form version not found');
    return rows[0];
  }

  private async findTask(id: number) {
    const rows = await this.em.query(`SELECT * FROM wf_task WHERE id=$1`, [id]);
    if (!rows[0]) throw new NotFoundException('workflow task not found');
    return rows[0];
  }

  private async findDataSourceByCode(code: string) {
    const rows = await this.em.query(`SELECT * FROM wf_data_source WHERE code=$1 AND status='ACTIVE'`, [code]);
    if (!rows[0]) throw new NotFoundException('workflow data source not found');
    return rows[0];
  }

  private async pickExistingColumn(table: string, candidates: any[]) {
    this.assertIdentifier(table);
    const normalized = (Array.isArray(candidates) ? candidates : [candidates])
      .map(item => String(item || '').trim())
      .filter(Boolean);
    if (normalized.length === 0) throw new BadRequestException('data source column required');
    normalized.forEach(item => this.assertIdentifier(item));
    const rows = await this.em.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`,
      [table],
    );
    const existing = new Set(rows.map((row: any) => String(row.column_name)));
    const picked = normalized.find(item => existing.has(item));
    if (!picked) throw new BadRequestException(`data source column not found for table ${table}`);
    return picked;
  }

  private async pickOptionalExistingColumn(table: string, candidates: any[]) {
    this.assertIdentifier(table);
    const normalized = (Array.isArray(candidates) ? candidates : [candidates])
      .map(item => String(item || '').trim())
      .filter(Boolean);
    if (normalized.length === 0) return null;
    normalized.forEach(item => this.assertIdentifier(item));
    const rows = await this.em.query(
      `SELECT column_name FROM information_schema.columns WHERE table_schema = current_schema() AND table_name = $1`,
      [table],
    );
    const existing = new Set(rows.map((row: any) => String(row.column_name)));
    return normalized.find(item => existing.has(item)) || null;
  }

  private normalizeActiveValues(values: any) {
    const normalized = (Array.isArray(values) ? values : ['ACTIVE', 'ENABLED', 'NORMAL', '1', 'true'])
      .map(item => String(item || '').trim())
      .filter(Boolean);
    return normalized.length ? normalized : ['ACTIVE', 'ENABLED', 'NORMAL', '1', 'true'];
  }

  private async refreshAllDataSourceMetadata() {
    const rows = await this.em.query(`SELECT * FROM wf_data_source WHERE status='ACTIVE' ORDER BY id`);
    const refreshed: any[] = [];
    for (const row of rows) {
      refreshed.push(await this.refreshDataSourceRow(row));
    }
    return refreshed;
  }

  private async refreshDataSourceRow(row: any) {
    if (!row) return row;
    const metadata = await this.buildDataSourceMetadata(row).catch(err => ({
      available: false,
      refreshedAt: new Date().toISOString(),
      error: err?.message || 'data source metadata refresh failed',
    }));
    const rows = await this.em.query(
      `UPDATE wf_data_source
       SET metadata_json=$2::jsonb, last_synced_at=CURRENT_TIMESTAMP
       WHERE id=$1
       RETURNING *`,
      [row.id, JSON.stringify(metadata)],
    );
    return rows[0] || { ...row, metadata_json: metadata };
  }

  private async refreshDataSourceForUse(source: any) {
    const refreshed = await this.refreshDataSourceRow(source);
    const merged = refreshed?.code ? refreshed : { ...source, ...(refreshed || {}) };
    if (!merged.metadata_json || Object.keys(merged.metadata_json || {}).length === 0) {
      merged.metadata_json = await this.buildDataSourceMetadata(merged);
    }
    return merged;
  }

  private async buildDataSourceMetadata(source: any) {
    const config = source.config_json || {};
    const base = {
      available: true,
      sourceType: source.source_type,
      refreshedAt: new Date().toISOString(),
    };

    if (source.source_type === 'STATIC') {
      const options = Array.isArray(config.options) ? config.options : [];
      return { ...base, optionCount: options.length };
    }

    if (source.source_type === 'DICT') {
      const rows = await this.em.query(
        `SELECT COUNT(*)::int AS count
         FROM sys_dict
         WHERE dict_type=$1 AND COALESCE(status,'ACTIVE')='ACTIVE'`,
        [config.dict_type],
      );
      return { ...base, dictType: config.dict_type || null, rowCount: Number(rows[0]?.count || 0) };
    }

    if (source.source_type !== 'TABLE') {
      return { ...base, available: false, error: 'unsupported source_type' };
    }

    const table = String(config.table || '').trim();
    this.assertIdentifier(table);
    const columns = await this.em.query(
      `SELECT column_name, data_type, is_nullable
       FROM information_schema.columns
       WHERE table_schema = current_schema() AND table_name = $1
       ORDER BY ordinal_position`,
      [table],
    );
    if (columns.length === 0) {
      return { ...base, available: false, table, tableExists: false, columns: [], error: 'table not found' };
    }

    const valueField = this.pickColumnName(columns, config.valueFields || [config.valueField || 'id']);
    const labelField = this.pickColumnName(columns, config.labelFields || [config.labelField || valueField]);
    const statusField = this.pickColumnName(columns, config.statusFields || [config.statusField || 'status']);
    const activeValues = this.normalizeActiveValues(config.activeValues);
    const missing: string[] = [];
    if (!valueField) missing.push('valueField');
    if (!labelField) missing.push('labelField');

    const rowCount = missing.length === 0
      ? await this.countDataSourceRows(table, statusField, activeValues)
      : 0;

    return {
      ...base,
      available: missing.length === 0,
      table,
      tableExists: true,
      valueField,
      labelField,
      statusField,
      activeValues,
      rowCount,
      missing,
      columns: columns.map((column: any) => ({
        key: String(column.column_name),
        type: String(column.data_type),
        nullable: column.is_nullable === 'YES',
      })),
    };
  }

  private pickColumnName(columns: any[], candidates: any[]) {
    const normalized = (Array.isArray(candidates) ? candidates : [candidates])
      .map(item => String(item || '').trim())
      .filter(Boolean);
    normalized.forEach(item => this.assertIdentifier(item));
    const existing = new Set(columns.map(column => String(column.column_name)));
    return normalized.find(item => existing.has(item)) || null;
  }

  private async countDataSourceRows(table: string, statusField: string | null, activeValues: string[]) {
    this.assertIdentifier(table);
    if (statusField) this.assertIdentifier(statusField);
    const whereSql = statusField ? ` WHERE COALESCE("${statusField}"::text,'ACTIVE') = ANY($1::text[])` : '';
    const rows = await this.em.query(
      `SELECT COUNT(*)::int AS count FROM "${table}"${whereSql}`,
      statusField ? [activeValues] : [],
    );
    return Number(rows[0]?.count || 0);
  }

  private buildFieldSuggestions(source: any, metadata: any) {
    if (source.source_type === 'STATIC') {
      return [{
        key: this.suggestFieldKey(source.code),
        label: source.name,
        type: 'select',
        required: false,
        reason: '固定选项可直接作为下拉控件',
      }];
    }

    if (source.source_type === 'DICT') {
      return [{
        key: this.suggestFieldKey(source.code),
        label: source.name,
        type: 'select',
        dataSource: source.code,
        required: false,
        reason: '系统字典可作为审批表单里的标准下拉项',
      }];
    }

    if (source.source_type !== 'TABLE' || metadata?.available === false) return [];

    const columns = Array.isArray(metadata?.columns) ? metadata.columns : [];
    const valueField = String(metadata?.valueField || '').trim();
    const labelField = String(metadata?.labelField || '').trim();
    const statusField = String(metadata?.statusField || '').trim();
    const suggestions: any[] = [];

    if (valueField) {
      suggestions.push({
        key: this.suggestFieldKey(valueField),
        label: this.suggestFieldLabel(valueField, source.name),
        type: 'reference',
        dataSource: source.code,
        required: false,
        reason: '主引用字段会实时读取该数据源最新记录',
      });
    }

    for (const column of columns) {
      const key = String(column?.key || '').trim();
      if (!key || key === valueField || key === labelField || key === statusField) continue;
      if (this.isTechnicalColumn(key)) continue;
      suggestions.push({
        key: this.suggestFieldKey(key),
        label: this.suggestFieldLabel(key),
        type: this.suggestFieldType(key, String(column?.type || '')),
        required: column?.nullable === false && !this.isOptionalBusinessColumn(key),
        reason: '由数据表字段自动发现，可按需加入自定义表单',
      });
    }

    return suggestions.slice(0, 24);
  }

  private suggestFieldKey(key: string) {
    return String(key || 'field')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, '_')
      .replace(/^_+|_+$/g, '') || 'field';
  }

  private suggestFieldLabel(key: string, fallback?: string) {
    const dict: Record<string, string> = {
      user_id: '用户',
      username: '账号',
      real_name: '姓名',
      real_name_zh: '姓名',
      role_code: '角色',
      role_name_zh: '角色名称',
      org_code: '组织',
      org_name: '组织名称',
      store_code: '门店',
      store_name: '门店名称',
      product_code: '商品/物料',
      product_name: '商品名称',
      warehouse_code: '仓库',
      warehouse_name: '仓库名称',
      supplier_code: '供应商',
      supplier_name: '供应商名称',
      customer_code: '客户',
      customer_name: '客户名称',
      amount: '金额',
      quantity: '数量',
      remark: '备注',
      description: '说明',
    };
    return dict[key] || fallback || key.split('_').filter(Boolean).map(part => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');
  }

  private suggestFieldType(key: string, dbType: string): FormFieldType {
    const lowerKey = key.toLowerCase();
    const lowerType = dbType.toLowerCase();
    if (lowerKey.includes('amount') || lowerKey.includes('price') || lowerKey.includes('cost') || lowerKey.includes('total')) return 'amount';
    if (lowerType.includes('timestamp') || lowerKey.endsWith('_at') || lowerKey.includes('time')) return 'datetime';
    if (lowerType.includes('date')) return 'date';
    if (lowerType.includes('int') || lowerType.includes('numeric') || lowerType.includes('decimal') || lowerType.includes('double') || lowerType.includes('real')) return 'number';
    if (lowerType.includes('text') || lowerKey.includes('remark') || lowerKey.includes('description') || lowerKey.includes('note')) return 'textarea';
    return 'text';
  }

  private isTechnicalColumn(key: string) {
    return [
      'id',
      'password',
      'password_hash',
      'salt',
      'created_at',
      'updated_at',
      'deleted_at',
      'created_by',
      'updated_by',
      'perms_version',
    ].includes(key);
  }

  private isOptionalBusinessColumn(key: string) {
    return key.includes('remark') || key.includes('description') || key.includes('note') || key.includes('memo');
  }

  private async assertInstanceVisible(instanceId: number, user: WorkflowUser) {
    if (this.isAdmin(user)) return;
    const rows = await this.em.query(
      `SELECT 1 FROM wf_instance i
       WHERE i.id=$1 AND (i.starter_id=$2 OR EXISTS (
         SELECT 1 FROM wf_task t
         WHERE t.instance_id=i.id
           AND (t.assignee_user_id=$2 OR t.assignee_role_code = ANY($3::text[]))
       ) OR EXISTS (
         SELECT 1 FROM wf_cc_task c
         WHERE c.instance_id=i.id
           AND (c.receiver_user_id=$2 OR c.receiver_role_code = ANY($3::text[]))
       ))`,
      [instanceId, user.userId || 0, this.userRoles(user)],
    );
    if (!rows[0]) throw new ForbiddenException('workflow instance not visible');
  }

  private async assertCcVisible(cc: any, user: WorkflowUser) {
    if (this.isAdmin(user)) return;
    if (Number(cc.receiver_user_id) === Number(user.userId)) return;
    if (cc.receiver_role_code && this.userRoles(user).includes(cc.receiver_role_code)) return;
    throw new ForbiddenException('workflow cc task not visible');
  }

  private async assertTaskVisible(task: any, user: WorkflowUser) {
    if (this.isAdmin(user)) return;
    if (Number(task.assignee_user_id) === Number(user.userId)) return;
    if (task.assignee_role_code && this.userRoles(user).includes(task.assignee_role_code)) return;
    throw new ForbiddenException('workflow task not visible');
  }

  private async assertTaskOwner(task: any, user: WorkflowUser) {
    await this.assertTaskVisible(task, user);
  }

  private async writeVariables(instanceId: number, variables: Record<string, any>) {
    for (const [key, value] of Object.entries(variables)) {
      await this.em.query(
        `INSERT INTO wf_instance_variable (instance_id, var_key, var_value, value_type)
         VALUES ($1,$2,$3,$4)`,
        [instanceId, key, value === undefined ? null : JSON.stringify(value), Array.isArray(value) ? 'array' : typeof value],
      );
    }
  }

  private async writeAction(
    instanceId: number,
    taskId: number | null,
    action: string,
    user: WorkflowUser,
    fromNodeId: string | null,
    toNodeId: string | null,
    payload: Record<string, any>,
  ) {
    await this.em.query(
      `INSERT INTO wf_task_action
         (task_id, instance_id, action, actor_id, actor_name, comment, from_node_id, to_node_id, payload_json)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)`,
      [
        taskId,
        instanceId,
        action,
        user.userId || null,
        user.realNameZh || user.username || null,
        payload.comment || null,
        fromNodeId,
        toNodeId,
        JSON.stringify(payload || {}),
      ],
    );
  }

  private normalizeGraph(input: any): WorkflowGraph {
    const graph = this.parseJsonInput(input, 'graph');
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const edges = Array.isArray(graph.edges) ? graph.edges : [];
    if (nodes.length === 0) throw new BadRequestException('graph.nodes required');
    const nodeIds = new Set<string>();
    let startCount = 0;
    let endCount = 0;
    for (const node of nodes) {
      if (!node.id || !node.type) throw new BadRequestException('node id/type required');
      if (!this.isCodeLike(node.id)) throw new BadRequestException(`invalid node id: ${node.id}`);
      if (nodeIds.has(node.id)) throw new BadRequestException(`duplicate node id: ${node.id}`);
      nodeIds.add(node.id);
      if (!NODE_TYPES.has(node.type)) {
        throw new BadRequestException(`unsupported node type: ${node.type}`);
      }
      if (node.type === 'start') startCount++;
      if (node.type === 'end') endCount++;
      if (node.type === 'approval') {
        this.assertAssignableNode(node);
      }
    }
    if (startCount !== 1) throw new BadRequestException('graph must contain exactly one start node');
    if (endCount < 1) throw new BadRequestException('graph missing end node');
    if (edges.length === 0) throw new BadRequestException('graph.edges required');
    for (const edge of edges) {
      if (!edge.from || !edge.to) throw new BadRequestException('edge from/to required');
      if (!nodeIds.has(edge.from)) throw new BadRequestException(`edge.from references unknown node: ${edge.from}`);
      if (!nodeIds.has(edge.to)) throw new BadRequestException(`edge.to references unknown node: ${edge.to}`);
      if (edge.condition) this.assertCondition(edge.condition);
    }
    return { nodes, edges };
  }

  private normalizeFormSchema(input: any) {
    const schema = this.parseJsonInput(input, 'schema');
    if (!Array.isArray(schema.fields)) throw new BadRequestException('schema.fields required');
    const keys = new Set<string>();
    const fields = schema.fields.map((field: any, idx: number) => {
      if (!field || typeof field !== 'object') throw new BadRequestException(`schema.fields[${idx}] must be an object`);
      if (!field.key || !this.isCodeLike(field.key)) throw new BadRequestException(`invalid field key at index ${idx}`);
      if (keys.has(field.key)) throw new BadRequestException(`duplicate field key: ${field.key}`);
      keys.add(field.key);
      if (!field.label) throw new BadRequestException(`field ${field.key} missing label`);
      if (!FORM_FIELD_TYPES.has(field.type)) throw new BadRequestException(`field ${field.key} has unsupported type: ${field.type}`);
      if ((field.type === 'select' || field.type === 'radio') && field.options !== undefined && !Array.isArray(field.options)) {
        throw new BadRequestException(`field ${field.key} options must be an array`);
      }
      if (field.type === 'reference' && !field.dataSource) {
        throw new BadRequestException(`reference field ${field.key} requires dataSource`);
      }
      return {
        ...field,
        required: Boolean(field.required),
        span: field.span === 2 ? 2 : 1,
      };
    });
    return { ...schema, fields };
  }

  private async validateFormData(formVersionId: number, formData: Record<string, any>) {
    const version = await this.findFormVersion(formVersionId);
    const schema = this.normalizeFormSchema(version.schema_json);
    const out: Record<string, any> = { ...formData };
    for (const field of schema.fields) {
      const value = formData[field.key];
      const empty = value === undefined || value === null || value === '';
      if (field.required && empty) {
        throw new BadRequestException(`field ${field.label || field.key} is required`);
      }
      if (empty) continue;
      if (field.type === 'number' || field.type === 'amount') {
        const n = Number(value);
        if (!Number.isFinite(n)) throw new BadRequestException(`field ${field.label || field.key} must be a number`);
        out[field.key] = n;
      } else if (field.type === 'checkbox') {
        out[field.key] = value === true || value === 'true' || value === 1 || value === '1';
      } else if (field.type === 'select' || field.type === 'radio') {
        const options = Array.isArray(field.options) ? field.options : [];
        if (options.length > 0) {
          const allowed = options.map((opt: any) => String(opt.value));
          if (!allowed.includes(String(value))) {
            throw new BadRequestException(`field ${field.label || field.key} has invalid option`);
          }
        }
      }
    }
    return out;
  }

  private assertAssignableNode(node: GraphNode) {
    const config = node.config || {};
    const assigneeType = String(config.assigneeType || config.assignee_type || 'STARTER');
    if (!['ROLE', 'USER', 'STARTER'].includes(assigneeType)) {
      throw new BadRequestException(`node ${node.id} has invalid assigneeType`);
    }
    if (assigneeType === 'ROLE') {
      const roles = Array.isArray(config.roles) ? config.roles : [config.role || config.assignee_role_code].filter(Boolean);
      if (roles.length === 0) throw new BadRequestException(`approval node ${node.id} requires at least one role`);
    }
    if (assigneeType === 'USER') {
      const users = Array.isArray(config.users) ? config.users : [config.userId || config.assignee_user_id].filter(Boolean);
      if (users.length === 0) throw new BadRequestException(`approval node ${node.id} requires at least one user`);
      if (!users.every((uid: any) => Number.isInteger(Number(uid)) && Number(uid) > 0)) {
        throw new BadRequestException(`approval node ${node.id} has invalid user id`);
      }
    }
  }

  private assertCondition(condition: ConditionRule) {
    if (!condition.field || !this.isCodeLike(condition.field)) throw new BadRequestException('condition.field invalid');
    if (!CONDITION_OPERATORS.has(condition.operator)) throw new BadRequestException(`condition.operator unsupported: ${condition.operator}`);
    if ((condition.operator === 'in' || condition.operator === 'notIn') && !Array.isArray(condition.value)) {
      const value = String(condition.value ?? '').trim();
      if (!value) throw new BadRequestException(`${condition.operator} condition requires a value list`);
      condition.value = value.split(',').map(v => v.trim()).filter(Boolean);
    }
  }

  private parseJsonInput(input: any, label: string) {
    if (typeof input !== 'string') return input || {};
    try {
      return JSON.parse(input);
    } catch {
      throw new BadRequestException(`${label} must be valid JSON`);
    }
  }

  private page(query: QueryDto) {
    const limit = Math.min(Math.max(Number(query.limit || 50), 1), 200);
    const offset = Math.max(Number(query.offset || 0), 0);
    return { limit, offset };
  }

  private assertCode(code: string) {
    if (!code || !/^[A-Z][A-Z0-9_]{1,79}$/.test(code)) {
      throw new BadRequestException('code must be uppercase letters, numbers or underscore');
    }
  }

  private assertIdentifier(value: string) {
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value)) throw new BadRequestException('invalid identifier');
  }

  private isCodeLike(value: string) {
    return /^[a-zA-Z_][a-zA-Z0-9_:-]*$/.test(String(value || ''));
  }

  private requireAdmin(user: WorkflowUser) {
    if (!this.isAdmin(user)) throw new ForbiddenException('workflow admin permission required');
  }

  private isAdmin(user: WorkflowUser) {
    const roles = this.userRoles(user);
    return roles.some(role => ADMIN_ROLES.has(role)) || user.username === 'admin' || (user.permissions || []).includes('*');
  }

  private userRoles(user: WorkflowUser) {
    return Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : (user.role ? [user.role] : []);
  }

  private async seedDefaults() {
    await this.ensureDefaultDataSources();
    await this.seedIndustryTemplates(null);
  }

  private async ensureDefaultDataSources() {
    return this.em.query(
      `INSERT INTO wf_data_source (code, name, source_type, config_json)
       VALUES
         ('SYS_USERS','系统用户','TABLE','{"table":"sys_user","valueField":"user_id","labelField":"real_name","valueFields":["user_id","id"],"labelFields":["real_name","real_name_zh","username"],"statusFields":["status"],"activeValues":["1","ACTIVE","ENABLED","true"]}'::jsonb),
         ('SYS_ROLES','系统角色','TABLE','{"table":"sys_role","valueField":"role_code","labelField":"role_name_zh","statusFields":["status"],"activeValues":["1","ACTIVE","ENABLED","true"]}'::jsonb),
         ('SYS_ORGS','组织部门','TABLE','{"table":"sys_organizations","valueField":"org_code","labelField":"org_name","valueFields":["org_code","id"],"labelFields":["org_name"],"statusFields":["status"],"activeValues":["ACTIVE"]}'::jsonb),
         ('SYS_DICT_APPROVAL','审批字典','DICT','{"dict_type":"APPROVAL"}'::jsonb),
         ('MST_STORES','门店列表','TABLE','{"table":"mst_stores","valueField":"store_code","labelField":"store_name"}'::jsonb),
         ('MST_PRODUCTS','产品列表','TABLE','{"table":"mst_products","valueField":"product_code","labelField":"product_name"}'::jsonb),
         ('WMS_WAREHOUSES','仓库列表','TABLE','{"table":"wms_warehouses","valueField":"warehouse_code","labelField":"warehouse_name_zh"}'::jsonb),
         ('PRC_SUPPLIERS','供应商列表','TABLE','{"table":"prc_suppliers","valueField":"supplier_code","labelField":"supplier_name"}'::jsonb),
         -- [Phase G2] ORD_CUSTOMERS / B2B_CUSTOMERS 已迁入 sal_customers，统一读取正式主档
         ('SAL_CUSTOMERS','客户档案','TABLE','{"table":"sal_customers","valueField":"customer_no","labelField":"customer_name","statusFields":["status"],"activeValues":["ACTIVE"]}'::jsonb)
       ON CONFLICT (code) DO UPDATE
       SET name=EXCLUDED.name,
           source_type=EXCLUDED.source_type,
           config_json=EXCLUDED.config_json || wf_data_source.config_json,
           updated_at=CURRENT_TIMESTAMP
       RETURNING code, name, source_type, status, config_json`,
    );
  }

  private async seedIndustryTemplates(userId: number | null) {
    let createdDefinitions = 0;
    let createdForms = 0;
    let skippedDefinitions = 0;
    let skippedForms = 0;

    for (const item of this.industryTemplates()) {
      const formResult = await this.ensureTemplateForm(item, userId);
      if (formResult.created) createdForms++;
      else skippedForms++;

      const exists = await this.em.query(`SELECT id FROM wf_definition WHERE code=$1 LIMIT 1`, [item.code]);
      if (exists[0]) {
        skippedDefinitions++;
        continue;
      }

      const defRows = await this.em.query(
        `INSERT INTO wf_definition (code, name, description, category, status, created_by, updated_at)
         VALUES ($1,$2,$3,$4,'ACTIVE',$5,CURRENT_TIMESTAMP)
         RETURNING id`,
        [item.code, item.name, item.description, item.category, userId],
      );
      const graph = this.templateGraph(item);
      const versionRows = await this.em.query(
        `INSERT INTO wf_definition_version
           (definition_id, version_no, status, graph_json, form_version_id, published_by, published_at)
         VALUES ($1,1,'PUBLISHED',$2::jsonb,$3,$4,CURRENT_TIMESTAMP)
         RETURNING id`,
        [defRows[0].id, JSON.stringify(graph), formResult.versionId, userId],
      );
      await this.em.query(
        `UPDATE wf_definition SET current_version_id=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        [defRows[0].id, versionRows[0].id],
      );
      createdDefinitions++;
    }

    return {
      total: this.industryTemplates().length,
      createdDefinitions,
      skippedDefinitions,
      createdForms,
      skippedForms,
    };
  }

  private async ensureTemplateForm(item: IndustryWorkflowTemplate, userId: number | null) {
    const existing = await this.em.query(
      `SELECT id, current_version_id FROM wf_form_definition WHERE code=$1 LIMIT 1`,
      [item.formCode],
    );
    let formId = existing[0]?.id;
    let created = false;
    if (!formId) {
      const rows = await this.em.query(
        `INSERT INTO wf_form_definition (code, name, description, category, status, created_by, updated_at)
         VALUES ($1,$2,$3,$4,'ACTIVE',$5,CURRENT_TIMESTAMP)
         RETURNING id`,
        [item.formCode, item.formName, item.formDescription, item.category, userId],
      );
      formId = rows[0].id;
      created = true;
    }

    if (existing[0]?.current_version_id) return { versionId: existing[0].current_version_id, created };

    const versionRows = await this.em.query(
      `INSERT INTO wf_form_version (form_id, version_no, status, schema_json, published_by, published_at)
       VALUES ($1,1,'PUBLISHED',$2::jsonb,$3,CURRENT_TIMESTAMP)
       RETURNING id`,
      [formId, JSON.stringify({ fields: item.fields }), userId],
    );
    await this.em.query(
      `UPDATE wf_form_definition SET status='ACTIVE', current_version_id=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [formId, versionRows[0].id],
    );
    return { versionId: versionRows[0].id, created };
  }

  private templateGraph(item: IndustryWorkflowTemplate): WorkflowGraph {
    const nodes: GraphNode[] = [
      { id: 'start', type: 'start', name: '提交申请', x: 80, y: 160 },
      ...item.approvals.map((approval, index) => ({
        id: approval.id,
        type: 'approval' as NodeType,
        name: approval.name,
        x: 320 + index * 240,
        y: 160,
        config: { assigneeType: 'ROLE', roles: [approval.role] },
      })),
      { id: 'end', type: 'end', name: '流程完成', x: 320 + item.approvals.length * 240, y: 160 },
    ];
    const ids = nodes.map(node => node.id);
    const edges = ids.slice(0, -1).map((id, index) => ({ from: id, to: ids[index + 1] }));
    return { nodes, edges };
  }

  private industryTemplates(): IndustryWorkflowTemplate[] {
    return [
      this.tpl('EXPENSE_APPROVAL', '费用报销审批', 'FINANCE', '员工费用报销，部门负责人确认后由财务复核付款。', 'EXPENSE_FORM', '费用报销单', [
        { key: 'amount', label: '申请金额', type: 'amount', required: true },
        { key: 'expense_type', label: '费用类型', type: 'select', required: true, options: [{ label: '差旅费', value: 'travel' }, { label: '招待费', value: 'entertainment' }, { label: '办公费', value: 'office' }, { label: '其它', value: 'other' }] },
        { key: 'store_code', label: '所属门店', type: 'reference', dataSource: 'MST_STORES' },
        { key: 'reason', label: '报销事由', type: 'textarea', required: true, span: 2 },
      ], [['dept_approval', '部门负责人审批', 'ROLE_SYSOPS'], ['finance_approval', '财务复核', 'ROLE_FIN_ACCT']]),
      this.tpl('PURCHASE_APPROVAL', '采购申请审批', 'PURCHASE', '物料、设备、耗材采购申请，采购和财务联合审批。', 'PURCHASE_REQUEST_FORM', '采购申请单', [
        { key: 'product_code', label: '采购物料', type: 'reference', dataSource: 'MST_PRODUCTS', required: true },
        { key: 'quantity', label: '采购数量', type: 'number', required: true },
        { key: 'budget_amount', label: '预算金额', type: 'amount', required: true },
        { key: 'need_date', label: '期望到货日期', type: 'date' },
        { key: 'reason', label: '采购原因', type: 'textarea', required: true, span: 2 },
      ], [['dept_approval', '部门负责人审批', 'ROLE_SYSOPS'], ['buyer_review', '采购复核', 'ROLE_PRC_BUYER'], ['finance_review', '财务审批', 'ROLE_FIN_CFO']]),
      this.tpl('PAYMENT_APPROVAL', '付款申请审批', 'FINANCE', '供应商付款、预付款、尾款支付审批。', 'PAYMENT_REQUEST_FORM', '付款申请单', [
        { key: 'payee', label: '收款方', type: 'text', required: true },
        { key: 'amount', label: '付款金额', type: 'amount', required: true },
        { key: 'payment_type', label: '付款类型', type: 'select', required: true, options: [{ label: '预付款', value: 'advance' }, { label: '到货款', value: 'arrival' }, { label: '尾款', value: 'final' }] },
        { key: 'invoice_no', label: '发票/合同编号', type: 'text' },
        { key: 'reason', label: '付款说明', type: 'textarea', required: true, span: 2 },
      ], [['dept_approval', '部门负责人审批', 'ROLE_SYSOPS'], ['finance_approval', '财务总监审批', 'ROLE_FIN_CFO']]),
      this.tpl('CONTRACT_APPROVAL', '合同审批流程', 'CONTRACT', '合同签署前的业务、财务、法务/系统管理复核。', 'CONTRACT_REVIEW_FORM', '合同审批单', [
        { key: 'counterparty', label: '合同相对方', type: 'text', required: true },
        { key: 'contract_amount', label: '合同金额', type: 'amount', required: true },
        { key: 'contract_type', label: '合同类型', type: 'select', options: [{ label: '采购合同', value: 'purchase' }, { label: '销售合同', value: 'sales' }, { label: '服务合同', value: 'service' }] },
        { key: 'effective_date', label: '生效日期', type: 'date' },
        { key: 'risk_note', label: '风险说明', type: 'textarea', span: 2 },
      ], [['biz_review', '业务负责人审批', 'ROLE_SYSOPS'], ['finance_review', '财务复核', 'ROLE_FIN_CFO'], ['final_review', '最终确认', 'ROLE_SYSOPS']]),
      this.tpl('LEAVE_APPROVAL', '请假申请审批', 'HR', '员工请假提交，直属负责人审批并备案。', 'LEAVE_REQUEST_FORM', '请假申请单', [
        { key: 'leave_type', label: '假期类型', type: 'select', required: true, options: [{ label: '事假', value: 'personal' }, { label: '病假', value: 'sick' }, { label: '年假', value: 'annual' }, { label: '调休', value: 'comp' }] },
        { key: 'start_time', label: '开始时间', type: 'datetime', required: true },
        { key: 'end_time', label: '结束时间', type: 'datetime', required: true },
        { key: 'reason', label: '请假原因', type: 'textarea', required: true, span: 2 },
      ], [['manager_approval', '负责人审批', 'ROLE_SYSOPS']]),
      this.tpl('STOCK_ADJUST_APPROVAL', '库存调整审批', 'WMS', '库存盘盈盘亏、调账、报损等调整审批。', 'STOCK_ADJUST_FORM', '库存调整单', [
        { key: 'warehouse', label: '仓库/门店', type: 'text', required: true },
        { key: 'product_code', label: '商品/物料', type: 'reference', dataSource: 'MST_PRODUCTS', required: true },
        { key: 'adjust_qty', label: '调整数量', type: 'number', required: true },
        { key: 'adjust_type', label: '调整类型', type: 'select', required: true, options: [{ label: '盘盈', value: 'gain' }, { label: '盘亏', value: 'loss' }, { label: '报损', value: 'scrap' }] },
        { key: 'reason', label: '调整原因', type: 'textarea', required: true, span: 2 },
      ], [['warehouse_review', '仓储负责人审批', 'ROLE_WMS_MGR'], ['finance_record', '财务备案', 'ROLE_FIN_ACCT']]),
      this.tpl('QUALITY_EXCEPTION_APPROVAL', '质量异常处理', 'QUALITY', '质量异常上报、责任确认、处理方案审批和关闭。', 'QUALITY_EXCEPTION_FORM', '质量异常单', [
        { key: 'batch_no', label: '批次号', type: 'text', required: true },
        { key: 'exception_type', label: '异常类型', type: 'select', required: true, options: [{ label: '破损', value: 'broken' }, { label: '重量异常', value: 'weight' }, { label: '污染', value: 'pollution' }, { label: '其它', value: 'other' }] },
        { key: 'severity', label: '严重程度', type: 'radio', required: true, options: [{ label: '一般', value: 'normal' }, { label: '严重', value: 'major' }] },
        { key: 'description', label: '异常描述', type: 'textarea', required: true, span: 2 },
        { key: 'proposal', label: '处理建议', type: 'textarea', span: 2 },
      ], [['qa_review', '品控负责人审批', 'ROLE_QA_MGR'], ['biz_confirm', '业务确认', 'ROLE_SYSOPS']]),
      this.tpl('STORE_DISCOUNT_APPROVAL', '门店折扣审批', 'STORE', '门店临时折扣、促销让利和特殊价格审批。', 'STORE_DISCOUNT_FORM', '门店折扣申请单', [
        { key: 'store_code', label: '门店', type: 'reference', dataSource: 'MST_STORES', required: true },
        { key: 'discount_rate', label: '折扣比例', type: 'number', required: true },
        { key: 'amount_impact', label: '预计影响金额', type: 'amount' },
        { key: 'reason', label: '申请原因', type: 'textarea', required: true, span: 2 },
      ], [['store_review', '门店经理审批', 'ROLE_STORE_MGR'], ['sales_review', '销售负责人审批', 'ROLE_SALES_MGR']]),
      this.tpl('FARM_MEDICINE_APPROVAL', '养殖用药审批', 'FARM', '养殖场用药、疫苗、兽医处置申请审批。', 'FARM_MEDICINE_FORM', '养殖用药申请单', [
        { key: 'house_no', label: '鸡舍/栏舍', type: 'text', required: true },
        { key: 'medicine_name', label: '药品/疫苗名称', type: 'text', required: true },
        { key: 'dosage', label: '用量', type: 'text', required: true },
        { key: 'use_date', label: '计划使用日期', type: 'date' },
        { key: 'reason', label: '用药原因', type: 'textarea', required: true, span: 2 },
      ], [['vet_review', '驻场兽医审批', 'ROLE_VET'], ['farm_review', '养殖场长确认', 'ROLE_FARM_MGR']]),
      this.tpl('LOGISTICS_EXCEPTION_APPROVAL', '运输异常处理', 'LOGISTICS', '运输延误、破损、签收异常的处理审批。', 'LOGISTICS_EXCEPTION_FORM', '运输异常单', [
        { key: 'shipment_no', label: '运输单号', type: 'text', required: true },
        { key: 'exception_type', label: '异常类型', type: 'select', required: true, options: [{ label: '延误', value: 'delay' }, { label: '破损', value: 'damage' }, { label: '拒收', value: 'reject' }, { label: '温控异常', value: 'temperature' }] },
        { key: 'loss_amount', label: '预估损失', type: 'amount' },
        { key: 'description', label: '异常说明', type: 'textarea', required: true, span: 2 },
      ], [['log_review', '物流负责人审批', 'ROLE_LOG_MGR'], ['finance_record', '财务备案', 'ROLE_FIN_ACCT']]),
    ];
  }

  private tpl(
    code: string,
    name: string,
    category: string,
    description: string,
    formCode: string,
    formName: string,
    fields: Array<Record<string, any>>,
    approvals: Array<[string, string, string]>,
  ): IndustryWorkflowTemplate {
    return {
      code,
      name,
      category,
      description,
      formCode,
      formName,
      formDescription: `${formName}，由系统按行业常用场景自动生成。`,
      fields,
      approvals: approvals.map(([id, approvalName, role]) => ({ id, name: approvalName, role })),
    };
  }
}
