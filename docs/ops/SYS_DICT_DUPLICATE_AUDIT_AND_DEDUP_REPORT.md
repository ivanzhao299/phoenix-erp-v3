# Sys Dict Duplicate Audit and Dedup Report

Generated at: 2026-07-01T03:31:11.331Z

## Scope

- Target table: `sys_dict`
- Database: `phoenix_erp`
- DB user: `phoenix_v3`
- Mode: `apply`
- JSON evidence: `docs/ops/runs/sys-dict-dedupe-latest.json`

## Policy

1. Exact duplicates are defined as rows sharing the same `dict_type + dict_code`.
2. Exact duplicates are safe to dedupe because runtime selectors use `dict_type` and `dict_code`.
3. Display duplicates are defined as active rows sharing the same display label or value under one `dict_type`.
4. Display duplicates are reported but not deleted automatically, because different codes may intentionally share a label in legacy flows.

## Before

| Metric | Value |
| --- | ---: |
| total rows | 427 |
| dict types | 75 |
| exact duplicate groups | 0 |
| exact duplicate rows to remove | 0 |
| active label duplicate groups | 8 |
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
| total rows | 427 |
| dict types | 75 |
| exact duplicate groups | 0 |
| exact duplicate rows remaining | 0 |
| active label duplicate groups | 8 |
| active value duplicate groups | 0 |

## Exact Duplicate Groups

No exact duplicate groups found.

## Active Label Duplicate Groups for Manual Review

| dict_type | label | cnt | ids | codes |
| --- | --- | --- | --- | --- |
| BRD_HOUSE_TYPE | 育成舍 | 2 | 408, 547 | PULLET, GROWER |
| BRD_HOUSE_TYPE | 蛋鸡舍 | 2 | 14, 15 | LAYER, LAYING |
| BRD_VACCINATE_METHOD | 滴鼻点眼 | 2 | 208, 745 | BRD_VACCINATE_METHOD_1, EYE_NOSE |
| BRD_VACCINATE_METHOD | 皮下注射 | 2 | 210, 741 | BRD_VACCINATE_METHOD_3, INJECT_SC |
| BRD_VACCINATE_METHOD | 肌肉注射 | 2 | 211, 749 | BRD_VACCINATE_METHOD_4, INJECT_IM |
| BRD_VACCINATE_METHOD | 饮水 | 2 | 209, 780 | BRD_VACCINATE_METHOD_2, DRINK |
| BRD_VACCINE_TYPE | 传染性喉气管炎 | 2 | 218, 761 | BRD_VACCINE_TYPE_6, ILT |
| BRD_VACCINE_TYPE | 传染性支气管炎 | 2 | 214, 758 | BRD_VACCINE_TYPE_2, IB |

## Active Value Duplicate Groups for Manual Review

No active dict-value duplicate groups found.

## Conclusion

GO. Exact sys_dict duplicate rows are cleared or were already absent.

## Next Controls

1. Add or verify a DB unique index for `sys_dict(dict_type, dict_code)` in a dedicated migration gate if not already present.
2. Keep dictionary seed migrations idempotent with `ON CONFLICT` or `WHERE NOT EXISTS`.
3. Review label/value duplicates separately with business owners before changing codes.
