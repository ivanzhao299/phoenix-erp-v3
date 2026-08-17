import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { In, Repository } from 'typeorm';
import { ChanjetBookCompanyMapEntity } from './chanjet-book-company-map.entity';
import { ChanjetEntitySnapshotEntity } from './chanjet-entity-snapshot.entity';
import {
  ChanjetMappingType,
  ChanjetMasterMappingEntity,
} from './chanjet-master-mapping.entity';
import {
  ChanjetWmsPromotionCandidateEntity,
  ChanjetWmsPromotionState,
} from './chanjet-wms-promotion-candidate.entity';
import {
  ChanjetInventoryEntityType,
  NormalizedChanjetInventoryDocument,
  normalizeChanjetInventoryDocument,
} from './chanjet-wms-readonly.contract';
import { buildChanjetWmsCanonicalIdentity } from './chanjet-wms-reconciliation';
import { ChanjetWmsWritebackOutboxEntity } from './chanjet-wms-writeback-outbox.entity';
import { ChanjetIntegrationService } from './chanjet-integration.service';
import {
  ChanjetWmsGapClassification,
  ChanjetWmsGapClass,
  classifyChanjetWmsGap,
} from './chanjet-wms-gap-classifier';
import {
  buildWmsMasterGapProposals,
  wmsGapSourceKey,
} from './chanjet-erp-master-gap-closure';

const TRANSACTION_ENTITY_TYPES: ChanjetInventoryEntityType[] = [
  'STOCK_IN',
  'SALES_STOCK_OUT',
  'FINISHED_GOODS_STOCK_IN',
  'MATERIAL_STOCK_OUT',
  'OTHER_STOCK_IN',
  'OTHER_STOCK_OUT',
  'STOCK_TRANSFER',
  'STOCK_COUNT',
  'RETAIL_STOCK_OUT',
];

const DOCUMENT_POLICY: Record<
  Exclude<ChanjetInventoryEntityType, 'INVENTORY_ON_HAND' | 'INVENTORY_ON_HAND_LOT'>,
  {
    direction: ChanjetWmsPromotionCandidateEntity['erpDirection'];
    documentType: string;
  }
> = {
  STOCK_IN: { direction: 'INBOUND', documentType: 'PURCHASE_INBOUND' },
  SALES_STOCK_OUT: { direction: 'OUTBOUND', documentType: 'SALES_OUTBOUND' },
  FINISHED_GOODS_STOCK_IN: { direction: 'INBOUND', documentType: 'PRODUCTION_INBOUND' },
  MATERIAL_STOCK_OUT: { direction: 'OUTBOUND', documentType: 'PRODUCTION_ISSUE' },
  OTHER_STOCK_IN: { direction: 'INBOUND', documentType: 'OTHER_INBOUND' },
  OTHER_STOCK_OUT: { direction: 'OUTBOUND', documentType: 'OTHER_OUTBOUND' },
  STOCK_TRANSFER: { direction: 'TRANSFER', documentType: 'WAREHOUSE_TRANSFER' },
  STOCK_COUNT: { direction: 'COUNT', documentType: 'STOCKTAKE_ADJUSTMENT' },
  RETAIL_STOCK_OUT: { direction: 'OUTBOUND', documentType: 'RETAIL_OUTBOUND' },
};

const WRITEBACK_DOCUMENT_TYPES = new Set(
  Object.values(DOCUMENT_POLICY).map((policy) => policy.documentType),
);

type MappingDimension = 'WAREHOUSE' | 'PRODUCT' | 'UOM' | 'CURRENCY';

interface MappingCheck {
  dimension: MappingDimension;
  sourceCode: string;
  contextCode?: string;
  mapped: boolean;
  erpCode: string;
  resolutionType?: 'MASTER_MAPPING' | 'HOUSE_LOCATION_POLICY' | 'PRODUCT_UOM_POLICY';
  reason: string;
}

export interface RefreshPromotionCandidatesResult {
  scanned: number;
  created: number;
  updated: number;
  preservedReviewed: number;
  states: Record<ChanjetWmsPromotionState, number>;
  externalWriteExecuted: false;
  erpBusinessTablesMutated: false;
}

export interface RefreshWmsMasterMappingsResult {
  sourceIdentities: number;
  exactMatched: number;
  sourceOnly: number;
  conflicts: number;
  preservedApproved: number;
  erpBusinessTablesMutated: false;
  externalWriteExecuted: false;
}

type WmsMappingType = Extract<ChanjetMappingType, 'WAREHOUSE' | 'PRODUCT' | 'UOM'>;

export interface ErpMappingCandidate {
  code: string;
  name: string;
  company_code: string;
  entity_type: 'WAREHOUSE' | 'PRODUCT' | 'SKU' | 'MATERIAL' | 'UOM';
}

export interface ReviewWmsMasterMappingInput {
  decision: 'APPROVE' | 'REJECT';
  erpCode?: string;
  erpEntityType?: ErpMappingCandidate['entity_type'];
}

export interface PrepareWmsWritebackInput {
  bookId: string;
  companyCode: string;
  documentType: string;
  erpDocumentNo: string;
  canonicalPayload: Record<string, unknown>;
  approvalReference: string;
  approvalConfirmed: boolean;
}

interface ApprovedHouseLocationPolicy {
  id: string;
  book_id: string;
  company_code: string;
  source_warehouse_code: string;
  erp_house_code: string;
  erp_warehouse_code: string;
  erp_location_code: string;
}

interface ApprovedUomConversionPolicy {
  id: string;
  book_id: string;
  source_product_code: string;
  source_uom: string;
  erp_entity_type: 'PRODUCT' | 'SKU' | 'MATERIAL';
  erp_product_code: string;
  erp_base_uom: string;
  conversion_ratio: string;
}

export interface ReviewHouseLocationPolicyInput {
  bookId: string;
  companyCode: string;
  sourceWarehouseCode: string;
  sourceWarehouseName?: string;
  erpHouseCode: string;
  erpWarehouseCode: string;
  erpLocationCode: string;
  decision: 'APPROVE' | 'REJECT' | 'HOLD';
  evidence?: Record<string, unknown>;
}

export interface ReviewUomConversionPolicyInput {
  bookId: string;
  companyCode?: string;
  sourceProductCode: string;
  sourceProductName?: string;
  sourceUom: string;
  erpEntityType: 'PRODUCT' | 'SKU' | 'MATERIAL';
  erpProductCode: string;
  erpBaseUom: string;
  conversionRatio: number;
  decision: 'APPROVE' | 'REJECT' | 'HOLD';
  evidence?: Record<string, unknown>;
}

const text = (value: unknown): string => String(value ?? '').trim();
const upper = (value: unknown): string => text(value).toUpperCase();
const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];
const sha256 = (value: unknown): string => createHash('sha256')
  .update(JSON.stringify(value))
  .digest('hex');

@Injectable()
export class ChanjetWmsBridgeService {
  private readonly logger = new Logger(ChanjetWmsBridgeService.name);

  constructor(
    @InjectRepository(ChanjetBookCompanyMapEntity)
    private readonly bookMapRepository: Repository<ChanjetBookCompanyMapEntity>,
    @InjectRepository(ChanjetEntitySnapshotEntity)
    private readonly snapshotRepository: Repository<ChanjetEntitySnapshotEntity>,
    @InjectRepository(ChanjetMasterMappingEntity)
    private readonly mappingRepository: Repository<ChanjetMasterMappingEntity>,
    @InjectRepository(ChanjetWmsPromotionCandidateEntity)
    private readonly candidateRepository: Repository<ChanjetWmsPromotionCandidateEntity>,
    @InjectRepository(ChanjetWmsWritebackOutboxEntity)
    private readonly outboxRepository: Repository<ChanjetWmsWritebackOutboxEntity>,
    @Optional()
    private readonly integration?: ChanjetIntegrationService,
  ) {}

  async overview() {
    const [bookMaps, sourceCount, candidateCount, outboxCount, candidateStates, outboxStates, alignment] = await Promise.all([
      this.bookMapRepository.find({ where: { syncEnabled: true } }),
      this.snapshotRepository.count({ where: { entityType: In(TRANSACTION_ENTITY_TYPES) } }),
      this.candidateRepository.count(),
      this.outboxRepository.count(),
      this.candidateRepository.createQueryBuilder('candidate')
        .select('candidate.state', 'state')
        .addSelect('COUNT(*)', 'count')
        .groupBy('candidate.state')
        .getRawMany<{ state: ChanjetWmsPromotionState; count: string }>(),
      this.outboxRepository.createQueryBuilder('outbox')
        .select('outbox.state', 'state')
        .addSelect('COUNT(*)', 'count')
        .groupBy('outbox.state')
        .getRawMany<{ state: string; count: string }>(),
      this.integration?.wmsReadonlyAlignmentOverview() ?? Promise.resolve(null),
    ]);
    const alignmentReady = alignment?.decision === 'GO';

    return {
      decision: sourceCount > 0 && bookMaps.length > 0 ? 'GO_WITH_CONDITIONS' : 'HOLD',
      activeBookCount: bookMaps.length,
      sourceDocumentCount: sourceCount,
      promotionCandidateCount: candidateCount,
      promotionStates: Object.fromEntries(candidateStates.map((row) => [row.state, Number(row.count)])),
      writebackOutboxCount: outboxCount,
      writebackStates: Object.fromEntries(outboxStates.map((row) => [row.state, Number(row.count)])),
      promotionApprovalGate: {
        ready: alignmentReady,
        decision: alignment?.decision || 'HOLD',
        expectedScopes: alignment?.summary.expectedScopes || 0,
        freshScopes: alignment?.summary.freshScopes || 0,
        failedScopes: alignment?.summary.failedScopes || 0,
        conditions: alignment?.conditions || ['WMS_READONLY_ALIGNMENT_EVIDENCE_UNAVAILABLE'],
      },
      guardrails: {
        chanjetReadOnly: true,
        externalWriteEnabled: false,
        externalExecutionEndpointExposed: false,
        automaticBusinessTablePromotion: false,
        manualReviewRequired: true,
      },
    };
  }

  async refreshPromotionCandidates(actor: string): Promise<RefreshPromotionCandidatesResult> {
    const [bookMaps, snapshots, mappings, policies] = await Promise.all([
      this.bookMapRepository.find({ where: { syncEnabled: true } }),
      this.snapshotRepository.find({
        where: { entityType: In(TRANSACTION_ENTITY_TYPES) },
        order: { updatedAt: 'ASC' },
      }),
      this.mappingRepository.find({
        where: {
          mappingType: In<ChanjetMappingType>(['WAREHOUSE', 'PRODUCT', 'UOM', 'CURRENCY']),
        },
      }),
      this.loadApprovedWmsPolicies(),
    ]);
    const books = new Map(bookMaps.map((item) => [item.bookid, item]));
    const existing = await this.candidateRepository.find();
    const existingBySource = new Map(existing.map((item) => [
      `${item.bookId}:${item.entityType}:${item.externalDocumentId}`,
      item,
    ]));
    const states = this.emptyStateCounts();
    let created = 0;
    let updated = 0;
    let preservedReviewed = 0;

    for (const snapshot of snapshots) {
      const entityType = snapshot.entityType as ChanjetInventoryEntityType;
      if (!TRANSACTION_ENTITY_TYPES.includes(entityType)) continue;
      const document = normalizeChanjetInventoryDocument(snapshot.rawData, entityType, snapshot.bookId);
      const policy = DOCUMENT_POLICY[entityType as keyof typeof DOCUMENT_POLICY];
      const identity = buildChanjetWmsCanonicalIdentity({
        bookId: snapshot.bookId,
        entityType,
        externalDocumentId: snapshot.externalId || document.externalDocumentId,
        externalDocumentCode: snapshot.externalCode || document.externalDocumentCode,
      });
      // A missing provider identity must remain visible as HOLD evidence. Silently
      // skipping it would make the read model look healthier than the source.
      const externalDocumentId = identity.externalIdentity || `SNAPSHOT-${snapshot.id}`;

      const book = books.get(snapshot.bookId);
      const checks = this.mappingChecks(
        document,
        mappings,
        policies.houseLocations,
        policies.uomConversions,
      );
      const blockers = unique([
        ...(identity.status === 'HOLD' ? identity.reasons : []),
        !book ? 'BOOK_COMPANY_MAPPING_MISSING_OR_DISABLED' : '',
        document.erpWorkflowStatus === 'UNKNOWN' ? 'SOURCE_WORKFLOW_STATUS_UNKNOWN' : '',
        document.erpWorkflowStatus === 'PENDING' ? 'SOURCE_DOCUMENT_NOT_EFFECTIVE' : '',
        document.lines.length === 0 ? 'SOURCE_DOCUMENT_LINES_MISSING' : '',
      ]);
      const missingMappings = checks.filter((check) => !check.mapped);
      const conditions = unique([
        ...(identity.status === 'WARN' ? identity.reasons : []),
        ...missingMappings.map((check) => check.reason),
      ]);
      const desiredState = this.promotionState(
        blockers,
        missingMappings,
        identity.identitySource === 'EXTERNAL_CODE',
      );
      const canonicalPayload = document as unknown as Record<string, unknown>;
      const sourceHash = sha256(canonicalPayload);
      const sourceKey = `${snapshot.bookId}:${entityType}:${externalDocumentId}`;
      const previous = existingBySource.get(sourceKey);

      if (
        previous
        && previous.sourceHash === sourceHash
        && ['APPROVED', 'PROMOTED', 'REJECTED'].includes(previous.state)
      ) {
        states[previous.state] += 1;
        preservedReviewed += 1;
        continue;
      }

      const state = previous && previous.sourceHash !== sourceHash
        ? desiredState
        : previous?.state === 'APPROVED'
          ? 'APPROVED'
          : desiredState;
      const candidate = this.candidateRepository.create({
        ...(previous || {}),
        bookId: snapshot.bookId,
        entityType,
        externalDocumentId,
        externalDocumentNo: document.externalDocumentCode,
        companyCode: book?.companyCode || '',
        erpDirection: policy.direction,
        erpDocumentType: policy.documentType,
        state,
        sourceHash,
        canonicalPayload,
        mappingEvidence: {
          refreshedBy: actor,
          refreshedAt: new Date().toISOString(),
          sourceSnapshotId: snapshot.id,
          company: book
            ? { mapped: true, erpCode: book.companyCode, sourceBookId: book.bookid }
            : { mapped: false, sourceBookId: snapshot.bookId },
          dimensions: checks,
        },
        blockers,
        conditions: previous && previous.sourceHash !== sourceHash
          ? unique([...conditions, 'SOURCE_CHANGED_AFTER_REVIEW'])
          : conditions,
        approvedBy: previous && previous.sourceHash === sourceHash ? previous.approvedBy : '',
        approvedAt: previous && previous.sourceHash === sourceHash ? previous.approvedAt : null,
        promotedDocumentNo: previous && previous.sourceHash === sourceHash
          ? previous.promotedDocumentNo
          : '',
      });
      await this.candidateRepository.save(candidate);
      states[state] += 1;
      if (previous) updated += 1;
      else created += 1;
    }

    return {
      scanned: snapshots.length,
      created,
      updated,
      preservedReviewed,
      states,
      externalWriteExecuted: false,
      erpBusinessTablesMutated: false,
    };
  }

  async refreshMasterMappingCandidates(actor: string): Promise<RefreshWmsMasterMappingsResult> {
    if (!text(actor)) throw new BadRequestException('mapping refresh actor required');
    const [bookMaps, snapshots, existing, erpCandidates] = await Promise.all([
      this.bookMapRepository.find({ where: { syncEnabled: true } }),
      this.snapshotRepository.find({
        where: { entityType: In(TRANSACTION_ENTITY_TYPES) },
        order: { updatedAt: 'ASC' },
      }),
      this.mappingRepository.find({
        where: { mappingType: In<ChanjetMappingType>(['WAREHOUSE', 'PRODUCT', 'UOM']) },
      }),
      this.loadWmsErpCandidates(),
    ]);
    const books = new Map(bookMaps.map((book) => [book.bookid, book]));
    const sources = new Map<string, {
      mappingType: Extract<ChanjetMappingType, 'WAREHOUSE' | 'PRODUCT' | 'UOM'>;
      bookId: string;
      companyCode: string;
      code: string;
      name: string;
    }>();
    for (const snapshot of snapshots) {
      const entityType = snapshot.entityType as ChanjetInventoryEntityType;
      if (!TRANSACTION_ENTITY_TYPES.includes(entityType)) continue;
      const document = normalizeChanjetInventoryDocument(snapshot.rawData, entityType, snapshot.bookId);
      const companyCode = books.get(snapshot.bookId)?.companyCode || '';
      this.collectWmsMappingSource(
        sources, 'WAREHOUSE', snapshot.bookId, companyCode, document.warehouseCode, document.warehouseName,
      );
      for (const line of document.lines) {
        this.collectWmsMappingSource(
          sources, 'WAREHOUSE', snapshot.bookId, companyCode, line.warehouseCode, line.warehouseName,
        );
        this.collectWmsMappingSource(
          sources, 'PRODUCT', snapshot.bookId, companyCode, line.productCode, line.productName,
        );
        this.collectWmsMappingSource(
          sources, 'UOM', snapshot.bookId, companyCode, line.unitName, line.unitName,
        );
        this.collectWmsMappingSource(
          sources, 'UOM', snapshot.bookId, companyCode, line.secondaryUnitName, line.secondaryUnitName,
        );
      }
    }

    let exactMatched = 0;
    let sourceOnly = 0;
    let conflicts = 0;
    let preservedApproved = 0;

    for (const source of sources.values()) {
      const current = existing
        .filter((mapping) => (
          mapping.mappingType === source.mappingType
          && mapping.bookId === source.bookId
          && upper(mapping.chanjetId) === upper(source.code)
        ))
        .sort((left, right) => this.mappingRank(right) - this.mappingRank(left))[0];
      const canaryEvidence = current?.rawData?.productNameCanary
        && typeof current.rawData.productNameCanary === 'object'
        && !Array.isArray(current.rawData.productNameCanary)
        ? current.rawData.productNameCanary as Record<string, unknown>
        : {};
      const canaryOriginalName = text(canaryEvidence.originalName);
      const canaryVerifiedName = text(canaryEvidence.verifiedName);
      const preserveVerifiedProductName = source.mappingType === 'PRODUCT'
        && !!canaryVerifiedName
        && [canaryOriginalName, canaryVerifiedName].includes(source.name);
      const reviewedSource = preserveVerifiedProductName
        ? { ...source, name: canaryVerifiedName }
        : source;
      if (
        current?.reviewStatus === 'APPROVED'
        && ['MATCHED', 'MANUAL'].includes(current.matchStatus)
        && current.erpCode
      ) {
        current.chanjetCode = reviewedSource.code;
        current.chanjetName = reviewedSource.name || reviewedSource.code;
        current.rawData = {
          ...(current.rawData || {}),
          refreshedAt: new Date().toISOString(),
          refreshedBy: actor,
          sourceCompanyCode: reviewedSource.companyCode,
        };
        await this.mappingRepository.save(current);
        preservedApproved += 1;
        exactMatched += 1;
        continue;
      }

      const sourceClassification = classifyChanjetWmsGap({
        mappingType: reviewedSource.mappingType,
        sourceCode: reviewedSource.code,
        sourceName: reviewedSource.name,
        mapped: false,
        conflict: false,
        exactTargetCount: 0,
      });
      const matches = erpCandidates[reviewedSource.mappingType].filter((candidate) => {
        if (!this.isWmsCandidateSemanticallyAllowed(sourceClassification, candidate)) return false;
        if (
          reviewedSource.mappingType === 'WAREHOUSE'
          && reviewedSource.companyCode
          && candidate.company_code
          && candidate.company_code !== reviewedSource.companyCode
        ) return false;
        const codeMatch = upper(candidate.code) === upper(reviewedSource.code);
        const nameMatch = this.normalizedWmsName(candidate.name) === this.normalizedWmsName(reviewedSource.name);
        const uomAliasMatch = reviewedSource.mappingType === 'UOM'
          && this.canonicalUomAlias(reviewedSource.code || reviewedSource.name) === this.normalizedWmsName(candidate.name);
        return codeMatch || (!!reviewedSource.name && nameMatch) || uomAliasMatch;
      });
      const uniqueMatches = [...new Map(matches.map((match) => [
        `${match.entity_type}:${upper(match.code)}`,
        match,
      ])).values()];
      const match = uniqueMatches.length === 1 ? uniqueMatches[0] : null;
      const next = this.mappingRepository.create({
        ...(current || {}),
        mappingType: reviewedSource.mappingType,
        bookId: reviewedSource.bookId,
        erpCode: match?.code || '',
        erpName: match?.name || '',
        erpEntityType: match?.entity_type || '',
        chanjetId: reviewedSource.code,
        chanjetCode: reviewedSource.code,
        chanjetName: reviewedSource.name || reviewedSource.code,
        matchStatus: match ? 'MATCHED' : uniqueMatches.length > 1 ? 'CONFLICT' : 'SOURCE_ONLY',
        confidence: match ? '1.00' : uniqueMatches.length > 1 ? '0.00' : '1.00',
        reviewStatus: match || uniqueMatches.length === 0 ? 'APPROVED' : 'PENDING',
        reviewedBy: match
          ? `system:chanjet-wms-exact:${actor}`
          : uniqueMatches.length === 0
            ? `system:chanjet-wms-source-only:${actor}`
            : null,
        reviewedAt: uniqueMatches.length <= 1 ? new Date() : null,
        rawData: {
          ...(current?.rawData || {}),
          sourceCompanyCode: reviewedSource.companyCode,
          productNameCanaryPreserved: preserveVerifiedProductName,
          exactCandidates: uniqueMatches,
          rule: match
            ? reviewedSource.mappingType === 'UOM'
              && this.canonicalUomAlias(reviewedSource.code || reviewedSource.name) === this.normalizedWmsName(match.name)
              ? 'reviewed dimension-preserving UOM alias kg -> 公斤'
              : 'same-book company boundary plus exact code or unique normalized name'
            : uniqueMatches.length > 1
              ? 'multiple exact candidates; fail closed'
              : 'source identity only; ERP master mapping required before promotion',
        },
      });
      await this.mappingRepository.save(next);
      if (match) exactMatched += 1;
      else if (uniqueMatches.length > 1) conflicts += 1;
      else sourceOnly += 1;
    }

    return {
      sourceIdentities: sources.size,
      exactMatched,
      sourceOnly,
      conflicts,
      preservedApproved,
      erpBusinessTablesMutated: false,
      externalWriteExecuted: false,
    };
  }

  async mappingGapOverview() {
    const [mappings, books, erpCandidates, alignment, policies] = await Promise.all([
      this.mappingRepository.find({
        where: { mappingType: In<ChanjetMappingType>(['WAREHOUSE', 'PRODUCT', 'UOM']) },
        order: { mappingType: 'ASC', bookId: 'ASC', chanjetName: 'ASC' },
      }),
      this.bookMapRepository.find({ where: { syncEnabled: true } }),
      this.loadWmsErpCandidates(),
      this.integration?.wmsReadonlyAlignmentOverview() ?? Promise.resolve(null),
      this.loadWmsPolicies(),
    ]);
    const bookById = new Map(books.map((book) => [book.bookid, book]));
    const rows = mappings.map((mapping) => {
      const mapped = (
        mapping.reviewStatus === 'APPROVED'
        && ['MATCHED', 'MANUAL'].includes(mapping.matchStatus)
        && !!mapping.erpCode
      );
      const companyCode = text(mapping.rawData?.sourceCompanyCode)
        || bookById.get(mapping.bookId)?.companyCode
        || '';
      const candidates = erpCandidates[mapping.mappingType as WmsMappingType]
        .filter((candidate) => (
          mapping.mappingType !== 'WAREHOUSE'
          || !companyCode
          || !candidate.company_code
          || candidate.company_code === companyCode
        ));
      const baseClassification = classifyChanjetWmsGap({
        mappingType: mapping.mappingType as WmsMappingType,
        sourceCode: mapping.chanjetCode || mapping.chanjetId,
        sourceName: mapping.chanjetName,
        mapped,
        conflict: mapping.matchStatus === 'CONFLICT',
        exactTargetCount: 0,
      });
      const exactTargets = candidates.filter((candidate) => (
        this.isWmsCandidateSemanticallyAllowed(baseClassification, candidate)
        && (
          upper(candidate.code) === upper(mapping.chanjetCode || mapping.chanjetId)
          || (
            !!mapping.chanjetName
            && this.normalizedWmsName(candidate.name) === this.normalizedWmsName(mapping.chanjetName)
          )
          || (
            mapping.mappingType === 'UOM'
            && this.canonicalUomAlias(mapping.chanjetCode || mapping.chanjetName)
              === this.normalizedWmsName(candidate.name)
          )
        )
      ));
      const classification = classifyChanjetWmsGap({
        mappingType: mapping.mappingType as WmsMappingType,
        sourceCode: mapping.chanjetCode || mapping.chanjetId,
        sourceName: mapping.chanjetName,
        mapped,
        conflict: mapping.matchStatus === 'CONFLICT',
        exactTargetCount: exactTargets.length,
      });
      return {
        id: mapping.id,
        mappingType: mapping.mappingType,
        bookId: mapping.bookId,
        bookName: bookById.get(mapping.bookId)?.bookName || mapping.bookId,
        companyCode,
        sourceCode: mapping.chanjetCode || mapping.chanjetId,
        sourceName: mapping.chanjetName,
        erpCode: mapping.erpCode,
        erpName: mapping.erpName,
        erpEntityType: mapping.erpEntityType,
        matchStatus: mapping.matchStatus,
        reviewStatus: mapping.reviewStatus,
        closureState: mapped
          ? 'MAPPED'
          : mapping.matchStatus === 'CONFLICT'
            ? 'CONFLICT'
            : 'NEED_MAPPING',
        gapClass: classification.gapClass,
        riskLevel: classification.riskLevel,
        suggestedEntityType: classification.suggestedEntityType,
        classificationReason: classification.reason,
        autoCloseEligible: classification.autoCloseEligible,
        exactTargetCount: exactTargets.length,
        allowedTargetCount: candidates.length,
        nextAction: classification.nextAction,
      };
    });
    const byType = (['WAREHOUSE', 'PRODUCT', 'UOM'] as WmsMappingType[]).map((mappingType) => {
      const scoped = rows.filter((row) => row.mappingType === mappingType);
      return {
        mappingType,
        total: scoped.length,
        mapped: scoped.filter((row) => row.closureState === 'MAPPED').length,
        needMapping: scoped.filter((row) => row.closureState === 'NEED_MAPPING').length,
        conflicts: scoped.filter((row) => row.closureState === 'CONFLICT').length,
      };
    });
    const mapped = rows.filter((row) => row.closureState === 'MAPPED').length;
    const gapClasses = Object.entries(rows.reduce<Record<string, number>>((counts, row) => {
      if (row.gapClass !== 'CLOSED') {
        counts[row.gapClass] = (counts[row.gapClass] || 0) + 1;
      }
      return counts;
    }, {})).map(([gapClass, count]) => ({
      gapClass: gapClass as ChanjetWmsGapClass,
      count,
    })).sort((left, right) => right.count - left.count);
    const permissionHolds = alignment?.scopes?.filter((scope) => (
      scope.latestSyncStatus === 'FAIL'
      && /50111|无调用该接口的权限|permission/i.test(scope.latestSyncError || '')
    )).map((scope) => ({
      endpointKey: scope.endpointKey,
      bookId: scope.bookId,
      bookName: scope.bookName,
      error: scope.latestSyncError,
      retryable: false,
      requiredAction: 'OPEN_PROVIDER_READONLY_SCOPE',
    })) || [];
    return {
      generatedAt: new Date().toISOString(),
      decision: rows.length > 0 && mapped === rows.length && alignment?.decision === 'GO'
        ? 'GO'
        : 'HOLD',
      summary: {
        total: rows.length,
        mapped,
        needMapping: rows.filter((row) => row.closureState === 'NEED_MAPPING').length,
        conflicts: rows.filter((row) => row.closureState === 'CONFLICT').length,
        mappingCoverageRate: rows.length ? Number(((mapped / rows.length) * 100).toFixed(2)) : 0,
        providerPermissionHolds: permissionHolds.length,
        autoCloseEligible: rows.filter((row) => row.autoCloseEligible).length,
      },
      byType,
      byGapClass: gapClasses,
      providerPermissionHolds: permissionHolds,
      domainPolicies: policies,
      targetCatalog: erpCandidates,
      rows,
      guardrails: {
        chanjetReadOnly: true,
        erpBusinessTablesMutated: false,
        externalWriteExecuted: false,
        explicitTargetEvidenceRequired: true,
        fuzzyAutoMappingAllowed: false,
        houseAsWarehouseAllowed: false,
        productSpecificPackageConversionRequired: true,
        providerPermissionAutomaticRetryAllowed: false,
        providerPermissionRetryRule: '50111 仅在好业财开放对应只读接口权限后允许人工复检；后台不得自动重试。',
      },
    };
  }

  /**
   * Groups WMS source-only identities into domain-safe ERP master proposals.
   * No warehouse, SKU, material, UOM or inventory fact is created here.
   */
  async erpMasterGapClosureManifest() {
    const overview = await this.mappingGapOverview();
    const proposals = buildWmsMasterGapProposals(overview.rows.map((row) => ({
      id: row.id,
      mappingType: row.mappingType as 'WAREHOUSE' | 'PRODUCT' | 'UOM',
      bookId: row.bookId,
      companyCode: row.companyCode,
      sourceCode: row.sourceCode,
      sourceName: row.sourceName,
      closureState: row.closureState,
      gapClass: row.gapClass,
      riskLevel: row.riskLevel,
      suggestedEntityType: row.suggestedEntityType,
      classificationReason: row.classificationReason,
      nextAction: row.nextAction,
    })));
    return {
      generatedAt: new Date().toISOString(),
      proposalGroups: proposals.length,
      sourceRows: proposals.reduce((sum, proposal) => sum + proposal.sourceCount, 0),
      proposals,
      providerPermissionHolds: overview.providerPermissionHolds,
      policyState: overview.domainPolicies,
      guardrails: {
        middleLayerEvidenceOnly: true,
        automaticErpMasterCreation: false,
        fuzzyAutoMapping: false,
        crossCompanyMapping: false,
        erpInventoryWrite: false,
        chanjetWrite: false,
      },
    };
  }

  async stageErpMasterGapClosureProposals(actor: string) {
    const manifest = await this.erpMasterGapClosureManifest();
    const proposalBySource = new Map(
      manifest.proposals.flatMap((proposal) => proposal.sources.map((source) => [
        wmsGapSourceKey({
          mappingType: proposal.sourceDomain as 'WAREHOUSE' | 'PRODUCT' | 'UOM',
          bookId: source.bookId,
          id: source.sourceId,
        }),
        proposal,
      ] as const)),
    );
    const ids = [...new Set(manifest.proposals.flatMap((proposal) => (
      proposal.sources.map((source) => source.sourceId)
    )))];
    const mappings = ids.length
      ? await this.mappingRepository.find({ where: { id: In(ids) } })
      : [];
    let stagedSourceRows = 0;
    let unchangedSourceRows = 0;
    const stagedAt = new Date().toISOString();
    for (const mapping of mappings) {
      const proposal = proposalBySource.get(wmsGapSourceKey({
        mappingType: mapping.mappingType as 'WAREHOUSE' | 'PRODUCT' | 'UOM',
        bookId: mapping.bookId,
        id: mapping.id,
      }));
      if (!proposal) continue;
      const current = mapping.rawData?.erpMasterGapProposal as Record<string, unknown> | undefined;
      if (
        current?.proposalId === proposal.proposalId
        && current?.proposedAction === proposal.proposedAction
      ) {
        unchangedSourceRows += 1;
        continue;
      }
      mapping.rawData = {
        ...(mapping.rawData || {}),
        erpMasterGapProposal: {
          proposalId: proposal.proposalId,
          sourceDomain: proposal.sourceDomain,
          gapClass: proposal.gapClass,
          targetEntityType: proposal.targetEntityType,
          targetTable: proposal.targetTable,
          proposedAction: proposal.proposedAction,
          riskLevel: proposal.riskLevel,
          requiredFields: proposal.requiredFields,
          blockerCodes: proposal.blockerCodes,
          autoCreateAllowed: false,
          requiresApproval: true,
          stagedBy: actor,
          stagedAt,
        },
      };
      await this.mappingRepository.save(mapping);
      stagedSourceRows += 1;
    }
    return {
      proposalGroups: manifest.proposalGroups,
      sourceRows: manifest.sourceRows,
      stagedSourceRows,
      unchangedSourceRows,
      writeChanjet: false,
      writeErpInventory: false,
      automaticErpMasterCreation: false,
    };
  }

  async domainPolicyOverview() {
    const [mappingGaps, policies, houseTargets, warehouseTargets, locationTargets, snapshots] = await Promise.all([
      this.mappingGapOverview(),
      this.loadWmsPolicies(),
      this.mappingRepository.manager.query(`
        SELECT
          house_code AS code,
          COALESCE(NULLIF(house_name, ''), house_code) AS name,
          COALESCE(status, 'ACTIVE') AS status
        FROM brd_houses
        WHERE COALESCE(status, 'ACTIVE') = 'ACTIVE'
        ORDER BY house_code
      `) as Promise<Array<{ code: string; name: string; status: string }>>,
      this.mappingRepository.manager.query(`
        SELECT
          warehouse_code AS code,
          COALESCE(NULLIF(warehouse_name_zh, ''), NULLIF(warehouse_name, ''), warehouse_code) AS name,
          COALESCE(company_code, '') AS company_code,
          COALESCE(type, '') AS warehouse_type,
          COALESCE(status, 'ACTIVE') AS status
        FROM wms_warehouses
        WHERE COALESCE(status, 'ACTIVE') = 'ACTIVE'
        ORDER BY company_code, warehouse_code
      `) as Promise<Array<{
        code: string;
        name: string;
        company_code: string;
        warehouse_type: string;
        status: string;
      }>>,
      this.mappingRepository.manager.query(`
        SELECT
          l.location_code AS code,
          COALESCE(NULLIF(l.location_name, ''), l.location_code) AS name,
          l.warehouse_code,
          COALESCE(w.company_code, '') AS company_code
        FROM wms_locations l
        JOIN wms_warehouses w ON w.warehouse_code = l.warehouse_code
        WHERE COALESCE(l.status, 'ACTIVE') = 'ACTIVE'
          AND COALESCE(w.status, 'ACTIVE') = 'ACTIVE'
        ORDER BY l.warehouse_code, l.location_code
      `) as Promise<Array<{
        code: string;
        name: string;
        warehouse_code: string;
        company_code: string;
      }>>,
      this.snapshotRepository.find({
        where: { entityType: In(TRANSACTION_ENTITY_TYPES) },
        order: { updatedAt: 'ASC' },
      }),
    ]);
    const houseCandidates = mappingGaps.rows
      .filter((row) => row.gapClass === 'HOUSE_INVENTORY_BRIDGE_REQUIRED')
      .map((row) => ({
        ...row,
        currentPolicy: policies.houseLocations.rows.find((policy) => (
          text(policy.book_id) === row.bookId
          && upper(policy.source_warehouse_code) === upper(row.sourceCode)
        )) || null,
      }));
    const uomGapKeys = new Set(mappingGaps.rows
      .filter((row) => (
        ['SKU_UOM_CONVERSION_REQUIRED', 'CONTEXTUAL_UOM_REQUIRED'].includes(row.gapClass)
      ))
      .map((row) => `${row.bookId}:${upper(row.sourceCode)}`));
    const companyByBook = new Map(mappingGaps.rows.map((row) => [row.bookId, row.companyCode]));
    const uomCandidateMap = new Map<string, {
      candidateKey: string;
      bookId: string;
      companyCode: string;
      sourceProductCode: string;
      sourceProductName: string;
      sourceUom: string;
      currentPolicy: Record<string, unknown> | null;
    }>();
    for (const snapshot of snapshots) {
      const entityType = snapshot.entityType as ChanjetInventoryEntityType;
      if (!TRANSACTION_ENTITY_TYPES.includes(entityType)) continue;
      const document = normalizeChanjetInventoryDocument(
        snapshot.rawData,
        entityType,
        snapshot.bookId,
      );
      for (const line of document.lines) {
        for (const sourceUom of unique([line.unitName, line.secondaryUnitName].filter(Boolean))) {
          if (!uomGapKeys.has(`${snapshot.bookId}:${upper(sourceUom)}`)) continue;
          const candidateKey = `${snapshot.bookId}:${upper(line.productCode)}:${upper(sourceUom)}`;
          uomCandidateMap.set(candidateKey, {
            candidateKey,
            bookId: snapshot.bookId,
            companyCode: companyByBook.get(snapshot.bookId) || '',
            sourceProductCode: line.productCode,
            sourceProductName: line.productName,
            sourceUom,
            currentPolicy: policies.uomConversions.rows.find((policy) => (
              text(policy.book_id) === snapshot.bookId
              && upper(policy.source_product_code) === upper(line.productCode)
              && upper(policy.source_uom) === upper(sourceUom)
            )) || null,
          });
        }
      }
    }
    const uomCandidates = [...uomCandidateMap.values()];
    const approvedHousePolicies = houseCandidates.filter(
      (candidate) => text(candidate.currentPolicy?.state) === 'APPROVED',
    ).length;
    const approvedUomPolicies = uomCandidates.filter(
      (candidate) => text(candidate.currentPolicy?.state) === 'APPROVED',
    ).length;
    return {
      generatedAt: new Date().toISOString(),
      decision: (
        houseCandidates.length === approvedHousePolicies
        && uomCandidates.length === approvedUomPolicies
      ) ? 'GO_WITH_CONDITIONS' : 'HOLD',
      summary: {
        houseCandidates: houseCandidates.length,
        approvedHousePolicies,
        uomCandidates: uomCandidates.length,
        approvedUomPolicies,
      },
      candidates: {
        houseLocations: houseCandidates,
        uomConversions: uomCandidates,
      },
      targets: {
        houses: houseTargets,
        warehouses: warehouseTargets,
        locations: locationTargets,
        products: mappingGaps.targetCatalog.PRODUCT,
        units: mappingGaps.targetCatalog.UOM,
      },
      policies,
      guardrails: {
        chanjetReadOnly: true,
        erpInventoryFactsMutated: false,
        houseAsWarehouseAllowed: false,
        conversionRatioMustBePositive: true,
        explicitReviewRequired: true,
      },
    };
  }

  async reviewHouseLocationPolicy(
    input: ReviewHouseLocationPolicyInput,
    actor: string,
  ) {
    if (!text(actor)) throw new BadRequestException('policy review actor required');
    if (!['APPROVE', 'REJECT', 'HOLD'].includes(input.decision)) {
      throw new BadRequestException('decision must be APPROVE, REJECT or HOLD');
    }
    const source = await this.mappingRepository.findOne({
      where: {
        mappingType: 'WAREHOUSE',
        bookId: text(input.bookId),
        chanjetId: text(input.sourceWarehouseCode),
      },
    });
    if (!source) throw new NotFoundException('source warehouse identity not found');
    if (input.decision === 'APPROVE') {
      const [houseRows, targetRows] = await Promise.all([
        this.mappingRepository.manager.query(
          `SELECT house_code FROM brd_houses
           WHERE house_code = $1 AND COALESCE(status, 'ACTIVE') = 'ACTIVE'
           LIMIT 1`,
          [text(input.erpHouseCode)],
        ) as Promise<Array<{ house_code: string }>>,
        this.mappingRepository.manager.query(
          `SELECT l.location_code, l.warehouse_code, COALESCE(w.company_code, '') AS company_code
           FROM wms_locations l
           JOIN wms_warehouses w ON w.warehouse_code = l.warehouse_code
           WHERE l.location_code = $1
             AND l.warehouse_code = $2
             AND COALESCE(l.status, 'ACTIVE') = 'ACTIVE'
             AND COALESCE(w.status, 'ACTIVE') = 'ACTIVE'
           LIMIT 1`,
          [text(input.erpLocationCode), text(input.erpWarehouseCode)],
        ) as Promise<Array<{
          location_code: string;
          warehouse_code: string;
          company_code: string;
        }>>,
      ]);
      if (!houseRows.length) throw new BadRequestException('active ERP house does not exist');
      const target = targetRows[0];
      if (!target) {
        throw new BadRequestException('active ERP warehouse/location ownership does not exist');
      }
      if (
        text(input.companyCode)
        && target.company_code
        && target.company_code !== text(input.companyCode)
      ) {
        throw new BadRequestException('warehouse/location is outside the source account-book company');
      }
    }
    const state = input.decision === 'APPROVE'
      ? 'APPROVED'
      : input.decision === 'REJECT'
        ? 'REJECTED'
        : 'HOLD';
    const [saved] = await this.mappingRepository.manager.query(
      `INSERT INTO chanjet_wms_house_location_policies (
         book_id, company_code, source_warehouse_code, source_warehouse_name,
         erp_house_code, erp_warehouse_code, erp_location_code, state,
         evidence, reviewed_by, reviewed_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,now(),now())
       ON CONFLICT (book_id, source_warehouse_code) DO UPDATE SET
         company_code = EXCLUDED.company_code,
         source_warehouse_name = EXCLUDED.source_warehouse_name,
         erp_house_code = EXCLUDED.erp_house_code,
         erp_warehouse_code = EXCLUDED.erp_warehouse_code,
         erp_location_code = EXCLUDED.erp_location_code,
         state = EXCLUDED.state,
         evidence = EXCLUDED.evidence,
         reviewed_by = EXCLUDED.reviewed_by,
         reviewed_at = now(),
         updated_at = now()
       RETURNING *`,
      [
        text(input.bookId),
        text(input.companyCode),
        text(input.sourceWarehouseCode),
        text(input.sourceWarehouseName),
        text(input.erpHouseCode),
        text(input.erpWarehouseCode),
        text(input.erpLocationCode),
        state,
        JSON.stringify(input.evidence || {}),
        actor,
      ],
    ) as Array<Record<string, unknown>>;
    return {
      policy: saved,
      erpInventoryFactsMutated: false,
      externalWriteExecuted: false,
    };
  }

  async reviewUomConversionPolicy(
    input: ReviewUomConversionPolicyInput,
    actor: string,
  ) {
    if (!text(actor)) throw new BadRequestException('policy review actor required');
    if (!['APPROVE', 'REJECT', 'HOLD'].includes(input.decision)) {
      throw new BadRequestException('decision must be APPROVE, REJECT or HOLD');
    }
    const ratio = Number(input.conversionRatio);
    let baseUom = text(input.erpBaseUom);
    if (input.decision === 'APPROVE') {
      if (!Number.isFinite(ratio) || ratio <= 0) {
        throw new BadRequestException('conversionRatio must be greater than zero');
      }
      const candidates = await this.loadWmsErpCandidates();
      const product = candidates.PRODUCT.find((candidate) => (
        candidate.entity_type === input.erpEntityType
        && upper(candidate.code) === upper(input.erpProductCode)
      ));
      if (!product) {
        throw new BadRequestException('active ERP product/SKU/material target does not exist');
      }
      const unit = candidates.UOM.find((candidate) => (
        upper(candidate.code) === upper(input.erpBaseUom)
        || this.normalizedWmsName(candidate.name) === this.normalizedWmsName(input.erpBaseUom)
      ));
      if (!unit) throw new BadRequestException('active ERP base UOM does not exist');
      baseUom = unit.code;
    }
    const state = input.decision === 'APPROVE'
      ? 'APPROVED'
      : input.decision === 'REJECT'
        ? 'REJECTED'
        : 'HOLD';
    const [saved] = await this.mappingRepository.manager.query(
      `INSERT INTO chanjet_wms_uom_conversion_policies (
         book_id, company_code, source_product_code, source_product_name,
         source_uom, erp_entity_type, erp_product_code, erp_base_uom,
         conversion_ratio, state, evidence, reviewed_by, reviewed_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,now(),now())
       ON CONFLICT (book_id, source_product_code, source_uom) DO UPDATE SET
         company_code = EXCLUDED.company_code,
         source_product_name = EXCLUDED.source_product_name,
         erp_entity_type = EXCLUDED.erp_entity_type,
         erp_product_code = EXCLUDED.erp_product_code,
         erp_base_uom = EXCLUDED.erp_base_uom,
         conversion_ratio = EXCLUDED.conversion_ratio,
         state = EXCLUDED.state,
         evidence = EXCLUDED.evidence,
         reviewed_by = EXCLUDED.reviewed_by,
         reviewed_at = now(),
         updated_at = now()
       RETURNING *`,
      [
        text(input.bookId),
        text(input.companyCode),
        text(input.sourceProductCode),
        text(input.sourceProductName),
        text(input.sourceUom),
        input.erpEntityType,
        text(input.erpProductCode),
        baseUom,
        Number.isFinite(ratio) && ratio > 0 ? ratio : 1,
        state,
        JSON.stringify(input.evidence || {}),
        actor,
      ],
    ) as Array<Record<string, unknown>>;
    return {
      policy: saved,
      erpInventoryFactsMutated: false,
      externalWriteExecuted: false,
    };
  }

  async reviewMasterMapping(
    id: string,
    input: ReviewWmsMasterMappingInput,
    actor: string,
  ) {
    if (!text(actor)) throw new BadRequestException('mapping review actor required');
    if (!['APPROVE', 'REJECT'].includes(input.decision)) {
      throw new BadRequestException('decision must be APPROVE or REJECT');
    }
    const mapping = await this.mappingRepository.findOne({ where: { id } });
    if (!mapping || !['WAREHOUSE', 'PRODUCT', 'UOM'].includes(mapping.mappingType)) {
      throw new NotFoundException('WMS master mapping not found');
    }
    if (input.decision === 'REJECT') {
      mapping.reviewStatus = 'REJECTED';
      mapping.reviewedBy = actor;
      mapping.reviewedAt = new Date();
      mapping.rawData = {
        ...(mapping.rawData || {}),
        rejectedAt: mapping.reviewedAt.toISOString(),
        rejectedBy: actor,
      };
      await this.mappingRepository.save(mapping);
      return {
        mapping,
        erpBusinessTablesMutated: false,
        externalWriteExecuted: false,
      };
    }

    const erpCode = text(input.erpCode);
    if (!erpCode) throw new BadRequestException('erpCode is required for WMS mapping approval');
    const erpEntityType = text(input.erpEntityType);
    if (!erpEntityType) {
      throw new BadRequestException('erpEntityType is required for WMS mapping approval');
    }
    const candidates = await this.loadWmsErpCandidates();
    const target = candidates[mapping.mappingType as WmsMappingType]
      .find((candidate) => (
        upper(candidate.code) === upper(erpCode)
        && candidate.entity_type === erpEntityType
      ));
    if (!target) throw new BadRequestException('ERP mapping target does not exist or is inactive');
    const classification = classifyChanjetWmsGap({
      mappingType: mapping.mappingType as WmsMappingType,
      sourceCode: mapping.chanjetCode || mapping.chanjetId,
      sourceName: mapping.chanjetName,
      mapped: false,
      conflict: mapping.matchStatus === 'CONFLICT',
      exactTargetCount: 0,
    });
    if (classification.gapClass === 'HOUSE_INVENTORY_BRIDGE_REQUIRED') {
      throw new BadRequestException(
        'breeding house cannot be mapped directly to a warehouse; define its canonical warehouse/location ownership first',
      );
    }
    if (classification.gapClass === 'LIVESTOCK_MASTER_REQUIRED') {
      throw new BadRequestException(
        'livestock identity requires a livestock inventory/accounting policy before WMS mapping',
      );
    }
    if (
      ['SKU_UOM_CONVERSION_REQUIRED', 'CONTEXTUAL_UOM_REQUIRED'].includes(classification.gapClass)
    ) {
      throw new BadRequestException(
        'packaging or contextual UOM requires a reviewed conversion/context policy before mapping',
      );
    }
    if (
      ['PRODUCT_SKU_MODEL_REQUIRED', 'MATERIAL_MASTER_CANDIDATE'].includes(classification.gapClass)
      && classification.suggestedEntityType
      && target.entity_type !== classification.suggestedEntityType
    ) {
      throw new BadRequestException(
        `source identity requires ERP ${classification.suggestedEntityType} target, received ${target.entity_type}`,
      );
    }
    const sourceCompanyCode = text(mapping.rawData?.sourceCompanyCode);
    if (
      mapping.mappingType === 'WAREHOUSE'
      && sourceCompanyCode
      && target.company_code
      && sourceCompanyCode !== target.company_code
    ) {
      throw new BadRequestException('warehouse target is outside the source account-book company');
    }
    mapping.erpCode = target.code;
    mapping.erpName = target.name;
    mapping.erpEntityType = target.entity_type;
    mapping.matchStatus = 'MANUAL';
    mapping.confidence = '1.00';
    mapping.reviewStatus = 'APPROVED';
    mapping.reviewedBy = actor;
    mapping.reviewedAt = new Date();
    mapping.rawData = {
      ...(mapping.rawData || {}),
      manualMappingEvidence: {
        reviewedAt: mapping.reviewedAt.toISOString(),
        reviewedBy: actor,
        sourceIdentity: `${mapping.mappingType}:${mapping.bookId}:${mapping.chanjetId}`,
        target: {
          code: target.code,
          name: target.name,
          companyCode: target.company_code,
          entityType: target.entity_type,
        },
        rule: 'explicit administrator selection validated against active ERP master data',
      },
    };
    await this.mappingRepository.save(mapping);
    return {
      mapping,
      erpBusinessTablesMutated: false,
      externalWriteExecuted: false,
    };
  }

  async listPromotionCandidates(limit = 200, state?: ChanjetWmsPromotionState) {
    return this.candidateRepository.find({
      where: state ? { state } : {},
      order: { updatedAt: 'DESC' },
      take: Math.max(1, Math.min(Number(limit) || 200, 1000)),
    });
  }

  async reviewPromotionCandidate(
    id: string,
    decision: 'APPROVE' | 'REJECT',
    actor: string,
  ) {
    if (!['APPROVE', 'REJECT'].includes(decision)) {
      throw new BadRequestException('decision must be APPROVE or REJECT');
    }
    const candidate = await this.candidateRepository.findOne({ where: { id } });
    if (!candidate) throw new NotFoundException('WMS promotion candidate not found');
    if (!actor) throw new BadRequestException('review actor required');

    if (decision === 'APPROVE') {
      const alignment = await this.integration?.wmsReadonlyAlignmentOverview();
      if (!alignment || alignment.decision !== 'GO') {
        throw new BadRequestException(
          'WMS readonly baseline is not approval-ready; all provider scopes must be fresh and successful',
        );
      }
      if (candidate.state !== 'CANDIDATE' || candidate.blockers.length > 0 || candidate.conditions.length > 0) {
        throw new BadRequestException(
          'WMS promotion candidate is not approval-ready; resolve blockers and conditions first',
        );
      }
      candidate.state = 'APPROVED';
      candidate.approvedBy = actor;
      candidate.approvedAt = new Date();
    } else {
      candidate.state = 'REJECTED';
      candidate.approvedBy = actor;
      candidate.approvedAt = new Date();
    }
    await this.candidateRepository.save(candidate);
    this.logger.log(
      `WMS promotion candidate ${candidate.id} reviewed as ${decision} by ${actor}`,
    );
    return {
      candidate,
      erpBusinessTablesMutated: false,
      externalWriteExecuted: false,
    };
  }

  async prepareWriteback(input: PrepareWmsWritebackInput, actor: string) {
    if (!input.approvalConfirmed || !text(input.approvalReference)) {
      throw new BadRequestException('explicit approval reference is required to prepare WMS writeback');
    }
    if (!text(actor)) throw new BadRequestException('outbox actor required');
    const documentType = upper(input.documentType);
    if (!WRITEBACK_DOCUMENT_TYPES.has(documentType)) {
      throw new BadRequestException(`unsupported WMS writeback document type: ${documentType || '(empty)'}`);
    }
    if (!text(input.erpDocumentNo)) {
      throw new BadRequestException('ERP WMS document number required');
    }
    if (!input.canonicalPayload || Object.keys(input.canonicalPayload).length === 0) {
      throw new BadRequestException('canonical WMS payload required');
    }
    const book = await this.bookMapRepository.findOne({
      where: {
        bookid: text(input.bookId),
        companyCode: text(input.companyCode),
        syncEnabled: true,
      },
    });
    if (!book) throw new BadRequestException('book/company mapping missing or disabled');

    const payloadHash = sha256(input.canonicalPayload);
    const idempotencyKey = [
      text(input.bookId),
      documentType,
      upper(input.erpDocumentNo),
      payloadHash.slice(0, 24),
    ].join(':');
    const previous = await this.outboxRepository.findOne({ where: { idempotencyKey } });
    if (previous) return previous;

    const saved = await this.outboxRepository.save(this.outboxRepository.create({
      bookId: text(input.bookId),
      companyCode: text(input.companyCode),
      documentType,
      erpDocumentNo: text(input.erpDocumentNo),
      idempotencyKey,
      payloadHash,
      canonicalPayload: input.canonicalPayload,
      state: 'READY',
      attemptCount: 0,
      maxAttempts: 3,
      nextAttemptAt: null,
      providerReceipt: null,
      readbackEvidence: null,
      errorMessage: null,
      compensationRef: '',
      externalWriteEnabled: false,
      createdBy: actor,
      approvedBy: actor,
      stateHistory: [{
        at: new Date().toISOString(),
        state: 'READY',
        actor,
        approvalReference: text(input.approvalReference),
        externalWriteEnabled: false,
      }],
    }));
    this.logger.log(
      `WMS writeback outbox ${saved.id} prepared for ${saved.erpDocumentNo}`,
    );
    return saved;
  }

  async listWritebackOutbox(limit = 100, state?: string) {
    return this.outboxRepository.find({
      where: state ? { state: state as ChanjetWmsWritebackOutboxEntity['state'] } : {},
      order: { updatedAt: 'DESC' },
      take: Math.max(1, Math.min(Number(limit) || 100, 500)),
    });
  }

  async executeExternalWrite(): Promise<never> {
    throw new ForbiddenException(
      'CHANJET_WMS_EXTERNAL_WRITE_DISABLED: no execution Gate or transport is exposed',
    );
  }

  private mappingChecks(
    document: NormalizedChanjetInventoryDocument,
    mappings: ChanjetMasterMappingEntity[],
    housePolicies: ApprovedHouseLocationPolicy[] = [],
    uomPolicies: ApprovedUomConversionPolicy[] = [],
  ): MappingCheck[] {
    const sources: Array<{ dimension: MappingDimension; code: string; contextCode?: string }> = [
      { dimension: 'WAREHOUSE', code: document.warehouseCode },
      ...document.lines.map((line) => ({
        dimension: 'WAREHOUSE' as const,
        code: line.warehouseCode,
      })),
      ...document.lines.map((line) => ({
        dimension: 'PRODUCT' as const,
        code: line.productCode,
      })),
      ...document.lines.map((line) => ({
        dimension: 'UOM' as const,
        code: line.unitName,
        contextCode: line.productCode,
      })),
      ...document.lines.map((line) => ({
        dimension: 'UOM' as const,
        code: line.secondaryUnitName,
        contextCode: line.productCode,
      })),
      ...(document.currencyCode
        ? [{ dimension: 'CURRENCY' as const, code: document.currencyCode }]
        : []),
    ];

    return unique(sources
      .filter((source) => !!text(source.code))
      .map((source) => `${source.dimension}:${upper(source.code)}:${upper(source.contextCode)}`))
      .map((key) => {
        const [dimension, code, contextCode] = key.split(':');
        const mapping = mappings.find((candidate) => (
          candidate.mappingType === dimension
          && candidate.bookId === document.bookId
          && upper(candidate.chanjetCode) === code
          && !!candidate.erpCode
          && candidate.reviewStatus === 'APPROVED'
          && ['MATCHED', 'MANUAL'].includes(candidate.matchStatus)
        ));
        const housePolicy = dimension === 'WAREHOUSE' && !mapping
          ? housePolicies.find((policy) => (
            policy.book_id === document.bookId
            && upper(policy.source_warehouse_code) === code
          ))
          : undefined;
        const uomPolicy = dimension === 'UOM' && !mapping
          ? uomPolicies.find((policy) => (
            policy.book_id === document.bookId
            && upper(policy.source_uom) === code
            && upper(policy.source_product_code) === contextCode
          ))
          : undefined;
        const mapped = !!mapping || !!housePolicy || !!uomPolicy;
        return {
          dimension: dimension as MappingDimension,
          sourceCode: code,
          contextCode: contextCode || undefined,
          mapped,
          erpCode: mapping?.erpCode
            || housePolicy?.erp_location_code
            || uomPolicy?.erp_base_uom
            || '',
          resolutionType: mapping
            ? 'MASTER_MAPPING' as const
            : housePolicy
              ? 'HOUSE_LOCATION_POLICY' as const
              : uomPolicy
                ? 'PRODUCT_UOM_POLICY' as const
                : undefined,
          reason: mapped
            ? ''
            : `${dimension}_MAPPING_REQUIRED:${code || 'SOURCE_CODE_MISSING'}`,
        };
      });
  }

  private async loadApprovedWmsPolicies() {
    const [houseLocations, uomConversions] = await Promise.all([
      this.mappingRepository.manager.query(`
        SELECT *
        FROM chanjet_wms_house_location_policies
        WHERE state = 'APPROVED'
      `) as Promise<ApprovedHouseLocationPolicy[]>,
      this.mappingRepository.manager.query(`
        SELECT *
        FROM chanjet_wms_uom_conversion_policies
        WHERE state = 'APPROVED'
      `) as Promise<ApprovedUomConversionPolicy[]>,
    ]);
    return { houseLocations, uomConversions };
  }

  private async loadWmsPolicies() {
    const [houseRows, uomRows] = await Promise.all([
      this.mappingRepository.manager.query(`
        SELECT *
        FROM chanjet_wms_house_location_policies
        ORDER BY updated_at DESC
      `) as Promise<Array<Record<string, unknown> & { state: string }>>,
      this.mappingRepository.manager.query(`
        SELECT *
        FROM chanjet_wms_uom_conversion_policies
        ORDER BY updated_at DESC
      `) as Promise<Array<Record<string, unknown> & { state: string }>>,
    ]);
    return {
      houseLocations: {
        total: houseRows.length,
        approved: houseRows.filter((row) => row.state === 'APPROVED').length,
        rows: houseRows,
      },
      uomConversions: {
        total: uomRows.length,
        approved: uomRows.filter((row) => row.state === 'APPROVED').length,
        rows: uomRows,
      },
    };
  }

  private collectWmsMappingSource(
    sources: Map<string, {
      mappingType: Extract<ChanjetMappingType, 'WAREHOUSE' | 'PRODUCT' | 'UOM'>;
      bookId: string;
      companyCode: string;
      code: string;
      name: string;
    }>,
    mappingType: Extract<ChanjetMappingType, 'WAREHOUSE' | 'PRODUCT' | 'UOM'>,
    bookId: string,
    companyCode: string,
    codeValue: string,
    nameValue: string,
  ): void {
    const code = text(codeValue);
    if (!code) return;
    const key = `${mappingType}:${bookId}:${upper(code)}`;
    const current = sources.get(key);
    if (!current || (!current.name && text(nameValue))) {
      sources.set(key, {
        mappingType,
        bookId,
        companyCode,
        code,
        name: text(nameValue),
      });
    }
  }

  private normalizedWmsName(value: string): string {
    return text(value)
      .normalize('NFKC')
      .replace(/[\s\u3000（）()\-—_]+/g, '')
      .toLowerCase();
  }

  private canonicalUomAlias(value: string): string {
    const normalized = this.normalizedWmsName(value);
    if (normalized === 'kg' || normalized === 'ｋｇ') {
      return this.normalizedWmsName('公斤');
    }
    return '';
  }

  private isWmsCandidateSemanticallyAllowed(
    classification: ChanjetWmsGapClassification,
    candidate: ErpMappingCandidate,
  ): boolean {
    if ([
      'HOUSE_INVENTORY_BRIDGE_REQUIRED',
      'LIVESTOCK_MASTER_REQUIRED',
      'SKU_UOM_CONVERSION_REQUIRED',
      'CONTEXTUAL_UOM_REQUIRED',
    ].includes(classification.gapClass)) {
      return false;
    }
    if (
      ['PRODUCT_SKU_MODEL_REQUIRED', 'MATERIAL_MASTER_CANDIDATE'].includes(classification.gapClass)
      && classification.suggestedEntityType
    ) {
      return candidate.entity_type === classification.suggestedEntityType;
    }
    return true;
  }

  private async loadWmsErpCandidates(): Promise<Record<WmsMappingType, ErpMappingCandidate[]>> {
    const [warehouses, products, units] = await Promise.all([
      this.mappingRepository.manager.query(`
        SELECT
          warehouse_code AS code,
          COALESCE(NULLIF(warehouse_name_zh, ''), warehouse_name, '') AS name,
          COALESCE(company_code, '') AS company_code,
          'WAREHOUSE' AS entity_type
        FROM wms_warehouses
        WHERE status = 'ACTIVE'
      `) as Promise<ErpMappingCandidate[]>,
      this.mappingRepository.manager.query(`
        SELECT code, name, company_code, entity_type
        FROM (
          SELECT
            product_code AS code,
            COALESCE(NULLIF(product_name_zh, ''), product_name, '') AS name,
            '' AS company_code,
            'PRODUCT' AS entity_type
          FROM mst_products
          WHERE status = 'ACTIVE'
          UNION ALL
          SELECT
            sku_code AS code,
            COALESCE(NULLIF(sku_name, ''), product_name, '') AS name,
            '' AS company_code,
            'SKU' AS entity_type
          FROM product_skus
          WHERE status = 'ACTIVE'
          UNION ALL
          SELECT
            material_code AS code,
            COALESCE(material_name, '') AS name,
            '' AS company_code,
            'MATERIAL' AS entity_type
          FROM mst_materials
          WHERE status = 'ACTIVE'
        ) candidates
      `) as Promise<ErpMappingCandidate[]>,
      this.mappingRepository.manager.query(`
        SELECT DISTINCT
          unit_name AS code,
          unit_name AS name,
          '' AS company_code,
          'UOM' AS entity_type
        FROM (
          SELECT NULLIF(TRIM(unit_zh), '') AS unit_name
          FROM mst_products
          WHERE status = 'ACTIVE'
          UNION
          SELECT NULLIF(TRIM(base_unit), '')
          FROM packaging_specs
          WHERE status = 'ACTIVE'
          UNION
          SELECT NULLIF(TRIM(display_unit), '')
          FROM packaging_specs
          WHERE status = 'ACTIVE'
          UNION
          SELECT NULLIF(TRIM(COALESCE(dict_label_zh, name, dict_value)), '')
          FROM sys_dict
          WHERE status = 'ACTIVE'
            AND dict_type = 'INV_UOM'
        ) source
        WHERE unit_name IS NOT NULL
      `) as Promise<ErpMappingCandidate[]>,
    ]);
    return { WAREHOUSE: warehouses, PRODUCT: products, UOM: units };
  }

  private mappingRank(mapping: ChanjetMasterMappingEntity): number {
    if (
      mapping.reviewStatus === 'APPROVED'
      && ['MATCHED', 'MANUAL'].includes(mapping.matchStatus)
      && mapping.erpCode
    ) return 400;
    if (mapping.reviewStatus === 'APPROVED' && mapping.matchStatus === 'SOURCE_ONLY') return 300;
    if (mapping.reviewStatus === 'APPROVED') return 200;
    return 100;
  }

  private promotionState(
    blockers: string[],
    missingMappings: MappingCheck[],
    manualReviewRequired: boolean,
  ): ChanjetWmsPromotionState {
    if (blockers.length > 0) return 'HOLD';
    if (missingMappings.length > 0) return 'NEED_MAPPING';
    if (manualReviewRequired) return 'NEED_MANUAL_REVIEW';
    return 'CANDIDATE';
  }

  private emptyStateCounts(): Record<ChanjetWmsPromotionState, number> {
    return {
      CANDIDATE: 0,
      NEED_MAPPING: 0,
      NEED_MANUAL_REVIEW: 0,
      HOLD: 0,
      APPROVED: 0,
      PROMOTED: 0,
      REJECTED: 0,
    };
  }
}
