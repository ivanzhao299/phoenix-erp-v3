import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * @allow-data-dml: sys_dict is governed configuration data; business-row mapping is kept in the approved production workflow.
 */
export class GovernSupplierWarehouseTypeDomains1788501600000 implements MigrationInterface {
  name = 'GovernSupplierWarehouseTypeDomains1788501600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE prc2_suppliers ADD COLUMN IF NOT EXISTS supply_category VARCHAR(32)`);
    await queryRunner.query(`ALTER TABLE prc2_suppliers ADD COLUMN IF NOT EXISTS sourcing_type VARCHAR(32)`);
    await queryRunner.query(`ALTER TABLE wms_warehouses ADD COLUMN IF NOT EXISTS facility_class VARCHAR(32)`);
    await queryRunner.query(`ALTER TABLE wms_warehouses ADD COLUMN IF NOT EXISTS capability VARCHAR(32)`);

    await queryRunner.query(`
      INSERT INTO sys_dict
        (dict_type, dict_code, dict_label_zh, dict_label_lo, dict_label_en, dict_value, sort_no, status, name)
      VALUES
        ('SUPPLIER_SUPPLY_CATEGORY','CHICK','鸡苗','ລູກໄກ່','Chick','CHICK',10,'ACTIVE','供应品类'),
        ('SUPPLIER_SUPPLY_CATEGORY','FEED','饲料','ອາຫານສັດ','Feed','FEED',20,'ACTIVE','供应品类'),
        ('SUPPLIER_SUPPLY_CATEGORY','RAW_MATERIAL','原材料','ວັດຖຸດິບ','Raw material','RAW_MATERIAL',30,'ACTIVE','供应品类'),
        ('SUPPLIER_SUPPLY_CATEGORY','PACKAGING','包装','ບັນຈຸພັນ','Packaging','PACKAGING',40,'ACTIVE','供应品类'),
        ('SUPPLIER_SUPPLY_CATEGORY','VACCINE','疫苗','ວັກຊີນ','Vaccine','VACCINE',50,'ACTIVE','供应品类'),
        ('SUPPLIER_SUPPLY_CATEGORY','VETERINARY','兽医用品','ອຸປະກອນສັດຕະວະແພດ','Veterinary supplies','VETERINARY',60,'ACTIVE','供应品类'),
        ('SUPPLIER_SUPPLY_CATEGORY','EQUIPMENT','设备','ອຸປະກອນ','Equipment','EQUIPMENT',70,'ACTIVE','供应品类'),
        ('SUPPLIER_SUPPLY_CATEGORY','MEDICINE','兽药','ຢາສັດ','Medicine','MEDICINE',80,'ACTIVE','供应品类'),
        ('SUPPLIER_SUPPLY_CATEGORY','SERVICE','服务','ບໍລິການ','Service','SERVICE',90,'ACTIVE','供应品类'),
        ('SUPPLIER_SUPPLY_CATEGORY','OTHER','其他','ອື່ນໆ','Other','OTHER',100,'ACTIVE','供应品类'),
        ('SUPPLIER_SOURCING_TYPE','LOCAL','本地','ທ້ອງຖິ່ນ','Local','LOCAL',10,'ACTIVE','采购地域'),
        ('SUPPLIER_SOURCING_TYPE','OVERSEAS','海外','ຕ່າງປະເທດ','Overseas','OVERSEAS',20,'ACTIVE','采购地域'),
        ('SUPPLIER_SOURCING_TYPE','AGENT','代理','ຕົວແທນ','Agent','AGENT',30,'ACTIVE','采购地域'),
        ('SUPPLIER_SOURCING_TYPE','UNSPECIFIED','待补录','ລໍຖ້າຕື່ມຂໍ້ມູນ','Pending completion','UNSPECIFIED',90,'ACTIVE','采购地域'),
        ('WMS_WAREHOUSE_USAGE_TYPE','EGG_FARM','蛋场仓','ສາງຟາມໄຂ່','Egg farm','EGG_FARM',10,'ACTIVE','仓库用途'),
        ('WMS_WAREHOUSE_USAGE_TYPE','EGG_SALES','蛋品销售仓','ສາງຂາຍໄຂ່','Egg sales','EGG_SALES',20,'ACTIVE','仓库用途'),
        ('WMS_WAREHOUSE_USAGE_TYPE','MEDICINE','兽药仓','ສາງຢາ','Medicine','MEDICINE',30,'ACTIVE','仓库用途'),
        ('WMS_WAREHOUSE_USAGE_TYPE','FEED','饲料仓','ສາງອາຫານສັດ','Feed','FEED',40,'ACTIVE','仓库用途'),
        ('WMS_WAREHOUSE_USAGE_TYPE','RAW_MATERIAL','原料仓','ສາງວັດຖຸດິບ','Raw material','RAW_MATERIAL',50,'ACTIVE','仓库用途'),
        ('WMS_WAREHOUSE_USAGE_TYPE','PURCHASE_RECV','采购收货仓','ສາງຮັບສິນຄ້າ','Purchase receiving','PURCHASE_RECV',60,'ACTIVE','仓库用途'),
        ('WMS_WAREHOUSE_USAGE_TYPE','FINISHED','成品仓','ສາງສິນຄ້າສຳເລັດ','Finished goods','FINISHED',70,'ACTIVE','仓库用途'),
        ('WMS_WAREHOUSE_USAGE_TYPE','GENERAL','综合仓','ສາງທົ່ວໄປ','General','GENERAL',80,'ACTIVE','仓库用途'),
        ('WMS_WAREHOUSE_FACILITY_CLASS','FACTORY','工厂仓','ສາງໂຮງງານ','Factory','FACTORY',10,'ACTIVE','设施类别'),
        ('WMS_WAREHOUSE_FACILITY_CLASS','DISTRIBUTION','配送仓','ສາງແຈກຢາຍ','Distribution','DISTRIBUTION',20,'ACTIVE','设施类别'),
        ('WMS_WAREHOUSE_FACILITY_CLASS','STORE','门店仓','ສາງຮ້ານ','Store','STORE',30,'ACTIVE','设施类别'),
        ('WMS_WAREHOUSE_FACILITY_CLASS','TRANSIT','中转仓','ສາງຂົນສົ່ງ','Transit','TRANSIT',40,'ACTIVE','设施类别'),
        ('WMS_WAREHOUSE_FACILITY_CLASS','GENERAL','一般设施','ສາງທົ່ວໄປ','General facility','GENERAL',50,'ACTIVE','设施类别'),
        ('WMS_WAREHOUSE_CAPABILITY','COLD_CHAIN','冷链','ຕ່ອງໂສ້ຄວາມເຢັນ','Cold chain','COLD_CHAIN',10,'ACTIVE','仓库能力')
      ON CONFLICT (dict_type, dict_code) DO UPDATE SET
        dict_label_zh=EXCLUDED.dict_label_zh, dict_label_lo=EXCLUDED.dict_label_lo,
        dict_label_en=EXCLUDED.dict_label_en, dict_value=EXCLUDED.dict_value,
        sort_no=EXCLUDED.sort_no, status='ACTIVE', name=EXCLUDED.name, updated_at=NOW()
    `);

    await queryRunner.query(`ALTER TABLE prc2_suppliers ADD CONSTRAINT chk_prc2_suppliers_supply_category CHECK (supply_category IN ('CHICK','FEED','RAW_MATERIAL','PACKAGING','VACCINE','VETERINARY','EQUIPMENT','MEDICINE','SERVICE','OTHER')) NOT VALID`);
    await queryRunner.query(`ALTER TABLE prc2_suppliers ADD CONSTRAINT chk_prc2_suppliers_sourcing_type CHECK (sourcing_type IN ('LOCAL','OVERSEAS','AGENT','UNSPECIFIED')) NOT VALID`);
    await queryRunner.query(`ALTER TABLE wms_warehouses ADD CONSTRAINT chk_wms_warehouses_usage_type CHECK (type IN ('EGG_FARM','EGG_SALES','MEDICINE','FEED','RAW_MATERIAL','PURCHASE_RECV','FINISHED','GENERAL')) NOT VALID`);
    await queryRunner.query(`ALTER TABLE wms_warehouses ADD CONSTRAINT chk_wms_warehouses_facility_class CHECK (facility_class IN ('FACTORY','DISTRIBUTION','STORE','TRANSIT','GENERAL')) NOT VALID`);
    await queryRunner.query(`ALTER TABLE wms_warehouses ADD CONSTRAINT chk_wms_warehouses_capability CHECK (capability IN ('COLD_CHAIN')) NOT VALID`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE wms_warehouses DROP CONSTRAINT IF EXISTS chk_wms_warehouses_capability`);
    await queryRunner.query(`ALTER TABLE wms_warehouses DROP CONSTRAINT IF EXISTS chk_wms_warehouses_facility_class`);
    await queryRunner.query(`ALTER TABLE wms_warehouses DROP CONSTRAINT IF EXISTS chk_wms_warehouses_usage_type`);
    await queryRunner.query(`ALTER TABLE prc2_suppliers DROP CONSTRAINT IF EXISTS chk_prc2_suppliers_sourcing_type`);
    await queryRunner.query(`ALTER TABLE prc2_suppliers DROP CONSTRAINT IF EXISTS chk_prc2_suppliers_supply_category`);
    await queryRunner.query(`ALTER TABLE wms_warehouses DROP COLUMN IF EXISTS capability`);
    await queryRunner.query(`ALTER TABLE wms_warehouses DROP COLUMN IF EXISTS facility_class`);
    await queryRunner.query(`ALTER TABLE prc2_suppliers DROP COLUMN IF EXISTS sourcing_type`);
    await queryRunner.query(`ALTER TABLE prc2_suppliers DROP COLUMN IF EXISTS supply_category`);
    await queryRunner.query(`UPDATE sys_dict SET status='ARCHIVED', updated_at=NOW() WHERE dict_type IN ('SUPPLIER_SUPPLY_CATEGORY','SUPPLIER_SOURCING_TYPE','WMS_WAREHOUSE_USAGE_TYPE','WMS_WAREHOUSE_FACILITY_CLASS','WMS_WAREHOUSE_CAPABILITY')`);
  }
}
