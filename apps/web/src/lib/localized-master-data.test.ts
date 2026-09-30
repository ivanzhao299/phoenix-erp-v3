import { describe, expect, it } from 'vitest';
import { localizedMasterName, masterNameWithCode } from './localized-master-data';

describe('localizedMasterName', () => {
  const warehouse = {
    warehouseName: 'English legacy',
    warehouseNameZh: '中文仓',
    warehouseNameEn: 'English warehouse',
    warehouseNameLo: 'ສາງລາວ',
  };

  it.each([
    ['zh', '中文仓'],
    ['en', 'English warehouse'],
    ['lo', 'ສາງລາວ'],
  ] as const)('selects the %s master-data name', (lang, expected) => {
    expect(localizedMasterName(warehouse, 'warehouseName', lang)).toBe(expected);
  });

  it('supports snake_case API rows and keeps legacy fallback for generic masters', () => {
    expect(localizedMasterName({ sku_name: '基础名', sku_name_en: '' }, 'sku_name', 'en')).toBe('基础名');
    expect(localizedMasterName({ storeNameLo: 'ຊື່ຮ້ານ' }, 'storeName', 'zh')).toBe('ຊື່ຮ້ານ');
  });

  it('handles blank values, unknown locales, and all-empty rows', () => {
    expect(localizedMasterName({ item_name_fr: ' ', item_name_en: 'Egg' }, 'item_name', 'fr')).toBe('Egg');
    expect(localizedMasterName({ item_name: 'Base' }, 'item_name', 'km')).toBe('Base');
    expect(localizedMasterName({ item_name_zh: ' ' }, 'item_name', 'zh')).toBe('');
  });

  it.each([
    ['supplier', { supplier_name: '供应商甲', supplier_name_en: 'Supplier A', supplier_name_lo: 'ຜູ້ສະໜອງ A' }, 'zh', '供应商甲'],
    ['supplier', { supplier_name: '供应商甲', supplier_name_en: 'Supplier A', supplier_name_lo: 'ຜູ້ສະໜອງ A' }, 'en', 'Supplier A'],
    ['supplier', { supplier_name: '供应商甲', supplier_name_en: 'Supplier A', supplier_name_lo: 'ຜູ້ສະໜອງ A' }, 'lo', 'ຜູ້ສະໜອງ A'],
    ['warehouse', { warehouse_name: 'Warehouse A', warehouse_name_zh: '一号仓', warehouse_name_en: 'Warehouse A', warehouse_name_lo: 'ສາງ A' }, 'zh', '一号仓'],
    ['warehouse', { warehouse_name: 'Warehouse A', warehouse_name_zh: '一号仓', warehouse_name_en: 'Warehouse A', warehouse_name_lo: 'ສາງ A' }, 'en', 'Warehouse A'],
    ['warehouse', { warehouse_name: 'Warehouse A', warehouse_name_zh: '一号仓', warehouse_name_en: 'Warehouse A', warehouse_name_lo: 'ສາງ A' }, 'lo', 'ສາງ A'],
  ] as const)('resolves %s names in the active locale', (_type, row, lang, expected) => {
    expect(localizedMasterName(row, _type === 'supplier' ? 'supplier_name' : 'warehouse_name', lang)).toBe(expected);
  });

  it('falls back to the code for missing supplier or warehouse translations', () => {
    expect(masterNameWithCode(localizedMasterName({ supplier_name: '供应商甲' }, 'supplier_name', 'en'), 'SUP-1')).toBe('SUP-1');
    expect(masterNameWithCode(localizedMasterName({ warehouse_name_zh: '一号仓' }, 'warehouse_name', 'lo'), 'WH-1')).toBe('WH-1');
    expect(localizedMasterName({ supplier_name: '供应商甲' }, 'supplier_name', 'km')).toBe('供应商甲');
  });

  it('formats equal, missing, and normal name/code pairs', () => {
    expect(masterNameWithCode('WH-1', 'WH-1')).toBe('WH-1');
    expect(masterNameWithCode('', 'WH-1')).toBe('WH-1');
    expect(masterNameWithCode('一号仓', '')).toBe('一号仓');
    expect(masterNameWithCode('一号仓', 'WH-1')).toBe('一号仓（WH-1）');
  });
});
