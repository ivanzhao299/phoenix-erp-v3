import { DataSource } from 'typeorm';

/** Empty downstream SQL contracts for the owned HTTP fixture; real writes are exercised in their dedicated PG suites. */
export async function installEmptyCutoverClosureFixture(db:DataSource){
  await db.query(`
    CREATE TABLE wms_inbound(inbound_no text PRIMARY KEY,status text);
    CREATE TABLE wms_inbound_items(id bigint PRIMARY KEY,inbound_no text,batch_no text);
    CREATE TABLE wms_outbound(outbound_no text PRIMARY KEY,batch_no text,status text);
    CREATE TABLE wms_outbound_items(id bigint PRIMARY KEY,outbound_no text,batch_no text);
    CREATE TABLE wms_transfer(transfer_no text PRIMARY KEY,batch_no text,status text);
    CREATE TABLE wms_transfer_items(id bigint PRIMARY KEY,transfer_no text,source_batch_no text,target_batch_no text,
      expected_qty numeric,in_transit_qty numeric,received_qty numeric,damaged_qty numeric);
    CREATE TABLE wms_stocktake(id bigint PRIMARY KEY,batch_no text,item text,status text);
    CREATE TABLE wms_defect_dispositions(id bigint PRIMARY KEY,batch_no text,target_batch_no text,status text);
    CREATE TABLE sal_order_item_batch_allocations(id bigint PRIMARY KEY,sales_order_item_id bigint,batch_no text,
      reserved_qty numeric,outbound_qty numeric,released_qty numeric);
    CREATE TABLE store_sale_allocations(id bigint PRIMARY KEY,sale_id bigint,sale_item_id bigint,batch_no text,allocated_qty numeric,returned_qty numeric);
    CREATE TABLE sal_store_sale_items(id bigint PRIMARY KEY,sale_id bigint,batch_no text);
    CREATE TABLE pos_sale_items(id bigint PRIMARY KEY,sale_id bigint,batch_no text);
    CREATE TABLE qa_non_conformance(id bigint PRIMARY KEY,batch_no text,status text);
    CREATE TABLE qa_inspections(id bigint PRIMARY KEY,status text,items_json jsonb,fail_items_json jsonb);
    CREATE TABLE lbl_records(id bigint PRIMARY KEY,batch_no text);
    CREATE TABLE pkg_tasks(id bigint PRIMARY KEY,batch_no text);
    CREATE TABLE brd_vaccinations(id bigint PRIMARY KEY,inventory_batch_no text,batch_no text);
    CREATE TABLE brd_vaccination_issue_lines(id bigint PRIMARY KEY,inventory_batch_no text);
    ALTER TABLE brd_medication_records ADD COLUMN inventory_batch_no text,ADD COLUMN batch_no text;
    CREATE TABLE brd_medication_issue_lines(id bigint PRIMARY KEY,inventory_batch_no text);
    CREATE TABLE sal_order_items(id bigint PRIMARY KEY,sales_order_id bigint,allocated_batch_no text);
    CREATE TABLE sal_sales_orders(id bigint PRIMARY KEY,order_no text,status text);
    CREATE TABLE sal_return_items(id bigint PRIMARY KEY,return_order_id bigint,sales_order_item_id bigint,restock_status text);
    CREATE TABLE sal_return_orders(id bigint PRIMARY KEY,return_no text,status text);
    CREATE TABLE sal_store_sales(id bigint PRIMARY KEY,sale_no text,status text);
    CREATE TABLE chanjet_voucher_drafts(id bigint PRIMARY KEY,status text,company_code text,source_doc_type text,source_doc_id text,raw_data jsonb);
    CREATE TABLE chanjet_writeback_outbox(id bigint PRIMARY KEY,draft_id bigint REFERENCES chanjet_voucher_drafts(id),status text);
  `);
}
