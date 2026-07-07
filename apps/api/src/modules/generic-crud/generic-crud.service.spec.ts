import { GenericCrudService } from './generic-crud.service';

describe('GenericCrudService', () => {
  const buildSvc = (queryImpl: jest.Mock) => {
    const em = {
      query: queryImpl,
    };
    return { em, svc: new GenericCrudService(em as never) };
  };

  describe('findAll', () => {
    it('translates breeding daily culling reason codes to Chinese labels', async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce([
          { id: 1, culling_reason: 'LOW_PRODUCTION', mortality_reason: 'INJURY' },
          { id: 2, culling_reason: 'AGE；SICKNESS', mortality_reason: null },
        ])
        .mockResolvedValueOnce([
          { dict_type: 'BRD_CULLING_REASON', dict_code: 'LOW_PRODUCTION', label: '产蛋率低' },
          { dict_type: 'BRD_CULLING_REASON', dict_code: 'AGE', label: '老龄' },
          { dict_type: 'BRD_CULLING_REASON', dict_code: 'SICKNESS', label: '患病' },
          { dict_type: 'BRD_MORTALITY_REASON', dict_code: 'INJURY', label: '外伤' },
        ]);
      const { svc } = buildSvc(query);

      const rows = await svc.findAll('brd_daily_logs', {});

      expect(rows).toEqual([
        {
          id: 1,
          culling_reason: '产蛋率低',
          culling_reason_code: 'LOW_PRODUCTION',
          mortality_reason: '外伤',
          mortality_reason_code: 'INJURY',
        },
        {
          id: 2,
          culling_reason: '老龄；患病',
          culling_reason_code: 'AGE；SICKNESS',
          mortality_reason: null,
        },
      ]);
      expect(query).toHaveBeenCalledTimes(2);
      expect(query.mock.calls[1][0]).toContain('FROM sys_dict');
      expect(query.mock.calls[1][1]).toEqual([
        'BRD_CULLING_REASON',
        ['LOW_PRODUCTION', 'AGE', 'SICKNESS'],
        'BRD_MORTALITY_REASON',
        ['INJURY'],
      ]);
    });

    it('keeps manual breeding daily reasons when no dictionary label exists', async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce([{ id: 1, culling_reason: '现场手填原因' }])
        .mockResolvedValueOnce([]);
      const { svc } = buildSvc(query);

      await expect(svc.findAll('brd_daily_logs', {})).resolves.toEqual([
        { id: 1, culling_reason: '现场手填原因' },
      ]);
    });

    it('does not query dictionaries for other generic CRUD tables', async () => {
      const query = jest.fn().mockResolvedValueOnce([{ id: 1, dict_code: 'LOW_PRODUCTION' }]);
      const { svc } = buildSvc(query);

      await expect(svc.findAll('sys_dict', {})).resolves.toEqual([{ id: 1, dict_code: 'LOW_PRODUCTION' }]);
      expect(query).toHaveBeenCalledTimes(1);
    });
  });
});
