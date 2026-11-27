import { randomUUID } from 'node:crypto';
import { DataSource } from 'typeorm';
import { ApprovalEngineService } from '../../approval-engine/approval-engine.service';
import { WorkflowBizRegistryService } from '../../approval-engine/workflow-biz-registry.service';
import { WfApprovalInstanceEntity } from '../../approval-engine/entities/wf-approval-instance.entity';
import { WfApprovalInstanceStepEntity } from '../../approval-engine/entities/wf-approval-instance-step.entity';
import { Prc2ApLedgerEntity } from '../entities/prc2-ap-ledger.entity';
import { Prc2ApprovalEntity } from '../entities/prc2-approval.entity';
import { Prc2OrderItemEntity } from '../entities/prc2-order-item.entity';
import { Prc2PaymentAllocationEntity } from '../entities/prc2-payment-allocation.entity';
import { Prc2PaymentEntity } from '../entities/prc2-payment.entity';
import { Prc2PurchaseOrderEntity } from '../entities/prc2-purchase-order.entity';
import { Prc2ReceiptItemEntity } from '../entities/prc2-receipt-item.entity';
import { Prc2ReceiptEntity } from '../entities/prc2-receipt.entity';
import { Prc2ShipmentEntity } from '../entities/prc2-shipment.entity';
import { PaymentsService } from './payments.service';
import { ReceiptsService } from './receipts.service';

const describePg = process.env.PRC_BATCH_A_FIXTURE_PORT ? describe : describe.skip;

describePg('procurement transaction controls on PostgreSQL', () => {
  let db: DataSource;
  const schema = 'prc_' + randomUUID().replaceAll('-', '');
  const companyCode = 'TEST-COMPANY';
  const cls = { get: () => ({ userId: '1', username: 'fixture' }) };
  const scope = { assertWritableOwnership: jest.fn(), assertWritableWarehouse: jest.fn() };

  beforeAll(async () => {
    const port = Number(process.env.PRC_BATCH_A_FIXTURE_PORT);
    if (!Number.isInteger(port) || port < 1024) throw new Error('Use a dedicated loopback fixture port');
    db = new DataSource({
      type: 'postgres', host: '127.0.0.1', port, username: 'postgres', database: 'prc_a_fixture',
      schema, entities: [
        Prc2ApLedgerEntity, Prc2ApprovalEntity, Prc2OrderItemEntity, Prc2PaymentAllocationEntity,
        Prc2PaymentEntity, Prc2PurchaseOrderEntity, Prc2ReceiptItemEntity, Prc2ReceiptEntity, Prc2ShipmentEntity,
        WfApprovalInstanceEntity, WfApprovalInstanceStepEntity,
      ],
      extra: { options: '-c search_path=' + schema + ',public -c statement_timeout=8000' },
    });
    await db.initialize();
    await db.query(`CREATE SCHEMA "${schema}"`);
    await db.synchronize();
    await db.query(`CREATE TABLE ${schema}.fixture_stock (receipt_no text PRIMARY KEY, quantity numeric NOT NULL)`);
    await db.query(`CREATE TABLE ${schema}.fixture_cash (payment_id bigint PRIMARY KEY, amount numeric NOT NULL)`);
    await db.query(`CREATE TABLE ${schema}.fin_cash_transactions (source_type text, source_id bigint, source_no text)`);
    await db.query(`CREATE TABLE ${schema}.fin_cash_accounts (
      id bigint PRIMARY KEY, account_code text, account_name text, company_code text, company_name text,
      currency_code text, current_balance numeric, status text
    )`);
    await db.query(`INSERT INTO ${schema}.fin_cash_accounts VALUES (1,'BANK','Test Bank',$1,'Test','CNY',100,'ACTIVE')`, [companyCode]);
  }, 30000);

  afterAll(async () => {
    if (db?.isInitialized) {
      await db.query(`DROP SCHEMA "${schema}" CASCADE`);
      await db.destroy();
    }
  });

  it('serializes competing receipts and persists the inventory unit for historical rows', async () => {
    const po = await db.getRepository(Prc2PurchaseOrderEntity).save({ poNo: 'PO-TEST', subject: 'Feed', companyCode, status: 'APPROVED', planQty: 10 });
    const line = await db.getRepository(Prc2OrderItemEntity).save({ poId: po.id, poNo: po.poNo, itemCode: 'FEED', itemName: 'Feed', qty: 10, unitPrice: 1 });
    const receiptRepo = db.getRepository(Prc2ReceiptEntity);
    const receiptItems = db.getRepository(Prc2ReceiptItemEntity);
    const receipts = await Promise.all(['A', 'B'].map(async suffix => {
      const receipt = await receiptRepo.save({
        receiptNo: 'RCV-' + suffix, poId: po.id, poNo: po.poNo, companyCode, warehouseCode: 'TEST-WH',
        receiptDate: '2026-11-28', status: 'DRAFT',
      });
      await receiptItems.save({
        receiptId: receipt.id, poItemId: line.id, itemCode: 'FEED', itemName: 'Feed',
        expectedQty: 10, actualQty: 6, rejectedQty: 0, qualityStatus: 'PASS',
      });
      return receipt;
    }));
    const service = new ReceiptsService(
      receiptRepo, receiptItems, db.getRepository(Prc2ShipmentEntity), db.getRepository(Prc2PurchaseOrderEntity),
      db.getRepository(Prc2OrderItemEntity), db.getRepository(Prc2ApprovalEntity), db, cls as never, scope as never,
      {
        assertPurchaseReceiptWarehouseUsage: async () => {},
        resolvePurchaseReceiptUnit: async () => 'kg',
        inboundFromReceipt: async (manager: DataSource['manager'], input: { refNo: string; items: { qty: number }[] }) => {
          await manager.query(`INSERT INTO ${schema}.fixture_stock VALUES ($1,$2)`, [input.refNo, input.items[0].qty]);
        },
      } as never,
    );
    const results = await Promise.allSettled(receipts.map(receipt => service.confirm(receipt.id, {})));
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    const current = await db.getRepository(Prc2PurchaseOrderEntity).findOneByOrFail({ id: po.id });
    expect(Number(current.receivedQty)).toBe(6);
    expect(current.status).toBe('PARTIALLY_RECEIVED');
    expect(await db.query(`SELECT quantity FROM ${schema}.fixture_stock`)).toEqual([{ quantity: '6' }]);
    const confirmed = await receiptRepo.findOneByOrFail({ status: 'CONFIRMED' });
    await expect(receiptItems.findOneByOrFail({ receiptId: confirmed.id })).resolves.toMatchObject({ unit: 'kg' });
  });

  it('rejects stale approval steps and records one final AP', async () => {
    const orderRepo = db.getRepository(Prc2PurchaseOrderEntity);
    const instanceRepo = db.getRepository(WfApprovalInstanceEntity);
    const steps = db.getRepository(WfApprovalInstanceStepEntity);
    const po = await orderRepo.save({
      poNo: 'PO-APPROVAL', subject: 'Approval fixture', companyCode,
      status: 'PENDING_APPROVAL', approvalStatus: 'PENDING', totalAmount: 125,
    });
    const instance = await instanceRepo.save({
      instanceNo: 'APPROVAL-FIXTURE', bizNo: po.poNo, bizType: 'PO', bizId: po.id, moduleCode: 'MENU_PRC2_ORDER',
      currentStepNo: 1, totalSteps: 2, status: 'PENDING',
    });
    await steps.save([1, 2].map(stepNo => ({
      instanceId: instance.id, stepNo, approverUserId: '1', approverType: 'USER', status: 'PENDING',
    })));
    const registry = new WorkflowBizRegistryService();
    registry.onModuleInit();
    const engine = new ApprovalEngineService(
      {} as never, {} as never, instanceRepo, steps, db,
      { get: (key: string) => key === 'user' ? cls.get() : undefined } as never,
      registry, {} as never, {} as never, { spawn: jest.fn() } as never,
    );
    await expect(engine.approveStep(instance.id, 'first', 1)).resolves.toMatchObject({ finished: false, currentStepNo: 2 });
    await expect(engine.approveStep(instance.id, 'replay', 1)).rejects.toThrow('审批步骤已变更');
    await expect(engine.approveStep(instance.id, 'second', 2)).resolves.toMatchObject({ finished: true });
    await expect(orderRepo.findOneByOrFail({ id: po.id })).resolves.toMatchObject({
      status: 'APPROVED', approvalStatus: 'APPROVED', approvedBy: '1',
    });
    expect(await db.getRepository(Prc2ApLedgerEntity).countBy({ poId: po.id })).toBe(1);
    expect(await db.getRepository(Prc2ApprovalEntity).countBy({ bizType: 'PO', bizId: po.id })).toBe(2);
  });

  it('rechecks the payment state after acquiring the row lock; a replay deducts once', async () => {
    const payRepo = db.getRepository(Prc2PaymentEntity);
    const apRepo = db.getRepository(Prc2ApLedgerEntity);
    const allocations = db.getRepository(Prc2PaymentAllocationEntity);
    const payment = await payRepo.save({
      payNo: 'PAY-TEST', companyCode, payerType: 'COMPANY', payerName: 'Test Company', payerAccount: 'BANK',
      currencyCode: 'CNY', paymentDate: '2026-11-28', paymentMethod: 'BANK_TRANSFER',
      status: 'APPROVED', amountOriginal: 30,
    });
    const ap = await apRepo.save({
      apNo: 'AP-TEST', companyCode, currencyCode: 'CNY', amountOriginal: 100,
      paidAmountOriginal: 0, balanceAmountOriginal: 100, status: 'OPEN',
    });
    await allocations.save({ paymentId: payment.id, apId: ap.id, allocatedAmountOriginal: 30 });
    const service = new PaymentsService(
      payRepo, allocations, apRepo, db.getRepository(Prc2ApprovalEntity), {} as never,
      db, cls as never, scope as never, {} as never,
      {
        applyBalance: async (runner: { manager: DataSource['manager'] }, id: string, delta: number) => {
          await runner.manager.query(`UPDATE ${schema}.fin_cash_accounts SET current_balance=current_balance+$1 WHERE id=$2`, [delta, id]);
          return 100 + delta;
        },
      } as never,
      {
        writeTransaction: async (args: { qr: { manager: DataSource['manager'] }; sourceId: string; amount: number }) => {
          await args.qr.manager.query(`INSERT INTO ${schema}.fixture_cash VALUES ($1,$2)`, [args.sourceId, args.amount]);
        },
      } as never,
      {} as never,
    );
    const results = await Promise.allSettled([service.pay(payment.id, {}), service.pay(payment.id, {})]);
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.find(result => result.status === 'rejected')).toMatchObject({
      reason: expect.objectContaining({ message: expect.stringContaining('已执行') }),
    });
    const current = await apRepo.findOneByOrFail({ id: ap.id });
    expect(Number(current.balanceAmountOriginal)).toBe(70);
    expect(await db.query(`SELECT current_balance FROM ${schema}.fin_cash_accounts`)).toEqual([{ current_balance: '70' }]);
    expect(await db.query(`SELECT amount FROM ${schema}.fixture_cash`)).toEqual([{ amount: '30' }]);
  });
});
