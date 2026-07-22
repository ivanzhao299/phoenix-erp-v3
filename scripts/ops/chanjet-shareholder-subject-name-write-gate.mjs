#!/usr/bin/env node

import crypto from 'node:crypto';

const APPROVAL_TOKEN = 'APPROVE_CHANJET_SHAREHOLDER_NAME_WRITE_20260723';
const UPDATE_PATH = '/accounting/gl/glaccount/updateAccountDuia';
const QUERY_PATH = '/accounting/gl/glaccount/getInitBalanceLists';
const QUERY_ALL_PATH = '/accounting/gl/glaccount/getInitBalanceList';

const TARGETS = Object.freeze([
  { bookId: '3533914511118750', companyCode: 'COMP-LAO-AGRI', code: '400101', from: '赵总', to: '赵永伟' },
  { bookId: '3533914511118750', companyCode: 'COMP-LAO-AGRI', code: '400102', from: '宋总', to: '宋雷' },
  { bookId: '3533914511118750', companyCode: 'COMP-LAO-AGRI', code: '400103', from: '朱总', to: '朱兆存' },
  { bookId: '3537748712226818', companyCode: 'COMP-LAO-XINGCHI', code: '400101', from: '朱总', to: '朱兆存' },
  { bookId: '3537748712226818', companyCode: 'COMP-LAO-XINGCHI', code: '400102', from: '宋总', to: '宋雷' },
]);

function argValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function asBoolean(value) {
  if (typeof value === 'boolean') return value;
  return String(value ?? '').toLowerCase() === 'true';
}

function stableHash(value) {
  return crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
}

function businessFailure(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const error = payload.error && typeof payload.error === 'object' ? payload.error : {};
  const code = String(payload.code ?? error.code ?? '').trim();
  const message = String(payload.msg ?? payload.message ?? error.msg ?? error.message ?? '').trim();
  const failed = payload.success === false
    || payload.result === false
    || Boolean(code && !['0', '200', 'SUCCESS', 'OK', 'OPENAPI.E0000'].includes(code.toUpperCase()));
  return failed ? { code: code || 'BUSINESS_FAILURE', message: message || String(payload.errorMsg || '好业财返回失败') } : null;
}

function collectRows(value, rows = [], seen = new Set()) {
  if (Array.isArray(value)) {
    for (const item of value) collectRows(item, rows, seen);
    return rows;
  }
  if (!value || typeof value !== 'object') return rows;
  const code = rowCode(value);
  const id = String(value.id ?? value.glAccountId ?? value.subjectId ?? '').trim();
  if (code && id) {
    const key = `${id}|${code}`;
    if (!seen.has(key)) {
      seen.add(key);
      rows.push(value);
    }
  }
  for (const nested of Object.values(value)) collectRows(nested, rows, seen);
  return rows;
}

function rowCode(row) {
  return String(row.glAccountCode ?? row.subjectCode ?? row.code ?? '').trim();
}

function rowName(row) {
  return String(row.glAccountName ?? row.subjectName ?? row.name ?? '').trim();
}

function structuralEvidence(row) {
  return {
    id: String(row.id ?? row.glAccountId ?? ''),
    code: String(row.glAccountCode ?? row.code ?? ''),
    parentId: String(row.parentId ?? row.parent?.id ?? ''),
    drCrDirection: Number(row.drCrDirection ?? 0),
    glAccountClassId: Number(row.glAccountClassId ?? 0),
    hasSubsidiaryAccounting: asBoolean(row.hasSubsidiaryAccounting ?? row.isAssistantAccount),
    hasForeignCurrency: asBoolean(row.hasForeignCurrency ?? row.isForeignCurrency),
    hasQtyAccunting: asBoolean(row.hasQtyAccunting ?? row.hasQtyAccounting ?? row.hasQtyRecord),
    isDefault: asBoolean(row.isDefault),
    isLeaf: asBoolean(row.isLeaf),
    status: String(row.status ?? row.statusEnum ?? 'A'),
    baseOpeningBalance: String(row.baseOpeningBalance ?? ''),
    basePostedDr: String(row.basePostedDr ?? ''),
    basePostedCr: String(row.basePostedCr ?? ''),
    baseEndingBalance: String(row.baseEndingBalance ?? ''),
  };
}

function requireEnv(name) {
  const value = String(process.env[name] ?? '').trim();
  if (!value) throw new Error(`Missing required environment variable ${name}`);
  return value;
}

async function providerCall(path, { method = 'GET', query, body, token }) {
  let url = `https://openapi.chanjet.com${path}`;
  if (query && Object.keys(query).length) url += `?${new URLSearchParams(query)}`;
  const response = await fetch(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      appKey: requireEnv('CHANJET_APP_KEY'),
      appSecret: requireEnv('CHANJET_APP_SECRET'),
      openToken: token,
    },
    ...(method === 'POST' ? { body: JSON.stringify(body ?? {}) } : {}),
  });
  const payload = await response.json().catch(() => ({}));
  const failure = businessFailure(payload);
  if (!response.ok || failure) {
    throw new Error(`Chanjet API failed path=${path} http=${response.status} code=${failure?.code || '-'} message=${failure?.message || response.statusText}`);
  }
  return payload;
}

async function readSubject(target, token) {
  const payload = await providerCall(`${QUERY_PATH}/${target.bookId}`, {
    query: { code: target.code, _: String(Date.now()) },
    token,
  });
  const rows = collectRows(payload).filter((row) => rowCode(row) === target.code);
  if (rows.length !== 1) throw new Error(`Expected one subject for ${target.bookId}/${target.code}, found ${rows.length}`);
  return rows[0];
}

async function readSubjectList(target, token) {
  const payload = await providerCall(`${QUERY_ALL_PATH}/${target.bookId}`, {
    query: { bookId: target.bookId, _: String(Date.now()) },
    token,
  });
  const rows = collectRows(payload).filter((row) => rowCode(row) === target.code);
  if (rows.length !== 1) throw new Error(`Expected one subject-list row for ${target.bookId}/${target.code}, found ${rows.length}`);
  return rows[0];
}

async function writeName(target, name, sourceRow, token) {
  return providerCall(`${UPDATE_PATH}/${target.bookId}`, {
    method: 'POST',
    token,
    body: {
      // The official ordinary-account example requires an empty top-level id
      // and resolves the existing account by glAccount.code.
      id: '',
      glAccount: {
        code: target.code,
        name,
        hasSubsidiaryAccounting: asBoolean(sourceRow.hasSubsidiaryAccounting ?? sourceRow.isAssistantAccount),
      },
    },
  });
}

async function waitForName(target, expectedName, token) {
  let lastRow = null;
  let lastListRow = null;
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    [lastRow, lastListRow] = await Promise.all([
      readSubject(target, token),
      readSubjectList(target, token),
    ]);
    if (rowName(lastRow) === expectedName && rowName(lastListRow) === expectedName) {
      return { balanceRow: lastRow, listRow: lastListRow };
    }
    if (attempt < 10) await new Promise((resolve) => setTimeout(resolve, 3_000));
  }
  throw new Error(
    `Readback name mismatch for ${target.bookId}/${target.code}: expected ${expectedName}, balance=${rowName(lastRow)}, subject-list=${rowName(lastListRow)}`,
  );
}

async function audit(client, actionCode, target, before, after, status, detail = {}) {
  await client.query(
    `INSERT INTO sys_operation_logs
      (user_id, username, role_code, module_code, action_code, biz_type,
       biz_no, request_method, request_path, after_data, result_status)
     VALUES (NULL,$1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10)`,
    [
      'codex-orchestrator',
      'ROLE_ADMIN',
      'MENU_SETTINGS_CHANJET',
      actionCode,
      'CHANJET_SUBJECT_NAME',
      `${target.bookId}:${target.code}`,
      'POST',
      `${UPDATE_PATH}/${target.bookId}`,
      JSON.stringify({
        companyCode: target.companyCode,
        bookId: target.bookId,
        subjectCode: target.code,
        before,
        after,
        ...detail,
      }),
      status,
    ],
  );
}

async function loadToken(client) {
  const orgId = requireEnv('CHANJET_ORG_ID');
  const result = await client.query(`SELECT tokens FROM sys_chanjet_state WHERE key='singleton'`);
  const entry = result.rows[0]?.tokens?.[orgId];
  if (!entry?.openToken || Number(entry.expiresAt) <= Date.now() + 60_000) {
    throw new Error('No valid cached Chanjet openToken; refresh through the running API before this Gate');
  }
  return entry.openToken;
}

async function main() {
  const execute = process.argv.includes('--execute');
  const approvalToken = argValue('--approval-token') || '';
  const maxTargets = Number(argValue('--max-targets') || TARGETS.length);
  if (execute && approvalToken !== APPROVAL_TOKEN) throw new Error('Explicit approval token is missing or invalid');
  if (!Number.isInteger(maxTargets) || maxTargets < 1 || maxTargets > TARGETS.length) {
    throw new Error(`--max-targets must be an integer between 1 and ${TARGETS.length}`);
  }

  const { Client } = await import('pg');
  const client = new Client({
    host: process.env.DB_HOST || 'db',
    port: Number(process.env.DB_PORT || 5432),
    user: requireEnv('DB_USER'),
    password: requireEnv('DB_PASSWORD'),
    database: requireEnv('DB_NAME'),
  });
  await client.connect();

  const output = {
    gate: 'CHANJET_SHAREHOLDER_SUBJECT_NAME_APPROVAL_20260723',
    mode: execute ? 'EXECUTE' : 'DRY_RUN',
    decision: 'HOLD',
    writeChanjet: execute,
    targets: [],
    changed: 0,
    unchanged: 0,
    rolledBack: 0,
    providerReceipts: [],
  };
  const completed = [];

  try {
    const token = await loadToken(client);
    const prepared = [];
    for (const target of TARGETS.slice(0, maxTargets)) {
      const [row, listRow] = await Promise.all([
        readSubject(target, token),
        readSubjectList(target, token),
      ]);
      const name = rowName(row);
      const listName = rowName(listRow);
      if (listName !== name) {
        throw new Error(`Read models disagree for ${target.bookId}/${target.code}: balance=${name}, subject-list=${listName}`);
      }
      if (name !== target.from && name !== target.to) {
        throw new Error(`Source-name mismatch for ${target.bookId}/${target.code}: expected ${target.from} or ${target.to}, got ${name}`);
      }
      if (asBoolean(row.isDefault) || !asBoolean(row.isLeaf) || String(row.status ?? row.statusEnum ?? 'A') !== 'A') {
        throw new Error(`Subject is not an editable active leaf: ${target.bookId}/${target.code}`);
      }
      const evidence = structuralEvidence(row);
      prepared.push({ target, row, evidence, name });
      output.targets.push({
        ...target,
        subjectId: evidence.id,
        currentName: name,
        subjectListName: listName,
        action: name === target.to ? 'UNCHANGED' : execute ? 'UPDATE' : 'WOULD_UPDATE',
        structuralHash: stableHash(evidence),
        structuralEvidence: evidence,
      });
    }

    output.planHash = stableHash(output.targets);
    if (!execute) {
      output.decision = 'READY_FOR_APPROVED_EXECUTION';
      console.log(JSON.stringify(output, null, 2));
      return;
    }

    for (const item of prepared) {
      if (item.name === item.target.to) {
        output.unchanged += 1;
        continue;
      }
      const response = await writeName(item.target, item.target.to, item.row, token);
      output.providerReceipts.push({
        bookId: item.target.bookId,
        code: item.target.code,
        response: response && typeof response === 'object'
          ? Object.fromEntries(Object.entries(response).filter(([key]) => !/token|secret|ticket|certificate/i.test(key)))
          : response,
      });
      // Provider acknowledgements may precede read-model convergence. Treat an
      // acknowledged request as compensatable before polling its readback.
      completed.push(item);
      const afterReadback = await waitForName(item.target, item.target.to, token);
      const afterEvidence = structuralEvidence(afterReadback.balanceRow);
      if (stableHash(afterEvidence) !== stableHash(item.evidence)) {
        throw new Error(`Structural evidence changed for ${item.target.bookId}/${item.target.code}`);
      }
      await audit(client, 'CHANJET_SUBJECT_NAME_UPDATE', item.target, item.name, item.target.to, 'SUCCESS', {
        sourceStructuralHash: stableHash(item.evidence),
        responseHash: stableHash(response),
      });
      output.changed += 1;
    }

    output.decision = 'GO';
    output.completedAt = new Date().toISOString();
    console.log(JSON.stringify(output, null, 2));
  } catch (error) {
    const rollbackErrors = [];
    try {
      const token = await loadToken(client);
      for (const item of completed.reverse()) {
        try {
          await writeName(item.target, item.name, item.row, token);
          const restored = await waitForName(item.target, item.name, token);
          if (
            rowName(restored.balanceRow) !== item.name
            || rowName(restored.listRow) !== item.name
            || stableHash(structuralEvidence(restored.balanceRow)) !== stableHash(item.evidence)
          ) {
            throw new Error('rollback readback mismatch');
          }
          await audit(client, 'CHANJET_SUBJECT_NAME_ROLLBACK', item.target, item.target.to, item.name, 'SUCCESS');
          output.rolledBack += 1;
        } catch (rollbackError) {
          rollbackErrors.push(`${item.target.bookId}/${item.target.code}: ${rollbackError.message}`);
        }
      }
    } catch (tokenError) {
      rollbackErrors.push(`rollback token unavailable: ${tokenError.message}`);
    }
    output.decision = rollbackErrors.length ? 'FAIL_REQUIRES_MANUAL_REVIEW' : 'HOLD_ROLLED_BACK';
    output.error = error.message;
    output.rollbackErrors = rollbackErrors;
    console.log(JSON.stringify(output, null, 2));
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
