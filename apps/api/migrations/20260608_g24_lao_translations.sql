-- ═════════════════════════════════════════════════════════════════════════════
-- G24-C · 关键业务字典老挝语翻译补全 (D3 欠债)
-- ═════════════════════════════════════════════════════════════════════════════
-- 痛点：G17/G19 seed 的 60+ 字典，dict_label_lo 大量为空 ''
--      老挝业务方查看字典下拉看不到母语，影响 UI 友好度。
--
-- 改动：UPDATE 关键业务字典补齐老挝语（前 5 类高频）：
--      · INV_OUTBOUND_TYPE      出库类型
--      · INV_INBOUND_TYPE       入库类型
--      · BRD_MORTALITY_REASON   死亡原因
--      · BRD_CULLING_REASON     淘汰原因
--      · BRD_HOUSE_TYPE         鸡舍类型
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

DO $body$
BEGIN
  -- INV_OUTBOUND_TYPE 出库类型
  UPDATE sys_dict SET dict_label_lo='ການອອກຄັງເພື່ອການຂາຍ'  WHERE dict_type='INV_OUTBOUND_TYPE' AND dict_code='SALE';
  UPDATE sys_dict SET dict_label_lo='ການໂອນສິນຄ້າ'           WHERE dict_type='INV_OUTBOUND_TYPE' AND dict_code='TRANSFER';
  UPDATE sys_dict SET dict_label_lo='ໃຊ້ສຳລັບການຜະລິດ'       WHERE dict_type='INV_OUTBOUND_TYPE' AND dict_code='PRODUCTION_USE';
  UPDATE sys_dict SET dict_label_lo='ການແຈກອາຫານ'             WHERE dict_type='INV_OUTBOUND_TYPE' AND dict_code='FEED_DISTRIBUTION';
  UPDATE sys_dict SET dict_label_lo='ການແຈກຢາ'                WHERE dict_type='INV_OUTBOUND_TYPE' AND dict_code='MEDICINE_DISTRIBUTION';
  UPDATE sys_dict SET dict_label_lo='ການລົບລ້າງ'              WHERE dict_type='INV_OUTBOUND_TYPE' AND dict_code='SCRAP';
  UPDATE sys_dict SET dict_label_lo='ການສົ່ງຄືນ'              WHERE dict_type='INV_OUTBOUND_TYPE' AND dict_code='RETURN';

  -- INV_INBOUND_TYPE 入库类型
  UPDATE sys_dict SET dict_label_lo='ການຊື້'                  WHERE dict_type='INV_INBOUND_TYPE' AND dict_code='PURCHASE';
  UPDATE sys_dict SET dict_label_lo='ການຜະລິດ'                WHERE dict_type='INV_INBOUND_TYPE' AND dict_code='PRODUCTION';
  UPDATE sys_dict SET dict_label_lo='ການສົ່ງຄືນ'              WHERE dict_type='INV_INBOUND_TYPE' AND dict_code='RETURN';
  UPDATE sys_dict SET dict_label_lo='ການປັບຄ່າ'               WHERE dict_type='INV_INBOUND_TYPE' AND dict_code='ADJUSTMENT';
  UPDATE sys_dict SET dict_label_lo='ຮັບການໂອນ'                WHERE dict_type='INV_INBOUND_TYPE' AND dict_code='TRANSFER_RECEIVE';

  -- BRD_MORTALITY_REASON 死亡原因
  UPDATE sys_dict SET dict_label_lo='ພະຍາດ'        WHERE dict_type='BRD_MORTALITY_REASON' AND dict_code='DISEASE';
  UPDATE sys_dict SET dict_label_lo='ບາດເຈັບ'      WHERE dict_type='BRD_MORTALITY_REASON' AND dict_code='INJURY';
  UPDATE sys_dict SET dict_label_lo='ຮ້ອນເກີນ'     WHERE dict_type='BRD_MORTALITY_REASON' AND dict_code='HEAT';
  UPDATE sys_dict SET dict_label_lo='ທຳມະຊາດ'      WHERE dict_type='BRD_MORTALITY_REASON' AND dict_code='NATURAL';
  UPDATE sys_dict SET dict_label_lo='ບໍ່ຮູ້ສາເຫດ' WHERE dict_type='BRD_MORTALITY_REASON' AND dict_code='UNKNOWN';

  -- BRD_CULLING_REASON 淘汰原因
  UPDATE sys_dict SET dict_label_lo='ອອກໄຂ່ໜ້ອຍ'   WHERE dict_type='BRD_CULLING_REASON' AND dict_code='LOW_PRODUCTION';
  UPDATE sys_dict SET dict_label_lo='ປ່ວຍ'         WHERE dict_type='BRD_CULLING_REASON' AND dict_code='SICKNESS';
  UPDATE sys_dict SET dict_label_lo='ອາຍຸເຖົ້າ'    WHERE dict_type='BRD_CULLING_REASON' AND dict_code='AGE';
  UPDATE sys_dict SET dict_label_lo='ບາດເຈັບໜັກ'   WHERE dict_type='BRD_CULLING_REASON' AND dict_code='INJURY';
  UPDATE sys_dict SET dict_label_lo='ອື່ນໆ'         WHERE dict_type='BRD_CULLING_REASON' AND dict_code='OTHER';

  -- BRD_HOUSE_TYPE 鸡舍类型
  UPDATE sys_dict SET dict_label_lo='ເຮືອນໄກ່ໄຂ່'    WHERE dict_type='BRD_HOUSE_TYPE' AND dict_code='LAYER';
  UPDATE sys_dict SET dict_label_lo='ເຮືອນພໍ່ແມ່ພັນ' WHERE dict_type='BRD_HOUSE_TYPE' AND dict_code='BREEDER';
  UPDATE sys_dict SET dict_label_lo='ເຮືອນຟັກໄຂ່'    WHERE dict_type='BRD_HOUSE_TYPE' AND dict_code='HATCHERY';
  UPDATE sys_dict SET dict_label_lo='ເຮືອນລ້ຽງລູກ'   WHERE dict_type='BRD_HOUSE_TYPE' AND dict_code='PULLET';
  UPDATE sys_dict SET dict_label_lo='ເຮືອນລ້ຽງສຳລັບໂຕໃຫຍ່' WHERE dict_type='BRD_HOUSE_TYPE' AND dict_code='GROWER';
  UPDATE sys_dict SET dict_label_lo='ເຮືອນໄກ່ເນື້ອ'  WHERE dict_type='BRD_HOUSE_TYPE' AND dict_code='BROILER';

  RAISE NOTICE '[g24-c] 5 类关键字典老挝语补全完成（共 28 条）';
END $body$;

COMMIT;
