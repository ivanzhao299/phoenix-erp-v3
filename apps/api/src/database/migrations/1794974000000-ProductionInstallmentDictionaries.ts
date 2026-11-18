import { MigrationInterface, QueryRunner } from 'typeorm';

export class ProductionInstallmentDictionaries1794974000000 implements MigrationInterface {
  private readonly entries=[
    ['INV_LEDGER_CHANGE_TYPE','PRODUCTION_INBOUND_REVERSAL','正式生产入库冲销','Formal production inbound reversal'],
    ['PRODUCTION_REPORT_SHIFT','DAILY','全日汇总','Daily total'],
    ['PRODUCTION_REPORT_SHIFT','AM','早班','Morning shift'],
    ['PRODUCTION_REPORT_SHIFT','PM','晚班','Afternoon shift'],
    ['PRODUCTION_INBOUND_DOCUMENT_STATE','DRAFT','草稿','Draft'],
    ['PRODUCTION_INBOUND_DOCUMENT_STATE','READY','待过账','Ready'],
    ['PRODUCTION_INBOUND_DOCUMENT_STATE','APPROVED','已审核','Approved'],
    ['PRODUCTION_INBOUND_DOCUMENT_STATE','POSTED','已过账','Posted'],
    ['PRODUCTION_INBOUND_DOCUMENT_STATE','CANCELLED','已取消','Cancelled'],
    ['PRODUCTION_INBOUND_KIND','INBOUND','生产交库','Production handover'],
    ['PRODUCTION_INBOUND_KIND','REVERSAL','原单冲销','Original posting reversal'],
    ['PRODUCTION_HANDOVER_STATE','DRAFT','待接收确认','Awaiting receiver'],
    ['PRODUCTION_HANDOVER_STATE','CONFIRMED','已双方签认','Signed by both parties'],
    ['PRODUCTION_HANDOVER_STATE','CANCELLED','已废止','Cancelled'],
    ['PRODUCTION_COST_STATUS','UNKNOWN','成本待确认','Cost pending'],
    ['PRODUCTION_COST_STATUS','CONFIRMED','成本已确认','Cost confirmed'],
    ['PRODUCTION_POSTING_PERIOD_STATE','OPEN','开放','Open'],
    ['PRODUCTION_POSTING_PERIOD_STATE','CLOSED','已关闭','Closed'],
  ];
  async up(q: QueryRunner): Promise<void> {
    for(const [index,[type,code,zh,en]] of this.entries.entries()) {
      const inserted=await q.query(`INSERT INTO sys_dict(dict_type,dict_code,dict_value,dict_label_zh,dict_label_en,sort_no,status)
        VALUES($1,$2,$2,$3,$4,$5,'ACTIVE') ON CONFLICT(dict_type,dict_code) DO NOTHING RETURNING dict_code`,[type,code,zh,en,180+index]);
      if(!(await q.query("SELECT 1 FROM sys_dict WHERE dict_type=$1 AND dict_code=$2 AND dict_value=$2 AND status='ACTIVE'",[type,code])).length)throw new Error('PRODUCTION_DICTIONARY_SEMANTICS_HOLD');
      if(inserted.length)await q.query(`INSERT INTO typeorm_metadata("type","table","name","value")
        VALUES('PRODUCTION_INSTALLMENT_DICT','sys_dict',$1,$2)`,[type,code]);
    }
  }
  async down(q: QueryRunner): Promise<void> {
    for(const table of ['production_inbound_documents','production_physical_handovers','production_cutover_scopes']) {
      if((await q.query(`SELECT 1 FROM ${table} LIMIT 1`)).length)throw new Error('PRODUCTION_DICTIONARY_DOWN_HOLD: signed scope or facts exist');
    }
    for(const [type,code,zh,en] of this.entries) {
      const owned=await q.query(`SELECT 1 FROM typeorm_metadata WHERE "type"='PRODUCTION_INSTALLMENT_DICT' AND "name"=$1 AND "value"=$2`,[type,code]);
      if(!owned.length)continue;
      await q.query(`DELETE FROM sys_dict WHERE dict_type=$1 AND dict_code=$2 AND dict_label_zh=$3 AND dict_label_en=$4 AND dict_value=$2`,[type,code,zh,en]);
      await q.query(`DELETE FROM typeorm_metadata WHERE "type"='PRODUCTION_INSTALLMENT_DICT' AND "name"=$1 AND "value"=$2`,[type,code]);
    }
  }
}
