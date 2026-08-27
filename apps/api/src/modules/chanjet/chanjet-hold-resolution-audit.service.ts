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

export type ChanjetExactReferenceEvidence = {
  source: 'ERP_READONLY_MIRROR';
  matchingMode: 'EXACT_IDENTIFIER_ONLY';
  scannedSnapshotCount: number;
  exactSnapshotCount: number;
  headerMatchCount: number;
  lineMatchCount: number;
  entityTypes: string[];
  firstSeenAt: string;
  lastSeenAt: string;
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
  referenceEvidence: ChanjetExactReferenceEvidence | null;
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

export type CloseIntentionalNonMappingInput = {
  auditHash: string;
  approveProduction: boolean;
  confirmation: string;
};

export type CloseOrganizationPolicyInput = CloseIntentionalNonMappingInput;

export type CloseHouseLocationPolicyInput = CloseIntentionalNonMappingInput & {
  companyCode: string;
};

type HouseLocationClosureTarget = {
  mappingId: string;
  bookId: string;
  companyCode: string;
  chanjetCode: string;
  chanjetName: string;
  houseCode: string;
  warehouseCode: string;
  locationCode: string;
};

const HOUSE_LOCATION_CLOSURE_TARGETS: readonly HouseLocationClosureTarget[] = Object.freeze([
  { mappingId: '307155', bookId: '3533914511118750', companyCode: 'COMP-LAO-AGRI', chanjetCode: '05', chanjetName: '1号鸡舍', houseCode: 'HOUSE_MS_01', warehouseCode: 'LPH_MS_EGG_FARM', locationCode: 'LOC-HOUSE_MS_01' },
  { mappingId: '307156', bookId: '3533914511118750', companyCode: 'COMP-LAO-AGRI', chanjetCode: '06', chanjetName: '2号鸡舍', houseCode: 'HOUSE_MS_02', warehouseCode: 'LPH_MS_EGG_FARM', locationCode: 'LOC-HOUSE_MS_02' },
  { mappingId: '307157', bookId: '3533914511118750', companyCode: 'COMP-LAO-AGRI', chanjetCode: '07', chanjetName: '3号鸡舍', houseCode: 'HOUSE_MS_03', warehouseCode: 'LPH_MS_EGG_FARM', locationCode: 'LOC-HOUSE_MS_03' },
  { mappingId: '307158', bookId: '3533914511118750', companyCode: 'COMP-LAO-AGRI', chanjetCode: '08', chanjetName: '4号鸡舍', houseCode: 'HOUSE_MS_04', warehouseCode: 'LPH_MS_EGG_FARM', locationCode: 'LOC-HOUSE_MS_04' },
  { mappingId: '307159', bookId: '3533914511118750', companyCode: 'COMP-LAO-AGRI', chanjetCode: '09', chanjetName: '5号鸡舍', houseCode: 'HOUSE_MS_05', warehouseCode: 'LPH_MS_EGG_FARM', locationCode: 'LOC-HOUSE_MS_05' },
  { mappingId: '307160', bookId: '3533914511118750', companyCode: 'COMP-LAO-AGRI', chanjetCode: '10', chanjetName: '6号鸡舍', houseCode: 'HOUSE_MS_06', warehouseCode: 'LPH_MS_EGG_FARM', locationCode: 'LOC-HOUSE_MS_06' },
  { mappingId: '307170', bookId: '3537748712226818', companyCode: 'COMP-LAO-XINGCHI', chanjetCode: '101', chanjetName: '1号鸡舍', houseCode: 'HOUSE_DP_01', warehouseCode: 'CJ-WH-XINGCHI-01', locationCode: 'LOC-HOUSE_DP_01' },
  { mappingId: '307171', bookId: '3537748712226818', companyCode: 'COMP-LAO-XINGCHI', chanjetCode: '102', chanjetName: '2号鸡舍', houseCode: 'HOUSE_DP_02', warehouseCode: 'CJ-WH-XINGCHI-01', locationCode: 'LOC-HOUSE_DP_02' },
  { mappingId: '307172', bookId: '3537748712226818', companyCode: 'COMP-LAO-XINGCHI', chanjetCode: '103', chanjetName: '3号鸡舍', houseCode: 'HOUSE_DP_03', warehouseCode: 'CJ-WH-XINGCHI-01', locationCode: 'LOC-HOUSE_DP_03' },
  { mappingId: '307173', bookId: '3537748712226818', companyCode: 'COMP-LAO-XINGCHI', chanjetCode: '104', chanjetName: '4号鸡舍', houseCode: 'HOUSE_DP_04', warehouseCode: 'CJ-WH-XINGCHI-01', locationCode: 'LOC-HOUSE_DP_04' },
  { mappingId: '307174', bookId: '3537748712226818', companyCode: 'COMP-LAO-XINGCHI', chanjetCode: '105', chanjetName: '5号鸡舍', houseCode: 'HOUSE_DP_05', warehouseCode: 'CJ-WH-XINGCHI-01', locationCode: 'LOC-HOUSE_DP_05' },
  { mappingId: '307175', bookId: '3537748712226818', companyCode: 'COMP-LAO-XINGCHI', chanjetCode: '106', chanjetName: '公鸡舍', houseCode: 'HOUSE_DP_06', warehouseCode: 'CJ-WH-XINGCHI-01', locationCode: 'LOC-HOUSE_DP_06' },
]);

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

// Short veterinary trade names are common in the source books. They are not
// suitable for fuzzy matching. This set is only a domain-policy hint: a row
// that the authoritative business review kept on HOLD must never become an
// automatic ERP master creation merely because its name looks veterinary.
const VETERINARY_PRODUCT_NAMES = new Set([
  '传喉',
  '阿莫西林',
  '地美',
  '新流腺',
  'H5+H7',
  '新支减流',
  '水溶性VC99%',
  '强力拜固舒',
  '氯化胺',
  '支易佳',
  '新易支',
  '柴素清',
  '马利克',
  '麻杏石甘',
  '新支流法腺',
  '盛美观（复方磺胺间甲嘧啶纳可溶粉）',
]);

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
  if (VETERINARY_PRODUCT_NAMES.has(name)) return 'MEDICINE';
  if (/^(蛋鸡|公鸡|小公鸡|雏鸡|母鸡|小鸡苗|小母鸡)$/.test(name)) return 'LIVESTOCK';
  if (/料|煤炭|玉米|豆粕|米糠|麸皮|石粉/.test(name)) return 'FEED';
  if (/筐|框|蛋托|包装|标签|胶带/.test(name)) return 'PACKAGING';
  if (/烧鸡|咸鸡蛋|变蛋/.test(name)) return 'PROCESSED';
  if (/苗|肽|霉素|环素|菌素|沙星|头孢|卡巴|葡萄糖|注射液|口服液|可溶性|黄芪|氟苯|清霉|治霉|胃康|多维|消毒/.test(name)) {
    return 'MEDICINE';
  }
  return 'OTHER';
}

function canonicalAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value
      .map(canonicalAuditValue)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalAuditValue(item)]),
  );
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
    const classified = holds.map((candidate) => this.classify(
      candidate,
      sourceById.get(candidate.mappingId),
      uomRatios,
    ));
    const referenceTargets = classified.filter((item) => (
      item.disposition === 'CROSS_SYSTEM_REVIEW_REQUIRED'
      || item.disposition === 'KEEP_HOLD'
    ));
    const referenceEvidence = await this.loadExactReferenceEvidence(referenceTargets);
    const referenceById = new Map(referenceEvidence.map((row) => [row.mappingId, row.evidence]));
    const items = classified.map((item) => ({
      ...item,
      referenceEvidence: referenceById.get(item.mappingId) || null,
    }));
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
      referenceEvidence: item.referenceEvidence,
    }));
    return {
      generatedAt: new Date().toISOString(),
      sourceReviewHash: plan.reviewHash,
      auditHash: createHash('sha256')
        .update(JSON.stringify(canonicalAuditValue(canonical)))
        .digest('hex'),
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

  async closeIntentionalNonMappings(
    input: CloseIntentionalNonMappingInput,
    actor: string,
  ): Promise<{
    auditHash: string;
    closed: Array<{
      mappingId: string;
      mappingType: string;
      bookId: string;
      chanjetCode: string;
      chanjetName: string;
      previousMatchStatus: string;
      matchStatus: 'NOT_APPLICABLE';
    }>;
    writeChanjet: false;
    writeErpBusinessTables: false;
    automaticRollbackOnFailure: true;
  }> {
    if (input.approveProduction !== true || input.confirmation !== 'CLOSE_INTENTIONAL_NON_MAPPING') {
      throw new Error('intentional non-mapping closure requires exact production confirmation');
    }
    if (!actor.trim()) throw new Error('intentional non-mapping closure actor is required');

    const audit = await this.audit();
    if (!input.auditHash || input.auditHash !== audit.auditHash) {
      throw new Error('precision audit hash changed; rerun read-only audit before closure');
    }
    const targets = audit.items
      .filter((item) => item.disposition === 'NO_ERP_MASTER_REQUIRED')
      .sort((left, right) => left.mappingId.localeCompare(right.mappingId));
    if (!targets.length) {
      return {
        auditHash: audit.auditHash,
        closed: [],
        writeChanjet: false,
        writeErpBusinessTables: false,
        automaticRollbackOnFailure: true,
      };
    }

    const runner = this.ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const closed = [] as Array<{
        mappingId: string;
        mappingType: string;
        bookId: string;
        chanjetCode: string;
        chanjetName: string;
        previousMatchStatus: string;
        matchStatus: 'NOT_APPLICABLE';
      }>;
      for (const target of targets) {
        const rows = await runner.query(
          `SELECT id::text, mapping_type, book_id, chanjet_id, chanjet_code,
                  chanjet_name, match_status, review_status
             FROM chanjet_master_mapping
            WHERE id = $1
            FOR UPDATE`,
          [target.mappingId],
        );
        const current = rows[0];
        if (!current
          || String(current.mapping_type) !== target.mappingType
          || String(current.book_id) !== target.bookId
          || String(current.chanjet_id) !== target.chanjetId
          || String(current.chanjet_code) !== target.chanjetCode
          || String(current.chanjet_name) !== target.chanjetName
          || String(current.match_status) !== 'SOURCE_ONLY'
          || String(current.review_status) !== 'APPROVED') {
          throw new Error(`mapping ${target.mappingId} changed after audit; transaction rolled back`);
        }
        await runner.query(
          `UPDATE chanjet_master_mapping
              SET match_status = 'NOT_APPLICABLE',
                  confidence = 100,
                  review_status = 'APPROVED',
                  reviewed_by = $2,
                  reviewed_at = NOW(),
                  raw_data = COALESCE(raw_data, '{}'::jsonb)
                    || jsonb_build_object('holdResolution', $3::jsonb),
                  updated_at = NOW()
            WHERE id = $1`,
          [
            target.mappingId,
            actor,
            JSON.stringify({
              disposition: target.disposition,
              auditHash: audit.auditHash,
              reason: target.recommendedAction,
              closedAt: new Date().toISOString(),
              writeChanjet: false,
              writeErpBusinessTables: false,
            }),
          ],
        );
        closed.push({
          mappingId: target.mappingId,
          mappingType: target.mappingType,
          bookId: target.bookId,
          chanjetCode: target.chanjetCode,
          chanjetName: target.chanjetName,
          previousMatchStatus: String(current.match_status),
          matchStatus: 'NOT_APPLICABLE',
        });
      }
      const readback = await runner.query(
        `SELECT id::text, match_status, review_status
           FROM chanjet_master_mapping
          WHERE id = ANY($1::bigint[])
          ORDER BY id`,
        [targets.map((target) => target.mappingId)],
      );
      if (readback.length !== targets.length
        || readback.some((row: Record<string, unknown>) => (
          String(row.match_status) !== 'NOT_APPLICABLE'
          || String(row.review_status) !== 'APPROVED'
        ))) {
        throw new Error('intentional non-mapping readback mismatch; transaction rolled back');
      }
      await runner.commitTransaction();
      return {
        auditHash: audit.auditHash,
        closed,
        writeChanjet: false,
        writeErpBusinessTables: false,
        automaticRollbackOnFailure: true,
      };
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  async closeOrganizationPolicy(
    input: CloseOrganizationPolicyInput,
    actor: string,
  ): Promise<{
    auditHash: string;
    closed: Array<{
      mappingId: string;
      mappingType: string;
      bookId: string;
      chanjetCode: string;
      chanjetName: string;
      previousMatchStatus: string;
      matchStatus: 'NOT_APPLICABLE';
      policy: 'KEEP_ACCOUNTING_GROUP_NOT_TRANSACTION_DEPARTMENT';
    }>;
    writeChanjet: false;
    writeErpBusinessTables: false;
    automaticRollbackOnFailure: true;
  }> {
    const expectedConfirmation = 'CLOSE_ORGANIZATION_POLICY:6198';
    if (input.approveProduction !== true || input.confirmation !== expectedConfirmation) {
      throw new Error('organization policy closure requires exact production confirmation');
    }
    if (!actor.trim()) throw new Error('organization policy closure actor is required');

    const audit = await this.audit();
    if (!input.auditHash || input.auditHash !== audit.auditHash) {
      throw new Error('precision audit hash changed; rerun read-only audit before closure');
    }
    const targets = audit.items.filter((item) => (
      item.mappingId === '6198'
      && item.mappingType === 'DEPARTMENT'
      && item.bookId === '3537748712226818'
      && item.companyCode === 'COMP-LAO-XINGCHI'
      && item.chanjetCode === '100'
      && item.chanjetName === '育雏'
      && item.disposition === 'ERP_POLICY_REQUIRED'
      && item.blockers.includes('HOUSE_CANONICAL_CODE_POLICY_REQUIRED')
      && item.blockers.includes('BROODING_HOUSE_REQUIRES_DISTINCT_TYPE_AND_CODE_POLICY')
    ));
    if (targets.length !== 1) {
      throw new Error('organization policy exact audited target changed; no write executed');
    }

    const target = targets[0];
    const policy = 'KEEP_ACCOUNTING_GROUP_NOT_TRANSACTION_DEPARTMENT' as const;
    const runner = this.ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const rows = await runner.query(
        `SELECT id::text, mapping_type, book_id, chanjet_id, chanjet_code,
                chanjet_name, match_status, review_status
           FROM chanjet_master_mapping
          WHERE id = $1
          FOR UPDATE`,
        [target.mappingId],
      );
      const current = rows[0];
      if (!current
        || String(current.mapping_type) !== target.mappingType
        || String(current.book_id) !== target.bookId
        || String(current.chanjet_id) !== target.chanjetId
        || String(current.chanjet_code) !== target.chanjetCode
        || String(current.chanjet_name) !== target.chanjetName
        || String(current.match_status) !== 'SOURCE_ONLY'
        || String(current.review_status) !== 'APPROVED') {
        throw new Error(`mapping ${target.mappingId} changed after audit; transaction rolled back`);
      }
      await runner.query(
        `UPDATE chanjet_master_mapping
            SET match_status = 'NOT_APPLICABLE',
                confidence = 100,
                review_status = 'APPROVED',
                reviewed_by = $2,
                reviewed_at = NOW(),
                raw_data = COALESCE(raw_data, '{}'::jsonb)
                  || jsonb_build_object('holdResolution', $3::jsonb),
                updated_at = NOW()
          WHERE id = $1`,
        [
          target.mappingId,
          actor,
          JSON.stringify({
            disposition: target.disposition,
            auditHash: audit.auditHash,
            policy,
            reason: '育雏保留为好业财核算分组；ERP 交易归属由鸡舍项目和仓位承载，不创建重复部门。',
            closedAt: new Date().toISOString(),
            writeChanjet: false,
            writeErpBusinessTables: false,
          }),
        ],
      );
      const readback = await runner.query(
        `SELECT id::text, match_status, review_status,
                raw_data->'holdResolution'->>'policy' AS policy
           FROM chanjet_master_mapping
          WHERE id = $1`,
        [target.mappingId],
      );
      if (readback.length !== 1
        || String(readback[0].match_status) !== 'NOT_APPLICABLE'
        || String(readback[0].review_status) !== 'APPROVED'
        || String(readback[0].policy) !== policy) {
        throw new Error('organization policy readback mismatch; transaction rolled back');
      }
      await runner.commitTransaction();
      return {
        auditHash: audit.auditHash,
        closed: [{
          mappingId: target.mappingId,
          mappingType: target.mappingType,
          bookId: target.bookId,
          chanjetCode: target.chanjetCode,
          chanjetName: target.chanjetName,
          previousMatchStatus: String(current.match_status),
          matchStatus: 'NOT_APPLICABLE',
          policy,
        }],
        writeChanjet: false,
        writeErpBusinessTables: false,
        automaticRollbackOnFailure: true,
      };
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
  }

  async preflightHouseLocationPolicies(input: {
    companyCode: string;
    auditHash: string;
  }): Promise<{
    auditHash: string;
    companyCode: string;
    ready: boolean;
    targets: Array<HouseLocationClosureTarget & {
      locationExisted: boolean;
      policyExisted: boolean;
      blockers: string[];
    }>;
    schema: { table: 'wms_locations'; requiredColumns: string[]; missingColumns: string[] };
    writeChanjet: false;
    writeErpMasterTables: false;
    writeErpBusinessFacts: false;
  }> {
    const companyCode = String(input.companyCode || '').trim();
    const targets = HOUSE_LOCATION_CLOSURE_TARGETS.filter(
      (target) => target.companyCode === companyCode,
    );
    if (targets.length !== 6) throw new Error('house-location company target set is not approved');
    const audit = await this.audit();
    if (!input.auditHash || input.auditHash !== audit.auditHash) {
      throw new Error('precision audit hash changed; rerun read-only audit before preflight');
    }
    const auditedIdentities = new Set(audit.items
      .filter((item) => item.mappingType === 'WAREHOUSE' && item.disposition === 'ERP_POLICY_REQUIRED')
      .map((item) => [
        item.mappingId, item.bookId, item.companyCode, item.chanjetCode, item.chanjetName,
      ].join(':')));
    const expectedIdentities = targets.map((target) => [
      target.mappingId, target.bookId, target.companyCode, target.chanjetCode, target.chanjetName,
    ].join(':'));
    if (expectedIdentities.some((identity) => !auditedIdentities.has(identity))) {
      throw new Error('house-location exact audited target set changed; preflight stopped');
    }

    const requiredColumns = [
      'location_code', 'warehouse_code', 'zone_code', 'location_name', 'capacity_qty',
      'status', 'store_code', 'created_at', 'updated_at',
    ];
    const [columnRows, mappingRows, houseRows, warehouseRows, locationRows, policyRows] = await Promise.all([
      this.ds.query(
        `SELECT column_name
           FROM information_schema.columns
          WHERE table_schema = current_schema() AND table_name = 'wms_locations'`,
      ),
      this.ds.query(
        `SELECT id::text, mapping_type, book_id, chanjet_code, chanjet_name,
                match_status, review_status
           FROM chanjet_master_mapping
          WHERE id = ANY($1::bigint[])`,
        [targets.map((target) => target.mappingId)],
      ),
      this.ds.query(
        `SELECT house_code, COALESCE(status, 'ACTIVE') AS status
           FROM brd_houses
          WHERE house_code = ANY($1::varchar[])`,
        [targets.map((target) => target.houseCode)],
      ),
      this.ds.query(
        `SELECT warehouse_code, COALESCE(company_code, '') AS company_code,
                COALESCE(status, 'ACTIVE') AS status
           FROM wms_warehouses
          WHERE warehouse_code = ANY($1::varchar[])`,
        [[...new Set(targets.map((target) => target.warehouseCode))]],
      ),
      this.ds.query(
        `SELECT location_code, warehouse_code, COALESCE(location_name, '') AS location_name,
                COALESCE(status, 'ACTIVE') AS status
           FROM wms_locations
          WHERE location_code = ANY($1::varchar[])`,
        [targets.map((target) => target.locationCode)],
      ),
      this.ds.query(
        `SELECT book_id, company_code, source_warehouse_code, source_warehouse_name,
                erp_house_code, erp_warehouse_code, erp_location_code, state
           FROM chanjet_wms_house_location_policies
          WHERE book_id = $1 AND source_warehouse_code = ANY($2::varchar[])`,
        [targets[0].bookId, targets.map((target) => target.chanjetCode)],
      ),
    ]);
    const columns = new Set(columnRows.map((row: Record<string, unknown>) => String(row.column_name)));
    const missingColumns = requiredColumns.filter((column) => !columns.has(column));
    const planned = targets.map((target) => {
      const mapping = mappingRows.find((row: Record<string, unknown>) => String(row.id) === target.mappingId);
      const house = houseRows.find((row: Record<string, unknown>) => String(row.house_code) === target.houseCode);
      const warehouse = warehouseRows.find(
        (row: Record<string, unknown>) => String(row.warehouse_code) === target.warehouseCode,
      );
      const location = locationRows.find(
        (row: Record<string, unknown>) => String(row.location_code) === target.locationCode,
      );
      const policy = policyRows.find((row: Record<string, unknown>) => (
        String(row.book_id) === target.bookId
        && String(row.source_warehouse_code) === target.chanjetCode
      ));
      const blockers: string[] = [];
      if (!mapping
        || String(mapping.mapping_type) !== 'WAREHOUSE'
        || String(mapping.book_id) !== target.bookId
        || String(mapping.chanjet_code) !== target.chanjetCode
        || String(mapping.chanjet_name) !== target.chanjetName
        || String(mapping.match_status) !== 'SOURCE_ONLY'
        || String(mapping.review_status) !== 'APPROVED') blockers.push('SOURCE_MAPPING_CHANGED');
      if (!house || String(house.status) !== 'ACTIVE') blockers.push('ACTIVE_HOUSE_MISSING');
      if (!warehouse
        || String(warehouse.company_code) !== target.companyCode
        || String(warehouse.status) !== 'ACTIVE') blockers.push('ACTIVE_SAME_COMPANY_WAREHOUSE_MISSING');
      if (location && (
        String(location.warehouse_code) !== target.warehouseCode
        || String(location.location_name) !== target.chanjetName
        || String(location.status) !== 'ACTIVE'
      )) blockers.push('LOCATION_IDENTITY_CONFLICT');
      if (policy && (
        String(policy.company_code) !== target.companyCode
        || String(policy.source_warehouse_name) !== target.chanjetName
        || String(policy.erp_house_code) !== target.houseCode
        || String(policy.erp_warehouse_code) !== target.warehouseCode
        || String(policy.erp_location_code) !== target.locationCode
      )) blockers.push('POLICY_IDENTITY_CONFLICT');
      if (missingColumns.length) blockers.push('WMS_LOCATION_SCHEMA_MISMATCH');
      return {
        ...target,
        locationExisted: !!location,
        policyExisted: !!policy,
        blockers,
      };
    });
    return {
      auditHash: audit.auditHash,
      companyCode,
      ready: planned.every((target) => target.blockers.length === 0),
      targets: planned,
      schema: { table: 'wms_locations', requiredColumns, missingColumns },
      writeChanjet: false,
      writeErpMasterTables: false,
      writeErpBusinessFacts: false,
    };
  }

  async closeHouseLocationPolicies(
    input: CloseHouseLocationPolicyInput,
    actor: string,
  ): Promise<{
    auditHash: string;
    companyCode: string;
    closed: Array<{
      mappingId: string;
      bookId: string;
      chanjetCode: string;
      chanjetName: string;
      houseCode: string;
      warehouseCode: string;
      locationCode: string;
      locationCreated: boolean;
      policyCreated: boolean;
      previousMatchStatus: string;
      matchStatus: 'NOT_APPLICABLE';
    }>;
    preStateBackup: Array<{
      mappingId: string;
      previousMatchStatus: string;
      previousReviewStatus: string;
      locationExisted: boolean;
      policyExisted: boolean;
      previousPolicyState: string;
    }>;
    writeChanjet: false;
    writeErpMasterTables: true;
    writeErpBusinessFacts: false;
    automaticRollbackOnFailure: true;
  }> {
    const companyCode = String(input.companyCode || '').trim();
    const targets = HOUSE_LOCATION_CLOSURE_TARGETS.filter(
      (target) => target.companyCode === companyCode,
    );
    const expectedConfirmation = `CREATE_HOUSE_LOCATIONS_AND_APPROVE_POLICY:${companyCode}:6`;
    if (input.approveProduction !== true || input.confirmation !== expectedConfirmation) {
      throw new Error('house-location policy closure requires exact production confirmation');
    }
    if (!actor.trim()) throw new Error('house-location policy closure actor is required');
    if (targets.length !== 6) throw new Error('house-location company target set is not approved');

    const audit = await this.audit();
    if (!input.auditHash || input.auditHash !== audit.auditHash) {
      throw new Error('precision audit hash changed; rerun read-only audit before closure');
    }
    const auditTargets = audit.items.filter((item) => targets.some((target) => (
      target.mappingId === item.mappingId
      && item.mappingType === 'WAREHOUSE'
      && target.bookId === item.bookId
      && target.companyCode === item.companyCode
      && target.chanjetCode === item.chanjetCode
      && target.chanjetName === item.chanjetName
      && item.disposition === 'ERP_POLICY_REQUIRED'
    )));
    if (auditTargets.length !== targets.length) {
      throw new Error('house-location exact audited target set changed; no write executed');
    }

    const runner = this.ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      const closed = [] as Array<{
        mappingId: string;
        bookId: string;
        chanjetCode: string;
        chanjetName: string;
        houseCode: string;
        warehouseCode: string;
        locationCode: string;
        locationCreated: boolean;
        policyCreated: boolean;
        previousMatchStatus: string;
        matchStatus: 'NOT_APPLICABLE';
      }>;
      const preStateBackup = [] as Array<{
        mappingId: string;
        previousMatchStatus: string;
        previousReviewStatus: string;
        locationExisted: boolean;
        policyExisted: boolean;
        previousPolicyState: string;
      }>;

      for (const target of targets) {
        const mappingRows = await runner.query(
          `SELECT id::text, mapping_type, book_id, chanjet_id, chanjet_code,
                  chanjet_name, match_status, review_status
             FROM chanjet_master_mapping
            WHERE id = $1
            FOR UPDATE`,
          [target.mappingId],
        );
        const mapping = mappingRows[0];
        if (!mapping
          || String(mapping.mapping_type) !== 'WAREHOUSE'
          || String(mapping.book_id) !== target.bookId
          || String(mapping.chanjet_code) !== target.chanjetCode
          || String(mapping.chanjet_name) !== target.chanjetName
          || String(mapping.match_status) !== 'SOURCE_ONLY'
          || String(mapping.review_status) !== 'APPROVED') {
          throw new Error(`mapping ${target.mappingId} changed after audit; transaction rolled back`);
        }

        const houseRows = await runner.query(
          `SELECT house_code, COALESCE(status, 'ACTIVE') AS status
             FROM brd_houses
            WHERE house_code = $1
            FOR UPDATE`,
          [target.houseCode],
        );
        if (houseRows.length !== 1 || String(houseRows[0].status) !== 'ACTIVE') {
          throw new Error(`active ERP house ${target.houseCode} does not exist`);
        }
        const warehouseRows = await runner.query(
          `SELECT warehouse_code, COALESCE(company_code, '') AS company_code,
                  COALESCE(status, 'ACTIVE') AS status
             FROM wms_warehouses
            WHERE warehouse_code = $1
            FOR UPDATE`,
          [target.warehouseCode],
        );
        const warehouse = warehouseRows[0];
        if (!warehouse
          || String(warehouse.company_code) !== target.companyCode
          || String(warehouse.status) !== 'ACTIVE') {
          throw new Error(`active same-company warehouse ${target.warehouseCode} does not exist`);
        }

        const locationRows = await runner.query(
          `SELECT location_code, warehouse_code, COALESCE(location_name, '') AS location_name,
                  COALESCE(status, 'ACTIVE') AS status
             FROM wms_locations
            WHERE location_code = $1
            FOR UPDATE`,
          [target.locationCode],
        );
        const location = locationRows[0];
        if (location && (
          String(location.warehouse_code) !== target.warehouseCode
          || String(location.location_name) !== target.chanjetName
          || String(location.status) !== 'ACTIVE'
        )) {
          throw new Error(`ERP location ${target.locationCode} conflicts with approved target`);
        }
        const locationCreated = !location;
        if (locationCreated) {
          await runner.query(
            `INSERT INTO wms_locations (
               location_code, warehouse_code, zone_code, location_name,
               capacity_qty, status, store_code, created_at, updated_at
             ) VALUES ($1,$2,NULL,$3,0,'ACTIVE','ALL',NOW(),NOW())`,
            [target.locationCode, target.warehouseCode, target.chanjetName],
          );
        }

        const policyRows = await runner.query(
          `SELECT id::text, book_id, company_code, source_warehouse_code,
                  source_warehouse_name, erp_house_code, erp_warehouse_code,
                  erp_location_code, state
             FROM chanjet_wms_house_location_policies
            WHERE book_id = $1 AND source_warehouse_code = $2
            FOR UPDATE`,
          [target.bookId, target.chanjetCode],
        );
        const policy = policyRows[0];
        if (policy && (
          String(policy.company_code) !== target.companyCode
          || String(policy.source_warehouse_name) !== target.chanjetName
          || String(policy.erp_house_code) !== target.houseCode
          || String(policy.erp_warehouse_code) !== target.warehouseCode
          || String(policy.erp_location_code) !== target.locationCode
        )) {
          throw new Error(`house-location policy ${target.bookId}:${target.chanjetCode} conflicts with approved target`);
        }
        const policyCreated = !policy;
        const evidence = {
          auditHash: audit.auditHash,
          mappingId: target.mappingId,
          sourceIdentity: `${target.bookId}:${target.chanjetCode}:${target.chanjetName}`,
          policy: 'HOUSE_IS_COST_PROJECT_AND_WMS_LOCATION_NOT_WAREHOUSE',
          approvedAt: new Date().toISOString(),
          writeChanjet: false,
          writeErpBusinessFacts: false,
        };
        await runner.query(
          `INSERT INTO chanjet_wms_house_location_policies (
             book_id, company_code, source_warehouse_code, source_warehouse_name,
             erp_house_code, erp_warehouse_code, erp_location_code, state,
             evidence, reviewed_by, reviewed_at, created_at, updated_at
           ) VALUES ($1,$2,$3,$4,$5,$6,$7,'APPROVED',$8::jsonb,$9,NOW(),NOW(),NOW())
           ON CONFLICT (book_id, source_warehouse_code) DO UPDATE SET
             state = 'APPROVED', evidence = EXCLUDED.evidence,
             reviewed_by = EXCLUDED.reviewed_by, reviewed_at = NOW(), updated_at = NOW()`,
          [
            target.bookId,
            target.companyCode,
            target.chanjetCode,
            target.chanjetName,
            target.houseCode,
            target.warehouseCode,
            target.locationCode,
            JSON.stringify(evidence),
            actor,
          ],
        );
        await runner.query(
          `UPDATE chanjet_master_mapping
              SET match_status = 'NOT_APPLICABLE',
                  confidence = 100,
                  review_status = 'APPROVED',
                  reviewed_by = $2,
                  reviewed_at = NOW(),
                  raw_data = COALESCE(raw_data, '{}'::jsonb)
                    || jsonb_build_object('holdResolution', $3::jsonb),
                  updated_at = NOW()
            WHERE id = $1`,
          [
            target.mappingId,
            actor,
            JSON.stringify({
              ...evidence,
              disposition: 'ERP_POLICY_REQUIRED',
              houseCode: target.houseCode,
              warehouseCode: target.warehouseCode,
              locationCode: target.locationCode,
              directWarehouseMapping: false,
            }),
          ],
        );
        preStateBackup.push({
          mappingId: target.mappingId,
          previousMatchStatus: String(mapping.match_status),
          previousReviewStatus: String(mapping.review_status),
          locationExisted: !!location,
          policyExisted: !!policy,
          previousPolicyState: policy ? String(policy.state) : '',
        });
        closed.push({
          mappingId: target.mappingId,
          bookId: target.bookId,
          chanjetCode: target.chanjetCode,
          chanjetName: target.chanjetName,
          houseCode: target.houseCode,
          warehouseCode: target.warehouseCode,
          locationCode: target.locationCode,
          locationCreated,
          policyCreated,
          previousMatchStatus: String(mapping.match_status),
          matchStatus: 'NOT_APPLICABLE',
        });
      }

      const readback = await runner.query(
        `SELECT m.id::text, m.match_status, m.review_status,
                p.company_code, p.source_warehouse_code, p.source_warehouse_name,
                p.erp_house_code, p.erp_warehouse_code, p.erp_location_code, p.state,
                l.warehouse_code AS location_warehouse_code,
                COALESCE(l.location_name, '') AS location_name,
                COALESCE(l.status, 'ACTIVE') AS location_status
           FROM chanjet_master_mapping m
           JOIN chanjet_wms_house_location_policies p
             ON p.book_id = m.book_id AND p.source_warehouse_code = m.chanjet_code
           JOIN wms_locations l ON l.location_code = p.erp_location_code
          WHERE m.id = ANY($1::bigint[])
          ORDER BY m.id`,
        [targets.map((target) => target.mappingId)],
      );
      if (readback.length !== targets.length || readback.some((row: Record<string, unknown>) => {
        const target = targets.find((candidate) => candidate.mappingId === String(row.id));
        return !target
          || String(row.match_status) !== 'NOT_APPLICABLE'
          || String(row.review_status) !== 'APPROVED'
          || String(row.company_code) !== target.companyCode
          || String(row.source_warehouse_code) !== target.chanjetCode
          || String(row.source_warehouse_name) !== target.chanjetName
          || String(row.erp_house_code) !== target.houseCode
          || String(row.erp_warehouse_code) !== target.warehouseCode
          || String(row.erp_location_code) !== target.locationCode
          || String(row.state) !== 'APPROVED'
          || String(row.location_warehouse_code) !== target.warehouseCode
          || String(row.location_name) !== target.chanjetName
          || String(row.location_status) !== 'ACTIVE';
      })) {
        throw new Error('house-location dual readback mismatch; transaction rolled back');
      }

      await runner.commitTransaction();
      return {
        auditHash: audit.auditHash,
        companyCode,
        closed,
        preStateBackup,
        writeChanjet: false,
        writeErpMasterTables: true,
        writeErpBusinessFacts: false,
        automaticRollbackOnFailure: true,
      };
    } catch (error) {
      await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
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
      referenceEvidence: null,
    };

    if (candidate.mappingType === 'CASH_ACCOUNT') return this.classifyCashAccount(base, source);
    if (candidate.mappingType === 'DEPARTMENT') return this.classifyDepartment(base);
    if (candidate.mappingType === 'WAREHOUSE') return this.classifyWarehouse(base);
    if (candidate.mappingType === 'PRODUCT') return this.classifyProduct(base, source);
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

  private classifyProduct(
    base: ChanjetHoldResolutionItem,
    source: SourceRow | undefined,
  ): ChanjetHoldResolutionItem {
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
    const raw = sourceRaw(source);
    const gapProposal = raw.erpMasterGapProposal && typeof raw.erpMasterGapProposal === 'object'
      ? raw.erpMasterGapProposal as Record<string, unknown>
      : {};
    const gapClass = String(gapProposal.gapClass || base.blockers[0] || 'PRODUCT_DOMAIN_CLASSIFICATION_REQUIRED');
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
        disposition: 'ERP_POLICY_REQUIRED',
        confidence: 0.96,
        risk: 'MEDIUM',
        evidence: [
          ...base.evidence,
          `source product domain hint ${domain}`,
          `authoritative business review remains HOLD (${gapClass})`,
        ],
        recommendedAction: '先审批产品语义归属，并由权威业务审查生成 CREATE_MASTER 候选；在此之前禁止创建 ERP 物料。',
        autoApplyEligible: false,
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
    const isLivestockPiece = base.chanjetName === '只';
    return {
      ...base,
      disposition: 'ERP_POLICY_REQUIRED',
      confidence: 0.9,
      recommendedAction: isLivestockPiece
        ? '“只”按禽只语义处理，不得全局映射为“枚”；原单据值和来源单位必须保留。'
        : '保留来源单位；取得同产品至少 3 笔稳定换算证据后建立产品级换算，不得凭单位名称全局折算。',
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
        WHERE id = ANY($1::bigint[])`,
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

  private async loadExactReferenceEvidence(items: ChanjetHoldResolutionItem[]): Promise<Array<{
    mappingId: string;
    evidence: ChanjetExactReferenceEvidence;
  }>> {
    if (!items.length) return [];
    const targets = items.map((item) => ({
      mappingId: item.mappingId,
      mappingType: item.mappingType,
      bookId: item.bookId,
      chanjetId: item.chanjetId,
      chanjetCode: item.chanjetCode,
    }));
    const rows = await this.ds.query(
      `WITH targets AS (
         SELECT "mappingId" AS mapping_id,
                "mappingType" AS mapping_type,
                "bookId" AS book_id,
                "chanjetId" AS chanjet_id,
                "chanjetCode" AS chanjet_code
           FROM jsonb_to_recordset($1::jsonb) AS x(
             "mappingId" text,
             "mappingType" text,
             "bookId" text,
             "chanjetId" text,
             "chanjetCode" text
           )
       ), coverage AS (
         SELECT t.mapping_id, COUNT(s.id)::int AS scanned_snapshot_count
           FROM targets t
           LEFT JOIN chanjet_entity_snapshots s ON s.book_id = t.book_id
            AND s.entity_type NOT IN (
              'DEPARTMENT', 'WAREHOUSE', 'PRODUCT', 'CASH_ACCOUNT', 'BANK_ACCOUNT',
              'UOM', 'ACCOUNT_BOOK'
            )
          GROUP BY t.mapping_id
       ), header_matches AS (
         SELECT t.mapping_id, s.id AS snapshot_id, s.entity_type,
                COALESCE(s.last_seen_at, s.updated_at) AS seen_at,
                'HEADER'::text AS match_level
           FROM targets t
           JOIN chanjet_entity_snapshots s ON s.book_id = t.book_id
            AND s.entity_type NOT IN (
              'DEPARTMENT', 'WAREHOUSE', 'PRODUCT', 'CASH_ACCOUNT', 'BANK_ACCOUNT',
              'UOM', 'ACCOUNT_BOOK'
            )
          WHERE CASE t.mapping_type
            WHEN 'DEPARTMENT' THEN ARRAY[
              s.raw_data->>'departmentId', s.raw_data->>'departmentCode'
            ] && ARRAY[t.chanjet_id, t.chanjet_code]
            WHEN 'WAREHOUSE' THEN ARRAY[
              s.raw_data->>'warehouseId', s.raw_data->>'warehouseCode'
            ] && ARRAY[t.chanjet_id, t.chanjet_code]
            WHEN 'PRODUCT' THEN ARRAY[
              s.raw_data->>'productId', s.raw_data->>'productCode'
            ] && ARRAY[t.chanjet_id, t.chanjet_code]
            WHEN 'CASH_ACCOUNT' THEN ARRAY[
              s.raw_data->>'cashAccountId', s.raw_data->>'cashAccountCode',
              s.raw_data->>'bankAccountId', s.raw_data->>'settlementAccountId',
              s.raw_data->>'payAccountId', s.raw_data->>'paymentAccountId'
            ] && ARRAY[t.chanjet_id, t.chanjet_code]
            ELSE false
          END
       ), line_matches AS (
         SELECT t.mapping_id, s.id AS snapshot_id, s.entity_type,
                COALESCE(s.last_seen_at, s.updated_at) AS seen_at,
                'LINE'::text AS match_level
           FROM targets t
           JOIN chanjet_entity_snapshots s ON s.book_id = t.book_id
            AND s.entity_type NOT IN (
              'DEPARTMENT', 'WAREHOUSE', 'PRODUCT', 'CASH_ACCOUNT', 'BANK_ACCOUNT',
              'UOM', 'ACCOUNT_BOOK'
            )
           CROSS JOIN LATERAL jsonb_array_elements(
             CASE WHEN jsonb_typeof(s.raw_data->'voucherDetailList') = 'array'
               THEN s.raw_data->'voucherDetailList' ELSE '[]'::jsonb END
           ) line
          WHERE CASE t.mapping_type
            WHEN 'DEPARTMENT' THEN ARRAY[
              line->>'departmentId', line->>'departmentCode'
            ] && ARRAY[t.chanjet_id, t.chanjet_code]
            WHEN 'WAREHOUSE' THEN ARRAY[
              line->>'warehouseId', line->>'warehouseCode'
            ] && ARRAY[t.chanjet_id, t.chanjet_code]
            WHEN 'PRODUCT' THEN ARRAY[
              line->>'productId', line->>'productCode'
            ] && ARRAY[t.chanjet_id, t.chanjet_code]
            WHEN 'CASH_ACCOUNT' THEN ARRAY[
              line->>'cashAccountId', line->>'cashAccountCode',
              line->>'bankAccountId', line->>'settlementAccountId',
              line->>'payAccountId', line->>'paymentAccountId'
            ] && ARRAY[t.chanjet_id, t.chanjet_code]
            ELSE false
          END
       ), matches AS (
         SELECT * FROM header_matches
         UNION ALL
         SELECT * FROM line_matches
       )
       SELECT t.mapping_id AS "mappingId",
              COALESCE(c.scanned_snapshot_count, 0)::int AS "scannedSnapshotCount",
              COUNT(DISTINCT m.snapshot_id)::int AS "exactSnapshotCount",
              COUNT(*) FILTER (WHERE m.match_level = 'HEADER')::int AS "headerMatchCount",
              COUNT(*) FILTER (WHERE m.match_level = 'LINE')::int AS "lineMatchCount",
              COALESCE(ARRAY_AGG(DISTINCT m.entity_type) FILTER (WHERE m.entity_type IS NOT NULL), '{}')
                AS "entityTypes",
              COALESCE(MIN(m.seen_at)::text, '') AS "firstSeenAt",
              COALESCE(MAX(m.seen_at)::text, '') AS "lastSeenAt"
         FROM targets t
         LEFT JOIN coverage c ON c.mapping_id = t.mapping_id
         LEFT JOIN matches m ON m.mapping_id = t.mapping_id
        GROUP BY t.mapping_id, c.scanned_snapshot_count
        ORDER BY t.mapping_id`,
      [JSON.stringify(targets)],
    );
    return rows.map((row: Record<string, unknown>) => ({
      mappingId: String(row.mappingId || ''),
      evidence: {
        source: 'ERP_READONLY_MIRROR',
        matchingMode: 'EXACT_IDENTIFIER_ONLY',
        scannedSnapshotCount: Number(row.scannedSnapshotCount || 0),
        exactSnapshotCount: Number(row.exactSnapshotCount || 0),
        headerMatchCount: Number(row.headerMatchCount || 0),
        lineMatchCount: Number(row.lineMatchCount || 0),
        entityTypes: Array.isArray(row.entityTypes) ? row.entityTypes.map(String) : [],
        firstSeenAt: String(row.firstSeenAt || ''),
        lastSeenAt: String(row.lastSeenAt || ''),
      },
    }));
  }
}
