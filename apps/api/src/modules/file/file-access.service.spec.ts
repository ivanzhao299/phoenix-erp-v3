import { FileAccessService } from './file-access.service';

describe('FileAccessService Store Payment ACL', () => {
  const file = (overrides: Record<string, unknown> = {}) => ({
    fileId: 'FILE-1', originalName: 'proof.png', storedName: 'proof.png', storagePath: 'uploads/contracts/proof.png',
    mimeType: 'image/png', sizeBytes: '12', status: 'ACTIVE', visibility: 'PROTECTED',
    moduleCode: 'STORE_PAYMENT', ownerType: 'STORE_PAYMENT_RECORD', ownerId: '42', companyCode: 'C1', storeCode: 'S1',
    deletedAt: null, ...overrides,
  }) as any;
  const setup = (metadata: any, user: any, scope: any = {}) => {
    const repo = { findOne: jest.fn().mockResolvedValue(metadata), create: jest.fn((x) => x), save: jest.fn() } as any;
    const cls = { get: jest.fn((key: string) => key === 'user' ? user : key === 'dataScope' ? scope : undefined) } as any;
    const service = new FileAccessService(repo, { save: jest.fn(), create: jest.fn((x) => x) } as any, cls);
    return { service, repo };
  };
  const policy = { moduleCode: 'STORE_PAYMENT', ownerType: 'STORE_PAYMENT_RECORD', ownerId: '42', companyCode: 'C1', storeCode: 'S1', requiredMenu: 'MENU_STORE_PAYMENT' };

  it('allows an authorized same-store role and audits the access', async () => {
    const { service } = setup(file(), { username: 'cashier', roles: ['ROLE_CASHIER'], permissions: ['MENU_STORE_PAYMENT:V'], storeCode: 'S1' }, { allowedSiteCodes: ['S1'], allowedCompanyCodes: ['C1'] });
    await expect(service.getProtectedFileStatus('FILE-1', policy)).resolves.toMatchObject({ accessStatus: 'allowed' });
  });

  it('denies an unauthorized role, cross-store, cross-company, and owner ID mismatch', async () => {
    await expect(setup(file(), { username: 'x', roles: ['ROLE_CASHIER'], permissions: [], storeCode: 'S1' }, { allowedSiteCodes: ['S1'] }).service.getProtectedFileStatus('FILE-1', policy)).rejects.toThrow('FILE_RBAC_DENIED');
    await expect(setup(file(), { username: 'x', roles: ['ROLE_CASHIER'], permissions: ['MENU_STORE_PAYMENT:V'], storeCode: 'S2' }, { allowedSiteCodes: ['S2'] }).service.getProtectedFileStatus('FILE-1', policy)).rejects.toThrow('FILE_DATASCOPE_DENIED');
    await expect(setup(file({ companyCode: 'C2' }), { username: 'x', roles: ['ROLE_CASHIER'], permissions: ['MENU_STORE_PAYMENT:V'], storeCode: 'S1' }, { allowedSiteCodes: ['S1'], allowedCompanyCodes: ['C1'] }).service.getProtectedFileStatus('FILE-1', policy)).rejects.toThrow('FILE_OWNERSHIP_MISMATCH');
    await expect(setup(file({ ownerId: '99' }), { username: 'x', roles: ['ROLE_CASHIER'], permissions: ['MENU_STORE_PAYMENT:V'], storeCode: 'S1' }, { allowedSiteCodes: ['S1'] }).service.getProtectedFileStatus('FILE-1', policy)).rejects.toThrow('FILE_OWNERSHIP_MISMATCH');
  });
});
