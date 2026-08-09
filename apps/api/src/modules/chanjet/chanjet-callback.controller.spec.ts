import { ForbiddenException } from '@nestjs/common';
import { assertChanjetProxyReadonly, ChanjetCallbackController } from './chanjet-callback.controller';

describe('Chanjet readonly proxy policy', () => {
  it.each([
    ['GET', '/accounting/openapi/cc/book/findByEnterpriseId'],
    ['GET', '/accounting/gl/glaccount/getInitBalanceLists/3533914511118750'],
    ['GET', '/accounting/gl/statistics/receive/3533914511118750'],
    ['POST', '/accounting/openapi/cc/department/list/3533914511118750'],
    ['POST', '/accounting/openapi/cc/party/custvendor/query/3533914511118750'],
    ['POST', '/accounting/openapi/cc/salesorder/list/3533914511118750'],
    ['POST', '/accounting/openapi/cc/purchasestockin/list/3533914511118750'],
    ['POST', '/accounting/openapi/cc/salesstockout/list/3533914511118750'],
    ['POST', '/accounting/openapi/cc/inv/onhandqty/3533914511118750'],
    ['POST', '/accounting/openapi/cc/inv/onhandqtylot/3533914511118750'],
    ['POST', '/accounting/openapi/cc/inv/finishedgoodsstock/list/3533914511118750'],
    ['POST', '/accounting/openapi/cc/inv/materialstock/list/3533914511118750'],
    ['POST', '/accounting/openapi/cc/inv/stockin/list/3533914511118750'],
    ['POST', '/accounting/openapi/cc/inv/stockout/list/3533914511118750'],
    ['POST', '/accounting/openapi/cc/inv/stocktransfer/list/3533914511118750'],
    ['POST', '/accounting/openapi/cc/inv/stockcount/list/3533914511118750'],
    ['POST', '/accounting/openapi/cc/retailstock/list/3533914511118750'],
    ['POST', '/accounting/gl/balance/rpt/3533914511118750'],
  ] as const)('allows reviewed readonly %s %s', (method, path) => {
    expect(() => assertChanjetProxyReadonly(method, path)).not.toThrow();
  });

  it.each([
    ['POST', '/accounting/openapi/cc/party/create/3533914511118750'],
    ['POST', '/accounting/openapi/cc/department/update/3533914511118750'],
    ['POST', '/accounting/gl/AcctgTrans/save/3533914511118750'],
    ['POST', '/accounting/internal/cc/salesorder/list'],
    ['POST', '/accounting/openapi/cc/purchasestockin/list'],
    ['POST', '/accounting/openapi/cc/inv/onhandqty'],
    ['POST', '/accounting/openapi/cc/inv/stockout/create/3533914511118750'],
    ['GET', '/accounting/openapi/cc/department/list/3533914511118750'],
  ] as const)('blocks unreviewed or method-mismatched %s %s', (method, path) => {
    expect(() => assertChanjetProxyReadonly(method, path)).toThrow(ForbiddenException);
  });
});

describe('Chanjet house project pilot', () => {
  const bookId = '3533914511118750';
  const categoryId = 2409064369358300;
  const syncSourceId = 3533914913770789;
  const listPayload = {
    data: {
      rows: [{
        id: 3566438559785777,
        code: '0001',
        name: '孟赛直营店',
        projectCategory: { id: categoryId, code: '00', name: '未分类' },
      }],
    },
  };
  const existingHouseListPayload = {
    data: {
      rows: [{
        id: '9001',
        code: 'HOUSE_MS_02',
        name: '2号鸡舍',
        projectCategory: { id: categoryId, code: '00', name: '未分类' },
      }],
    },
  };
  const createdHouseListPayload = {
    data: {
      rows: [
        ...listPayload.data.rows,
        {
          id: '9001', code: 'HOUSE_MS_02', name: '2号鸡舍',
          projectCategory: { id: categoryId, code: '00', name: '未分类' }, statusEnum: 'A',
        },
      ],
    },
  };
  const reactivatedHouseListPayload = {
    data: {
      rows: [{
        id: '9001', code: 'HOUSE_MS_02', name: '2号鸡舍',
        projectCategory: { id: categoryId, code: '00', name: '未分类' }, statusEnum: 'A',
      }],
    },
  };

  const setup = (callApiResults: unknown[], mirrorRows: Array<Record<string, unknown>> | Array<Array<Record<string, unknown>>> = [{
    external_id: '9001', external_code: 'HOUSE_MS_02', external_name: '2号鸡舍', status: 'ACTIVE',
  }]) => {
    const auth = { callApi: jest.fn() };
    for (const result of callApiResults) auth.callApi.mockResolvedValueOnce(result);
    const integration = {
      syncReadOnlyMirror: jest.fn().mockResolvedValue({
        results: [{ key: 'PROJECT', bookId, status: 'SUCCESS' }],
      }),
    };
    let mirrorQueryCount = 0;
    const ds = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM brd_houses')) {
          return [{ house_code: 'HOUSE_MS_02', house_name: '2号鸡舍', farm_code: 'LPH_MENGSAI', status: 'ACTIVE' }];
        }
        if (sql.includes('FROM chanjet_entity_snapshots')) {
          const rowsByAttempt = Array.isArray(mirrorRows[0])
            ? mirrorRows as Array<Array<Record<string, unknown>>>
            : [mirrorRows as Array<Record<string, unknown>>];
          const result = rowsByAttempt[Math.min(mirrorQueryCount, rowsByAttempt.length - 1)];
          mirrorQueryCount += 1;
          return result;
        }
        return [];
      }),
    };
    const controller = new ChanjetCallbackController(
      auth as never,
      {} as never,
      integration as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      ds as never,
    );
    const request = { user: { userId: 'admin-1', username: 'admin', roles: ['ROLE_ADMIN'] } };
    const body = {
      approveProduction: true,
      confirmation: 'CREATE_HOUSE_PROJECT_CANARY',
      bookId,
      houseCode: 'HOUSE_MS_02',
      expectedName: '2号鸡舍',
      projectCategoryCode: '00',
    };
    return { auth, integration, ds, controller, request, body };
  };

  it('uses the authorized one-item batchUpsert path and verifies both readbacks', async () => {
    const ctx = setup([
      listPayload,
      { successResultMap: { HOUSE_MS_02: '9001' }, failResultMap: {} },
      {
        data: {
          id: '9001', code: 'HOUSE_MS_02', name: '2号鸡舍',
          projectCategory: { id: categoryId, code: '00', name: '未分类' }, statusEnum: 'A',
        },
      },
      createdHouseListPayload,
    ]);

    const result = await ctx.controller.createHouseProjectPilot(ctx.request, ctx.body);

    expect(result).toMatchObject({
      success: true,
      outcome: 'CREATED_AND_VERIFIED',
      writeChanjet: true,
      changedExistingDepartment: false,
      readback: { detail: true, erpMirror: true },
      project: { id: '9001', projectCategoryId: categoryId, statusEnum: 'A' },
    });
    expect(ctx.auth.callApi).toHaveBeenNthCalledWith(
      2,
      `/accounting/document/integration/project/batchUpsert/${bookId}`,
      {
        method: 'POST',
        kind: 'WRITE',
        body: [{ id: syncSourceId, code: 'HOUSE_MS_02', name: '2号鸡舍', statusEnum: 'A' }],
      },
    );
    expect(ctx.integration.syncReadOnlyMirror).toHaveBeenCalledWith(['PROJECT'], bookId);
    expect(ctx.auth.callApi.mock.calls.map((call) => call[0]).join('\n')).not.toMatch(/project\/(?:add|update)\//);
  });

  it('verifies an active idempotent project through detail and ERP mirror without writing', async () => {
    const ctx = setup([
      existingHouseListPayload,
      {
        data: {
          id: '9001', code: 'HOUSE_MS_02', name: '2号鸡舍',
          projectCategory: { id: categoryId, code: '00', name: '未分类' }, statusEnum: 'A',
        },
      },
    ]);

    const result = await ctx.controller.createHouseProjectPilot(ctx.request, ctx.body);

    expect(result).toMatchObject({
      success: true,
      outcome: 'IDEMPOTENT_EXISTING_VERIFIED',
      writeChanjet: false,
      project: { id: '9001', statusEnum: 'A' },
      readback: { detail: true, erpMirror: true, mirrorAttempts: 1 },
    });
    expect(ctx.auth.callApi).toHaveBeenCalledTimes(2);
    expect(ctx.integration.syncReadOnlyMirror).toHaveBeenCalledTimes(1);
  });

  it('reactivates the same inactive project id and performs both readbacks', async () => {
    const ctx = setup([
      existingHouseListPayload,
      {
        data: {
          id: '9001', code: 'HOUSE_MS_02', name: '2号鸡舍',
          projectCategory: { id: categoryId, code: '00', name: '未分类' }, statusEnum: 'I',
        },
      },
      { successResultMap: { HOUSE_MS_02: '9001' }, failResultMap: {} },
      {
        data: {
          id: '9001', code: 'HOUSE_MS_02', name: '2号鸡舍',
          projectCategory: { id: categoryId, code: '00', name: '未分类' }, statusEnum: 'A',
        },
      },
      reactivatedHouseListPayload,
    ]);

    const result = await ctx.controller.createHouseProjectPilot(ctx.request, ctx.body);

    expect(result).toMatchObject({
      success: true,
      outcome: 'CREATED_AND_VERIFIED',
      writeChanjet: true,
      project: { id: '9001', statusEnum: 'A' },
      readback: { detail: true, erpMirror: true },
    });
    expect(ctx.auth.callApi).toHaveBeenNthCalledWith(
      3,
      `/accounting/document/integration/project/batchUpsert/${bookId}`,
      {
        method: 'POST',
        kind: 'WRITE',
        body: [{ id: syncSourceId, code: 'HOUSE_MS_02', name: '2号鸡舍', statusEnum: 'A' }],
      },
    );
  });

  it('blocks a partial code or name collision before any write', async () => {
    const ctx = setup([{
      data: {
        rows: [{
          id: '9002', code: 'HOUSE_MS_02', name: '其他项目',
          projectCategory: { id: categoryId, code: '00', name: '未分类' },
        }],
      },
    }]);

    const result = await ctx.controller.createHouseProjectPilot(ctx.request, ctx.body);

    expect(result).toMatchObject({
      success: false,
      writeChanjet: false,
      error: expect.stringContaining('已被其他主数据占用'),
    });
    expect(ctx.auth.callApi).toHaveBeenCalledTimes(1);
  });

  it('detects an upsert that overwrites an existing project and restores its original values', async () => {
    const existingId = String(listPayload.data.rows[0].id);
    const ctx = setup([
      listPayload,
      { successResultMap: { HOUSE_MS_02: existingId }, failResultMap: {} },
      { successResultMap: { '0001': existingId }, failResultMap: {} },
      {
        data: {
          id: existingId, code: '0001', name: '孟赛直营店',
          projectCategory: { id: categoryId, code: '00', name: '未分类' }, statusEnum: 'A',
        },
      },
    ]);

    const result = await ctx.controller.createHouseProjectPilot(ctx.request, ctx.body);

    expect(result).toMatchObject({
      success: false,
      writeChanjet: true,
      error: expect.stringContaining('覆盖而非新增'),
      rollback: { attempted: true, succeeded: true },
    });
    expect(ctx.auth.callApi).toHaveBeenNthCalledWith(
      3,
      `/accounting/document/integration/project/batchUpsert/${bookId}`,
      {
        method: 'POST',
        kind: 'WRITE',
        body: [{ id: syncSourceId, code: '0001', name: '孟赛直营店', statusEnum: 'A' }],
      },
    );
    expect(ctx.integration.syncReadOnlyMirror).not.toHaveBeenCalled();
  });

  it('waits for bounded list convergence before accepting ERP mirror readback', async () => {
    const ctx = setup([
      listPayload,
      { successResultMap: { HOUSE_MS_02: '9001' }, failResultMap: {} },
      {
        data: {
          id: '9001', code: 'HOUSE_MS_02', name: '2号鸡舍',
          projectCategory: { id: categoryId, code: '00', name: '未分类' }, statusEnum: 'A',
        },
      },
      createdHouseListPayload,
    ], [
      [],
      [{ external_id: '9001', external_code: 'HOUSE_MS_02', external_name: '2号鸡舍', status: 'A' }],
    ]);

    const result = await ctx.controller.createHouseProjectPilot(ctx.request, ctx.body);

    expect(result).toMatchObject({
      success: true,
      readback: { detail: true, erpMirror: true, mirrorAttempts: 2 },
    });
    expect(ctx.integration.syncReadOnlyMirror).toHaveBeenCalledTimes(2);
  });

  it('does not retry a provider mirror failure and compensates the write', async () => {
    const ctx = setup([
      listPayload,
      { successResultMap: { HOUSE_MS_02: '9001' }, failResultMap: {} },
      {
        data: {
          id: '9001', code: 'HOUSE_MS_02', name: '2号鸡舍',
          projectCategory: { id: categoryId, code: '00', name: '未分类' }, statusEnum: 'A',
        },
      },
      createdHouseListPayload,
      { successResultMap: { HOUSE_MS_02: '9001' }, failResultMap: {} },
      {
        data: {
          id: '9001', code: 'HOUSE_MS_02', name: '2号鸡舍',
          projectCategory: { id: categoryId, code: '00' }, statusEnum: 'I',
        },
      },
    ]);
    ctx.integration.syncReadOnlyMirror.mockResolvedValueOnce({
      results: [{ key: 'PROJECT', bookId, status: 'FAIL', error: 'code=50111' }],
    });

    const result = await ctx.controller.createHouseProjectPilot(ctx.request, ctx.body);

    expect(result).toMatchObject({
      success: false,
      readback: { detail: true, erpMirror: false, mirrorAttempts: 1 },
      rollback: { attempted: true, succeeded: true },
    });
    expect(ctx.integration.syncReadOnlyMirror).toHaveBeenCalledTimes(1);
  });

  it('caps successful-but-stale mirror reads at three before compensating', async () => {
    const ctx = setup([
      listPayload,
      { successResultMap: { HOUSE_MS_02: '9001' }, failResultMap: {} },
      {
        data: {
          id: '9001', code: 'HOUSE_MS_02', name: '2号鸡舍',
          projectCategory: { id: categoryId, code: '00', name: '未分类' }, statusEnum: 'A',
        },
      },
      createdHouseListPayload,
      { successResultMap: { HOUSE_MS_02: '9001' }, failResultMap: {} },
      {
        data: {
          id: '9001', code: 'HOUSE_MS_02', name: '2号鸡舍',
          projectCategory: { id: categoryId, code: '00' }, statusEnum: 'I',
        },
      },
    ], []);

    const result = await ctx.controller.createHouseProjectPilot(ctx.request, ctx.body);

    expect(result).toMatchObject({
      success: false,
      error: expect.stringContaining('3 次低频延迟确认'),
      readback: { detail: true, erpMirror: false, mirrorAttempts: 3 },
      rollback: { attempted: true, succeeded: true },
    });
    expect(ctx.integration.syncReadOnlyMirror).toHaveBeenCalledTimes(3);
  });

  it('compensates through the same batchUpsert path when post-write detail differs', async () => {
    const ctx = setup([
      listPayload,
      { successResultMap: { HOUSE_MS_02: '9001' }, failResultMap: {} },
      {
        data: {
          id: '9001', code: 'HOUSE_MS_02', name: '错误名称',
          projectCategory: { id: categoryId, code: '00' }, statusEnum: 'A',
        },
      },
      { successResultMap: { HOUSE_MS_02: '9001' }, failResultMap: {} },
      {
        data: {
          id: '9001', code: 'HOUSE_MS_02', name: '2号鸡舍',
          projectCategory: { id: categoryId, code: '00' }, statusEnum: 'I',
        },
      },
    ]);

    const result = await ctx.controller.createHouseProjectPilot(ctx.request, ctx.body);

    expect(result).toMatchObject({
      success: false,
      writeChanjet: true,
      changedExistingDepartment: false,
      rollback: { attempted: true, succeeded: true },
    });
    expect(ctx.auth.callApi).toHaveBeenNthCalledWith(
      4,
      `/accounting/document/integration/project/batchUpsert/${bookId}`,
      {
        method: 'POST',
        kind: 'WRITE',
        body: [{ id: syncSourceId, code: 'HOUSE_MS_02', name: '2号鸡舍', statusEnum: 'I' }],
      },
    );
    expect(ctx.integration.syncReadOnlyMirror).not.toHaveBeenCalled();
    expect(ctx.auth.callApi.mock.calls.map((call) => call[0]).join('\n')).not.toMatch(/project\/(?:add|update)\//);
  });

  it('fails before write when category 00 has no exact id evidence', async () => {
    const ctx = setup([{
      data: {
        rows: [{
          id: '10', code: '0001', name: '其他项目',
          projectCategory: { id: 99, code: '01', name: '其他' },
        }],
      },
    }]);

    const result = await ctx.controller.createHouseProjectPilot(ctx.request, ctx.body);

    expect(result).toMatchObject({
      success: false,
      writeChanjet: false,
      rollback: { attempted: false, succeeded: false },
    });
    expect(ctx.auth.callApi).toHaveBeenCalledTimes(1);
  });

  it('blocks a reviewed house when the requested account book is wrong', async () => {
    const ctx = setup([]);
    ctx.body.bookId = '3537748712226818';

    await expect(ctx.controller.createHouseProjectPilot(ctx.request, ctx.body))
      .rejects.toThrow('鸡舍项目目标不在精确审核白名单');
    expect(ctx.ds.query).not.toHaveBeenCalled();
    expect(ctx.auth.callApi).not.toHaveBeenCalled();
  });

  it('blocks an active ERP house that is not in the reviewed rollout set', async () => {
    const ctx = setup([]);
    ctx.body.houseCode = 'HOUSE_MS_07';
    ctx.body.expectedName = '7号鸡舍';

    await expect(ctx.controller.createHouseProjectPilot(ctx.request, ctx.body))
      .rejects.toThrow('鸡舍项目目标不在精确审核白名单');
    expect(ctx.ds.query).not.toHaveBeenCalled();
    expect(ctx.auth.callApi).not.toHaveBeenCalled();
  });

  it('blocks a reviewed tuple when the ERP house belongs to another farm', async () => {
    const ctx = setup([]);
    ctx.ds.query.mockResolvedValueOnce([{
      house_code: 'HOUSE_MS_02', house_name: '2号鸡舍', farm_code: 'FARM-DP', status: 'ACTIVE',
    }]);

    await expect(ctx.controller.createHouseProjectPilot(ctx.request, ctx.body))
      .rejects.toThrow('名称/场区不一致');
    expect(ctx.auth.callApi).not.toHaveBeenCalled();
  });
});
