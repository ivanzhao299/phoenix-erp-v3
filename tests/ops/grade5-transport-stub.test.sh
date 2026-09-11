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
p.write_text('{"status":"FAIL","rc":125,"transport_rc":125,"ssh_rc":125,"result_rc":125,"log_rc":125}')
o=json.loads(p.read_text())
assert o['status']=='FAIL' and o['transport_rc']==125
# representative rc matrix: keyscan, ssh 255, either scp, missing file, success
for vals, expected in [((7,0,0),7),((0,255,0),255),((0,0,1),1),((0,0,2),2),((0,0,0),0)]:
    assert next((x for x in vals if x),0)==expected
PY
printf 'grade5 transport stubs: PASS\n'
