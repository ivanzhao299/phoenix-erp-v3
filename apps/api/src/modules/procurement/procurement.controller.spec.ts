import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';

describe('ProcurementController', () => {
  let controller: ProcurementController;
  let svc: jest.Mocked<Pick<ProcurementService,
    'getDashboardSummary' | 'getRequests' | 'getOrders' | 'createPurchaseOrder'
    | 'submitForApproval' | 'confirmReceipt'>>;

  beforeEach(() => {
    svc = {
      getDashboardSummary: jest.fn(),
      getRequests:         jest.fn(),
      getOrders:           jest.fn(),
      createPurchaseOrder: jest.fn(),
      submitForApproval:   jest.fn(),
      confirmReceipt:      jest.fn(),
    };
    controller = new ProcurementController(svc as unknown as ProcurementService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('GET /dashboard delegates to service', async () => {
    svc.getDashboardSummary.mockResolvedValue({ openPos: 3 } as never);
    await expect(controller.getDashboard()).resolves.toEqual({ openPos: 3 });
    expect(svc.getDashboardSummary).toHaveBeenCalledTimes(1);
  });

  it('POST /create forwards body to createPurchaseOrder', async () => {
    const body = { supplier_code: 'S1', plan_qty: 10, total_amount: 1000 };
    svc.createPurchaseOrder.mockResolvedValue({ po_no: 'PO-1' } as never);
    await expect(controller.createPO(body)).resolves.toEqual({ po_no: 'PO-1' });
    expect(svc.createPurchaseOrder).toHaveBeenCalledWith(body);
  });

  it('POST /:poNo/confirm-receipt passes items array (default to empty)', async () => {
    svc.confirmReceipt.mockResolvedValue({ ok: true } as never);
    await controller.confirmReceipt('PO-1', undefined as never);
    expect(svc.confirmReceipt).toHaveBeenCalledWith('PO-1', []);
  });
});
