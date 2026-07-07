import { GenericCrudService } from './generic-crud.service';
import { BadRequestException } from '@nestjs/common';

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

    it('aliases WMS location route id to location_code for generic CRUD clients', async () => {
      const query = jest.fn().mockResolvedValueOnce([
        { location_code: 'LOC-A-01', warehouse_code: 'WH-A', zone_code: 'ZONE-A' },
      ]);
      const { svc } = buildSvc(query);

      await expect(svc.findAll('wms_locations', {})).resolves.toEqual([
        { id: 'LOC-A-01', location_code: 'LOC-A-01', warehouse_code: 'WH-A', zone_code: 'ZONE-A' },
      ]);
    });

    it('aliases WMS zone route id to zone_code even when the table has a numeric id', async () => {
      const query = jest.fn().mockResolvedValueOnce([
        { id: 12, zone_code: 'ZONE-A', zone_name: 'A区' },
      ]);
      const { svc } = buildSvc(query);

      await expect(svc.findAll('wms_zones', {})).resolves.toEqual([
        { id: 'ZONE-A', zone_code: 'ZONE-A', zone_name: 'A区' },
      ]);
    });
  });

  describe('update', () => {
    it('returns success when UPDATE RETURNING matches a row', async () => {
      const query = jest.fn().mockResolvedValueOnce([[{ location_code: 'LOC-A-01' }], 1]);
      const { svc } = buildSvc(query);

      await expect(svc.update('wms_locations', 'location_code', 'LOC-A-01', { status: 'NORMAL' }))
        .resolves.toEqual({ msg: 'Updated successfully' });
      expect(query.mock.calls[0][0]).toContain('RETURNING "location_code"');
    });

    it('throws Record not found when UPDATE RETURNING matches no rows', async () => {
      const query = jest.fn().mockResolvedValueOnce([[], 0]);
      const { svc } = buildSvc(query);

      await expect(svc.update('wms_locations', 'location_code', 'missing', { status: 'NORMAL' }))
        .rejects.toThrow(BadRequestException);
    });
  });

  describe('remove', () => {
    it('returns success when DELETE RETURNING matches a row', async () => {
      const query = jest.fn().mockResolvedValueOnce([[{ zone_code: 'ZONE-A' }], 1]);
      const { svc } = buildSvc(query);

      await expect(svc.remove('wms_zones', 'zone_code', 'ZONE-A'))
        .resolves.toEqual({ msg: 'Deleted successfully' });
      expect(query.mock.calls[0][0]).toContain('RETURNING "zone_code"');
    });

    it('throws Record not found when DELETE RETURNING matches no rows', async () => {
      const query = jest.fn().mockResolvedValueOnce([[], 0]);
      const { svc } = buildSvc(query);

      await expect(svc.remove('wms_zones', 'zone_code', 'missing'))
        .rejects.toThrow(BadRequestException);
    });
  });
});
