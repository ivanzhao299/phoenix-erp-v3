# Product Acceptance Human UAT Handoff

The automated R4.1 baseline is ready. Human acceptance remains a separate business activity and must use an existing authorized account. Do not send passwords, hashes or tokens to the engineering team.

## Checklist

- [ ] Login succeeds with the business tester's normal account.
- [ ] Expected menus and role permissions are visible.
- [ ] Company scope resolves correctly.
- [ ] Store scope resolves correctly.
- [ ] Warehouse scope resolves correctly.
- [ ] Procurement master selectors load suppliers, products and projects.
- [ ] Sales master selectors load customers, SKUs and stores.
- [ ] WMS selectors load warehouses, zones and locations.
- [ ] Finance account masters and opening balances are visible.
- [ ] Empty transaction lists are understood as the intentional clean baseline.
- [ ] The visible `IOT_DEVICE_ALERT` warning notifications are reviewed and acknowledged as expected, or raised as a separate operational issue.

Do not create PO, SO, inbound, outbound, AR/AP or POS transactions during this first login-and-visibility pass. Controlled transaction UAT requires a separate run manifest and cleanup contract.
