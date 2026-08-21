import { MigrationInterface, QueryRunner } from 'typeorm';

export class AllowNullSysUserStoreCode1787299200000 implements MigrationInterface {
  name = 'AllowNullSysUserStoreCode1787299200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE sys_user ALTER COLUMN store_code DROP NOT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE sys_user ALTER COLUMN store_code SET NOT NULL',
    );
  }
}
