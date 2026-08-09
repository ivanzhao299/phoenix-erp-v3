import { createHash } from 'node:crypto';

function text(value) {
  return value == null ? '' : String(value).trim();
}

function upper(value) {
  return text(value).toUpperCase();
}

export function rowsOf(value) {
  if (Array.isArray(value)) return value;
  if (!value || typeof value !== 'object') return [];
  for (const key of ['data', 'result', 'rows', 'items', 'list']) {
    if (Array.isArray(value[key])) return value[key];
    const nested = rowsOf(value[key]);
    if (nested.length) return nested;
  }
  return [];
}

export function userIdentityHash(user) {
  const id = text(user.id ?? user.userId ?? user.user_id);
  const username = text(user.username);
  if (!id || !username) throw new Error('user id and username are required for a stable identity hash');
  return createHash('sha256').update(`${id}:${username}`).digest('hex').slice(0, 16);
}

function compactOrg(org) {
  return {
    id: Number(org.id || 0),
    code: text(org.orgCode ?? org.org_code ?? org.code),
    name: text(org.orgName ?? org.org_name ?? org.name),
    type: upper(org.orgType ?? org.org_type ?? org.type),
    status: upper(org.status),
    companyCode: text(org.companyCode ?? org.company_code),
  };
}

function roleCodes(user) {
  const values = [
    user.role,
    ...(Array.isArray(user.roles_detail)
      ? user.roles_detail.filter((row) => row?.is_visible !== false).map((row) => row?.role_code)
      : []),
  ];
  return [...new Set(values.map(upper).filter(Boolean))].sort();
}

function dispositionForUnbound(user, organizationsByCode) {
  const status = upper(user.status);
  const roles = roleCodes(user);
  const storeCode = text(user.store_code ?? user.storeCode);
  if (status !== 'ACTIVE') {
    return {
      disposition: 'KEEP_UNBOUND_INACTIVE',
      writeEligible: false,
      reason: 'Inactive users remain unbound so a frozen or archived identity cannot gain data access.',
    };
  }
  if (roles.includes('ROLE_ADMIN')) {
    return {
      disposition: 'KEEP_UNBOUND_ROLE_GLOBAL',
      writeEligible: false,
      reason: 'ROLE_ADMIN is already an explicit global scope; adding an organization binding would be redundant.',
    };
  }
  if (!storeCode || upper(storeCode) === 'ALL') {
    return {
      disposition: 'HOLD_ACTIVE_USER_ORG_EVIDENCE_REQUIRED',
      writeEligible: false,
      reason: 'No exact organization code is present; names and roles are insufficient evidence for production authorization.',
    };
  }
  const matches = organizationsByCode.get(storeCode) || [];
  const activeMatches = matches.filter((org) => org.status === 'ACTIVE');
  if (activeMatches.length !== 1) {
    return {
      disposition: activeMatches.length > 1
        ? 'HOLD_DUPLICATE_ORG_CODE'
        : 'HOLD_ACTIVE_USER_ORG_EVIDENCE_REQUIRED',
      writeEligible: false,
      reason: activeMatches.length > 1
        ? 'The source code resolves to multiple active ERP organizations.'
        : 'The source code does not resolve to one active ERP organization.',
    };
  }
  const target = activeMatches[0];
  return {
    disposition: 'PROPOSE_EXACT_ORG_CODE_BINDING',
    writeEligible: true,
    reason: 'The active user source code exactly matches one active ERP organization code.',
    target: {
      orgId: target.id,
      orgCode: target.code,
      orgName: target.name,
      orgType: target.type,
      companyCode: target.companyCode,
      isPrimary: true,
      dataScopeLevel: target.type === 'GROUP' ? 'GROUP' : 'COMPANY',
    },
  };
}

export function buildUserOrgBindingPlan({ users, organizations, bindingsByUserId }) {
  const compactOrganizations = organizations.map(compactOrg).filter((org) => org.id && org.code);
  const organizationsByCode = new Map();
  for (const org of compactOrganizations) {
    const values = organizationsByCode.get(org.code) || [];
    values.push(org);
    organizationsByCode.set(org.code, values);
  }

  const entries = users.map((user) => {
    const userId = Number(user.id ?? user.userId ?? user.user_id ?? 0);
    if (!userId) throw new Error('every user must have a numeric id');
    const bindings = bindingsByUserId.get(userId) || [];
    const base = {
      userId,
      identityHash: userIdentityHash(user),
      status: upper(user.status),
      roles: roleCodes(user),
      bindingCount: bindings.length,
      sourceOrgCodeHash: text(user.store_code ?? user.storeCode)
        ? createHash('sha256').update(text(user.store_code ?? user.storeCode)).digest('hex').slice(0, 12)
        : '',
    };
    if (bindings.length > 0) {
      return {
        ...base,
        disposition: 'ALREADY_BOUND',
        writeEligible: false,
        reason: 'Existing bindings are preserved; this batch never replaces or broadens them.',
      };
    }
    return { ...base, ...dispositionForUnbound(user, organizationsByCode) };
  });

  return {
    entries,
    summary: entries.reduce((summary, entry) => {
      summary.totalUsers += 1;
      summary.totalBindings += entry.bindingCount;
      if (!entry.bindingCount) summary.unboundUsers += 1;
      if (entry.status === 'ACTIVE' && !entry.bindingCount) summary.activeUnboundUsers += 1;
      if (entry.writeEligible) summary.exactWriteCandidates += 1;
      summary.byDisposition[entry.disposition] = (summary.byDisposition[entry.disposition] || 0) + 1;
      return summary;
    }, {
      totalUsers: 0,
      totalBindings: 0,
      unboundUsers: 0,
      activeUnboundUsers: 0,
      exactWriteCandidates: 0,
      byDisposition: {},
    }),
  };
}

export function publicUserOrgBindingPlan(plan) {
  return {
    summary: plan.summary,
    entries: plan.entries.map(({ userId: _userId, ...entry }) => entry),
  };
}

export function evidenceHashForUserOrgBindingPlan(plan) {
  return createHash('sha256').update(JSON.stringify(publicUserOrgBindingPlan(plan))).digest('hex');
}

export function approvedUserOrgBindingTarget(plan, input) {
  const evidenceHash = evidenceHashForUserOrgBindingPlan(plan);
  if (text(input?.evidenceHash) !== evidenceHash) throw new Error('USER_ORG_BINDING_PLAN_STALE');
  const identityHash = text(input?.identityHash);
  const candidates = plan.entries.filter((entry) => entry.identityHash === identityHash && entry.writeEligible);
  if (candidates.length !== 1) throw new Error('EXACT_USER_ORG_BINDING_TARGET_REQUIRED');
  const target = candidates[0];
  const expected = `BIND_ACTIVE_USER_ORG:${target.identityHash}:${target.target.orgCode}`;
  if (text(input?.confirmation) !== expected) throw new Error(`confirmation must be ${expected}`);
  return { ...target, evidenceHash, expectedConfirmation: expected };
}
