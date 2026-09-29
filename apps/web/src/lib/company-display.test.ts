import { describe, expect, it } from 'vitest';
import { companyDisplayName } from './company-display';

describe('companyDisplayName', () => {
  it('prefers the canonical company name', () => {
    expect(companyDisplayName('老兴池农业', 'COMP-LAO-XINGCHI')).toBe('老兴池农业');
  });

  it('keeps legacy company code visible when the name is absent', () => {
    expect(companyDisplayName(null, 'COMP-LAO-AGRI')).toBe('COMP-LAO-AGRI');
  });

  it('does not map a missing company to another company', () => {
    expect(companyDisplayName('', null)).toBe('—');
  });
});
