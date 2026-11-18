import { DataSource } from 'typeorm';

/** Owned fixture contracts for actual order reservation/delivery and POS cash writers. No business seed. */
export async function installManagedSalesFixture(db:DataSource){
  await db.query(`
    ALTER TABLE wms_warehouses ADD COLUMN owner_store_id bigint;
    ALTER TABLE product_skus ADD COLUMN IF NOT EXISTS org_context_required boolean DEFAULT false;
    ALTER TABLE sal_sales_orders ADD COLUMN fulfillment_warehouse_code text;
    ALTER TABLE sal_order_items ADD COLUMN product_code text,ADD COLUMN grade_code text,ADD COLUMN sku_code text;
    CREATE SEQUENCE fixture_sales_allocation_id;
    ALTER TABLE sal_order_item_batch_allocations ALTER COLUMN id SET DEFAULT nextval('fixture_sales_allocation_id'),
      ALTER COLUMN outbound_qty SET DEFAULT 0,ALTER COLUMN released_qty SET DEFAULT 0,
      ADD COLUMN reservation_ledger_id bigint,ADD COLUMN created_by text,ADD COLUMN updated_at timestamptz DEFAULT now();
    CREATE TABLE sal_order_item_batch_allocation_actions(id bigserial PRIMARY KEY,allocation_id bigint,sales_order_id bigint,
      delivery_order_id bigint,action_type text,action_key text,qty numeric,ledger_id bigint,created_by text,
      UNIQUE(allocation_id,action_type,action_key));
    CREATE TABLE sal_delivery_orders(id bigint PRIMARY KEY,delivery_no text,status text,company_code text,fulfillment_warehouse_code text);
    CREATE TABLE sal_delivery_order_items(id bigint PRIMARY KEY,delivery_order_id bigint,sales_order_id bigint,planned_qty numeric,sales_order_no text,status text);
    ALTER TABLE sal_delivery_orders ADD COLUMN driver_id bigint,ADD COLUMN vehicle_id bigint,ADD COLUMN loading_start_at timestamptz,
      ADD COLUMN loading_end_at timestamptz,ADD COLUMN updated_at timestamptz DEFAULT now();
    ALTER TABLE sal_delivery_order_items ADD COLUMN loaded_qty numeric,ADD COLUMN outbound_qty numeric,ADD COLUMN updated_at timestamptz DEFAULT now();
    ALTER TABLE sys_organizations ADD COLUMN IF NOT EXISTS org_name_cn text;
    CREATE TABLE sal_drivers(id bigint PRIMARY KEY,driver_name text,driver_name_en text,driver_name_lo text);
    CREATE TABLE sal_vehicles(id bigint PRIMARY KEY,vehicle_type text);
    CREATE TABLE sal_receipts(id bigint PRIMARY KEY,delivery_order_id bigint,created_at timestamptz DEFAULT now());
    CREATE TABLE sal_order_lifecycle_events(event_id uuid PRIMARY KEY,sales_order_id bigint,order_no text,event_type text,
      from_status text,to_status text,actor_user_id text,actor_name text,actor_type text,reason_code text,comment text,source_endpoint text,
      source_module text,source_ref_type text,source_ref_id text,source_ref_no text,request_id text,metadata jsonb,occurred_at timestamptz);
    ALTER TABLE sal_store_sales ADD COLUMN company_code text,ADD COLUMN store_code text,ADD COLUMN store_name text,
      ADD COLUMN customer_code text,ADD COLUMN currency_code text,ADD COLUMN total_amount numeric,ADD COLUMN payment_status text,
      ADD COLUMN paid_amount numeric,ADD COLUMN receivable_amount numeric,ADD COLUMN cash_account_id bigint,
      ADD COLUMN completed_at timestamptz,ADD COLUMN idempotency_key text UNIQUE,ADD COLUMN warehouse_code text,
      ADD COLUMN shift_closing_id bigint,ADD COLUMN price_drift_status text;
    ALTER TABLE sal_store_sale_items ADD COLUMN product_code text,ADD COLUMN product_name text,ADD COLUMN grade_code text,
      ADD COLUMN packaging_spec text,ADD COLUMN quantity_snapshot jsonb,ADD COLUMN sku_code text,ADD COLUMN qty numeric,
      ADD COLUMN unit_price numeric,ADD COLUMN amount numeric,ADD COLUMN sort_order int,
      ADD COLUMN price_item_id bigint,ADD COLUMN price_publish_version int;
    CREATE SEQUENCE fixture_store_allocation_id;
    ALTER TABLE store_sale_allocations ALTER COLUMN id SET DEFAULT nextval('fixture_store_allocation_id'),
      ALTER COLUMN returned_qty SET DEFAULT 0,ADD COLUMN warehouse_code text;
    CREATE TABLE store_master(id bigint PRIMARY KEY,store_code text,store_name text,company_code text,status text,
      timezone text DEFAULT 'Asia/Singapore',business_day_cutoff time DEFAULT '00:00');
    CREATE TABLE mst_stores(store_code text PRIMARY KEY,store_name text,store_name_en text,store_name_lo text);
    CREATE TABLE store_memberships(id bigserial PRIMARY KEY,store_id bigint,user_id bigint,role text,status text,effective_from timestamptz,effective_to timestamptz);
    CREATE TABLE store_warehouse_bindings(id bigserial PRIMARY KEY,store_id bigint,warehouse_code text,purpose text,status text,
      priority int DEFAULT 1,effective_from timestamptz,effective_to timestamptz);
    CREATE TABLE sal_store_shift_closings(id bigint PRIMARY KEY,store_code text,company_code text,status text,opened_at timestamptz DEFAULT now());
    CREATE TABLE sal_store_price_drift_events(id bigserial PRIMARY KEY,sale_id bigint,sale_item_id bigint,snapshot_price_item_id bigint,
      current_price_item_id bigint,snapshot_unit_price numeric,current_unit_price numeric,snapshot_publish_version int,current_publish_version int,
      event_type text,UNIQUE(sale_id,sale_item_id));
    CREATE TABLE sal_store_sale_tenders(id bigserial PRIMARY KEY,sale_id bigint,tender_type text,currency_code text,amount numeric,
      external_reference text,cash_account_id bigint,ar_invoice_id bigint);
    ALTER TABLE fin_cash_accounts ADD COLUMN id bigint,ADD COLUMN account_code text,ADD COLUMN account_name text,
      ADD COLUMN currency_code text,ADD COLUMN updated_at timestamptz DEFAULT now();
    CREATE SEQUENCE seq_store_sale_no;
    CREATE TABLE fin_cash_transactions(id bigserial PRIMARY KEY,txn_no text,account_id bigint,account_code text,account_name text,
      company_code text,direction text,source_type text,source_id bigint,source_no text,currency_code text,amount numeric,
      balance_after numeric,remark text,created_by text);
    CREATE TABLE sal_price_books(id bigint PRIMARY KEY,price_book_no text,company_code text,status text,priority int,
      store_code text,customer_code text,channel_code text,publish_version int,effective_from date,effective_to date);
    CREATE TABLE sal_price_items(id bigint PRIMARY KEY,price_book_id bigint,sku_code text,product_code text,grade_code text,
      grade_code_std text,spec_code text,packaging_spec text,status text,quantity_snapshot jsonb,unit_price numeric,
      floor_price numeric,ceiling_price numeric,currency_code text,min_qty numeric,max_qty numeric);
  `);
}
export async function resetManagedSalesFixture(db:DataSource){
  await db.query(`TRUNCATE sal_order_lifecycle_events,sal_receipts,sal_drivers,sal_vehicles,sal_order_item_batch_allocation_actions,sal_delivery_orders,sal_delivery_order_items,
    sal_store_sales,sal_store_sale_items,store_sale_allocations,store_master,mst_stores,store_memberships,store_warehouse_bindings,
    sal_store_shift_closings,sal_store_price_drift_events,sal_store_sale_tenders,fin_cash_transactions,sal_price_items,sal_price_books RESTART IDENTITY CASCADE;
    UPDATE wms_warehouses SET owner_store_id=NULL;
    ALTER SEQUENCE fixture_sales_allocation_id RESTART;ALTER SEQUENCE fixture_store_allocation_id RESTART;`);
}
