-- P3 阶段新增表：采购订单与仓储余量/流水账

CREATE TABLE IF NOT EXISTS biz_purchase_order (
    id BIGSERIAL PRIMARY KEY,
    po_no VARCHAR(64) UNIQUE NOT NULL,
    supplier_code VARCHAR(128) NOT NULL,
    total_amount DECIMAL(18,2) DEFAULT 0,
    currency_code VARCHAR(8) DEFAULT 'CNY',
    status VARCHAR(32) DEFAULT 'DRAFT',
    plan_qty INT DEFAULT 0,
    received_qty INT DEFAULT 0,
    store_code VARCHAR(32) DEFAULT 'ALL',
    created_by BIGINT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wms_locations (
    location_code VARCHAR(64) PRIMARY KEY,
    warehouse_code VARCHAR(32) NOT NULL,
    zone_code VARCHAR(32),
    location_name VARCHAR(128),
    capacity_qty INT DEFAULT 0,
    status VARCHAR(32) DEFAULT 'ACTIVE',
    store_code VARCHAR(32) DEFAULT 'ALL',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wms_stock_balance (
    id BIGSERIAL PRIMARY KEY,
    warehouse_code VARCHAR(32) NOT NULL,
    location_code VARCHAR(64) NOT NULL,
    spec_code VARCHAR(64) NOT NULL,
    batch_no VARCHAR(64) NOT NULL,
    qty INT DEFAULT 0,
    locked_qty INT DEFAULT 0,
    store_code VARCHAR(32) DEFAULT 'ALL',
    version INT DEFAULT 1, -- 乐观锁版本号
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(warehouse_code, location_code, spec_code, batch_no)
);

CREATE TABLE IF NOT EXISTS wms_stock_ledger (
    id BIGSERIAL PRIMARY KEY,
    biz_type VARCHAR(32) NOT NULL,
    bill_no VARCHAR(64) NOT NULL,
    warehouse_code VARCHAR(32) NOT NULL,
    location_code VARCHAR(64) NOT NULL,
    spec_code VARCHAR(64) NOT NULL,
    batch_no VARCHAR(64) NOT NULL,
    in_qty INT DEFAULT 0,
    out_qty INT DEFAULT 0,
    balance_qty INT DEFAULT 0,
    store_code VARCHAR(32) DEFAULT 'ALL',
    operator VARCHAR(64) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
