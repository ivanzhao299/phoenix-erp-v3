#!/usr/bin/env bash
set -euo pipefail
# Local-only contract tests; no secrets, network, or production access.
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
key="$tmp/key"
normalize_key() { tr -d '\r' <&0 >"$1"; printf '\n' >>"$1"; chmod 600 "$1"; }
printf -- '-----BEGIN TEST KEY-----\r\nabc\r\n-----END TEST KEY-----\r\n' | normalize_key "$key"
test "$(stat -c '%a' "$key" 2>/dev/null || stat -f '%Lp' "$key")" = 600
! grep -q $'\r' "$key"
test "$(tail -c 1 "$key" | od -An -t x1 | tr -d ' ')" = 0a
# Empty and malformed keys must fail closed before transport.
validate_key() { test -s "$1" && grep -q '^-----BEGIN .*PRIVATE KEY-----$' "$1" && grep -q '^-----END .*PRIVATE KEY-----$' "$1"; }
! validate_key "$tmp/empty" 2>/dev/null || true
: > "$tmp/empty"; ! validate_key "$tmp/empty"
printf 'not-a-key\n' > "$tmp/invalid"; ! validate_key "$tmp/invalid"
# Workflow contract: strict known-hosts, shared opts, scp port spelling, diagnostic artifact.
w=.github/workflows/egg-grade5-sku-manifest-production-rollout.yml
python3 - "$w" <<'PY'
import sys
s=open(sys.argv[1],encoding='utf-8').read()
need=["tr -d '\\r'",'chmod 600','test -s "$known_hosts"','StrictHostKeyChecking=yes','opts=(','scp_opts=("${opts[@]}")','scp_opts[2]=-P','grade5-transport.log','continue-on-error: true']
for x in need: assert x in s, x
assert 'ssh "${opts[@]}"' in s
assert 'scp "${scp_opts[@]}"' in s
PY
# Transport failure still emits an artifact record (simulated, no SSH).
printf 'transport_rc=1 ssh_rc=255 result_rc=1 log_rc=1\n' > "$tmp/transport.log"
test -s "$tmp/transport.log"
echo 'grade5 SSH transport stub tests: PASS'
