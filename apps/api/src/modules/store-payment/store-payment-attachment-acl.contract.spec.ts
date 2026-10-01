import * as fs from 'node:fs';

describe('Store Payment attachment ACL contract', () => {
  const source = fs.readFileSync('src/modules/store-payment/store-payment.service.ts', 'utf8');
  const fileAccess = fs.readFileSync('src/modules/file/file-access.service.ts', 'utf8');
  const main = fs.readFileSync('src/main.ts', 'utf8');

  it('binds uploads to the payment owner atomically and rejects reuse', () => {
    expect(source).toContain("file.moduleCode = 'STORE_PAYMENT'");
    expect(source).toContain("STORE_PAYMENT_ATTACHMENT_ALREADY_OWNED");
    expect(source).toContain('await this.claimAttachment(manager, saved.proofAttachmentId');
  });

  it('keeps streaming behind metadata ownership, RBAC, DataScope, and safe storage root', () => {
    expect(fileAccess).toContain('this.assertRbac(file, policy, mode)');
    expect(fileAccess).toContain('this.assertDataScope(file, policy, mode)');
    expect(fileAccess).toContain('resolveSafeStoragePath(file)');
    expect(fileAccess).toContain('FILE_STORAGE_PATH_UNSAFE');
    expect(fileAccess).toContain('ATTACHMENT_DOWNLOAD');
    expect(main).toContain("/uploads static serving disabled");
    expect(main).not.toContain('app.useStaticAssets(uploadsDir');
  });
});
