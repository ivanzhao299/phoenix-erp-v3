import { resolve } from 'node:path';
import { FileAccessService } from './file-access.service';

describe('FileAccessService storage path compatibility', () => {
  const file = (storagePath: string, storedName = 'a.pdf') => ({
    fileId: 'FILE-PATH',
    originalName: storedName,
    storedName,
    storagePath,
    mimeType: 'application/pdf',
    sizeBytes: '1',
    status: 'ACTIVE',
    visibility: 'PROTECTED',
    moduleCode: 'STORE_PAYMENT',
    ownerType: 'STORE_PAYMENT_RECORD',
    ownerId: '42',
    companyCode: 'C1',
    storeCode: 'S1',
    deletedAt: null,
  }) as any;

  const service = () => new FileAccessService(
    {} as any,
    { get: jest.fn() } as any,
  );

  const resolvePath = (instance: FileAccessService, metadata: any) =>
    (instance as any).resolveSafeStoragePath(metadata) as string;

  it('allows canonical and supported relative upload paths', () => {
    const instance = service();
    expect(resolvePath(instance, file('uploads/contracts/a.pdf')))
      .toBe(resolve(process.cwd(), 'uploads/contracts/a.pdf'));
    expect(resolvePath(instance, file(resolve(process.cwd(), 'uploads/contracts/a.pdf'))))
      .toBe(resolve(process.cwd(), 'uploads/contracts/a.pdf'));
  });

  it('maps the exact legacy Phoenix uploads volume prefix into the canonical root', () => {
    const instance = service();
    expect(resolvePath(instance, file('/var/lib/docker/volumes/phoenix_uploads/_data/contracts/a.pdf')))
      .toBe(resolve(process.cwd(), 'uploads/contracts/a.pdf'));
  });

  it.each([
    ['/var/lib/docker/volumes/phoenix_uploads/_data/../../etc/passwd', 'passwd'],
    ['/var/lib/docker/volumes/other_volume/_data/a.pdf', 'a.pdf'],
    ['/etc/passwd', 'passwd'],
  ])('denies unsafe storage path %s', (storagePath, storedName) => {
    expect(() => resolvePath(service(), file(storagePath, storedName))).toThrow('FILE_STORAGE_PATH_UNSAFE');
  });

  it('denies a stored-name mismatch after canonicalization', () => {
    expect(() => resolvePath(service(), file('uploads/contracts/a.pdf', 'b.pdf')))
      .toThrow('FILE_STORAGE_NAME_MISMATCH');
  });
});
