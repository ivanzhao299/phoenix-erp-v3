-- V1-1 回填盘点（只读）。运行时必须同时设置 default_transaction_read_only=on。
\pset pager off
BEGIN TRANSACTION READ ONLY;
SELECT 'READONLY_GUARD' AS section, current_setting('transaction_read_only') AS read_only;

-- 1. legacy mst_stores -> canonical Store / SITE alias 候选；不自动判定、不写入。
SELECT 'LEGACY_STORE_SITE_CANDIDATE' AS section, s.store_code, s.store_name, s.company_code, s.mapped_site_code,
       CASE WHEN o.org_code IS NOT NULL THEN 'SITE_MATCHED' ELSE 'SITE_REVIEW_REQUIRED' END AS mapping_status
FROM mst_stores s
LEFT JOIN sys_organizations o ON o.org_code=s.mapped_site_code AND o.org_type='SITE' AND o.status='ACTIVE'
ORDER BY s.company_code,s.store_code;

-- 2. cashier / store manager -> membership 候选；逗号 legacy 仅盘点，不作为授权。
SELECT 'STORE_MEMBERSHIP_CANDIDATE' AS section, u.user_id, u.username, r.role_code, trim(x.store_code) AS legacy_store_code,
       s.store_name, s.company_code,
       CASE WHEN s.store_code IS NULL THEN 'STORE_REVIEW_REQUIRED' ELSE 'MEMBERSHIP_CANDIDATE' END AS review_status
FROM sys_user u
JOIN sys_user_role ur ON ur.user_id=u.user_id
JOIN sys_role r ON r.role_id=ur.role_id AND r.role_code IN ('ROLE_CASHIER','ROLE_STORE_MGR')
CROSS JOIN LATERAL unnest(string_to_array(COALESCE(u.store_code,''),',')) x(store_code)
LEFT JOIN mst_stores s ON s.store_code=trim(x.store_code)
WHERE u.status=1 AND trim(x.store_code) NOT IN ('','ALL')
ORDER BY u.user_id,trim(x.store_code);

-- 3. store -> ACTIVE/OPERATIONAL warehouse binding candidates；purpose/priority 必须人工确认。
SELECT 'STORE_WAREHOUSE_BINDING_CANDIDATE' AS section, s.store_code, s.company_code, w.warehouse_code, w.warehouse_name, w.domain, w.status,
       CASE WHEN to_jsonb(w)->>'store_code'=s.store_code THEN 'LEGACY_DIRECT_MATCH'
            WHEN to_jsonb(w)->>'site_code'=s.mapped_site_code AND s.mapped_site_code IS NOT NULL THEN 'SITE_MATCH_REVIEW'
            ELSE 'COMPANY_POOL_REVIEW' END AS candidate_reason
FROM mst_stores s
JOIN wms_warehouses w ON w.company_code=s.company_code AND w.status='ACTIVE' AND w.domain='OPERATIONAL'
ORDER BY s.store_code,candidate_reason,w.warehouse_code;

-- 4. V1-1 部署窗口错误扫描。只读输出门店工作台新 schema / scope 相关错误。
SELECT 'STORE_V1_ERROR_WINDOW' AS section, id, request_path, request_method, http_status, error_message, created_at
FROM sys_error_logs
WHERE created_at::timestamp >= :'window_start'::timestamp
  AND created_at::timestamp < :'window_end'::timestamp
  AND (request_path ILIKE '%store-sales%'
       OR error_message ILIKE '%store_master%'
       OR error_message ILIKE '%store_membership%'
       OR error_message ILIKE '%store_warehouse_bindings%'
       OR error_message ILIKE '%门店%membership%')
ORDER BY created_at::timestamp DESC
LIMIT 200;

ROLLBACK;
