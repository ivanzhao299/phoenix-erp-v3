import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
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
  mapped: boolean;
  erpCode: string;
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

export interface PrepareWmsWritebackInput {
  bookId: string;
  companyCode: string;
  documentType: string;
  erpDocumentNo: string;
  canonicalPayload: Record<string, unknown>;
  approvalReference: string;
  approvalConfirmed: boolean;
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
  ) {}

  async overview() {
    const [bookMaps, sourceCount, candidateCount, outboxCount, candidateStates, outboxStates] = await Promise.all([
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
    ]);

    return {
      decision: sourceCount > 0 && bookMaps.length > 0 ? 'GO_WITH_CONDITIONS' : 'HOLD',
      activeBookCount: bookMaps.length,
      sourceDocumentCount: sourceCount,
      promotionCandidateCount: candidateCount,
      promotionStates: Object.fromEntries(candidateStates.map((row) => [row.state, Number(row.count)])),
      writebackOutboxCount: outboxCount,
      writebackStates: Object.fromEntries(outboxStates.map((row) => [row.state, Number(row.count)])),
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
    const [bookMaps, snapshots, mappings] = await Promise.all([
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
      const checks = this.mappingChecks(document, mappings);
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
  ): MappingCheck[] {
    const sources: Array<{ dimension: MappingDimension; code: string }> = [
      { dimension: 'WAREHOUSE', code: document.warehouseCode },
      ...document.lines.map((line) => ({ dimension: 'WAREHOUSE' as const, code: line.warehouseCode })),
      ...document.lines.map((line) => ({ dimension: 'PRODUCT' as const, code: line.productCode })),
      ...document.lines.map((line) => ({ dimension: 'UOM' as const, code: line.unitName })),
      ...(document.currencyCode ? [{ dimension: 'CURRENCY' as const, code: document.currencyCode }] : []),
    ];

    return unique(sources.map((source) => `${source.dimension}:${upper(source.code)}`))
      .map((key) => {
        const [dimension, ...codeParts] = key.split(':');
        const code = codeParts.join(':');
        const mapping = mappings.find((candidate) => (
          candidate.mappingType === dimension
          && candidate.bookId === document.bookId
          && upper(candidate.chanjetCode) === code
          && !!candidate.erpCode
          && candidate.reviewStatus === 'APPROVED'
          && ['MATCHED', 'MANUAL'].includes(candidate.matchStatus)
        ));
        return {
          dimension: dimension as MappingDimension,
          sourceCode: code,
          mapped: !!mapping,
          erpCode: mapping?.erpCode || '',
          reason: mapping
            ? ''
            : `${dimension}_MAPPING_REQUIRED:${code || 'SOURCE_CODE_MISSING'}`,
        };
      });
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
