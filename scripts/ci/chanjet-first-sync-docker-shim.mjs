// R4.2d full-chain PATH shim: executes the production chain script's host
// surface against the ISOLATED fixture instead of the production host. The
// chain script itself, the audit module, the prepare script and the first-
// sync module all run as their REAL reviewed code — only the HOST bindings
// are controlled:
//   git branch/status/rev-parse/show -> the staged checkout identity
//   docker exec ... <db container>   -> REAL docker exec against the fixture
//       PostgreSQL container (READ ONLY evidence reads AND the bounded stop
//       channel writes are real statements on the real fixture database)
//   docker exec ... <api container> node /tmp/r42d/... -> the REAL prepare
//       script (copied there by the chain's real `docker cp`) with the
//       container's own runtime tuple / database / provider configuration
//   docker cp / inspect / image inspect -> the staged delivery layout,
//       deployed pins and live VERIFY tuple
//   curl http://127.0.0.1:3100/api/readiness -> 200
// Unmapped commands fail loudly (traced as unexpectedCommand) so a test can
// assert the exact host surface the chain touched.
// The chain's `node` is NOT routed here: the test installs a separate bin/node
// wrapper (chanjet-first-sync-chain-dispatch.mjs) for the two steps whose
// host-trusted-path context cannot exist in CI.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const cfg = JSON.parse(fs.readFileSync(process.env.R42D_SHIM_CONFIG, 'utf8'));
const trace = (o) => fs.appendFileSync(cfg.traceFile, `${JSON.stringify(o)}\n`);
const fail = () => { trace({ kind: 'unexpectedCommand', cmd: process.argv[2], argv: process.argv.slice(3) }); process.exit(99); };
// the PATH without the shim wrapper directory: the passthrough spawns the
// REAL docker (never this shim again)
const realEnv = () => {
  const shimBin = process.env.R42D_SHIM_BIN;
  const pathEntries = String(process.env.PATH || '').split(':').filter(Boolean);
  return { ...process.env, PATH: (shimBin ? pathEntries.filter((p) => p !== shimBin) : pathEntries).join(':') };
};

const CMD = process.argv[2];
let args = process.argv.slice(3);

if (CMD === 'docker') {
  // dispatch on the docker subcommand
  const SUB = args[0];
  args = args.slice(1);

  if (SUB === 'inspect') {
    const format = args.includes('--format') ? args[args.indexOf('--format') + 1] : '';
    const target = args.find((a) => a.startsWith('phoenix-v3-')) || '';
    trace({ kind: 'inspect', target, format });
    if (format === '{{.State.Health.Status}}') { console.log('healthy'); process.exit(0); }
    if (format === '{{json .Config.Env}}') {
      console.log(JSON.stringify([
        `CHANJET_SYNC_POLICY=${cfg.syncPolicy}`,
        `CHANJET_READONLY_SYNC_ENABLED=${cfg.readonlySyncEnabled}`,
        `CHANJET_ERP_INBOUND_SYNC_ENABLED=${cfg.erpInboundEnabled}`,
        `CHANJET_READONLY_APPROVAL=${cfg.approvalJson}`,
        `CHANJET_PROVIDER_BASE_URL=${cfg.providerBase}`,
      ]));
      process.exit(0);
    }
    if (format === '{{json .Mounts}}') { console.log('[]'); process.exit(0); }
    if (format === '{{ index .Config.Labels "com.docker.compose.project" }}') { console.log(cfg.project); process.exit(0); }
    if (format === '{{.Image}}') { console.log(target === 'phoenix-v3-api' ? cfg.apiImageId : cfg.webImageId); process.exit(0); }
    fail();
  }

  if (SUB === 'image' && args[0] === 'inspect') {
    if (args.includes('{{.Id}}')) { console.log(cfg.apiImageId); process.exit(0); }
    console.log(cfg.targetSha);
    process.exit(0);
  }

  if (SUB === 'cp') {
    const containerSide = args.find((a) => a.includes(':/'));
    if (!containerSide) fail();
    if (containerSide.includes(':/app/') && args.indexOf(containerSide) === args.length - 2) {
      // container -> host delivery (the chain's stop-channel delivery): the
      // deployed dist is copied IN FULL from the repository's compiled tree;
      // node_modules is staged as a resolvable tree (symlinks into the
      // repo's real packages) — docker cp semantics: a non-existent dst
      // BECOMES the copied directory
      const remote = containerSide.slice(containerSide.indexOf(':') + 1);
      const dst = args[args.length - 1];
      if (remote === '/app/dist') {
        fs.cpSync(path.join(cfg.appApiRoot, 'dist'), dst, { recursive: true });
      } else if (remote === '/app/node_modules') {
        fs.mkdirSync(dst, { recursive: true });
        for (const dep of ['reflect-metadata', 'typeorm', 'pg']) {
          const from = path.join(cfg.appApiRoot, 'node_modules', dep);
          if (!fs.existsSync(from)) fail();
          fs.symlinkSync(from, path.join(dst, dep), 'dir');
        }
      } else fail();
      trace({ kind: 'cpFromContainer', remote, dst });
      process.exit(0);
    }
    // host -> container (manifest / prepare script into /tmp/r42d)
    const dst = args[args.length - 1];
    const src = args[args.length - 2];
    const marker = dst.indexOf(':');
    if (marker < 0) fail();
    const container = dst.slice(0, marker);
    const rest = dst.slice(marker + 1).replace(/^\/tmp\/r42d\/?/, '');
    if (container !== 'phoenix-v3-api' || dst === src) fail();
    const target = path.join(cfg.r42dRoot, rest);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.copyFileSync(src, target);
    trace({ kind: 'cp', src, target });
    process.exit(0);
  }

  if (SUB === 'exec') {
    // docker exec [opts] CONTAINER CMD [args]: collect -e pairs, the
    // container, then the command; everything else passes through verbatim.
    const envs = {};
    const flags = [];
    let container = '';
    const cmdArgs = [];
    for (let i = 0; i < args.length; i += 1) {
      if (!container && args[i] === '-e') {
        const pair = args[i + 1] || '';
        const eq = pair.indexOf('=');
        envs[eq < 0 ? pair : pair.slice(0, eq)] = eq < 0 ? '' : pair.slice(eq + 1);
        i += 1; continue;
      }
      if (!container && args[i].startsWith('-')) { flags.push(args[i]); continue; }
      if (!container) { container = args[i]; continue; }
      // after the container name everything is the command, verbatim
      cmdArgs.push(args[i]);
    }
    // the DB container: a REAL passthrough — every statement (the audit's
    // READ ONLY evidence reads, the first-sync budget reads, the bounded stop
    // channel's BEGIN/COMMIT writes) lands on the real fixture PostgreSQL
    if (container === 'phoenix-v3-db' || container === cfg.dbContainerName) {
      // read stdin fully and forward it as input: deterministic delivery of
      // the piped SQL (never a racing inherit fd)
      const stdin = fs.readFileSync(0);
      trace({ kind: 'dbExec', readOnly: Boolean(envs.PGOPTIONS), stdinBytes: stdin.length, stdinHead: stdin.subarray(0, 120).toString('utf8') });
      // the psql user identity follows the fixture URL's (CI's service
      // container carries the same POSTGRES_USER; local fixtures may omit it)
      const dbEnvs = { POSTGRES_USER: cfg.db.user, ...envs };
      const child = spawnSync('docker', ['exec', ...flags, ...envEntries(dbEnvs), cfg.dbContainerName, ...cmdArgs], { input: stdin, maxBuffer: 64 * 1024 * 1024, env: realEnv() });
      if (child.stdout) process.stdout.write(child.stdout);
      if (child.stderr) process.stderr.write(child.stderr);
      process.exit(child.status ?? 1);
    }
    // the API container: mkdir staging or the REAL prepare from the staged copy
    if (container === 'phoenix-v3-api') {
      if (cmdArgs[0] === 'mkdir') {
        for (const dir of cmdArgs.filter((a) => !a.startsWith('-'))) {
          // only paths INSIDE the staged r42d root map; /tmp/r42d-state (the
          // R42D_STATE directory) is a distinct literal path
          if (dir.startsWith('/tmp/r42d/')) fs.mkdirSync(path.join(cfg.r42dRoot, dir.slice('/tmp/r42d/'.length)), { recursive: true });
          else fs.mkdirSync(dir, { recursive: true });
        }
        process.exit(0);
      }
      if (cmdArgs[0] === 'sh' && cmdArgs[1] === '-c' && typeof cmdArgs[2] === 'string') {
        // the chain's dist provenance digest runs against the repository's
        // compiled tree (the /app equivalent in the controlled context) — the
        // SAME shell pipeline, real files, real digest
        const command = cmdArgs[2].replace(/cd \/app\b/g, `cd '${cfg.appApiRoot}'`);
        trace({ kind: 'apiSh' });
        const child = spawnSync('sh', ['-c', command], { stdio: 'inherit', cwd: cfg.appApiRoot, env: realEnv() });
        process.exit(child.status ?? 1);
      }
      if (cmdArgs[0] === 'node' && String(cmdArgs[1] || '').startsWith('/tmp/r42d/')) {
        const script = path.join(cfg.r42dRoot, String(cmdArgs[1]).replace(/^\/tmp\/r42d\//, ''));
        const containerEnv = {
          DB_HOST: cfg.db.host, DB_PORT: String(cfg.db.port), DB_USER: cfg.db.user,
          DB_PASSWORD: cfg.db.password, DB_NAME: cfg.db.name,
          CHANJET_SYNC_POLICY: cfg.syncPolicy, CHANJET_READONLY_SYNC_ENABLED: cfg.readonlySyncEnabled,
          CHANJET_ERP_INBOUND_SYNC_ENABLED: cfg.erpInboundEnabled, CHANJET_READONLY_APPROVAL: cfg.approvalJson,
          CHANJET_PROVIDER_BASE_URL: cfg.providerBase,
          CHANJET_APP_KEY: 'SYNTHETIC_KEY', CHANJET_APP_SECRET: 'SYNTHETIC_SECRET',
          CHANJET_ORG_ID: 'SYNTHETIC_ORG', CHANJET_CERT: 'SYNTHETIC_CERT',
          R42D_DIST_ROOT: cfg.distRoot, R42D_MODULES: cfg.modulesRoot,
        };
        trace({ kind: 'prepareExec', script });
        const child = spawnSync(process.execPath, [script, ...cmdArgs.slice(2)], {
          encoding: 'utf8', maxBuffer: 16 * 1024 * 1024,
          env: { ...process.env, ...containerEnv, ...envs },
        });
        process.stdout.write(child.stdout || '');
        process.stderr.write(child.stderr || '');
        process.exit(child.status ?? 1);
      }
    }
    fail();
  }

  fail();
}

if (CMD === 'git') {
  if (args.includes('config')) process.exit(0);
  if (args.includes('branch')) { console.log('main'); process.exit(0); }
  if (args.includes('status')) process.exit(0);
  if (args.includes('rev-parse')) { console.log(cfg.checkoutSha || cfg.targetSha); process.exit(0); }
  if (args.includes('show')) {
    const ref = args[args.indexOf('show') + 1];
    const file = ref.slice(ref.indexOf(':') + 1);
    process.stdout.write(fs.readFileSync(path.join(cfg.repoRoot, file)));
    process.exit(0);
  }
  fail();
}

if (CMD === 'curl') {
  trace({ kind: 'readiness', url: args.find((a) => a.startsWith('http')) || '' });
  process.stdout.write(String(cfg.readinessStatus ?? 200));
  process.exit(0);
}

function envEntries(envs) {
  return Object.entries(envs).map(([k, v]) => ['-e', `${k}=${v}`]).flat();
}
