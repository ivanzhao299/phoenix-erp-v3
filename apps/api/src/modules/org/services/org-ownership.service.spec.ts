import { BadRequestException } from '@nestjs/common';
import { OrgOwnershipService } from './org-ownership.service';

describe('OrgOwnershipService', () => {
  it('resolves house ownership only through the active farm authority chain', async () => {
    const query = jest.fn().mockResolvedValue([{
      house_code: 'H-01', farm_code: 'FARM-DP', company_code: 'COMP-A', site_code: 'SITE-DP',
    }]);
    const service = new OrgOwnershipService({ query } as never);

    await expect(service.resolveHouse(' H-01 ')).resolves.toEqual({
      houseCode: 'H-01', farmCode: 'FARM-DP', companyCode: 'COMP-A', siteCode: 'SITE-DP',
    });
    expect(query.mock.calls[0][0]).toContain("f.status = 'ACTIVE'");
    expect(query.mock.calls[0][0]).toContain("f.company_code AS company_code");
    expect(query.mock.calls[0][1]).toEqual(['H-01']);
  });

  it('does not accept a sparse house company copy when the farm has no company', async () => {
    const service = new OrgOwnershipService({ query: jest.fn().mockResolvedValue([{
      house_code: 'H-01', farm_code: 'FARM-DP', company_code: null, site_code: 'SITE-DP',
    }]) } as never);
    await expect(service.resolveHouse('H-01')).rejects.toThrow('关联农场缺少公司归属');
  });

  it('resolves warehouse directly to company and rejects inactive records', async () => {
    const query = jest.fn().mockResolvedValue([]);
    const service = new OrgOwnershipService({ query } as never);
    await expect(service.resolveWarehouse('WH-01')).rejects.toBeInstanceOf(BadRequestException);
    expect(query.mock.calls[0][0]).toContain("status = 'ACTIVE'");
  });
});
