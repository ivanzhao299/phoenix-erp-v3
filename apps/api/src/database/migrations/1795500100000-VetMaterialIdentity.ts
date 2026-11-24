import { MigrationInterface, QueryRunner } from 'typeorm';

const sources = [
  ['brd_vaccinations','vaccine_code'], ['brd_vaccination_issue_lines','vaccine_code'],
  ['brd_medication_records','medication_code'], ['brd_medication_issue_lines','medication_code'],
] as const;

export class VetMaterialIdentity1795500100000 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE mst_materials ADD COLUMN vet_kind varchar(24),
      ADD COLUMN vet_withdraw_days integer CHECK (vet_withdraw_days>=0),
      ADD CONSTRAINT ck_vet_material_kind CHECK (vet_kind IS NULL OR
        (material_type IS NOT DISTINCT FROM 'VET_DRUG' AND vet_kind IN ('VACCINE','MEDICATION','DISINFECTANT','SUPPLEMENT')))`);
    await queryRunner.query(`INSERT INTO sys_dict(dict_type,dict_code,dict_label_zh,dict_label_en,sort_no,status)
      VALUES ('BRD_VET_MATERIAL_KIND','VACCINE','疫苗','Vaccine',1,'ACTIVE'),
      ('BRD_VET_MATERIAL_KIND','MEDICATION','治疗用药','Medication',2,'ACTIVE'),
      ('BRD_VET_MATERIAL_KIND','DISINFECTANT','消毒剂','Disinfectant',3,'ACTIVE'),
      ('BRD_VET_MATERIAL_KIND','SUPPLEMENT','营养补充剂','Supplement',4,'ACTIVE')
      ON CONFLICT(dict_type,dict_code) DO NOTHING`);
    // G91's documented material identities classify existing stock without attaching a MED code.
    // A changed code/name pair is left for the material steward to classify.
    await queryRunner.query(`CREATE VIEW brd_vet_material_catalog AS SELECT mat.material_code,mat.material_name,mat.unit,mat.status,mat.vet_withdraw_days,
      COALESCE(mat.vet_kind, CASE
        WHEN mat.material_code='MAT-VET-NDV' AND mat.material_name='新城疫疫苗' THEN 'VACCINE' WHEN mat.material_code='MAT-VET-AI' AND mat.material_name='禽流感疫苗' THEN 'VACCINE'
        WHEN mat.material_code='MAT-VET-IB' AND mat.material_name='传支疫苗' THEN 'VACCINE' WHEN mat.material_code='MAT-VET-DEWORM' AND mat.material_name='驱虫药' THEN 'MEDICATION'
        WHEN mat.material_code='MAT-VET-DISINFECT' AND mat.material_name='消毒液' THEN 'DISINFECTANT' WHEN mat.material_code='MAT-VET-VITAMIN' AND mat.material_name='多维电解质' THEN 'SUPPLEMENT'
      END) AS effective_vet_kind FROM mst_materials mat WHERE mat.material_type='VET_DRUG'`);
    for (const [table, legacy] of sources) {
      const [{is_nullable}] = await queryRunner.query(`SELECT is_nullable FROM information_schema.columns
        WHERE table_schema=current_schema() AND table_name=$1 AND column_name=$2`, [table,legacy]);
      await queryRunner.query(`ALTER TABLE ${table} ADD COLUMN material_code varchar(64) REFERENCES mst_materials(material_code)`);
      if (is_nullable === 'NO') {
        await queryRunner.query(`ALTER TABLE ${table} ADD CONSTRAINT ck_${table}_identity CHECK (${legacy} IS NOT NULL OR material_code IS NOT NULL)`);
      }
    }
    await queryRunner.query('ALTER TABLE brd_vaccinations ALTER COLUMN vaccine_code DROP NOT NULL');
    await queryRunner.query('ALTER TABLE brd_vaccination_issue_lines ALTER COLUMN vaccine_code DROP NOT NULL');
    await queryRunner.query('ALTER TABLE brd_medication_records ALTER COLUMN medication_code DROP NOT NULL');
    await queryRunner.query('ALTER TABLE brd_medication_issue_lines ALTER COLUMN medication_code DROP NOT NULL');
    await queryRunner.query(`CREATE UNIQUE INDEX uq_brd_vaccinations_material_plan ON brd_vaccinations(site_code,flock_no,plan_date,material_code)
      WHERE material_code IS NOT NULL AND vaccine_code IS NULL`);
    await queryRunner.query('ALTER TABLE brd_medication_records ADD COLUMN material_name varchar(200)');
    await queryRunner.query('ALTER TABLE brd_vaccinations ADD COLUMN stock_unit varchar(32), ADD COLUMN executed_material_name varchar(200)');
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const [classified] = await queryRunner.query('SELECT 1 FROM mst_materials WHERE vet_kind IS NOT NULL OR vet_withdraw_days IS NOT NULL LIMIT 1');
    if (classified) throw new Error('物料已有兽药分类或休药天数，请先保留配置再回滚迁移');
    for (const [table,legacy] of sources) {
      const [used] = await queryRunner.query(`SELECT 1 FROM ${table} WHERE material_code IS NOT NULL LIMIT 1`);
      if (used) throw new Error('已有实际物料登记，请先保留其身份再回滚迁移');
      const [required] = await queryRunner.query("SELECT 1 FROM pg_constraint WHERE conrelid=to_regclass($1) AND conname=$2",
        [table,'ck_'+table+'_identity']);
      if (required) await queryRunner.query(`ALTER TABLE ${table} ALTER COLUMN ${legacy} SET NOT NULL`);
      await queryRunner.query(`ALTER TABLE ${table} DROP COLUMN material_code`);
    }
    await queryRunner.query('ALTER TABLE brd_medication_records DROP COLUMN material_name');
    await queryRunner.query('ALTER TABLE brd_vaccinations DROP COLUMN stock_unit, DROP COLUMN executed_material_name');
    await queryRunner.query('DROP VIEW brd_vet_material_catalog');
    await queryRunner.query('ALTER TABLE mst_materials DROP COLUMN vet_kind, DROP COLUMN vet_withdraw_days');
    await queryRunner.query("DELETE FROM sys_dict WHERE dict_type='BRD_VET_MATERIAL_KIND' AND dict_code IN ('VACCINE','MEDICATION','DISINFECTANT','SUPPLEMENT')");
  }
}
