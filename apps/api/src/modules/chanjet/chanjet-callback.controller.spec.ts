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

  const setup = (callApiResults: unknown[], mirrorRows = [{
    external_id: '9001', external_code: 'HOUSE_MS_02', external_name: '2号鸡舍', status: 'ACTIVE',
  }]) => {
    const auth = { callApi: jest.fn() };
    for (const result of callApiResults) auth.callApi.mockResolvedValueOnce(result);
    const integration = { syncReadOnlyMirror: jest.fn().mockResolvedValue({ jobId: 'mirror-job-1' }) };
    const ds = {
      query: jest.fn(async (sql: string) => {
        if (sql.includes('FROM brd_houses')) {
          return [{ house_code: 'HOUSE_MS_02', house_name: '2号鸡舍', farm_code: 'LPH_MENGSAI', status: 'ACTIVE' }];
        }
        if (sql.includes('FROM chanjet_entity_snapshots')) return mirrorRows;
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
        body: [{ id: categoryId, code: 'HOUSE_MS_02', name: '2号鸡舍', statusEnum: 'A' }],
      },
    );
    expect(ctx.integration.syncReadOnlyMirror).toHaveBeenCalledWith(['PROJECT'], bookId);
    expect(ctx.auth.callApi.mock.calls.map((call) => call[0]).join('\n')).not.toMatch(/project\/(?:add|update)\//);
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
        body: [{ id: categoryId, code: 'HOUSE_MS_02', name: '2号鸡舍', statusEnum: 'I' }],
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
});
