#!/usr/bin/env bash
set -Eeuo pipefail

pnpm --filter phoenix-erp-v3-nest build >/dev/null
node scripts/ci/run-phase1-schema-remediation-fixture.mjs
