import {MigrationInterface,QueryRunner} from 'typeorm';

/** Approved report amendments preserve the original and replacement in immutable documents. */
export class FlockReportCorrection1794903000000 implements MigrationInterface {
  private readonly kinds="'BASELINE','ADMIT','MORTALITY','CULL','SELL_HELD','TRANSFER','ADJUST','REVERSE','CLOSE','CLEAN_START','CLEAN_ACCEPT','HISTORY_AUTH'";
  async up(q:QueryRunner):Promise<void>{
    await q.query('ALTER TABLE brd_flock_documents DROP CONSTRAINT IF EXISTS brd_flock_documents_kind_check');
    await q.query(`ALTER TABLE brd_flock_documents ADD CONSTRAINT brd_flock_documents_kind_check CHECK(kind IN (${this.kinds},'REPORT_CORRECTION'))`);
    await q.query(`INSERT INTO sys_dict(dict_type,dict_code,dict_label_zh,dict_label_en,sort_no,status) VALUES('BRD_LIFECYCLE_KIND','REPORT_CORRECTION','历史日报更正与补录','Historical report correction and supplement',130,'ACTIVE') ON CONFLICT(dict_type,dict_code) DO NOTHING`);
    await q.query(`INSERT INTO sys_dict(dict_type,dict_code,dict_label_zh,dict_label_en,sort_no,status) VALUES('BRD_FINAL_PRODUCTION_CONFIRM','REPORTED','已确认当日DAILY日报','Final daily report confirmed',1,'ACTIVE'),('BRD_FINAL_PRODUCTION_CONFIRM','CONFIRMED_ZERO','当日零产蛋实测签认','Signed actual zero production',2,'ACTIVE') ON CONFLICT(dict_type,dict_code) DO NOTHING`);
  }
  async down(q:QueryRunner):Promise<void>{
    if((await q.query("SELECT 1 FROM brd_flock_documents WHERE kind='REPORT_CORRECTION' LIMIT 1")).length)throw new Error('FLOCK_REPORT_CORRECTION_DOWN_HOLD: immutable business documents exist; use forward recovery');
    await q.query('ALTER TABLE brd_flock_documents DROP CONSTRAINT IF EXISTS brd_flock_documents_kind_check');
    await q.query(`ALTER TABLE brd_flock_documents ADD CONSTRAINT brd_flock_documents_kind_check CHECK(kind IN (${this.kinds}))`);
    await q.query("DELETE FROM sys_dict WHERE dict_type='BRD_FINAL_PRODUCTION_CONFIRM' AND dict_code IN ('REPORTED','CONFIRMED_ZERO')");
    await q.query("DELETE FROM sys_dict WHERE dict_type='BRD_LIFECYCLE_KIND' AND dict_code='REPORT_CORRECTION'");
  }
}
