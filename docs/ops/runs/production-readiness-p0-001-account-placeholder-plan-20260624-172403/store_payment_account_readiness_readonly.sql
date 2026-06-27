\pset pager off
\echo '--- identity ---'
select current_database() as database, current_user as user, current_schema() as schema;
\echo '--- store/company evidence ---'
select store_code, store_name, company_code, status from mst_stores where store_code in ('STORE-VTE-001','ST-VTE-001') or store_name ilike '%万象%' or store_name ilike '%Vientiane%' order by store_code;
select org_code, org_name, org_type, status from sys_organizations where org_code in ('COMP-LAO-AGRI','STORE-VTE-001','ST-VTE-001') or org_name ilike '%万象%' or org_name ilike '%Vientiane%' or org_name ilike '%Laos%' order by org_code;
\echo '--- store payment counts ---'
select 'store_payment_accounts' as table_name, count(*)::int as row_count from store_payment_accounts
union all select 'store_payment_records', count(*)::int from store_payment_records
union all select 'store_payment_file_metadata', count(*)::int from file_metadata where module_code = 'STORE_PAYMENT';
\echo '--- existing store payment accounts ---'
select id, account_code, account_name, company_code, store_code, currency, payment_method, status, is_active, qr_attachment_id, fin_cash_account_id, remark from store_payment_accounts order by id limit 20;
\echo '--- cash account candidates ---'
select id, account_code, account_name, company_code, currency_code, status from fin_cash_accounts where company_code = 'COMP-LAO-AGRI' or account_name ilike '%lao%' or account_name ilike '%老挝%' or account_name ilike '%万象%' order by id limit 30;
\echo '--- menu role counts ---'
select count(*)::int as store_payment_menu_count from sys_menu where menu_code like 'MENU_STORE_PAYMENT%';
select m.menu_code, count(rp.*)::int as grant_count from sys_menu m left join sys_role_menu_permission rp on rp.menu_id = m.menu_id where m.menu_code like 'MENU_STORE_PAYMENT%' group by m.menu_code order by m.menu_code;
