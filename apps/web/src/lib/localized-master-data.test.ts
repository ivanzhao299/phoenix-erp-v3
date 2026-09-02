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

  it('supports snake_case API rows and falls back to any populated name', () => {
    expect(localizedMasterName({ sku_name: '基础名', sku_name_en: '' }, 'sku_name', 'en')).toBe('基础名');
    expect(localizedMasterName({ storeNameLo: 'ຊື່ຮ້ານ' }, 'storeName', 'zh')).toBe('ຊື່ຮ້ານ');
  });

  it('handles blank values, unknown locales, and all-empty rows', () => {
    expect(localizedMasterName({ item_name_fr: ' ', item_name_en: 'Egg' }, 'item_name', 'fr')).toBe('Egg');
    expect(localizedMasterName({ item_name: 'Base' }, 'item_name', 'km')).toBe('Base');
    expect(localizedMasterName({ item_name_zh: ' ' }, 'item_name', 'zh')).toBe('');
  });

  it('formats equal, missing, and normal name/code pairs', () => {
    expect(masterNameWithCode('WH-1', 'WH-1')).toBe('WH-1');
    expect(masterNameWithCode('', 'WH-1')).toBe('WH-1');
    expect(masterNameWithCode('一号仓', '')).toBe('一号仓');
    expect(masterNameWithCode('一号仓', 'WH-1')).toBe('一号仓（WH-1）');
  });
});
