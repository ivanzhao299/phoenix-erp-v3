import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { createHash } from 'crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { ChanjetAuthService } from './chanjet-auth.service';
import {
  ChanjetHoldResolutionAuditService,
  ChanjetHoldResolutionItem,
} from './chanjet-hold-resolution-audit.service';

export type ChanjetProductNameCanaryInput = {
  mappingId: string;
  auditHash: string;
  approveProduction: boolean;
  confirmation: string;
};

export type ChanjetProductNameCanaryEvidence = {
  mappingId: string;
  bookId: string;
  productCode: string;
  originalName: string;
  proposedName: string;
  beforeHash: string;
  afterHash: string;
  providerWriteAttempted: boolean;
  providerWriteSucceeded: boolean;
  rollbackAttempted: boolean;
  rollbackSucceeded: boolean;
  failureReadbackAttempted: boolean;
  failureReadbackVerified: boolean;
  providerStateAfterFailure: 'NOT_CHECKED' | 'ORIGINAL' | 'PROPOSED' | 'UNKNOWN';
  providerReadbackVerified: boolean;
  erpMirrorReadbackVerified: boolean;
  updatePayloadHash: string;
};

export class ChanjetProductNameCanaryError extends Error {
  constructor(
    message: string,
    readonly evidence: ChanjetProductNameCanaryEvidence,
  ) {
    super(message);
    this.name = 'ChanjetProductNameCanaryError';
  }
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function extractChanjetProductRows(payload: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(payload)) return payload.filter((item) => item && typeof item === 'object') as Array<Record<string, unknown>>;
  if (!payload || typeof payload !== 'object') return [];
  const root = record(payload);
  for (const key of ['rows', 'data', 'result', 'value']) {
    const nested = root[key];
    if (!nested || typeof nested !== 'object') continue;
    if (Array.isArray(nested)) return extractChanjetProductRows(nested);
    const nestedRecord = record(nested);
    if (Array.isArray(nestedRecord.rows)) return extractChanjetProductRows(nestedRecord.rows);
    const rows = extractChanjetProductRows(nested);
    if (rows.length) return rows;
  }
  return [];
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

/**
 * A deliberately small, non-sensitive view of the provider row used during
 * manual recovery. It exposes only the identity and business fields that the
 * name-only update contract is required to preserve.
 */
export function projectChanjetProductBusinessFields(product: Record<string, unknown>): Record<string, unknown> {
  const category = record(product.parentId);
  const baseUom = record(product.baseUomId);
  const status = record(product.statusEnum);
  return {
    id: String(product.id || ''),
    code: String(product.code || ''),
    name: String(product.name || ''),
    specNo: String(product.specNo || ''),
    status: String(status.value || status.code || product.statusEnum || ''),
    category: {
      id: String(category.id || ''),
      code: String(category.code || ''),
      name: String(category.name || ''),
    },
    baseUom: {
      id: String(baseUom.id || ''),
      code: String(baseUom.code || baseUom.uomCode || ''),
      name: String(baseUom.name || baseUom.uomName || ''),
    },
  };
}

/**
 * Compare the provider-supported business contract, not its opaque raw row.
 * Chanjet may add or refresh internal metadata after an update; those fields
 * are not part of the product update DTO and must not create false drift.
 */
export function chanjetProductInvariant(product: Record<string, unknown>): string {
  const businessFields = projectChanjetProductBusinessFields(product);
  delete businessFields.name;
  return JSON.stringify(canonicalize(businessFields));
}

/**
 * Chanjet's product list and update endpoints use different DTOs. Build the
 * update DTO from the exact provider row so category, base UOM, specification
 * and status remain explicit and unchanged while only productName is replaced.
 */
export function buildChanjetProductUpdatePayload(
  product: Record<string, unknown>,
  productName: string,
): Record<string, unknown> {
  const productCode = String(product.code || '').trim();
  const category = record(product.parentId);
  const baseUom = record(product.baseUomId);
  const status = record(product.statusEnum);
  const statusValue = String(status.value || status.code || product.statusEnum || '').trim();
  const payload: Record<string, unknown> = { productCode, productName };

  if (!productCode || !productName.trim()) throw new Error('provider product update identity is incomplete');
  if (typeof product.specNo === 'string') payload.specNo = product.specNo;
  if (statusValue) payload.statusEnum = statusValue;
  if (String(category.code || '') || String(category.name || '')) {
    payload.productCategory = {
      ...(String(category.code || '') ? { code: String(category.code) } : {}),
      ...(String(category.name || '') ? { name: String(category.name) } : {}),
    };
  }
  if (String(baseUom.uomName || '')) {
    payload.productUomSetting = { baseUomName: String(baseUom.uomName) };
  }
  return payload;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function updateAccepted(payload: unknown, productCode: string): boolean {
  const root = record(payload);
  if (root.success !== true && String(root.success).toLowerCase() !== 'true') return false;
  const results = Array.isArray(root.data) ? root.data.map(record) : [];
  // The current provider contract may return an empty data array on success.
  // If it does return per-row results, fail closed unless the one requested
  // product is the only result and carries no row-level error.
  if (!results.length) return true;
  if (results.length !== 1) return false;
  const target = results[0];
  const returnedCode = String(target.productCode || target.code || '');
  return returnedCode === productCode
    && !String(target.errorCode || target.error || target.message || '').trim();
}

@Injectable()
export class ChanjetProductNameCanaryService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly auth: ChanjetAuthService,
    private readonly holdAudit: ChanjetHoldResolutionAuditService,
  ) {}

  async preflight(input: { mappingId: string; auditHash: string }): Promise<{
    decision: 'READY_FOR_EXPLICIT_APPROVAL';
    auditHash: string;
    mappingId: string;
    bookId: string;
    productCode: string;
    currentName: string;
    proposedName: string;
    providerRowHash: string;
    providerInvariantHash: string;
    providerState: 'ORIGINAL' | 'PROPOSED';
    businessFields: Record<string, unknown>;
    updatePayloadHash: string;
    updatePayloadFields: string[];
    providerCalls: 1;
    writeChanjet: false;
    writeErpBusinessTables: false;
  }> {
    const { audit, target } = await this.approvedTarget(input.mappingId, input.auditHash);
    const rows = await this.ds.query(
      `SELECT id::text, mapping_type, book_id, chanjet_id, chanjet_code,
              chanjet_name, match_status, review_status
         FROM chanjet_master_mapping
        WHERE id=$1`,
      [target.mappingId],
    );
    this.assertMappingRow(rows[0], target);
    const proposal = target.chanjetChangeProposal!;
    const listPath = `/accounting/openapi/cc/product/list/${target.bookId}`;
    const providerEnvelope = await this.auth.callApi<Record<string, unknown>>(listPath, {
      method: 'POST',
      body: { codes: [target.chanjetCode], pageSize: 20, pageNo: 1 },
      kind: 'READ',
    });
    const providerProduct = this.exactProduct(providerEnvelope, target.chanjetCode);
    const providerName = String(providerProduct.name || '');
    if (![proposal.currentValue, proposal.proposedValue].includes(providerName)) {
      throw new Error(`provider product name changed after audit: ${providerName || 'EMPTY'}`);
    }
    const updatePayload = buildChanjetProductUpdatePayload(providerProduct, proposal.proposedValue);
    return {
      decision: 'READY_FOR_EXPLICIT_APPROVAL',
      auditHash: audit.auditHash,
      mappingId: target.mappingId,
      bookId: target.bookId,
      productCode: target.chanjetCode,
      currentName: providerName,
      proposedName: proposal.proposedValue,
      providerRowHash: sha256(JSON.stringify(canonicalize(providerProduct))),
      providerInvariantHash: sha256(chanjetProductInvariant(providerProduct)),
      providerState: providerName === proposal.currentValue ? 'ORIGINAL' : 'PROPOSED',
      businessFields: projectChanjetProductBusinessFields(providerProduct),
      updatePayloadHash: sha256(JSON.stringify(canonicalize(updatePayload))),
      updatePayloadFields: Object.keys(updatePayload).sort(),
      providerCalls: 1,
      writeChanjet: false,
      writeErpBusinessTables: false,
    };
  }

  async execute(
    input: ChanjetProductNameCanaryInput,
    actor: string,
  ): Promise<{
    outcome: 'UPDATED_AND_VERIFIED' | 'IDEMPOTENT_PROVIDER_ALREADY_CORRECT';
    auditHash: string;
    writeChanjet: boolean;
    providerCalls: number;
    changedFields: ['name'];
    evidence: ChanjetProductNameCanaryEvidence;
    automaticRollbackOnFailure: true;
  }> {
    const mappingId = String(input.mappingId || '').trim();
    const expectedConfirmation = `UPDATE_CHANJET_PRODUCT_NAME_CANARY:${mappingId}`;
    if (!/^\d+$/.test(mappingId)
      || input.approveProduction !== true
      || input.confirmation !== expectedConfirmation) {
      throw new Error(`product name canary requires approveProduction=true and ${expectedConfirmation}`);
    }
    if (!String(actor || '').trim()) throw new Error('product name canary actor is required');

    const { audit, target } = await this.approvedTarget(mappingId, input.auditHash);

    const proposal = target.chanjetChangeProposal!;
    const evidence: ChanjetProductNameCanaryEvidence = {
      mappingId,
      bookId: target.bookId,
      productCode: target.chanjetCode,
      originalName: proposal.currentValue,
      proposedName: proposal.proposedValue,
      beforeHash: '',
      afterHash: '',
      providerWriteAttempted: false,
      providerWriteSucceeded: false,
      rollbackAttempted: false,
      rollbackSucceeded: false,
      failureReadbackAttempted: false,
      failureReadbackVerified: false,
      providerStateAfterFailure: 'NOT_CHECKED',
      providerReadbackVerified: false,
      erpMirrorReadbackVerified: false,
      updatePayloadHash: '',
    };
    const listPath = `/accounting/openapi/cc/product/list/${target.bookId}`;
    const updatePath = `/accounting/openapi/cc/product/update/${target.bookId}`;
    const listBody = { codes: [target.chanjetCode], pageSize: 20, pageNo: 1 };
    let providerCalls = 0;
    let beforeProduct: Record<string, unknown> | null = null;
    let beforeInvariant = '';
    const runner = this.ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await this.lockExactTarget(runner, target);
      providerCalls += 1;
      const beforeEnvelope = await this.auth.callApi<Record<string, unknown>>(listPath, {
        method: 'POST', body: listBody, kind: 'READ',
      });
      beforeProduct = this.exactProduct(beforeEnvelope, target.chanjetCode);
      const providerName = String(beforeProduct.name || '');
      if (providerName !== proposal.currentValue && providerName !== proposal.proposedValue) {
        throw new Error(`provider product name changed after audit: ${providerName || 'EMPTY'}`);
      }
      beforeInvariant = chanjetProductInvariant(beforeProduct);
      evidence.beforeHash = sha256(JSON.stringify(canonicalize(beforeProduct)));
      const updatePayload = buildChanjetProductUpdatePayload(beforeProduct, proposal.proposedValue);
      evidence.updatePayloadHash = sha256(JSON.stringify(canonicalize(updatePayload)));

      if (providerName === proposal.proposedValue) {
        await this.updateErpMirror(runner, target, proposal.proposedValue, actor, audit.auditHash, {
          outcome: 'IDEMPOTENT_PROVIDER_ALREADY_CORRECT',
          beforeHash: evidence.beforeHash,
          afterHash: evidence.beforeHash,
          providerWrite: false,
        });
        await this.assertErpMirror(runner, mappingId, proposal.proposedValue);
        evidence.afterHash = evidence.beforeHash;
        evidence.providerReadbackVerified = true;
        evidence.erpMirrorReadbackVerified = true;
        await runner.commitTransaction();
        return {
          outcome: 'IDEMPOTENT_PROVIDER_ALREADY_CORRECT',
          auditHash: audit.auditHash,
          writeChanjet: false,
          providerCalls,
          changedFields: ['name'],
          evidence,
          automaticRollbackOnFailure: true,
        };
      }

      evidence.providerWriteAttempted = true;
      providerCalls += 1;
      const updateEnvelope = await this.auth.callApi<Record<string, unknown>>(updatePath, {
        method: 'POST',
        body: [updatePayload],
        kind: 'WRITE',
      });
      if (!updateAccepted(updateEnvelope, target.chanjetCode)) {
        throw new Error('provider product update response contains a failure');
      }
      evidence.providerWriteSucceeded = true;

      providerCalls += 1;
      const afterEnvelope = await this.auth.callApi<Record<string, unknown>>(listPath, {
        method: 'POST', body: listBody, kind: 'READ',
      });
      const afterProduct = this.exactProduct(afterEnvelope, target.chanjetCode);
      evidence.afterHash = sha256(JSON.stringify(canonicalize(afterProduct)));
      if (String(afterProduct.id || '') !== String(beforeProduct.id || '')
        || String(afterProduct.name || '') !== proposal.proposedValue
        || chanjetProductInvariant(afterProduct) !== beforeInvariant) {
        throw new Error('provider product readback changed fields outside the approved name');
      }
      evidence.providerReadbackVerified = true;

      await this.updateErpMirror(runner, target, proposal.proposedValue, actor, audit.auditHash, {
        outcome: 'UPDATED_AND_VERIFIED',
        beforeHash: evidence.beforeHash,
        afterHash: evidence.afterHash,
        providerWrite: true,
      });
      await this.assertErpMirror(runner, mappingId, proposal.proposedValue);
      evidence.erpMirrorReadbackVerified = true;
      await runner.commitTransaction();
      return {
        outcome: 'UPDATED_AND_VERIFIED',
        auditHash: audit.auditHash,
        writeChanjet: true,
        providerCalls,
        changedFields: ['name'],
        evidence,
        automaticRollbackOnFailure: true,
      };
    } catch (error) {
      let rollbackError = '';
      let reconciliationError = '';
      if (evidence.providerWriteAttempted && beforeProduct) {
        evidence.failureReadbackAttempted = true;
        evidence.providerStateAfterFailure = 'UNKNOWN';
        try {
          providerCalls += 1;
          const failureReadEnvelope = await this.auth.callApi<Record<string, unknown>>(listPath, {
            method: 'POST', body: listBody, kind: 'READ',
          });
          const failureProduct = this.exactProduct(failureReadEnvelope, target.chanjetCode);
          const sameIdentityAndInvariant = String(failureProduct.id || '') === String(beforeProduct.id || '')
            && chanjetProductInvariant(failureProduct) === beforeInvariant;
          const failureName = String(failureProduct.name || '');
          if (!sameIdentityAndInvariant
            || (failureName !== proposal.currentValue && failureName !== proposal.proposedValue)) {
            evidence.providerStateAfterFailure = 'UNKNOWN';
            throw new Error('provider failure readback found identity or invariant drift');
          }
          evidence.failureReadbackVerified = true;
          evidence.providerStateAfterFailure = failureName === proposal.currentValue ? 'ORIGINAL' : 'PROPOSED';

          if (evidence.providerStateAfterFailure === 'PROPOSED') {
            evidence.rollbackAttempted = true;
            providerCalls += 1;
            const rollbackEnvelope = await this.auth.callApi<Record<string, unknown>>(updatePath, {
              method: 'POST',
              body: [buildChanjetProductUpdatePayload(beforeProduct, proposal.rollbackValue)],
              kind: 'WRITE',
            });
            if (!updateAccepted(rollbackEnvelope, target.chanjetCode)) {
              throw new Error('provider rejected compensating rollback');
            }
            providerCalls += 1;
            const rollbackReadEnvelope = await this.auth.callApi<Record<string, unknown>>(listPath, {
              method: 'POST', body: listBody, kind: 'READ',
            });
            const rollbackProduct = this.exactProduct(rollbackReadEnvelope, target.chanjetCode);
            if (String(rollbackProduct.id || '') !== String(beforeProduct.id || '')
              || String(rollbackProduct.name || '') !== proposal.rollbackValue
              || chanjetProductInvariant(rollbackProduct) !== beforeInvariant) {
              throw new Error('provider rollback readback mismatch');
            }
            evidence.rollbackSucceeded = true;
          }
        } catch (reconciliationFailure) {
          const failureMessage = (reconciliationFailure as Error).message;
          if (evidence.rollbackAttempted) rollbackError = failureMessage;
          else reconciliationError = failureMessage;
        }
      }
      await runner.rollbackTransaction();
      const originalMessage = (error as Error).message;
      const suffix = evidence.providerStateAfterFailure === 'ORIGINAL' && evidence.failureReadbackVerified
        ? 'provider state verified original; no compensating rollback required'
        : evidence.rollbackAttempted
        ? evidence.rollbackSucceeded
          ? 'compensating rollback verified'
          : `MANUAL_RECOVERY_REQUIRED rollback failed: ${rollbackError || 'unknown'}`
        : evidence.providerWriteAttempted
          ? `MANUAL_RECOVERY_REQUIRED provider state unknown: ${reconciliationError || 'unknown'}`
          : 'no provider write attempted';
      throw new ChanjetProductNameCanaryError(`${originalMessage}; ${suffix}; providerCalls=${providerCalls}`, evidence);
    } finally {
      await runner.release();
    }
  }

  private async lockExactTarget(runner: QueryRunner, target: ChanjetHoldResolutionItem): Promise<void> {
    const locks = await runner.query(
      `SELECT pg_try_advisory_xact_lock(hashtext($1)) AS locked`,
      [`chanjet-product-name-canary:${target.mappingId}`],
    );
    if (locks[0]?.locked !== true) throw new Error('another product name canary is already running');
    const rows = await runner.query(
      `SELECT id::text, mapping_type, book_id, chanjet_id, chanjet_code,
              chanjet_name, match_status, review_status
         FROM chanjet_master_mapping
        WHERE id=$1
        FOR UPDATE`,
      [target.mappingId],
    );
    this.assertMappingRow(rows[0], target);
  }

  private async approvedTarget(mappingIdValue: string, auditHash: string) {
    const mappingId = String(mappingIdValue || '').trim();
    if (!/^\d+$/.test(mappingId)) throw new Error('numeric product mappingId is required');
    const audit = await this.holdAudit.audit();
    if (!auditHash || auditHash !== audit.auditHash) {
      throw new Error('precision audit hash changed; rerun read-only audit before product name canary');
    }
    const target = audit.items.find((item) => (
      item.mappingId === mappingId
      && item.mappingType === 'PRODUCT'
      && item.disposition === 'CHANJET_CHANGE_PROPOSAL'
      && item.chanjetChangeProposal?.field === 'name'
    ));
    if (!target?.chanjetChangeProposal) {
      throw new Error('mapping is not an audit-approved product name change proposal');
    }
    return { audit, target };
  }

  private assertMappingRow(current: Record<string, unknown> | undefined, target: ChanjetHoldResolutionItem): void {
    if (!current
      || String(current.mapping_type) !== 'PRODUCT'
      || String(current.book_id) !== target.bookId
      || String(current.chanjet_id) !== target.chanjetId
      || String(current.chanjet_code) !== target.chanjetCode
      || String(current.chanjet_name) !== target.chanjetName
      || String(current.match_status) !== 'SOURCE_ONLY'
      || String(current.review_status) !== 'APPROVED') {
      throw new Error('ERP mapping identity changed after audit');
    }
  }

  private exactProduct(payload: unknown, productCode: string): Record<string, unknown> {
    const rows = extractChanjetProductRows(payload)
      .filter((row) => String(row.code || '') === productCode);
    if (rows.length !== 1 || !String(rows[0].id || '')) {
      throw new Error(`provider product query did not return one exact row for ${productCode}`);
    }
    return rows[0];
  }

  private async updateErpMirror(
    runner: QueryRunner,
    target: ChanjetHoldResolutionItem,
    nextName: string,
    actor: string,
    auditHash: string,
    evidence: Record<string, unknown>,
  ): Promise<void> {
    await runner.query(
      `UPDATE chanjet_master_mapping
          SET chanjet_name=$2,
              reviewed_by=$3,
              reviewed_at=NOW(),
              raw_data=COALESCE(raw_data, '{}'::jsonb)
                || jsonb_build_object('productNameCanary', $4::jsonb),
              updated_at=NOW()
        WHERE id=$1`,
      [
        target.mappingId,
        nextName,
        actor,
        JSON.stringify({
          auditHash,
          originalName: target.chanjetName,
          verifiedName: nextName,
          verifiedAt: new Date().toISOString(),
          changedFields: ['name'],
          ...evidence,
        }),
      ],
    );
  }

  private async assertErpMirror(runner: QueryRunner, mappingId: string, expectedName: string): Promise<void> {
    const rows = await runner.query(
      `SELECT chanjet_name, raw_data->'productNameCanary' AS evidence
         FROM chanjet_master_mapping
        WHERE id=$1`,
      [mappingId],
    );
    if (rows.length !== 1
      || String(rows[0].chanjet_name || '') !== expectedName
      || String(record(rows[0].evidence).verifiedName || '') !== expectedName) {
      throw new Error('ERP product mirror readback mismatch');
    }
  }
}
