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
  providerReadbackVerified: boolean;
  erpMirrorReadbackVerified: boolean;
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
 * The product update contract identifies rows by code and accepts a partial
 * payload. Only the top-level name and provider-maintained update metadata may
 * differ. Nested names (category, brand, UOM, vendor) stay locked.
 */
export function chanjetProductInvariant(product: Record<string, unknown>): string {
  const copy = { ...product };
  delete copy.name;
  for (const key of Object.keys(copy)) {
    if (/^(?:update|modified)(?:stamp|time|at|by)?$/i.test(key)) delete copy[key];
  }
  return JSON.stringify(canonicalize(copy));
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
    return {
      decision: 'READY_FOR_EXPLICIT_APPROVAL',
      auditHash: audit.auditHash,
      mappingId: target.mappingId,
      bookId: target.bookId,
      productCode: target.chanjetCode,
      currentName: providerName,
      proposedName: proposal.proposedValue,
      providerRowHash: sha256(JSON.stringify(canonicalize(providerProduct))),
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
      providerReadbackVerified: false,
      erpMirrorReadbackVerified: false,
    };
    const listPath = `/accounting/openapi/cc/product/list/${target.bookId}`;
    const updatePath = `/accounting/openapi/cc/product/update/${target.bookId}`;
    const listBody = { codes: [target.chanjetCode], pageSize: 20, pageNo: 1 };
    let providerCalls = 0;
    let beforeProduct: Record<string, unknown> | null = null;
    const runner = this.ds.createQueryRunner();
    await runner.connect();
    await runner.startTransaction();
    try {
      await this.lockExactTarget(runner, target);
      const beforeEnvelope = await this.auth.callApi<Record<string, unknown>>(listPath, {
        method: 'POST', body: listBody, kind: 'READ',
      });
      providerCalls += 1;
      beforeProduct = this.exactProduct(beforeEnvelope, target.chanjetCode);
      const providerName = String(beforeProduct.name || '');
      if (providerName !== proposal.currentValue && providerName !== proposal.proposedValue) {
        throw new Error(`provider product name changed after audit: ${providerName || 'EMPTY'}`);
      }
      const beforeInvariant = chanjetProductInvariant(beforeProduct);
      evidence.beforeHash = sha256(JSON.stringify(canonicalize(beforeProduct)));

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
      const updateEnvelope = await this.auth.callApi<Record<string, unknown>>(updatePath, {
        method: 'POST',
        body: [{ productCode: target.chanjetCode, productName: proposal.proposedValue }],
        kind: 'WRITE',
      });
      providerCalls += 1;
      if (!updateAccepted(updateEnvelope, target.chanjetCode)) {
        throw new Error('provider product update response contains a failure');
      }
      evidence.providerWriteSucceeded = true;

      const afterEnvelope = await this.auth.callApi<Record<string, unknown>>(listPath, {
        method: 'POST', body: listBody, kind: 'READ',
      });
      providerCalls += 1;
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
      if (evidence.providerWriteAttempted && beforeProduct) {
        evidence.rollbackAttempted = true;
        try {
          const rollbackEnvelope = await this.auth.callApi<Record<string, unknown>>(updatePath, {
            method: 'POST',
            body: [{ productCode: target.chanjetCode, productName: proposal.rollbackValue }],
            kind: 'WRITE',
          });
          providerCalls += 1;
          if (!updateAccepted(rollbackEnvelope, target.chanjetCode)) {
            throw new Error('provider rejected compensating rollback');
          }
          const rollbackReadEnvelope = await this.auth.callApi<Record<string, unknown>>(listPath, {
            method: 'POST', body: listBody, kind: 'READ',
          });
          providerCalls += 1;
          const rollbackProduct = this.exactProduct(rollbackReadEnvelope, target.chanjetCode);
          if (String(rollbackProduct.id || '') !== String(beforeProduct.id || '')
            || String(rollbackProduct.name || '') !== proposal.rollbackValue
            || chanjetProductInvariant(rollbackProduct) !== chanjetProductInvariant(beforeProduct)) {
            throw new Error('provider rollback readback mismatch');
          }
          evidence.rollbackSucceeded = true;
        } catch (rollbackFailure) {
          rollbackError = (rollbackFailure as Error).message;
        }
      }
      await runner.rollbackTransaction();
      const originalMessage = (error as Error).message;
      const suffix = evidence.rollbackAttempted
        ? evidence.rollbackSucceeded
          ? 'compensating rollback verified'
          : `MANUAL_RECOVERY_REQUIRED rollback failed: ${rollbackError || 'unknown'}`
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
