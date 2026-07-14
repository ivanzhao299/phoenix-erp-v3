import {
  normalizeUserRoleAssignments,
  UserRoleAssignmentValidationError,
} from './user-role-assignment';

const knownRoles = [
  { role_id: 1, role_code: 'ROLE_FINANCE' },
  { role_id: 2, role_code: 'ROLE_OPERATOR' },
  { role_id: 3, role_code: 'ROLE_ARCHIVED' },
];

describe('normalizeUserRoleAssignments', () => {
  it('preserves disabled roles without reactivating them', () => {
    expect(normalizeUserRoleAssignments([
      { role_code: 'ROLE_FINANCE', is_primary: true, is_visible: true },
      { role_code: 'ROLE_ARCHIVED', is_primary: false, is_visible: false },
    ], knownRoles)).toEqual([
      { role_code: 'ROLE_FINANCE', role_id: 1, is_primary: true, is_visible: true },
      { role_code: 'ROLE_ARCHIVED', role_id: 3, is_primary: false, is_visible: false },
    ]);
  });

  it('moves primary to the first enabled role when an old disabled role was primary', () => {
    expect(normalizeUserRoleAssignments([
      { role_code: 'ROLE_ARCHIVED', is_primary: true, is_visible: false },
      { role_code: 'ROLE_OPERATOR', is_primary: false, is_visible: true },
    ], knownRoles)).toEqual([
      { role_code: 'ROLE_ARCHIVED', role_id: 3, is_primary: false, is_visible: false },
      { role_code: 'ROLE_OPERATOR', role_id: 2, is_primary: true, is_visible: true },
    ]);
  });

  it('keeps every role non-primary when all assignments are disabled', () => {
    expect(normalizeUserRoleAssignments([
      { role_code: 'ROLE_ARCHIVED', is_primary: true, is_visible: false },
    ], knownRoles)[0]).toMatchObject({ is_primary: false, is_visible: false });
  });

  it('rejects duplicate and unknown role codes instead of silently dropping them', () => {
    expect(() => normalizeUserRoleAssignments([
      { role_code: 'ROLE_FINANCE' },
      { role_code: 'ROLE_FINANCE' },
    ], knownRoles)).toThrow(UserRoleAssignmentValidationError);
    expect(() => normalizeUserRoleAssignments([
      { role_code: 'ROLE_UNKNOWN' },
    ], knownRoles)).toThrow('角色 ROLE_UNKNOWN 不存在');
  });

  it('rejects more than one enabled primary role', () => {
    expect(() => normalizeUserRoleAssignments([
      { role_code: 'ROLE_FINANCE', is_primary: true },
      { role_code: 'ROLE_OPERATOR', is_primary: true },
    ], knownRoles)).toThrow('只能设置一个启用中的主角色');
  });
});
