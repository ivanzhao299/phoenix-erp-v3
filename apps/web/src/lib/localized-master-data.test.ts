import { describe, expect, it } from 'vitest';
import { localizedMasterName } from './localized-master-data';

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
});
