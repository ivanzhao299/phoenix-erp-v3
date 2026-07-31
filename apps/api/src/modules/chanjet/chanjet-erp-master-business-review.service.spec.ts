import {
  CHANJET_ERP_MASTER_APPLY_TOKEN,
  CHANJET_ERP_MASTER_REVIEW_ACTION,
  ChanjetErpMasterBusinessReviewService,
} from './chanjet-erp-master-business-review.service';

function source(overrides: Record<string, unknown>) {
  return {
    id: '1',
    mapping_type: 'PROJECT',
    book_id: 'BOOK-1',
    company_code: 'COMP-LAO-AGRI',
    company_name: '凤凰农业',
    chanjet_id: 'SOURCE-1',
    chanjet_code: '0001',
    chanjet_name: '万象直营店',
    raw_data: {
      bizType: { name: '项目' },
      statusEnum: { value: 'A' },
    },
    ...overrides,
  };
}

function createService(
  sources: Array<Record<string, unknown>>,
  targets: {
    cash?: Array<Record<string, unknown>>;
    projects?: Array<Record<string, unknown>>;
    warehouses?: Array<Record<string, unknown>>;
  } = {},
) {
  const ds = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM chanjet_master_mapping')) return sources;
      if (sql.includes('FROM fin_cash_accounts')) return targets.cash || [];
      if (sql.includes('FROM biz_projects')) return targets.projects || [];
      if (sql.includes('FROM wms_warehouses')) return targets.warehouses || [];
      throw new Error(`unexpected query: ${sql}`);
    }),
    createQueryRunner: jest.fn(),
  };
  return { service: new ChanjetErpMasterBusinessReviewService(ds as never), ds };
}

describe('ChanjetErpMasterBusinessReviewService', () => {
  it('keeps the production audit action code within sys_operation_logs varchar(32)', () => {
    expect(CHANJET_ERP_MASTER_REVIEW_ACTION.length).toBeLessThanOrEqual(32);
  });

  it('creates only semantically complete masters and holds unsafe dimensions', async () => {
    const { service } = createService([
      source({ id: '1' }),
      source({
        id: '2',
        mapping_type: 'WAREHOUSE',
        chanjet_id: 'WH-HOUSE',
        chanjet_code: '05',
        chanjet_name: '1号鸡舍',
        raw_data: {
          erpMasterGapProposal: { gapClass: 'HOUSE_INVENTORY_BRIDGE_REQUIRED' },
        },
      }),
      source({
        id: '3',
        mapping_type: 'WAREHOUSE',
        chanjet_id: 'WH-GENERIC-1',
        chanjet_code: '01',
        chanjet_name: '总仓',
        raw_data: {
          erpMasterGapProposal: { gapClass: 'WAREHOUSE_MASTER_CANDIDATE' },
        },
      }),
      source({
        id: '4',
        mapping_type: 'WAREHOUSE',
        chanjet_id: 'WH-GENERIC-2',
        chanjet_code: '88',
        chanjet_name: '总库',
        raw_data: {
          erpMasterGapProposal: { gapClass: 'WAREHOUSE_MASTER_CANDIDATE' },
        },
      }),
      source({
        id: '5',
        mapping_type: 'CASH_ACCOUNT',
        chanjet_id: 'CA-WECHAT',
        chanjet_code: '02',
        chanjet_name: '微信',
        raw_data: { currencyCode: 'CNY' },
      }),
      source({
        id: '6',
        mapping_type: 'CASH_ACCOUNT',
        chanjet_id: 'CA-TRANSFER',
        chanjet_code: 'YHZZ',
        chanjet_name: '银行转账',
        raw_data: { currencyCode: 'CNY' },
      }),
    ]);

    const plan = await service.plan();

    expect(plan.summary.total).toBe(6);
    expect(plan.candidates.find((item) => item.mappingId === '1')?.decision).toBe('CREATE_MASTER');
    expect(plan.candidates.find((item) => item.mappingId === '2')?.decision).toBe('HOLD');
    expect(plan.candidates.find((item) => item.mappingId === '3')?.decision).toBe('HOLD');
    expect(plan.candidates.find((item) => item.mappingId === '4')?.decision).toBe('HOLD');
    expect(plan.candidates.find((item) => item.mappingId === '5')?.decision).toBe('CREATE_MASTER');
    expect(plan.candidates.find((item) => item.mappingId === '5')?.createPayload).toMatchObject({
      accountType: 'VIRTUAL',
      bankName: null,
      bankAccountNo: null,
    });
    expect(plan.candidates.find((item) => item.mappingId === '6')?.decision).toBe('HOLD');
    expect(plan.guardrails.chanjetWrite).toBe(false);
    expect(plan.guardrails.financialBalanceImport).toBe(false);
  });

  it('maps an exact same-company same-currency cash account instead of creating a duplicate', async () => {
    const { service } = createService(
      [
        source({
          id: '7',
          mapping_type: 'CASH_ACCOUNT',
          chanjet_id: 'CA-BCEL',
          chanjet_code: '10',
          chanjet_name: '公司直管客户BCEL140',
          raw_data: {
            currencyCode: 'LAK',
            accountNo: '0631246702140',
            openingBank: 'BCEL',
          },
        }),
      ],
      {
        cash: [
          {
            code: 'ERP-BCEL-140',
            name: 'BCEL公司账户',
            companyCode: 'COMP-LAO-AGRI',
            currencyCode: 'LAK',
            accountNo: '0631 2467 02140',
            targetTable: 'fin_cash_accounts',
          },
        ],
      },
    );

    const plan = await service.plan();

    expect(plan.summary.mapExisting).toBe(1);
    expect(plan.candidates[0]).toMatchObject({
      decision: 'MAP_EXISTING',
      targetCode: 'ERP-BCEL-140',
      targetTable: 'fin_cash_accounts',
    });
  });

  it('rejects apply before any database write when approval token is missing', async () => {
    const { service, ds } = createService([]);

    await expect(service.apply({
      reviewHash: 'x',
      approvalToken: `${CHANJET_ERP_MASTER_APPLY_TOKEN}-WRONG`,
      actor: 'test',
    })).rejects.toThrow('CHANJET_ERP_MASTER_MAPPING_APPROVAL_TOKEN_INVALID');
    expect(ds.createQueryRunner).not.toHaveBeenCalled();
  });
});
