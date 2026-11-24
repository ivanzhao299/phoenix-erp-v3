import { hasPerm } from '../../auth/permissions.util';

export type FlockActor = {
  id: string;
  accountId?: string;
  permissions?: string[];
  admin?: boolean;
  impersonatedBy?: { id: number | string; username: string };
};

export const FLOCK_ACTION_MENUS = {
  create: 'MENU_FLOCK_CREATE',
  submit: 'MENU_FLOCK_CREATE',
  approve: 'MENU_FLOCK_APPROVE',
  post: 'MENU_FLOCK_POST',
  cancel: 'MENU_FLOCK_CREATE',
  BASELINE: 'MENU_FLOCK_BASELINE',
  ADJUST: 'MENU_FLOCK_ADJUST',
  REVERSE: 'MENU_FLOCK_REVERSE',
  REPORT_CORRECTION: 'MENU_FLOCK_REPORT',
  HISTORY_AUTH: 'MENU_FLOCK_HISTORY',
  CLOSE: 'MENU_FLOCK_CLOSE',
  CLEAN_START: 'MENU_FLOCK_CLEAN',
  CLEAN_ACCEPT: 'MENU_FLOCK_CLEAN',
} as const;

type FlockMenuAction = keyof typeof FLOCK_ACTION_MENUS;
export type PendingFlockAction = 'submit' | 'approve' | 'post';

export const FLOCK_PENDING_ACTIONS = {
  submit: 'DRAFT',
  approve: 'SUBMITTED',
  post: 'APPROVED',
} as const satisfies Record<PendingFlockAction, string>;

export function hasFlockActionPermission(actor: FlockActor, action: FlockMenuAction) {
  const approval = action === 'approve' || /^[A-Z_]+$/.test(action);
  return Boolean(actor.id && actor.id !== 'unknown' && (actor.admin ||
    hasPerm(actor.permissions, FLOCK_ACTION_MENUS[action], approval ? 'A' : 'E')));
}

export function hasFlockSpecialPermission(actor: FlockActor, kind: string) {
  return !Object.prototype.hasOwnProperty.call(FLOCK_ACTION_MENUS, kind) ||
    hasFlockActionPermission(actor, kind as FlockMenuAction);
}
