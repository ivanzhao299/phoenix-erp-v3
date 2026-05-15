-- P2 阶段新增表：资金流水与审批痕迹

CREATE TABLE IF NOT EXISTS biz_cash_flow (
    id BIGSERIAL PRIMARY KEY,
    store_code VARCHAR(32) NOT NULL DEFAULT 'ALL',
    flow_type VARCHAR(32) NOT NULL, -- IN, OUT
    category VARCHAR(64) NOT NULL,
    amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    currency_code VARCHAR(8) NOT NULL, -- CNY, LAK
    payer VARCHAR(128),
    payee VARCHAR(128),
    remark TEXT,
    status VARCHAR(32) NOT NULL DEFAULT 'DRAFT',
    ref_doc_id BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sys_approval_log (
    id BIGSERIAL PRIMARY KEY,
    doc_type VARCHAR(64) NOT NULL,
    doc_id BIGINT NOT NULL,
    approver_role VARCHAR(64) NOT NULL,
    approver_id BIGINT NOT NULL,
    action VARCHAR(16) NOT NULL, -- APPROVED, REJECTED, SUBMIT
    comment TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
