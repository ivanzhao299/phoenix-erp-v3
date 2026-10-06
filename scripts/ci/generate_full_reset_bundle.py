import csv
import pathlib
import re

root = pathlib.Path(__file__).resolve().parents[2]
rows = list(csv.DictReader((root / "full-reset-table-classification.csv").open(encoding="utf-8-sig")))
classes = {r["table"]: r["classification"] for r in rows}
target_classes = {"DELETE_TRANSACTION", "DELETE_RUNTIME", "RESET_DERIVED", "EXTERNAL_GATE"}
target = [r["table"] for r in rows if r["classification"] in target_classes]
order = []
for line in (root / "full-reset-fk-order.md").read_text().splitlines():
    m = re.match(r"^\d+\. `([^`]+)` \(([^)]+)\)", line)
    if m and m.group(1) in target_classes:
        order.append(m.group(1))
manual = [
    "sal_store_settlement_reconciliations", "sal_store_sale_tenders", "sal_store_sales",
    "pkg_packing_code_claims", "pkg_packing_events", "pkg_packing_operations", "pkg_packing_boxes", "pkg_packing_records",
    "qa_inspections", "qa_product_inspections", "store_receiving", "store_receiving_items",
    "store_transfers", "store_replenish_req", "store_losses", "sal_store_shift_closings",
]
for table in manual:
    if table in target and table not in order:
        order.append(table)
for table in sorted(target):
    if table not in order:
        order.append(table)
assert set(order) == set(target)
archive = [r["table"] for r in rows if r["classification"] == "ARCHIVE"]
keep = [r["table"] for r in rows if r["classification"] == "KEEP_MASTER"]

sql = []
add = sql.append
add("-- PHOENIX ERP V3 — FULL TEST BUSINESS RESET — R2 rollback-only bundle")
add("-- Generated from frozen classification and FK/trigger plans; R3 requires a separate execution contract.")
add(r"\set ON_ERROR_STOP on")
add(r"\if :{?DRY_RUN}")
add(r"\else")
add(r"  \set DRY_RUN true")
add(r"\endif")
add(r"\if :{?PRODUCTION_DELETE_AUTHORIZED}")
add(r"\else")
add(r"  \set PRODUCTION_DELETE_AUTHORIZED false")
add(r"\endif")
add(r"\if :DRY_RUN")
add(r"\else")
add(r"  \echo 'R2 bundle only supports DRY_RUN=true'")
add(r"  \quit 3")
add(r"\endif")
add(r"\if :PRODUCTION_DELETE_AUTHORIZED")
add(r"  \echo 'R2 bundle refuses production authorization'")
add(r"  \quit 3")
add(r"\endif")
add("BEGIN ISOLATION LEVEL SERIALIZABLE;")
add("SET LOCAL statement_timeout='30min';")
add("SET LOCAL lock_timeout='5s';")
add("SET LOCAL search_path=public,pg_catalog;")
add("SELECT current_database(), current_setting('server_version');")
add("DO $$ BEGIN IF current_database() <> 'phoenix_erp' THEN RAISE EXCEPTION 'wrong database'; END IF; IF current_setting('server_version') NOT LIKE '16.%' THEN RAISE EXCEPTION 'wrong postgres major'; END IF; IF (SELECT system_identifier FROM pg_control_system()) <> 7641898445435437089 THEN RAISE EXCEPTION 'wrong system identifier'; END IF; END $$;")
add("CREATE TEMP TABLE r2_baseline(table_name text PRIMARY KEY, classification text NOT NULL, pre_rows bigint NOT NULL) ON COMMIT DROP;")
for r in rows:
    add(f"INSERT INTO r2_baseline VALUES ('{r['table']}', '{r['classification']}', (SELECT count(*) FROM public.{r['table']}));")
add("CREATE TEMP TABLE r2_deleted(table_name text PRIMARY KEY, deleted_rows bigint NOT NULL) ON COMMIT DROP;")
add("SELECT table_name,classification,pre_rows FROM r2_baseline ORDER BY table_name;")
add("DO $$ BEGIN IF (SELECT count(*) FROM public.chanjet_writeback_outbox WHERE state IN ('PENDING','QUEUED','RETRYING')) <> 0 THEN RAISE EXCEPTION 'pending Chanjet writeback'; END IF; IF (SELECT count(*) FROM public.chanjet_wms_writeback_outbox WHERE state IN ('PENDING','QUEUED','RETRYING')) <> 0 THEN RAISE EXCEPTION 'pending WMS writeback'; END IF; END $$;")
add("DO $$ BEGIN IF (SELECT count(*) FROM public.chanjet_sync_jobs WHERE status='RUNNING' AND request_scope ? 'orchestrationRunId') <> 0 THEN RAISE EXCEPTION 'durable Chanjet job still RUNNING'; END IF; END $$;")
add("DO $$ DECLARE n integer; BEGIN SELECT count(*) INTO n FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('trg_sal_order_lifecycle_events_append_only','trg_guard_posted_store_settlement','packing_event_immutable','preserve_pkg_packing_code_registry','preserve_pkg_packing_code_claims') AND tgenabled='O'; IF n <> 5 THEN RAISE EXCEPTION 'protected trigger precondition failed: %',n; END IF; END $$;")
for table, trigger in [
    ("sal_order_lifecycle_events", "trg_sal_order_lifecycle_events_append_only"),
    ("sal_store_settlements", "trg_guard_posted_store_settlement"),
    ("pkg_packing_events", "packing_event_immutable"),
    ("pkg_packing_code_registry", "preserve_pkg_packing_code_registry"),
    ("pkg_packing_code_claims", "preserve_pkg_packing_code_claims"),
]:
    add(f"ALTER TABLE public.{table} DISABLE TRIGGER {trigger};")
add("UPDATE public.sal_store_sale_tenders SET reversal_of_tender_id=NULL;")
add("UPDATE public.pkg_packing_events SET session_id=NULL;")
for table in order:
    if classes[table] == "RESET_DERIVED":
        continue
    add(f"DO $$ DECLARE n bigint; BEGIN DELETE FROM public.{table}; GET DIAGNOSTICS n=ROW_COUNT; INSERT INTO r2_deleted VALUES ('{table}',n); END $$;")
add("DO $$ DECLARE n bigint; BEGIN DELETE FROM public.ord_credit_usage; GET DIAGNOSTICS n=ROW_COUNT; INSERT INTO r2_deleted VALUES ('ord_credit_usage',n); END $$;")
add("UPDATE public.store_inventory SET qty=0, last_count_date=NULL, updated_at=NOW();")
add("UPDATE public.wms_stock_balance SET qty=0, locked_qty=0, updated_at=NOW();")
add("UPDATE public.fin_cash_accounts SET current_balance=opening_balance, updated_at=NOW();")
add("UPDATE public.sal_customers SET credit_used=0, credit_status='NORMAL', last_overdue_at=NULL;")
add("UPDATE public.ord_customers SET credit_used=0;")
for table, trigger in [
    ("pkg_packing_code_claims", "preserve_pkg_packing_code_claims"),
    ("pkg_packing_code_registry", "preserve_pkg_packing_code_registry"),
    ("pkg_packing_events", "packing_event_immutable"),
    ("sal_store_settlements", "trg_guard_posted_store_settlement"),
    ("sal_order_lifecycle_events", "trg_sal_order_lifecycle_events_append_only"),
]:
    add(f"ALTER TABLE public.{table} ENABLE TRIGGER {trigger};")
add("DO $$ DECLARE n integer; BEGIN SELECT count(*) INTO n FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('trg_sal_order_lifecycle_events_append_only','trg_guard_posted_store_settlement','packing_event_immutable','preserve_pkg_packing_code_registry','preserve_pkg_packing_code_claims') AND tgenabled='O'; IF n <> 5 THEN RAISE EXCEPTION 'protected trigger restore failed: %',n; END IF; END $$;")
for table in target:
    add(f"DO $$ BEGIN IF (SELECT count(*) FROM public.{table}) <> 0 THEN RAISE EXCEPTION 'target table not empty: {table}'; END IF; END $$;")
for table in archive + keep:
    add(f"DO $$ BEGIN IF (SELECT count(*) FROM public.{table}) <> (SELECT pre_rows FROM r2_baseline WHERE table_name='{table}') THEN RAISE EXCEPTION 'baseline changed: {table}'; END IF; END $$;")
add("DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.fin_cash_accounts WHERE current_balance IS DISTINCT FROM opening_balance) THEN RAISE EXCEPTION 'cash derived balance mismatch'; END IF; IF EXISTS (SELECT 1 FROM public.store_inventory WHERE COALESCE(qty,0)<>0) THEN RAISE EXCEPTION 'store inventory not zero'; END IF; IF EXISTS (SELECT 1 FROM public.wms_stock_balance WHERE COALESCE(qty,0)<>0 OR COALESCE(locked_qty,0)<>0) THEN RAISE EXCEPTION 'wms stock balance not zero'; END IF; IF EXISTS (SELECT 1 FROM public.sal_customers WHERE COALESCE(credit_used,0)<>0 OR credit_status IS DISTINCT FROM 'NORMAL' OR last_overdue_at IS NOT NULL) THEN RAISE EXCEPTION 'customer credit derived state mismatch'; END IF; IF EXISTS (SELECT 1 FROM public.ord_customers WHERE COALESCE(credit_used,0)<>0) THEN RAISE EXCEPTION 'legacy customer credit derived state mismatch'; END IF; END $$;")
add("SET CONSTRAINTS ALL IMMEDIATE;")
add("SELECT 'R2_DRY_RUN_PASS' AS result, (SELECT COALESCE(sum(deleted_rows),0) FROM r2_deleted) AS deleted_rows;")
add("ROLLBACK;")
(root / "scripts/uat/full-test-business-reset.sql").write_text("\n".join(sql) + "\n")

post = ["-- PHOENIX ERP V3 — FULL TEST BUSINESS RESET POSTCHECK (read-only)", r"\set ON_ERROR_STOP on", "BEGIN TRANSACTION READ ONLY;", "SET LOCAL statement_timeout='10min';", "SET LOCAL lock_timeout='5s';", "SELECT current_database(), current_setting('server_version');", "DO $$ BEGIN IF current_database() <> 'phoenix_erp' THEN RAISE EXCEPTION 'wrong database'; END IF; END $$;"]
for table in target:
    post.append(f"SELECT 'DELETE_TARGET' AS classification, '{table}' AS table_name, count(*)::bigint AS rows FROM public.{table};")
for table in archive:
    post.append(f"SELECT 'ARCHIVE' AS classification, '{table}' AS table_name, count(*)::bigint AS rows FROM public.{table};")
post.append("DO $$ BEGIN IF EXISTS (SELECT 1 FROM public.fin_ar_ledger) OR EXISTS (SELECT 1 FROM public.fin_ar_invoices) OR EXISTS (SELECT 1 FROM public.fin_ar_receipts) OR EXISTS (SELECT 1 FROM public.fin_ar_receipt_allocations) THEN RAISE EXCEPTION 'AR not zero'; END IF; IF EXISTS (SELECT 1 FROM public.inv_batches) OR EXISTS (SELECT 1 FROM public.inv_ledger) THEN RAISE EXCEPTION 'inventory facts not zero'; END IF; IF EXISTS (SELECT 1 FROM public.fin_cash_accounts WHERE current_balance IS DISTINCT FROM opening_balance) THEN RAISE EXCEPTION 'cash balance mismatch'; END IF; END $$;")
post.append("SELECT tgname,tgenabled FROM pg_trigger WHERE NOT tgisinternal AND tgname IN ('trg_sal_order_lifecycle_events_append_only','trg_guard_posted_store_settlement','packing_event_immutable','preserve_pkg_packing_code_registry','preserve_pkg_packing_code_claims') ORDER BY tgname;")
post.append("ROLLBACK;")
(root / "scripts/uat/full-test-business-reset-postcheck.sql").write_text("\n".join(post) + "\n")
print(f"generated target={len(target)} archive={len(archive)} keep={len(keep)}")
