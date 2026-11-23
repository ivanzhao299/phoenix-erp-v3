"""Rehearse a committed API pair using only a new, disposable PostgreSQL 18 container."""
import argparse
from collections import Counter
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import subprocess
import sys
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = "apps/api/src/database/migrations"
ARCHIVE_PATHS = ["apps/api", "scripts/db-migrate.sh", "scripts/bridge-schema-migrations-to-typeorm.sh"]


def run(args, *, cwd=ROOT, env=None, stdin=None):
    result = subprocess.run(args, cwd=cwd, env=env, input=stdin, text=True,
                            capture_output=True)
    if result.returncode:
        # Logs contain synthetic data only. Never echo the command's environment.
        raise RuntimeError(f"{args[0]} exited {result.returncode}\n{result.stdout[-2000:]}\n{result.stderr[-2000:]}")
    return result.stdout.strip()


def git(*args):
    return run(["git", *args])


def revision(ref):
    return git("rev-parse", "--verify", "--end-of-options", ref + "^{commit}")


def compile_revision(ref, tree, env):
    tree.mkdir()
    with tempfile.TemporaryFile() as archive:
        subprocess.run(["git", "archive", ref, *ARCHIVE_PATHS], cwd=ROOT, stdout=archive, check=True)
        archive.seek(0)
        subprocess.run(["tar", "-xf", "-"], cwd=tree, stdin=archive, check=True)
    api = tree / "apps/api"
    (api / "node_modules").symlink_to((ROOT / "apps/api/node_modules").resolve(), target_is_directory=True)
    (tree / "node_modules").symlink_to((ROOT / "node_modules").resolve(), target_is_directory=True)
    run(["./node_modules/.bin/tsc", "-p", "tsconfig.build.json", "--incremental", "false"], cwd=api, env=env)
    return api


def compare_cold_inventory(rows, frozen, expected_ts, database):
    bridges = []
    typeorm = []
    frozen_names = set(frozen)
    for row in rows:
        _, timestamp, name = row.split("|", 2)
        if name in frozen_names:
            bridges.append(name)
        else:
            typeorm.append((int(timestamp), name))

    for category, actual, expected in (("frozen SQL bridge", bridges, frozen), ("TypeORM", typeorm, expected_ts)):
        missing = Counter(expected) - Counter(actual)
        extra = Counter(actual) - Counter(expected)
        if missing or extra:
            raise ValueError(f"{database}: {category} inventory mismatch. Missing {dict(missing)}; extra {dict(extra)}")
    # Frozen bridge IDs and wall-clock timestamps are installation-local. Native TypeORM installs in timestamp order.
    if typeorm != expected_ts:
        i = next(i for i, (actual, expected) in enumerate(zip(typeorm, expected_ts)) if actual != expected)
        raise ValueError(f"{database}: TypeORM order at {i}: {typeorm[i]}, expected {expected_ts[i]}")


def rehearsal(base, candidate, scratch):
    git("merge-base", "--is-ancestor", base, candidate)
    for ref in (base, candidate):
        for filename in ("pnpm-lock.yaml", "apps/api/package.json"):
            if git("rev-parse", f"{ref}:{filename}") != git("hash-object", filename):
                raise ValueError(f"Local dependency inputs do not match {ref}:{filename}. Install matching dependencies first.")
    extensions = []
    for entry in git("diff", "--name-status", "--no-renames", base, candidate, "--", MIGRATIONS).splitlines():
        kind, filename = entry.split("\t")
        if not filename.endswith(".ts"):
            continue
        match = re.fullmatch(r"(\d{13})-([A-Za-z][A-Za-z0-9]*)\.ts", Path(filename).name)
        if kind != "A" or not match:
            raise ValueError(f"Expected append-only TypeORM extension, found {entry}")
        ts, name = match.groups()
        extensions.append({"timestamp": ts, "name": name + ts, "path": filename, "blob": git("rev-parse", f"{candidate}:{filename}")})
    # Only pass necessary local tooling settings. Never inherit database, JWT or external service settings.
    env = {k: os.environ[k] for k in ("HOME", "PATH", "LANG", "XDG_RUNTIME_DIR") if k in os.environ}
    env.update(DOCKER_HOST="unix:///var/run/docker.sock", NODE_ENV="test", DB_HOST="127.0.0.1", DB_PASSWORD=secrets.token_hex(24), DB_USER="postgres")
    released = compile_revision(base, scratch / "released", env)
    target = compile_revision(candidate, scratch / "candidate", env)
    cidfile = scratch / "postgres.cid"
    run(["docker", "run", "-d", "--rm", "--cidfile", str(cidfile), "-p", "127.0.0.1::5432",
                     "-e", "POSTGRES_PASSWORD", "postgres:18-alpine"], env={**env, "POSTGRES_PASSWORD": env["DB_PASSWORD"]})
    container = cidfile.read_text().strip()
    if not re.fullmatch(r"[0-9a-f]{64}", container):
        raise RuntimeError("Docker did not record the owned fixture container ID")
    try:
        endpoint = run(["docker", "port", container, "5432/tcp"], env=env)
        if not re.fullmatch(r"127\.0\.0\.1:\d+", endpoint):
            raise ValueError("Expected isolated IPv4 loopback fixture")
        env.update(DB_PORT=endpoint.split(":")[1], FIXTURE_CONTAINER=container)
        for _ in range(120):
            if subprocess.run(["docker", "exec", container, "pg_isready", "-h", "127.0.0.1", "-U", "postgres"],
                              env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL).returncode == 0:
                break
            time.sleep(.25)
        else:
            raise TimeoutError("PostgreSQL fixture did not start")
        for database in ("release_upgrade", "release_cold"):
            run(["docker", "exec", container, "createdb", "-U", "postgres", database], env=env)
        # Feed files from the archived revision to psql in this container, with ON_ERROR_STOP unchanged.
        shim = scratch / "psql"
        shim.write_text("""#!/usr/bin/env bash
set -euo pipefail
args=()
while [[ $# -gt 0 ]]; do
  if [[ $1 == -f ]]; then
    exec < "$2"
    shift 2
  else
    args+=("$1")
    shift
  fi
done
exec docker exec -i "$FIXTURE_CONTAINER" psql -X -U postgres -d "$DB_NAME" "${args[@]}"
""")
        shim.chmod(0o700)
        env["PATH"] = str(scratch) + os.pathsep + env["PATH"]

        def sql(database, statement):
            return run([str(shim), "-Atq", "-v", "ON_ERROR_STOP=1"], env={**env, "DB_NAME": database}, stdin=statement)

        def cold(api, database):
            run(["bash", "../../scripts/db-migrate.sh"], cwd=api, env={**env, "MIG_MODE": "ci", "MIG_DIR": ".", "DB_NAME": database})

        role_password = secrets.token_hex(24)
        sql("release_upgrade", f"CREATE ROLE release_api LOGIN NOSUPERUSER NOCREATEROLE NOCREATEDB NOINHERIT PASSWORD '{role_password}';")
        reader_env = {**env, "DB_USER": "release_api", "DB_PASSWORD": role_password}

        def install_previous_reader(database):
            # Scope the legacy API fixture to the objects used by these reads.
            # No future-object grants, ownership transfer or privileged executor membership.
            sql(database, """GRANT SELECT ON sys_menu, production_inbound_documents,
                production_cutover_scopes, production_inbound_allocations, production_batch_qualifications,
                inv_batches, inv_ledger TO release_api;""")

        def ledger(database):
            return sql(database, "SELECT id || '|' || timestamp || '|' || name FROM migrations ORDER BY id;").splitlines()

        def facts(database, api):
            output = run(["node", str(ROOT / "scripts/test/production-remediation-read-compat.cjs"), str(api)],
                         cwd=api, env={**reader_env, "DB_NAME": database})
            return json.loads(output.splitlines()[-1])

        print("Installing released schema in disposable PG18", flush=True)
        cold(released, "release_upgrade")
        install_previous_reader("release_upgrade")
        before = ledger("release_upgrade")
        sql("release_upgrade", (ROOT / "scripts/test/production-remediation-history-fixture.sql").read_text())
        original = facts("release_upgrade", released)
        print("Applying candidate migrations with inventory triggers enabled", flush=True)
        unit_env = {**env, "DB_NAME": "release_upgrade"}
        command = ["./node_modules/.bin/typeorm", "-d", "dist/database/data-source.js", "migration:run"]
        run(command, cwd=target, env=unit_env)
        after = ledger("release_upgrade")
        if after[:len(before)] != before:
            raise ValueError("Existing migration ledger changed")
        observed = [row.split("|", 1)[1] for row in after[len(before):]]
        if observed != [unit["timestamp"] + "|" + unit["name"] for unit in extensions]:
            raise ValueError(f"Unexpected migration execution: {observed}")
        run(command, cwd=target, env=unit_env)
        if ledger("release_upgrade") != after:
            raise ValueError("Running pending migrations again changed the ledger")
        acl_report = None
        installed = sql("release_upgrade", """SELECT count(*) FROM pg_class WHERE oid IN
            (to_regclass('public.production_inbound_reissues'), to_regclass('public.production_finance_review_files'),
             to_regclass('public.production_cutover_state_receipts'), to_regclass('public.production_cutover_state_origins'));""")
        if installed != "0":
            if installed != "4":
                raise ValueError("Incomplete remediation table/view set")
            probe = (ROOT / "scripts/ops/readonly-audits/production-remediation-runtime-acl.sql").read_text()
            acl_report = json.loads(run(["docker", "exec", "-i", container, "psql", "-XAtq", "-U", "release_api",
                                          "-d", "release_upgrade", "-v", "ON_ERROR_STOP=1"],
                                         env=env, stdin="BEGIN READ ONLY;\n" + probe + "\nROLLBACK;"))
            if not acl_report["currentIsSessionUser"] or acl_report["elevated"] or "WRITABLE" in acl_report["controlTables"].values():
                raise ValueError("Fixture API identity or protected-table boundary changed")
            sql("release_upgrade", (ROOT / "scripts/test/production-remediation-acl-fixture.sql").read_text())
        receipts = int(run(["node", str(ROOT / "scripts/test/production-remediation-historical-receipts.mjs"), candidate],
                           env=env, stdin=json.dumps(after)))
        for api in (released, target):
            if facts("release_upgrade", api) != original:
                raise ValueError("Upgraded schema changed original receipt, scope, or source data")
        print("Installing candidate cold and comparing ledger and API reads", flush=True)
        cold(target, "release_cold")
        install_previous_reader("release_cold")
        frozen = sorted(file.stem for file in (target / "migrations").glob("2026*.sql"))
        inventory_program = """
const ds = require('./dist/database/data-source.js').AppDataSource;
ds.setOptions({installExtensions:false});
(async () => {
  await ds.initialize();
  try {
    const entries = ds.migrations.map(m => {
      const name = m.name || m.constructor.name;
      return [Number(name.match(/(\\d{13})$/)[1]), name];
    });
    console.log(JSON.stringify(entries));
  } finally { await ds.destroy(); }
})().catch(err => { console.error(err.message); process.exitCode=1; });
"""
        compiled = run(["node", "-e", inventory_program], cwd=target, env={**reader_env, "DB_NAME":"release_cold"})
        expected_ts = sorted((stamp, name) for stamp, name in json.loads(compiled.splitlines()[-1]))
        for database in ("release_cold", "release_upgrade"):
            compare_cold_inventory(ledger(database), frozen, expected_ts, database)
        sql("release_cold", (ROOT / "scripts/test/production-remediation-history-fixture.sql").read_text())
        if facts("release_cold", target)["gradeTotals"] != original["gradeTotals"]:
            raise ValueError("Cold installation historical reads disagree")
        print(json.dumps({"released": base, "candidate": candidate, "extensions": extensions,
                          "releasedLedgerRows": len(before), "upgradedLedgerRows": len(after),
                          "upgradedLedgerSha256": hashlib.sha256("\n".join(after).encode()).hexdigest(),
                          "legacy": original, "replayAdded": 0, "coldMatches": True,
                          "aclBeforeFixtureGrants": acl_report, "historicalReceiptFixtures": receipts, "releasedApiAfterUpgrade": True, "apiRole": "non-owner"}, ensure_ascii=False))
    finally:
        failed = sys.exc_info()[0] is not None
        try:
            run(["docker", "stop", "--time", "1", container], env=env)
        except RuntimeError as cleanup_error:
            if not failed:
                raise
            print(f"Fixture cleanup also failed: {cleanup_error}", file=sys.stderr)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("released")
    parser.add_argument("candidate")
    args = parser.parse_args()
    with tempfile.TemporaryDirectory(prefix=".release-compat-", dir=ROOT) as directory:
        rehearsal(revision(args.released), revision(args.candidate), Path(directory))
