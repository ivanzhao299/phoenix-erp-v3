import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { EntityManager } from 'typeorm';

// ── BizType 配置 ──────────────────────────────────────────────────────────────

export interface BizTypeConfig {
  /** 对应 RBAC 菜单代码（用于鉴权上下文） */
  moduleCode: string;
  /** 业务对应的数据库表（必须在白名单内，防 SQL 注入） */
  tableName: string;
  /** 审批通过后业务终态 */
  approvedStatus: string;
  /** 审批拒绝后业务终态 */
  rejectedStatus: string;
  /** 取消后业务终态（可选，不设置则不回写） */
  cancelledStatus?: string;
  /** 审批通过后的额外回调（可选，在同一事务中执行） */
  onApproved?: (bizId: string, mgr: EntityManager) => Promise<void>;
  /** 审批拒绝后的额外回调（可选） */
  onRejected?: (bizId: string, mgr: EntityManager) => Promise<void>;
  /** 取消后的额外回调（可选） */
  onCancelled?: (bizId: string, mgr: EntityManager) => Promise<void>;
}

// ── 注册表服务 ────────────────────────────────────────────────────────────────

@Injectable()
export class WorkflowBizRegistryService implements OnModuleInit {
  private readonly logger = new Logger(WorkflowBizRegistryService.name);
  private readonly registry = new Map<string, BizTypeConfig>();

  onModuleInit() {
    // 注册审批已知 bizType（采购 V2 四种业务类型）
    this.register('PR', {
      moduleCode:      'MENU_PRC2_ORDER',
      tableName:       'prc2_purchase_requests',
      approvedStatus:  'APPROVED',
      rejectedStatus:  'REJECTED',
      cancelledStatus: 'CANCELLED',
    });

    this.register('PO', {
      moduleCode:      'MENU_PRC2_ORDER',
      tableName:       'prc2_purchase_orders',
      approvedStatus:  'APPROVED',
      rejectedStatus:  'REJECTED',
      cancelledStatus: 'CANCELLED',
    });

    this.register('PAYMENT', {
      moduleCode:      'MENU_PRC2_PAYMENT',
      tableName:       'prc2_payments',
      approvedStatus:  'APPROVED',
      rejectedStatus:  'REJECTED',
      cancelledStatus: 'CANCELLED',
    });

    this.register('FUND', {
      moduleCode:      'MENU_PRC2_FUND',
      tableName:       'prc2_shareholder_funds',
      approvedStatus:  'CONFIRMED',
      rejectedStatus:  'REJECTED',
      cancelledStatus: 'VOID',
    });

    this.register('SHAREHOLDER_CONTRIBUTION', {
      moduleCode:      'MENU_FIN2_SHAREHOLDER',
      tableName:       'fin_shareholder_contributions',
      approvedStatus:  'CONFIRMED',
      rejectedStatus:  'CANCELLED',
      cancelledStatus: 'CANCELLED',
    });

    this.register('SHAREHOLDER_SETTLEMENT', {
      moduleCode:      'MENU_FIN2_SHAREHOLDER',
      tableName:       'fin_shareholder_settlements',
      approvedStatus:  'APPROVED',
      rejectedStatus:  'CANCELLED',
      cancelledStatus: 'CANCELLED',
    });

    // ── Finance V2 Phase 5 — Expense Runtime ─────────────────────────────

    this.register('EXPENSE_REQUEST', {
      moduleCode:      'MENU_FIN2_EXPENSE',
      tableName:       'fin_expense_requests',
      approvedStatus:  'APPROVED',
      rejectedStatus:  'REJECTED',
      cancelledStatus: 'CANCELLED',
      /**
       * 审批通过后：在同一事务内自动生成 fin_reimbursements（status=PENDING）。
       * 使用纯 EntityManager raw SQL，不依赖任何 Service，避免循环引用。
       */
      onApproved: async (bizId: string, mgr: EntityManager) => {
        const [exp] = await mgr.query(
          `SELECT * FROM fin_expense_requests WHERE id = $1`,
          [bizId],
        );
        if (!exp) return;

        // 已有报销记录则幂等跳过
        const [exist] = await mgr.query(
          `SELECT id FROM fin_reimbursements WHERE expense_request_id = $1 LIMIT 1`,
          [exp.id],
        );
        if (exist) return;

        // 生成 reimb_no（advisory lock 防并发冲突）
        const now    = new Date();
        const prefix = `RMB-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}-`;
        await mgr.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);
        const [maxRow] = await mgr.query(
          `SELECT MAX(reimb_no) AS max FROM fin_reimbursements WHERE reimb_no LIKE $1`,
          [`${prefix}%`],
        );
        let seq = 1;
        const maxVal: string | null = maxRow?.max ?? null;
        if (maxVal) {
          const last = parseInt(maxVal.slice(prefix.length), 10);
          if (!isNaN(last)) seq = last + 1;
        }
        const reimbNo = `${prefix}${String(seq).padStart(5, '0')}`;

        await mgr.query(`
          INSERT INTO fin_reimbursements (
            reimb_no, expense_request_id, expense_no,
            employee_id, employee_name,
            company_code, company_name,
            currency_code, reimb_amount_original, exchange_rate, reimb_amount_base, base_currency,
            status, created_at, updated_at
          ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,'PENDING',now(),now())
        `, [
          reimbNo,
          exp.id, exp.expense_no,
          exp.requester_id,
          exp.requester_name ?? '未知',
          exp.company_code,
          exp.company_name ?? null,
          exp.currency_code,
          exp.amount_original,
          exp.exchange_rate,
          exp.amount_base,
          exp.base_currency ?? 'CNY',
        ]);
      },
    });

    this.register('REIMBURSEMENT', {
      moduleCode:      'MENU_FIN2_EXPENSE',
      tableName:       'fin_reimbursements',
      approvedStatus:  'APPROVED',
      rejectedStatus:  'CANCELLED',
      cancelledStatus: 'CANCELLED',
    });

    // ── Sales V2 Phase 2 — Price Runtime ────────────────────────────────

    this.register('PRICE_BOOK_APPROVAL', {
      moduleCode:      'MENU_SALES2_PRICE',
      tableName:       'sal_price_books',
      approvedStatus:  'APPROVED',
      rejectedStatus:  'DRAFT',       // 拒绝退回草稿，允许修改后重新提交
      cancelledStatus: 'CANCELLED',
    });

    // ── Sales V2 Phase 3 — Sales Order Runtime ──────────────────────────
    // onApproved / onRejected 回调由 SalesOrdersService 在运行时注册

    this.register('SALES_ORDER', {
      moduleCode:      'MENU_SALES2_ORDER',
      tableName:       'sal_sales_orders',
      approvedStatus:  'APPROVED',
      rejectedStatus:  'REJECTED',
      cancelledStatus: 'CANCELLED',
    });

    // ── Sales V2 Phase 6 — Sales Return Runtime ──────────────────────────────
    // onApproved 回调由 ReturnOrdersService 在运行时执行（直接写 INSPECTING）

    this.register('SALES_RETURN', {
      moduleCode:      'MENU_SALES2_RETURN',
      tableName:       'sal_return_orders',
      approvedStatus:  'INSPECTING',
      rejectedStatus:  'REJECTED',
      cancelledStatus: 'CANCELLED',
    });

    // 股东资本流（Phase 3）：审批通过→APPROVED；之后由股东资金管理员手工「确认到账」→CONFIRMED 触发汇总
    this.register('SHAREHOLDER_CAPITAL', {
      moduleCode:      'MENU_SHAREHOLDER_CAPITAL',
      tableName:       'shr_capital_contributions',
      approvedStatus:  'APPROVED',
      rejectedStatus:  'CANCELLED',
      cancelledStatus: 'CANCELLED',
    });

    // ── G3-B 主数据审批运行体系：5 类主数据新增审批 ────────────────────────
    //   审批通过 → status=ACTIVE（主数据生效，可被业务引用）；拒绝 → REJECTED。
    //   onApproved/onRejected 写入 mst_audit_trail（审计联动），纯 raw SQL 防循环引用。
    const mdAuditHook = (objectType: string, table: string, codeCol: string, action: string) =>
      async (bizId: string, mgr: EntityManager) => {
        try {
          const [row] = await mgr.query(`SELECT ${codeCol} AS code FROM ${table} WHERE id = $1`, [bizId]);
          if (!row) return;
          await mgr.query(
            `INSERT INTO mst_audit_trail (object_type, object_code, action, after_json, operator)
             VALUES ($1,$2,$3,$4,$5)`,
            [objectType, row.code, action, JSON.stringify({ via: 'WORKFLOW' }), 'workflow'],
          );
        } catch { /* 审计失败不阻断审批 */ }
      };

    this.register('MD_CUSTOMER_CREATE', {
      moduleCode: 'MENU_MASTER_DATA', tableName: 'sal_customers',
      approvedStatus: 'ACTIVE', rejectedStatus: 'REJECTED',
      onApproved: mdAuditHook('CUSTOMER', 'sal_customers', 'customer_no', 'APPROVE_ACTIVE'),
      onRejected: mdAuditHook('CUSTOMER', 'sal_customers', 'customer_no', 'REJECT'),
    });
    this.register('MD_SUPPLIER_CREATE', {
      moduleCode: 'MENU_MASTER_DATA', tableName: 'prc2_suppliers',
      approvedStatus: 'ACTIVE', rejectedStatus: 'REJECTED',
      onApproved: mdAuditHook('SUPPLIER', 'prc2_suppliers', 'supplier_code', 'APPROVE_ACTIVE'),
      onRejected: mdAuditHook('SUPPLIER', 'prc2_suppliers', 'supplier_code', 'REJECT'),
    });
    this.register('MD_PROJECT_CREATE', {
      // FIX UAT-P0-Phase1 2026-06-04: 实际表名 prc2_projects（shr_projects 不存在）
      moduleCode: 'MENU_MASTER_DATA', tableName: 'prc2_projects',
      approvedStatus: 'ACTIVE', rejectedStatus: 'REJECTED',
      onApproved: mdAuditHook('PROJECT', 'prc2_projects', 'project_code', 'APPROVE_ACTIVE'),
      onRejected: mdAuditHook('PROJECT', 'prc2_projects', 'project_code', 'REJECT'),
    });
    this.register('MD_CASH_ACCOUNT_CREATE', {
      moduleCode: 'MENU_MD_BANK_ACCOUNT', tableName: 'fin_cash_accounts',
      approvedStatus: 'ACTIVE', rejectedStatus: 'REJECTED',
      onApproved: mdAuditHook('CASH_ACCOUNT', 'fin_cash_accounts', 'account_code', 'APPROVE_ACTIVE'),
      onRejected: mdAuditHook('CASH_ACCOUNT', 'fin_cash_accounts', 'account_code', 'REJECT'),
    });
    this.register('MD_BANK_ACCOUNT_CREATE', {
      // FIX UAT-P0-Phase1 2026-06-04: 实际表名 fin_bank_accounts（G5.5-C 已新建；mst_bank_accounts 不存在）
      moduleCode: 'MENU_MD_BANK_ACCOUNT', tableName: 'fin_bank_accounts',
      approvedStatus: 'ACTIVE', rejectedStatus: 'REJECTED',
      onApproved: mdAuditHook('BANK_ACCOUNT', 'fin_bank_accounts', 'bank_account_code', 'APPROVE_ACTIVE'),
      onRejected: mdAuditHook('BANK_ACCOUNT', 'fin_bank_accounts', 'bank_account_code', 'REJECT'),
    });

    // ── UAT-P0-Phase1: 补齐 G5.5-C 9 类 + G5.5-D 2 类 = 11 个 MD_*_CREATE ──
    this.register('MD_PRODUCT_CREATE', {
      moduleCode: 'MENU_MASTER_DATA', tableName: 'product_master',
      approvedStatus: 'ACTIVE', rejectedStatus: 'REJECTED',
      onApproved: mdAuditHook('PRODUCT', 'product_master', 'product_code', 'APPROVE_ACTIVE'),
      onRejected: mdAuditHook('PRODUCT', 'product_master', 'product_code', 'REJECT'),
    });
    this.register('MD_STORE_CREATE', {
      moduleCode: 'MENU_MASTER_DATA', tableName: 'mst_stores',
      approvedStatus: 'ACTIVE', rejectedStatus: 'REJECTED',
      onApproved: mdAuditHook('STORE', 'mst_stores', 'store_code', 'APPROVE_ACTIVE'),
      onRejected: mdAuditHook('STORE', 'mst_stores', 'store_code', 'REJECT'),
    });
    this.register('MD_SKU_CREATE', {
      moduleCode: 'MENU_MASTER_DATA', tableName: 'product_skus',
      approvedStatus: 'ACTIVE', rejectedStatus: 'REJECTED',
      onApproved: mdAuditHook('SKU', 'product_skus', 'sku_code', 'APPROVE_ACTIVE'),
      onRejected: mdAuditHook('SKU', 'product_skus', 'sku_code', 'REJECT'),
    });
    this.register('MD_WAREHOUSE_CREATE', {
      moduleCode: 'MENU_MASTER_DATA', tableName: 'wms_warehouses',
      approvedStatus: 'ACTIVE', rejectedStatus: 'REJECTED',
      onApproved: mdAuditHook('WAREHOUSE', 'wms_warehouses', 'warehouse_code', 'APPROVE_ACTIVE'),
      onRejected: mdAuditHook('WAREHOUSE', 'wms_warehouses', 'warehouse_code', 'REJECT'),
    });
    this.register('MD_GRADE_CREATE', {
      moduleCode: 'MENU_MASTER_DATA', tableName: 'product_grades',
      approvedStatus: 'ACTIVE', rejectedStatus: 'REJECTED',
      onApproved: mdAuditHook('GRADE', 'product_grades', 'grade_code', 'APPROVE_ACTIVE'),
      onRejected: mdAuditHook('GRADE', 'product_grades', 'grade_code', 'REJECT'),
    });
    this.register('MD_SPEC_CREATE', {
      moduleCode: 'MENU_MASTER_DATA', tableName: 'packaging_specs',
      approvedStatus: 'ACTIVE', rejectedStatus: 'REJECTED',
      onApproved: mdAuditHook('SPEC', 'packaging_specs', 'spec_code', 'APPROVE_ACTIVE'),
      onRejected: mdAuditHook('SPEC', 'packaging_specs', 'spec_code', 'REJECT'),
    });
    this.register('MD_DRIVER_CREATE', {
      moduleCode: 'MENU_MASTER_DATA', tableName: 'sal_drivers',
      approvedStatus: 'ACTIVE', rejectedStatus: 'REJECTED',
      onApproved: mdAuditHook('DRIVER', 'sal_drivers', 'driver_code', 'APPROVE_ACTIVE'),
      onRejected: mdAuditHook('DRIVER', 'sal_drivers', 'driver_code', 'REJECT'),
    });
    this.register('MD_VEHICLE_CREATE', {
      moduleCode: 'MENU_MASTER_DATA', tableName: 'sal_vehicles',
      approvedStatus: 'ACTIVE', rejectedStatus: 'REJECTED',
      onApproved: mdAuditHook('VEHICLE', 'sal_vehicles', 'vehicle_no', 'APPROVE_ACTIVE'),
      onRejected: mdAuditHook('VEHICLE', 'sal_vehicles', 'vehicle_no', 'REJECT'),
    });
    this.register('MD_ORGANIZATION_CREATE', {
      moduleCode: 'MENU_MASTER_DATA', tableName: 'sys_organizations',
      approvedStatus: 'ACTIVE', rejectedStatus: 'REJECTED',
      onApproved: mdAuditHook('ORGANIZATION', 'sys_organizations', 'org_code', 'APPROVE_ACTIVE'),
      onRejected: mdAuditHook('ORGANIZATION', 'sys_organizations', 'org_code', 'REJECT'),
    });
    this.register('MD_COMPANY_CREATE', {
      moduleCode: 'MENU_MASTER_DATA', tableName: 'sys_organizations',
      approvedStatus: 'ACTIVE', rejectedStatus: 'REJECTED',
      onApproved: mdAuditHook('COMPANY', 'sys_organizations', 'org_code', 'APPROVE_ACTIVE'),
      onRejected: mdAuditHook('COMPANY', 'sys_organizations', 'org_code', 'REJECT'),
    });
    this.register('MD_DICT_CREATE', {
      moduleCode: 'MENU_MASTER_DATA', tableName: 'sys_dict',
      approvedStatus: 'ACTIVE', rejectedStatus: 'REJECTED',
      onApproved: mdAuditHook('DICT', 'sys_dict', 'dict_code', 'APPROVE_ACTIVE'),
      onRejected: mdAuditHook('DICT', 'sys_dict', 'dict_code', 'REJECT'),
    });

    this.logger.log(
      `WorkflowBizRegistry initialized with ${this.registry.size} bizTypes: ${[...this.registry.keys()].join(', ')}`,
    );
  }

  /**
   * 注册一个新的业务类型。
   * 未来的 HR 请假、合同审批等调用此方法即可接入，无需修改 ApprovalEngine 核心代码。
   */
  register(bizType: string, config: BizTypeConfig): void {
    const code = bizType.toUpperCase();
    if (this.registry.has(code)) {
      this.logger.warn(`BizType '${code}' is already registered and will be overwritten.`);
    }
    this.registry.set(code, config);
  }

  get(bizType: string): BizTypeConfig | undefined {
    return this.registry.get(bizType.toUpperCase());
  }

  has(bizType: string): boolean {
    return this.registry.has(bizType.toUpperCase());
  }

  list(): string[] {
    return [...this.registry.keys()];
  }

  /** 获取 moduleCode（原 BIZ_MODULE_MAP） */
  getModuleCode(bizType: string): string {
    return this.get(bizType)?.moduleCode ?? 'UNKNOWN';
  }

  /** 获取审批通过状态（原 APPROVED_STATUS_MAP） */
  getApprovedStatus(bizType: string): string {
    return this.get(bizType)?.approvedStatus ?? 'APPROVED';
  }

  /** 获取拒绝状态 */
  getRejectedStatus(bizType: string): string {
    return this.get(bizType)?.rejectedStatus ?? 'REJECTED';
  }

  /** 获取取消状态 */
  getCancelledStatus(bizType: string): string | undefined {
    return this.get(bizType)?.cancelledStatus;
  }

  /** 获取数据库表名（防注入白名单） */
  getTableName(bizType: string): string | undefined {
    return this.get(bizType)?.tableName;
  }
}
