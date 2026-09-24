#!/usr/bin/env bash
set -Eeuo pipefail

psql -X -v ON_ERROR_STOP=1 <<'SQL'
DROP TABLE IF EXISTS prc_purchase_requests, wms_stocktake, wms_inbound, acc_ledger, wms_warehouses CASCADE;
CREATE TABLE prc_purchase_requests (id bigserial, req_no varchar(64));
INSERT INTO prc_purchase_requests(req_no) VALUES ('REQ-OK'), ('REQ-DUP'), ('REQ-DUP'), (NULL), ('');
CREATE TABLE wms_stocktake (id bigserial, status varchar(32));
INSERT INTO wms_stocktake(status) VALUES ('PENDING'), ('APPROVED'), (repeat('X', 21));
CREATE TABLE wms_inbound (id bigserial, created_at timestamp DEFAULT CURRENT_TIMESTAMP, updated_at timestamp DEFAULT CURRENT_TIMESTAMP);
INSERT INTO wms_inbound(created_at, updated_at)
VALUES (CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
       (CURRENT_TIMESTAMP, CURRENT_TIMESTAMP + interval '1 hour');
CREATE TABLE acc_ledger (id bigserial, store_code varchar(32));
INSERT INTO acc_ledger(store_code) VALUES ('STORE-1'), (NULL);
CREATE TABLE wms_warehouses (id bigserial, warehouse_code varchar(32) UNIQUE);
INSERT INTO wms_warehouses(warehouse_code) VALUES ('WH-1'), (NULL);
SQL

report="$(psql -X -v ON_ERROR_STOP=1 -At -c "$(cat scripts/ci/production-schema-data-safety-audit.sql)")"
test -n "$report"
node - "$report" <<'NODE'
const report = JSON.parse(process.argv[2]);
const req = report.prc_purchase_requests;
const stock = report.wms_stocktake;
if (req.null_count !== 1 || req.blank_count !== 1 || req.duplicate_group_count !== 1 || req.over_64_count !== 0) process.exit(1);
if (req.not_null_safe !== false || req.uniqueness_safe !== false || req.length_safe !== true) process.exit(1);
if (stock.over_20_count !== 1 || stock.distinct_count !== 3 || stock.length_safe !== false) process.exit(1);
if (report.wms_inbound_created_at.type !== 'timestamp without time zone') process.exit(1);
const inbound = report.wms_inbound;
if (inbound.updated_at_null_count !== 0 || inbound.updated_before_created_count !== 0 || inbound.updated_equals_created_count !== 1 || inbound.updated_after_created_count !== 1) process.exit(1);
if (report.wms_inbound_updated_at.type !== 'timestamp without time zone' || report.wms_inbound_updated_at.default !== 'CURRENT_TIMESTAMP') process.exit(1);
if (report.acc_ledger.max_length !== 7) process.exit(1);
if (report.wms_warehouses.duplicate_count !== 0) process.exit(1);
console.log('POSTGRES16_DATA_SAFETY_FIXTURE=PASS');
console.log('UPDATED_AT_FIXTURE=PASS');
console.log('UNSAFE_CONDITIONS_DETECTED=PASS');
NODE
