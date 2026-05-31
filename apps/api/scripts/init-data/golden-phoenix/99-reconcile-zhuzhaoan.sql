-- ============================================================
-- Golden Phoenix · 99 朱召安用户名收敛（Reconcile）
-- 决策：朱召安规范用户名 = zhuzhaoan
-- 背景：M2 遗留环境中存在用户名 zhuzhao_an，须在 M6 导入前收敛为唯一规范名。
--
-- 策略：安全「改名」而非删除——保留 user_id 与其全部角色/组织绑定，零数据丢失。
--   · 仅当存在 zhuzhao_an 且尚无 zhuzhaoan 时：将 zhuzhao_an 重命名为 zhuzhaoan。
--   · 若两者并存：不自动合并（避免误删），仅告警，需人工核对后处理。
--   · 全新生产库（无 zhuzhao_an）：本脚本为 no-op。
--
-- ⚠ 执行时机：在 02-users.sql 之前运行（这样 02 的 INSERT 会因冲突而跳过）。
-- 用法：psql -d <db> -f 99-reconcile-zhuzhaoan.sql
-- ============================================================
BEGIN;
SET LOCAL phx.skip_perms_bump = 'on';

DO $$
DECLARE
  has_old  boolean := EXISTS (SELECT 1 FROM sys_user WHERE username = 'zhuzhao_an');
  has_new  boolean := EXISTS (SELECT 1 FROM sys_user WHERE username = 'zhuzhaoan');
BEGIN
  IF has_old AND NOT has_new THEN
    UPDATE sys_user SET username = 'zhuzhaoan', updated_at = now()
    WHERE username = 'zhuzhao_an';
    RAISE NOTICE '[reconcile] 已将 zhuzhao_an 重命名为 zhuzhaoan（保留 user_id 与全部绑定）';
  ELSIF has_old AND has_new THEN
    RAISE WARNING '[reconcile] zhuzhao_an 与 zhuzhaoan 并存，需人工核对合并；本脚本未做任何改动';
  ELSE
    RAISE NOTICE '[reconcile] 无 zhuzhao_an（或已是 zhuzhaoan），无需处理';
  END IF;
END $$;

COMMIT;

-- 校验：应仅存在 zhuzhaoan，且 zhuzhao_an 不再存在
\echo '── 朱召安用户名收敛结果 ──'
SELECT username, real_name FROM sys_user WHERE username IN ('zhuzhaoan','zhuzhao_an') ORDER BY username;
