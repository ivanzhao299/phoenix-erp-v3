import { ProcurementController } from './procurement.controller';
import { ProcurementService } from './procurement.service';
import { GoneException } from '@nestjs/common';

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

  it('seals both legacy receipt routes with HTTP 410 without touching inventory', async () => {
    await expect(controller.confirmReceipt('PO-1')).rejects.toBeInstanceOf(GoneException);
    await expect(controller.confirmReceiptLegacy('PO-1')).rejects.toBeInstanceOf(GoneException);
    expect(svc.confirmReceipt).not.toHaveBeenCalled();
  });
});
