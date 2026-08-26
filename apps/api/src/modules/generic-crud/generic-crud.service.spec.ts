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
    it.each(['company_code', 'site_code', 'store_code'])(
      'rejects retired brd_houses query parameter %s before SQL execution',
      async (column) => {
        const query = jest.fn();
        const { svc } = buildSvc(query);

        await expect(svc.findAll('brd_houses', { [column]: 'legacy' }))
          .rejects.toThrow('已永久退役');
        expect(query).not.toHaveBeenCalled();
      },
    );

    it('rejects retired brd_houses LIKE query parameters', async () => {
      const query = jest.fn();
      const { svc } = buildSvc(query);
      await expect(svc.findAll('brd_houses', { site_code__like: 'SITE-%' }))
        .rejects.toThrow(BadRequestException);
      expect(query).not.toHaveBeenCalled();
    });
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

    it('normalizes brd_daily_logs date fields to YYYY-MM-DD for overview aggregation', async () => {
      const query = jest.fn().mockResolvedValueOnce([
        {
          id: 1,
          log_date: new Date('2026-07-07T00:00:00.000Z'),
          business_date: '2026-07-07T00:00:00.000Z',
          eggs_produced: 479,
          mortality_qty: 2,
        },
      ]);
      const { svc } = buildSvc(query);

      await expect(svc.findAll('brd_daily_logs', {})).resolves.toEqual([
        {
          id: 1,
          log_date: '2026-07-07',
          business_date: '2026-07-07',
          eggs_produced: 479,
          mortality_qty: 2,
        },
      ]);

      expect(query).toHaveBeenCalledTimes(1);
      expect(query.mock.calls[0][0]).toContain('SELECT * FROM "brd_daily_logs"');
    });

    it('returns breeding daily logs in deterministic oldest-first order for the legacy client reversal', async () => {
      const query = jest.fn().mockResolvedValueOnce([]);
      const { svc } = buildSvc(query);

      await svc.findAll('brd_daily_logs', {});

      expect(query.mock.calls[0][0]).toContain(
        'ORDER BY "log_date" DESC, "created_at" DESC NULLS LAST, "id" DESC LIMIT $1 OFFSET $2',
      );
      expect(query.mock.calls[0][0]).toContain(
        'AS "daily_logs_page" ORDER BY "log_date" ASC, "created_at" ASC NULLS FIRST, "id" ASC',
      );
      expect(query.mock.calls[0][1]).toEqual([100, 0]);
    });

    it('keeps daily log reason label enrichment after date normalization', async () => {
      const query = jest
        .fn()
        .mockResolvedValueOnce([
          {
            id: 1,
            log_date: '2026-07-07T00:00:00.000Z',
            mortality_reason: 'DISEASE',
          },
        ])
        .mockResolvedValueOnce([
          {
            dict_type: 'BRD_MORTALITY_REASON',
            dict_code: 'DISEASE',
            label: '疾病',
          },
        ]);
      const { svc } = buildSvc(query);

      await expect(svc.findAll('brd_daily_logs', {})).resolves.toEqual([
        {
          id: 1,
          log_date: '2026-07-07',
          mortality_reason: '疾病',
          mortality_reason_code: 'DISEASE',
        },
      ]);

      expect(query).toHaveBeenCalledTimes(2);
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

    it.each(['wms_warehouses', 'wms_zones', 'wms_locations'])(
      'excludes finance mapping warehouses from operational CRUD table %s',
      async (table) => {
        const query = jest.fn().mockResolvedValueOnce([]);
        const { svc } = buildSvc(query);
        await svc.findAll(table, {});
        expect(query.mock.calls[0][0]).toContain("domain");
        expect(query.mock.calls[0][0]).toContain("'OPERATIONAL'");
      },
    );

    it('rejects finance mapping warehouses at generic WMS write boundary', async () => {
      const query = jest.fn().mockResolvedValueOnce([{ warehouse_code: 'CJ-WH-XINGCHI-01' }]);
      const { svc } = buildSvc(query);
      await expect(svc.assertOperationalWarehouseCodes(['CJ-WH-XINGCHI-01']))
        .rejects.toThrow('非操作仓禁止仓储操作');
    });
  });

  describe('findAllBreedingScoped', () => {
    it.each(['brd_houses', 'brd_flocks'] as const)(
      'uses the ACTIVE farm ownership chain for %s and ignores row snapshots',
      async (table) => {
      const query = jest.fn().mockResolvedValueOnce([]);
      const { svc } = buildSvc(query);

      await svc.findAllBreedingScoped(table, { status: ['LAYING', 'PEAK'] }, {
        farmCodes: ['FARM-DP'],
        siteCodes: ['SITE-DONGPENG-LAYER'],
        companyCodes: ['COMP-LAO-XINGCHI'],
      });

      expect(query.mock.calls[0][0]).toContain('"farm_code" = ANY($2)');
      expect(query.mock.calls[0][0]).toContain(`ownership_farm.farm_code = "${table}"."farm_code"`);
      expect(query.mock.calls[0][0]).toContain("NULLIF(to_jsonb(ownership_farm)->>'mapped_site_code', '') = ANY($3)");
      expect(query.mock.calls[0][0]).toContain('ownership_farm.company_code = ANY($4)');
      expect(query.mock.calls[0][0]).not.toContain(`"${table}"."site_code"`);
      expect(query.mock.calls[0][0]).not.toContain(`"${table}"."company_code"`);
      expect(query.mock.calls[0][1]).toEqual([
        ['LAYING', 'PEAK'], ['FARM-DP'], ['SITE-DONGPENG-LAYER'],
        ['COMP-LAO-XINGCHI'], 100, 0,
      ]);
      },
    );

    it('preserves the legacy visible-row set for consistent and sparse historical fixtures', () => {
      const fixtures = [
        { id: 'consistent', farmCode: 'FARM-DP', rowSite: 'SITE-DP', rowCompany: 'COMP-DP' },
        { id: 'sparse', farmCode: 'FARM-DP', rowSite: '', rowCompany: null },
        { id: 'other', farmCode: 'FARM-MS', rowSite: 'SITE-MS', rowCompany: 'COMP-MS' },
      ];
      const farms = new Map([
        ['FARM-DP', { site: 'SITE-DP', company: 'COMP-DP', status: 'ACTIVE' }],
        ['FARM-MS', { site: 'SITE-MS', company: 'COMP-MS', status: 'ACTIVE' }],
      ]);
      const scope = { sites: ['SITE-DP'], companies: ['COMP-DP'] };
      const legacy = fixtures.filter((row) => {
        const farm = farms.get(row.farmCode);
        return scope.sites.includes(row.rowSite || farm?.site || '')
          || scope.companies.includes(row.rowCompany || farm?.company || '');
      }).map((row) => row.id);
      const canonical = fixtures.filter((row) => {
        const farm = farms.get(row.farmCode);
        return farm?.status === 'ACTIVE'
          && (scope.sites.includes(farm.site) || scope.companies.includes(farm.company));
      }).map((row) => row.id);
      expect(canonical).toEqual(legacy);
      expect(canonical).toEqual(['consistent', 'sparse']);
    });

    it('returns no rows for a non-global user with no breeding dimension', async () => {
      const query = jest.fn().mockResolvedValueOnce([]);
      const { svc } = buildSvc(query);

      await svc.findAllBreedingScoped('brd_houses', {}, {
        farmCodes: [], siteCodes: [], companyCodes: [],
      });

      expect(query.mock.calls[0][0]).toContain('WHERE 1=0');
    });
  });

  describe('update', () => {
    it('does not auto-repair a retired brd_houses ownership column on direct service calls', async () => {
      const query = jest.fn();
      const { svc } = buildSvc(query);

      await expect(svc.update('brd_houses', 'house_code', 'H-1', { company_code: 'COMP-A' }))
        .rejects.toThrow('已永久退役');
      expect(query).not.toHaveBeenCalled();
    });
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

  describe('create', () => {
    it('does not auto-repair a retired brd_houses ownership column on direct service calls', async () => {
      const query = jest.fn();
      const { svc } = buildSvc(query);

      await expect(svc.create('brd_houses', { house_code: 'H-1', site_code: 'SITE-A' }))
        .rejects.toThrow('已永久退役');
      expect(query).not.toHaveBeenCalled();
    });

    it('stores an omitted farm SITE as explicit NULL', async () => {
      const query = jest.fn().mockResolvedValueOnce([]);
      const { svc } = buildSvc(query);
      await expect(svc.create('brd_farms', {
        farm_code: 'FARM-A', company_code: 'COMP-A', mapped_site_code: '',
      })).resolves.toEqual({ msg: 'Created successfully' });
      expect(query.mock.calls[0][0]).toContain('"mapped_site_code"');
      expect(query.mock.calls[0][1]).toContain(null);
    });

    it('rejects a farm mapping whose ACTIVE SITE belongs to another company', async () => {
      const query = jest.fn().mockResolvedValueOnce([{ company_code: 'COMP-B' }]);
      const { svc } = buildSvc(query);
      await expect(svc.create('brd_farms', {
        farm_code: 'FARM-A', company_code: 'COMP-A', mapped_site_code: 'SITE-B',
      })).rejects.toThrow('不一致');
      expect(query).toHaveBeenCalledTimes(1);
    });

    it('rejects a farm mapping to a missing or inactive SITE', async () => {
      const query = jest.fn().mockResolvedValueOnce([]);
      const { svc } = buildSvc(query);
      await expect(svc.create('brd_farms', {
        farm_code: 'FARM-A', company_code: 'COMP-A', mapped_site_code: 'SITE-X',
      })).rejects.toThrow('未指向 ACTIVE SITE');
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
