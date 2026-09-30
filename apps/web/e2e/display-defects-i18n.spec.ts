import { expect, test, type Page } from '@playwright/test';
import { authenticateMockPage } from './support/auth';

const tokenUser = { username: 'e2e-admin', name: 'E2E Admin', role: 'ROLE_ADMIN', roles: ['ROLE_ADMIN'], permissions: ['*'] };

async function authenticate(page: Page) {
  await authenticateMockPage(page, tokenUser);
  await page.route('**/api/notifications/**', route => route.fulfill({ json: [] }));
  await page.route('**/api/online-users**', route => route.fulfill({ json: [] }));
  await page.route('**/api/master-data/references/**', route => route.fulfill({ json: { totalReferences: 0, references: [], canArchive: true } }));
  await page.route('**/api/master-data/audit/**', route => route.fulfill({ json: { items: [] } }));
  await page.route('**/api/crud/sys_dict**', route => route.fulfill({ json: [] }));
}

const company = { company_code: 'COMP-LA', company_display_name: 'Golden Phoenix Laos', company_display_name_zh: '金凤凰老挝', status: 'ACTIVE' };
type DisplayCase = { route: string; type: string; code: string; value: string; typeKey?: string; known?: string; en?: string; lo?: string; noCompany?: boolean };
const cases: DisplayCase[] = [
  { route: 'projects', type: 'project', code: 'project_code', value: 'PRJ-1', typeKey: 'project_type', known: 'OPERATION', en: 'Operation', lo: 'ໂຄງການດຳເນີນງານ' },
  { route: 'customers', type: 'customer', code: 'customer_no', value: 'CUS-1' },
  { route: 'suppliers', type: 'supplier', code: 'supplier_code', value: 'SUP-1', typeKey: 'supplier_type', known: 'FEED', en: 'Feed', lo: 'ອາຫານສັດ', noCompany: true },
  { route: 'warehouses', type: 'warehouse', code: 'warehouse_code', value: 'WH-1', typeKey: 'type', known: 'EGG_SALES', en: 'Egg sales', lo: 'ສາງຂາຍໄຂ່' },
  { route: 'stores', type: 'store', code: 'store_code', value: 'STR-1' },
  { route: 'drivers', type: 'driver', code: 'driver_code', value: 'DRV-1' },
  { route: 'vehicles', type: 'vehicle', code: 'vehicle_no', value: 'VEH-1', typeKey: 'vehicle_type', known: 'TRUCK', en: 'Truck', lo: 'ລົດບັນທຸກ' },
  { route: 'cash-accounts', type: 'cash-account', code: 'account_code', value: 'CASH-1', typeKey: 'account_type', known: 'EWALLET', en: 'E-wallet', lo: 'ກະເປົາເງິນເອເລັກໂຕຣນິກ' },
  { route: 'bank-accounts', type: 'bank-account', code: 'bank_account_code', value: 'BANK-1' },
];

for (const c of cases) test(`${c.route} keeps company/code and locale type display truthful`, async ({ page }) => {
  await authenticate(page);
  const base = { ...company, [c.code]: c.value, [`${c.type.replace('-', '_')}_name`]: `${c.type} name`, updated_at: '2026-09-03T00:00:00Z' } as Record<string, unknown>;
  if (c.type === 'driver') base.driver_name = 'Somchai';
  if (c.type === 'vehicle') Object.assign(base, { vehicle_no: c.value, plate_no: 'LA-001' });
  if (c.type === 'warehouse') Object.assign(base, { warehouse_name: 'Warehouse One', warehouse_name_zh: '一号仓' });
  if (c.type === 'customer') base.customer_name = 'Customer One';
  if (c.type === 'supplier') base.supplier_name = 'Supplier One';
  if (c.type === 'project') base.project_name = 'Project One';
  if (c.type === 'store') base.store_name = 'Store One';
  if (c.type === 'cash-account') base.account_name = 'Cash One';
  if (c.type === 'bank-account') base.bank_name = 'Bank One';
  if (c.typeKey) base[c.typeKey] = c.known;
  if (c.noCompany) { delete base.company_code; delete base.company_display_name; delete base.company_display_name_zh; }
  await page.route(`**/api/master-data/runtime/${c.type}**`, route => route.fulfill({ json: [base] }));
  await page.goto(`/master-data/${c.route}`);
  if (!c.noCompany) await expect(page.locator('tbody')).toContainText('金凤凰老挝（COMP-LA）');
  if (c.typeKey) {
    await page.locator('header select').selectOption('en');
    await expect(page.locator('tbody')).toContainText(c.en!);
    if (!c.noCompany) await expect(page.locator('tbody')).toContainText('金凤凰老挝（COMP-LA）');
    await page.locator('header select').selectOption('lo');
    await expect(page.locator('tbody')).toContainText(c.lo!);
  }
});

test('vehicle historical Chinese free text remains verbatim in every locale', async ({ page }) => {
  await authenticate(page);
  await page.route('**/api/master-data/runtime/vehicle**', route => route.fulfill({ json: [{ ...company, vehicle_no: 'VEH-HISTORY', plate_no: 'LA-OLD', vehicle_type: '厢式货车', status: 'ACTIVE' }] }));
  await page.goto('/master-data/vehicles');
  await expect(page.locator('tbody')).toContainText('厢式货车');
  await page.locator('header select').selectOption('en');
  await expect(page.locator('tbody')).toContainText('厢式货车');
  await page.locator('header select').selectOption('lo');
  await expect(page.locator('tbody')).toContainText('厢式货车');
});
