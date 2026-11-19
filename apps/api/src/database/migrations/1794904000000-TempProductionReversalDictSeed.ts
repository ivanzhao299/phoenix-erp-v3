import { MigrationInterface, QueryRunner } from 'typeorm';

/** Tool dictionary only. Never changes stock, daily reports or historical ledgers. */
export class TempProductionReversalDictSeed1794904000000 implements MigrationInterface {
  private readonly marker = 'TempProductionReversalDictSeed1794904000000';
  async up(q: QueryRunner): Promise<void> {
    if (!await q.hasTable('sys_dict') || !await q.hasTable('typeorm_metadata')) throw new Error('TEMP_REVERSAL_DICT_HOLD: required tool tables absent');
    const inserted = await q.query(`INSERT INTO sys_dict
      (dict_type,dict_code,dict_label_zh,dict_label_en,dict_value,sort_no,status)
      VALUES('INV_LEDGER_CHANGE_TYPE','TEMP_PRODUCTION_REVERSAL','误入库冲销','Erroneous production inbound reversal','TEMP_PRODUCTION_REVERSAL',175,'ACTIVE')
      ON CONFLICT(dict_type,dict_code) DO NOTHING RETURNING dict_code`);
    const rows = await q.query(`SELECT 1 FROM sys_dict WHERE dict_type='INV_LEDGER_CHANGE_TYPE'
      AND dict_code='TEMP_PRODUCTION_REVERSAL' AND dict_value='TEMP_PRODUCTION_REVERSAL'
      AND dict_label_zh='误入库冲销' AND dict_label_en='Erroneous production inbound reversal' AND status='ACTIVE'`);
    if (rows.length !== 1) throw new Error('TEMP_REVERSAL_DICT_HOLD: existing dictionary semantics require review');
    if (inserted.length) await q.query(`INSERT INTO typeorm_metadata("type","table","name","value")
      VALUES('TEMP_REVERSAL_DICT','sys_dict',$1,'TEMP_PRODUCTION_REVERSAL')`, [this.marker]);
  }
  async down(q: QueryRunner): Promise<void> {
    const owned = await q.query(`SELECT 1 FROM typeorm_metadata WHERE "type"='TEMP_REVERSAL_DICT'
      AND "table"='sys_dict' AND "name"=$1 AND "value"='TEMP_PRODUCTION_REVERSAL'`, [this.marker]);
    if (!owned.length) return;
    if ((await q.query("SELECT 1 FROM inv_ledger WHERE change_type='TEMP_PRODUCTION_REVERSAL' LIMIT 1")).length) {
      throw new Error('TEMP_REVERSAL_DICT_DOWN_HOLD: immutable correction ledger exists; use forward recovery');
    }
    const deleted = await q.query(`WITH deleted AS (DELETE FROM sys_dict WHERE dict_type='INV_LEDGER_CHANGE_TYPE'
      AND dict_code='TEMP_PRODUCTION_REVERSAL' AND dict_value='TEMP_PRODUCTION_REVERSAL'
      AND dict_label_zh='误入库冲销' AND dict_label_en='Erroneous production inbound reversal'
      AND status='ACTIVE' RETURNING dict_code) SELECT dict_code FROM deleted`);
    if (deleted.length !== 1) throw new Error('TEMP_REVERSAL_DICT_DOWN_HOLD: dictionary changed after creation');
    await q.query(`DELETE FROM typeorm_metadata WHERE "type"='TEMP_REVERSAL_DICT' AND "name"=$1`, [this.marker]);
  }
}
