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
