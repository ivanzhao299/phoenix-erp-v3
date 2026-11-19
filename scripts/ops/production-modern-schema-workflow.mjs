/** GitHub-runner transport for the dedicated default-off schema release. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { requestModernSchemaIdentityToken } from './production-modern-schema-identity.mjs';

const repo = 'ivanzhao299/phoenix-erp-v3';
const host = '47.236.122.224';
const fingerprint = 'SHA256:Y4WEXMJ24a4r1KxOw0det4qcCFNxj65mZeIG9oQOJcI';
const sha = /^[a-f0-9]{40}$/;
const digest = /^[a-f0-9]{64}$/;
const validToken = /^[A-Za-z0-9_.-]{10,2048}$/;
const required = {
  GITHUB_REPOSITORY: repo,
  GITHUB_REF: 'refs/heads/main',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_JOB: 'deploy',
  RUNNER_ENVIRONMENT: 'github-hosted',
  GITHUB_ACTOR: 'emvia',
  GITHUB_ACTOR_ID: '7245339',
  GITHUB_TRIGGERING_ACTOR: 'emvia',
  GITHUB_WORKFLOW_REF: repo + '/.github/workflows/deploy.yml@refs/heads/main',
  DEPLOY_MODE: 'api',
  BUILD_API: 'true',
  BUILD_WEB: 'false',
  RUN_MIG: 'false',
  APPROVE_PRODUCTION: 'true',
  PRESERVE_ARTIFACTS: 'true',
  MODERN_SCHEMA_RELEASE: 'true',
};
const execEnv = { PATH: '/usr/bin:/bin', LANG: 'C' };
const fail = phase => Error('MODERN_SCHEMA_WORKFLOW_HOLD=' + phase);
const match = (pattern, input) => typeof input === 'string' && pattern.test(input);
const quote = value => "'" + value.replaceAll("'", "'\"'\"'") + "'";
const staticKeys = ['schema', 'owner', 'targetSha'];

function fromEnv(env) {
  if (Object.entries(required).some(([key, value]) => env[key] !== value) ||
      !match(sha, env.GITHUB_SHA) || env.GITHUB_WORKFLOW_SHA !== env.GITHUB_SHA ||
      env.APPROVED_CONFIG_FLOOR_SHA !== env.GITHUB_SHA ||
      !match(sha, env.APPROVED_PREVIOUS_FLOOR_SHA) || env.APPROVED_PREVIOUS_FLOOR_SHA === env.GITHUB_SHA ||
      !match(/^[1-9][0-9]{0,19}$/, env.GITHUB_RUN_ID) ||
      !match(/^[1-9][0-9]{0,9}$/, env.GITHUB_RUN_ATTEMPT) ||
      env.MAINTENANCE_RELEASE_INPUT || env.SKU_SOURCE_EFFECTIVE_DATE || env.SKU_SOURCE_PLAN_SHA256 ||
      env.ROTATE_CHANJET_CREDENTIALS !== 'false' || env.ONE_TIME_CONFIG_FLOOR_TRANSITION !== 'false') {
    throw fail('EXACT_DISPATCH_REQUIRED');
  }
  const targetSha = env.GITHUB_SHA;
  const owner = env.GITHUB_RUN_ID + '-' + env.GITHUB_RUN_ATTEMPT;
  const hostEnv = {
    TARGET_SHA: targetSha,
    DEPLOY_RUN_ID: owner,
    DEPLOY_RUN_ATTEMPT: env.GITHUB_RUN_ATTEMPT,
    APPROVED_CONFIG_FLOOR_SHA: targetSha,
    APPROVED_PREVIOUS_FLOOR_SHA: env.APPROVED_PREVIOUS_FLOOR_SHA,
    API_IMAGE: 'ghcr.io/' + repo + '/api:sha-' + targetSha,
    DEPLOY_MODE: 'api',
    BUILD_API: 'true',
    BUILD_WEB: 'false',
    RUN_MIG: 'false',
    APPROVE_PRODUCTION: 'true',
    PRESERVE_ARTIFACTS: 'true',
    ROTATE_CHANJET_CREDENTIALS: 'false',
    ONE_TIME_CONFIG_FLOOR_TRANSITION: 'false',
  };
  return { targetSha, owner, hostEnv };
}

function parsePublic(value, keys, schema, binding, phase) {
  let row;
  try {
    row = JSON.parse(value);
  } catch {
    throw fail(phase);
  }
  if (!row || Object.getPrototypeOf(row) !== Object.prototype ||
      Object.keys(row).sort().join(',') !== [...staticKeys, ...keys].sort().join(',') ||
      row.schema !== schema || row.owner !== binding.owner || row.targetSha !== binding.targetSha) {
    throw fail(phase);
  }
  return row;
}

export async function runModernSchemaWorkflow(env, dependencies) {
  const binding = fromEnv(env);
  if (!match(validToken, env.MODERN_SCHEMA_GITHUB_READ_TOKEN)) throw fail('GITHUB_READ_CHANNEL_REQUIRED');
  const ssh = dependencies.createSsh(env, binding.hostEnv);
  try {
    const hostPreparation = ssh.exchange('prepare', env.MODERN_SCHEMA_GITHUB_READ_TOKEN + '\n');
    if (hostPreparation.status !== 0) throw fail('PREPARATION_COMMAND_FAILED');
    const preparation = parsePublic(hostPreparation.stdout, ['preparationSha256', 'prepared'],
      'phoenix.modern-schema-public-preparation/v1', binding, 'PREPARATION_RECEIPT');
    if (preparation.prepared !== true || !match(digest, preparation.preparationSha256)) {
      throw fail('PREPARATION_RECEIPT');
    }

    const identityBinding = { owner: binding.owner, targetSha: binding.targetSha, preparationSha256: preparation.preparationSha256 };
    const identityToken = await dependencies.requestToken(identityBinding);
    if (!match(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, identityToken) || identityToken.length > 16384) {
      throw fail('IDENTITY_TOKEN_REQUIRED');
    }

    const input = JSON.stringify({
      schema: 'phoenix.modern-schema-run-input/v1',
      preparationSha256: preparation.preparationSha256,
      identityToken,
      githubReadToken: env.MODERN_SCHEMA_GITHUB_READ_TOKEN,
    }) + '\n';
    const hostRelease = ssh.exchange('run', input);
    const result = parsePublic(hostRelease.stdout, ['outcome', 'defaultOff'],
      'phoenix.modern-schema-public-result/v1', binding, 'RELEASE_RECEIPT');
    if (!['SUCCESS', 'HOLD'].includes(result.outcome) || result.defaultOff !== true) throw fail('RELEASE_RECEIPT');
    if ((hostRelease.status === 0) !== (result.outcome === 'SUCCESS')) throw fail('RELEASE_COMMAND_STATUS');
    return { schema: result.schema, owner: result.owner, targetSha: result.targetSha, outcome: result.outcome, defaultOff: true };
  } finally {
    ssh.close();
  }
}

function command(program, argv, input, timeout = 12000) {
  const output = execFileSync(program, argv, {
    input, timeout, maxBuffer: 65536, encoding: 'utf8', env: execEnv, stdio: ['pipe', 'pipe', 'pipe'],
  });
  return output.trim();
}

function pinnedKnownHost() {
  const keys = command('/usr/bin/ssh-keyscan', ['-T', '8', '-t', 'ed25519,ecdsa,rsa', host]).split('\n');
  const matching = keys.filter(row => {
    const cells = row.trim().split(/[ \t]+/);
    if (cells.length !== 3 || cells[0] !== host || !/^(?:ssh-(?:ed25519|rsa)|ecdsa-sha2-nistp(?:256|384|521))$/.test(cells[1]) ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(cells[2])) return false;
    const info = command('/usr/bin/ssh-keygen', ['-E', 'sha256', '-l', '-f', '-'], row + '\n');
    return info.split(/\s+/)[1] === fingerprint;
  });
  if (matching.length !== 1) throw fail('EXACT_SSH_HOST_KEY_REQUIRED');
  return matching[0] + '\n';
}

function reviewedSource(sha, filename) {
  // Settings and the host wrapper come from the immutable workflow commit.
  return command('/usr/bin/git', ['show', sha + ':' + filename]);
}

function createProductionSsh(env, hostEnv) {
  if (!match(/^[A-Za-z_][A-Za-z0-9_.-]{0,30}$/, env.MODERN_SCHEMA_SSH_USER) ||
      typeof env.MODERN_SCHEMA_SSH_KEY !== 'string' || env.MODERN_SCHEMA_SSH_KEY.length > 16384 ||
      !/^-----BEGIN (?:OPENSSH |RSA |EC )?PRIVATE KEY-----\r?\n/.test(env.MODERN_SCHEMA_SSH_KEY) ||
      !path.isAbsolute(env.RUNNER_TEMP || '')) throw fail('SSH_CHANNEL_REQUIRED');
  const directory = fs.mkdtempSync(path.join(env.RUNNER_TEMP, 'phoenix-modern-schema-'));
  const dispose = () => fs.rmSync(directory, { recursive: true, force: true });
  try {
    const keyFile = path.join(directory, 'identity'), knownHosts = path.join(directory, 'known-hosts');
    fs.writeFileSync(keyFile, env.MODERN_SCHEMA_SSH_KEY.trimEnd() + '\n', { flag: 'wx', mode: 0o600 });
    fs.writeFileSync(knownHosts, pinnedKnownHost(), { flag: 'wx', mode: 0o600 });
    const payloads = {
      PRODUCTION_CONTRACT_B64: 'scripts/ops/production-config-contract.json',
      PRODUCTION_PATH_HELPER_B64: 'scripts/ops/production-trusted-paths.mjs',
      PRODUCTION_CONTROL_BOOTSTRAP_B64: 'scripts/ops/production-control-bootstrap.sh',
    };
    for (const [key, filename] of Object.entries(payloads)) {
      hostEnv[key] = Buffer.from(reviewedSource(hostEnv.TARGET_SHA, filename)).toString('base64');
    }
    const source = reviewedSource(hostEnv.TARGET_SHA, 'scripts/ops/production-modern-schema-ssh.sh');
    const exportArgs = Object.entries(hostEnv).map(([key, value]) => key + '=' + quote(value));
    const baseCmd = ['/usr/bin/env -u BASH_ENV -u ENV', ...exportArgs, '/bin/bash --noprofile --norc -c', quote(source), '--'].join(' ');
    const flags = ['-F', '/dev/null', '-T', '-i', keyFile,
      '-o', 'BatchMode=yes', '-o', 'IdentitiesOnly=yes', '-o', 'IdentityAgent=none', '-o', 'ClearAllForwardings=yes',
      '-o', 'StrictHostKeyChecking=yes', '-o', 'UpdateHostKeys=no', '-o', 'GlobalKnownHostsFile=/dev/null',
      '-o', 'UserKnownHostsFile=' + knownHosts, '-o', 'ConnectionAttempts=1', '-o', 'ConnectTimeout=15',
      '-o', 'ServerAliveInterval=15', '-o', 'ServerAliveCountMax=3', '-o', 'LogLevel=ERROR',
      '-l', env.MODERN_SCHEMA_SSH_USER, host];
    return {
      exchange(operation, stdin) {
        if (!['prepare', 'run'].includes(operation)) throw fail('SSH_OPERATION_REQUIRED');
        try {
          return { status: 0, stdout: command('/usr/bin/ssh', [...flags, baseCmd + ' ' + operation], stdin, 34 * 60 * 1000) };
        } catch (error) {
          // Discard stderr and never include child command lines or exception data.
          if (Number.isInteger(error.status) && typeof error.stdout === 'string' && error.stdout.length <= 65536) {
            return { status: error.status, stdout: error.stdout.trim() };
          }
          throw fail(operation === 'run' ? 'RELEASE_TRANSPORT_OUTCOME_UNKNOWN' : 'PREPARATION_TRANSPORT_FAILED');
        }
      },
      close: dispose,
    };
  } catch {
    dispose();
    throw fail('SSH_SETUP_FAILED');
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runModernSchemaWorkflow(process.env, {
      createSsh: createProductionSsh,
      requestToken: requestModernSchemaIdentityToken,
    });
    console.log(JSON.stringify(result));
    if (result.outcome !== 'SUCCESS') process.exitCode = 1;
  } catch (error) {
    const message = error?.message;
    console.error(typeof message === 'string' && /^MODERN_SCHEMA_WORKFLOW_HOLD=[A-Z0-9_]{1,100}$/.test(message) ?
      message : 'MODERN_SCHEMA_WORKFLOW_HOLD=TRANSPORT_OR_IDENTITY_UNVERIFIED');
    process.exitCode = 1;
  }
}
