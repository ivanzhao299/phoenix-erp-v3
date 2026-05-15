-- ============== sys_role_conflict 岗位分离冲突表 ==============
-- [V3 RBAC 完善] 对应 RACI 文档 07 第 6 节红线规则
-- 当角色被授予 menu_a 和 menu_b 两个互斥菜单权限时，UI 触发警告或后端阻止保存
-- severity 取值：WARN(警告但可保存) | BLOCK(硬拦截) | INFO(仅提示)

CREATE TABLE IF NOT EXISTS sys_role_conflict (
    id          BIGSERIAL PRIMARY KEY,
    menu_a      VARCHAR(64) NOT NULL,
    menu_b      VARCHAR(64) NOT NULL,
    reason_zh   TEXT,
    severity    VARCHAR(16) NOT NULL DEFAULT 'WARN',
    created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
    UNIQUE (menu_a, menu_b)
);

-- 6 条 RACI 红线（基于 V2 验收文档 07）
INSERT INTO sys_role_conflict (menu_a, menu_b, reason_zh, severity) VALUES
    ('MENU_PKG_MGR',    'MENU_WMS_OP',        '分级统计员不得兼任盘点最终确认人（防分级数据与库存盘点合谋）', 'WARN'),
    ('MENU_LOGISTICS',  'MENU_LOG_REVIEW',    '装车执行人不得同时担任出库最终复核人（双人复核分离）',           'WARN'),
    ('MENU_ORDER_MGR',  'MENU_FIN_AUDIT',     '销售订单建立人不得审批赊销放货（防自单自批）',                  'BLOCK'),
    ('MENU_FIN_CLOSE',  'MENU_FIN_AUDIT',     '收款登记人不得参与坏账/差异款核销（防内外勾结）',                'BLOCK'),
    ('MENU_QA_OP',      'MENU_QA_MGR',        '异常品处理提出人不得结案（提出人 ≠ 审批人）',                   'WARN'),
    ('MENU_APPROVAL',   'MENU_FIN_AUDIT',     '审批人不得兼任财务审计（审计独立性原则）',                       'BLOCK')
ON CONFLICT (menu_a, menu_b) DO NOTHING;
