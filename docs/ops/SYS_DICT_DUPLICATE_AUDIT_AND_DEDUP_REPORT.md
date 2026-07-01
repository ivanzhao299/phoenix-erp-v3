# Sys Dict Duplicate Audit and Dedup Report

Generated at: 2026-07-01T09:35:45.762Z

## Scope

- Target table: `sys_dict`
- Database: `phoenix_erp`
- DB user: `mac`
- Mode: `dry-run`
- JSON evidence: `docs/ops/runs/sys-dict-dedupe-latest.json`

## Policy

1. Exact duplicates are defined as rows sharing the same `dict_type + dict_code`.
2. Exact duplicates are safe to dedupe because runtime selectors use `dict_type` and `dict_code`.
3. Display duplicates are defined as active rows sharing the same display label or value under one `dict_type`.
4. Display duplicates are reported but not deleted automatically, because different codes may intentionally share a label in legacy flows.

## Before

| Metric | Value |
| --- | ---: |
| total rows | 247 |
| dict types | 47 |
| exact duplicate groups | 0 |
| exact duplicate rows to remove | 0 |
| active label duplicate groups | 2 |
| active value duplicate groups | 0 |

## Dedup Execution

| Item | Result |
| --- | --- |
| deleted rows | 0 |
| backup table | not needed |
| destructive operation | no table drop, no truncate |
| business data changed | no, only sys_dict exact duplicate rows when present |

## After

| Metric | Value |
| --- | ---: |
| total rows | 247 |
| dict types | 47 |
| exact duplicate groups | 0 |
| exact duplicate rows remaining | 0 |
| active label duplicate groups | 2 |
| active value duplicate groups | 0 |
| unique index present | yes |

## Preventive Unique Index

PASS. `uq_sys_dict_type_code` exists.

```sql
CREATE UNIQUE INDEX uq_sys_dict_type_code ON public.sys_dict USING btree (dict_type, dict_code)
```

## Exact Duplicate Groups

No exact duplicate groups found.

## Active Label Duplicate Groups for Manual Review

| dict_type | label | cnt | ids | codes |
| --- | --- | --- | --- | --- |
| BRD_HOUSE_TYPE | 育成舍 | 2 | 74, 124 | PULLET, GROWER |
| BRD_HOUSE_TYPE | 蛋鸡舍 | 2 | 14, 15 | LAYER, LAYING |

## Active Value Duplicate Groups for Manual Review

No active dict-value duplicate groups found.

## Conclusion

GO. Exact sys_dict duplicate rows are cleared or were already absent, and the preventive unique index is present.

## Next Controls

1. Keep verifying the DB unique index for `sys_dict(dict_type, dict_code)` in this audit before closing dictionary dedupe tasks.
2. Keep dictionary seed migrations idempotent with `ON CONFLICT` or `WHERE NOT EXISTS`.
3. Review label/value duplicates separately with business owners before changing codes.
