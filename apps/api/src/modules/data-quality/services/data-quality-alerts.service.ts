import { Injectable } from '@nestjs/common';
import { MasterDataHealthService } from './master-data-health.service';
import { DictHealthService } from './dict-health.service';
import { DataScopeAuditService } from './data-scope-audit.service';
import { TraceabilityHealthService } from './traceability-health.service';
import { InventoryHealthService } from './inventory-health.service';
import { WorkflowHealthService } from './workflow-health.service';

export interface DataQualityAlert {
  source: string;       // master-data / dict / datascope / traceability / inventory / workflow
  type: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  count: number;
  message: string;
  recommendation: string;
}

/**
 * G5 — 数据质量告警中心
 *
 * 聚合 6 个健康服务的高严重度问题为统一告警流，可对接消息中心 / 邮件 / 系统通知。
 */
@Injectable()
export class DataQualityAlertsService {
  constructor(
    private readonly md:   MasterDataHealthService,
    private readonly dict: DictHealthService,
    private readonly ds:   DataScopeAuditService,
    private readonly trace: TraceabilityHealthService,
    private readonly inv:  InventoryHealthService,
    private readonly wf:   WorkflowHealthService,
  ) {}

  async list(): Promise<DataQualityAlert[]> {
    const alerts: DataQualityAlert[] = [];

    const md = await this.md.compute();
    for (const i of md.issues) {
      if (i.severity === 'HIGH' || i.severity === 'MEDIUM') {
        alerts.push({
          source: 'master-data', type: i.type, severity: i.severity, count: i.count,
          message: i.message,
          recommendation: i.type === 'DUPLICATE_CODE'
            ? '到主数据中心合并重复编码或停用其中之一'
            : i.type === 'FROZEN_REFERENCED'
              ? '冻结主数据被引用 — 检查引用源是否需先撤回'
              : '补全缺失字段或下沉至主数据中心修订',
        });
      }
    }

    const dict = await this.dict.compute();
    for (const i of dict.issues) {
      if (i.severity === 'HIGH') {
        alerts.push({
          source: 'dict', type: i.type, severity: i.severity, count: i.count,
          message: i.message,
          recommendation: i.type === 'MISSING_DICT_TYPE'
            ? '执行对应 migrations 阶段种子 SQL 植入字典'
            : i.type === 'DUPLICATE_CODE'
              ? '到字典中心去重 dict_code'
              : '检查字典生命周期，必要时启用或归档',
        });
      }
    }

    const ds = await this.ds.compute();
    for (const r of ds.risks) {
      alerts.push({
        source: 'datascope', type: r.type, severity: r.severity, count: r.count,
        message: r.message,
        recommendation: r.type === 'USER_WITHOUT_ORG_ASSIGNMENT'
          ? '到组织管理为用户分配 sys_user_orgs'
          : '清理孤儿 scope 记录',
      });
    }

    const trace = await this.trace.compute();
    if (trace.brokenChainCount > 0) {
      alerts.push({
        source: 'traceability', type: 'BROKEN_CHAIN',
        severity: trace.brokenChainCount > 10 ? 'HIGH' : 'MEDIUM',
        count: trace.brokenChainCount,
        message: `${trace.brokenChainCount} 条 batch 追溯链断裂`,
        recommendation: '检查 wms.service 与 packaging.service 是否绕过 inv_ledger 写入',
      });
    }
    if (trace.orphanBatches > 0) {
      alerts.push({
        source: 'traceability', type: 'ORPHAN_BATCH',
        severity: 'MEDIUM', count: trace.orphanBatches,
        message: `${trace.orphanBatches} 个孤儿批次（无 ledger 入账）`,
        recommendation: '回滚批次或补登 ledger',
      });
    }

    const inv = await this.inv.compute();
    if (inv.negativeQty > 0) {
      alerts.push({
        source: 'inventory', type: 'NEGATIVE_QTY',
        severity: 'HIGH', count: inv.negativeQty,
        message: `${inv.negativeQty} 个批次出现负库存`,
        recommendation: '立刻盘点 + 补单 + 排查超发原因',
      });
    }
    if (inv.longStanding.quarantineDays30Plus > 0) {
      alerts.push({
        source: 'inventory', type: 'QUARANTINE_LONG_STANDING',
        severity: 'MEDIUM', count: inv.longStanding.quarantineDays30Plus,
        message: `${inv.longStanding.quarantineDays30Plus} 个批次 QUARANTINE 滞留 ≥30 天`,
        recommendation: '组织质检复判，转 AVAILABLE 或走报损',
      });
    }
    if (inv.longStanding.reservedDays7Plus > 0) {
      alerts.push({
        source: 'inventory', type: 'RESERVED_LONG_STANDING',
        severity: 'MEDIUM', count: inv.longStanding.reservedDays7Plus,
        message: `${inv.longStanding.reservedDays7Plus} 个批次 RESERVED 滞留 ≥7 天`,
        recommendation: '检查未发货销售单是否需要取消或加急发货',
      });
    }

    const wf = await this.wf.compute();
    if (wf.overdue > 0) {
      alerts.push({
        source: 'workflow', type: 'APPROVAL_OVERDUE',
        severity: wf.overdue > 5 ? 'HIGH' : 'MEDIUM',
        count: wf.overdue,
        message: `${wf.overdue} 个审批实例超时（>3 天）`,
        recommendation: '到审批中心催办或转交',
      });
    }

    return alerts;
  }
}
