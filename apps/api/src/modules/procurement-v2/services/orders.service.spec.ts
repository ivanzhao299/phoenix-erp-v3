import { OrdersService } from './orders.service';

describe('OrdersService list keyword search', () => {
  function buildService() {
    const qb = {
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn(async () => [[], 0]),
    };
    const poRepo = {
      createQueryBuilder: jest.fn(() => qb),
    };
    const itemRepo = {
      createQueryBuilder: jest.fn(),
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
    expect(qb.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('CAST(p.id AS TEXT) ILIKE :kw'),
      { kw: '%178409%' },
    );
    expect(itemRepo.createQueryBuilder).not.toHaveBeenCalled();
  });
});
