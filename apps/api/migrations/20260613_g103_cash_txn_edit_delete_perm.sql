-- ════════════════════════════════════════════════════════════════════════
-- G103 资金流水「修改/删除」权限 — 授给能录入手工流水的角色（2026-06-13）
-- ────────────────────────────────────────────────────────────────────────
-- 背景：出纳(王玮华等)反映需修正/删除录错的手工流水。后端新增
--   PATCH/DELETE /transactions/:id（仅 source_type='MANUAL'，改后重算余额链），
--   分别门控 MENU_FIN2_CASH_TXN:E / :D。
-- 授权原则：凡已持 MENU_FIN2_CASH_TXN:C（能录入手工流水）的角色 → 补 E,D（能修正自己录的）。
-- 幂等：仅更新缺 E 或 D 的行；perm_codes 去重合并。
-- ════════════════════════════════════════════════════════════════════════

UPDATE sys_role_menu_permission p
SET perm_codes = (
  SELECT string_agg(c, ',' ORDER BY c)
  FROM (SELECT DISTINCT unnest(string_to_array(p.perm_codes, ',') || ARRAY['E','D']) AS c) s
  WHERE s.c <> ''
)
FROM sys_menu m
WHERE p.menu_id = m.menu_id
  AND m.menu_code = 'MENU_FIN2_CASH_TXN'
  AND ('C' = ANY(string_to_array(p.perm_codes, ',')))            -- 仅持「录入」权的角色
  AND NOT ('E' = ANY(string_to_array(p.perm_codes, ','))
       AND 'D' = ANY(string_to_array(p.perm_codes, ',')));        -- 已有 E+D 则跳过（幂等）
