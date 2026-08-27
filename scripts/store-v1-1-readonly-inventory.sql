-- V1-1 回填盘点（只读）。运行时必须同时设置 default_transaction_read_only=on。
\pset pager off
BEGIN TRANSACTION READ ONLY;
SELECT 'READONLY_GUARD' AS section, current_setting('transaction_read_only') AS read_only;

SELECT 'STORE_V1_2_SCHEMA' AS section,
       to_regclass('public.store_sale_allocations') IS NOT NULL AS allocations_table,
       to_regclass('public.store_sale_adjustments') IS NOT NULL AS adjustments_table,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sal_store_sales' AND column_name='idempotency_key') AS idempotency_column,
       EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='sal_store_sales' AND column_name='warehouse_code') AS warehouse_column,
       to_regclass('public.uq_store_sale_payment_idempotency') IS NOT NULL AS idempotency_unique_index,
       to_regclass('public.uq_store_shift_open_per_store') IS NOT NULL AS one_open_shift_index,
       EXISTS (SELECT 1 FROM migrations WHERE name='EnforceStorePosAtomicSettlement1787878800000') AS migration_recorded;

SELECT 'STORE_ORG_TRANSFER_PREFLIGHT' AS section,
       (SELECT jsonb_object_agg(status,cnt) FROM (
          SELECT status,count(*) AS cnt FROM wms_transfer GROUP BY status ORDER BY status
        ) x) AS transfer_status_counts,
       (SELECT jsonb_object_agg(alias_type,cnt) FROM (
          SELECT alias_type,count(*) AS cnt FROM store_aliases GROUP BY alias_type ORDER BY alias_type
        ) x) AS alias_type_counts;

-- 1. legacy mst_stores -> canonical Store / SITE alias 候选；不自动判定、不写入。
SELECT 'LEGACY_STORE_SITE_CANDIDATE' AS section, s.store_code, s.store_name, s.company_code, s.mapped_site_code,
       'SITE-' || replace(regexp_replace(s.store_code, '^STORE-', ''), '_', '-') || '-STORE' AS suggested_org_code,
       s.store_name || '（组织地点）' AS suggested_org_name,
       CASE WHEN o.org_code IS NOT NULL AND o.site_business_type='STORE' AND o.company_code=s.company_code
            THEN 'STORE_SITE_MATCHED' ELSE 'STORE_SITE_REVIEW_REQUIRED' END AS mapping_status
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

-- 3. 逐店建仓裁定清单；只给建议，不创建仓。
SELECT 'STORE_WAREHOUSE_DECISION' AS section, s.store_code, s.store_name, s.company_code,
       'ST_' || replace(regexp_replace(s.company_code, '^COMP-', ''), '-', '_') || '_' ||
       replace(regexp_replace(s.store_code, '^STORE-', ''), '-', '_') || '_SALES' AS suggested_warehouse_code,
       CASE WHEN s.store_code='STORE-VTE-WH-001' THEN 'DISTRIBUTION_CENTER_CANDIDATE'
            ELSE 'OWN_STORE_WAREHOUSE_CANDIDATE' END AS proposed_classification,
       'WAITING_FOR_BUSINESS_STORE_BY_STORE_CONFIRMATION' AS decision_status
FROM mst_stores s
ORDER BY s.company_code,s.store_code;

-- 4. binding 候选只能来自已建成且 owner_store_id 明确的门店仓；本轮不建仓，预期 0 行。
SELECT 'STORE_WAREHOUSE_BINDING_CANDIDATE' AS section, sm.store_code, sm.company_code,
       w.warehouse_code, w.warehouse_name, w.domain, w.status, 'OWNER_STORE_VERIFIED' AS candidate_reason
FROM store_master sm
JOIN wms_warehouses w ON NULLIF(to_jsonb(w)->>'owner_store_id','')::bigint=sm.id
WHERE w.company_code=sm.company_code AND w.status='ACTIVE' AND w.domain='OPERATIONAL'
ORDER BY sm.store_code,w.warehouse_code;

-- 5. V1-1 部署窗口错误扫描。只读输出门店工作台新 schema / scope 相关错误。
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
