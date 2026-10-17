# Issue #401 — disabled organization authorization closure

The previously frozen head `a14346efab82175429cc2f191fd44fdb8db4f976` is technically BLOCKED under the current admission requirement. An owned PostgreSQL/HTTP counterexample first read a global GROUP binding, disabled that organization, then reused the same token without invalidation: the daily endpoint still returned both companies. The previous report's acceptance of this as a residual governance question is superseded. The original approval application is invalid for the new fix head.

## Design and necessary scope

Organization-derived authorization is now recalculated for every request. Only independent role-rule GROUP contexts can be reused, and only after re-reading current enabled role rules. This deliberately avoids depending on token permission versions, organization mutation paths, a particular API instance or cache expiry; versionless tokens and direct fixture SQL changes cannot retain organization-derived global scope.

The organization JOIN now selects only nodes reachable from an ACTIVE root through ACTIVE parents. Disabled nodes and their descendants, NULL statuses, orphan paths and cycles do not grant access. Explicit GROUP binding requires such a valid ACTIVE path. Missing service identity is rejected before ROLE_ADMIN evaluation. The warehouse-recipient projection uses the same active-path semantics so candidate and confirmation scopes agree. The BU grandchild projection also requires its intermediate parent ACTIVE.

Independent ROLE_ADMIN and enabled role-rule GROUP permissions remain independent of organization status. Explicit extra farm/project/warehouse grants remain separate authorities. No user/role table, JWT/authentication logic, migration, production config, Chanjet code or floor is changed. This is an authorization-read correction in DataScopeService; the existing HTTP authentication and menu guards still apply. It does not claim to rewrite all legacy internal Generic CRUD fallback behavior.

## Tests

Owned PG18 tests validate same-token global warm read → disable → empty daily/non-daily CRUD/recipient results without invalidate; inactive GROUP plus ACTIVE COMPANY remains company-only; independent role GROUP and admin remain global; disabling the role rule rejects cached role-global; ACTIVE children under an inactive ancestor are denied and recover on re-enable; orphan and self-cycle paths fail closed. Existing department/SITE/company/extra-farm, date/filter, save/inbound/replay and cross-company cases remain.

The targeted three-suite matrix passed30 tests, including15 real HTTP/PG cases. API typecheck passed. Final full regression, exact head technical review and GitHub CI are recorded in the admission evidence bundle rather than inherited from the old SHA.

## Cost and approvals

Ordinary organization-derived requests now perform fresh role/scope reads and an ACTIVE-tree recursive query rather than reusing a120-second authorization cache. This increases database reads; production latency/load benchmarking is NOT_RUN and needs consideration before a separately authorized release. No production access was used to benchmark.

Formal frozen-boundary/security-sensitive approval and GitHub Review for the new exact head remain PENDING. Technical-agent conclusions are not formal human approval. Keep Draft/HOLD and do not add governance labels or inject ALLOW_* values. Future release/floor transition remains independently authorized; no main merge or production action is part of this change.
