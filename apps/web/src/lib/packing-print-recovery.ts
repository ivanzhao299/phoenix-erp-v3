import { packingHistoryRequest } from './packing-history-api';

export type PendingPrintOperation = {
  actorId: string;
  packingCode: string;
  revision: string;
  boxId: string;
  key: string;
  body: Record<string, unknown>;
  startedAt: string;
};
export type PendingPrintResultOperation = {
  actorId: string;
  packingCode: string;
  requestId: string;
  key: string;
  body: Record<string, unknown>;
  startedAt: string;
};

export type PrintRecoveryResult =
  | { state: 'NOT_FOUND'; retryWithSameKey: true; operation: PendingPrintOperation }
  | { state: 'PENDING' | 'COMMITTED'; retryWithSameKey: false; operation: PendingPrintOperation; eventId?: string; events?: unknown[] };

const storageKey = (actorId: string, packingCode: string, revision: string, boxId: string) =>
  `packing-print:${JSON.stringify([actorId, packingCode, revision, boxId])}`;
const resultStorageKey = (actorId:string,packingCode:string,requestId:string) =>
  `packing-print-result:${JSON.stringify([actorId,packingCode,requestId])}`;

export function savePendingPrint(operation: PendingPrintOperation, storage: Pick<Storage, 'setItem'> = localStorage) {
  storage.setItem(storageKey(operation.actorId, operation.packingCode, operation.revision, operation.boxId), JSON.stringify(operation));
}

export function readPendingPrint(actorId: string, packingCode: string, revision: string, boxId: string, storage: Pick<Storage, 'getItem'> = localStorage): PendingPrintOperation | null {
  try {
    const value = storage.getItem(storageKey(actorId, packingCode, revision, boxId));
    if (!value) return null;
    const parsed = JSON.parse(value) as PendingPrintOperation;
    return parsed.actorId === actorId && parsed.packingCode === packingCode && parsed.revision === revision && parsed.boxId === boxId
      && typeof parsed.key === 'string' && typeof parsed.body === 'object' && parsed.body !== null ? parsed : null;
  } catch { return null; }
}

export function clearPendingPrint(operation: PendingPrintOperation, storage: Pick<Storage, 'removeItem'> = localStorage) {
  storage.removeItem(storageKey(operation.actorId, operation.packingCode, operation.revision, operation.boxId));
}
export function savePendingPrintResult(operation: PendingPrintResultOperation, storage: Pick<Storage,'setItem'> = localStorage) {
  storage.setItem(resultStorageKey(operation.actorId,operation.packingCode,operation.requestId),JSON.stringify(operation));
}
export function readPendingPrintResult(actorId:string,packingCode:string,requestId:string,storage: Pick<Storage,'getItem'> = localStorage):PendingPrintResultOperation|null {
  try {
    const parsed=JSON.parse(storage.getItem(resultStorageKey(actorId,packingCode,requestId))??'null') as PendingPrintResultOperation|null;
    return parsed?.actorId===actorId&&parsed.packingCode===packingCode&&parsed.requestId===requestId&&
      typeof parsed.key==='string'&&parsed.body?.packingCode===packingCode ? parsed:null;
  } catch { return null; }
}
export function clearPendingPrintResult(operation: PendingPrintResultOperation,storage: Pick<Storage,'removeItem'> = localStorage) {
  storage.removeItem(resultStorageKey(operation.actorId,operation.packingCode,operation.requestId));
}

/** Read-only recovery. It never calls printLabel or resends a print request. */
export async function recoverPrintOperation(operation: PendingPrintOperation, request = packingHistoryRequest): Promise<PrintRecoveryResult> {
  const query = new URLSearchParams({ action: 'PRINT', packingCode: operation.packingCode });
  const found = await request(`operations/${encodeURIComponent(operation.key)}?${query}`);
  if (found?.state === 'NOT_FOUND') return { state: 'NOT_FOUND', retryWithSameKey: true, operation };
  if (found?.state !== 'COMMITTED' || typeof found.eventId !== 'string') {
    return { state: 'PENDING', retryWithSameKey: false, operation };
  }
  const events = await request(`labels/print-requests/${encodeURIComponent(found.eventId)}`);
  return { state: 'COMMITTED', retryWithSameKey: false, operation, eventId: found.eventId, events };
}

/** Cross-device read-only lookup for the current actor and protected original. */
export async function recoverLatestPrintOperation(packingCode: string, request = packingHistoryRequest, boxId?:string) {
  const query = new URLSearchParams({ action: 'PRINT' });
  if(boxId)query.set('boxId',boxId);
  return request(`history/${encodeURIComponent(packingCode)}/my-operation?${query}`);
}

/** Read the recorded outcome for one known print request; never dispatches or writes. */
export async function recoverPrintResult(packingCode: string, requestId: string, request = packingHistoryRequest) {
  const query = new URLSearchParams({ action: 'PRINT_RESULT', requestId });
  return request(`history/${encodeURIComponent(packingCode)}/my-operation?${query}`);
}
export async function recoverSavedPrintResult(operation:PendingPrintResultOperation,request=packingHistoryRequest) {
  const query=new URLSearchParams({action:'PRINT_RESULT',packingCode:operation.packingCode});
  const found=await request(`operations/${encodeURIComponent(operation.key)}?${query}`);
  if(found?.state==='COMMITTED'&&found.result?.requestId!==operation.requestId)throw new Error('OPERATION_INCOMPLETE');
  return found;
}

/** Explicit same-key retry after a lost result-write response; only when the original request has no result. */
export async function retryPrintResultWithSameKey(operation: PendingPrintResultOperation, request = packingHistoryRequest) {
  const recovered = await recoverSavedPrintResult(operation, request);
  if (recovered?.state !== 'NOT_FOUND') throw new Error('PRINT_RESULT_RETRY_UNSAFE');
  return request(`labels/print-requests/${encodeURIComponent(operation.requestId)}/events`, { key: operation.key, body: operation.body });
}

/** Explicit caller action only; the exact persisted body and idempotency key are reused. */
export async function retryPrintRequestWithSameKey(operation: PendingPrintOperation, request = packingHistoryRequest) {
  const recovered = await recoverPrintOperation(operation, request);
  if (recovered.state !== 'NOT_FOUND' || !recovered.retryWithSameKey) throw new Error('PRINT_RETRY_UNSAFE');
  return request('labels/print-requests', { key: operation.key, body: operation.body });
}
