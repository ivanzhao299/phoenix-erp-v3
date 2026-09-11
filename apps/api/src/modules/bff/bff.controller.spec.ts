import { REQUIRE_MENU_KEY, MenuRequirement } from '../../common/guards/menu.guard';
import { DashboardBffController, PackagingTerminalBffController, UsersBffController } from './bff.controller';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';

describe('UsersBffController', () => {
  it('creates a non-POS user without store_code and persists SQL NULL', async () => {
    const em = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('INSERT INTO sys_user')) return [{ user_id: 42 }];
        return [];
      }),
    };
    const controller = new UsersBffController(em as never);

    await expect(controller.createUser({
      username: 'new-user',
      real_name_zh: '新用户',
      password: 'Password123',
      user_type: 'NORMAL',
    }, {})).resolves.toMatchObject({ code: 200, data: { id: 42 } });

    const insertCall = em.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO sys_user'));
    expect(insertCall).toBeDefined();
    expect(insertCall?.[1]).toEqual([
      'new-user',
      expect.any(String),
      '新用户',
      null,
      null,
    ]);
  });
});

describe('DashboardBffController', () => {
  function buildController() {
    const em = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM inv_batches') && sql.includes('SUM(qty_available)')) {
          return [{ total: 999, batch_count: 3, params }];
        }
        if (sql.includes('FROM brd_flocks')) {
          return [{ total: 1200, params }];
        }
        return [];
      }),
    };

    return {
      controller: new DashboardBffController(em as never),
      em,
    };
  }

  describe('getKpi', () => {
    it('uses all laying flock statuses for group KPI population', async () => {
      const { controller, em } = buildController();

      const res = await controller.getKpi({
        user: { username: 'admin', storeCode: 'ALL', permissions: ['*'] },
      });

      const flockCall = em.query.mock.calls.find(([sql]) => String(sql).includes('FROM brd_flocks'));
      expect(flockCall).toBeDefined();
      expect(String(flockCall?.[0])).toContain("UPPER(status) IN ('LAYING','PEAK','DECLINING')");
      expect(flockCall?.[1]).toEqual([]);
      expect(res.data.meta.layingTotal).toBe(1200);
    });

    it('reports dashboard stock from flock population instead of egg inventory balance', async () => {
      const { controller } = buildController();

      const res = await controller.getKpi({
        user: { username: 'admin', storeCode: 'ALL', permissions: ['*'] },
      });

      expect(res.data.stats.stock).toEqual({ value: '1,200', unit: '羽', trend: null });
      expect(res.data.meta.stockAvailableTotal).toBe(999);
      expect(res.data.meta.stockMetricSource).toBe('UPPER(brd_flocks.status) IN LAYING/PEAK/DECLINING SUM(current_qty)');
      expect(res.data.meta.eggInventoryMetricSource).toBe('inv_batches.status=AVAILABLE SUM(qty_available)');
    });

    it('keeps farm scope while counting all laying flocks for restricted KPI population', async () => {
      const { controller, em } = buildController();

      await controller.getKpi({
        user: { username: 'farm-manager', storeCode: 'LPH_MENGSAI', permissions: [] },
      });

      const flockCall = em.query.mock.calls.find(([sql]) => String(sql).includes('FROM brd_flocks'));
      expect(flockCall).toBeDefined();
      expect(String(flockCall?.[0])).toContain("UPPER(status) IN ('LAYING','PEAK','DECLINING')");
      expect(String(flockCall?.[0])).toContain('farm_code = $1');
      expect(flockCall?.[1]).toEqual(['LPH_MENGSAI']);
    });
  });
});

describe('PackagingTerminalBffController', () => {
  const houseScope = { resolve: jest.fn().mockResolvedValue({ isGlobal: true }), assertActiveHouseOwnership: jest.fn().mockResolvedValue({ company_code: 'COMP-A' }) };
  it('does not report packing success when the database schema is unavailable', async () => {
    const em: any = { query: jest.fn().mockRejectedValue(new Error('column shift_id does not exist')) };
    em.transaction = (work: any) => work(em);
    const controller = new PackagingTerminalBffController(em, {} as never, houseScope as never);
    await expect(controller.submitPacking({ shiftId: 1, gradingCodes: ['GC-A'], idempotencyKey: 'packing-test',
      batches: [{ grade: 'A', boxes: 2, eggs: 360 }] })).rejects.toThrow('column shift_id does not exist');
    expect(em.query.mock.calls.some(([sql]: any[]) => sql.includes('INSERT INTO pkg_packing_records'))).toBe(false);
  });

  it('rejects an empty packing submission before creating a handover candidate', async () => {
    const em = { query: jest.fn() };
    (em as any).transaction ??= async (work: any) => work(em);
    const controller = new PackagingTerminalBffController(em as never, {} as never, houseScope as never);

    await expect(controller.submitPacking({ batches: [] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.submitPacking({ batches: [] })).rejects.toThrow('batches 必须是非空数组');
    expect(em.query).not.toHaveBeenCalled();
  });

  it.each([
    [{ grade: 'A', boxes: -1, eggs: 360 }, 'batches[0].boxes 必须是有限正数'],
    [{ grade: 'A', boxes: 2, eggs: '360' }, 'batches[0].eggs 必须是有限正数'],
    [{ grade: '', boxes: 2, eggs: 360 }, 'batches[0].grade 必须是非空字符串'],
  ])('rejects malformed packing batches before touching the database', async (batch, message) => {
    const em = { query: jest.fn() };
    (em as any).transaction ??= async (work: any) => work(em);
    const controller = new PackagingTerminalBffController(em as never, {} as never, houseScope as never);

    await expect(controller.submitPacking({ batches: [batch] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.submitPacking({ batches: [batch] })).rejects.toThrow(message);
    expect(em.query).not.toHaveBeenCalled();
  });

  it('inserts packing under a transaction after checking source ownership and remaining quantity', async () => {
    const em: any = { query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM pkg_work_shifts')) return [{ is_test: false, status: 'OPEN', date_text: '2026-08-21' }];
      if (sql.includes('FROM brd_farms')) return [{farm_code:'F',company_code:'C'}];
      if (sql.includes('SELECT gr.*')) return [{ code: 'GC-A', shift_id: 1, outputs_json: { A: 360 } }];
      if (sql.includes('FROM product_grades')) return [{ status:'ACTIVE', is_saleable:true, is_storable:true }];
      if (sql.includes('FROM packaging_specs')) return [{ status:'ACTIVE', spec_code:'SPEC', qty_per_unit:180 }];
      if (sql.includes('FROM product_skus')) return [{ status:'ACTIVE', sku_code:'SKU', product_code:'P' }];
      if (sql.includes('FROM mst_products')) return [{ status:'ACTIVE', product_code:'P' }];
      return [];
    }) };
    em.transaction = (work: any) => work(em);
    const controller = new PackagingTerminalBffController(em, {} as never, houseScope as never);
    const batches = [{ grade: 'A', boxes: 2, eggs: 360, specId: 'SPEC', productCode: 'P', skuCode: 'SKU' }];
    const result = await controller.submitPacking({ shiftId: 1, gradingCodes: ['GC-A'], batches, idempotencyKey: 'packing-test' }, {user:{id:1}});
    expect(result.data).toMatchObject({ totalBoxes: 2, totalEggs: 360, idempotentReplay: false });
    expect(em.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO pkg_packing_records'),
      [result.data.code, 'GC-A', JSON.stringify(['GC-A']), '2026-08-21', JSON.stringify(batches), 2, 360, 1, false, 'packing-test', expect.any(String)]);
  });

  it('allows collection editors to open a collection shift', () => {
    const requirement = Reflect.getMetadata(
      REQUIRE_MENU_KEY,
      PackagingTerminalBffController.prototype.openShift,
    ) as MenuRequirement;

    expect(requirement).toEqual({
      menu: 'MENU_PKG_OP',
      perm: 'E',
      altMenus: ['MENU_PROD_COLLECTION'],
      denialMessage: undefined,
    });
  });

  it('allows collection editors to close a collection shift', () => {
    const requirement = Reflect.getMetadata(
      REQUIRE_MENU_KEY,
      PackagingTerminalBffController.prototype.closeShift,
    ) as MenuRequirement;

    expect(requirement).toEqual({
      menu: 'MENU_PKG_OP',
      perm: 'E',
      altMenus: ['MENU_PROD_COLLECTION'],
      denialMessage: undefined,
    });
  });

  it('rejects inconsistent collection quantities before touching the database', async () => {
    const em = { query: jest.fn() };
    (em as any).transaction ??= async (work: any) => work(em);
    const controller = new PackagingTerminalBffController(em as never, {} as never);

    await expect(controller.receiveBatch({
      houseCode: 'HOUSE-01',
      totalQty: 100,
      dirtyQty: 10,
      crackedQty: 5,
      receivedQty: 90,
    }, { user: { id: 1 } })).rejects.toThrow('采集数量');

    expect(em.query).not.toHaveBeenCalled();
  });

  it('accepts the legacy gradable quantity and stores the canonical total received quantity', async () => {
    const em = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('FROM pkg_work_shifts')) return [{ id: 1, is_test: false, status: 'OPEN' }];
        if (sql.includes('FROM brd_houses h')) return [{ farm_code: 'FARM-A', company_code: 'COMP-A', site_code: 'SITE-A' }];
        if (sql.includes('SELECT * FROM pkg_source_batches')) return [{ id: 1, batch_code: 'SRC-LEGACY' }];
        return [];
      }),
    };
    (em as any).transaction ??= async (work: any) => work(em);
    const controller = new PackagingTerminalBffController(em as never, {} as never, houseScope as never);

    await expect(controller.receiveBatch({
      batchCode: 'SRC-LEGACY',
      houseCode: 'HOUSE-01',
      totalQty: 100,
      dirtyQty: 10,
      crackedQty: 5,
      receivedQty: 85,
    }, { user: { id: 1 } })).resolves.toMatchObject({ code: 200 });

    const insertCall = em.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO pkg_source_batches'));
    expect(insertCall).toBeDefined();
    expect(insertCall?.[1]).toEqual(expect.arrayContaining(['HOUSE-01', 100, 10, 5, 100]));
  });

  it('persists all source quantity columns for a new received batch', async () => {
    const em = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('FROM pkg_work_shifts')) return [{ id: 1, is_test: false, status: 'OPEN' }];
        if (sql.includes('FROM brd_houses h')) return [{ farm_code: 'FARM-A', company_code: 'COMP-A', site_code: 'SITE-A' }];
        if (sql.includes('SELECT * FROM pkg_source_batches')) return [{ id: 1, batch_code: 'SRC-1' }];
        return [];
      }),
    };
    (em as any).transaction ??= async (work: any) => work(em);
    const controller = new PackagingTerminalBffController(em as never, {} as never, houseScope as never);

    await expect(controller.receiveBatch({
      batchCode: 'SRC-1',
      houseCode: 'HOUSE-01',
      totalQty: 100,
      dirtyQty: 10,
      crackedQty: 5,
      receivedQty: 100,
    }, { user: { id: 1 } })).resolves.toMatchObject({ code: 200 });

    const insertCall = em.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO pkg_source_batches'));
    expect(insertCall).toBeDefined();
    expect(String(insertCall?.[0])).toContain('total_qty, dirty_qty, cracked_qty');
    expect(insertCall?.[1]).toEqual(expect.arrayContaining(['HOUSE-01', 100, 10, 5, 100]));
  });

  it('summarizes every handover stage for the requested shift', async () => {
    const em = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM pkg_work_shifts')) return [{ id: 42, is_test: false, date_text: '2026-07-22', production_date: '2026-07-22', site_id:'FARM' }];
        if (sql.includes('FROM brd_farms')) return [{ company_code:'COMP', farm_code:'FARM' }];
        if (sql.includes('SELECT DISTINCT')) return [];
        if (sql.includes('FROM pkg_source_batches')) return [{ qty: 1200, weight: 72.5 }];
        if (sql.includes('FROM pkg_exceptions')) return [{ open_count: 1, closed_count: 2 }];
        if (sql.includes('FROM pkg_grading_records')) {
          return [
            { outputs_json: { A_LARGE: 400, A_MEDIUM: 300 } },
            { outputs_json: JSON.stringify({ A_LARGE: 50, BROKEN: 10 }) },
          ];
        }
        if (sql.includes('FROM pkg_packing_records WHERE shift_id')) return [{ boxes: 30, eggs: 900 }];
        if (sql.includes('FROM pkg_label_print_logs')) return [{ count: 30 }];
        if (sql.includes('FROM pkg_handover_records')) return [{ boxes: 28, pallets: 2 }];
        return [{ params }];
      }),
    };
    (em as any).transaction ??= async (work: any) => work(em);
    const controller = new PackagingTerminalBffController(em as never, {} as never);

    const response = await new PackagingTerminalBffController(em as never, {} as never, houseScope as never).getShiftSummary('2026-07-22', '42', {user:{id:1}});

    expect(response.data).toMatchObject({
      receivedQty: 1200,
      gradingOutputs: { A_LARGE: 450, A_MEDIUM: 300, BROKEN: 10 },
      gradedQty: 760,
      shiftPackedBoxes: 30,
      shiftPackedEggs: 900,
      shiftLabelCount: 30,
      shiftWarehousedBoxes: 28,
      shiftWarehousedPallets: 2,
    });
    const scopedCalls = em.query.mock.calls.filter(([sql]) =>
      /pkg_(source_batches|grading_records|handover_records)/.test(String(sql)) && !String(sql).includes('SELECT DISTINCT'),
    );
    expect(scopedCalls.every(([, params]) => params?.[1] === 42)).toBe(true);
  });

  it('reports warehouse handover as committed only when handover and inventory evidence both exist', async () => {
    const em = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM pkg_handover_records')) {
          return [{
            code: 'WH-20260725-1',
            packing_code: 'PKG-20260725-1',
            box_count: 6,
            created_at: '2026-07-25T08:00:00.000Z',
          }];
        }
        if (sql.includes('COUNT(*)::int AS batch_count')) {
          return [{ batch_count: 2, total_inbound: 180, ledger_inbound: 180 }];
        }
        if (sql.includes('SELECT p.*')) return [{ is_test: false, status: 'ACTIVE', shift_id: 1 }];
        if (sql.includes('SELECT total_eggs')) return [{ total_eggs: 180 }];
        return [];
      }),
    };
    const pkgInv = {
      getTerminalInventoryMode: jest.fn().mockResolvedValue('PACKAGING_INVENTORY'),
    };
    (em as any).transaction ??= async (work: any) => work(em);
    const controller = new PackagingTerminalBffController(em as never, pkgInv as never);

    await expect(
      controller.getWarehouseHandoverStatus('PKG-20260725-1'),
    ).resolves.toMatchObject({
      code: 200,
      data: {
        state: 'COMMITTED',
        committed: true,
        handoverCode: 'WH-20260725-1',
        boxCount: 6,
        inventoryBatchCount: 2,
        totalInbound: 180,
      },
    });
  });

  it.each([['PACKAGING_INBOUND', true], ['TEMP_PRODUCTION_INBOUND', true], ['TEMP_PRODUCTION_INBOUND', false]])(
    'posts handover only after %s evidence validates (%s)', async (mode, ok) => {
      const em: any = { query: jest.fn(async (sql: string) => {
        if (sql.includes('SELECT p.*')) return [{ is_test:false,status:'ACTIVE',shift_id:1,production_date:'2026-07-25',total_boxes:1,total_eggs:30,grading_codes_json:['G'] }];
        if (sql.includes('FROM pkg_work_shifts')) return [{id:1,is_test:false,date_text:'2026-07-25',site_id:'F'}];
        if (sql.includes('FROM brd_farms')) return [{company_code:'COMP',farm_code:'F'}];
        if (sql.includes('FROM wms_locations')) return [{company_code:'COMP',warehouse_code:'W'}];
        if (sql.includes('AS batches')) return [{batches:0,ledgers:0}];
        if (sql.includes('SELECT g.code')) return [{code:'G',status:'ACTIVE',is_test:false,source_is_test:false,batch_status:'RECEIVED',house_code:'H'}];
        return [];
      }) };
      em.transaction = (work: any) => work(em);
      const pkgInv = { completeTerminalPacking: jest.fn().mockResolvedValue({ totalInbound:mode==='PACKAGING_INBOUND'?30:0, skippedByMode:mode!=='PACKAGING_INBOUND', mode }),
        verifyTerminalTempEvidence: jest.fn().mockResolvedValue({ok}) };
      const controller = new PackagingTerminalBffController(em, pkgInv as never, houseScope as never);
      const action = controller.confirmHandover({packingCode:'PKG-TEST',boxes:['B'],location:'L',receiver:'R'}, {user:{id:1}});
      if (ok) await expect(action).resolves.toMatchObject({data:{inventoryOk:true}});
      else await expect(action).rejects.toThrow('上游库存证据未对平');
      expect(em.query.mock.calls.some(([sql]: any[]) => sql.includes('INSERT INTO pkg_handover_records'))).toBe(ok);
      expect(pkgInv.completeTerminalPacking).toHaveBeenCalledWith('PKG-TEST', expect.objectContaining({companyCode:'COMP',warehouseCode:'W',locationCode:'L',manager:em}));
    });

  it('keeps a legacy TEMP-mode handover committed after reload', async () => {
    const em = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM pkg_handover_records')) {
          return [{
            code: 'WH-20260725-TEMP',
            packing_code: 'PKG-20260725-NO-STOCK',
            box_count: 1,
            created_at: '2026-07-25T08:00:00.000Z',
          }];
        }
        if (sql.includes('COUNT(*)::int AS batch_count')) {
          return [{ batch_count: 0, total_inbound: 0 }];
        }
        if (sql.includes('SELECT p.*')) return [{ is_test: false, status: 'ACTIVE', shift_id: 1 }];
        if (sql.includes('SELECT total_eggs')) {
          return [{ total_eggs: 540 }];
        }
        return [];
      }),
    };
    const pkgInv = {
      getTerminalInventoryMode: jest.fn().mockResolvedValue('TEMP_PRODUCTION_INBOUND'),
      verifyTerminalTempEvidence: jest.fn().mockResolvedValue({
        ok: false, expectedQty: 540, batchQty: 0, ledgerQty: 0, batchCount: 0,
      }),
    };
    (em as any).transaction ??= async (work: any) => work(em);
    const controller = new PackagingTerminalBffController(em as never, pkgInv as never);

    await expect(
      controller.getWarehouseHandoverStatus('PKG-20260725-NO-STOCK'),
    ).resolves.toMatchObject({
      code: 200,
      data: {
        state: 'HANDOVER_ONLY',
        committed: false,
        inventoryMode: 'TEMP_PRODUCTION_INBOUND',
        inventoryBatchCount: 0,
        totalInbound: 0,
        handoverQuantity: 540,
        inventoryPosted: false,
      },
    });
  });
});
