import 'reflect-metadata';
import type { DataSource } from 'typeorm';
import { CustomerCreditService } from './customer-credit.service';
import {
  CREDIT_CUSTOMER_MASTER_NOT_FOUND,
  CreditCustomerMasterNotFoundException,
} from './credit-domain.errors';

describe('CustomerCreditService.evaluateCreditStatus', () => {
  const customer = {
    customer_no: 'CUS-1',
    legacy_customer_code: 'LEGACY-1',
    customer_name: '测试客户',
    company_code: 'COMP-1',
    credit_limit: 0,
    payment_terms: 0,
    risk_level: 'NORMAL',
    credit_status: 'NORMAL',
    status: 'ACTIVE',
  };

  function makeService(options: {
    customer?: Record<string, unknown> | null;
    legacyOnly?: boolean;
    aging?: Record<string, unknown>;
    customerError?: Error;
    agingError?: Error;
  } = {}) {
    const selectedCustomer = options.customer === undefined ? customer : options.customer;
    const query = jest.fn(async (sql: string) => {
      if (sql.includes('customer_no = $1')) {
        if (options.customerError) throw options.customerError;
        return options.legacyOnly ? [] : (selectedCustomer ? [selectedCustomer] : []);
      }
      if (sql.includes('legacy_customer_code = $1')) return selectedCustomer ? [selectedCustomer] : [];
      if (sql.includes('FROM fin_ar_invoices')) {
        if (options.agingError) throw options.agingError;
        return [{
          open_count: 0,
          total_receivable: 0,
          overdue_receivable: 0,
          not_due_receivable: 0,
          earliest_overdue_date: null,
          ...options.aging,
        }];
      }
      if (sql.includes('FROM fin_ar_receipts')) return [{ last_receipt_date: null }];
      return [];
    });
    const service = new CustomerCreditService({ query } as unknown as DataSource, { get: jest.fn() } as any);
    return { service, query };
  }

  it('treats an existing zero-limit zero-terms customer without AR as unlimited default', async () => {
    const { service } = makeService();
    await expect(service.evaluateCreditStatus('CUS-1', 'COMP-1')).resolves.toMatchObject({
      creditStatus: 'NORMAL',
      allowOrder: true,
      requireApproval: false,
      creditWarning: false,
      policyMode: 'UNLIMITED_DEFAULT',
    });
  });

  it('allows an unlimited-default customer with overdue AR but returns WARNING', async () => {
    const { service } = makeService({
      aging: { open_count: 1, total_receivable: 25, overdue_receivable: 25, earliest_overdue_date: '2026-09-01' },
    });
    await expect(service.evaluateCreditStatus('CUS-1', 'COMP-1')).resolves.toMatchObject({
      creditStatus: 'WARNING',
      allowOrder: true,
      requireApproval: false,
      creditWarning: true,
      policyMode: 'UNLIMITED_DEFAULT',
    });
  });

  it('falls back to the legacy customer code within the same company', async () => {
    const { service, query } = makeService({ legacyOnly: true });
    await expect(service.evaluateCreditStatus('LEGACY-1', 'COMP-1')).resolves.toMatchObject({
      creditStatus: 'NORMAL',
      snapshot: { customerCode: 'CUS-1', companyCode: 'COMP-1' },
    });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('legacy_customer_code = $1'), ['LEGACY-1', 'COMP-1']);
  });

  it('returns the stable 409 domain error when neither customer code matches', async () => {
    const { service } = makeService({ customer: null });
    await expect(service.evaluateCreditStatus('CUS-MISSING', 'COMP-1')).rejects.toMatchObject({
      status: 409,
      code: CREDIT_CUSTOMER_MASTER_NOT_FOUND,
      response: expect.objectContaining({
        errorCode: CREDIT_CUSTOMER_MASTER_NOT_FOUND,
        message: '订单客户不属于当前公司或主档已失效，请重新选择客户',
      }),
    });
  });

  it('preserves customer and AR query failures for the submit layer', async () => {
    const customerFailure = new Error('connection terminated');
    const agingFailure = new Error('statement timeout');
    await expect(makeService({ customerError: customerFailure }).service.evaluateCreditStatus('CUS-1', 'COMP-1'))
      .rejects.toBe(customerFailure);
    await expect(makeService({ agingError: agingFailure }).service.evaluateCreditStatus('CUS-1', 'COMP-1'))
      .rejects.toBe(agingFailure);
  });

  it.each([
    [{ risk_level: 'BLACKLIST' }, 'FROZEN', false, false],
    [{ status: 'FROZEN' }, 'FROZEN', false, false],
    [{ payment_terms: 10 }, 'OVERDUE', true, true],
    [{ credit_limit: 10 }, 'OVER_LIMIT', true, true],
  ] as const)('keeps the existing priority for customer override %p', async (override, status, allowOrder, requireApproval) => {
    const { service } = makeService({
      customer: { ...customer, ...override },
      aging: { total_receivable: 20, overdue_receivable: 20, earliest_overdue_date: '2026-01-01' },
    });
    await expect(service.evaluateCreditStatus('CUS-1', 'COMP-1')).resolves.toMatchObject({
      creditStatus: status,
      allowOrder,
      requireApproval,
    });
  });

  it('exports a dedicated exception type for submit-layer whitelisting', () => {
    expect(new CreditCustomerMasterNotFoundException()).toBeInstanceOf(CreditCustomerMasterNotFoundException);
  });
});
