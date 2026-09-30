import { describe, expect, it } from 'vitest';
import { BUSINESS_ENUMS, formatBusinessEnum, formatCompany, formatMasterData } from './business-display';

describe('business display formatters', () => {
  it('covers every known enum in three languages and preserves unknown codes', () => {
    for (const [domain, entries] of Object.entries(BUSINESS_ENUMS)) for (const code of Object.keys(entries)) for (const lang of ['zh','en','lo'] as const) {
      expect(formatBusinessEnum(domain as keyof typeof BUSINESS_ENUMS, code, lang)).not.toBe(code);
    }
    expect(formatBusinessEnum('inventory', 'NEW_STATE', 'lo')).toBe('NEW_STATE');
  });
  it('uses real locale fallback and always preserves the code', () => {
    const row = { location_name:'A-01', warehouse_name_zh:'一号仓', warehouse_name_en:'WH One' };
    expect(formatMasterData(row, 'warehouse_name', 'WH-1', 'en')).toBe('WH One（WH-1）');
    expect(formatMasterData(row, 'warehouse_name', 'WH-1', 'lo')).toBe('WH-1');
    expect(formatMasterData(row, 'location_name', 'L-1', 'lo')).toBe('A-01（L-1）');
  });
  it('formats canonical companies without inventing en/lo names', () => {
    const row = { company_display_name: 'Golden Phoenix Laos', company_display_name_zh: '金凤凰老挝' };
    expect(formatCompany(row, 'COMP-LA', 'zh')).toBe('金凤凰老挝（COMP-LA）');
    expect(formatCompany(row, 'COMP-LA', 'en')).toBe('金凤凰老挝（COMP-LA）');
    expect(formatCompany(row, 'COMP-LA', 'lo')).toBe('金凤凰老挝（COMP-LA）');
    expect(formatCompany({}, 'COMP-LA', 'lo')).toBe('COMP-LA');
  });
  it('localizes known vehicle codes and preserves historical free text', () => {
    expect(formatBusinessEnum('vehicleType', 'TRUCK', 'lo')).toBe('ລົດບັນທຸກ');
    expect(formatBusinessEnum('vehicleType', '厢式货车', 'en')).toBe('厢式货车');
  });
});
