# Maintenance formal completion boot identity

The API generates its background control identity with `randomUUID()`. Candidate
registration, the private lease and public participant records bind that same
lowercase UUIDv4. Formal completion previously required a 64-character SHA256
shape for `candidate.bootId`; its synthetic success fixture used that wrong
shape too. A real candidate could not complete this gate.

The completion gate now requires the existing lowercase UUIDv4 contract. API
pins, target, owner, exact lease identity, exclusive locks, denied admission,
zero work, current PostgreSQL session and ingress checks remain mandatory.
The change does not install a producer factory or authorize production work.

## Verification

Changing the owned fixture to a real UUID before the fix produced 35 PASS /
3 FAIL, including rejection of the valid identity and acceptance of the obsolete
64hex form. After the fix, the state-core suite is 38 PASS. Six negative
cases cover the obsolete hash, wrong UUID version/variant, uppercase, empty
identity and a different valid lease identity. Every refusal asserts no writes,
no SUCCESS and retention of all four transaction/current markers.

The complete local maintenance protocol suite is 295 PASS / 12 SKIP across
20 files on Node 20. Skipped Docker/PostgreSQL probes were NOT_RUN locally;
they must execute in the existing hosted fixture workflow on the PR revision.
Independent read-only review confirmed the real API contract and retained gates.

Production environment protection configuration remains blocked by the current
GitHub connection privileges; its attempted update returned 404 and protection
remained absent. The exact cause of that HTTP response is unverified. No
workflow dispatch, production state change, API/Web switch, migration, floor
promotion or Chanjet operation was performed for this fix. Host ownership and
the complete reviewed producer factory remain separate release blockers.
