import { describe, expect, it } from 'vitest';
import { flockMasterLabels } from './flock-display';

const facts = [{ flock_no: 'FK-1', farm_code: 'LPH_MENGSAI', farm_name: 'LPH_MENGSAI', house_code: 'HOUSE_MS_02' }];
const farms = [{ farm_code: 'LPH_MENGSAI', farm_name: '孟赛蛋鸡场' }];
const houses = [{ farm_code: 'LPH_MENGSAI', house_code: 'HOUSE_MS_02', house_name: '2号鸡舍' }];

describe('flock master display facts', () => {
  it.each(['zh', 'lo', 'en'])('keeps canonical names and identifiers in %s without changing facts', lang => {
    const [row] = flockMasterLabels(facts, farms, houses, lang);
    expect(row).toMatchObject({ farmCode: 'LPH_MENGSAI', farmName: '孟赛蛋鸡场', houseCode: 'HOUSE_MS_02', houseName: '2号鸡舍' });
    expect(facts[0].farm_name).toBe('LPH_MENGSAI');
  });
  it('rehydrates late masters and new locale names rather than retaining code labels', () => {
    expect(flockMasterLabels(facts, [], [], 'lo')[0].houseName).toBe('');
    const multilingualFarms = [{ ...farms[0], farmNameZh: '中文场', farmNameEn: 'Farm Two', farmNameLo: 'ຟາມສອງ' }];
    const multilingualHouses = [{ ...houses[0], house_name_zh: '中文舍', house_name_en: 'House Two', house_name_lo: 'ເຮືອນສອງ' }];
    for (const [lang, farmName, houseName] of [['zh', '中文场', '中文舍'], ['en', 'Farm Two', 'House Two'], ['lo', 'ຟາມສອງ', 'ເຮືອນສອງ']]) {
      expect(flockMasterLabels(facts, multilingualFarms, multilingualHouses, lang)[0]).toMatchObject({ farmName, houseName });
    }
  });
  it('does not use a same-code house from another farm and tolerates empty names', () => {
    const [row] = flockMasterLabels(facts, [{ ...farms[0], farm_name: '' }], [{ ...houses[0], farm_code: 'OTHER' }], 'en');
    expect(row.farmName).toBe('');
    expect(row.houseName).toBe('');
    expect(row.houseCode).toBe('HOUSE_MS_02');
  });
});
