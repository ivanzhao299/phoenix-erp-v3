-- Candidate only. Do not execute without APPROVE_ACTION_BIT_LEGACY_CLEANUP_EXECUTION_GATE.
-- Scope: remove Store Payment-only temporary C/A compatibility bits after runtime uses E.
-- This SQL intentionally excludes MENU_STORE_PAYMENT_EXPORT.
--
-- Execution Gate must save all SELECT output before commit; it contains rollback statements.

\pset pager off

BEGIN;

CREATE TEMP TABLE tmp_store_payment_action_bit_cleanup_before AS
SELECT
  rp.perm_id,
  rp.role_id,
  r.role_code,
  rp.menu_id,
  m.menu_code,
  rp.perm_codes AS old_perm_codes,
  trim(both ',' from regexp_replace(regexp_replace(',' || rp.perm_codes || ',', ',(C|A),', ',', 'g'), ',+', ',', 'g')) AS new_perm_codes
FROM sys_role_menu_permission rp
JOIN sys_menu m ON m.menu_id = rp.menu_id
LEFT JOIN sys_role r ON r.role_id = rp.role_id
WHERE m.menu_code IN (
    'MENU_STORE_PAYMENT',
    'MENU_STORE_PAYMENT_CONFIRM',
    'MENU_STORE_PAYMENT_VOID'
  )
  AND rp.perm_codes <> '*'
  AND (',' || rp.perm_codes || ',') ~ ',(C|A),';

\echo '--- affected rows before update ---'
SELECT perm_id, role_code, menu_code, old_perm_codes, new_perm_codes
FROM tmp_store_payment_action_bit_cleanup_before
ORDER BY role_code, menu_code;

\echo '--- rollback statements to save before commit ---'
SELECT
  'UPDATE sys_role_menu_permission SET perm_codes = ' ||
  quote_literal(old_perm_codes) ||
  ' WHERE perm_id = ' || perm_id || ';' AS rollback_sql
FROM tmp_store_payment_action_bit_cleanup_before
ORDER BY role_code, menu_code;

UPDATE sys_role_menu_permission rp
SET perm_codes = b.new_perm_codes
FROM tmp_store_payment_action_bit_cleanup_before b
WHERE rp.perm_id = b.perm_id
  AND b.new_perm_codes <> ''
  AND b.new_perm_codes !~ '(^|,)(C|A)(,|$)';

\echo '--- affected rows after update ---'
SELECT
  rp.perm_id,
  b.role_code,
  b.menu_code,
  b.old_perm_codes,
  rp.perm_codes AS current_perm_codes
FROM sys_role_menu_permission rp
JOIN tmp_store_payment_action_bit_cleanup_before b ON b.perm_id = rp.perm_id
ORDER BY b.role_code, b.menu_code;

\echo '--- export untouched check ---'
SELECT m.menu_code, rp.perm_codes
FROM sys_role_menu_permission rp
JOIN sys_menu m ON m.menu_id = rp.menu_id
WHERE m.menu_code = 'MENU_STORE_PAYMENT_EXPORT'
ORDER BY rp.role_id;

COMMIT;
