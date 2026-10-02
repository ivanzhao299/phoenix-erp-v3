import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { StorePaymentService } from './store-payment.service';

describe('StorePaymentService protected attachment ACL', () => {
  const record = (overrides: any = {}) => ({
    id: 'record-1', paymentNo: 'SPY-1', proofAttachmentId: 'file-proof',
    companyCode: 'COMP-A', storeCode: 'STORE-A', submittedBy: 'cashier-a', deletedAt: null, ...overrides,
  });
  const account = (overrides: any = {}) => ({
    id: 'account-1', accountCode: 'ACC-1', qrAttachmentId: 'file-qr',
    companyCode: 'COMP-A', storeCode: 'STORE-A', status: 'ACTIVE', isActive: true, deletedAt: null, ...overrides,
  });

  function make(user: any, scope: any, rows = { records: [record()], accounts: [account()] }) {
    const cls = { get: jest.fn((key: string) => key === 'user' ? user : scope) };
    const recordRepo = { findOne: jest.fn(async ({ where }: any) => rows.records.find((x: any) => x.proofAttachmentId === where.proofAttachmentId)) };
    const accountRepo = { findOne: jest.fn(async ({ where }: any) => rows.accounts.find((x: any) => x.qrAttachmentId === where.qrAttachmentId)) };
    const fileAccessService = {
      getProtectedFileStatus: jest.fn(async (id: string) => ({ fileId: id, accessStatus: 'allowed' })),
      openProtectedFile: jest.fn(async (id: string) => ({ stream: {}, mimeType: 'image/png', sizeBytes: 1, disposition: 'inline', fileId: id })),
    };
    const svc = new StorePaymentService(accountRepo as any, recordRepo as any, {} as any, {} as any, cls as any, fileAccessService as any);
    return { svc, fileAccessService };
  }

  it('allows authorized same-company store preview/status/download path', async () => {
    const { svc, fileAccessService } = make(
      { username: 'cashier-a', role: 'ROLE_CASHIER', storeCode: 'STORE-A', permissions: ['MENU_STORE_PAYMENT:V'] },
      { isGlobal: false, allowedCompanyCodes: ['COMP-A'], allowedSiteCodes: [] },
    );
    await expect(svc.getStorePaymentAttachmentStatus('file-proof')).resolves.toEqual({ fileId: 'file-proof', accessStatus: 'allowed' });
    await expect(svc.openStorePaymentAttachment('file-proof', 'preview')).resolves.toHaveProperty('fileId', 'file-proof');
    expect(fileAccessService.openProtectedFile).toHaveBeenCalledWith('file-proof', expect.objectContaining({ ownerType: 'STORE_PAYMENT_RECORD', ownerId: 'record-1', companyCode: 'COMP-A', storeCode: 'STORE-A' }), 'preview');
  });

  it('denies cross-company attachment even when store code matches', async () => {
    const { svc } = make(
      { username: 'cashier-a', role: 'ROLE_CASHIER', storeCode: 'STORE-A', permissions: ['MENU_STORE_PAYMENT:V'] },
      { isGlobal: false, allowedCompanyCodes: ['COMP-B'], allowedSiteCodes: [] },
    );
    await expect(svc.getStorePaymentAttachmentStatus('file-proof')).rejects.toMatchObject(new ForbiddenException('STORE_PAYMENT_FORBIDDEN'));
  });

  it('denies random IDs and unsafe path IDs without touching file access', async () => {
    const { svc, fileAccessService } = make(
      { username: 'cashier-a', role: 'ROLE_CASHIER', storeCode: 'STORE-A', permissions: ['MENU_STORE_PAYMENT:V'] },
      { isGlobal: false, allowedCompanyCodes: ['COMP-A'], allowedSiteCodes: [] },
      { records: [], accounts: [] },
    );
    await expect(svc.getStorePaymentAttachmentStatus('does-not-exist')).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.getStorePaymentAttachmentStatus('../secret')).rejects.toBeInstanceOf(Error);
    expect(fileAccessService.getProtectedFileStatus).not.toHaveBeenCalled();
  });
});
