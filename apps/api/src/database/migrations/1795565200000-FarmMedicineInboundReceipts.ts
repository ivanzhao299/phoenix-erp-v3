import { MigrationInterface, QueryRunner } from 'typeorm';

export class FarmMedicineInboundReceipts1795565200000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE farm_medicine_inbound_receipts (
        request_key uuid PRIMARY KEY,
        actor text NOT NULL,
        request_hash text NOT NULL,
        receipt jsonb NOT NULL
      )`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        LOCK TABLE farm_medicine_inbound_receipts IN ACCESS EXCLUSIVE MODE;
        IF EXISTS (SELECT 1 FROM farm_medicine_inbound_receipts) THEN
          RAISE EXCEPTION 'Cannot discard committed medicine inbound receipts';
        END IF;
      END $$`);
    await queryRunner.query('DROP TABLE farm_medicine_inbound_receipts');
  }
}
