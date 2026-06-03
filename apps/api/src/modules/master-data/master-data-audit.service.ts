import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

export type MdAction = 'CREATE' | 'UPDATE' | 'FREEZE' | 'ARCHIVE' | 'RESTORE' | 'MERGE';

/**
 * MasterDataAuditService — 主数据审计日志 + 数据质量检查（G1）
 * ════════════════════════════════════════════════════════════════════════
 * · 记录所有主数据 新增/修改/冻结/归档/恢复/合并 操作（mst_audit_trail）
 * · 提供数据质量检查（重复客户/供应商、缺联系人/账户、冻结后仍被引用等）
 * 防御式：任何写入失败不抛出（审计不阻断主流程）。
 */
@Injectable()
export class MasterDataAuditService {
  private readonly logger = new Logger(MasterDataAuditService.name);

  constructor(@InjectDataSource() private readonly ds: DataSource) {}

  /** 记录一条主数据审计日志（失败不阻断业务） */
  async log(entry: {
    objectType: string; objectCode: string; action: MdAction;
    before?: unknown; after?: unknown; operator?: string; reason?: string;
  }): Promise<void> {
    try {
      await this.ds.query(
        `INSERT INTO mst_audit_trail
           (object_type, object_code, action, before_json, after_json, operator, reason)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          entry.objectType, entry.objectCode, entry.action,
          entry.before != null ? JSON.stringify(entry.before) : null,
          entry.after  != null ? JSON.stringify(entry.after)  : null,
          entry.operator ?? null, entry.reason ?? null,
        ],
      );
    } catch (e: any) {
      this.logger.warn(`[MdAudit] 审计写入失败（不阻断）：${e?.message}`);
    }
  }

  /** 查询某主数据的审计历史 */
  async history(objectType: string, objectCode: string): Promise<any[]> {
    try {
      return await this.ds.query(
        `SELECT action, before_json, after_json, operator, reason, created_at
           FROM mst_audit_trail
          WHERE object_type = $1 AND object_code = $2
          ORDER BY created_at DESC LIMIT 200`,
        [objectType, objectCode],
      );
    } catch { return []; }
  }

  /**
   * 数据质量检查 — 返回各检查项的问题数量（数据质量中心 Dashboard 数据源）。
   * 防御式：缺表/缺列的检查返回 -1（不可用），不影响其他项。
   */
  async qualityChecks(): Promise<Array<{ key: string; label: string; count: number }>> {
    const q = async (sql: string): Promise<number> => {
      try { const r = await this.ds.query(sql); return Number(r?.[0]?.cnt ?? 0); }
      catch { return -1; }
    };

    return [
      { key: 'dup_customer_phone', label: '联系电话重复的客户',
        count: await q(`SELECT COUNT(*) cnt FROM (SELECT contact_phone FROM sal_customers WHERE contact_phone IS NOT NULL AND contact_phone<>'' GROUP BY contact_phone HAVING COUNT(*)>1) x`) },
      { key: 'dup_supplier_name', label: '名称重复的供应商',
        count: await q(`SELECT COUNT(*) cnt FROM (SELECT supplier_name FROM prc2_suppliers GROUP BY supplier_name HAVING COUNT(*)>1) x`) },
      { key: 'customer_no_contact', label: '缺联系人的客户',
        count: await q(`SELECT COUNT(*) cnt FROM sal_customers WHERE (contact_name IS NULL OR contact_name='')`) },
      { key: 'supplier_no_account', label: '缺银行账户的供应商',
        count: await q(`SELECT COUNT(*) cnt FROM prc2_suppliers s WHERE NOT EXISTS (SELECT 1 FROM mst_bank_accounts b WHERE b.holder_code = s.supplier_code)`) },
      { key: 'shareholder_no_user', label: '未绑定登录账号的股东',
        count: await q(`SELECT COUNT(*) cnt FROM shr_shareholders WHERE linked_user_id IS NULL OR linked_user_id = 0`) },
      { key: 'cash_acct_no_holder', label: '未关联账户主体的资金账户',
        count: await q(`SELECT COUNT(*) cnt FROM fin_cash_accounts WHERE holder_code IS NULL OR holder_code=''`) },
    ];
  }
}
