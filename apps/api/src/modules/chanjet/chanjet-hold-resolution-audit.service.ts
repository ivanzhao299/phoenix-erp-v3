import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource } from 'typeorm';
import {
  ChanjetErpMasterBusinessReviewService,
  ChanjetErpMasterReviewCandidate,
} from './chanjet-erp-master-business-review.service';

export type ChanjetHoldDisposition =
  | 'ERP_AUTO_APPLY_ELIGIBLE'
  | 'ERP_POLICY_REQUIRED'
  | 'NO_ERP_MASTER_REQUIRED'
  | 'CHANJET_CHANGE_PROPOSAL'
  | 'CROSS_SYSTEM_REVIEW_REQUIRED'
  | 'KEEP_HOLD';

export type ChanjetAuthorityOwner =
  | 'CHANJET_FINANCE'
  | 'ERP_OPERATIONS'
  | 'SHARED_MASTER_POLICY';

type SourceRow = {
  id: string;
  raw_data: Record<string, unknown> | null;
};

type StableUomRatio = {
  bookId: string;
  productCode: string;
  productName: string;
  sourceUom: string;
  baseUom: string;
  observationCount: number;
  conversionFactor: number;
  minFactor: number;
  maxFactor: number;
};

type ChangeProposal = {
  field: string;
  currentValue: string;
  proposedValue: string;
  reason: string;
  rollbackValue: string;
  approvalRequired: true;
};

export type ChanjetHoldResolutionItem = {
  mappingId: string;
  mappingType: string;
  bookId: string;
  companyCode: string;
  chanjetId: string;
  chanjetCode: string;
  chanjetName: string;
  authorityOwner: ChanjetAuthorityOwner;
  disposition: ChanjetHoldDisposition;
  confidence: number;
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  sourceQualityIssues: string[];
  evidence: string[];
  blockers: string[];
  recommendedAction: string;
  autoApplyEligible: boolean;
  requiresChanjetApproval: boolean;
  chanjetChangeProposal: ChangeProposal | null;
  uomPolicyCandidates: StableUomRatio[];
};

export type ChanjetHoldResolutionAudit = {
  generatedAt: string;
  sourceReviewHash: string;
  auditHash: string;
  decision: 'OPTIMIZATION_CANDIDATES_READY' | 'HOLD';
  summary: {
    total: number;
    trueHold: number;
    autoApplyEligible: number;
    noErpMasterRequired: number;
    chanjetChangeProposals: number;
    policyRequired: number;
    crossSystemReviewRequired: number;
    automaticResolutionCoveragePercent: number;
    byMappingType: Record<string, Record<ChanjetHoldDisposition, number>>;
    byDisposition: Record<ChanjetHoldDisposition, number>;
  };
  items: ChanjetHoldResolutionItem[];
  recommendedCanary: {
    mappingId: string;
    bookId: string;
    field: string;
    currentValue: string;
    proposedValue: string;
    reason: string;
    approvalRequired: true;
  } | null;
  guardrails: {
    readonlyAudit: true;
    chanjetWrite: false;
    erpBusinessFactWrite: false;
    financeBalanceWrite: false;
    inventoryFactWrite: false;
    externalChangeRequiresExplicitApproval: true;
    oneRowCanaryOnly: true;
    dualReadbackRequired: true;
    rollbackRequired: true;
  };
};

const DISPOSITIONS: ChanjetHoldDisposition[] = [
  'ERP_AUTO_APPLY_ELIGIBLE',
  'ERP_POLICY_REQUIRED',
  'NO_ERP_MASTER_REQUIRED',
  'CHANJET_CHANGE_PROPOSAL',
  'CROSS_SYSTEM_REVIEW_REQUIRED',
  'KEEP_HOLD',
];

const HIGH_CONFIDENCE_NAME_REPAIRS: Record<string, { value: string; reason: string }> = {
  '阿莫西林可溶性分': {
    value: '阿莫西林可溶性粉',
    reason: '药品剂型文字错误；“可溶性粉”为规范剂型名称。',
  },
  '新谓康': {
    value: '新胃康',
    reason: '同一好业财数据集中已存在规范名称“新胃康”，当前名称为同音错字。',
  },
  '治梅净': {
    value: '治霉净',
    reason: '同一好业财数据集中已存在规范名称“治霉净”，当前名称与用途不符。',
  },
};

function emptyDispositionCounts(): Record<ChanjetHoldDisposition, number> {
  return Object.fromEntries(DISPOSITIONS.map((value) => [value, 0])) as Record<ChanjetHoldDisposition, number>;
}

function round(value: number, precision = 2): number {
  const factor = 10 ** precision;
  return Math.round(value * factor) / factor;
}

function evidenceNumber(evidence: string[], prefix: string): number {
  const line = evidence.find((item) => item.startsWith(prefix));
  const value = line?.slice(prefix.length).trim();
  return Number(value || 0);
}

function evidenceValue(evidence: string[], prefix: string): string {
  return evidence.find((item) => item.startsWith(prefix))?.slice(prefix.length).trim() || '';
}

function sourceRaw(source: SourceRow | undefined): Record<string, unknown> {
  return source?.raw_data && typeof source.raw_data === 'object' ? source.raw_data : {};
}

function canonicalUom(value: unknown): string {
  const unit = String(value || '').trim();
  if (/^(kg|KG|公斤|千克)$/.test(unit)) return '公斤';
  if (/^(pcs?|PCS?|枚)$/.test(unit)) return '枚';
  if (/^(l|L|升|公升)$/.test(unit)) return '升';
  return unit;
}

function productDomain(name: string): 'LIVESTOCK' | 'FEED' | 'PACKAGING' | 'PROCESSED' | 'MEDICINE' | 'OTHER' {
  if (/^(蛋鸡|公鸡|小公鸡|雏鸡|母鸡|小鸡苗|小母鸡)$/.test(name)) return 'LIVESTOCK';
  if (/料|煤炭|玉米|豆粕|米糠|麸皮|石粉/.test(name)) return 'FEED';
  if (/筐|框|蛋托|包装|标签|胶带/.test(name)) return 'PACKAGING';
  if (/烧鸡|咸鸡蛋|变蛋/.test(name)) return 'PROCESSED';
  if (/苗|肽|霉素|环素|菌素|沙星|头孢|卡巴|葡萄糖|注射液|口服液|可溶性|黄芪|氟苯|清霉|治霉|胃康|多维|消毒/.test(name)) {
    return 'MEDICINE';
  }
  return 'OTHER';
}

@Injectable()
export class ChanjetHoldResolutionAuditService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly businessReview: ChanjetErpMasterBusinessReviewService,
  ) {}

  async audit(): Promise<ChanjetHoldResolutionAudit> {
    const plan = await this.businessReview.plan();
    const holds = plan.candidates.filter((candidate) => candidate.decision === 'HOLD');
    const [sourceRows, uomRatios] = await Promise.all([
      this.loadSourceRows(holds.map((item) => item.mappingId)),
      this.loadStableUomRatios(),
    ]);
    const sourceById = new Map(sourceRows.map((row) => [row.id, row]));
    const items = holds.map((candidate) => this.classify(
      candidate,
      sourceById.get(candidate.mappingId),
      uomRatios,
    ));
    const byDisposition = emptyDispositionCounts();
    const byMappingType: Record<string, Record<ChanjetHoldDisposition, number>> = {};
    for (const item of items) {
      byDisposition[item.disposition] += 1;
      byMappingType[item.mappingType] ||= emptyDispositionCounts();
      byMappingType[item.mappingType][item.disposition] += 1;
    }
    const resolvedWithoutGuessing = items.filter((item) => (
      item.disposition === 'ERP_AUTO_APPLY_ELIGIBLE'
      || item.disposition === 'NO_ERP_MASTER_REQUIRED'
      || item.disposition === 'CHANJET_CHANGE_PROPOSAL'
    )).length;
    const canary = items.find((item) => item.chanjetChangeProposal && item.confidence >= 0.98);
    const canonical = items.map((item) => ({
      mappingId: item.mappingId,
      disposition: item.disposition,
      confidence: item.confidence,
      proposal: item.chanjetChangeProposal,
      policies: item.uomPolicyCandidates,
    }));
    return {
      generatedAt: new Date().toISOString(),
      sourceReviewHash: plan.reviewHash,
      auditHash: createHash('sha256').update(JSON.stringify(canonical)).digest('hex'),
      decision: items.some((item) => item.chanjetChangeProposal || item.autoApplyEligible)
        ? 'OPTIMIZATION_CANDIDATES_READY'
        : 'HOLD',
      summary: {
        total: items.length,
        trueHold: byDisposition.KEEP_HOLD,
        autoApplyEligible: byDisposition.ERP_AUTO_APPLY_ELIGIBLE,
        noErpMasterRequired: byDisposition.NO_ERP_MASTER_REQUIRED,
        chanjetChangeProposals: byDisposition.CHANJET_CHANGE_PROPOSAL,
        policyRequired: byDisposition.ERP_POLICY_REQUIRED,
        crossSystemReviewRequired: byDisposition.CROSS_SYSTEM_REVIEW_REQUIRED,
        automaticResolutionCoveragePercent: items.length ? round((resolvedWithoutGuessing / items.length) * 100) : 100,
        byMappingType,
        byDisposition,
      },
      items,
      recommendedCanary: canary?.chanjetChangeProposal ? {
        mappingId: canary.mappingId,
        bookId: canary.bookId,
        field: canary.chanjetChangeProposal.field,
        currentValue: canary.chanjetChangeProposal.currentValue,
        proposedValue: canary.chanjetChangeProposal.proposedValue,
        reason: canary.chanjetChangeProposal.reason,
        approvalRequired: true,
      } : null,
      guardrails: {
        readonlyAudit: true,
        chanjetWrite: false,
        erpBusinessFactWrite: false,
        financeBalanceWrite: false,
        inventoryFactWrite: false,
        externalChangeRequiresExplicitApproval: true,
        oneRowCanaryOnly: true,
        dualReadbackRequired: true,
        rollbackRequired: true,
      },
    };
  }

  private classify(
    candidate: ChanjetErpMasterReviewCandidate,
    source: SourceRow | undefined,
    ratios: StableUomRatio[],
  ): ChanjetHoldResolutionItem {
    const base: ChanjetHoldResolutionItem = {
      mappingId: candidate.mappingId,
      mappingType: candidate.mappingType,
      bookId: candidate.bookId,
      companyCode: candidate.companyCode,
      chanjetId: candidate.chanjetId,
      chanjetCode: candidate.chanjetCode,
      chanjetName: candidate.chanjetName,
      authorityOwner: 'SHARED_MASTER_POLICY',
      disposition: 'KEEP_HOLD',
      confidence: 0.4,
      risk: 'MEDIUM',
      sourceQualityIssues: [],
      evidence: candidate.evidence,
      blockers: candidate.blockers,
      recommendedAction: '保留 HOLD，补充业务身份或来源证据后重新审计。',
      autoApplyEligible: false,
      requiresChanjetApproval: false,
      chanjetChangeProposal: null,
      uomPolicyCandidates: [],
    };

    if (candidate.mappingType === 'CASH_ACCOUNT') return this.classifyCashAccount(base, source);
    if (candidate.mappingType === 'DEPARTMENT') return this.classifyDepartment(base);
    if (candidate.mappingType === 'WAREHOUSE') return this.classifyWarehouse(base);
    if (candidate.mappingType === 'PRODUCT') return this.classifyProduct(base);
    if (candidate.mappingType === 'UOM') return this.classifyUom(base, ratios);
    return base;
  }

  private classifyCashAccount(base: ChanjetHoldResolutionItem, source: SourceRow | undefined): ChanjetHoldResolutionItem {
    if (base.chanjetName === '银行转账') {
      return {
        ...base,
        authorityOwner: 'CHANJET_FINANCE',
        disposition: 'NO_ERP_MASTER_REQUIRED',
        confidence: 1,
        risk: 'LOW',
        recommendedAction: '标记为支付方式，不创建 ERP 资金账户；保留来源引用供单据映射。',
      };
    }
    const raw = sourceRaw(source);
    const accountNo = String(raw.accountNo || '').trim();
    const bankName = String(raw.openingBank || '').trim();
    const incomplete = !accountNo || accountNo === '0' || accountNo === '8888' || !bankName || bankName === '--';
    if (incomplete) {
      return {
        ...base,
        authorityOwner: 'CHANJET_FINANCE',
        disposition: 'CROSS_SYSTEM_REVIEW_REQUIRED',
        confidence: 0.96,
        risk: 'HIGH',
        sourceQualityIssues: ['银行账户号码或开户行使用占位值，无法证明真实资金账户身份。'],
        recommendedAction: '经批准后在好业财补齐真实开户行与脱敏可核验账号，或将该条明确改为非银行结算方式。',
        chanjetChangeProposal: null,
      };
    }
    return base;
  }

  private classifyDepartment(base: ChanjetHoldResolutionItem): ChanjetHoldResolutionItem {
    if (/^(鸡舍|直营店)$/.test(base.chanjetName)) {
      return {
        ...base,
        disposition: 'NO_ERP_MASTER_REQUIRED',
        confidence: 1,
        risk: 'LOW',
        recommendedAction: '保留为好业财会计辅助核算分组节点，不映射为 ERP 交易主数据。',
      };
    }
    if (base.chanjetName === '借款') {
      return {
        ...base,
        authorityOwner: 'CHANJET_FINANCE',
        disposition: 'CROSS_SYSTEM_REVIEW_REQUIRED',
        confidence: 0.99,
        risk: 'HIGH',
        sourceQualityIssues: ['“借款”是业务类型，不是组织部门；继续作为部门会污染组织与 DataScope。'],
        recommendedAction: '核对其被哪些单据引用，再提出明确的目标辅助核算维度或停用方案。',
      };
    }
    if (/车间$/.test(base.chanjetName)) {
      return {
        ...base,
        authorityOwner: 'ERP_OPERATIONS',
        disposition: 'ERP_POLICY_REQUIRED',
        confidence: 0.95,
        recommendedAction: '先在 ERP 建立车间/工序归属模型，再将好业财辅助核算维度映射到该运营实体。',
      };
    }
    if (/^(?:\d+号鸡舍|公鸡舍|育雏舍?)$/.test(base.chanjetName)) {
      return {
        ...base,
        authorityOwner: 'ERP_OPERATIONS',
        disposition: 'ERP_POLICY_REQUIRED',
        confidence: 0.98,
        recommendedAction: '由 ERP 场区/鸡舍主数据提供权威身份；补齐同公司站点归属后映射，不改好业财事实。',
      };
    }
    if (/直营店$|合作店$/.test(base.chanjetName)) {
      return {
        ...base,
        authorityOwner: 'ERP_OPERATIONS',
        disposition: 'CROSS_SYSTEM_REVIEW_REQUIRED',
        confidence: 0.88,
        risk: 'MEDIUM',
        recommendedAction: '按门店地址、经营类型和公司归属核对别名；不得仅凭近似名称自动合并。',
      };
    }
    return base;
  }

  private classifyWarehouse(base: ChanjetHoldResolutionItem): ChanjetHoldResolutionItem {
    if (/鸡舍|育雏|车间/.test(base.chanjetName)) {
      return {
        ...base,
        authorityOwner: 'ERP_OPERATIONS',
        disposition: 'ERP_POLICY_REQUIRED',
        confidence: 0.99,
        recommendedAction: '作为鸡舍/车间库存位置桥接，不创建重复仓库；ERP 先补仓位层并绑定运营实体。',
      };
    }
    if (/^(总仓|总库)$/.test(base.chanjetName)) {
      return {
        ...base,
        disposition: 'CROSS_SYSTEM_REVIEW_REQUIRED',
        confidence: 0.94,
        risk: 'HIGH',
        sourceQualityIssues: ['同公司存在多个泛化仓库名称，无法区分地点和业务用途。'],
        recommendedAction: '核对来源单据使用范围后，批准合并、重命名或建立明确别名；不得自动合并库存身份。',
      };
    }
    return base;
  }

  private classifyProduct(base: ChanjetHoldResolutionItem): ChanjetHoldResolutionItem {
    const repair = HIGH_CONFIDENCE_NAME_REPAIRS[base.chanjetName];
    if (repair) {
      return this.nameProposal(
        base,
        'name',
        base.chanjetName,
        repair.value,
        repair.reason,
        0.99,
        'LOW',
      );
    }
    const domain = productDomain(base.chanjetName);
    const evidenceCount = evidenceNumber(base.evidence, 'runtime evidence rows');
    const baseUom = evidenceValue(base.evidence, 'runtime base UOM');
    if (domain === 'LIVESTOCK') {
      return {
        ...base,
        authorityOwner: 'ERP_OPERATIONS',
        disposition: 'ERP_POLICY_REQUIRED',
        confidence: 0.99,
        recommendedAction: '映射到 ERP 养殖品种/禽群主数据，不创建通用商品；保留好业财核算品名。',
      };
    }
    if (['FEED', 'PROCESSED'].includes(domain) || ['斤', '吨'].includes(baseUom)) {
      return {
        ...base,
        authorityOwner: 'ERP_OPERATIONS',
        disposition: 'ERP_POLICY_REQUIRED',
        confidence: 0.97,
        recommendedAction: '先固化质量单位、规格/等级和产品类型，再创建 ERP 主数据与来源映射。',
      };
    }
    if ((domain === 'MEDICINE' || domain === 'PACKAGING') && evidenceCount >= 3 && baseUom) {
      return {
        ...base,
        authorityOwner: 'ERP_OPERATIONS',
        disposition: 'ERP_AUTO_APPLY_ELIGIBLE',
        confidence: 0.96,
        risk: 'LOW',
        recommendedAction: '允许 ERP 侧创建来源保留的物料主数据；仍不得写好业财或导入库存事实。',
        autoApplyEligible: true,
      };
    }
    return {
      ...base,
      authorityOwner: 'ERP_OPERATIONS',
      recommendedAction: '补足稳定单位、规格和业务类型证据后再决定 ERP 主数据归属。',
    };
  }

  private classifyUom(base: ChanjetHoldResolutionItem, ratios: StableUomRatio[]): ChanjetHoldResolutionItem {
    const matching = ratios.filter((ratio) => (
      ratio.bookId === base.bookId && ratio.sourceUom === base.chanjetName
    ));
    if (matching.length) {
      return {
        ...base,
        authorityOwner: 'SHARED_MASTER_POLICY',
        disposition: 'ERP_POLICY_REQUIRED',
        confidence: 0.99,
        risk: 'MEDIUM',
        evidence: [
          ...base.evidence,
          ...matching.map((ratio) => (
            `${ratio.productName}: 1 ${ratio.sourceUom} = ${ratio.conversionFactor} ${ratio.baseUom} (${ratio.observationCount} observations)`
          )),
        ],
        recommendedAction: '生成产品级单位换算策略；禁止把包装单位做成跨产品全局换算。',
        uomPolicyCandidates: matching,
      };
    }
    if (base.chanjetName === '斤' || base.chanjetName === '吨') {
      const factor = base.chanjetName === '斤' ? 0.5 : 1000;
      return {
        ...base,
        disposition: 'ERP_POLICY_REQUIRED',
        confidence: 1,
        risk: 'LOW',
        evidence: [...base.evidence, `physical conversion 1 ${base.chanjetName} = ${factor} 公斤`],
        recommendedAction: '建立质量单位标准换算，原单据来源单位和值继续保留用于审计。',
        uomPolicyCandidates: [{
          bookId: base.bookId,
          productCode: '*',
          productName: '质量单位通用规则',
          sourceUom: base.chanjetName,
          baseUom: '公斤',
          observationCount: 0,
          conversionFactor: factor,
          minFactor: factor,
          maxFactor: factor,
        }],
      };
    }
    return {
      ...base,
      disposition: 'ERP_POLICY_REQUIRED',
      confidence: 0.9,
      recommendedAction: '按产品建立包装单位换算证据；“只”按禽只语义处理，不得全局映射为“枚”。',
    };
  }

  private nameProposal(
    base: ChanjetHoldResolutionItem,
    field: string,
    currentValue: string,
    proposedValue: string,
    reason: string,
    confidence: number,
    risk: 'LOW' | 'MEDIUM' | 'HIGH',
  ): ChanjetHoldResolutionItem {
    return {
      ...base,
      authorityOwner: 'CHANJET_FINANCE',
      disposition: 'CHANJET_CHANGE_PROPOSAL',
      confidence,
      risk,
      sourceQualityIssues: [reason],
      recommendedAction: '等待用户明确批准后，仅执行单条好业财 canary；执行前后双读校验并保留回滚值。',
      requiresChanjetApproval: true,
      chanjetChangeProposal: {
        field,
        currentValue,
        proposedValue,
        reason,
        rollbackValue: currentValue,
        approvalRequired: true,
      },
    };
  }

  private async loadSourceRows(mappingIds: string[]): Promise<SourceRow[]> {
    if (!mappingIds.length) return [];
    return this.ds.query(
      `SELECT id::text, raw_data
         FROM chanjet_master_mapping
        WHERE id = ANY($1::uuid[])`,
      [mappingIds],
    );
  }

  private async loadStableUomRatios(): Promise<StableUomRatio[]> {
    const rows = await this.ds.query(
      `WITH lines AS (
         SELECT s.book_id,
                line->>'productCode' AS product_code,
                line->>'productName' AS product_name,
                NULLIF(TRIM(line->>'transUomName'), '') AS trans_uom,
                NULLIF(TRIM(line->>'trans2UomName'), '') AS trans2_uom,
                NULLIF(line->>'transQty', '')::numeric AS trans_qty,
                NULLIF(line->>'trans2Qty', '')::numeric AS trans2_qty,
                NULLIF(TRIM(line->>'productBaseUomName'), '') AS base_uom
           FROM chanjet_entity_snapshots s
           CROSS JOIN LATERAL jsonb_array_elements(s.raw_data->'voucherDetailList') line
          WHERE jsonb_typeof(s.raw_data->'voucherDetailList') = 'array'
       ), ratios AS (
         SELECT book_id, product_code, product_name, trans_uom AS source_uom,
                base_uom, trans2_qty / NULLIF(trans_qty, 0) AS factor
           FROM lines
          WHERE trans_uom <> base_uom AND trans2_uom = base_uom
            AND trans_qty > 0 AND trans2_qty > 0
         UNION ALL
         SELECT book_id, product_code, product_name, trans2_uom,
                base_uom, trans_qty / NULLIF(trans2_qty, 0)
           FROM lines
          WHERE trans2_uom <> base_uom AND trans_uom = base_uom
            AND trans_qty > 0 AND trans2_qty > 0
       )
       SELECT book_id AS "bookId",
              product_code AS "productCode",
              MAX(product_name) AS "productName",
              source_uom AS "sourceUom",
              base_uom AS "baseUom",
              COUNT(*)::int AS "observationCount",
              AVG(factor)::float AS "conversionFactor",
              MIN(factor)::float AS "minFactor",
              MAX(factor)::float AS "maxFactor"
         FROM ratios
        WHERE COALESCE(product_code, '') <> ''
          AND COALESCE(source_uom, '') <> ''
          AND COALESCE(base_uom, '') <> ''
        GROUP BY book_id, product_code, source_uom, base_uom
       HAVING COUNT(*) >= 3
          AND ABS(MAX(factor) - MIN(factor)) <= GREATEST(0.000001, ABS(AVG(factor)) * 0.000001)
        ORDER BY book_id, product_code, source_uom`,
    );
    return rows.map((row: StableUomRatio) => ({
      ...row,
      sourceUom: canonicalUom(row.sourceUom),
      baseUom: canonicalUom(row.baseUom),
      observationCount: Number(row.observationCount || 0),
      conversionFactor: round(Number(row.conversionFactor || 0), 6),
      minFactor: round(Number(row.minFactor || 0), 6),
      maxFactor: round(Number(row.maxFactor || 0), 6),
    }));
  }
}
