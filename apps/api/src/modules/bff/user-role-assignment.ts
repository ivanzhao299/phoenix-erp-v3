export interface UserRoleAssignmentInput {
  role_code: string;
  is_primary?: boolean;
  is_visible?: boolean;
}

export interface KnownUserRole {
  role_id: string | number;
  role_code: string;
}

export interface NormalizedUserRoleAssignment {
  role_code: string;
  role_id: string | number;
  is_primary: boolean;
  is_visible: boolean;
}

export class UserRoleAssignmentValidationError extends Error {}

/**
 * Produces the complete persisted role state for one user.
 * Visibility and primary status are normalized together so a disabled role can
 * never be reactivated or remain the effective primary through a split write.
 */
export function normalizeUserRoleAssignments(
  input: UserRoleAssignmentInput[],
  knownRoles: KnownUserRole[],
): NormalizedUserRoleAssignment[] {
  const knownByCode = new Map(knownRoles.map((role) => [role.role_code, role.role_id]));
  const seen = new Set<string>();

  const normalized = input.map((item, index) => {
    const roleCode = String(item?.role_code || '').trim();
    if (!roleCode) {
      throw new UserRoleAssignmentValidationError(`第 ${index + 1} 个角色缺少 role_code`);
    }
    if (seen.has(roleCode)) {
      throw new UserRoleAssignmentValidationError(`角色 ${roleCode} 重复`);
    }
    seen.add(roleCode);

    const roleId = knownByCode.get(roleCode);
    if (roleId === undefined) {
      throw new UserRoleAssignmentValidationError(`角色 ${roleCode} 不存在`);
    }

    const isVisible = item.is_visible !== false;
    return {
      role_code: roleCode,
      role_id: roleId,
      is_visible: isVisible,
      is_primary: isVisible && item.is_primary === true,
    };
  });

  const requestedVisiblePrimaries = normalized.filter((item) => item.is_primary);
  if (requestedVisiblePrimaries.length > 1) {
    throw new UserRoleAssignmentValidationError('只能设置一个启用中的主角色');
  }

  if (requestedVisiblePrimaries.length === 0) {
    const firstVisible = normalized.find((item) => item.is_visible);
    if (firstVisible) firstVisible.is_primary = true;
  }

  return normalized;
}
