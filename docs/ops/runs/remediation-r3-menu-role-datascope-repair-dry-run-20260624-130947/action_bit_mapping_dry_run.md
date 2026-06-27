# Store Payment Action-Bit Compatibility Dry-Run

Current runtime evidence:

- Record create route uses `MENU_STORE_PAYMENT:C`.
- Confirm / reject / void routes use `A` on `MENU_STORE_PAYMENT_CONFIRM` / `MENU_STORE_PAYMENT_VOID`.
- Account create/update already use `E`.

Target policy:

- `V` = view/read.
- `E` = edit/write including create, confirm, reject, void, account maintenance.
- `X` = export only.

Compatibility conclusion:

- `C` should be treated as legacy create and mapped to target `E`; it should not remain a long-term Store Payment permission bit.
- `A` should be treated as legacy action/approve and mapped to target `E` for confirm/reject/void, not to `X`.
- `X` should remain export-only.
- This dry-run generates target `V/E/X` candidates only. Because remote runtime still references `C/A`, execution must either deploy action-bit code alignment first or explicitly approve a temporary runtime-compatible `C/A` grant path.

Recommendation:

- This Gate does not modify code or DB.
- Prefer code alignment to `E` before live permission repair execution.
- If business requires immediate runtime access before code alignment, generate a separate temporary `C/A` compatibility grant Gate with explicit rollback.
