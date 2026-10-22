/** One-shot native Git transport, NOT a production producer or authority gate.
 * Only a compiled factory may supply real admission, immutable intent and child
 * registration capabilities. The production factory remains default-deny.
 * No CLI, network fetch, reset, detached checkout, rollback or retry exists. */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash, randomBytes } from 'node:crypto';
import { hold, SHA, canonicalDigest } from './production-maintenance-receipts.mjs';
import { strictSshCommand } from './production-trusted-paths.mjs';

const launcher = fileURLToPath(new URL('./production-maintenance-gated-checkout.py', import.meta.url));
const controls = root => ['-c', `safe.directory=${root}`, '-c', 'core.hooksPath=/dev/null', '-c', 'core.fsmonitor=false',
  '-c', 'gc.auto=0', '-c', 'maintenance.auto=false', '-c', 'merge.autoStash=false', '-c', 'submodule.recurse=false', '-c', 'checkout.workers=1'];
const deniedConfig = /^(?:filter\.|merge\.(?:[^.]+\.driver|verifysignatures)$|gpg\.(?:program$|.*\.program$)|branch\.main\.mergeoptions$|extensions\.partialclone$|remote\..*\.(?:promisor|partialclonefilter)$|core\.(?:gitproxy|sparsecheckout|sparsecheckoutcone)$|index\.sparse$)/i;
const deniedEnvironment = key => /^(?:GIT_|LD_|DYLD_|PYTHON)/.test(key) && !['GIT_SSH_COMMAND', 'GIT_TERMINAL_PROMPT'].includes(key);

export function checkoutGitEnvironment(environment = process.env) {
  if (Object.keys(environment).some(deniedEnvironment)) hold('CHECKOUT_EXECUTABLE_ENVIRONMENT_UNSUPPORTED');
  if (environment.GIT_TERMINAL_PROMPT !== undefined && environment.GIT_TERMINAL_PROMPT !== '0') hold('CHECKOUT_INTERACTIVE_TRANSPORT_REFUSED');
  return { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', HOME: environment.HOME || '/root',
    ...(environment.XDG_CONFIG_HOME ? { XDG_CONFIG_HOME: environment.XDG_CONFIG_HOME } : {}),
    ...(environment.GIT_SSH_COMMAND ? { GIT_SSH_COMMAND: strictSshCommand(environment.GIT_SSH_COMMAND) } : {}),
    GIT_TERMINAL_PROMPT: '0', GIT_NO_LAZY_FETCH: '1' };
}
function native(root, args, env, budget = () => 10000) {
  try { return execFileSync('/usr/bin/git', [...controls(root), '--no-optional-locks', ...args],
    { cwd: root, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: Math.max(1, Math.min(10000, budget())), maxBuffer: 16 * 1024 * 1024 }); }
  catch { hold('CHECKOUT_NATIVE_GIT_REFUSED'); }
}
export function inspectCheckoutGit(root, expected, target, env = checkoutGitEnvironment(), budget = () => 10000) {
  const read = args => { budget(); const result = native(root, args, env, budget); budget(); return result; };
  if (!path.isAbsolute(root) || fs.realpathSync(root) !== root || !SHA.test(expected) || !SHA.test(target)) hold('CHECKOUT_EXACT_SCOPE_REQUIRED');
  // Config listing invokes no configured filter/signature/transport executable.
  // Never expose values (which can contain credentials), only fixed error codes.
  // Scope is the repository's OWN config: host-level system/global config (for
  // example a runner image's /etc/gitconfig filter.lfs entries) is part of the
  // trusted host baseline this native Git transport already runs under, while
  // anything the repository itself configured stays fully denied.
  const keys = read(['config', '--null', '--name-only', '--list', '--local']).split('\0').filter(Boolean);
  if (keys.some(key => deniedConfig.test(key))) hold('CHECKOUT_EXECUTABLE_CONFIG_UNSUPPORTED');
  if (keys.some(key => key.toLowerCase() === 'core.sshcommand')) {
    const selected = read(['config', '--get', 'core.sshCommand']).trim();
    // Validate the existing transport policy; local Git mutation never contacts it.
    strictSshCommand(env.GIT_SSH_COMMAND || selected);
  }
  const gitDir = read(['rev-parse', '--absolute-git-dir']).trim();
  if (read(['rev-parse', '--path-format=absolute', '--git-common-dir']).trim() !== gitDir) hold('CHECKOUT_LINKED_WORKTREE_UNSUPPORTED');
  if (['shallow', 'info/grafts', 'objects/info/alternates', 'objects/info/http-alternates'].some(file => fs.existsSync(path.join(gitDir, file)))
    || read(['for-each-ref', '--format=%(refname)', 'refs/replace/']).trim()) hold('CHECKOUT_OBJECT_STORE_UNSUPPORTED');
  if (read(['ls-files', '-v', '-z']).split('\0').filter(Boolean).some(entry => /^[a-zS] /.test(entry))
    || read(['ls-files', '--stage', '-z']).split('\0').filter(Boolean).some(entry => entry.startsWith('160000 '))
    || read(['ls-tree', '-r', '-z', target]).split('\0').filter(Boolean).some(entry => entry.startsWith('160000 '))) hold('CHECKOUT_INDEX_OR_SUBMODULE_UNSUPPORTED');
  if (read(['branch', '--show-current']).trim() !== 'main'
    || read(['rev-parse', 'HEAD']).trim() !== expected
    || read(['status', '--porcelain=v1', '--untracked-files=all', '--ignore-submodules=none']).trim()) hold('CHECKOUT_NOT_EXACT_CLEAN_MAIN');
  if (read(['rev-parse', 'origin/main']).trim() !== target) hold('CHECKOUT_ORIGIN_MAIN_DRIFT');
  read(['cat-file', '-e', `${target}^{commit}`]);
  read(['merge-base', '--is-ancestor', expected, target]);
  // Read actual closure locally. Missing objects cannot trigger a lazy network fetch.
  read(['rev-list', '--objects', '--missing=error', target]);
  return { branch: 'main', head: expected, target, originMain: target, clean: true };
}
function closeWaiter(child) {
  const result = { error: false, closed: false, code: null, signal: null };
  const promise = new Promise(resolve => {
    child.once('error', () => { result.error = true; });
    child.once('close', (code, signal) => { Object.assign(result, { closed: true, code, signal }); resolve(result); });
  });
  return { result, promise };
}
async function bounded(promise, timeoutMs, code) {
  let timer;
  try { return await Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error(`MAINTENANCE_HOLD=${code}`)), timeoutMs); })]); }
  finally { clearTimeout(timer); }
}
export class RegisteredMainFastForward {
  #used = false;
  /** Capabilities are trusted code, never fields accepted from a release JSON.
   * revalidate must refresh actual owner/FD9/floor/marker/isolation/remote facts.
   * writeIntent must durably create an exclusive record before launcher start.
   * Source helper hashes/trusted staging belong to the outer factory admission. */
  constructor({ root, previousSha, targetSha, lockFile }, capabilities = {}) {
    Object.assign(this, { root, previousSha, targetSha, lockFile }); this.capabilities = capabilities;
  }
  async run({ signal, timeoutMs = 30000 } = {}) {
    if (this.#used) hold('CHECKOUT_ATTEMPT_REUSED'); this.#used = true;
    const { root, previousSha, targetSha, lockFile, capabilities: c } = this;
    if (previousSha === targetSha) hold('CHECKOUT_EXACT_SCOPE_REQUIRED');
    if (!['revalidate', 'writeIntent', 'registerOwnedChild'].every(key => typeof c[key] === 'function')) hold('CHECKOUT_COMPILED_CAPABILITIES_REQUIRED');
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 120000 || !path.isAbsolute(lockFile) || fs.realpathSync(lockFile) !== lockFile) hold('CHECKOUT_FIXED_SCOPE_REQUIRED');
    const deadline = performance.now() + timeoutMs, remaining = () => {
      if (signal?.aborted || performance.now() >= deadline) hold('CHECKOUT_ABORTED_OR_TIMEOUT');
      return Math.max(1, Math.floor(deadline - performance.now()));
    };
    const validate = async () => { remaining(); await bounded(Promise.resolve().then(() => c.revalidate()), remaining(), 'CHECKOUT_ADMISSION_TIMEOUT'); remaining(); };
    const env = checkoutGitEnvironment();
    await validate();
    const before = inspectCheckoutGit(root, previousSha, targetSha, env, remaining);
    // Verify the controller really has FD9. The launcher additionally proves its
    // duplicate belongs to the *held* description, not merely the same inode.
    let fd, named;
    try { fd = fs.fstatSync(9); named = fs.lstatSync(lockFile); } catch { hold('CHECKOUT_SELF_FD9_REQUIRED'); }
    if (!named.isFile() || named.isSymbolicLink() || named.uid !== process.getuid() || named.nlink !== 1 || (named.mode & 0o7777) !== 0o600
      || fd.dev !== named.dev || fd.ino !== named.ino) hold('CHECKOUT_SELF_FD9_REQUIRED');
    const launcherSha256 = createHash('sha256').update(fs.readFileSync(launcher)).digest('hex');
    await validate();
    await bounded(Promise.resolve().then(() => c.writeIntent({ schema: 'phoenix.gated-checkout-intent/v1', before,
      lockIdentity: { dev: named.dev, ino: named.ino }, launcherSha256 })), remaining(), 'CHECKOUT_INTENT_TIMEOUT');
    await validate();
    // The only spawned executable initially waits; it cannot run Git before the
    // actual session registers it and admission is checked again. Keep original9.
    const token = randomBytes(32).toString('hex');
    const child = spawn('/usr/bin/python3', ['-I', launcher, root, targetSha, lockFile, token],
      { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 'ignore', 9] });
    const closed = closeWaiter(child); let readyBuffer = '', outputBytes = 0, sent = false;
    // Consume bounded diagnostics without exposing repository/config/command data.
    child.stderr.on('data', bytes => { outputBytes += bytes.length; });
    const ready = new Promise((resolve, reject) => {
      child.stdout.on('data', bytes => {
        outputBytes += bytes.length;
        if (!sent) {
          readyBuffer += bytes.toString('utf8');
          if (readyBuffer === `CHECKOUT_GATE_READY=${token}\n`) resolve();
          else if (readyBuffer.length > 128 || readyBuffer.includes('\n')) reject(new Error('MAINTENANCE_HOLD=CHECKOUT_GATE_PROTOCOL'));
        }
      });
      child.once('error', () => reject(new Error('MAINTENANCE_HOLD=CHECKOUT_LAUNCHER_START_FAILED')));
      child.once('close', () => reject(new Error('MAINTENANCE_HOLD=CHECKOUT_LAUNCHER_CLOSED_BEFORE_GO')));
    });
    ready.catch(() => {});
    // A write-side error must not become an unhandled crash or an implicit retry.
    child.stdin.on('error', () => {});
    try {
      const registered = c.registerOwnedChild(child);
      if (registered?.registered !== true || registered.pid !== child.pid) hold('CHECKOUT_ACTUAL_CHILD_REGISTRATION_REQUIRED');
      await bounded(ready, Math.min(remaining(), 5000), 'CHECKOUT_GATE_TIMEOUT');
      await validate();
      inspectCheckoutGit(root, previousSha, targetSha, env, remaining);
      await validate(); remaining();
      sent = true; child.stdin.end(`GO ${token}\n`);
      const result = await bounded(closed.promise, remaining(), 'CHECKOUT_CLOSE_UNVERIFIED');
      if (result.error || result.code !== 0 || result.signal !== null) hold('CHECKOUT_GIT_RESULT_HOLD');
      await validate();
      // Local post inspection still cannot replace remote/floor/runtime checks.
      const after = inspectCheckoutGit(root, targetSha, targetSha, env, remaining);
      remaining();
      return { schema: 'phoenix.registered-checkout-observation/v1', before, after, launcherSha256,
        originalChildPid: child.pid, closeVerified: true, outputBytes, productionAdmission: false,
        observationSha256: canonicalDigest({ before, after, launcherSha256, pid: child.pid }) };
    } catch (error) {
      // Closing an ungranted gate is safe. After GO no kill/retry/reset: actual
      // session child debt and inherited FD9 remain until genuine stdio close.
      if (!sent) {
        child.stdin.end();
        await bounded(closed.promise, 5000, 'CHECKOUT_UNGRANTED_CLOSE_UNVERIFIED');
      }
      throw error;
    }
  }
}
