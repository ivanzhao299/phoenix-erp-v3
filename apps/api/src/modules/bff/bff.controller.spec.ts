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
  const houseScope = { assertActiveHouseOwnership: jest.fn().mockResolvedValue({ company_code: 'COMP-A' }) };
  it('does not report packing success when the packing record write fails', async () => {
    const em = {
      query: jest.fn().mockRejectedValue(new Error('column shift_id does not exist')),
    };
    const controller = new PackagingTerminalBffController(em as never, {} as never, houseScope as never);

    const result = controller.submitPacking({
      productionDate: '2026-08-21',
      batches: [{ grade: 'A', boxes: 2, eggs: 360 }],
    });

    await expect(result).rejects.toBeInstanceOf(InternalServerErrorException);
    await expect(result).rejects.toMatchObject({
      status: 500,
      response: expect.objectContaining({
        message: '包装记录写入失败，请稍后重试或联系管理员',
      }),
    });
    await expect(result).rejects.not.toThrow('column shift_id does not exist');
  });

  it('rejects an empty packing submission before creating a handover candidate', async () => {
    const em = { query: jest.fn() };
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
    const controller = new PackagingTerminalBffController(em as never, {} as never, houseScope as never);

    await expect(controller.submitPacking({ batches: [batch] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(controller.submitPacking({ batches: [batch] })).rejects.toThrow(message);
    expect(em.query).not.toHaveBeenCalled();
  });

  it('inserts a valid packing record with the existing code and conflict semantics', async () => {
    const em = { query: jest.fn().mockResolvedValue([]) };
    const controller = new PackagingTerminalBffController(em as never, {} as never, houseScope as never);
    const batches = [{ grade: 'A', boxes: 2, eggs: 360 }];

    const result = await controller.submitPacking({
      productionDate: '2026-08-21',
      gradingCodes: [' GC-A ', 42, ''],
      shiftId: 'shift-1',
      batches,
    });

    expect(result).toMatchObject({ code: 200, data: { totalBoxes: 2, totalEggs: 360 } });
    expect(result.data.code).toMatch(/^PKG-20260821-\d{6}$/);
    expect(em.query).toHaveBeenCalledTimes(1);
    expect(em.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (code) DO NOTHING'),
      [result.data.code, 'GC-A', JSON.stringify(['GC-A']), '2026-08-21',
        JSON.stringify(batches), 2, 360, 'shift-1'],
    );
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
        if (sql.includes('FROM brd_houses h')) return [{ farm_code: 'FARM-A', company_code: 'COMP-A', site_code: 'SITE-A' }];
        if (sql.includes('SELECT * FROM pkg_source_batches')) return [{ id: 1, batch_code: 'SRC-LEGACY' }];
        return [];
      }),
    };
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
        if (sql.includes('FROM brd_houses h')) return [{ farm_code: 'FARM-A', company_code: 'COMP-A', site_code: 'SITE-A' }];
        if (sql.includes('SELECT * FROM pkg_source_batches')) return [{ id: 1, batch_code: 'SRC-1' }];
        return [];
      }),
    };
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

  it('keeps total collection separate from the gradable balance', async () => {
    const em = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('AS total_gradable')) {
          return [{ total_received: 800, total_gradable: 780 }];
        }
        if (sql.includes('AS total_graded')) return [{ total_graded: 0 }];
        return [];
      }),
    };
    const controller = new PackagingTerminalBffController(em as never, {} as never);

    await expect(controller.submitGrading({
      productionDate: '2026-07-21',
      outputs: { GRADE_1: 781 },
    })).resolves.toMatchObject({ code: 200, data: { totalOutput: 781, warnings: [expect.stringContaining('可分级余量')] } });

    const sourceCall = em.query.mock.calls.find(([sql]) => String(sql).includes('AS total_gradable'));
    expect(String(sourceCall?.[0])).toContain('NULLIF(total_qty, 0)');
    expect(String(sourceCall?.[0])).toContain("batch_status IN ('RECEIVED', 'COMPLETED', 'CLOSED')");
  });

  it('accepts the reported grading batch when output exactly matches the remaining gradable quantity', async () => {
    const em = {
      query: jest.fn(async (sql: string, _params?: unknown[]) => {
        if (sql.includes('AS total_gradable')) {
          return [{ total_received: 500, total_gradable: 488 }];
        }
        if (sql.includes('AS total_graded')) return [{ total_graded: 198 }];
        return [];
      }),
    };
    const controller = new PackagingTerminalBffController(em as never, {} as never);

    await expect(controller.submitGrading({
      productionDate: '2026-07-27',
      outputs: { EGG_GRADE_1: 200, EGG_GRADE_2: 40, EGG_GRADE_3: 50 },
    })).resolves.toMatchObject({
      code: 200,
      data: { code: expect.stringMatching(/^GRD-20260727-/) },
    });

    const insertCall = em.query.mock.calls.find(([sql]) =>
      String(sql).includes('INSERT INTO pkg_grading_records'),
    );
    expect(insertCall?.[1]).toEqual(expect.arrayContaining([290]));
  });

  it('normalizes numeric-string outputs from legacy terminals', async () => {
    const em = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('AS total_gradable')) return [{ total_received: 100, total_gradable: 100 }];
        if (sql.includes('AS total_graded')) return [{ total_graded: 0 }];
        return [];
      }),
    };
    const controller = new PackagingTerminalBffController(em as never, {} as never);
    await expect(controller.submitGrading({
      productionDate: '2026-08-18', outputs: { EGG_GRADE_1: '100' },
    })).resolves.toMatchObject({ code: 200 });
    const insertCall = em.query.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO pkg_grading_records'));
    expect((insertCall as any)?.[1]).toEqual(expect.arrayContaining([100, expect.any(String)]));
  });

  it('summarizes every handover stage for the requested shift', async () => {
    const em = {
      query: jest.fn(async (sql: string, params?: unknown[]) => {
        if (sql.includes('FROM pkg_work_shifts')) return [{ id: 42, production_date: '2026-07-22' }];
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
    const controller = new PackagingTerminalBffController(em as never, {} as never);

    const response = await controller.getShiftSummary('2026-07-22', '42');

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
      /pkg_(source_batches|grading_records|handover_records)/.test(String(sql)),
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
          return [{ batch_count: 2, total_inbound: 180 }];
        }
        return [];
      }),
    };
    const pkgInv = {
      getTerminalInventoryMode: jest.fn().mockResolvedValue('PACKAGING_INVENTORY'),
    };
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

  it('creates the handover record only after packaging inventory is posted', async () => {
    let inserted = false;
    const em = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM wms_locations')) return [{ location_code: 'WH-A' }];
        if (sql.includes('SELECT code, packing_code')) {
          return inserted ? [{
            code: 'WH-20260725-1',
            packing_code: 'PKG-20260725-1',
            box_count: 3,
            created_at: '2026-07-25T08:00:00.000Z',
          }] : [];
        }
        if (sql.includes('SELECT code') && sql.includes('FROM pkg_handover_records')) return [];
        if (sql.includes('INSERT INTO pkg_handover_records')) {
          inserted = true;
          return [];
        }
        if (sql.includes('COUNT(*)::int AS batch_count')) {
          return [{ batch_count: 1, total_inbound: 90 }];
        }
        return [];
      }),
    };
    const pkgInv = {
      completeTerminalPacking: jest.fn().mockResolvedValue({
        refNo: 'PKG-20260725-1',
        idempotent: false,
        totalInbound: 90,
      }),
      getTerminalInventoryMode: jest.fn().mockResolvedValue('PACKAGING_INVENTORY'),
    };
    const controller = new PackagingTerminalBffController(em as never, pkgInv as never);

    await expect(controller.confirmHandover({
      packingCode: 'PKG-20260725-1',
      boxes: ['BOX-1', 'BOX-2', 'BOX-3'],
      location: 'WH-A',
      receiver: 'tester',
      productionDate: '2026-07-25',
    })).resolves.toMatchObject({
      code: 200,
      data: {
        inventoryOk: true,
        status: { state: 'COMMITTED', committed: true },
      },
    });

    expect(pkgInv.completeTerminalPacking).toHaveBeenCalledWith(
      'PKG-20260725-1',
      { companyCode: undefined },
    );
    expect(em.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO pkg_handover_records'),
      expect.arrayContaining(['PKG-20260725-1', expect.any(String), 3]),
    );
  });

  it('does not report a TEMP-mode handover as successful when inventory evidence is missing', async () => {
    let inserted = false;
    const em = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM wms_locations')) return [{ location_code: 'LOC-1' }];
        if (sql.includes('SELECT code, packing_code')) {
          return inserted ? [{
            code: 'WH-20260725-TEMP',
            packing_code: 'PKG-20260725-NO-STOCK',
            box_count: 1,
            created_at: '2026-07-25T08:00:00.000Z',
          }] : [];
        }
        if (sql.includes('SELECT code') && sql.includes('FROM pkg_handover_records')) return [];
        if (sql.includes('INSERT INTO pkg_handover_records')) {
          inserted = true;
          return [];
        }
        if (sql.includes('COUNT(*)::int AS batch_count')) {
          return [{ batch_count: 0, total_inbound: 0 }];
        }
        return [];
      }),
    };
    const pkgInv = {
      completeTerminalPacking: jest.fn().mockResolvedValue({
        refNo: 'PKG-20260725-NO-STOCK',
        idempotent: false,
        totalInbound: 0,
        skippedByMode: false,
        mode: 'TEMP_PRODUCTION_INBOUND',
      }),
      getTerminalInventoryMode: jest.fn().mockResolvedValue('TEMP_PRODUCTION_INBOUND'),
    };
    const controller = new PackagingTerminalBffController(em as never, pkgInv as never);

    await expect(controller.confirmHandover({
      packingCode: 'PKG-20260725-NO-STOCK',
      boxes: ['BOX-1'],
      location: 'LOC-1',
    })).resolves.toMatchObject({
      code: 200,
      data: {
        inventoryOk: false,
        status: {
          state: 'PENDING',
          committed: false,
          inventoryBatchCount: 0,
          totalInbound: 0,
        },
      },
    });

    expect(em.query.mock.calls.some(([sql]) =>
      String(sql).includes('INSERT INTO pkg_handover_records'),
    )).toBe(false);
  });

  it('commits a TEMP-mode handover when inventory generation is intentionally skipped', async () => {
    let inserted = false;
    const em = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM wms_locations')) return [{ location_code: 'LOC-1' }];
        if (sql.includes('SELECT code, packing_code')) return inserted ? [{
          code: 'WH-20260725-TEMP-OK', packing_code: 'PKG-TEMP-OK', box_count: 1,
          created_at: '2026-07-25T08:00:00.000Z',
        }] : [];
        if (sql.includes('SELECT code') && sql.includes('FROM pkg_handover_records')) return [];
        if (sql.includes('INSERT INTO pkg_handover_records')) { inserted = true; return []; }
        if (sql.includes('COUNT(*)::int AS batch_count')) return [{ batch_count: 0, total_inbound: 0 }];
        return [];
      }),
    };
    const pkgInv = {
      completeTerminalPacking: jest.fn().mockResolvedValue({
        refNo: 'PKG-TEMP-OK', idempotent: false, totalInbound: 0,
        skippedByMode: true, mode: 'TEMP_PRODUCTION_INBOUND',
      }),
      getTerminalInventoryMode: jest.fn().mockResolvedValue('TEMP_PRODUCTION_INBOUND'),
    };
    const controller = new PackagingTerminalBffController(em as never, pkgInv as never);

    await expect(controller.confirmHandover({ packingCode: 'PKG-TEMP-OK', boxes: ['BOX-1'], location: 'LOC-1' }))
      .resolves.toMatchObject({ code: 200, data: {
        inventoryOk: true,
        status: { state: 'COMMITTED', committed: true, inventoryBatchCount: 0 },
      } });
    expect(inserted).toBe(true);
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
        if (sql.includes('SELECT total_eggs')) {
          return [{ total_eggs: 540 }];
        }
        return [];
      }),
    };
    const pkgInv = {
      getTerminalInventoryMode: jest.fn().mockResolvedValue('TEMP_PRODUCTION_INBOUND'),
    };
    const controller = new PackagingTerminalBffController(em as never, pkgInv as never);

    await expect(
      controller.getWarehouseHandoverStatus('PKG-20260725-NO-STOCK'),
    ).resolves.toMatchObject({
      code: 200,
      data: {
        state: 'COMMITTED',
        committed: true,
        inventoryMode: 'TEMP_PRODUCTION_INBOUND',
        inventoryBatchCount: 0,
        totalInbound: 0,
        handoverQuantity: 540,
        inventoryPosted: false,
      },
    });
  });
});
