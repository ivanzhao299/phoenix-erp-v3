# Chanjet Organization Master Closure Report

Date: 2026-08-06

Decision: `GO_WITH_CONDITIONS`

## Scope

This Gate closed only deterministic Chanjet `DEPARTMENT` identities against ERP
organization masters. It did not apply cash-account candidates, import finance or
inventory facts, or write back to Chanjet.

## Deployment

- Production revision: `440cca8f1e2878fd59cc8ca2b60ae09d181e8221`
- GitHub Actions run: `31065216212`
- Result: API typecheck, Web typecheck, regression, API image build and production
  API deployment all passed.
- Production readback: `/opt/phoenix-erp` at `440cca8f`; API health `OK`.

## Pre-apply Review

- Review hash: `f8c1bfbc11ad7d6befc05d5a333cbb17bcea1dbc7e2961de1e2c1af03a804fc4`
- Total candidates: 108
- Actionable candidates: 13
- Approved Gate scope: `DEPARTMENT` only
- Scoped actionable rows: 10
- Out-of-scope actionable cash accounts: 3
- HOLD rows: 95

The runner asserted the exact target-code set before applying. Any missing,
additional or renamed target would have stopped the transaction.

## Applied Organization Masters

Seven bounded ERP house masters were created from operational-document evidence:

| ERP house | Company | Site | Project | Type |
|---|---|---|---|---|
| `HOUSE_MS_01` | `COMP-LAO-AGRI` | `SITE-MENGSAI-LAYER` | `PRJ_MENGSAI_LAYER` | LAYER |
| `HOUSE_DP_01` | `COMP-LAO-XINGCHI` | `SITE-DONGPENG-LAYER` | `PRJ_DONGPENG_LAYER` | LAYER |
| `HOUSE_DP_02` | `COMP-LAO-XINGCHI` | `SITE-DONGPENG-LAYER` | `PRJ_DONGPENG_LAYER` | LAYER |
| `HOUSE_DP_03` | `COMP-LAO-XINGCHI` | `SITE-DONGPENG-LAYER` | `PRJ_DONGPENG_LAYER` | LAYER |
| `HOUSE_DP_04` | `COMP-LAO-XINGCHI` | `SITE-DONGPENG-LAYER` | `PRJ_DONGPENG_LAYER` | LAYER |
| `HOUSE_DP_05` | `COMP-LAO-XINGCHI` | `SITE-DONGPENG-LAYER` | `PRJ_DONGPENG_LAYER` | LAYER |
| `HOUSE_DP_06` | `COMP-LAO-XINGCHI` | `SITE-DONGPENG-LAYER` | `PRJ_DONGPENG_LAYER` | ROOSTER |

All seven rows are `ACTIVE`, with `capacity = 0` and `current_birds = 0`. No
flock, stock, accounting or other business fact was inferred from Chanjet.

Three workshop dimensions were mapped to the existing same-company production
department `DEPT-SITE-DONGPENG-LAYER-PROD`:

- 变蛋车间
- 烧鸡车间
- 蛋托车间

## Apply and Readback

- Apply timestamp: `2026-08-06T02:31:37.723772Z`
- Applied mapping types: `DEPARTMENT`
- Created: 7
- Mapped existing: 3
- Skipped: 0
- Mapping readback: 10/10 `MANUAL`, `APPROVED`, confidence 100
- House readback: 7/7 exact code, company, site and project
- Zero-fact readback: 7/7 capacity and current birds remain zero
- Chanjet write: no
- Finance balance import: no
- Inventory fact import: no

## Convergence

Post-apply review hash:
`e96b5e14d81b68703df51ac34761676605ca98ee49a3a93eb230685f42a067c3`.

The post-apply plan contains 98 rows: three separately gated cash-account
candidates and 95 HOLD rows. `DEPARTMENT` actionable rows are zero. The three
cash accounts (`孟赛备用金`, `万象直营店备用金`, `会晒备用金`) were not applied.

Remaining HOLD distribution:

- CASH_ACCOUNT: 2
- DEPARTMENT: 5
- PRODUCT: 50
- UOM: 22
- WAREHOUSE: 16

## Guardrails and Next Gate

Active direction remains `CHANJET_TO_ERP`; reverse write remains
`READY_BUT_LOCKED`. Fuzzy mapping, Chanjet writeback and finance/inventory fact
promotion remain disabled.

The next independent Gate is
`CHANJET_CASH_ACCOUNT_CONTROLLED_CREATION_REVIEW`. The five evidence-incomplete
department rows stay HOLD until deterministic ownership and business semantics
are available.
