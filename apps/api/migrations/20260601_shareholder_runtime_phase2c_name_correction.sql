-- ============================================================
-- Shareholder Runtime Phase 2C — 姓名订正：符强 → 伏强
-- 业务确认（2026-06-01）：东鹏股东实际姓名为「伏强」，非「符强」。
--   · sys_user.real_name（fuqiang）符强 → 伏强
--   · shr_shareholders.shareholder_name（SHR-FU-QIANG）符强 → 伏强
--   · shareholder_code SHR-FU-QIANG 不变（仅姓名）
-- 幂等：UPDATE ... WHERE real_name='符强'（已是伏强则 no-op）
-- 注：撤销 M5/M6 阶段「伏强→符强」的早期订正。
-- ============================================================
BEGIN;
SET LOCAL phx.skip_perms_bump = 'on';

UPDATE sys_user SET real_name = '伏强', updated_at = now()
WHERE username = 'fuqiang' AND real_name = '符强';

UPDATE shr_shareholders SET shareholder_name = '伏强', updated_at = now()
WHERE shareholder_code = 'SHR-FU-QIANG' AND shareholder_name = '符强';

COMMIT;
