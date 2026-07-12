# BUG-20260710-0001 Integrated Repair

- Symptom: the procurement-center action on the operations workbench could resolve through an incidental child-menu order.
- Repair: procurement dashboard permission now deterministically resolves to `/procurement2/dashboard`; users without it fall back only to their first visible procurement child.
- Verification: `home-navigation.test.ts`, Web typecheck, i18n gates, and W5 closeout gate.
- Conclusion: PASS WITH CONDITIONS pending CI/CD and production smoke evidence.
