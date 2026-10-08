export const readonlyApprovalFixture = {
  version: 3, approvalId: 'TEST_APPROVED', floorSha: 'a'.repeat(40),
  sourceClassification: 'PRODUCTION_DATA', remoteWrite: false, erpInbound: false,
  books: [{ bookId: 'BOOK-1', companyCode: 'COMP-1' }, { bookId: 'BOOK-2', companyCode: 'COMP-2' },
    { bookId: 'B1', companyCode: 'COMP-B1' }, { bookId: 'BOOK-LAK', companyCode: 'COMP-LAK' }, { bookId: 'BOOK-THB', companyCode: 'COMP-THB' },
    { bookId: '3533914511118750', companyCode: 'COMP-LAO-AGRI' }, { bookId: '3537748712226818', companyCode: 'COMP-LAO-XINGCHI' }],
  scopes: ["ACCOUNT_BOOKS", "DEPARTMENT", "CUSTOMER_SUPPLIER", "SUBJECT", "PROJECT", "FIN_ACCOUNT", "PAYABLE_STATISTICS", "RECEIVABLE_STATISTICS", "PAYMENT_AP", "PAYMENT_AR", "PURCHASE_ORDER", "SALES_ORDER", "PURCHASE_APPLY", "STOCK_IN", "SALES_STOCK_OUT", "INVENTORY_ON_HAND", "INVENTORY_ON_HAND_LOT", "FINISHED_GOODS_STOCK_IN", "MATERIAL_STOCK_OUT", "OTHER_STOCK_IN", "OTHER_STOCK_OUT", "STOCK_TRANSFER", "STOCK_COUNT", "RETAIL_STOCK_OUT", "VOUCHER_SEARCH", "GL_BALANCE", "BALANCE_SHEET", "INCOME_STATEMENT", "CASH_FLOW"],
  periodPolicy: 'REQUESTED_PERIOD_NO_BACKFILL',
  verification: { bookId: 'BOOK-1', period: '202610', scope: ['RECEIVABLE_STATISTICS'], expiresAt: '2099-01-01T00:00:00Z' },
  verifiedRunId: 'CHANJET-RO-TEST', verifiedEvidenceRunId: '1-1',
};
export function installReadonlyApprovalFixture() {
  const keys = ['CHANJET_SYNC_POLICY', 'CHANJET_READONLY_APPROVAL', 'CHANJET_ERP_INBOUND_SYNC_ENABLED'];
  const previous = Object.fromEntries(keys.map(k => [k, process.env[k]]));
  process.env.CHANJET_SYNC_POLICY = 'READONLY_ACTIVE';
  process.env.CHANJET_READONLY_APPROVAL = JSON.stringify(readonlyApprovalFixture);
  process.env.CHANJET_ERP_INBOUND_SYNC_ENABLED = 'false';
  return () => { for (const [key,value] of Object.entries(previous)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } };
}
