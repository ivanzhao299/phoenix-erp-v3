/**
 * @allow-data-dml: rebuild open sales-order batch allocations from the original per-batch RESERVED ledger; fail closed on ambiguous outbound history
 */
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSalesOrderBatchAllocations1788408000000 implements MigrationInterface {
  name = 'AddSalesOrderBatchAllocations1788408000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sal_order_item_batch_allocations (
        id BIGSERIAL PRIMARY KEY,
        sales_order_item_id BIGINT NOT NULL REFERENCES sal_order_items(id) ON DELETE CASCADE,
        batch_no VARCHAR(64) NOT NULL REFERENCES inv_batches(batch_no) ON DELETE RESTRICT,
        reserved_qty NUMERIC(18,2) NOT NULL,
        outbound_qty NUMERIC(18,2) NOT NULL DEFAULT 0,
        released_qty NUMERIC(18,2) NOT NULL DEFAULT 0,
        reservation_ledger_id INTEGER NOT NULL UNIQUE REFERENCES inv_ledger(id) ON DELETE RESTRICT,
        created_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_sal_item_batch_allocation UNIQUE (sales_order_item_id,batch_no),
        CONSTRAINT ck_sal_item_batch_allocation_qty CHECK
          (reserved_qty > 0 AND outbound_qty >= 0 AND released_qty >= 0
           AND outbound_qty + released_qty <= reserved_qty)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_sal_item_batch_allocation_item ON sal_order_item_batch_allocations(sales_order_item_id)`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_sal_item_batch_allocation_batch ON sal_order_item_batch_allocations(batch_no)`);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS sal_order_item_batch_allocation_actions (
        id BIGSERIAL PRIMARY KEY,
        allocation_id BIGINT NOT NULL REFERENCES sal_order_item_batch_allocations(id) ON DELETE RESTRICT,
        sales_order_id BIGINT NOT NULL REFERENCES sal_sales_orders(id) ON DELETE RESTRICT,
        delivery_order_id BIGINT REFERENCES sal_delivery_orders(id) ON DELETE RESTRICT,
        action_type VARCHAR(16) NOT NULL,
        action_key VARCHAR(120) NOT NULL,
        qty NUMERIC(18,2) NOT NULL,
        ledger_id INTEGER NOT NULL UNIQUE REFERENCES inv_ledger(id) ON DELETE RESTRICT,
        created_by VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_sal_batch_alloc_action_key UNIQUE
          (allocation_id,action_type,action_key),
        CONSTRAINT ck_sal_batch_alloc_action_type CHECK (action_type IN ('OUTBOUND','RELEASED')),
        CONSTRAINT ck_sal_batch_alloc_action_qty CHECK (qty > 0)
      )
    `);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS idx_sal_batch_alloc_action_allocation ON sal_order_item_batch_allocation_actions(allocation_id)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS uq_sal_batch_alloc_outbound_fact
      ON sal_order_item_batch_allocation_actions(delivery_order_id,sales_order_id,allocation_id)
      WHERE action_type='OUTBOUND' AND delivery_order_id IS NOT NULL`);

    await queryRunner.query(`
      DO $$
      DECLARE duplicate_count BIGINT;
      BEGIN
        SELECT COUNT(*) INTO duplicate_count FROM (
          SELECT oi.id,l.batch_no
          FROM sal_sales_orders so
          JOIN sal_order_items oi ON oi.sales_order_id=so.id
          JOIN inv_ledger l ON l.ref_no=so.order_no AND l.change_type='RESERVED' AND l.qty_change<0
            AND substring(l.note FROM '明细 ([0-9]+)')::bigint=oi.id
          WHERE so.status IN ('APPROVED','ALLOCATED','PICKED','LOADED','SHIPPED','DELIVERED')
          GROUP BY oi.id,l.batch_no HAVING COUNT(*)<>1
        ) duplicate_reservations;
        IF duplicate_count<>0 THEN
          RAISE EXCEPTION 'duplicate historical RESERVED allocation facts: % groups require manual repair',duplicate_count;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      INSERT INTO sal_order_item_batch_allocations
        (sales_order_item_id,batch_no,reserved_qty,reservation_ledger_id,created_by,created_at,updated_at)
      SELECT oi.id,l.batch_no,-l.qty_change,l.id,'MIGRATION',l.created_at,NOW()
      FROM sal_sales_orders so
      JOIN sal_order_items oi ON oi.sales_order_id=so.id
      JOIN inv_ledger l
        ON l.ref_no=so.order_no
       AND l.change_type='RESERVED'
       AND l.qty_change<0
       AND substring(l.note FROM '明细 ([0-9]+)')::bigint=oi.id
      JOIN inv_batches b ON b.batch_no=l.batch_no
      WHERE so.status IN ('APPROVED','ALLOCATED','PICKED','LOADED','SHIPPED','DELIVERED')
      ON CONFLICT (sales_order_item_id,batch_no) DO NOTHING
    `);

    await queryRunner.query(`
      DO $$
      DECLARE mismatch_count BIGINT;
      BEGIN
        SELECT COUNT(*) INTO mismatch_count FROM (
          SELECT oi.id,oi.allocated_qty,COALESCE(SUM(a.reserved_qty),0) AS rebuilt_qty
          FROM sal_sales_orders so
          JOIN sal_order_items oi ON oi.sales_order_id=so.id
          LEFT JOIN sal_order_item_batch_allocations a ON a.sales_order_item_id=oi.id
          WHERE so.status IN ('APPROVED','ALLOCATED','PICKED','LOADED','SHIPPED','DELIVERED')
            AND COALESCE(oi.allocated_qty,0)>0
          GROUP BY oi.id,oi.allocated_qty
          HAVING COALESCE(SUM(a.reserved_qty),0)<>oi.allocated_qty
        ) mismatches;
        IF mismatch_count<>0 THEN
          RAISE EXCEPTION 'historical open allocation rebuild mismatch: % items require manual repair',mismatch_count;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      DO $$
      DECLARE ambiguous_count BIGINT;
      BEGIN
        WITH outbound AS (
          SELECT so.id AS sales_order_id,l.batch_no,SUM(-l.qty_change) AS qty
          FROM inv_ledger l
          JOIN sal_sales_orders so ON so.order_no=substring(l.note FROM 'order=([^ ]+)')
          WHERE l.change_type='FIFO_OUT' AND l.qty_change<0
            AND so.status IN ('APPROVED','ALLOCATED','PICKED','LOADED','SHIPPED','DELIVERED')
          GROUP BY so.id,l.batch_no
        ), candidates AS (
          SELECT o.sales_order_id,o.batch_no,o.qty,COUNT(a.id) AS allocation_count,
                 COALESCE(SUM(a.reserved_qty),0) AS reserved_qty
          FROM outbound o
          LEFT JOIN sal_order_items oi ON oi.sales_order_id=o.sales_order_id
          LEFT JOIN sal_order_item_batch_allocations a
            ON a.sales_order_item_id=oi.id AND a.batch_no=o.batch_no
          GROUP BY o.sales_order_id,o.batch_no,o.qty
        )
        SELECT COUNT(*) INTO ambiguous_count
        FROM candidates WHERE allocation_count<>1 OR qty>reserved_qty;
        IF ambiguous_count<>0 THEN
          RAISE EXCEPTION 'ambiguous historical sales outbound allocations: % groups require manual repair',ambiguous_count;
        END IF;
      END $$
    `);

    await queryRunner.query(`
      WITH outbound AS (
        SELECT so.id AS sales_order_id,l.batch_no,SUM(-l.qty_change) AS qty
        FROM inv_ledger l
        JOIN sal_sales_orders so ON so.order_no=substring(l.note FROM 'order=([^ ]+)')
        WHERE l.change_type='FIFO_OUT' AND l.qty_change<0
          AND so.status IN ('APPROVED','ALLOCATED','PICKED','LOADED','SHIPPED','DELIVERED')
        GROUP BY so.id,l.batch_no
      )
      UPDATE sal_order_item_batch_allocations a SET outbound_qty=o.qty,updated_at=NOW()
      FROM sal_order_items oi,outbound o
      WHERE oi.id=a.sales_order_item_id AND o.sales_order_id=oi.sales_order_id AND o.batch_no=a.batch_no
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS sal_order_item_batch_allocation_actions`);
    await queryRunner.query(`DROP TABLE IF EXISTS sal_order_item_batch_allocations`);
  }
}
