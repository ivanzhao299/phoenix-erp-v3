import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Align BRD_FLOCK_STATUS with the five lifecycle states used by flock editing.
 * sys_dict is configuration data and is explicitly permitted in TS migrations.
 */
export class AlignBrdFlockStatusDictionary1787551200000 implements MigrationInterface {
  name = 'AlignBrdFlockStatusDictionary1787551200000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE brd_flocks ALTER COLUMN status SET DEFAULT 'GROWING'
    `);
    await queryRunner.query(`
      UPDATE sys_dict
         SET status = 'ARCHIVED', updated_at = NOW()
       WHERE dict_type = 'BRD_FLOCK_STATUS'
         AND dict_code IN ('ACTIVE', 'BROODING', 'CULLING', 'INACTIVE', 'PULLET', 'MOLTING', 'CULLED', 'SOLD')
    `);
    await queryRunner.query(`
      INSERT INTO sys_dict
        (dict_type, dict_code, dict_label_zh, dict_label_lo, dict_label_en, dict_value, sort_no, status, name)
      VALUES
        ('BRD_FLOCK_STATUS', 'GROWING',    '育成期',     '', 'Growing',    'GROWING',    10, 'ACTIVE', '鸡群状态'),
        ('BRD_FLOCK_STATUS', 'LAYING',     '产蛋期',     '', 'Laying',     'LAYING',     20, 'ACTIVE', '鸡群状态'),
        ('BRD_FLOCK_STATUS', 'PEAK',       '产蛋高峰期', '', 'Peak',       'PEAK',       30, 'ACTIVE', '鸡群状态'),
        ('BRD_FLOCK_STATUS', 'DECLINING',  '产蛋下降期', '', 'Declining',  'DECLINING',  40, 'ACTIVE', '鸡群状态'),
        ('BRD_FLOCK_STATUS', 'RETIRED',    '已退役',     '', 'Retired',    'RETIRED',    50, 'ACTIVE', '鸡群状态')
      ON CONFLICT (dict_type, dict_code) DO UPDATE SET -- sys_dict upsert
        dict_label_zh = EXCLUDED.dict_label_zh,
        dict_label_lo = EXCLUDED.dict_label_lo,
        dict_label_en = EXCLUDED.dict_label_en,
        dict_value = EXCLUDED.dict_value,
        sort_no = EXCLUDED.sort_no,
        status = 'ACTIVE',
        name = EXCLUDED.name,
        updated_at = NOW()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE brd_flocks ALTER COLUMN status SET DEFAULT 'ACTIVE'
    `);
    await queryRunner.query(`
      UPDATE sys_dict
         SET status = 'ARCHIVED', updated_at = NOW()
       WHERE dict_type = 'BRD_FLOCK_STATUS'
         AND dict_code IN ('PEAK', 'DECLINING', 'RETIRED')
    `);
    await queryRunner.query(`
      INSERT INTO sys_dict
        (dict_type, dict_code, dict_label_zh, dict_label_lo, dict_label_en, dict_value, sort_no, status, name)
      VALUES
        ('BRD_FLOCK_STATUS', 'ACTIVE',   '在产',   '', 'Active',   'ACTIVE',   10, 'ACTIVE', '鸡群状态'),
        ('BRD_FLOCK_STATUS', 'LAYING',   '产蛋中', '', 'Laying',   'LAYING',   20, 'ACTIVE', '鸡群状态'),
        ('BRD_FLOCK_STATUS', 'BROODING', '育雏期', '', 'Brooding', 'BROODING', 30, 'ACTIVE', '鸡群状态'),
        ('BRD_FLOCK_STATUS', 'GROWING',  '育成期', '', 'Growing',  'GROWING',  40, 'ACTIVE', '鸡群状态'),
        ('BRD_FLOCK_STATUS', 'CULLING',  '淘汰期', '', 'Culling',  'CULLING',  50, 'ACTIVE', '鸡群状态'),
        ('BRD_FLOCK_STATUS', 'INACTIVE', '已停产', '', 'Inactive', 'INACTIVE', 90, 'ACTIVE', '鸡群状态')
      ON CONFLICT (dict_type, dict_code) DO UPDATE SET -- sys_dict upsert
        dict_label_zh = EXCLUDED.dict_label_zh,
        dict_label_lo = EXCLUDED.dict_label_lo,
        dict_label_en = EXCLUDED.dict_label_en,
        dict_value = EXCLUDED.dict_value,
        sort_no = EXCLUDED.sort_no,
        status = 'ACTIVE',
        name = EXCLUDED.name,
        updated_at = NOW()
    `);
  }
}
