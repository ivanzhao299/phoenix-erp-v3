import { ScopedNotificationRecipientService } from './scoped-notification-recipient.service';

describe('ScopedNotificationRecipientService', () => {
  it('keeps global ADMIN and company-visible users and deduplicates permission-menu union', async () => {
    const ds = { query: jest.fn().mockResolvedValue([
      { user_id: '1', menu_code: 'MENU_SALES2_INVENTORY', role_codes: ['ROLE_ADMIN'] },
      { user_id: '2', menu_code: 'MENU_WMS_VIEW', role_codes: ['ROLE_WMS'] },
      { user_id: '2', menu_code: 'MENU_INV_BATCH', role_codes: ['ROLE_WMS'] },
      { user_id: '3', menu_code: 'MENU_INV_BATCH', role_codes: ['ROLE_WMS'] },
    ]) };
    const dataScope = { resolve: jest.fn(async (id: string) => id === '1'
      ? { isGlobal: true, allowedCompanyCodes: [] }
      : { isGlobal: false, allowedCompanyCodes: id === '2' ? ['COMP-A'] : ['COMP-B'] }) };
    const service = new ScopedNotificationRecipientService(ds as never, dataScope as never);

    await expect(service.resolve('COMP-A', [
      'MENU_SALES2_INVENTORY', 'MENU_WMS_VIEW', 'MENU_INV_BATCH',
    ])).resolves.toEqual(['1', '2']);
    expect(ds.query).toHaveBeenCalledWith(expect.stringContaining('NOT EXISTS'), expect.any(Array));
  });

  it('returns empty when no permission candidate can see the company', async () => {
    const ds = { query: jest.fn().mockResolvedValue([{ user_id: '3', menu_code: 'M', role_codes: [] }]) };
    const dataScope = { resolve: jest.fn().mockResolvedValue({ isGlobal: false, allowedCompanyCodes: [] }) };
    const service = new ScopedNotificationRecipientService(ds as never, dataScope as never);
    await expect(service.resolve('COMP-A', ['M'])).resolves.toEqual([]);
  });
});
