import { BadRequestException } from '@nestjs/common';
import { OrgOwnershipService } from './org-ownership.service';

describe('OrgOwnershipService', () => {
  it('resolves frozen house/farm identity without applying ACTIVE eligibility filters', async () => {
    const query = jest.fn().mockResolvedValue([{
      house_code: 'H-01', farm_code: 'FARM-DP', company_code: 'COMP-A', site_code: 'SITE-DP',
    }]);
    const service = new OrgOwnershipService({ query } as never);
    await expect(service.resolveHouseIdentity(' H-01 ')).resolves.toEqual({
      houseCode: 'H-01', farmCode: 'FARM-DP', companyCode: 'COMP-A', siteCode: 'SITE-DP',
    });
    expect(query.mock.calls[0][0]).not.toContain('ACTIVE');
    expect(query.mock.calls[0][0]).not.toContain('LIMIT 1');
    expect(query.mock.calls[0][0]).toContain('f.company_code AS company_code');
    expect(query.mock.calls[0][0]).toContain('mapped_site_code');
    expect(query.mock.calls[0][1]).toEqual(['H-01']);
  });

  it.each([{ rows: [] }, { rows: [
    { house_code: 'H-01', farm_code: 'FARM-A', company_code: 'COMP-A' },
    { house_code: 'H-01', farm_code: 'FARM-B', company_code: 'COMP-B' },
  ] }])('rejects missing or ambiguous identity without first-row fallback', async ({ rows }) => {
    const service = new OrgOwnershipService({ query: jest.fn().mockResolvedValue(rows) } as never);
    await expect(service.resolveHouseIdentity('H-01')).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each([
    { house_code: '', farm_code: 'FARM-A', company_code: 'COMP-A' },
    { house_code: 'OTHER', farm_code: 'FARM-A', company_code: 'COMP-A' },
    { house_code: 'H-01', farm_code: null, company_code: 'COMP-A' },
    { house_code: 'H-01', farm_code: 'FARM-A', company_code: null },
    { house_code: 'H-01', farm_code: 'FARM-A', company_code: ' ' },
    { house_code: 'H-01', farm_code: 'FARM-A', company_code: 'ALL' },
    { house_code: 'H-01', farm_code: 'FARM-A', company_code: 'UNKNOWN' },
  ])('rejects incomplete or placeholder identity %j', async row => {
    const service = new OrgOwnershipService({ query: jest.fn().mockResolvedValue([row]) } as never);
    await expect(service.resolveHouseIdentity('H-01')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown caller house before querying and supports identity without an optional site', async () => {
    const query = jest.fn().mockResolvedValue([{ house_code: 'H-01', farm_code: 'FARM-A', company_code: 'COMP-A', site_code: null }]);
    const service = new OrgOwnershipService({ query } as never);
    await expect(service.resolveHouseIdentity('UNKNOWN')).rejects.toBeInstanceOf(BadRequestException);
    expect(query).not.toHaveBeenCalled();
    await expect(service.resolveHouseIdentity('H-01')).resolves.toEqual({ houseCode: 'H-01', farmCode: 'FARM-A', companyCode: 'COMP-A' });
  });

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

  it('rejects a SITE that maps to multiple ACTIVE farms and ignores empty input', async () => {
    const query = jest.fn().mockResolvedValue([
      { farm_code: 'FARM-A', site_code: 'SITE-A' },
      { farm_code: 'FARM-B', site_code: 'SITE-A' },
    ]);
    const service = new OrgOwnershipService({ query } as never);
    await expect(service.resolveFarmCodesBySiteCodes([' SITE-A ', 'SITE-A']))
      .rejects.toThrow('映射了多个 ACTIVE 农场');
    expect(query.mock.calls[0][0]).toContain("status = 'ACTIVE'");
    expect(query.mock.calls[0][0]).toContain("mapped_site_code");
    expect(query.mock.calls[0][1]).toEqual([['SITE-A']]);
    await expect(service.resolveFarmCodesBySiteCodes([])).resolves.toEqual([]);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it('projects one ACTIVE farm per SITE', async () => {
    const service = new OrgOwnershipService({ query: jest.fn().mockResolvedValue([
      { farm_code: 'FARM-A', site_code: 'SITE-A' },
      { farm_code: 'FARM-B', site_code: 'SITE-B' },
    ]) } as never);
    await expect(service.resolveFarmCodesBySiteCodes(['SITE-A', 'SITE-B']))
      .resolves.toEqual(['FARM-A', 'FARM-B']);
  });
});
