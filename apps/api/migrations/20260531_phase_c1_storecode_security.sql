-- ============================================================
-- Phase C-1.4 — store_code='ALL' 越权收敛（安全红线）
--
-- 根因（联合审计验证）：
--   DataScopeService 兜底逻辑：store_code='ALL' → isGlobal=true（集团全局可见）。
--   大量非全局角色的用户 store_code 仍为 'ALL'，导致越权访问所有公司数据。
--   最高危：
--     · 司机（ROLE_DRIVER）：可见全集团数据
--     · 外部 B2B 客户（ROLE_CUSTOMER_B2B）：外部人员全局可见
--     · 股东视图（ROLE_SHAREHOLDER_VIEW）：应 SELF 却 GROUP
--
-- 收敛策略：
--   · 仅 ROLE_ADMIN / ROLE_CEO / 总部财务 / 审计 等【确需全局】的角色保留 ALL
--   · 其余角色按其主要业务归属收敛到具体公司/场区码
--   · 依赖 C-1.1（约束修复）+ user_org_bindings（精确绑定）先执行
--     收敛后这些用户优先走 sys_user_orgs 精确路径，store_code 仅作降级兜底
--
-- 安全说明：本迁移只收紧权限（缩小数据可见范围），不会放大任何用户的权限。
-- 幂等：WHERE 条件限定，重复执行无副作用。
-- ============================================================

SET LOCAL phx.skip_perms_bump = 'on';

-- ── 1. 司机 ajian — 收敛到万象屠宰场（配送发出地）──────────────────────────────
-- 这是审计标记的最高安全风险：司机当前全局可见所有公司数据
UPDATE sys_user
SET store_code = 'SITE-VTE-SLAUGHTER', updated_at = NOW()
WHERE username = 'ajian' AND store_code = 'ALL';

-- ── 2. 区域督导 — 收敛到对应公司（原 AREA-* 与 company_code 类型不匹配）──────────
UPDATE sys_user SET store_code = 'COMP-LAO-FOOD', updated_at = NOW()
WHERE username = 'fuqiang' AND store_code IN ('ALL','AREA-VTE');

-- ── 3. 门店店长 amei — 收敛到所属食品公司 ────────────────────────────────────────
UPDATE sys_user SET store_code = 'COMP-LAO-FOOD', updated_at = NOW()
WHERE username = 'amei' AND store_code IN ('ALL','STORE-VTE-001','STORE-VTE-01');

-- ── 4. 养殖/仓储相关 — 收敛到农业公司 ────────────────────────────────────────────
UPDATE sys_user SET store_code = 'COMP-LAO-AGRI', updated_at = NOW()
WHERE username IN ('linhong','liushanjun') AND store_code IN ('ALL','FARM-MS');

-- ── 5. 采购专员 — 收敛到农业公司（采购主要服务农业线）──────────────────────────
UPDATE sys_user SET store_code = 'COMP-LAO-AGRI', updated_at = NOW()
WHERE username = 'wanglejin' AND store_code = 'ALL';

-- ──────────────────────────────────────────────────────────────────────────────
-- 注：以下角色【保留】store_code='ALL'（确需全局访问，符合职责）：
--   · zhaoyongwei (ROLE_ADMIN)     — 系统管理员
--   · zhuzhaocun  (ROLE_CEO)       — 集团总裁
--   · wangweihua  (ROLE_FIN_ACCT)  — 财务会计（集团财务全局审阅，已绑 ORG-HQ）
--   · liuhantao   (ROLE_FIN_COST)  — 成本会计（集团成本核算）
--   · zhuzhao_an  (出纳)            — 集团资金（已绑 ORG-HQ）
--   财务类用户虽 store_code=ALL，但已通过 sys_user_orgs 绑定 ORG-HQ(GROUP)，
--   DataScope 优先走精确路径，符合财务全局审阅职责。
-- 事业群督导 zhuhuiran/yue 通过 sys_user_orgs 绑定 BU 节点（BU 展开逻辑生效），
--   不依赖 store_code，保持现状即可。
-- ──────────────────────────────────────────────────────────────────────────────

-- ── 验证：输出收敛后的 store_code 分布 ──────────────────────────────────────────
SELECT username, real_name, store_code,
       CASE WHEN store_code = 'ALL' THEN '⚠️ 全局' ELSE '✅ 受限' END AS scope_status
FROM sys_user
WHERE username IN (
  'zhaoyongwei','zhuzhaocun','fuqiang','wangweihua','liuhantao',
  'zhuzhao_an','liushanjun','linhong','amei','zhuhuiran',
  'yue','wanglejin','ajian'
)
ORDER BY store_code, username;
