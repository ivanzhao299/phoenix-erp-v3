export const BACKGROUND_NAMESPACE = 17455;
export const BACKGROUND_ADMISSION_KEY = 1;
export const BACKGROUND_EXECUTION_KEY = 2;
export type BackgroundTaskKind = 'LOCAL' | 'EXTERNAL_READ' | 'NOTIFICATION' | 'CHANJET_AUTH' | 'CHANJET_SYNC';
export const BACKGROUND_KINDS: readonly BackgroundTaskKind[] = ['LOCAL', 'EXTERNAL_READ', 'NOTIFICATION', 'CHANJET_AUTH', 'CHANJET_SYNC'];
export interface BackgroundIdentity { bootId: string }
export interface BackgroundParticipant extends BackgroundIdentity { containerId: string; revision: string; allowedKinds: BackgroundTaskKind[] }
export interface BackgroundManifest {
  protocolVersion: 1;
  phase: 'OPEN' | 'FENCED' | 'CODE_HOLD';
  owner: string;
  generation: number;
  targetSha: string;
  participants: BackgroundParticipant[];
}
export class BackgroundAdmissionDeniedError extends Error {
  constructor(public readonly reason: string) { super(`BACKGROUND_HOLD=${reason}`); this.name = 'BackgroundAdmissionDeniedError'; }
}
