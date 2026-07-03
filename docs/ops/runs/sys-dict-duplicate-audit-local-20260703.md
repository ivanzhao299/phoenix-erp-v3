# sys_dict Duplicate Audit

- As of: 2026-07-03T11:02:04.273891+08:00
- Active entries: 240
- Dict types: 47
- Duplicate code groups: 0
- Duplicate label groups: 2

## High Risk Types

| dict_type | total | active |
|---|---:|---:|
| PKG_EGG_GRADE | 7 | 0 |

## Top Duplicate Codes

| dict_type | dict_code | count | keep_id | all_ids |
|---|---|---:|---:|---|

## Top Duplicate Labels

| dict_type | label | count | keep_id | all_ids |
|---|---|---:|---:|---|
| BRD_HOUSE_TYPE | 育成舍 | 2 | 74 | {74,124} |
| BRD_HOUSE_TYPE | 蛋鸡舍 | 2 | 14 | {14,15} |

## Recommended Cleanup Rule

Keep the canonical ACTIVE row per `(dict_type, dict_code)` after business review; mark non-canonical rows as `ARCHIVED` instead of deleting them. Add a partial unique index on ACTIVE `(dict_type, dict_code)` only after cleanup reaches zero duplicate groups.
