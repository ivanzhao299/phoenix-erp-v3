# Production Server Remediation R3 - Store Payment Action-Bit Compatibility Plan

Date: 2026-06-24

## Conclusion

Current conclusion: ACTION-BIT COMPATIBILITY REQUIRES CONDITIONS BEFORE LIVE EXECUTION.

This plan documents the Store Payment permission bit mismatch found in the remote runtime. It does not modify code or database state.

## Current Runtime C/A Policy

Remote compiled Store Payment controller evidence shows:

| Operation | Runtime menu | Runtime bit |
| --- | --- | --- |
| Account list | `MENU_STORE_PAYMENT_ACCOUNT` | `V` |
| Account create/update | `MENU_STORE_PAYMENT_ACCOUNT` | `E` |
| Record list/detail | `MENU_STORE_PAYMENT` | `V` |
| Record create | `MENU_STORE_PAYMENT` | `C` |
| Confirm / reject | `MENU_STORE_PAYMENT_CONFIRM` | `A` |
| Void | `MENU_STORE_PAYMENT_VOID` | `A` |

## Target V/E/X Policy

| Bit | Meaning |
| --- | --- |
| `V` | View / read. |
| `E` | Edit / write, including create, update, confirm, reject, void, and account maintenance. |
| `X` | Export only. |

## Compatibility Decision

| Legacy bit | Compatibility | Decision |
| --- | --- | --- |
| `C` | Create/write | Treat as legacy equivalent of `E`; do not keep as long-term Store Payment policy. |
| `A` | Action/approve | Treat as legacy equivalent of `E` for confirm/reject/void; do not map to `X`. |
| `X` | Export | Keep export-only. |

## Store Payment Write Operations

Store Payment write operations should use `E`:

- create payment record
- maintain account
- confirm
- reject
- void

Export remains `X`.

## Compatibility Period Options

| Option | Description | Risk |
| --- | --- | --- |
| Code-aligned path | Align remote runtime action bits to target `E`, then execute `V/E/X` permission repair. | Lower long-term risk; needs code/deploy approval. |
| Runtime-compatible temporary path | Grant temporary `C/A` bits to match the currently running remote runtime. | Higher policy drift risk; must have rollback and follow-up alignment Gate. |

## Recommended Path

Prefer code-aligned path before live permission repair execution. This dry-run package generates target `V/E/X` candidates only and does not authorize runtime-compatible `C/A` grants.

## DB / Code / Migration Impact

| Area | Required now |
| --- | --- |
| Code change | No in this Gate. A later code alignment Gate may be required. |
| DB field change | No. |
| Migration | No. |
| Permission data migration | Not in this Gate. |

## Boundary Confirmation

| Boundary | Result |
| --- | --- |
| DB write | No |
| Code modified | No |
| Migration executed | No |
| Deploy executed | No |
| Restart executed | No |
| Push executed | No |

## Next Decision

Do not execute live role grants until the user chooses one of:

1. approve code-aligned `E` runtime first, then execute `V/E/X` repair;
2. approve a temporary `C/A` compatibility grant Gate with explicit rollback.
