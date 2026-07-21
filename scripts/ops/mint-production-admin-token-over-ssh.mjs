#!/usr/bin/env node

import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const required = ['DEPLOY_HOST', 'DEPLOY_USER', 'DEPLOY_SSH_KEY'];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
  console.error(`Missing required env: ${missing.join(', ')}`);
  process.exit(2);
}

const host = process.env.DEPLOY_HOST;
const user = process.env.DEPLOY_USER;
const port = process.env.DEPLOY_PORT || '22';
const deployPath = process.env.DEPLOY_PATH || '~/phoenix-erp';
const expiresIn = process.env.PHOENIX_CI_TOKEN_EXPIRES_IN || '20m';
const maxAttempts = Math.max(1, Number(process.env.PHOENIX_SSH_MAX_ATTEMPTS || 3));

const tempDir = mkdtempSync(join(tmpdir(), 'phoenix-ci-ssh-'));
const keyPath = join(tempDir, 'deploy_key');

const tokenScript = `
const jwt = require('jsonwebtoken');
const secret = process.env.JWT_SECRET;
if (!secret || secret === 'DEV_ONLY_INSECURE_FALLBACK_KEY_DO_NOT_USE_IN_PROD') {
  console.error('JWT_SECRET_NOT_AVAILABLE');
  process.exit(4);
}
const adminId = Number(process.env.PHOENIX_CI_ADMIN_ID || 0);
const permsVersion = Number(process.env.PHOENIX_CI_PERMS_VERSION || 1);
const expiresIn = process.env.PHOENIX_CI_TOKEN_EXPIRES_IN || '20m';
if (!adminId) {
  console.error('ADMIN_ID_NOT_AVAILABLE');
  process.exit(5);
}
const payload = {
  userId: adminId,
  sub: adminId,
  username: 'admin',
  realNameZh: 'CI Chanjet Readonly Sync',
  role: 'ROLE_ADMIN',
  roleNameZh: '集团超级管理员',
  storeCode: 'ALL',
  store_code: 'ALL',
  locale: 'zh-CN',
  roles: ['ROLE_ADMIN'],
  permissions: ['*'],
  perms_version: permsVersion,
};
process.stdout.write(jwt.sign(payload, secret, { expiresIn }));
`;
const encodedTokenScript = Buffer.from(tokenScript, 'utf8').toString('base64');

const remoteDeployPath = deployPath.startsWith('~/')
  ? `"$HOME"/${JSON.stringify(deployPath.slice(2))}`
  : JSON.stringify(deployPath);
const remoteCommand = [
  `cd ${remoteDeployPath}`,
  'USER_ROW="$(docker compose exec -T db sh -c \'psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Atc "select user_id::text || \'"\'"\'|\'"\'"\' || coalesce(perms_version,1)::text from sys_user where username=\'"\'"\'admin\'"\'"\' and status=1 limit 1"\' | tr -d \'\\r\\n\')"',
  '[ -n "$USER_ROW" ] || { echo "ACTIVE_ADMIN_NOT_FOUND" >&2; exit 3; }',
  'ADMIN_ID="${USER_ROW%%|*}"',
  'PERMS_VERSION="${USER_ROW##*|}"',
  `printf '%s' ${JSON.stringify(encodedTokenScript)} | base64 --decode | docker compose exec -T -e PHOENIX_CI_ADMIN_ID="$ADMIN_ID" -e PHOENIX_CI_PERMS_VERSION="$PERMS_VERSION" -e PHOENIX_CI_TOKEN_EXPIRES_IN=${JSON.stringify(expiresIn)} api node`,
].join(' && ');

try {
  writeFileSync(keyPath, `${process.env.DEPLOY_SSH_KEY.trim()}\n`, { mode: 0o600 });
  let token = '';
  let lastError = '';
  let lastStdout = '';
  let lastStatus = null;

  for (let attempt = 1; attempt <= maxAttempts && !token; attempt += 1) {
    const ssh = spawnSync('ssh', [
      '-S', 'none',
      '-i', keyPath,
      '-p', String(port),
      '-o', 'ControlMaster=no',
      '-o', 'ControlPath=none',
      '-o', 'ConnectionAttempts=1',
      '-o', 'ServerAliveInterval=10',
      '-o', 'ServerAliveCountMax=3',
      '-o', 'StrictHostKeyChecking=no',
      '-o', 'UserKnownHostsFile=/dev/null',
      '-o', 'ConnectTimeout=30',
      `${user}@${host}`,
      remoteCommand,
    ], {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });

    // docker compose/SSH may emit harmless informational text around stdout.
    const tokens = (ssh.stdout || '').match(/eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g) || [];
    token = tokens.at(-1) || '';
    lastStdout = ssh.stdout || '';
    lastStatus = ssh.status;
    lastError = (ssh.stderr || ssh.stdout || `SSH token mint attempt ${attempt} returned no token`).trim();

    if (!token && attempt < maxAttempts) {
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, attempt * 1000);
    }
  }

  if (!token) {
    const sanitized = `${lastError}\nstdout=${lastStdout}`
      .replace(/[A-Za-z0-9_-]{20,}/g, '[REDACTED]')
      .replace(/[^\x20-\x7E\n\r\t]/g, '?')
      .slice(0, 500);
    console.error(`Remote command did not return a JWT token after ${maxAttempts} attempt(s) (status=${lastStatus}, sanitized=${JSON.stringify(sanitized)}).`);
    process.exit(6);
  }
  process.stdout.write(token);
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
