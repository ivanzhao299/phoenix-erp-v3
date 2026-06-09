import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

export interface DictHealthReport {
  score: number;
  totalDictTypes: number;
  activeDictTypes: number;
  totalEntries: number;
  activeEntries: number;
  duplicateCodes: number;          // 同 dict_type 下重复 dict_code
  emptyDictTypes: number;          // 引用的 dict_type 在 sys_dict 中无任何 ACTIVE 条目
  knownReferencedDictTypes: number;
  coverageRate: number;            // 已植入的引用 / 应植入的引用
  issues: Array<{ dictType: string; type: string; severity: 'LOW'|'MEDIUM'|'HIGH'; count: number; message: string }>;
  asOf: string;
}

/**
 * G5 — 字典健康
 *
 * 字典覆盖率 = 已植入引用 dict_type / 全部已知引用 dict_type
 *
 * 已知引用 dict_type 列表来自 G2/G4-A/B/C/D/E 阶段引入的所有 dict_type（共 22 类）。
 */
@Injectable()
export class DictHealthService {
  // 全部应植入的 dict_type 清单（G2 + G4 系列累计 22 类）
  // 来源：搜代码 `dictType="..."` 引用 + 各阶段 migrations 种子
  private readonly KNOWN_REFERENCED_DICT_TYPES = [
    // SYS / 通用
    'SYS_CURRENCY', 'SYS_ORG_LEVEL',
    // 采购 G4-B + G2
    'PRC_PAYMENT_METHOD', 'PRC_PURCHASE_TYPE', 'PRC_URGENCY', 'PRC_QUALITY_STATUS',
    // 财务 G4-A
    'FIN_PAYER_TYPE', 'FIN_FUND_NATURE', 'FIN_EXPENSE_TYPE',
    'FIN_RECEIPT_METHOD', 'FIN_CONTRIBUTION_TYPE',
    // 销售 G4-C
    'SAL_ORDER_TYPE', 'SAL_CHANNEL', 'SAL_FULFILLMENT_TYPE', 'SAL_RETURN_REASON',
    'SAL_PRICE_TYPE', 'SAL_SETTLEMENT_METHOD', 'SAL_PAY_METHOD', 'SAL_DELIVERY_EXCEPTION',
    // 库存 G4-D
    'INV_INBOUND_TYPE', 'INV_OUTBOUND_TYPE', 'INV_TRANSFER_REASON',
    'INV_LOSS_REASON', 'INV_COUNT_TYPE', 'INV_STOCK_STATUS',
    // 包装 / 养殖 G2 + G4-E
    // G65：移除 PKG_EGG_GRADE（已迁 product_grades 主数据，不再是字典）
    //      移除 PKG_EGG_DEFECT（幻影：真字典是 PKG_DEFECT，避免恒报 MISSING 假阳性）
    'PKG_PACK_LINE', 'PKG_SHIFT',
    'PKG_DEFECT', 'PKG_ANOMALY_REASON', 'PKG_EXCEPTION_TYPE',
    'BRD_HOUSE_TYPE', 'BRD_FLOCK_STATUS',
  ];

  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  private async safe<T = any>(sql: string, params: any[] = []): Promise<T[]> {
    try { return await this.em.query(sql, params); } catch (e: any) { console.error("[catch-audit] safe() SQL failed:", e?.message); return []; }
  }

  async compute(): Promise<DictHealthReport> {
    const issues: DictHealthReport['issues'] = [];

    const dictTypesRows = await this.safe<{ dict_type: string }>(
      `SELECT DISTINCT dict_type FROM sys_dict`,
    );
    const allTypes = dictTypesRows.map(r => r.dict_type).filter(Boolean);

    const activeTypesRows = await this.safe<{ dict_type: string }>(
      `SELECT DISTINCT dict_type FROM sys_dict WHERE COALESCE(status,'ACTIVE')='ACTIVE'`,
    );
    const activeTypes = activeTypesRows.map(r => r.dict_type);
    const activeTypeSet = new Set(activeTypes);

    const totalEntriesRows = await this.safe<{ c: string }>(`SELECT COUNT(*)::text AS c FROM sys_dict`);
    const totalEntries = parseInt(totalEntriesRows[0]?.c ?? '0', 10);

    const activeEntriesRows = await this.safe<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM sys_dict WHERE COALESCE(status,'ACTIVE')='ACTIVE'`,
    );
    const activeEntries = parseInt(activeEntriesRows[0]?.c ?? '0', 10);

    // 同 dict_type 下重复 dict_code（hard issue）
    const dupRows = await this.safe<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM (
         SELECT dict_type, dict_code FROM sys_dict GROUP BY dict_type, dict_code HAVING COUNT(*)>1
       ) x`,
    );
    const duplicateCodes = parseInt(dupRows[0]?.c ?? '0', 10);
    if (duplicateCodes > 0) {
      issues.push({
        dictType: '(ANY)', type: 'DUPLICATE_CODE', severity: 'HIGH', count: duplicateCodes,
        message: `${duplicateCodes} 组同 dict_type 下的 dict_code 重复`,
      });
    }

    // 覆盖率 = 已植入的引用 dict_type 数 / 应植入总数
    const referenced = this.KNOWN_REFERENCED_DICT_TYPES;
    const missingTypes = referenced.filter(t => !activeTypeSet.has(t));
    const coverageRate = Math.round(((referenced.length - missingTypes.length) / referenced.length) * 100) / 100;
    for (const t of missingTypes) {
      issues.push({
        dictType: t, type: 'MISSING_DICT_TYPE', severity: 'HIGH', count: 1,
        message: `应植入字典 ${t} 在 sys_dict 中无任何 ACTIVE 条目`,
      });
    }

    // 失效字典：已知引用但全部 status=INACTIVE
    const emptyTypes = await this.safe<{ dict_type: string }>(
      `SELECT dict_type FROM sys_dict
         GROUP BY dict_type
         HAVING COUNT(*) FILTER (WHERE COALESCE(status,'ACTIVE')='ACTIVE') = 0`,
    );
    const emptyDictTypes = emptyTypes.length;
    for (const e of emptyTypes) {
      issues.push({
        dictType: e.dict_type, type: 'INACTIVE_DICT_TYPE', severity: 'MEDIUM', count: 1,
        message: `字典 ${e.dict_type} 全部条目为 INACTIVE`,
      });
    }

    // 评分：覆盖率 × 80 + (1 - 重复率) × 20
    const dupRate = totalEntries > 0 ? duplicateCodes / totalEntries : 0;
    const score = Math.round(coverageRate * 80 + (1 - dupRate) * 20);

    return {
      score: Math.max(0, Math.min(100, score)),
      totalDictTypes: allTypes.length,
      activeDictTypes: activeTypes.length,
      totalEntries,
      activeEntries,
      duplicateCodes,
      emptyDictTypes,
      knownReferencedDictTypes: referenced.length,
      coverageRate,
      issues,
      asOf: new Date().toISOString(),
    };
  }
}
