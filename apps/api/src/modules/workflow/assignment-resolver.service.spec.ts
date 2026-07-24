import { AssignmentResolverService } from './assignment-resolver.service';

describe('AssignmentResolverService ORG_MANAGER', () => {
  const dataScope = {} as any;

  it('resolves the nearest manager from the starter primary organization chain', async () => {
    const ds = {
      query: jest
        .fn()
        .mockResolvedValueOnce([{ manager_user_id: '42' }])
        .mockResolvedValueOnce([{
          user_id: '42',
          username: 'business.manager',
          real_name: '业务负责人',
        }]),
    } as any;
    const service = new AssignmentResolverService(ds, dataScope);

    const result = await service.resolveApprovers({
      approverType: 'ORG_MANAGER',
      bizContext: {
        starterUserId: '1',
        companyCode: 'COMP-LAO-AGRI',
      },
    });

    expect(result).toEqual([{
      userId: '42',
      username: 'business.manager',
      displayName: '业务负责人',
      roleCode: null,
      source: 'ORG_MANAGER',
    }]);
    expect(ds.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('WITH RECURSIVE org_chain'),
      ['1'],
    );
    expect(ds.query).toHaveBeenCalledTimes(2);
  });

  it('keeps the company-node fallback when the starter organization has no manager', async () => {
    const ds = {
      query: jest
        .fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ manager_user_id: '77', manager_name: '公司负责人' }])
        .mockResolvedValueOnce([{
          user_id: '77',
          username: 'company.manager',
          real_name: '公司负责人',
        }]),
    } as any;
    const service = new AssignmentResolverService(ds, dataScope);

    const result = await service.resolveApprovers({
      approverType: 'ORG_MANAGER',
      bizContext: {
        starterUserId: '1',
        companyCode: 'COMP-LAO-AGRI',
      },
    });

    expect(result[0]?.userId).toBe('77');
    expect(result[0]?.source).toBe('ORG_MANAGER');
    expect(ds.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('WHERE company_code = $1'),
      ['COMP-LAO-AGRI'],
    );
  });
});
