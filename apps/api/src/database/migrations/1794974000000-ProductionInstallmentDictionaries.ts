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
  private readonly lao:Record<string,string>={
    PRODUCTION_INBOUND_REVERSAL:'ກັບລາຍການຮັບໄຂ່',DAILY:'ລວມທັງວັນ',AM:'ກະເຊົ້າ',PM:'ກະແລງ',
    DRAFT:'ສະບັບຮ່າງ',READY:'ລໍຖ້າລົງບັນຊີ',APPROVED:'ອະນຸມັດແລ້ວ',POSTED:'ລົງບັນຊີແລ້ວ',CANCELLED:'ຍົກເລີກແລ້ວ',
    INBOUND:'ຮັບໄຂ່ເຂົ້າສາງ',REVERSAL:'ກັບລາຍການເດີມ',CONFIRMED:'ຢືນຢັນແລ້ວ',UNKNOWN:'ລໍກວດຕົ້ນທຶນ',OPEN:'ເປີດ',CLOSED:'ປິດແລ້ວ',
  };
  async up(q: QueryRunner): Promise<void> {
    for(const [index,[type,code,zh,en]] of this.entries.entries()) {
      const inserted=await q.query(`INSERT INTO sys_dict(dict_type,dict_code,dict_value,dict_label_zh,dict_label_en,dict_label_lo,sort_no,status)
        VALUES($1,$2,$2,$3,$4,$5,$6,'ACTIVE') ON CONFLICT(dict_type,dict_code) DO NOTHING RETURNING dict_code`,[type,code,zh,en,this.lao[code],180+index]);
      if(!(await q.query("SELECT 1 FROM sys_dict WHERE dict_type=$1 AND dict_code=$2 AND dict_value=$2 AND status='ACTIVE'",[type,code])).length)throw new Error('PRODUCTION_DICTIONARY_SEMANTICS_HOLD');
      if(inserted.length)await q.query(`INSERT INTO typeorm_metadata("type","table","name","value")
        VALUES('PRODUCTION_INSTALLMENT_DICT','sys_dict',$1,$2)`,[type,code]);
    }
  }
  async down(q: QueryRunner): Promise<void> {
    const own=!q.isTransactionActive;if(own)await q.startTransaction();
    try {
      const facts=['production_inbound_documents','production_inbound_days','production_physical_handovers',
        'production_handover_cancellations','production_cutover_scopes','production_inventory_domains',
        'production_batch_qualifications','production_batch_roots','production_inbound_lines','production_inbound_allocations',
        'production_opening_receipts','production_financial_clearances','production_posting_periods','production_posting_period_events'];
      await q.query(`LOCK TABLE ${facts.join(',')},inv_ledger IN ACCESS EXCLUSIVE MODE`);
      for(const table of facts) {
        if((await q.query(`SELECT 1 FROM ${table} LIMIT 1`)).length)throw new Error('PRODUCTION_DICTIONARY_DOWN_HOLD: signed scope or facts exist');
      }
      if((await q.query("SELECT 1 FROM inv_ledger WHERE change_type='PRODUCTION_INBOUND_REVERSAL' LIMIT 1")).length)throw new Error('PRODUCTION_DICTIONARY_DOWN_HOLD: reversal ledger exists');
      for(const [type,code,zh,en] of this.entries) {
        const owned=await q.query(`SELECT 1 FROM typeorm_metadata WHERE "type"='PRODUCTION_INSTALLMENT_DICT' AND "name"=$1 AND "value"=$2`,[type,code]);
        if(!owned.length)continue;
        await q.query(`DELETE FROM sys_dict WHERE dict_type=$1 AND dict_code=$2 AND dict_label_zh=$3 AND dict_label_en=$4 AND dict_label_lo=$5 AND dict_value=$2`,[type,code,zh,en,this.lao[code]]);
        await q.query(`DELETE FROM typeorm_metadata WHERE "type"='PRODUCTION_INSTALLMENT_DICT' AND "name"=$1 AND "value"=$2`,[type,code]);
      }
      if(own)await q.commitTransaction();
    }catch(error){if(own)await q.rollbackTransaction();throw error;}
  }
}
