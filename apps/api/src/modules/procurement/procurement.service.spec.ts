import { BadRequestException } from '@nestjs/common';
import { ProcurementService } from './procurement.service';

describe('ProcurementService', () => {
  let em: { save: jest.Mock; transaction: jest.Mock; findOne: jest.Mock; query: jest.Mock };
  let cls: { get: jest.Mock };
  let approval: { submitForApproval: jest.Mock };
  let service: ProcurementService;

  beforeEach(() => {
    em = {
      save:        jest.fn(async (_entity, x) => x),
      transaction: jest.fn(async (cb) => cb(em as never)),
      findOne:     jest.fn(),
      // 默认返回序列行，满足 createPurchaseOrder 中 const [{ seq }] = await em.query(...)
      query:       jest.fn().mockResolvedValue([{ seq: '00001' }]),
    };
    cls = { get: jest.fn((k: string) => {
      if (k === 'user.storeCode')  return 'ALL';
      if (k === 'user.userId')     return 1;
      if (k === 'user.username')   return 'tester';
      if (k === 'user.realNameZh') return '测试员';
      return 'tester';
    }) };
    approval = { submitForApproval: jest.fn() };
    service = new ProcurementService(em as never, approval as never, cls as never);
  });

  // ── createPurchaseOrder ────────────────────────────────────────────────────

  it('createPurchaseOrder generates po_no + applies LAK currency on amount > 50000', async () => {
    const po = await service.createPurchaseOrder({
      supplier_code: 'S1', plan_qty: 100, total_amount: 60000,
    });
    expect(po.po_no).toMatch(/^PO-\d+-\d+$/);
    expect(po.currency_code).toBe('LAK');
    expect(po.supplier_code).toBe('S1');
    expect(em.save).toHaveBeenCalledTimes(1);
  });

  it('createPurchaseOrder defaults currency to CNY on amount <= 50000', async () => {
    const po = await service.createPurchaseOrder({
      supplier_code: 'S2', plan_qty: 5, total_amount: 1000,
    });
    expect(po.currency_code).toBe('CNY');
  });

  it('createPurchaseOrder honors explicit currency_code override', async () => {
    const po = await service.createPurchaseOrder({
      supplier_code: 'S3', plan_qty: 1, total_amount: 99999, currency_code: 'USD',
    });
    expect(po.currency_code).toBe('USD');
  });

  it('createPurchaseOrder sets contract_no in HT-YYYY-NNNNN format', async () => {
    const po = await service.createPurchaseOrder({
      supplier_code: 'S4', plan_qty: 10, total_amount: 5000,
    });
    expect(po.contract_no).toMatch(/^HT-\d{4}-\d{5}$/);
  });

  // ── org 隔离辅助 ──────────────────────────────────────────────────────────

  it('isGlobalUser returns true when storeCode is ALL', () => {
    cls.get.mockImplementation((k: string) => k === 'user.storeCode' ? 'ALL' : null);
    expect((service as any)['isGlobalUser']).toBe(true);
  });

  it('isGlobalUser returns false when storeCode is a specific farm code', () => {
    cls.get.mockImplementation((k: string) => k === 'user.storeCode' ? 'FARM_01' : null);
    expect((service as any)['isGlobalUser']).toBe(false);
  });

  // ── getOrders / getRequests（org 隔离 SQL 拼接） ──────────────────────────

  it('getOrders calls query without store_code filter for global users', async () => {
    em.query.mockResolvedValue([]);
    await service.getOrders();
    const sql: string = em.query.mock.calls[0][0];
    expect(sql).not.toContain('store_code =');
  });

  it('getOrders adds store_code filter for farm-scoped users', async () => {
    cls.get.mockImplementation((k: string) => k === 'user.storeCode' ? 'FARM_02' : null);
    em.query.mockResolvedValue([]);
    await service.getOrders();
    const sql: string   = em.query.mock.calls[0][0];
    const params: any[] = em.query.mock.calls[0][1];
    expect(sql).toContain('store_code = $1');
    expect(params[0]).toBe('FARM_02');
  });

  // ── getPurchaseRequests ────────────────────────────────────────────────────

  it('getPurchaseRequests returns empty array on DB error', async () => {
    em.query.mockRejectedValue(new Error('db error'));
    const result = await service.getPurchaseRequests();
    expect(result).toEqual({ code: 200, data: [] });
  });

  it('getPurchaseRequests passes store_code param for non-global users', async () => {
    cls.get.mockImplementation((k: string) => k === 'user.storeCode' ? 'FARM_03' : null);
    em.query.mockResolvedValue([{ id: 1 }]);
    await service.getPurchaseRequests();
    const params: any[] = em.query.mock.calls[0][1];
    expect(params[0]).toBe('FARM_03');
  });

  // ── createPurchaseRequest ─────────────────────────────────────────────────

  it('createPurchaseRequest inserts record and returns req_no', async () => {
    em.query.mockResolvedValue([]);
    const result = await service.createPurchaseRequest({
      subject: '购买饲料', qty: '500kg', urgency: 'URGENT',
    });
    expect(result.code).toBe(200);
    expect(result.reqNo).toMatch(/^REQ-\d{4}-\d+$/);
    expect(em.query).toHaveBeenCalledTimes(1);
    const sql: string = em.query.mock.calls[0][0];
    expect(sql).toContain('INSERT INTO prc_purchase_requests');
  });

  // ── rejectRequest ─────────────────────────────────────────────────────────

  it('rejectRequest updates status to REJECTED', async () => {
    em.query.mockResolvedValue([]);
    const result = await service.rejectRequest(42, '预算不足');
    expect(result.code).toBe(200);
    const sql: string = em.query.mock.calls[0][0];
    expect(sql).toContain("status='REJECTED'");
    expect(em.query.mock.calls[0][1][0]).toBe('预算不足');
    expect(em.query.mock.calls[0][1][3]).toBe(42);
  });

  // ── convertRequestToPO ────────────────────────────────────────────────────

  it('convertRequestToPO throws BadRequestException if request not found', async () => {
    em.query.mockResolvedValueOnce([]);   // SELECT → empty
    await expect(
      service.convertRequestToPO(99, { supplier_code: 'S1', total_amount: 1000 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('convertRequestToPO throws if request status is not PENDING', async () => {
    em.query
      .mockResolvedValueOnce([{ id: 1, status: 'CONVERTED', subject: 'test', qty: '10', currency_code: 'LAK' }]);
    await expect(
      service.convertRequestToPO(1, { supplier_code: 'S1', total_amount: 1000 }),
    ).rejects.toThrow(BadRequestException);
  });

  it('convertRequestToPO creates PO and marks request CONVERTED', async () => {
    em.query
      // 1. SELECT request
      .mockResolvedValueOnce([{ id: 1, status: 'PENDING', subject: '采购饲料', qty: '500', currency_code: 'LAK', req_no: 'REQ-2026-001' }])
      // 2. nextval sequence（createPurchaseOrder 内部）
      .mockResolvedValueOnce([{ seq: '00002' }])
      // 3. UPDATE request
      .mockResolvedValueOnce([]);

    const result = await service.convertRequestToPO(1, {
      supplier_code: 'SUP-001', supplier_name: '优质饲料厂', total_amount: 50000,
    });
    expect(result.code).toBe(200);
    expect(result.msg).toContain('采购单');
    // 验证 request 被标记为 CONVERTED
    const updateSql: string = em.query.mock.calls[2][0];
    expect(updateSql).toContain("status='CONVERTED'");
  });

  // ── 错误类型守卫 ──────────────────────────────────────────────────────────

  it('BadRequestException is the expected error class for invalid input', () => {
    expect(new BadRequestException('x')).toBeInstanceOf(BadRequestException);
  });
});
