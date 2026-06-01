-- ============================================================
-- Golden Phoenix · 99 存量环境数据收敛（Reconcile）
-- 仅用于已有 M2/M3 遗留数据的环境；全新生产库本脚本均为 no-op。
-- 处理三项 M5 确认订正：
--   ① 朱召安用户名 zhuzhao_an → zhuzhaoan（安全改名，保留 user_id 与全部绑定）
--   ② BU-TRADING 名称 凤凰贸易事业群 → 凤凰商贸事业群
--   ③ 符强(旧记) 姓名订正为 伏强
--
-- ⚠ 执行时机：在 01/02 之前运行（这样后续 INSERT 会因冲突而跳过，UPDATE 已就位）。
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

-- ② BU-TRADING 名称订正（仅当为旧名时）
UPDATE sys_organizations
SET org_name = '凤凰商贸事业群', org_name_cn = '凤凰商贸事业群', updated_at = now()
WHERE org_code = 'BU-TRADING' AND org_name = '凤凰贸易事业群';

-- ③ 符强 姓名订正（符强 → 伏强）
UPDATE sys_user SET real_name = '伏强', updated_at = now()
WHERE username = 'fuqiang' AND real_name = '符强';

COMMIT;

-- 校验
\echo '── 收敛结果 ──'
SELECT username, real_name FROM sys_user WHERE username IN ('zhuzhaoan','zhuzhao_an','fuqiang') ORDER BY username;
SELECT org_code, org_name FROM sys_organizations WHERE org_code = 'BU-TRADING';
