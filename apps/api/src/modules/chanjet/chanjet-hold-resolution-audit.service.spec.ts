import { ChanjetHoldResolutionAuditService } from './chanjet-hold-resolution-audit.service';
import { ChanjetErpMasterReviewCandidate } from './chanjet-erp-master-business-review.service';

function candidate(overrides: Partial<ChanjetErpMasterReviewCandidate>): ChanjetErpMasterReviewCandidate {
  return {
    mappingId: '1',
    mappingType: 'PRODUCT',
    bookId: 'BOOK-1',
    companyCode: 'COMP-LAO-AGRI',
    companyName: '凤凰农业',
    chanjetId: 'SOURCE-1',
    chanjetCode: '001',
    chanjetName: '阿莫西林可溶性分',
    decision: 'HOLD',
    targetTable: '',
    targetCode: '',
    targetName: '',
    targetEntityType: '',
    evidence: ['runtime evidence rows 8', 'runtime base UOM 瓶'],
    blockers: ['MATERIAL_TYPE_NOT_DETERMINISTIC'],
    createPayload: null,
    ...overrides,
  };
}

function createService(
  candidates: ChanjetErpMasterReviewCandidate[],
  options: {
    sourceRows?: Array<Record<string, unknown>>;
    ratios?: Array<Record<string, unknown>>;
  } = {},
) {
  const ds = {
    query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM chanjet_master_mapping')) return options.sourceRows || [];
      if (sql.includes('WITH lines AS')) return options.ratios || [];
      throw new Error(`unexpected query: ${sql}`);
    }),
  };
  const businessReview = {
    plan: jest.fn(async () => ({
      reviewHash: 'review-hash',
      candidates,
    })),
  };
  return new ChanjetHoldResolutionAuditService(ds as never, businessReview as never);
}

describe('ChanjetHoldResolutionAuditService', () => {
  it('separates intentional non-mapping, source repair and ERP policy rows', async () => {
    const service = createService([
      candidate({
        mappingId: '1',
        mappingType: 'CASH_ACCOUNT',
        chanjetName: '银行转账',
      }),
      candidate({
        mappingId: '2',
        mappingType: 'DEPARTMENT',
        chanjetName: '鸡舍',
      }),
      candidate({
        mappingId: '3',
        mappingType: 'PRODUCT',
        chanjetName: '阿莫西林可溶性分',
      }),
      candidate({
        mappingId: '4',
        mappingType: 'PRODUCT',
        chanjetName: '蛋鸡',
      }),
    ]);

    const audit = await service.audit();

    expect(audit.summary.total).toBe(4);
    expect(audit.items[0].disposition).toBe('NO_ERP_MASTER_REQUIRED');
    expect(audit.items[1].disposition).toBe('NO_ERP_MASTER_REQUIRED');
    expect(audit.items[2]).toMatchObject({
      disposition: 'CHANJET_CHANGE_PROPOSAL',
      requiresChanjetApproval: true,
      chanjetChangeProposal: {
        currentValue: '阿莫西林可溶性分',
        proposedValue: '阿莫西林可溶性粉',
        rollbackValue: '阿莫西林可溶性分',
      },
    });
    expect(audit.items[3]).toMatchObject({
      disposition: 'ERP_POLICY_REQUIRED',
      authorityOwner: 'ERP_OPERATIONS',
    });
    expect(audit.guardrails.chanjetWrite).toBe(false);
    expect(audit.guardrails.externalChangeRequiresExplicitApproval).toBe(true);
  });

  it('derives product-specific packaging conversions but never a global unit alias', async () => {
    const service = createService([
      candidate({
        mappingType: 'UOM',
        chanjetName: '提',
        chanjetCode: 'UOM-TI',
      }),
    ], {
      ratios: [{
        bookId: 'BOOK-1',
        productCode: 'EGG-01',
        productName: '鸡蛋',
        sourceUom: '提',
        baseUom: '枚',
        observationCount: 12,
        conversionFactor: 180,
        minFactor: 180,
        maxFactor: 180,
      }],
    });

    const audit = await service.audit();

    expect(audit.items[0]).toMatchObject({
      disposition: 'ERP_POLICY_REQUIRED',
      confidence: 0.99,
      uomPolicyCandidates: [{
        productCode: 'EGG-01',
        sourceUom: '提',
        baseUom: '枚',
        conversionFactor: 180,
      }],
    });
    expect(audit.items[0].recommendedAction).toContain('产品级');
  });

  it('does not invent a specific external update when bank identity evidence is incomplete', async () => {
    const mappingId = '5';
    const service = createService([
      candidate({
        mappingId,
        mappingType: 'CASH_ACCOUNT',
        chanjetName: '总部人民币银行',
      }),
    ], {
      sourceRows: [{
        id: mappingId,
        raw_data: { accountNo: '8888', openingBank: '--' },
      }],
    });

    const audit = await service.audit();

    expect(audit.items[0]).toMatchObject({
      disposition: 'CROSS_SYSTEM_REVIEW_REQUIRED',
      risk: 'HIGH',
      requiresChanjetApproval: false,
      chanjetChangeProposal: null,
    });
    expect(audit.recommendedCanary).toBeNull();
  });

  it('queries mapping source rows with the production bigint primary-key type', async () => {
    const query = jest.fn(async (sql: string, _params?: unknown[]) => {
      if (sql.includes('FROM chanjet_master_mapping')) return [];
      if (sql.includes('WITH lines AS')) return [];
      throw new Error(`unexpected query: ${sql}`);
    });
    const businessReview = {
      plan: jest.fn(async () => ({
        reviewHash: 'review-hash',
        candidates: [candidate({ mappingId: '42' })],
      })),
    };
    const service = new ChanjetHoldResolutionAuditService(
      { query } as never,
      businessReview as never,
    );

    await service.audit();

    expect(query.mock.calls[0][0]).toContain('ANY($1::bigint[])');
    expect(query.mock.calls[0][1]).toEqual([['42']]);
  });

  it('classifies evidenced veterinary trade names without requiring manual domain review', async () => {
    const service = createService([
      candidate({
        mappingId: '43',
        chanjetName: '新流腺',
        evidence: ['runtime evidence rows 14', 'runtime base UOM 瓶'],
      }),
    ]);

    const audit = await service.audit();

    expect(audit.items[0]).toMatchObject({
      disposition: 'ERP_AUTO_APPLY_ELIGIBLE',
      authorityOwner: 'ERP_OPERATIONS',
      autoApplyEligible: true,
    });
  });

  it('does not describe every unresolved packaging unit as livestock pieces', async () => {
    const service = createService([
      candidate({ mappingId: '44', mappingType: 'UOM', chanjetName: '瓶' }),
    ]);

    const audit = await service.audit();

    expect(audit.items[0].recommendedAction).toContain('产品级换算');
    expect(audit.items[0].recommendedAction).not.toContain('禽只');
  });
});
