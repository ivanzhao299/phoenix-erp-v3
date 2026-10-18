# Background capability consumers and protected file coverage

The exception filter now admits its asynchronous alert and notification work
through BackgroundTaskService, but its implementation was missing from the
production floor criticalFiles contract. An exact OCI revision still binds a
particular candidate image; it does not make an omitted file participate in
the floor contract comparison for later releases or recovery eligibility.

This change adds only apps/api/src/common/filters/all-exceptions.filter.ts to
criticalFiles. Existing protected files are retained. It does not modify an
installed production floor, promote a target, or authorize a release.

The security workflow now runs a TypeScript AST coverage check after the
existing TypeScript dependency installation, with always() like the adjacent
checks. Every discovered direct import or typed consumption of the background
task capability must have a criticalFiles pin. Import aliases, namespaces,
method-before-constructor declarations and app.get handles are recognized.
Indirect aliases still require a pin even when a precise method count cannot
be recovered. Ordinary unrelated run methods do not create capability findings.
This adds a check; it does not alter approval labels, ALLOW values, rule
severity, allowlists or existing security decisions.

The existing IoT legacy header is deliberately excluded from decoding and
output. The loader advances over its first 24 line boundaries without
interpreting the bytes, then parses the class body with preserved line numbers.
The known IoT producer is unconditionally a capability consumer, including
untyped injection and indirect aliases. Scan results contain paths, method
names, line numbers and fixed states, not source bodies or environment values.
Parse, dependency or contract uncertainty fails closed with a fixed error.

Local Node 20 verification: 10 tests PASS. A counter-check on the actual source
with only the exception-filter pin removed fails on that file. The unchanged
repository scan before the added pin found 22 direct capability consumers and
19 files with recognized run/spawn/runScheduled calls, with only the filter
missing. After the pin, all 22 are covered. Tests additionally cover new
unpinned producers, method order, namespace/function parameters, DI handles,
indirect calls, the IoT untyped alias, unrelated methods, fixture naming,
malformed source and duplicate pins. Independent read-only review found and
closed the IoT alias omission; the final review found no new P0/P1.

Scope is explicitly limited to direct capability consumers in API source after
exclusion of spec/test/fixture/declaration filenames. Naming exclusion is not
a proof those files are unreachable from a production build. This is not a
transitive production dependency closure, a runtime producer registry, an
in-flight count, or evidence that the 17-producer release factory is installed.
The three additional capability consumers beyond the 19 direct producer files
are shutdown/module/status wiring. The release orchestrator's 17 producers are
a separate set. Future closure and live runtime evidence remain required.

No production command, database operation, deployment, floor state write or
Chanjet activity was performed. Production release admission remains HOLD;
source CI and exact-HEAD delegated COMMENT review are recorded separately.
