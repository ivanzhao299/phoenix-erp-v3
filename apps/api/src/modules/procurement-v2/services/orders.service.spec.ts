import { OrdersService } from './orders.service';

describe('OrdersService list', () => {
  function buildService(listResult: [unknown[], number] = [[], 0]) {
    const qb = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(async () => listResult),
    };
    const poRepo = {
      createQueryBuilder: jest.fn(() => qb),
    };
    const itemQb = {
      select: jest.fn().mockReturnThis(),
      addSelect: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      groupBy: jest.fn().mockReturnThis(),
      getRawMany: jest.fn(async () => []),
    };
    const itemRepo = {
      createQueryBuilder: jest.fn(() => itemQb),
    };
    const scopeHelper = {
      applyToQb: jest.fn(),
      assertOwnership: jest.fn(),
      assertWritableOwnership: jest.fn(),
    };

    const service = new OrdersService(
      poRepo as never,
      itemRepo as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      scopeHelper as never,
      {} as never,
    );

    return { service, qb, poRepo, itemRepo, scopeHelper };
  }

  it('includes purchase order id in the list keyword predicate', async () => {
    const { service, qb, poRepo, itemRepo, scopeHelper } = buildService();

    const result = await service.list({ keyword: '178409' });

    expect(result).toEqual({ items: [], total: 0, page: 1, pageSize: 20 });
    expect(poRepo.createQueryBuilder).toHaveBeenCalledWith('p');
    expect(scopeHelper.applyToQb).toHaveBeenCalledWith(qb, { alias: 'p' });
    expect(qb.orderBy).toHaveBeenCalledWith('p.createdAt', 'DESC');
    expect(qb.addOrderBy).toHaveBeenCalledWith('p.id', 'DESC');
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('CAST(p.id AS TEXT) ILIKE :kw'),
      { kw: '%178409%' },
    );
    expect(itemRepo.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('returns the unmodified filtered record count when the page contains orders', async () => {
    const orders = [
      { id: '35', poNo: 'PO2-20260707-00002' },
      { id: '34', poNo: 'PO2-20260707-00001' },
    ];
    const { service, qb, scopeHelper } = buildService([orders, 5]);

    const result = await service.list({ page: 1, pageSize: 2 });

    expect(qb.getManyAndCount).toHaveBeenCalledTimes(1);
    expect(scopeHelper.applyToQb).toHaveBeenCalledWith(qb, { alias: 'p' });
    expect(result).toMatchObject({
      total: 5,
      page: 1,
      pageSize: 2,
      items: [
        { id: '35', itemCount: 0 },
        { id: '34', itemCount: 0 },
      ],
    });
  });
});
