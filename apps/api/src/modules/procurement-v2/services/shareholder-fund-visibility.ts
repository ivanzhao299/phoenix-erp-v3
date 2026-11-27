import { DataScopeContext } from '../../org/services/data-scope.service';

export function shareholderOwnerPredicate(column: string, userIdParam: string): string {
  return `EXISTS (SELECT 1 FROM shr_shareholders owner WHERE owner.id = ${column} AND owner.linked_user_id = ${userIdParam})`;
}

export function isShareholderSelfScope(scope: DataScopeContext | undefined): scope is DataScopeContext {
  return !!scope && !scope.isGlobal && scope.scopeLevel === 'SELF';
}
