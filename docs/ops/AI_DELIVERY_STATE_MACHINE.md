# AI Delivery Factory State Machine

> Mode baseline: W5-RESUME-LIMITED / CI condition recovery. This operating model controls delivery from natural language intake to go/no-go decision. It does not authorize schema, migration, business logic, permission logic, Chanjet sync, production deploy, or direct merge to main during frozen phases.

## Global Guardrails

| Item | Rule |
| --- | --- |
| Default code change posture | Disabled until DESIGN exits with explicit scope and human approval when risk requires it. |
| Default migration posture | Disabled. Migration requires separate requirement, data review, rollback plan, and human approval. |
| Frozen items | Schema/entity/table/column, master data migration, procurement/sales/finance/POS critical business logic, permission business logic, Chanjet sync business logic, production deploy chain. |
| CI posture | CI must not be bypassed. Missing CI result means conditional pass at most. |
| Main branch posture | Direct merge to main is forbidden; PR and gate evidence are required. |

## State Table

| State | Input | Output | Responsible Agent | Entry Conditions | Exit Conditions | Forbidden Actions | Code Change | Migration | Human Confirmation |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| INTAKE | Natural language request, screenshots, incident notes, business owner context | Structured intake draft | Codex-Orchestrator | User request is received | Request is captured in `REQUEST_INTAKE_TEMPLATE` shape with known gaps listed | Implementing, editing schema, deploying, merging | No | No | Required if request is ambiguous or high impact |
| CLARIFY | Intake draft, repo context, open questions | Clarified requirement notes and decision log | Codex-Orchestrator | Intake has missing business/risk facts | Critical unknowns are resolved or explicitly marked as assumptions | Guessing financial/security/data semantics, starting build on unresolved risk | No | No | Required for permissions, finance, master data, third-party, migration, production impact |
| PLAN | Clarified requirement, existing docs, known constraints | Business plan and delivery scope | Codex-Orchestrator | Business goal and users are known | Scope, out-of-scope items, acceptance themes, and affected modules are listed | Expanding scope beyond user intent, touching frozen items without escalation | No, unless docs-only plan is requested | No | Required for medium/high risk scope |
| CLASSIFY | Business plan, impacted modules, data/security signals | Risk grade and gate matrix | Codex-Orchestrator with A2/A5 as needed | Affected modules and data classes are known | Risk grade, required Agents, CI gates, manual approvals, rollback need are assigned | Underclassifying auth, finance, master data, external interface, migration, production deploy | No | No | Required for high/critical risk |
| DESIGN | Requirement spec, risk grade, current architecture | Technical design and task contracts | Codex-Orchestrator, A3/A4/A5/A6 as needed | Requirement is classified | Design lists files, allowed changes, forbidden changes, tests, rollback, PR requirements | Designing schema changes during freeze, modifying core business without approval | Docs/design only by default; implementation only after dispatch approval | No by default | Required before BUILD when risk is medium or higher |
| DISPATCH | Technical design, Agent task contracts | Agent assignments and task board rows | Codex-Orchestrator | Design is approved or docs-only work is authorized | Every task has owner, branch, allowed scope, verification commands, blocker policy | Assigning overlapping ownership without contract, granting production access implicitly | No, except task board/docs | No | Required for high/critical risk and frozen-adjacent work |
| BUILD | Agent task contract, approved design | Implementation commit or docs change | Assigned build Agent | Task contract exists with allowed scope | Diff stays inside allowed scope and local verification evidence is captured | Touching frozen items, adding migration, bypassing CI, changing deployment chain, direct main merge | Yes, only within contract | Only if explicitly approved outside freeze | Required if contract says so or scope changes |
| VERIFY | Diff, acceptance criteria, CI results, smoke/e2e evidence | Verification report and pass/fail/conditional verdict | A1, A2, A4, A5, A7 | Build output exists | Required commands and manual checks are recorded with results and gaps | Marking PASS without evidence, hiding skipped checks, using production data unsafely | Fix-only changes allowed if routed back to BUILD | No unless separately approved | Required for skipped high-risk checks |
| RELEASE_CANDIDATE | Verified PR, release notes, rollback plan | Release candidate packet | Codex-Orchestrator, A6, A7 | Verification is PASS or PASS WITH CI CONDITIONS | RC includes commit, risk, gates, rollout, rollback, owners, open conditions | Deploying production automatically, ignoring failed checks | Docs/release notes only | No | Required |
| GO_NO_GO | RC packet, CI/CD status, staging evidence, owner approval | GO, GO WITH CONDITIONS, HOLD, or ROLLBACK decision | A7-Final-QA-Gate with Codex-Orchestrator | RC packet is complete | Decision is recorded with approver, conditions, timing, and rollback owner | Releasing on unresolved P0/P1, bypassing approval, direct main merge | No | No | Always required |

## Loopbacks

| From | To | Trigger |
| --- | --- | --- |
| CLARIFY | INTAKE | Original request materially changes. |
| CLASSIFY | CLARIFY | Risk cannot be assigned from available facts. |
| DESIGN | PLAN | Technical constraints change business scope. |
| VERIFY | BUILD | Fix is inside approved scope. |
| VERIFY | DESIGN | Fix requires architectural or scope change. |
| RELEASE_CANDIDATE | VERIFY | CI/staging evidence expires or new commit lands. |
| GO_NO_GO | RELEASE_CANDIDATE | Conditions are added but release remains possible. |
| GO_NO_GO | HOLD | Any frozen item, P0/P1, or missing mandatory approval blocks release. |

## Final Decision Vocabulary

| Verdict | Meaning |
| --- | --- |
| PASS | All required gates passed with evidence. |
| PASS WITH CI CONDITIONS | Local/docs gates passed; one or more CI gates are pending and must pass before merge/release. |
| HOLD | Delivery cannot proceed until blockers are resolved. |
| ROLLBACK | Release is unsafe or production health regressed; rollback plan must be executed. |
