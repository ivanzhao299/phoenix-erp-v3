# Candidate readiness and startup observation

This is source engineering, not a production admission producer. No deploy,
state mutation, SUCCESS, OPEN, floor change or root acquisition/release occurs.
The production registry remains uninstalled/default-deny.

The collector runs only inside the original strict ADOPTED CF/VERIFY binding,
with that genuine original root handle, exact private state and replacement.
It requests fixed localhost API `/api/readiness` and Web `/` endpoints inside
the exact bound containers. It accepts API200 only with actual READY/connected
JSON, bounds the streamed body and retains its hash/size only. Web never follows
a redirect, accepts only200 or same-origin307/308, and discards body/headers.
The fixed read helper uses env -i and the image's absolute Node path so NODE_OPTIONS/proxy injection cannot replace the fetch result. No API process environment is changed. No caller URL, script, readiness flag or approval boolean is read.

It reuses the strict v3/API formal PRE/POST comparisons and original startup
stdout/stderr classifiers. The PRE is read only from the fixed owner file and
pinned around the read set. Logs cover the actual candidate's start through the
captured cutoff; raw streams are never returned. Schema/startup error signals
HOLD. The original strict candidate/root binding is collected again, followed
by formal native live re-inspection of API/Web/DB. This catches replacement or
restart during log capture, not merely changes visible at the first POST.

One wall/monotonic budget wraps every read and result acceptance. Existing OS
synchronous Docker reads still require the outer registered process supervisor;
this collector cannot replace that ledger or prove daemon-wide task drain.
It returns OBSERVATION_ONLY, continuousIngressProof=false, registryInstalled=false
and admissionOrApprovalGranted=false. The compiled factory must independently
verify these observations and all other release prerequisites before it may
write formal evidence; these functions do not sign approval or manufacture it.

Unit fixtures use synthetic Docker/catalog/logs/fetch, an owned Node root
responder and one actual private receipt-chain refusal. They prove formatter,
parser, race and denial behavior; they do not prove a full real collector
positive with HTTP/PG/Compose/storage/FD9. That full positive remains NOT_RUN.
The shared real ERP capsule additionally runs the fixed API readiness program
on PG16/18 and archives its exact source/container/fingerprint proof. That
single-program integration remains distinct from the whole collector and Web
HTTP verification. Its results must be executed and archived on the new HEAD.

Initial local unit run was2 PASS/18 FAIL because fixture object spread copied
a live `closed` getter into a stale boolean and cleanup assertions hid intended
results. The fixture now retains the getter. Independent review identified a
late Web/DB observation P2; final native re-inspection and both log-stage drift
counterexamples were added. No production policy was relaxed to pass tests.

The floor contract adds this helper as a protected path. Source/restore closure,
real producer installation, actual host/ingress ownership, production authority,
fresh final-target admission and the human maintenance window remain separate.
