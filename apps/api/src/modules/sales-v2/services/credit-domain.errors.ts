import { ConflictException } from '@nestjs/common';

export const CREDIT_CUSTOMER_MASTER_NOT_FOUND = 'CREDIT_CUSTOMER_MASTER_NOT_FOUND' as const;

export class CreditCustomerMasterNotFoundException extends ConflictException {
  readonly code = CREDIT_CUSTOMER_MASTER_NOT_FOUND;

  constructor() {
    super({
      statusCode: 409,
      errorCode: CREDIT_CUSTOMER_MASTER_NOT_FOUND,
      message: '订单客户不属于当前公司或主档已失效，请重新选择客户',
    });
  }
}
