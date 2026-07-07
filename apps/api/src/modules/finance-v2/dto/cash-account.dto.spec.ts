import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { CreateCashAccountDto } from './cash-account.dto';

const basePayload = {
  accountName: '测试资金账户',
  companyCode: 'COMP001',
  currencyCode: 'CNY',
  accountType: 'CASH',
};

async function validateCreatePayload(payload: Record<string, unknown>) {
  const dto = plainToInstance(CreateCashAccountDto, payload, {
    enableImplicitConversion: true,
  });
  return {
    dto,
    errors: await validate(dto, { whitelist: true }),
  };
}

describe('CreateCashAccountDto', () => {
  it('allows omitted accountCode so the service can generate it', async () => {
    const { dto, errors } = await validateCreatePayload(basePayload);

    expect(errors).toHaveLength(0);
    expect(dto.accountCode).toBeUndefined();
  });

  it('normalizes blank accountCode values to omitted', async () => {
    for (const accountCode of [null, '', '   ']) {
      const { dto, errors } = await validateCreatePayload({
        ...basePayload,
        accountCode,
      });

      expect(errors).toHaveLength(0);
      expect(dto.accountCode).toBeUndefined();
    }
  });

});
