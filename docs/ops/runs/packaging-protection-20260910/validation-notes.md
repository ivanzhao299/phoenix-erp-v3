# Validation notes

All validation used NODE_ENV=test. The full API Jest suite must run from apps/api: one invocation from the repository root failed eight filesystem contract tests with ENOENT because they use process.cwd()/src. No test was loosened for this; rerun from apps/api is recorded in api-full.log.

The original production schema log contains GitHub-masked numeric metadata (bare ***), which is not valid JSON. Initial local fixture extraction skipped those rows and omitted five columns. The local PostgreSQL fixture was corrected from the same log with masked metadata preserved as __MASKED__; no production column was inferred absent, and no corrective production DDL was added for this fixture issue.

PostgreSQL concurrency tests run against a dedicated localhost PostgreSQL 18 container, creating isolated schemas from the actual public table shape. Test fixture writes are local only. In CI the same suite clones schema after the entire baseline/TS migration chain. No production POST, seed, VOID, or business cleanup was executed.

API full-suite conditional skips include seven PostgreSQL tests run separately here (12 total cases including five permission tests), plus six pre-existing conditional tests. Skips are not presented as execution passes.
