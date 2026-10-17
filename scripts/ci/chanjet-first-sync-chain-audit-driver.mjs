// R4.2d full-chain audit driver (TEST INFRASTRUCTURE): runs the REAL audit
// module copy the chain staged (R42D_AUDIT_SCRIPT) through productionAudit —
// ONLY the host-identity pieces are bound to the controlled production
// context (captureRuntime: deployed pins; guardProduction: the approved floor
// state; stateDirectory: the fixture state directory). Every data-plane piece
// runs in the REAL productionAudit code: the AUDIT_HOLD=PRODUCTION_SHA_MISMATCH
// binding check, the READ ONLY evidence read against the real database, the
// mapping-scope BLOCK semantics, the container env/health/readiness probes,
// the formal deployment-evidence read and the output assembly. The fail-closed
// CLI tail (hold classification + CHANJET_PRODUCTION_AUDIT=HOLD + exit 1) is
// mirrored verbatim from the module's own CLI.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const cfg = JSON.parse(fs.readFileSync(process.env.R42D_SHIM_CONFIG, 'utf8'));
const auditScript = process.env.R42D_AUDIT_SCRIPT;
// the dispatcher spawns [driver, <staged audit.mjs>, <preflight.sql>]: this
// driver's argv[1] is itself, argv[2] the staged audit copy, argv[3] the SQL
const preflightSqlFile = process.argv[3];

try {
  const mod = await import(pathToFileURL(auditScript).href);
  const output = await mod.productionAudit(cfg.repoRoot, fs.readFileSync(preflightSqlFile, 'utf8'), {
    hostContext: {
      captureRuntime: () => ({
        api: { revision: cfg.targetSha, imageId: cfg.apiImageId },
        web: { revision: cfg.targetSha, imageId: cfg.webImageId },
      }),
      guardProduction: ({ actual }) => {
        if (actual?.api?.revision !== cfg.targetSha) throw Error('CONFIG_HOLD=ACTIVE_RUNTIME_DRIFT');
        const floor = JSON.parse(fs.readFileSync(path.join(cfg.stateDir, 'floor.json'), 'utf8'));
        if (floor.version !== 3 || floor.phase !== 'READY' || floor.floorSha !== cfg.floorSha
          || floor.chanjetPolicy !== 'READONLY_VERIFY' || !floor.readonlyApproval?.approvalId) throw Error('CONFIG_HOLD=FLOOR_NOT_READY');
        return floor;
      },
      stateDirectory: cfg.stateDir,
      // the container env/health probes resolve through the same controlled
      // surface (the production default is the pinned executionEnv)
      probeEnvironment: { ...process.env },
    },
  });
  console.log(JSON.stringify(output));
} catch (error) {
  const match = String(error?.message || '').match(/^(?:AUDIT_HOLD|CONFIG_HOLD|RESTORATION_HOLD|MIGRATION_SCOPE)=[A-Z0-9_]+/);
  if (!match) console.error(`AUDIT_DRIVER_DETAIL=${String(error?.stack || error).replace(/[^\x20-\x7e]/g, ' ').slice(0, 500)}`);
  console.error(`CHANJET_PRODUCTION_AUDIT=HOLD class=${match?.[0] || 'AUDIT_HOLD=COMMAND_FAILED'}`);
  process.exitCode = 1;
}
