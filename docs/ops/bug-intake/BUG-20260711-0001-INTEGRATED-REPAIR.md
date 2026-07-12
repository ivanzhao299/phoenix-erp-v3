# BUG-20260711-0001 Integrated Repair

- Symptom: the Chinese locale renamed `/dashboard` to the generic label “仪表盘”.
- Repair: the locale and menu definition consistently use “经营仪表盘”.
- Verification: `dashboard-menu-label.test.ts`, three-language key parity, Web typecheck, and W5 closeout gate.
- Conclusion: PASS WITH CONDITIONS pending CI/CD and production smoke evidence.
