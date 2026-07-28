import {
  ChanjetInventoryEntityType,
  NormalizedChanjetInventoryDocument,
  NormalizedChanjetInventoryLine,
} from './chanjet-wms-readonly.contract';

export type ChanjetWmsReconciliationStatus =
  | 'OK'
  | 'WARN'
  | 'MISMATCH'
  | 'HOLD'
  | 'NEED_MAPPING'
  | 'NEED_MANUAL_REVIEW';

export interface ChanjetWmsDecision {
  status: ChanjetWmsReconciliationStatus;
  reasons: string[];
}

export interface ChanjetWmsCanonicalIdentity extends ChanjetWmsDecision {
  key: string;
  identitySource: 'EXTERNAL_ID' | 'EXTERNAL_CODE' | 'NONE';
  bookId: string;
  entityType: ChanjetInventoryEntityType;
  externalIdentity: string;
}

export interface ChanjetWmsMasterRecord {
  id: string;
  bookId: string;
  code: string;
  name: string;
  status: string;
}

export interface ChanjetWmsMasterMappingDecision extends ChanjetWmsDecision {
  matchedId: string | null;
  matchBasis: 'BOOK_CODE_NAME_STATUS' | 'CODE_ONLY' | 'NAME_ONLY_REJECTED' | 'NONE';
  candidateIds: string[];
}

export interface ErpWmsLineSnapshot {
  externalLineId?: string;
  externalLineCode?: string;
  productCode: string;
  productName?: string;
  warehouseCode: string;
  warehouseName?: string;
  inventoryLotNo?: string;
  quantity: number | null;
  unitName: string;
  secondaryQuantity?: number | null;
  secondaryUnitName?: string;
  netAmountWithTax?: number | null;
  costAmount?: number | null;
}

export interface ErpWmsDocumentSnapshot {
  bookId: string;
  entityType: ChanjetInventoryEntityType;
  externalDocumentId?: string;
  externalDocumentCode?: string;
  status: string;
  redBlueFlag: string;
  businessDate: string;
  warehouseCode: string;
  sourceOrderNo?: string;
  lines: ErpWmsLineSnapshot[];
}

export interface ChanjetWmsReconciliationDifference {
  field: string;
  chanjetValue: unknown;
  erpValue: unknown;
  reason: string;
}

export interface ChanjetWmsLineReconciliation extends ChanjetWmsDecision {
  lineKey: string;
  differences: ChanjetWmsReconciliationDifference[];
}

export interface ChanjetWmsDocumentReconciliation extends ChanjetWmsDecision {
  identity: ChanjetWmsCanonicalIdentity;
  differences: ChanjetWmsReconciliationDifference[];
  lines: ChanjetWmsLineReconciliation[];
}

export interface ChanjetWmsLineReconciliationOptions {
  productMapping?: ChanjetWmsDecision;
  warehouseMapping?: ChanjetWmsDecision;
  redBlueFlag: string;
  quantityTolerance?: number;
  amountTolerance?: number;
}

export interface ChanjetWmsDocumentReconciliationOptions {
  companyMapping?: ChanjetWmsDecision;
  warehouseMapping?: ChanjetWmsDecision;
  lineMappings?: Record<string, {
    productMapping?: ChanjetWmsDecision;
    warehouseMapping?: ChanjetWmsDecision;
  }>;
  quantityTolerance?: number;
  amountTolerance?: number;
}

const STATUS_PRIORITY: Record<ChanjetWmsReconciliationStatus, number> = {
  OK: 0,
  WARN: 1,
  MISMATCH: 2,
  NEED_MANUAL_REVIEW: 3,
  NEED_MAPPING: 4,
  HOLD: 5,
};

const ACTIVE_STATUSES = new Set(['ACTIVE', 'ENABLED', 'EFFECTIVE', 'NORMAL']);
const INACTIVE_STATUSES = new Set(['INACTIVE', 'DISABLED', 'ARCHIVED', 'DELETED', 'STOPPED']);
const COMPLETED_STATUSES = new Set(['COMPLETED', 'EFFECTIVE', 'POSTED', 'CONFIRMED']);
const PENDING_STATUSES = new Set(['PENDING', 'SUBMITTED', 'DRAFT']);
const BLUE_FLAGS = new Set(['BLUE', 'BLUE_VOUCHER', 'NORMAL', 'POSITIVE', '蓝字']);
const RED_FLAGS = new Set(['RED', 'RED_VOUCHER', 'NEGATIVE', '红字']);

const normalizedText = (value: unknown): string => String(value ?? '').trim();
const normalizedCode = (value: unknown): string => normalizedText(value).toUpperCase();
const normalizedName = (value: unknown): string => normalizedText(value)
  .normalize('NFKC')
  .replace(/\s+/g, '')
  .toLocaleLowerCase();

const unique = (values: string[]): string[] => [...new Set(values.filter(Boolean))];

const combineStatus = (
  statuses: ChanjetWmsReconciliationStatus[],
): ChanjetWmsReconciliationStatus => statuses.reduce(
  (current, candidate) => (
    STATUS_PRIORITY[candidate] > STATUS_PRIORITY[current] ? candidate : current
  ),
  'OK',
);

const classifyMasterStatus = (status: string): 'ACTIVE' | 'INACTIVE' | 'UNKNOWN' => {
  const value = normalizedCode(status);
  if (ACTIVE_STATUSES.has(value)) return 'ACTIVE';
  if (INACTIVE_STATUSES.has(value)) return 'INACTIVE';
  return 'UNKNOWN';
};

const classifyWorkflowStatus = (status: string): 'COMPLETED' | 'PENDING' | 'UNKNOWN' => {
  const value = normalizedCode(status);
  if (COMPLETED_STATUSES.has(value)) return 'COMPLETED';
  if (PENDING_STATUSES.has(value)) return 'PENDING';
  return 'UNKNOWN';
};

const classifyRedBlue = (flag: string): 'BLUE' | 'RED' | 'UNKNOWN' => {
  const value = normalizedCode(flag);
  if (BLUE_FLAGS.has(value)) return 'BLUE';
  if (RED_FLAGS.has(value)) return 'RED';
  return 'UNKNOWN';
};

const canonicalSegment = (value: string): string => encodeURIComponent(value.trim());

const closeEnough = (left: number | null | undefined, right: number | null | undefined, tolerance: number): boolean => {
  if (left === null || left === undefined || right === null || right === undefined) {
    return left === right || (
      (left === null || left === undefined)
      && (right === null || right === undefined)
    );
  }
  return Math.abs(left - right) <= tolerance;
};

const effectiveQuantity = (quantity: number | null | undefined, direction: 'BLUE' | 'RED'): number | null => {
  if (quantity === null || quantity === undefined) return null;
  return direction === 'RED' ? -Math.abs(quantity) : Math.abs(quantity);
};

const lineIdentity = (
  line: Pick<NormalizedChanjetInventoryLine, 'externalLineId' | 'externalLineCode' | 'productCode' | 'inventoryLotNo'>,
  index = 0,
): string => normalizedText(line.externalLineId)
  || normalizedText(line.externalLineCode)
  || [normalizedCode(line.productCode), normalizedCode(line.inventoryLotNo), String(index)].join(':');

const pushDifference = (
  differences: ChanjetWmsReconciliationDifference[],
  field: string,
  chanjetValue: unknown,
  erpValue: unknown,
  reason: string,
): void => {
  differences.push({ field, chanjetValue, erpValue, reason });
};

export function buildChanjetWmsCanonicalIdentity(input: {
  bookId: string;
  entityType: ChanjetInventoryEntityType;
  externalDocumentId?: string;
  externalDocumentCode?: string;
}): ChanjetWmsCanonicalIdentity {
  const bookId = normalizedText(input.bookId);
  const externalId = normalizedText(input.externalDocumentId);
  const externalCode = normalizedText(input.externalDocumentCode);
  const externalIdentity = externalId || externalCode;
  const identitySource = externalId ? 'EXTERNAL_ID' : externalCode ? 'EXTERNAL_CODE' : 'NONE';
  const reasons: string[] = [];

  if (!bookId) reasons.push('BOOK_ID_MISSING');
  if (!externalIdentity) reasons.push('EXTERNAL_DOCUMENT_IDENTITY_MISSING');

  const status: ChanjetWmsReconciliationStatus = reasons.length > 0
    ? 'HOLD'
    : identitySource === 'EXTERNAL_CODE'
      ? 'WARN'
      : 'OK';
  if (status === 'WARN') reasons.push('EXTERNAL_ID_MISSING_CODE_FALLBACK_USED');

  return {
    status,
    reasons,
    key: reasons.some((reason) => reason.endsWith('_MISSING'))
      ? ''
      : [
        canonicalSegment(bookId),
        canonicalSegment(input.entityType),
        identitySource === 'EXTERNAL_ID' ? 'id' : 'code',
        canonicalSegment(externalIdentity),
      ].join(':'),
    identitySource,
    bookId,
    entityType: input.entityType,
    externalIdentity,
  };
}

export function decideChanjetWmsMasterMapping(
  source: Omit<ChanjetWmsMasterRecord, 'id'>,
  candidates: ChanjetWmsMasterRecord[],
): ChanjetWmsMasterMappingDecision {
  const bookId = normalizedText(source.bookId);
  const code = normalizedCode(source.code);
  const name = normalizedName(source.name);
  const sourceStatus = classifyMasterStatus(source.status);

  if (!bookId || !code) {
    return {
      status: 'NEED_MAPPING',
      reasons: unique([
        !bookId ? 'SOURCE_BOOK_ID_MISSING' : '',
        !code ? 'SOURCE_CODE_MISSING' : '',
      ]),
      matchedId: null,
      matchBasis: 'NONE',
      candidateIds: [],
    };
  }
  if (sourceStatus === 'UNKNOWN') {
    return {
      status: 'HOLD',
      reasons: ['SOURCE_STATUS_UNKNOWN'],
      matchedId: null,
      matchBasis: 'NONE',
      candidateIds: [],
    };
  }

  const sameBook = candidates.filter((candidate) => normalizedText(candidate.bookId) === bookId);
  const exactCode = sameBook.filter((candidate) => normalizedCode(candidate.code) === code);
  const nameOnly = name
    ? sameBook.filter((candidate) => (
      normalizedName(candidate.name) === name
      && normalizedCode(candidate.code) !== code
    ))
    : [];

  if (exactCode.length === 0) {
    return {
      status: nameOnly.length > 0 ? 'NEED_MANUAL_REVIEW' : 'NEED_MAPPING',
      reasons: [nameOnly.length > 0 ? 'NAME_ONLY_MATCH_REJECTED' : 'EXACT_CODE_MATCH_NOT_FOUND'],
      matchedId: null,
      matchBasis: nameOnly.length > 0 ? 'NAME_ONLY_REJECTED' : 'NONE',
      candidateIds: nameOnly.map((candidate) => candidate.id),
    };
  }
  if (exactCode.length > 1) {
    return {
      status: 'HOLD',
      reasons: ['DUPLICATE_BOOK_CODE_CANDIDATES'],
      matchedId: null,
      matchBasis: 'CODE_ONLY',
      candidateIds: exactCode.map((candidate) => candidate.id),
    };
  }

  const candidate = exactCode[0];
  const candidateStatus = classifyMasterStatus(candidate.status);
  if (candidateStatus === 'UNKNOWN') {
    return {
      status: 'HOLD',
      reasons: ['CANDIDATE_STATUS_UNKNOWN'],
      matchedId: null,
      matchBasis: 'CODE_ONLY',
      candidateIds: [candidate.id],
    };
  }
  if (!name || normalizedName(candidate.name) !== name) {
    return {
      status: 'NEED_MANUAL_REVIEW',
      reasons: [!name ? 'SOURCE_NAME_MISSING' : 'BOOK_CODE_MATCH_NAME_MISMATCH'],
      matchedId: candidate.id,
      matchBasis: 'CODE_ONLY',
      candidateIds: [candidate.id],
    };
  }
  if (sourceStatus !== candidateStatus) {
    return {
      status: 'MISMATCH',
      reasons: ['BOOK_CODE_NAME_MATCH_STATUS_MISMATCH'],
      matchedId: candidate.id,
      matchBasis: 'BOOK_CODE_NAME_STATUS',
      candidateIds: [candidate.id],
    };
  }

  return {
    status: sourceStatus === 'ACTIVE' ? 'OK' : 'WARN',
    reasons: sourceStatus === 'ACTIVE' ? [] : ['MATCHED_MASTER_DATA_IS_INACTIVE'],
    matchedId: candidate.id,
    matchBasis: 'BOOK_CODE_NAME_STATUS',
    candidateIds: [candidate.id],
  };
}

export function reconcileChanjetWmsLine(
  chanjet: NormalizedChanjetInventoryLine,
  erp: ErpWmsLineSnapshot | null,
  options: ChanjetWmsLineReconciliationOptions,
): ChanjetWmsLineReconciliation {
  const lineKey = lineIdentity(chanjet);
  const differences: ChanjetWmsReconciliationDifference[] = [];
  const statuses: ChanjetWmsReconciliationStatus[] = [];
  const reasons: string[] = [];
  const direction = classifyRedBlue(options.redBlueFlag);
  const quantityTolerance = options.quantityTolerance ?? 0.000001;
  const amountTolerance = options.amountTolerance ?? 0.01;

  if (options.productMapping) {
    statuses.push(options.productMapping.status);
    reasons.push(...options.productMapping.reasons.map((reason) => `PRODUCT_MAPPING_${reason}`));
  }
  if (options.warehouseMapping) {
    const warehouseStatus = ['NEED_MAPPING', 'NEED_MANUAL_REVIEW'].includes(options.warehouseMapping.status)
      ? 'HOLD'
      : options.warehouseMapping.status;
    statuses.push(warehouseStatus);
    reasons.push(...options.warehouseMapping.reasons.map((reason) => `WAREHOUSE_MAPPING_${reason}`));
    if (warehouseStatus === 'HOLD' && options.warehouseMapping.status !== 'HOLD') {
      reasons.push('WAREHOUSE_MAPPING_REQUIRED_FOR_STOCK_RECONCILIATION');
    }
  }
  if (direction === 'UNKNOWN') {
    statuses.push('HOLD');
    reasons.push('RED_BLUE_FLAG_UNKNOWN');
  }
  if (!normalizedCode(chanjet.productCode)) {
    statuses.push('NEED_MAPPING');
    reasons.push('PRODUCT_CODE_MISSING');
  }
  if (!normalizedCode(chanjet.warehouseCode)) {
    statuses.push('HOLD');
    reasons.push('WAREHOUSE_CODE_MISSING');
  }
  if (!normalizedText(chanjet.unitName)) {
    statuses.push('HOLD');
    reasons.push('PRIMARY_UOM_MISSING');
  }

  const chanjetHasSecondaryQty = chanjet.secondaryQuantity !== null;
  const chanjetHasSecondaryUom = Boolean(normalizedText(chanjet.secondaryUnitName));
  if (chanjetHasSecondaryQty !== chanjetHasSecondaryUom) {
    statuses.push('HOLD');
    reasons.push('CHANJET_DUAL_UOM_INCOMPLETE');
  }

  if (!erp) {
    statuses.push('MISMATCH');
    reasons.push('ERP_LINE_MISSING');
    return {
      status: combineStatus(statuses),
      reasons: unique(reasons),
      lineKey,
      differences: [{
        field: 'line',
        chanjetValue: lineKey,
        erpValue: null,
        reason: 'ERP_LINE_MISSING',
      }],
    };
  }

  if (normalizedCode(chanjet.productCode) !== normalizedCode(erp.productCode)) {
    statuses.push('MISMATCH');
    reasons.push('PRODUCT_CODE_MISMATCH');
    pushDifference(differences, 'productCode', chanjet.productCode, erp.productCode, 'PRODUCT_CODE_MISMATCH');
  }
  if (normalizedCode(chanjet.warehouseCode) !== normalizedCode(erp.warehouseCode)) {
    statuses.push('MISMATCH');
    reasons.push('WAREHOUSE_CODE_MISMATCH');
    pushDifference(differences, 'warehouseCode', chanjet.warehouseCode, erp.warehouseCode, 'WAREHOUSE_CODE_MISMATCH');
  }
  if (normalizedCode(chanjet.inventoryLotNo) !== normalizedCode(erp.inventoryLotNo)) {
    statuses.push('MISMATCH');
    reasons.push('INVENTORY_LOT_MISMATCH');
    pushDifference(differences, 'inventoryLotNo', chanjet.inventoryLotNo, erp.inventoryLotNo, 'INVENTORY_LOT_MISMATCH');
  }
  if (normalizedName(chanjet.unitName) !== normalizedName(erp.unitName)) {
    statuses.push('HOLD');
    reasons.push('PRIMARY_UOM_MISMATCH');
    pushDifference(differences, 'unitName', chanjet.unitName, erp.unitName, 'PRIMARY_UOM_MISMATCH');
  }

  const erpSecondaryQuantity = erp.secondaryQuantity ?? null;
  const erpSecondaryUnitName = erp.secondaryUnitName ?? '';
  const erpHasSecondaryQty = erpSecondaryQuantity !== null;
  const erpHasSecondaryUom = Boolean(normalizedText(erpSecondaryUnitName));
  if (erpHasSecondaryQty !== erpHasSecondaryUom) {
    statuses.push('HOLD');
    reasons.push('ERP_DUAL_UOM_INCOMPLETE');
  }
  if (chanjetHasSecondaryQty !== erpHasSecondaryQty || chanjetHasSecondaryUom !== erpHasSecondaryUom) {
    statuses.push('HOLD');
    reasons.push('DUAL_UOM_PRESENCE_MISMATCH');
    pushDifference(
      differences,
      'secondaryUom',
      { quantity: chanjet.secondaryQuantity, unitName: chanjet.secondaryUnitName },
      { quantity: erpSecondaryQuantity, unitName: erpSecondaryUnitName },
      'DUAL_UOM_PRESENCE_MISMATCH',
    );
  } else if (
    chanjetHasSecondaryUom
    && normalizedName(chanjet.secondaryUnitName) !== normalizedName(erpSecondaryUnitName)
  ) {
    statuses.push('HOLD');
    reasons.push('SECONDARY_UOM_MISMATCH');
    pushDifference(
      differences,
      'secondaryUnitName',
      chanjet.secondaryUnitName,
      erpSecondaryUnitName,
      'SECONDARY_UOM_MISMATCH',
    );
  }

  if (direction !== 'UNKNOWN') {
    const chanjetQuantity = effectiveQuantity(chanjet.quantity, direction);
    const erpQuantity = effectiveQuantity(erp.quantity, direction);
    if (!closeEnough(chanjetQuantity, erpQuantity, quantityTolerance)) {
      statuses.push('MISMATCH');
      reasons.push('PRIMARY_QUANTITY_MISMATCH');
      pushDifference(differences, 'quantity', chanjetQuantity, erpQuantity, 'PRIMARY_QUANTITY_MISMATCH');
    }
    const chanjetSecondary = effectiveQuantity(chanjet.secondaryQuantity, direction);
    const erpSecondary = effectiveQuantity(erpSecondaryQuantity, direction);
    if (!closeEnough(chanjetSecondary, erpSecondary, quantityTolerance)) {
      statuses.push('MISMATCH');
      reasons.push('SECONDARY_QUANTITY_MISMATCH');
      pushDifference(
        differences,
        'secondaryQuantity',
        chanjetSecondary,
        erpSecondary,
        'SECONDARY_QUANTITY_MISMATCH',
      );
    }
  }

  for (const [field, chanjetValue, erpValue] of [
    ['netAmountWithTax', chanjet.netAmountWithTax, erp.netAmountWithTax],
    ['costAmount', chanjet.costAmount, erp.costAmount],
  ] as const) {
    if (!closeEnough(chanjetValue, erpValue, amountTolerance)) {
      statuses.push('MISMATCH');
      reasons.push(`${field.toUpperCase()}_MISMATCH`);
      pushDifference(differences, field, chanjetValue, erpValue, `${field.toUpperCase()}_MISMATCH`);
    }
  }

  return {
    status: combineStatus(statuses),
    reasons: unique(reasons),
    lineKey,
    differences,
  };
}

export function reconcileChanjetWmsDocument(
  chanjet: NormalizedChanjetInventoryDocument | null,
  erp: ErpWmsDocumentSnapshot | null,
  options: ChanjetWmsDocumentReconciliationOptions = {},
): ChanjetWmsDocumentReconciliation {
  const fallbackEntityType = chanjet?.entityType ?? erp?.entityType ?? 'STOCK_IN';
  const identity = buildChanjetWmsCanonicalIdentity({
    bookId: chanjet?.bookId ?? erp?.bookId ?? '',
    entityType: fallbackEntityType,
    externalDocumentId: chanjet?.externalDocumentId ?? erp?.externalDocumentId,
    externalDocumentCode: chanjet?.externalDocumentCode ?? erp?.externalDocumentCode,
  });
  const differences: ChanjetWmsReconciliationDifference[] = [];
  const statuses: ChanjetWmsReconciliationStatus[] = [identity.status];
  const reasons: string[] = [...identity.reasons];

  for (const [domain, decision] of [
    ['COMPANY', options.companyMapping],
    ['WAREHOUSE', options.warehouseMapping],
  ] as const) {
    if (!decision) continue;
    const status = domain === 'WAREHOUSE'
      && ['NEED_MAPPING', 'NEED_MANUAL_REVIEW'].includes(decision.status)
      ? 'HOLD'
      : decision.status;
    statuses.push(status);
    reasons.push(...decision.reasons.map((reason) => `${domain}_MAPPING_${reason}`));
    if (status === 'HOLD' && decision.status !== 'HOLD') {
      reasons.push(`${domain}_MAPPING_REQUIRED_FOR_STOCK_RECONCILIATION`);
    }
  }

  if (!chanjet && erp) {
    return {
      status: 'WARN',
      reasons: unique([...reasons, 'CHANJET_DOCUMENT_NOT_IN_CURRENT_SYNC_SCOPE']),
      identity,
      differences: [{
        field: 'document',
        chanjetValue: null,
        erpValue: identity.externalIdentity,
        reason: 'CHANJET_DOCUMENT_NOT_IN_CURRENT_SYNC_SCOPE',
      }],
      lines: [],
    };
  }
  if (chanjet && !erp) {
    const chanjetStatus = classifyWorkflowStatus(chanjet.status);
    const status = chanjetStatus === 'UNKNOWN'
      ? 'HOLD'
      : chanjetStatus === 'COMPLETED'
        ? 'MISMATCH'
        : 'WARN';
    return {
      status: combineStatus([...statuses, status]),
      reasons: unique([
        ...reasons,
        chanjetStatus === 'UNKNOWN' ? 'CHANJET_STATUS_UNKNOWN' : 'ERP_DOCUMENT_MISSING',
      ]),
      identity,
      differences: [{
        field: 'document',
        chanjetValue: identity.externalIdentity,
        erpValue: null,
        reason: 'ERP_DOCUMENT_MISSING',
      }],
      lines: [],
    };
  }
  if (!chanjet || !erp) {
    return {
      status: 'HOLD',
      reasons: unique([...reasons, 'BOTH_DOCUMENTS_MISSING']),
      identity,
      differences,
      lines: [],
    };
  }

  const chanjetStatus = classifyWorkflowStatus(chanjet.status);
  const erpStatus = classifyWorkflowStatus(erp.status);
  const chanjetDirection = classifyRedBlue(chanjet.redBlueFlag);
  const erpDirection = classifyRedBlue(erp.redBlueFlag);

  if (chanjetStatus === 'UNKNOWN' || erpStatus === 'UNKNOWN') {
    statuses.push('HOLD');
    reasons.push(chanjetStatus === 'UNKNOWN' ? 'CHANJET_STATUS_UNKNOWN' : 'ERP_STATUS_UNKNOWN');
  } else if (chanjetStatus !== erpStatus) {
    statuses.push('MISMATCH');
    reasons.push('WORKFLOW_STATUS_MISMATCH');
    pushDifference(differences, 'status', chanjet.status, erp.status, 'WORKFLOW_STATUS_MISMATCH');
  }
  if (chanjetDirection === 'UNKNOWN' || erpDirection === 'UNKNOWN') {
    statuses.push('HOLD');
    reasons.push(chanjetDirection === 'UNKNOWN' ? 'CHANJET_RED_BLUE_FLAG_UNKNOWN' : 'ERP_RED_BLUE_FLAG_UNKNOWN');
  } else if (chanjetDirection !== erpDirection) {
    statuses.push('HOLD');
    reasons.push('RED_BLUE_DIRECTION_MISMATCH');
    pushDifference(
      differences,
      'redBlueFlag',
      chanjet.redBlueFlag,
      erp.redBlueFlag,
      'RED_BLUE_DIRECTION_MISMATCH',
    );
  }

  for (const [field, chanjetValue, erpValue] of [
    ['bookId', chanjet.bookId, erp.bookId],
    ['entityType', chanjet.entityType, erp.entityType],
    ['businessDate', chanjet.businessDate, erp.businessDate],
    ['warehouseCode', chanjet.warehouseCode, erp.warehouseCode],
    ['sourceOrderNo', chanjet.sourceOrderNo, erp.sourceOrderNo ?? ''],
  ] as const) {
    if (normalizedCode(chanjetValue) !== normalizedCode(erpValue)) {
      statuses.push('MISMATCH');
      reasons.push(`${field.toUpperCase()}_MISMATCH`);
      pushDifference(differences, field, chanjetValue, erpValue, `${field.toUpperCase()}_MISMATCH`);
    }
  }

  const erpLines = new Map<string, ErpWmsLineSnapshot[]>();
  erp.lines.forEach((line, index) => {
    const key = lineIdentity({
      externalLineId: line.externalLineId ?? '',
      externalLineCode: line.externalLineCode ?? '',
      productCode: line.productCode,
      inventoryLotNo: line.inventoryLotNo ?? '',
    }, index);
    erpLines.set(key, [...(erpLines.get(key) ?? []), line]);
  });

  const lineResults = chanjet.lines.map((line, index) => {
    const key = lineIdentity(line, index);
    const matches = erpLines.get(key) ?? [];
    if (matches.length > 1) {
      return {
        status: 'HOLD' as const,
        reasons: ['DUPLICATE_ERP_LINE_IDENTITY'],
        lineKey: key,
        differences: [{
          field: 'lineIdentity',
          chanjetValue: key,
          erpValue: matches.length,
          reason: 'DUPLICATE_ERP_LINE_IDENTITY',
        }],
      };
    }
    erpLines.delete(key);
    const mapping = options.lineMappings?.[key] ?? {};
    return reconcileChanjetWmsLine(line, matches[0] ?? null, {
      ...mapping,
      redBlueFlag: chanjet.redBlueFlag,
      quantityTolerance: options.quantityTolerance,
      amountTolerance: options.amountTolerance,
    });
  });

  const extraErpLines = [...erpLines.entries()].flatMap(([key, lines]) => lines.map(() => ({
    status: 'WARN' as const,
    reasons: ['ERP_LINE_NOT_IN_CURRENT_CHANJET_SCOPE'],
    lineKey: key,
    differences: [{
      field: 'line',
      chanjetValue: null,
      erpValue: key,
      reason: 'ERP_LINE_NOT_IN_CURRENT_CHANJET_SCOPE',
    }],
  })));
  const lines = [...lineResults, ...extraErpLines];
  statuses.push(...lines.map((line) => line.status));
  reasons.push(...lines.flatMap((line) => line.reasons));

  return {
    status: combineStatus(statuses),
    reasons: unique(reasons),
    identity,
    differences,
    lines,
  };
}

export class ChanjetWmsReconciliationService {
  canonicalIdentity = buildChanjetWmsCanonicalIdentity;
  decideMasterMapping = decideChanjetWmsMasterMapping;
  reconcileLine = reconcileChanjetWmsLine;
  reconcileDocument = reconcileChanjetWmsDocument;
}
