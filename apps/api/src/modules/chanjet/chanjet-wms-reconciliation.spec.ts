import {
  buildChanjetWmsCanonicalIdentity,
  ChanjetWmsMasterRecord,
  decideChanjetWmsMasterMapping,
  ErpWmsDocumentSnapshot,
  ErpWmsLineSnapshot,
  reconcileChanjetWmsDocument,
  reconcileChanjetWmsLine,
} from './chanjet-wms-reconciliation';
import {
  NormalizedChanjetInventoryDocument,
  NormalizedChanjetInventoryLine,
} from './chanjet-wms-readonly.contract';

const line = (
  overrides: Partial<NormalizedChanjetInventoryLine> = {},
): NormalizedChanjetInventoryLine => ({
  externalLineId: 'CJ-LINE-1',
  externalLineCode: 'CJ-LINE-CODE-1',
  productCode: 'SKU-EGG-L',
  productName: 'L 级鸡蛋',
  productSpecNo: '',
  itemBarcode: '',
  warehouseCode: 'WH-01',
  warehouseName: '成品仓',
  inventoryLotNo: 'LOT-001',
  quantity: 360,
  unitName: '枚',
  secondaryQuantity: 12,
  secondaryUnitName: '盘',
  listPrice: null,
  netPriceWithTax: null,
  netPriceWithoutTax: null,
  netAmountWithTax: 360,
  netAmountWithoutTax: null,
  taxRate: null,
  taxAmount: null,
  costPrice: null,
  costAmount: 300,
  discountAmount: null,
  allocatedExpenseAmount: null,
  freeGift: false,
  sourceOrderId: '',
  sourceOrderNo: '',
  serialNumbers: [],
  ...overrides,
});

const erpLine = (overrides: Partial<ErpWmsLineSnapshot> = {}): ErpWmsLineSnapshot => ({
  externalLineId: 'CJ-LINE-1',
  externalLineCode: 'CJ-LINE-CODE-1',
  productCode: 'SKU-EGG-L',
  productName: 'L 级鸡蛋',
  warehouseCode: 'WH-01',
  warehouseName: '成品仓',
  inventoryLotNo: 'LOT-001',
  quantity: 360,
  unitName: '枚',
  secondaryQuantity: 12,
  secondaryUnitName: '盘',
  netAmountWithTax: 360,
  costAmount: 300,
  ...overrides,
});

const document = (
  overrides: Partial<NormalizedChanjetInventoryDocument> = {},
): NormalizedChanjetInventoryDocument => ({
  entityType: 'SALES_STOCK_OUT',
  bookId: 'BOOK-01',
  externalDocumentId: 'CJ-DOC-1',
  externalDocumentCode: 'CK-001',
  externalCode: '',
  status: 'EFFECTIVE',
  erpWorkflowStatus: 'COMPLETED',
  source: '',
  redBlueFlag: 'BLUE',
  businessDate: '2026-07-28',
  counterpartyCode: '',
  counterpartyName: '',
  soldToCustomerCode: 'CUS-01',
  soldToCustomerName: '客户一',
  billToCustomerCode: '',
  billToCustomerName: '',
  departmentCode: '',
  departmentName: '',
  employeeCode: '',
  employeeName: '',
  projectCode: '',
  projectName: '',
  warehouseCode: 'WH-01',
  warehouseName: '成品仓',
  currencyId: '',
  currencyCode: 'CNY',
  currencyName: '人民币',
  sourceOrderId: 'SO-ID-1',
  sourceOrderNo: 'SO-001',
  invoiceNo: '',
  invoiceAmount: null,
  comments: '',
  shipping: {},
  attachments: [],
  lines: [line()],
  rawUrlExposed: false,
  ...overrides,
});

const erpDocument = (
  overrides: Partial<ErpWmsDocumentSnapshot> = {},
): ErpWmsDocumentSnapshot => ({
  bookId: 'BOOK-01',
  entityType: 'SALES_STOCK_OUT',
  externalDocumentId: 'CJ-DOC-1',
  externalDocumentCode: 'CK-001',
  status: 'COMPLETED',
  redBlueFlag: 'BLUE',
  businessDate: '2026-07-28',
  warehouseCode: 'WH-01',
  sourceOrderNo: 'SO-001',
  lines: [erpLine()],
  ...overrides,
});

const mappingCandidate = (
  overrides: Partial<ChanjetWmsMasterRecord> = {},
): ChanjetWmsMasterRecord => ({
  id: 'ERP-WH-1',
  bookId: 'BOOK-01',
  code: 'WH-01',
  name: '成品仓',
  status: 'ACTIVE',
  ...overrides,
});

describe('Chanjet WMS reconciliation', () => {
  describe('canonical identity', () => {
    it('uses book, entity type and external id as the canonical identity', () => {
      expect(buildChanjetWmsCanonicalIdentity({
        bookId: 'BOOK-01',
        entityType: 'STOCK_IN',
        externalDocumentId: 'IN/001',
        externalDocumentCode: 'RK-001',
      })).toEqual({
        status: 'OK',
        reasons: [],
        key: 'BOOK-01:STOCK_IN:id:IN%2F001',
        identitySource: 'EXTERNAL_ID',
        bookId: 'BOOK-01',
        entityType: 'STOCK_IN',
        externalIdentity: 'IN/001',
      });
    });

    it('warns when code is the only available identity and holds on missing book', () => {
      expect(buildChanjetWmsCanonicalIdentity({
        bookId: 'BOOK-01',
        entityType: 'STOCK_IN',
        externalDocumentCode: 'RK-001',
      })).toMatchObject({
        status: 'WARN',
        identitySource: 'EXTERNAL_CODE',
        key: 'BOOK-01:STOCK_IN:code:RK-001',
      });
      expect(buildChanjetWmsCanonicalIdentity({
        bookId: '',
        entityType: 'STOCK_IN',
        externalDocumentId: 'IN-1',
      })).toMatchObject({ status: 'HOLD', key: '' });
    });
  });

  describe('master mapping decision', () => {
    it('auto-matches only the same book, code, normalized name and active status', () => {
      expect(decideChanjetWmsMasterMapping({
        bookId: 'BOOK-01',
        code: 'wh-01',
        name: ' 成品 仓 ',
        status: 'ACTIVE',
      }, [
        mappingCandidate({ bookId: 'BOOK-02', id: 'WRONG-BOOK' }),
        mappingCandidate(),
      ])).toEqual({
        status: 'OK',
        reasons: [],
        matchedId: 'ERP-WH-1',
        matchBasis: 'BOOK_CODE_NAME_STATUS',
        candidateIds: ['ERP-WH-1'],
      });
    });

    it('never auto-matches by name alone', () => {
      expect(decideChanjetWmsMasterMapping({
        bookId: 'BOOK-01',
        code: 'CJ-WH-01',
        name: '成品仓',
        status: 'ACTIVE',
      }, [mappingCandidate({ code: 'ERP-WH-01' })])).toEqual({
        status: 'NEED_MANUAL_REVIEW',
        reasons: ['NAME_ONLY_MATCH_REJECTED'],
        matchedId: null,
        matchBasis: 'NAME_ONLY_REJECTED',
        candidateIds: ['ERP-WH-1'],
      });
    });

    it('requires mapping when no code candidate exists', () => {
      expect(decideChanjetWmsMasterMapping({
        bookId: 'BOOK-01',
        code: 'UNKNOWN',
        name: '未知仓',
        status: 'ACTIVE',
      }, [mappingCandidate()])).toMatchObject({
        status: 'NEED_MAPPING',
        matchedId: null,
      });
    });

    it('holds duplicate book/code candidates and unknown statuses', () => {
      expect(decideChanjetWmsMasterMapping({
        bookId: 'BOOK-01',
        code: 'WH-01',
        name: '成品仓',
        status: 'ACTIVE',
      }, [
        mappingCandidate(),
        mappingCandidate({ id: 'ERP-WH-2' }),
      ])).toMatchObject({ status: 'HOLD' });
      expect(decideChanjetWmsMasterMapping({
        bookId: 'BOOK-01',
        code: 'WH-01',
        name: '成品仓',
        status: 'MYSTERY',
      }, [mappingCandidate()])).toMatchObject({
        status: 'HOLD',
        reasons: ['SOURCE_STATUS_UNKNOWN'],
      });
    });

    it('requires review for code/name disagreement and reports status mismatch', () => {
      expect(decideChanjetWmsMasterMapping({
        bookId: 'BOOK-01',
        code: 'WH-01',
        name: '一号仓',
        status: 'ACTIVE',
      }, [mappingCandidate()])).toMatchObject({
        status: 'NEED_MANUAL_REVIEW',
        matchBasis: 'CODE_ONLY',
      });
      expect(decideChanjetWmsMasterMapping({
        bookId: 'BOOK-01',
        code: 'WH-01',
        name: '成品仓',
        status: 'ACTIVE',
      }, [mappingCandidate({ status: 'DISABLED' })])).toMatchObject({
        status: 'MISMATCH',
      });
    });
  });

  describe('line reconciliation', () => {
    it('returns OK for equal primary and secondary quantities', () => {
      expect(reconcileChanjetWmsLine(line(), erpLine(), {
        redBlueFlag: 'BLUE',
      })).toEqual({
        status: 'OK',
        reasons: [],
        lineKey: 'CJ-LINE-1',
        differences: [],
      });
    });

    it('normalizes red quantities before comparison', () => {
      expect(reconcileChanjetWmsLine(
        line({ quantity: 360, secondaryQuantity: 12 }),
        erpLine({ quantity: -360, secondaryQuantity: -12 }),
        { redBlueFlag: 'RED' },
      )).toMatchObject({ status: 'OK' });
    });

    it('holds unknown red/blue flags and incomplete dual UOM', () => {
      const result = reconcileChanjetWmsLine(
        line({ secondaryUnitName: '' }),
        erpLine(),
        { redBlueFlag: 'UNRECOGNIZED' },
      );
      expect(result.status).toBe('HOLD');
      expect(result.reasons).toEqual(expect.arrayContaining([
        'RED_BLUE_FLAG_UNKNOWN',
        'CHANJET_DUAL_UOM_INCOMPLETE',
      ]));
    });

    it('holds unit mismatches and reports quantity differences', () => {
      const result = reconcileChanjetWmsLine(
        line(),
        erpLine({ unitName: '箱', quantity: 359 }),
        { redBlueFlag: 'BLUE' },
      );
      expect(result.status).toBe('HOLD');
      expect(result.reasons).toEqual(expect.arrayContaining([
        'PRIMARY_UOM_MISMATCH',
        'PRIMARY_QUANTITY_MISMATCH',
      ]));
    });

    it('does not downgrade missing warehouse mapping to a normal mapping issue', () => {
      const result = reconcileChanjetWmsLine(line(), erpLine(), {
        redBlueFlag: 'BLUE',
        warehouseMapping: { status: 'NEED_MAPPING', reasons: ['EXACT_CODE_MATCH_NOT_FOUND'] },
        productMapping: { status: 'NEED_MAPPING', reasons: ['EXACT_CODE_MATCH_NOT_FOUND'] },
      });
      expect(result.status).toBe('HOLD');
      expect(result.reasons).toContain('WAREHOUSE_MAPPING_REQUIRED_FOR_STOCK_RECONCILIATION');
      expect(result.reasons).toContain('PRODUCT_MAPPING_EXACT_CODE_MATCH_NOT_FOUND');
    });
  });

  describe('document reconciliation', () => {
    it('returns OK for equivalent documents and lines', () => {
      expect(reconcileChanjetWmsDocument(document(), erpDocument())).toMatchObject({
        status: 'OK',
        reasons: [],
        lines: [{ status: 'OK' }],
      });
    });

    it('returns MISMATCH when an effective Chanjet document is missing in ERP', () => {
      expect(reconcileChanjetWmsDocument(document(), null)).toMatchObject({
        status: 'MISMATCH',
        reasons: ['ERP_DOCUMENT_MISSING'],
      });
    });

    it('warns when an ERP document is not present in the current Chanjet scope', () => {
      expect(reconcileChanjetWmsDocument(null, erpDocument())).toMatchObject({
        status: 'WARN',
        reasons: ['CHANJET_DOCUMENT_NOT_IN_CURRENT_SYNC_SCOPE'],
      });
    });

    it('holds unknown document status and red/blue semantics', () => {
      const result = reconcileChanjetWmsDocument(
        document({ status: 'UNKNOWN_STATE', redBlueFlag: 'UNKNOWN_DIRECTION' }),
        erpDocument(),
      );
      expect(result.status).toBe('HOLD');
      expect(result.reasons).toEqual(expect.arrayContaining([
        'CHANJET_STATUS_UNKNOWN',
        'CHANJET_RED_BLUE_FLAG_UNKNOWN',
      ]));
    });

    it('holds direction mismatches and dual-UOM line failures', () => {
      const result = reconcileChanjetWmsDocument(
        document(),
        erpDocument({
          redBlueFlag: 'RED',
          lines: [erpLine({ secondaryUnitName: '' })],
        }),
      );
      expect(result.status).toBe('HOLD');
      expect(result.reasons).toEqual(expect.arrayContaining([
        'RED_BLUE_DIRECTION_MISMATCH',
        'ERP_DUAL_UOM_INCOMPLETE',
      ]));
    });

    it('reports duplicate ERP line identities as HOLD', () => {
      const result = reconcileChanjetWmsDocument(
        document(),
        erpDocument({ lines: [erpLine(), erpLine()] }),
      );
      expect(result.status).toBe('HOLD');
      expect(result.lines[0].reasons).toContain('DUPLICATE_ERP_LINE_IDENTITY');
    });
  });
});
