import { readFileSync } from 'fs';
import { join } from 'path';

describe('Store POS scope cannot be bypassed by a future entry', () => {
  const service = readFileSync(join(__dirname, 'services/store-pos.service.ts'), 'utf8');
  const shift = readFileSync(join(__dirname, 'services/store-pos-shift.service.ts'), 'utf8');

  it.each(['createSale', 'completeCashSale', 'completeCreditSale', 'completeMixedSale', 'voidSale', 'returnSale', 'list', 'getDetail', 'getDailySummary', 'getProducts'])('%s is behind the shared policy', name => {
    const start = service.indexOf(`async ${name}`);
    expect(start).toBeGreaterThan(-1);
    const body = service.slice(start, service.indexOf('\n  async ', start + 8) === -1 ? service.length : service.indexOf('\n  async ', start + 8));
    expect(body).toMatch(/storeScope\.|getSale\(/);
  });

  it.each(['openShift', 'getCurrentShift', 'closeShift', 'listShifts'])('%s shift path is behind the shared policy', name => {
    const start = shift.indexOf(`async ${name}`);
    const body = shift.slice(start, shift.indexOf('\n  async ', start + 8) === -1 ? shift.length : shift.indexOf('\n  async ', start + 8));
    expect(body).toContain('storeScope.');
  });
});
