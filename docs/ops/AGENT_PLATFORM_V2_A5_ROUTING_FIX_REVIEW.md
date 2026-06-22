# Agent Platform V2 A5 Routing Fix Review

## 1. Problem

The request below selected A2 and A1 but missed A5:

> 对 Store Payment 试点 readiness 做只读安全复核、CI 验证和数据准备检查；只允许 A2 安全审查、A1 CI 验证、A5 数据 readiness，不改业务代码，不执行 migration，不写数据库，不部署

Expected agents:

1. `A2-Security-Regression-Gate`
2. `A1-CI-Runtime-Gate`
3. `A5-Data-Readiness`

## 2. Root Cause

`agent-orchestrator.mjs` had a shortcut for requests matching A2/A1 wording. That branch returned A2/A1 immediately and skipped later data-readiness routing, even when the request explicitly mentioned A5 or data readiness.

## 3. Fix

The router now detects:

1. explicit A5 mentions;
2. data-readiness keywords;
3. readiness with data/master-data/store/company/account/role/organization context.

When an A2/A1 shortcut request also includes A5/data readiness context, the selected agents become A2 + A1 + A5.

## 4. A5 Trigger Keywords

中文: 数据准备, 数据检查, 数据 readiness, readiness, 主数据, 门店, 门店映射, 公司映射, 账户映射, 角色映射, 字典, 组织, 组织映射, 基础数据, 数据核查, 数据就绪, 试点 readiness, 试点准备.

English: data readiness, readiness, master data, store mapping, company mapping, account mapping, role mapping, organization mapping, data check, data validation, pilot readiness.

Explicit names: A5, A5 数据, A5-Data-Readiness, Data Readiness.

## 5. Validation

Validation commands:

1. `node --check scripts/ops/agent-orchestrator.mjs`
2. Chinese Store Payment readiness request dry-run.
3. English/mixed Store Payment pilot data readiness request dry-run.

Actual results:

1. `node --check scripts/ops/agent-orchestrator.mjs`: PASS.
2. Chinese request:
   - Request ID: `REQ-NL-20260622-213126-STORE-PAYMENT-READINESS-CI-A2-A1-CI-A5-READINESS`
   - Selected agents: `A2-Security-Regression-Gate`, `A1-CI-Runtime-Gate`, `A5-Data-Readiness`
   - Dispatch groups: `[A2-Security-Regression-Gate, A1-CI-Runtime-Gate, A5-Data-Readiness]`
   - Codex CLI executed: No
3. English/mixed request:
   - Request ID: `REQ-NL-20260622-213151-RUN-STORE-PAYMENT-PILOT-DATA-READINESS-CHECK-STO`
   - Selected agents: `A2-Security-Regression-Gate`, `A1-CI-Runtime-Gate`, `A5-Data-Readiness`
   - Dispatch groups: `[A2-Security-Regression-Gate, A1-CI-Runtime-Gate, A5-Data-Readiness]`
   - Codex CLI executed: No

Additional fix: English negation such as `do not run migration` is now treated as a migration-execution prohibition, not as a request to run migration.

## 6. Business Code Impact

No business code changed. No migration, DB write, deploy, push, or Codex CLI real execution is performed.
