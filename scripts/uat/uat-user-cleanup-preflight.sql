-- Phoenix ERP V3 — U2 user-account cleanup preflight
-- READ ONLY. This file is an evidence gate, not a cleanup script.
-- It must be run only after target identity and T0 approval are independently verified.

BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '3s';

-- Exact candidate set from the approved U1.6 business decision snapshot.
WITH candidate(username) AS (
  VALUES
    ('pilot_cashier'),
    ('pilot_driver'),
    ('pilot_finance'),
    ('pilot_manager'),
    ('pilot_sales'),
    ('pilot_wms')
)
SELECT
  c.username,
  u.user_id,
  u.real_name,
  u.status,
  u.store_code,
  u.last_login_at,
  u.created_at,
  u.updated_at,
  CASE WHEN u.user_id IS NULL THEN 'MISSING' ELSE 'PRESENT' END AS candidate_presence
FROM candidate c
LEFT JOIN public.sys_user u ON u.username = c.username
ORDER BY c.username;

-- Gate counts: all six must exist, remain frozen/inactive, and be unique by username.
WITH candidate(username) AS (
  VALUES
    ('pilot_cashier'), ('pilot_driver'), ('pilot_finance'),
    ('pilot_manager'), ('pilot_sales'), ('pilot_wms')
)
SELECT
  COUNT(*) FILTER (WHERE u.user_id IS NOT NULL) AS present_rows,
  COUNT(*) FILTER (WHERE u.user_id IS NULL) AS missing_rows,
  COUNT(*) FILTER (WHERE u.user_id IS NOT NULL AND u.status = 0) AS frozen_rows,
  COUNT(*) FILTER (WHERE u.user_id IS NOT NULL AND u.status <> 0) AS non_frozen_rows,
  COUNT(*) FILTER (WHERE u.user_id IS NOT NULL AND u.last_login_at IS NOT NULL) AS logged_in_rows
FROM candidate c
LEFT JOIN public.sys_user u ON u.username = c.username;

-- Role bindings are retained as evidence; no role rows are changed here.
WITH candidate(username) AS (
  VALUES
    ('pilot_cashier'), ('pilot_driver'), ('pilot_finance'),
    ('pilot_manager'), ('pilot_sales'), ('pilot_wms')
)
SELECT c.username, u.user_id, r.role_code, ur.is_primary,
       COALESCE(ur.is_visible, true) AS is_visible
FROM candidate c
JOIN public.sys_user u ON u.username = c.username
LEFT JOIN public.sys_user_role ur ON ur.user_id = u.user_id
LEFT JOIN public.sys_role r ON r.role_id = ur.role_id
ORDER BY c.username, r.role_code;

-- Scope and permission bindings must be zero or explicitly reviewed before archive.
WITH candidate(username) AS (
  VALUES
    ('pilot_cashier'), ('pilot_driver'), ('pilot_finance'),
    ('pilot_manager'), ('pilot_sales'), ('pilot_wms')
)
SELECT c.username, u.user_id,
       (SELECT COUNT(*) FROM public.sys_user_orgs x WHERE x.user_id = u.user_id) AS org_scope_rows,
       (SELECT COUNT(*) FROM public.sys_user_project_scopes x WHERE x.user_id = u.user_id) AS project_scope_rows,
       (SELECT COUNT(*) FROM public.sys_user_warehouse_scopes x WHERE x.user_id = u.user_id) AS warehouse_scope_rows,
       (SELECT COUNT(*) FROM public.sys_user_permission_set x WHERE x.user_id = u.user_id) AS permission_set_rows
FROM candidate c
JOIN public.sys_user u ON u.username = c.username
ORDER BY c.username;

-- Current FK topology into sys_user. Logical references without FKs still require the next checks.
SELECT
  child_ns.nspname AS child_schema,
  child_cls.relname AS child_table,
  con.conname AS constraint_name,
  pg_get_constraintdef(con.oid) AS constraint_definition,
  CASE con.confdeltype
    WHEN 'a' THEN 'NO ACTION'
    WHEN 'r' THEN 'RESTRICT'
    WHEN 'c' THEN 'CASCADE'
    WHEN 'n' THEN 'SET NULL'
    WHEN 'd' THEN 'SET DEFAULT'
    ELSE 'UNKNOWN'
  END AS on_delete
FROM pg_constraint con
JOIN pg_class child_cls ON child_cls.oid = con.conrelid
JOIN pg_namespace child_ns ON child_ns.oid = child_cls.relnamespace
WHERE con.contype = 'f'
  AND con.confrelid = 'public.sys_user'::regclass
ORDER BY child_schema, child_table, constraint_name;

-- Potential logical user references to be reviewed against the live schema.
SELECT table_schema, table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND column_name ~ '(user_id|created_by|updated_by|approved_by|assigned_to|owner_id|operator_id|actor_id|receiver_id)'
ORDER BY table_name, ordinal_position;

ROLLBACK;
