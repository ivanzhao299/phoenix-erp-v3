-- 补充 P2 阶段遗漏的审批规则表

CREATE TABLE IF NOT EXISTS sys_approval_rule (
    id BIGSERIAL PRIMARY KEY,
    store_code VARCHAR(64) NOT NULL DEFAULT 'ALL',
    created_store_code VARCHAR(64) NOT NULL DEFAULT 'ALL',
    status VARCHAR(32) DEFAULT 'ACTIVE',
    created_by BIGINT,
    updated_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    deleted_at TIMESTAMP,
    
    -- 业务专属字段
    doc_type VARCHAR(64) NOT NULL,
    amount_min DECIMAL(18,2) DEFAULT 0,
    amount_max DECIMAL(18,2),
    currency_code VARCHAR(8) DEFAULT 'CNY',
    approver_chain JSONB NOT NULL
);

-- 插入一条针对采购单 (PURCHASE_ORDER) 的默认测试规则
INSERT INTO sys_approval_rule (doc_type, amount_min, amount_max, approver_chain)
VALUES (
    'PURCHASE_ORDER',
    0,
    NULL,
    '["ROLE_PRC_MGR", "ROLE_FIN_MGR"]'::jsonb
)
ON CONFLICT DO NOTHING;
