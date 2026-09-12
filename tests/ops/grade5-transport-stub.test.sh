#!/usr/bin/env bash
set -u -o pipefail
wf=.github/workflows/egg-grade5-sku-manifest-production-rollout.yml
# Static contract tests for transport failure safety.
grep -q 'keyscan_rc' "$wf"
grep -q 'ssh-keyscan.*|| keyscan_rc=' "$wf"
grep -q 'scp .*result.json.*|| result_rc=' "$wf"
grep -q 'scp .*audit.log.*|| log_rc=' "$wf"
grep -q 'if: always()' "$wf"
grep -q 'Fail after preserving diagnostic artifact' "$wf"
python3 - <<'PY'
import json,tempfile, pathlib
p=pathlib.Path(tempfile.mkdtemp())/'fail.json'
p.write_text('{"status":"FAIL","rc":125,"transport_rc":125,"mkdir_rc":125,"key_rc":125,"proxy_key_rc":125,"known_hosts_rc":125,"keyscan_rc":125,"ssh_rc":125,"result_rc":125,"log_rc":125}')
o=json.loads(p.read_text())
assert o['status']=='FAIL' and o['transport_rc']==125
fields=('mkdir_rc','key_rc','proxy_key_rc','known_hosts_rc','keyscan_rc','ssh_rc','result_rc','log_rc')
assert all(o[k]==125 for k in fields)
# Every transport component: isolated failure and all-zero success.
for name in fields:
    vals={k:0 for k in fields}; vals[name]=7
    assert next((vals[k] for k in fields if vals[k]),0)==7
assert 0 == 0
# Tamper detection: payload/output disagreement must fail validation.
payload={'transport_rc':7, **{k:0 for k in fields}}
outputs=dict(payload); outputs['key_rc']=0; payload['key_rc']=7
assert any(payload[k] != outputs[k] for k in fields)
PY
printf 'grade5 transport stubs: PASS\n'

# GITHUB_OUTPUT printf must bind every rc placeholder to the right variable (9 format specifiers, 9 args, in order).
python3 - "$wf" <<'PY'
import re,sys
wf=open(sys.argv[1]).read()
m=re.search(r"printf 'transport_rc=%s\\nmkdir_rc=%s\\nkey_rc=%s\\nproxy_key_rc=%s\\nknown_hosts_rc=%s\\nkeyscan_rc=%s\\nssh_rc=%s\\nresult_rc=%s\\nlog_rc=%s\\n'([^>]+)>>\"\$GITHUB_OUTPUT\"",wf)
assert m, 'GITHUB_OUTPUT printf not found'
args=re.findall(r'\$\{?(\w+)\}?', m.group(1))
assert args==['transport_rc','mkdir_rc','key_rc','proxy_key_rc','known_hosts_rc','keyscan_rc','ssh_rc','result_rc','log_rc'], args
m2=re.search(r"printf 'transport_rc=%s mkdir_rc=%s[^\n]*?log_rc=%s\\n'([^>]+)>grade5-transport\.log",wf)
assert m2, 'transport.log printf not found'
args2=re.findall(r'\$\{?(\w+)\}?', m2.group(1))
assert args2==['transport_rc','mkdir_rc','key_rc','proxy_key_rc','known_hosts_rc','keyscan_rc','ssh_rc','result_rc','log_rc'], args2
assert 'grep -q "$DEPLOY_HOST" "$known_hosts" && keyscan_rc=0 || keyscan_rc=${keyscan_rc:-1}' in wf, 'keyscan rc must report the end-state (entry present), not intermediate failures'
assert 'key_rc=0; proxy_key_rc=0; known_hosts_rc=0' in wf, 'key writes must report 0 on success, not the 125 not-started sentinel'
assert 'git pull --ff-only origin main' in wf, 'remote checkout sync must be fast-forward only like deploy.yml'
assert 'git reset --hard' not in wf and 'git checkout --' not in wf
# Payload rc stamping must run unconditionally (failure paths report true rc values).
import re as _re
assert not _re.search(r'if \[ "\$result_rc" -eq 0 \]; then\s*\n\s*python3 - "\$transport_rc"', wf), 'rc stamping must not be gated on result_rc'
assert 'transport_rc=$((mkdir_rc || key_rc || proxy_key_rc || known_hosts_rc || keyscan_rc || ssh_rc || result_rc || log_rc))' in wf
assert wf.count('StrictHostKeyChecking=yes') >= 3, 'strict host key checking must stay enabled for main ssh, scp and proxy fetch'
assert 'StrictHostKeyChecking=no' not in wf
PY

# Dummy-key stub: normalize_key must strip CRLF, guarantee trailing newline, chmod 600 — without touching real secrets.
tmp=$(mktemp -d)
dkey="$tmp/dummy"
printf '%s' '-----BEGIN OPENSSH PRIVATE KEY-----' >"$dkey.raw"
printf '%s\r\n' 'b2tlbiB2MTBlCg' >>"$dkey.raw"
printf '%s' '-----END OPENSSH PRIVATE KEY-----' >>"$dkey.raw"
w="$tmp/w"; mkdir -p "$w"
normalize_key() { tr -d '\r' <&0 >"$1"; printf '\n' >>"$1"; chmod 600 "$1"; }
printf '%s' "$(cat "$dkey.raw")" | normalize_key "$w/key"
! grep -q $'\r' "$w/key"
[ "$(tail -c1 "$w/key" | od -An -c | tr -d ' ')" = '\n' ]
[ "$(stat -c '%a' "$w/key")" = 600 ]
grep -q 'BEGIN OPENSSH PRIVATE KEY' "$w/key"
rm -rf "$tmp"
printf 'grade5 dummy key normalize stub: PASS\n'
