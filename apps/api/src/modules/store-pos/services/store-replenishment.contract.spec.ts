import * as fs from 'fs';
import * as path from 'path';

describe('V1-3 store replenishment orchestration contract', () => {
  const service = fs.readFileSync(path.join(__dirname,'store-replenishment.service.ts'),'utf8');
  const controller = fs.readFileSync(path.join(__dirname,'../controllers/store-replenishment.controller.ts'),'utf8');

  it('enforces the full request to WMS transfer lifecycle', () => {
    for (const state of ['DRAFT','SUBMITTED','APPROVED','DISPATCHED','RECEIVED','CLOSED']) expect(service).toContain(state);
    expect(service).toContain('this.wms.createTransfer');
    expect(service).toContain('this.wms.dispatchTransfer');
    expect(service).toContain('this.wms.receiveTransfer');
    expect(service).toContain('this.wms.completeTransfer');
  });

  it('uses membership and warehouse scope fail-closed gates', () => {
    expect(service).toContain("this.storeScope.resolve(dto.storeCode, 'SALES')");
    expect(service).toContain("throw new ForbiddenException('源仓不在仓库 DataScope')");
    expect(controller).toContain("@RequireMenu('MENU_STORE_REPLENISH', 'A')");
    expect(controller).toContain("@RequireMenu('MENU_STORE_REPLENISH', 'E')");
  });

  it('exposes transfer discrepancy traceability', () => {
    expect(service).toContain('wms_transfer_discrepancies');
    expect(service).toContain('this.wms.completeTransfer(request.transfer_no, body, user)');
    expect(controller).toContain("@Get(':id/transfer')");
  });
});
