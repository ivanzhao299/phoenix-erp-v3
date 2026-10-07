import { describe, expect, it } from 'vitest';
import { masterNameMap, masterDisplayLabel } from './master-display';

describe('scoped master name/code presentation', () => {
  it.each(['house', 'warehouse', 'zone', 'company', 'project', 'customer', 'store', 'sku'])('formats authoritative %s names with the unchanged code', domain => {
    const names = masterNameMap([{ [`${domain}_code`]: 'CODE-1', [`${domain}_name`]: 'Canonical', [`${domain}_name_en`]: 'English', [`${domain}_name_lo`]: 'ຊື່' }], domain);
    expect(masterDisplayLabel(names, domain, 'CODE-1', 'zh')).toBe('Canonical（CODE-1）');
    expect(masterDisplayLabel(names, domain, 'CODE-1', 'en')).toBe('English（CODE-1）');
    expect(masterDisplayLabel(names, domain, 'CODE-1', 'lo')).toBe('ຊື່（CODE-1）');
  });
  it('keeps canonical warehouse name when no translation exists and accepts camel projections', () => {
    const names = masterNameMap([{ warehouseCode: 'WH-1', warehouseName: '仓库' }], 'warehouse');
    expect(masterDisplayLabel(names, 'warehouse', 'WH-1', 'lo')).toBe('仓库（WH-1）');
    expect(masterDisplayLabel(new Map(), 'house', 'H-1', 'en')).toBe('H-1');
    expect(masterDisplayLabel(new Map(), 'house', 'H-1', 'en', { house_name: '鸡舍' })).toBe('鸡舍（H-1）');
  });
  it('uses the existing organization canonical name without inventing translations', () => {
    const names = masterNameMap([{ companyCode: 'C1', orgNameCn: '公司' }], 'company');
    expect(masterDisplayLabel(names, 'company', 'C1', 'en')).toBe('公司（C1）');
  });
});
