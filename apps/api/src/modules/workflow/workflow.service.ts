import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  OnModuleInit,
} from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

type WorkflowStatus = 'RUNNING' | 'APPROVED' | 'REJECTED' | 'CANCELED';
type TaskStatus = 'TODO' | 'DONE' | 'CANCELED';
type NodeType = 'start' | 'approval' | 'condition' | 'cc' | 'end';

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

const ADMIN_ROLES = new Set(['ROLE_ADMIN', 'ROLE_SYSOPS']);

@Injectable()
export class WorkflowService implements OnModuleInit {
  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  async onModuleInit() {
    await this.ensureSchema();
  }

  async ensureSchema() {
    const ddl = [
      `CREATE TABLE IF NOT EXISTS wf_form_definition (
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
    const formData = body.form_data || {};
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

  async getInstance(id: number, user: WorkflowUser) {
    const rows = await this.em.query(`SELECT * FROM wf_instance WHERE id=$1`, [id]);
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

  async listTodo(user: WorkflowUser, query: QueryDto) {
    return this.listTasks(user, query, 'TODO');
  }

  async listDone(user: WorkflowUser, query: QueryDto) {
    return this.listTasks(user, query, 'DONE');
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
    const { limit, offset } = this.page(query);
    const rows = await this.em.query(
      `SELECT * FROM wf_data_source
       WHERE ($1::text IS NULL OR status=$1)
       ORDER BY id DESC LIMIT $2 OFFSET $3`,
      [query.status || null, limit, offset],
    );
    return { code: 200, data: rows, total: rows.length };
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
    return { code: 200, data: rows[0] };
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
    return { code: 200, data: rows[0] };
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
      const valueField = String(config.valueField || 'id');
      const labelField = String(config.labelField || valueField);
      this.assertIdentifier(table);
      this.assertIdentifier(valueField);
      this.assertIdentifier(labelField);
      const rows = await this.em.query(
        `SELECT "${valueField}" AS value, "${labelField}" AS label FROM "${table}" LIMIT 200`,
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
    const edge = edges.find(e => !e.condition || this.evalCondition(e.condition, variables));
    return edge ? graph.nodes.find(n => n.id === edge.to) : null;
  }

  private evalCondition(rule: ConditionRule, variables: Record<string, any>) {
    if (!rule || !rule.field || !rule.operator) return true;
    const actual = variables[rule.field];
    const expected = rule.value;
    switch (rule.operator) {
      case '==': return String(actual) === String(expected);
      case '!=': return String(actual) !== String(expected);
      case '>': return Number(actual) > Number(expected);
      case '>=': return Number(actual) >= Number(expected);
      case '<': return Number(actual) < Number(expected);
      case '<=': return Number(actual) <= Number(expected);
      case 'in': return Array.isArray(expected) && expected.map(String).includes(String(actual));
      case 'notIn': return Array.isArray(expected) && !expected.map(String).includes(String(actual));
      case 'contains': return String(actual ?? '').includes(String(expected ?? ''));
      default: return false;
    }
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
      `SELECT t.*, i.title, i.instance_no, i.status AS instance_status, i.started_at, i.starter_name
       FROM wf_task t
       JOIN wf_instance i ON i.id=t.instance_id
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

  private async assertInstanceVisible(instanceId: number, user: WorkflowUser) {
    if (this.isAdmin(user)) return;
    const rows = await this.em.query(
      `SELECT 1 FROM wf_instance i
       WHERE i.id=$1 AND (i.starter_id=$2 OR EXISTS (
         SELECT 1 FROM wf_task t
         WHERE t.instance_id=i.id
           AND (t.assignee_user_id=$2 OR t.assignee_role_code = ANY($3::text[]))
       ))`,
      [instanceId, user.userId || 0, this.userRoles(user)],
    );
    if (!rows[0]) throw new ForbiddenException('workflow instance not visible');
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
    const graph = typeof input === 'string' ? JSON.parse(input) : input;
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const edges = Array.isArray(graph.edges) ? graph.edges : [];
    if (nodes.length === 0) throw new BadRequestException('graph.nodes required');
    if (!nodes.some((n: GraphNode) => n.type === 'start')) throw new BadRequestException('graph missing start node');
    for (const node of nodes) {
      if (!node.id || !node.type) throw new BadRequestException('node id/type required');
      if (!['start', 'approval', 'condition', 'cc', 'end'].includes(node.type)) {
        throw new BadRequestException(`unsupported node type: ${node.type}`);
      }
    }
    for (const edge of edges) {
      if (!edge.from || !edge.to) throw new BadRequestException('edge from/to required');
    }
    return { nodes, edges };
  }

  private normalizeFormSchema(input: any) {
    const schema = typeof input === 'string' ? JSON.parse(input) : input;
    if (!Array.isArray(schema.fields)) throw new BadRequestException('schema.fields required');
    return schema;
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
    const dsCount = await this.em.query(`SELECT COUNT(*)::int AS count FROM wf_data_source`);
    if (Number(dsCount[0]?.count || 0) === 0) {
      await this.em.query(
        `INSERT INTO wf_data_source (code, name, source_type, config_json)
         VALUES
           ('SYS_DICT_APPROVAL','审批字典','DICT','{"dict_type":"APPROVAL"}'::jsonb),
           ('MST_STORES','门店列表','TABLE','{"table":"mst_stores","valueField":"store_code","labelField":"store_name"}'::jsonb),
           ('MST_PRODUCTS','产品列表','TABLE','{"table":"mst_products","valueField":"product_code","labelField":"product_name"}'::jsonb)
         ON CONFLICT (code) DO NOTHING`,
      );
    }

    const defCount = await this.em.query(`SELECT COUNT(*)::int AS count FROM wf_definition WHERE code='EXPENSE_APPROVAL'`);
    if (Number(defCount[0]?.count || 0) > 0) return;

    const form = await this.em.query(
      `INSERT INTO wf_form_definition (code, name, description, category)
       VALUES ('EXPENSE_FORM','费用报销表单','工作流默认示例表单','FINANCE')
       ON CONFLICT (code) DO UPDATE SET updated_at=CURRENT_TIMESTAMP
       RETURNING id`,
    );
    const formId = form[0].id;
    const formVersion = await this.em.query(
      `INSERT INTO wf_form_version (form_id, version_no, status, schema_json, published_at)
       VALUES ($1,1,'PUBLISHED',$2::jsonb,CURRENT_TIMESTAMP)
       ON CONFLICT (form_id, version_no) DO UPDATE SET schema_json=EXCLUDED.schema_json
       RETURNING id`,
      [formId, JSON.stringify({
        fields: [
          { key: 'amount', label: '申请金额', type: 'amount', required: true },
          { key: 'reason', label: '报销事由', type: 'textarea', required: true },
          { key: 'store_code', label: '门店', type: 'reference', dataSource: 'MST_STORES' },
        ],
      })],
    );
    await this.em.query(`UPDATE wf_form_definition SET status='ACTIVE', current_version_id=$2 WHERE id=$1`, [formId, formVersion[0].id]);

    const def = await this.em.query(
      `INSERT INTO wf_definition (code, name, description, category, status)
       VALUES ('EXPENSE_APPROVAL','费用报销审批','默认示例：发起人提交后由财务角色审批','FINANCE','ACTIVE')
       RETURNING id`,
    );
    const graph: WorkflowGraph = {
      nodes: [
        { id: 'start', type: 'start', name: '开始' },
        { id: 'fin_approval', type: 'approval', name: '财务审批', config: { assigneeType: 'ROLE', roles: ['ROLE_FIN_ACCT'] } },
        { id: 'end', type: 'end', name: '结束' },
      ],
      edges: [
        { from: 'start', to: 'fin_approval' },
        { from: 'fin_approval', to: 'end' },
      ],
    };
    const version = await this.em.query(
      `INSERT INTO wf_definition_version
         (definition_id, version_no, status, graph_json, form_version_id, published_at)
       VALUES ($1,1,'PUBLISHED',$2::jsonb,$3,CURRENT_TIMESTAMP)
       RETURNING id`,
      [def[0].id, JSON.stringify(graph), formVersion[0].id],
    );
    await this.em.query(`UPDATE wf_definition SET current_version_id=$2 WHERE id=$1`, [def[0].id, version[0].id]);
  }
}
