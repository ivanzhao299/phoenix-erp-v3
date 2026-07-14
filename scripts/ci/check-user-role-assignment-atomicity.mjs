#!/usr/bin/env node

import { readFileSync } from 'node:fs';

const detailPage = readFileSync('apps/web/src/app/(admin)/settings/users/[id]/page.tsx', 'utf8');
const listPage = readFileSync('apps/web/src/app/(admin)/settings/users/page.tsx', 'utf8');
const controller = readFileSync('apps/api/src/modules/bff/bff.controller.ts', 'utf8');
const normalizer = readFileSync('apps/api/src/modules/bff/user-role-assignment.ts', 'utf8');

const failures = [];
const expectContract = (condition, message) => {
  if (!condition) failures.push(message);
};

expectContract(
  !detailPage.includes('/role-visibility'),
  'user detail page must not split role assignment and visibility into separate requests',
);
expectContract(
  detailPage.includes('is_visible: r.is_visible !== false'),
  'user detail role payload must preserve is_visible',
);
expectContract(
  listPage.includes('is_visible: r.is_visible !== false'),
  'user creation multi-role payload must preserve is_visible',
);
expectContract(
  controller.includes('normalizeUserRoleAssignments(roles, allRoles)'),
  'BFF role replacement must use the shared assignment normalizer',
);
expectContract(
  controller.includes('[id, r.role_id, r.is_primary, r.is_visible]'),
  'BFF role replacement must persist visibility in the same transaction',
);
expectContract(
  normalizer.includes('is_primary: isVisible && item.is_primary === true'),
  'disabled roles must never remain primary',
);

if (failures.length) {
  for (const failure of failures) console.error(`USER_ROLE_ATOMICITY: ${failure}`);
  process.exit(1);
}

console.log('check-user-role-assignment-atomicity: PASS');
