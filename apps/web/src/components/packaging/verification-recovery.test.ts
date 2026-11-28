import { describe, expect, it } from 'vitest';
import { isVerificationResponseCurrent, restoreVerificationRounds } from './verification-recovery';

const clientNow = Date.parse('2026-11-28T10:00:00.000Z');
const recovery = {
  actorId: 'operator-a',
  revision: 7,
  serverNow: '2026-11-28T10:00:00.000Z',
  rounds: {
    HANDOVER: {
      sessionId: 'session-latest',
      expiresAt: '2026-11-28T10:10:00.000Z',
      scans: {
        box1: { eventId: 'proof-box1', sessionId: 'session-old', expiresAt: '2026-11-28T10:05:00.000Z' },
        box2: { eventId: 'proof-box2', sessionId: 'session-latest', expiresAt: '2026-11-28T10:10:00.000Z' },
        box3: { eventId: 'expired-proof', sessionId: 'session-old', expiresAt: '2026-11-28T09:59:59.000Z' },
      },
    },
    LABEL_CHECK: {
      sessionId: 'label-session',
      expiresAt: '2026-11-28T10:10:00.000Z',
      scans: {
        box1: { eventId: 'label-proof', sessionId: 'label-session', expiresAt: '2026-11-28T10:08:00.000Z' },
      },
    },
  },
};

describe('restoreVerificationRounds', () => {
  it('restores server evidence after a fresh page/device load, retaining box proofs across sessions', () => {
    const restored = restoreVerificationRounds(recovery, 'operator-a', 7, clientNow);
    expect(restored.HANDOVER).toEqual({
      eventId: 'session-latest',
      expiresAt: clientNow + 10 * 60_000,
      scans: {
        box1: { eventId: 'proof-box1', sessionId: 'session-old', expiresAt: clientNow + 5 * 60_000 },
        box2: { eventId: 'proof-box2', sessionId: 'session-latest', expiresAt: clientNow + 10 * 60_000 },
      },
    });
    expect(restored.LABEL_CHECK?.scans.box1.eventId).toBe('label-proof');
  });

  it('does not expose operator A proofs to operator B', () => {
    expect(restoreVerificationRounds(recovery, 'operator-b', 7, clientNow)).toEqual({});
  });

  it('rejects all evidence from another record revision and expired rounds', () => {
    expect(restoreVerificationRounds(recovery, 'operator-a', 8, clientNow)).toEqual({});
    const expired = {
      ...recovery,
      rounds: { HANDOVER: { ...recovery.rounds.HANDOVER, expiresAt: '2026-11-28T09:59:00.000Z' } },
    };
    expect(restoreVerificationRounds(expired, 'operator-a', 7, clientNow)).toEqual({});
  });

  it('does not apply a late response after identity, revision, session, or component changes', () => {
    const base = {
      active: true,
      responseActorId: 'operator-a', currentActorId: 'operator-a',
      responseRevision: 7, currentRevision: 7,
      responseSessionId: 'session-1', currentSessionId: 'session-1',
    };
    expect(isVerificationResponseCurrent(base)).toBe(true);
    expect(isVerificationResponseCurrent({ ...base, active: false })).toBe(false);
    expect(isVerificationResponseCurrent({ ...base, currentActorId: 'operator-b' })).toBe(false);
    expect(isVerificationResponseCurrent({ ...base, currentRevision: 8 })).toBe(false);
    expect(isVerificationResponseCurrent({ ...base, currentSessionId: 'session-2' })).toBe(false);
  });
});
