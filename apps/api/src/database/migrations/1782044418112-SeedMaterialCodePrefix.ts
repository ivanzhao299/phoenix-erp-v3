import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: 注册物料快建所需 MAT 编码前缀，修复采购新增物料 codeGen.next('MAT') 缺前缀导致 500
 */
export class SeedMaterialCodePrefix1782044418112 implements MigrationInterface {
  name = 'SeedMaterialCodePrefix1782044418112';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO mst_code_seq (prefix, current_no, pad_len, remark)
      VALUES ('MAT', 0, 5, '物料编码')
      ON CONFLICT (prefix) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM mst_code_seq
       WHERE prefix = 'MAT'
         AND current_no = 0
         AND NOT EXISTS (
           SELECT 1 FROM mst_materials WHERE material_code LIKE 'MAT-%' LIMIT 1
         )
    `);
  }
}
