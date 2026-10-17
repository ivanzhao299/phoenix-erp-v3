# Web-only deployment evidence protocol remediation

Base: `9155dcccd7578288a2ccedc9f2ec3f0dd0bf1f7e`.
Engineering worktree: `codex/web-evidence-protocol`.
Production execution: **NOT_RUN**. This document grants no production authorization.

## Failure and resulting contract

The v2 PRE/POST comparator unconditionally required both Web and DB to remain unchanged, while the official Web deployment path intentionally replaced Web. It then captured API startup evidence even though API had not changed. A legitimate Web-only release therefore reached `WEB_CHANGED` or attempted to reuse an old API startup window.

New captures use `phoenix.production-deployment-evidence/v3`. Each PRE, POST, startup bundle, per-service startup summary, and deployment transaction contains `deployMode`. CLI captures require a valid explicit mode; a new transaction cannot verify historical v2 evidence. Removing/changing a mode, crossing run IDs/attempts, mixing schemas or changing SHA bindings fails closed. Historical v2 receipts remain strictly API-only, preserving the existing frozen recovery paths without permitting Web/full reinterpretation.

| Mode | Switched services | Mandatory unchanged services | Startup evidence |
|---|---|---|---|
| api | API at exact target OCI revision | Web and DB | API stdout/stderr, schema marker and API readiness |
| web | Web at exact target OCI revision | API and DB | Web stdout/stderr, Next `Ready in ...` marker, Web HTTP smoke and API readiness |
| full | API and Web, both at exact target OCI revision | DB | Both API and Web summaries |

For unchanged services the v3 comparison retains container ID, Created, StartedAt, immutable image ID, OCI revision where applicable, restart count and mounts, with healthy/running required before and after. Switched containers must have a fresh ID and start inside the current PRE/POST window, zero restarts, healthy state and the target revision. Final live re-inspection retains these identities, mounts and restart counts across all three services.

The Web summary uses the actual Web container's timestamped stdout and stderr; it does not fabricate an API schema marker. Raw logs remain absent from persisted evidence. Existing output bounds, secret redaction, SQL/write detection and error detection apply to both services. A startup bundle must contain exactly the services selected by the mode.

The official workflow sets the Web HTTP evidence flag only after both actual HTTP smoke probes succeed. Its CI test list includes the new mode matrix. Existing root/trusted path validation, FD9, floor guards, storage guards and atomic state persistence remain active. The deployment state persists mode, prevents out-of-mode candidate/switch operations, and completes only after evidence and live re-inspection pass.

The formal audit now sends both legacy v2 and v3 receipts through the common mode/file verifier, then requires full live re-inspection for API, Web and DB. It cannot accept same-image container recreation, restart, mount or health drift on historical POST evidence. Missing verifiers fail closed. The auditor carries its reviewed verifier closure in the same protected staging directory; it does not select an older installed verifier. The existing installed guard and runtime capture still bind the actual checkout/floor. The audit workflow hashes the reviewed bundle before staging, and the production chain copies its complete import closure. A frozen source fixture contains the actual identical nine-file helper closure from `22687886` and `9155dccc`, pinned by full source hashes, so the compatibility test also runs in shallow CI checkouts.

## Verification

Executed using Node `v20.20.2`:

- Final full production deployment command plus ownership guard: **253 tests, 251 PASS, 2 existing environment-dependent skips, 0 FAIL**. See `artifacts/web-only-evidence-protocol/node20-deployment-suite.log`.
- Final real explicitly owned PostgreSQL18 first-sync contract plus ownership negatives: **35/35 PASS**, zero skips/failures. See `node20-first-sync-contract-owned.log`.
- Old-helper compatibility/mode matrix **14/14 PASS**; full reviewed audit staging closure **5/5 PASS**.
- New mode and complete CLI targeted matrix includes formal audit floor mismatch, a new transaction rejecting legacy receipts, and actual old-helper compatibility; see archived test logs for final counts.
- Mode cases cover API-only, Web-only and full; tampered/missing/unknown mode; schema downgrade; stale container/startup identity; wrong target OCI; unchanged API/DB mount, restart and health drift; cross-run/attempt evidence; missing Web smoke/startup proof; and post-snapshot live identity changes.
- Real isolated complete CLI runs verify all three v3 modes and confirm wrong-mode failure preserves transaction markers and state bytes.
- All three changed workflow YAML files parsed; every shell run/SSH script block and the production-chain shell passed syntax checks (exact counts in `validation-summary.json`).
- `git diff --check`: PASS.

Independent review found and closed two audit gaps: a hand-written legacy path had bypassed mode validation, and the v3 audit had compared only image/revision pins without current full identities. Additional negative tests now exercise both audit entry paths. A further bootstrap incompatibility with old installed verifiers was closed by staging the reviewed new verifier closure.

The full test command has two existing environment-dependent skips: UID 0 atomic environment writer (this process is not root), and isolated PostgreSQL hash fingerprint fixture (no `CHANJET_HASH_FIXTURE_CONTAINER` configured). These are NOT_RUN for this run, not inherited PASS. The API was independently compiled in this worktree for the real first-sync fixture. Web application type checks and GitHub Required CI are NOT_RUN for this independent worktree. The real Web/Next container startup and HTTP failure rehearsal has now passed in an isolated Docker fixture (details below). GitHub CI and an exact future production release SHA still require their own receipts.

## Admission and recovery boundaries

This remediation changes protected evidence/state/audit/workflow code. Integration therefore requires an independent security review and a fresh exact target SHA/floor assessment; the old floor authorization does not cover it automatically. There has been no PR creation, merge, workflow dispatch, production file mutation, service switch, migration or Chanjet operation from this worktree.

A Web-only production release remains a separately authorized phase after the API-only HOLD release succeeds. An incomplete new v3 deployment remains HOLD with its transaction/evidence preserved. Frozen v2 incident-specific recovery procedures remain unchanged; they are not general authorization to recover a new v3 failure.

## Test isolation incident and remediation

During the first real first-sync contract attempt, I failed to provide an explicit owned Docker fixture container to the existing test. Its automatic resolver did not discover the task container and fell back to an unrelated local container, `kingturf-business-os-postgres-1` (`f01c557639a734dac70410324fb2d23c648158d6ef7a411668708df00d040c1c`). This was an avoidable execution error.

One direct controlled `UPDATE chanjet_execution_admissions` was attempted there inside `BEGIN`/timeout settings/a CTE. PostgreSQL rejected it with `relation does not exist`; `ON_ERROR_STOP=1` stopped before COMMIT and connection termination rolled back the failed transaction. The exact numeric subprocess exit was not retained, so it is recorded as nonzero rather than inventing a value. Fourteen subsequent chain configs referenced that wrong target; the nine observed DB subprocesses were READ ONLY and failed connection authentication (`postgres` role absent) before SQL execution. Their traces contain zero read-write DB subprocesses. No successful write on the wrong target is evidenced. No additional business-data reads were performed to investigate that target.

The rejected run was **22 PASS / 10 FAIL**, and is preserved in `first-sync-attempt1-isolation-failure.log` and `fixture-isolation-incident.json`; later passing tests do not replace this record. The automatic discovery/fallback has been removed. Before any fixture database setup, the suite now requires an explicit container and owner, a matching exclusive owner label, loopback port mapping, disposable DB/user match and a running container. A safe inspect projection returns only metadata/boolean matches. Missing inputs cause zero commands; mismatched ownership/DB/port causes zero exec/SQL. Subsequent operations bind the immutable container ID. CI supplies its labelled service ID explicitly.

A new, owned PG18 fixture passed that admission and the real protected-entry contract suite. Its exact identity and the two task containers, temporary dependency links and generated build outputs are recorded in `resource-manifest.json` for root-agent cleanup. No additional manual cleanup was performed after the root agent requested preservation. The original root `dist` target was never modified; only a newly created task symlink was replaced before compiling independently in this worktree.

## Real ERP Next/Web isolated rehearsal

The original Turbopack build first rejected an external dependency symlink. A fresh build capsule under this worktree's artifacts was created from the actual base Web source and frozen lockfile; pnpm reused 567 cached dependencies with zero downloads. A clean environment then could not reach Google Inter; forwarding only the existing configured network proxy restored the normal verified HTTPS font fetch. No font mocks, TLS bypass, production environment files or production database credentials were used. Both failed build logs remain archived.

The unchanged real ERP Web source built with Node 20.20.2 / Next 16.2.6 using the original production Turbopack command, passed its TypeScript phase and generated 237 static pages. The actual standalone/static/public outputs were packaged in a dedicated local `erp-web-evidence` image, using the exact base revision label and recorded immutable image identity. `real-web-build-provenance.json` binds the Web Git tree, lockfile, protocol diff and runtime image. This fixture is not a production image or production release receipt.

The opt-in test `scripts/ci/web-deployment-evidence.e2e.test.mjs` ran without skips and passed. It created only explicitly owned containers through a local Unix Docker socket with an empty task Docker config; every published port was bound to loopback. ERP Web was the real standalone application. The API health peer and the Web container's loopback API rewrite targets were explicitly scoped mocks; no ERP business API or external provider was called.

Observed through the same v3 evidence verifier:

- Actual Next startup with the real `Ready in ...` marker and timestamped Docker stdout/stderr: PASS. The stderr transport marker is labelled fixture infrastructure, not a fabricated Next error or API schema marker; raw logs are not persisted.
- Web HTTP 200 and API peer readiness 200 with API/DB full identities unchanged: PASS.
- Real Next rewrite HTTP 503: rejected by startup/HTTP evidence validation.
- Actual OCI revision versus a wrong target: rejected.
- Same immutable ERP image recreated with a new container ID: rejected by live re-inspection.
- Controlled fixture process exit with automatic restart, `RestartCount` 0→1 and changed StartedAt: rejected.

The result is **1/1 real Docker E2E PASS, zero skips**, archived in `real-next-web-e2e.log` and the `web-evidence-e2e-3080c12d-4a95-4362-853c-b4bee255a7f0/` receipt directory. Containers and images remain preserved in the resource manifest for root-agent cleanup. No production operation, publish, PR, commit or push was executed. The first direct build stamped this worktree's tracked `apps/web/public/sw.js`; that generated file is explicitly excluded from source integration.

At the root agent's explicit direction, `scripts/ops/chanjet-readonly-production-chain.sh` was appended to `criticalFiles`. This reinforces the audit verifier staging contract and requires a fresh final floor target during integration.
