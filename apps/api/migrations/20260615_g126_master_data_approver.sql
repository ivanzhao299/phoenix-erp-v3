-- ════════════════════════════════════════════════════════════════════════
-- G126 财务敏感字段人工审批 —— 指派主数据变更审批人 2026-06-15
--
-- 背景：G126 让客户授信额度/账期、供应商账期天数等财务敏感字段的编辑不再走 G93 自动
--   落库，而转 MD_FIELD_CHANGE 人工审批。审批步骤要求角色 ROLE_MASTER_DATA_APPROVER。
-- 问题：上线前**无人持有**该角色 → 所有敏感字段变更会转审批后永久卡 PENDING、没人能批。
-- 方案：指派财务总监 刘杰(liujie) 为主数据变更审批人。SoD 成立——客户主档维护人是销售
--   (郭大鹏)、供应商主档维护人是采购(王乐金)，刘杰不维护这两类主档，无自批冲突。
--   如需增加审批人（备份/分权），照此 INSERT 追加其它 username 即可。
-- 幂等：NOT EXISTS 防重复；角色/用户缺失时安全空跑。
-- ════════════════════════════════════════════════════════════════════════
INSERT INTO sys_user_role (user_id, role_id)
SELECT u.user_id, r.role_id
FROM sys_user u
CROSS JOIN sys_role r
WHERE u.username = 'liujie'
  AND r.role_code = 'ROLE_MASTER_DATA_APPROVER'
  AND NOT EXISTS (
    SELECT 1 FROM sys_user_role x
    WHERE x.user_id = u.user_id AND x.role_id = r.role_id
  );

-- 触发权限版本递增，使新审批权 30s 内在其会话生效（jwt.strategy perms_version 探针）
UPDATE sys_user
SET perms_version = COALESCE(perms_version, 0) + 1
WHERE username = 'liujie'
  AND EXISTS (SELECT 1 FROM sys_role r WHERE r.role_code = 'ROLE_MASTER_DATA_APPROVER');
