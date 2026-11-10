import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { CreateSalesOrderItemDto } from './sales-order.dto';

describe('Sales order identity DTO', () => {
  it('accepts SKU-only items so the service can derive identity', async () => {
    expect(await validate(plainToInstance(CreateSalesOrderItemDto, { skuCode: 'SKU-1', qty: 1 }))).toHaveLength(0);
  });
  it('accepts historical product-only items', async () => {
    expect(await validate(plainToInstance(CreateSalesOrderItemDto, { productCode: 'P1', qty: 1 }))).toHaveLength(0);
  });
  it('requires a product when SKU is omitted', async () => {
    const errors = await validate(plainToInstance(CreateSalesOrderItemDto, { qty: 1 }));
    expect(errors.some(error => error.property === 'productCode')).toBe(true);
  });
  it.each([null, '', 123])('rejects explicit invalid SKU %p', async skuCode => {
    const errors = await validate(plainToInstance(CreateSalesOrderItemDto, { skuCode, productCode: 'P1', qty: 1 }));
    expect(errors.some(error => error.property === 'skuCode')).toBe(true);
  });
});
