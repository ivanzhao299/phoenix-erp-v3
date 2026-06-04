import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

export interface DictCoverageReport {
  totalKnownDictTypes: number;
  activeDictTypes: number;
  missingDictTypes: string[];
  emptyDictTypes: string[];
  duplicateCodes: number;
  totalEntries: number;
  activeEntries: number;
  coverageRate: number;     // 0-1
  score: number;            // 0-100
  details: Array<{
    dictType: string;
    status: 'ACTIVE' | 'EMPTY' | 'MISSING';
    entryCount: number;
    activeCount: number;
  }>;
  asOf: string;
}

export interface DictDependencyMap {
  dependencies: Array<{
    dictType: string;
    referencedByDomain: string;
    referencedInCode: number;  // 估算前端 DictSelect 引用次数
  }>;
  asOf: string;
}

/**
 * G5.5-D — 字典治理 service
 *
 * 1. 全集团已知应植入的 dict_type 清单（G2/G4-A/B/C/D/E + G5.5-D 累计 25+ 类）
 * 2. 实际 sys_dict 中的覆盖率
 * 3. 失效/重复/缺失字典
 * 4. 字典引用依赖图（dict_type → 业务域）
 */
@Injectable()
export class DictGovernanceService {
  /**
   * 全部应植入的 dict_type 清单 + 业务域映射
   * 来源：搜代码 dictType="..." 引用 + 各阶段 migrations 种子
   */
  private readonly KNOWN_DICT_TYPES: Array<{ dictType: string; domain: string }> = [
    // SYS / 通用
    { dictType: 'SYS_CURRENCY',           domain: 'system' },
    { dictType: 'SYS_ORG_LEVEL',          domain: 'organization' },
    // 采购（G4-B + G2）
    { dictType: 'PRC_PAYMENT_METHOD',     domain: 'procurement' },
    { dictType: 'PRC_PURCHASE_TYPE',      domain: 'procurement' },
    { dictType: 'PRC_URGENCY',            domain: 'procurement' },
    { dictType: 'PRC_QUALITY_STATUS',     domain: 'procurement' },
    // 财务（G4-A）
    { dictType: 'FIN_PAYER_TYPE',         domain: 'finance' },
    { dictType: 'FIN_FUND_NATURE',        domain: 'finance' },
    { dictType: 'FIN_EXPENSE_TYPE',       domain: 'finance' },
    { dictType: 'FIN_RECEIPT_METHOD',     domain: 'finance' },
    { dictType: 'FIN_CONTRIBUTION_TYPE',  domain: 'finance' },
    // 销售（G4-C）
    { dictType: 'SAL_ORDER_TYPE',         domain: 'sales' },
    { dictType: 'SAL_CHANNEL',            domain: 'sales' },
    { dictType: 'SAL_FULFILLMENT_TYPE',   domain: 'sales' },
    { dictType: 'SAL_RETURN_REASON',      domain: 'sales' },
    { dictType: 'SAL_PRICE_TYPE',         domain: 'sales' },
    { dictType: 'SAL_SETTLEMENT_METHOD',  domain: 'sales' },
    { dictType: 'SAL_PAY_METHOD',         domain: 'sales' },
    { dictType: 'SAL_DELIVERY_EXCEPTION', domain: 'sales' },
    // 库存（G4-D）
    { dictType: 'INV_INBOUND_TYPE',       domain: 'inventory' },
    { dictType: 'INV_OUTBOUND_TYPE',      domain: 'inventory' },
    { dictType: 'INV_TRANSFER_REASON',    domain: 'inventory' },
    { dictType: 'INV_LOSS_REASON',        domain: 'inventory' },
    { dictType: 'INV_COUNT_TYPE',         domain: 'inventory' },
    { dictType: 'INV_STOCK_STATUS',       domain: 'inventory' },
    // 包装/养殖（G2 + G4-E）
    { dictType: 'PKG_PACK_LINE',          domain: 'packaging' },
    { dictType: 'PKG_SHIFT',              domain: 'packaging' },
    { dictType: 'PKG_EGG_GRADE',          domain: 'packaging' },
    { dictType: 'PKG_EGG_DEFECT',         domain: 'packaging' },
    { dictType: 'PKG_DEFECT',             domain: 'packaging' },
    { dictType: 'PKG_ANOMALY_REASON',     domain: 'packaging' },
    { dictType: 'PKG_EXCEPTION_TYPE',     domain: 'packaging' },
    { dictType: 'BRD_HOUSE_TYPE',         domain: 'breeding' },
    { dictType: 'BRD_FLOCK_STATUS',       domain: 'breeding' },
  ];

  constructor(@InjectEntityManager() private readonly em: EntityManager) {}

  private async safe<T = any>(sql: string): Promise<T[]> {
    try { return await this.em.query(sql); } catch { return []; }
  }

  async coverage(): Promise<DictCoverageReport> {
    const allTypes = await this.safe<{ dict_type: string }>(
      `SELECT DISTINCT dict_type FROM sys_dict WHERE dict_type IS NOT NULL`,
    );
    const allSet = new Set(allTypes.map(r => r.dict_type));

    const activeTypes = await this.safe<{ dict_type: string }>(
      `SELECT DISTINCT dict_type FROM sys_dict WHERE COALESCE(status,'ACTIVE')='ACTIVE'`,
    );
    const activeSet = new Set(activeTypes.map(r => r.dict_type));

    const totalEntriesRows = await this.safe<{ c: string }>(`SELECT COUNT(*)::text AS c FROM sys_dict`);
    const totalEntries = parseInt(totalEntriesRows[0]?.c ?? '0', 10);

    const activeEntriesRows = await this.safe<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM sys_dict WHERE COALESCE(status,'ACTIVE')='ACTIVE'`,
    );
    const activeEntries = parseInt(activeEntriesRows[0]?.c ?? '0', 10);

    const dupRows = await this.safe<{ c: string }>(
      `SELECT COUNT(*)::text AS c FROM (
         SELECT dict_type, dict_code FROM sys_dict
           GROUP BY dict_type, dict_code HAVING COUNT(*)>1
       ) x`,
    );
    const duplicateCodes = parseInt(dupRows[0]?.c ?? '0', 10);

    // 每个 dict_type 的详细统计
    const counts = await this.safe<{ dict_type: string; total: string; active: string }>(
      `SELECT dict_type,
              COUNT(*)::text AS total,
              COUNT(*) FILTER (WHERE COALESCE(status,'ACTIVE')='ACTIVE')::text AS active
         FROM sys_dict GROUP BY dict_type`,
    );
    const countMap = new Map<string, { total: number; active: number }>();
    for (const c of counts) {
      countMap.set(c.dict_type, { total: parseInt(c.total, 10), active: parseInt(c.active, 10) });
    }

    const details: DictCoverageReport['details'] = [];
    for (const k of this.KNOWN_DICT_TYPES) {
      const c = countMap.get(k.dictType);
      if (!c) {
        details.push({ dictType: k.dictType, status: 'MISSING', entryCount: 0, activeCount: 0 });
      } else if (c.active === 0) {
        details.push({ dictType: k.dictType, status: 'EMPTY', entryCount: c.total, activeCount: 0 });
      } else {
        details.push({ dictType: k.dictType, status: 'ACTIVE', entryCount: c.total, activeCount: c.active });
      }
    }

    const missingDictTypes = details.filter(d => d.status === 'MISSING').map(d => d.dictType);
    const emptyDictTypes   = details.filter(d => d.status === 'EMPTY').map(d => d.dictType);
    const coverageRate = (this.KNOWN_DICT_TYPES.length - missingDictTypes.length) / this.KNOWN_DICT_TYPES.length;

    // 评分：覆盖率 70 + 完整性 20 + 无重复 10
    const completenessPenalty = emptyDictTypes.length / Math.max(1, this.KNOWN_DICT_TYPES.length);
    const dupPenalty = totalEntries > 0 ? Math.min(1, duplicateCodes / totalEntries) : 0;
    const score = Math.max(0, Math.min(100,
      Math.round(coverageRate * 70 + (1 - completenessPenalty) * 20 + (1 - dupPenalty) * 10),
    ));

    return {
      totalKnownDictTypes: this.KNOWN_DICT_TYPES.length,
      activeDictTypes: activeSet.size,
      missingDictTypes,
      emptyDictTypes,
      duplicateCodes,
      totalEntries,
      activeEntries,
      coverageRate: Math.round(coverageRate * 1000) / 1000,
      score,
      details,
      asOf: new Date().toISOString(),
    };
  }

  async dependencyMap(): Promise<DictDependencyMap> {
    // 静态依赖图（基于代码索引；后续可改为运行时 grep）
    const dependencies = this.KNOWN_DICT_TYPES.map(k => ({
      dictType: k.dictType,
      referencedByDomain: k.domain,
      // 估算引用：每个 dict_type 在前端 DictSelect 中至少 1 处使用，常用类（CURRENCY/STATUS）多次
      referencedInCode: ['SYS_CURRENCY','INV_STOCK_STATUS','PRC_PAYMENT_METHOD'].includes(k.dictType) ? 5 : 1,
    }));
    return { dependencies, asOf: new Date().toISOString() };
  }
}
