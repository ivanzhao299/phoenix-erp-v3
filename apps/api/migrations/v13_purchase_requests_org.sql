-- v13: 采购申请 org 隔离字段补全
ALTER TABLE prc_purchase_requests ADD COLUMN IF NOT EXISTS store_code VARCHAR(50);
ALTER TABLE prc_purchase_requests ADD COLUMN IF NOT EXISTS requester_id INT;
ALTER TABLE prc_purchase_requests ADD COLUMN IF NOT EXISTS reviewer_name VARCHAR(100);

CREATE INDEX IF NOT EXISTS idx_prc_req_store_code ON prc_purchase_requests (store_code);
CREATE INDEX IF NOT EXISTS idx_prc_req_status ON prc_purchase_requests (status);

DO $$ BEGIN
  RAISE NOTICE 'v13_purchase_requests_org: columns and indexes added.';
END; $$;
