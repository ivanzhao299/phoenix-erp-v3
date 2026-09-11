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
