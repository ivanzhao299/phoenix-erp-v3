import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = (name: string) => readFileSync(join(__dirname, name), 'utf8');

describe('sales localized-name read contracts', () => {
  it('keeps order codes and appends customer, company, channel and item names', () => {
    const orders = source('sales-orders.service.ts');
    expect(orders).toContain('company_name_display');
    expect(orders).toContain('customer_name_master');
    expect(orders).toContain('channel_name');
    expect(orders).toContain('sku_name_en');
    expect(orders).toContain('grade_name');
    expect(orders).toContain('spec_name');
  });

  it('groups analytics and return aggregates by stable codes and projects names with MAX', () => {
    const analytics = source('sales-analytics.service.ts');
    const returns = source('return-orders.service.ts');
    expect(analytics).toContain('GROUP BY so2.company_code');
    expect(analytics).toContain('MAX((SELECT ch.channel_name');
    expect(returns).toContain('GROUP BY customer_code');
    expect(returns).toContain('MAX(customer_name) AS customer_name');
    expect(returns).toContain('GROUP BY i.product_code');
    expect(returns).toContain('MAX(i.product_name) AS product_name');
  });

  it('adds narrow display-name projections for delivery, master data and pricing', () => {
    expect(source('delivery-orders.service.ts')).toContain('driver_name_master');
    expect(source('channels.service.ts')).toContain('company_name_display');
    expect(source('customers.service.ts')).toContain('AS channel_name');
    expect(source('price-books.service.ts')).toContain('AS store_name');
    expect(source('price-items.service.ts')).toContain('AS sku_name');
  });
});
