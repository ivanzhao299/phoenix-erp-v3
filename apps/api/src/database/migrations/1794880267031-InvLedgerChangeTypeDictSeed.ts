import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * INV-202：inv_ledger.change_type 字典化（dict_type=INV_LEDGER_CHANGE_TYPE）。
 *
 * 权威枚举清单来自 2026-11-17 全库写入侧盘点（grep 所有 INSERT INTO
 * inv_ledger 的 change_type 实参），代码侧常量见
 * apps/api/src/modules/wms/inv-ledger-change-types.ts：
 *
 *   通用兜底   INBOUND / OUTBOUND
 *   sales-v2   RESERVED / RELEASED / FIFO_OUT / SALE_RETURN / DAMAGE_WRITEOFF /
 *              EXPIRE_WRITEOFF / TEMP_PRODUCTION_INBOUND / PACKAGING_INBOUND
 *   wms        PURCHASE_INBOUND / PRODUCTION_INBOUND / TRANSFER_IN /
 *              SALES_RETURN_INBOUND / STOCKTAKE_UP / OPENING_INBOUND /
 *              SALE_OUTBOUND / TRANSFER_OUT / PRODUCTION_ISSUE / FEED_ISSUE /
 *              MEDICINE_ISSUE / LOGISTICS_ISSUE / SPARE_PART_ISSUE /
 *              OFFICE_ISSUE / MAINTENANCE_ISSUE / SCRAP_OUTBOUND /
 *              PURCHASE_RETURN_OUT / STOCKTAKE_DOWN / INBOUND_BROKEN /
 *              RECEIVE_OVER / RECEIVE_SHORT / TRANSFER_DAMAGE_INBOUND /
 *              DEFECT_TRANSFER_OUT / DEFECT_TRANSFER_IN（另有动态
 *              `DEFECT_${action}`：PROCESSING / CLEANING_RECHECK / WASTE /
 *              RETURN_TO_SOURCE，随 wms-defect-disposition-policy 收敛）/ LOSS
 *   farm       MED_INBOUND / MED_OUTBOUND / VACCINE_OUTBOUND / FARM_IN /
 *              FARM_REVERSED
 *
 * 只读历史值（读侧过滤仍在用，一并入字典便于台账筛选展示，禁止新写入）：
 *   WRITE_OFF / QC_REJECT。
 * 另有 V2 遗留读侧值不入字典：SALES / PURCHASE_IN / STORE_IN / RECV_IN /
 * PACK_DONE / EGG_GRADED / FARM_OUT_MEDICATION（仅存在于冻结 ETL 基线数据）。
 *
 * 不加 DB CHECK（历史值兼容优先），先字典 + 代码常量收敛。
 * sys_dict 为工具表，DML 属迁移白名单（g197-H）。
 */
export class InvLedgerChangeTypeDictSeed1794880267031 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
        if (!(await queryRunner.hasTable("sys_dict"))) return;

        await queryRunner.query(`
            INSERT INTO sys_dict
              (dict_type, dict_code, dict_label_zh, dict_label_lo, dict_label_en, dict_value, sort_no, status, name)
            VALUES
              ('INV_LEDGER_CHANGE_TYPE', 'INBOUND',                 '入库（通用）',       '', 'Inbound (generic)',       'INBOUND',                 10,  'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'OUTBOUND',                '出库（通用）',       '', 'Outbound (generic)',      'OUTBOUND',                20,  'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'RESERVED',                '订单预占',           '', 'Reserved',                'RESERVED',                110, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'RELEASED',                '预占释放',           '', 'Released',                'RELEASED',                120, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'FIFO_OUT',                'FIFO 出库扣减',      '', 'FIFO out',                'FIFO_OUT',                130, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'SALE_RETURN',             '销售退货回库',       '', 'Sales return',            'SALE_RETURN',             140, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'DAMAGE_WRITEOFF',         '退货破损核销',       '', 'Damage write-off',        'DAMAGE_WRITEOFF',         150, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'EXPIRE_WRITEOFF',         '过期自动核销',       '', 'Expire write-off',        'EXPIRE_WRITEOFF',         160, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'TEMP_PRODUCTION_INBOUND', '临时生产入库',       '', 'Temp production inbound', 'TEMP_PRODUCTION_INBOUND', 170, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'PACKAGING_INBOUND',       '包装入库',           '', 'Packaging inbound',       'PACKAGING_INBOUND',       180, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'PURCHASE_INBOUND',        '采购收货入库',       '', 'Purchase inbound',        'PURCHASE_INBOUND',        210, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'PRODUCTION_INBOUND',      '生产完工入库',       '', 'Production inbound',      'PRODUCTION_INBOUND',      220, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'TRANSFER_IN',             '调拨入库',           '', 'Transfer in',             'TRANSFER_IN',             230, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'SALES_RETURN_INBOUND',    '销售退货入库',       '', 'Sales return inbound',    'SALES_RETURN_INBOUND',    240, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'STOCKTAKE_UP',            '盘盈调整',           '', 'Stocktake gain',          'STOCKTAKE_UP',            250, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'OPENING_INBOUND',         '期初导入',           '', 'Opening inbound',         'OPENING_INBOUND',         260, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'SALE_OUTBOUND',           '销售出库',           '', 'Sale outbound',           'SALE_OUTBOUND',           270, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'TRANSFER_OUT',            '调拨出库',           '', 'Transfer out',            'TRANSFER_OUT',            280, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'PRODUCTION_ISSUE',        '生产领料',           '', 'Production issue',        'PRODUCTION_ISSUE',        290, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'FEED_ISSUE',              '饲料发料',           '', 'Feed issue',              'FEED_ISSUE',              300, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'MEDICINE_ISSUE',          '药品发料',           '', 'Medicine issue',          'MEDICINE_ISSUE',          310, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'LOGISTICS_ISSUE',         '物流领用',           '', 'Logistics issue',         'LOGISTICS_ISSUE',         320, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'SPARE_PART_ISSUE',        '备件领用',           '', 'Spare part issue',        'SPARE_PART_ISSUE',        330, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'OFFICE_ISSUE',            '办公用品领用',       '', 'Office issue',            'OFFICE_ISSUE',            340, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'MAINTENANCE_ISSUE',       '维修领用',           '', 'Maintenance issue',       'MAINTENANCE_ISSUE',       350, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'SCRAP_OUTBOUND',          '报废出库',           '', 'Scrap outbound',          'SCRAP_OUTBOUND',          360, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'PURCHASE_RETURN_OUT',     '采购退货出库',       '', 'Purchase return out',     'PURCHASE_RETURN_OUT',     370, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'STOCKTAKE_DOWN',          '盘亏调整',           '', 'Stocktake loss',          'STOCKTAKE_DOWN',          380, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'INBOUND_BROKEN',          '入库破损隔离',       '', 'Inbound broken',          'INBOUND_BROKEN',          390, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'RECEIVE_OVER',            '调拨收货溢余',       '', 'Receive over',            'RECEIVE_OVER',            400, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'RECEIVE_SHORT',           '调拨收货短缺',       '', 'Receive short',           'RECEIVE_SHORT',           410, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'TRANSFER_DAMAGE_INBOUND', '调拨破损入库',       '', 'Transfer damage inbound', 'TRANSFER_DAMAGE_INBOUND', 420, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'DEFECT_TRANSFER_OUT',     '缺陷调拨出',         '', 'Defect transfer out',     'DEFECT_TRANSFER_OUT',     430, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'DEFECT_TRANSFER_IN',      '缺陷调拨入',         '', 'Defect transfer in',      'DEFECT_TRANSFER_IN',      440, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'LOSS',                    '损耗出库',           '', 'Loss',                    'LOSS',                    450, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'MED_INBOUND',             '兽药入库',           '', 'Medication inbound',      'MED_INBOUND',             510, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'MED_OUTBOUND',            '兽药出库',           '', 'Medication outbound',     'MED_OUTBOUND',            520, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'VACCINE_OUTBOUND',        '疫苗出库',           '', 'Vaccine outbound',        'VACCINE_OUTBOUND',        530, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'FARM_IN',                 '农场日产入账',       '', 'Farm daily in',           'FARM_IN',                 540, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'FARM_REVERSED',           '农场入账冲销',       '', 'Farm reversed',           'FARM_REVERSED',           550, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'WRITE_OFF',               '损耗核销（历史值）', '', 'Write-off (legacy)',      'WRITE_OFF',               910, 'ACTIVE', '库存台账变动类型'),
              ('INV_LEDGER_CHANGE_TYPE', 'QC_REJECT',               '质检拒收（历史值）', '', 'QC reject (legacy)',      'QC_REJECT',               920, 'ACTIVE', '库存台账变动类型')
            ON CONFLICT (dict_type, dict_code) DO UPDATE SET -- sys_dict upsert
              dict_label_zh = EXCLUDED.dict_label_zh,
              dict_label_lo = EXCLUDED.dict_label_lo,
              dict_label_en = EXCLUDED.dict_label_en,
              dict_value    = EXCLUDED.dict_value,
              sort_no       = EXCLUDED.sort_no,
              status        = 'ACTIVE',
              name          = EXCLUDED.name,
              updated_at    = NOW()
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        if (!(await queryRunner.hasTable("sys_dict"))) return;

        await queryRunner.query(`
            DELETE FROM sys_dict
             WHERE dict_type = 'INV_LEDGER_CHANGE_TYPE'
               AND dict_code IN (
                 'INBOUND','OUTBOUND',
                 'RESERVED','RELEASED','FIFO_OUT','SALE_RETURN','DAMAGE_WRITEOFF','EXPIRE_WRITEOFF',
                 'TEMP_PRODUCTION_INBOUND','PACKAGING_INBOUND',
                 'PURCHASE_INBOUND','PRODUCTION_INBOUND','TRANSFER_IN','SALES_RETURN_INBOUND',
                 'STOCKTAKE_UP','OPENING_INBOUND','SALE_OUTBOUND','TRANSFER_OUT','PRODUCTION_ISSUE',
                 'FEED_ISSUE','MEDICINE_ISSUE','LOGISTICS_ISSUE','SPARE_PART_ISSUE','OFFICE_ISSUE',
                 'MAINTENANCE_ISSUE','SCRAP_OUTBOUND','PURCHASE_RETURN_OUT','STOCKTAKE_DOWN',
                 'INBOUND_BROKEN','RECEIVE_OVER','RECEIVE_SHORT','TRANSFER_DAMAGE_INBOUND',
                 'DEFECT_TRANSFER_OUT','DEFECT_TRANSFER_IN','LOSS',
                 'MED_INBOUND','MED_OUTBOUND','VACCINE_OUTBOUND','FARM_IN','FARM_REVERSED',
                 'WRITE_OFF','QC_REJECT'
               )
        `);
    }

}
