import {
  allowedInventoryClassesForSales,
  isInventoryClass,
  resolveInventoryClass,
} from './inventory-class-policy';

describe('inventory class policy', () => {
  it('maps both defect quality grades to the single defect sales class', () => {
    expect(resolveInventoryClass(' dirty ')).toBe('DEFECT_SALE');
    expect(resolveInventoryClass('BROKEN')).toBe('DEFECT_SALE');
    expect(resolveInventoryClass('GRADE_5')).toBe('STANDARD');
    expect(resolveInventoryClass('')).toBe('STANDARD');
    expect(() => resolveInventoryClass('CRACKED')).toThrow('未知鸡蛋等级');
  });

  it('keeps Store/POS out of defect sales inventory', () => {
    expect(allowedInventoryClassesForSales('FARM_SALES')).toEqual(['STANDARD', 'DEFECT_SALE']);
    expect(allowedInventoryClassesForSales('STORE_POS')).toEqual(['STANDARD']);
    expect(isInventoryClass('DEFECT_SALE')).toBe(true);
    expect(isInventoryClass('QUARANTINE')).toBe(false);
  });
});
