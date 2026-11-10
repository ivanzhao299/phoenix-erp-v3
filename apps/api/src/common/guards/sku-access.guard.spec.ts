import { ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { SkuAccessGuard, hasSkuPermission } from './sku-access.guard';
import { MasterDataTypeGuard } from './master-data-type.guard';
import { ProductSkusController } from '../../modules/product-master/controllers/product-skus.controller';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { MenuGuard } from './menu.guard';

const context = (req: unknown) => ({ switchToHttp: () => ({ getRequest: () => req }) }) as ExecutionContext;
describe('SKU explicit permission compatibility', () => {
  it.each([
    ['MENU_MD_SKU:C', true, false, false], ['MENU_MD_SKU:E', false, true, false],
    ['MENU_MASTER_SKU:E', true, true, false], ['MENU_MASTER_SKU:V', false, false, true],
    ['MENU_MD_SKU:V', false, false, true], ['MENU_MD_PRODUCT:V,C,E', false, false, false],
    ['MENU_SALES2_ORDER:V,C,E', false, false, false],
  ])('maps %s only to its declared operations', (permission, create, edit, view) => {
    const user = { permissions: [permission as string] };
    expect(hasSkuPermission(user, 'C')).toBe(create);
    expect(hasSkuPermission(user, 'E')).toBe(edit);
    expect(hasSkuPermission(user, 'V')).toBe(view);
  });
  it('allows authenticated ACTIVE sales selection while protecting management reads and writes', () => {
    const guard = new SkuAccessGuard();
    const user = { permissions: ['MENU_SALES2_ORDER:E'] };
    expect(guard.canActivate(context({ method: 'GET', user, query: { status: 'ACTIVE' }, params: {} }))).toBe(true);
    for (const req of [
      { method: 'GET', query: { status: 'FROZEN' }, params: {} },
      { method: 'GET', query: {}, params: { skuCode: 'SKU-1' } },
      { method: 'POST' }, { method: 'PUT' },
    ]) expect(() => guard.canActivate(context({ user, ...req }))).toThrow('MENU_PERMISSION_DENIED');
    expect(() => guard.canActivate(context({ method: 'GET' }))).toThrow('User context');
    expect(Reflect.getMetadata(GUARDS_METADATA, ProductSkusController)).toEqual([MenuGuard, SkuAccessGuard]);
  });
  it('uses identical operation mapping in the actual Runtime guard', async () => {
    const auth = jest.spyOn(AuthGuard('jwt').prototype, 'canActivate').mockResolvedValue(true);
    const guard = new MasterDataTypeGuard({ set: jest.fn() } as any);
    try {
      for (const permission of ['MENU_MD_SKU:C', 'MENU_MASTER_SKU:E']) {
        await expect(guard.canActivate(context({ user: { permissions: [permission] }, method: 'POST', originalUrl: '/api/master-data/runtime/sku', params: { type: 'sku' } }))).resolves.toBe(true);
      }
      await expect(guard.canActivate(context({ user: { permissions: ['MENU_MD_SKU:E'] }, method: 'POST', originalUrl: '/api/master-data/runtime/sku', params: { type: 'sku' } }))).rejects.toMatchObject({ status: 403 });
    } finally { auth.mockRestore(); }
  });
});
