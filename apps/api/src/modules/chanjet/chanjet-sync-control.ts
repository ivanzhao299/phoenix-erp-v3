import { ForbiddenException } from '@nestjs/common';

/** Only an explicit true grants execution; missing/ambiguous input stays held. */
export function explicitTrue(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === 'true';
}

export function readonlySyncEnabled(): boolean {
  return explicitTrue(process.env.CHANJET_READONLY_SYNC_ENABLED);
}

export function erpInboundEnabled(): boolean {
  return explicitTrue(process.env.CHANJET_ERP_INBOUND_SYNC_ENABLED);
}

export function requireReadonlySync(): void {
  if (!readonlySyncEnabled()) throw new ForbiddenException({ reason: 'SYNC_DISABLED', message: 'Chanjet readonly sync is held' });
}

export function requireErpInbound(): void {
  if (!erpInboundEnabled()) throw new ForbiddenException({ reason: 'ERP_INBOUND_DISABLED', message: 'Chanjet ERP inbound is held' });
}
