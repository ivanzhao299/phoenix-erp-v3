export type VerificationPurpose = 'LABEL_CHECK' | 'HANDOVER';

export type VerificationRound = {
  eventId: string;
  expiresAt: number;
  scans: Record<string, { eventId: string; sessionId: string; expiresAt: number }>;
};

type RecoveryScan = {
  eventId?: unknown;
  sessionId?: unknown;
  expiresAt?: unknown;
};

type RecoveryRound = {
  sessionId?: unknown;
  expiresAt?: unknown;
  scans?: Record<string, RecoveryScan>;
};

export type VerificationRecovery = {
  actorId?: unknown;
  revision?: unknown;
  serverNow?: unknown;
  rounds?: Partial<Record<VerificationPurpose, RecoveryRound>>;
};

export function isVerificationResponseCurrent(input: {
  active: boolean;
  responseActorId: string;
  currentActorId: string;
  responseRevision: string | number;
  currentRevision: string | number;
  responseSessionId: string;
  currentSessionId: string;
}): boolean {
  return input.active && input.responseActorId === input.currentActorId &&
    String(input.responseRevision) === String(input.currentRevision) &&
    input.responseSessionId === input.currentSessionId;
}

const purposes: VerificationPurpose[] = ['LABEL_CHECK', 'HANDOVER'];

function timestamp(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/**
 * Restores only server-projected evidence for the current operator and exact
 * packing revision. Browser storage is deliberately not an input to recovery.
 */
export function restoreVerificationRounds(
  recovery: VerificationRecovery | null | undefined,
  currentActorId: string,
  currentRevision: string | number,
  clientNow = Date.now(),
): Partial<Record<VerificationPurpose, VerificationRound>> {
  if (!recovery || !currentActorId || String(recovery.actorId ?? '') !== currentActorId) return {};
  if (String(recovery.revision ?? '') !== String(currentRevision)) return {};

  const serverNow = timestamp(recovery.serverNow);
  if (serverNow === null || !Number.isFinite(clientNow)) return {};
  const restored: Partial<Record<VerificationPurpose, VerificationRound>> = {};

  for (const purpose of purposes) {
    const source = recovery.rounds?.[purpose];
    const sessionId = typeof source?.sessionId === 'string' ? source.sessionId : '';
    const serverExpiry = timestamp(source?.expiresAt);
    if (!sessionId || serverExpiry === null || serverExpiry <= serverNow) continue;

    const scans: VerificationRound['scans'] = {};
    for (const [boxId, scan] of Object.entries(source?.scans ?? {})) {
      const scanExpiry = timestamp(scan.expiresAt);
      if (
        boxId && typeof scan.eventId === 'string' && scan.eventId &&
        typeof scan.sessionId === 'string' && scan.sessionId && scanExpiry !== null &&
        scanExpiry > serverNow
      ) {
        scans[boxId] = {
          eventId: scan.eventId,
          sessionId: scan.sessionId,
          expiresAt: clientNow + (scanExpiry - serverNow),
        };
      }
    }

    // Convert the server deadline into the client's clock domain using the
    // server timestamp returned with this same response.
    const localExpiry = clientNow + (serverExpiry - serverNow);
    restored[purpose] = { eventId: sessionId, expiresAt: localExpiry, scans };
  }
  return restored;
}
