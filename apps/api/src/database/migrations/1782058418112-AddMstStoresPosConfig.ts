import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * POS-P0-1:给 mst_stores 加 pos_config jsonb 列(修配置黑洞)。
 * 根因:/settings/pos-config 页 PUT /api/crud/mst_stores ... pos_config,但 mst_stores 从未建过
 *   pos_config 列(v3_schema_complete 仅 9 列)→ 配置写不进(静默失败/500),收银配置形同虚设。
 * 修法:幂等加列;前端/收银台后续读此列生效 打印模式/税率/币种/日结时间/小票底文。
 */
export class AddMstStoresPosConfig1782058418112 implements MigrationInterface {
  name = 'AddMstStoresPosConfig1782058418112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE mst_stores ADD COLUMN IF NOT EXISTS pos_config jsonb`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE mst_stores DROP COLUMN IF EXISTS pos_config`);
  }
}
