import { FarmFeedService } from './farm-feed.service';

describe('FarmFeedService mobile house ownership', () => {
  function buildService(queryResults: unknown[][]) {
    const query = jest.fn();
    for (const result of queryResults) query.mockResolvedValueOnce(result);
    return {
      service: new FarmFeedService({ query } as never),
      query,
    };
  }

  it('creates a first house from the manager DataScope when legacy singular scope is empty', async () => {
    const { service, query } = buildService([
      [], // no sibling house exists yet
      [], // no duplicate code
      [], // insert
    ]);

    await expect(service.createHouse(
      { house_code: 'H-NEW', house_name: '新鸡舍', capacity: 12000 },
      {
        isGlobal: false,
        farmCode: null,
        siteCode: null,
        farmCodes: ['LPH-MS'],
        siteCodes: ['SITE-MS'],
        companyCodes: ['COMP-LAO-AGRI'],
      },
    )).resolves.toEqual({
      code: 200,
      data: {
        house_code: 'H-NEW',
        farm_code: 'LPH-MS',
        site_code: 'SITE-MS',
        company_code: 'COMP-LAO-AGRI',
      },
    });

    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('farm_code = ANY($1)'),
      [['LPH-MS'], ['SITE-MS']],
    );
    expect(query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO brd_houses'),
      ['H-NEW', '新鸡舍', 'LPH-MS', null, 'SITE-MS', 'COMP-LAO-AGRI', '蛋鸡舍', 12000],
    );
  });

  it('reuses an existing house ownership mapping within the allowed scope', async () => {
    const { service } = buildService([
      [{
        farm_code: 'LPH-MS',
        farm_name: '孟赛养殖场',
        site_code: 'SITE-MS',
        company_code: 'COMP-LAO-AGRI',
      }],
      [],
      [],
    ]);

    await expect(service.createHouse(
      { house_code: 'H-008', house_name: '8号舍' },
      {
        isGlobal: false,
        farmCode: 'LPH-MS',
        siteCode: null,
        farmCodes: ['LPH-MS'],
        companyCodes: ['COMP-LAO-AGRI'],
      },
    )).resolves.toMatchObject({
      data: {
        farm_code: 'LPH-MS',
        site_code: 'SITE-MS',
        company_code: 'COMP-LAO-AGRI',
      },
    });
  });

  it('fails closed when a mobile account can write more than one farm', async () => {
    const { service, query } = buildService([]);

    await expect(service.createHouse(
      { house_code: 'H-009', house_name: '9号舍' },
      {
        isGlobal: false,
        farmCode: 'LPH-MS',
        siteCode: null,
        farmCodes: ['LPH-MS', 'LPH-DP'],
        companyCodes: ['COMP-LAO-AGRI'],
      },
    )).rejects.toThrow('当前账号关联多个农场或公司');

    expect(query).not.toHaveBeenCalled();
  });
});
