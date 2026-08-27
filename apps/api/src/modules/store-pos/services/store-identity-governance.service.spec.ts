import { BadRequestException } from '@nestjs/common';
import { StoreIdentityGovernanceService } from './store-identity-governance.service';

describe('StoreIdentityGovernanceService', () => {
  it('accepts only an ACTIVE STORE SITE in the store company', async () => {
    const em = { query: jest.fn().mockResolvedValue([{ '?column?': 1 }]) };
    const service = new StoreIdentityGovernanceService(em as any);
    await expect(service.assertStoreSiteAlias('10', 'SITE-VTE-STORE-01')).resolves.toBeUndefined();
    expect(em.query).toHaveBeenCalledWith(expect.stringContaining(`o.site_business_type='STORE'`), ['10', 'SITE-VTE-STORE-01']);
    expect(em.query).toHaveBeenCalledWith(expect.stringContaining('o.company_code=s.company_code'), ['10', 'SITE-VTE-STORE-01']);
  });

  it('rejects inactive, non-store, missing, or cross-company SITE projections', async () => {
    const service = new StoreIdentityGovernanceService({ query: jest.fn().mockResolvedValue([]) } as any);
    await expect(service.assertStoreSiteAlias('10', 'SITE-MENGSAI-LAYER')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects a store company update that conflicts with its active STORE_SITE', async () => {
    const service = new StoreIdentityGovernanceService({
      query: jest.fn().mockResolvedValue([{ alias_code: 'SITE-VTE-STORE-01' }]),
    } as any);
    await expect(service.assertStoreCompanyConsistent('10', 'COMP-LAO-XINGCHI')).rejects.toThrow('SITE-VTE-STORE-01');
  });
});
