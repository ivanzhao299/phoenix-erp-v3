export interface ReceiptPurchaseOrderScope {
  companyId?: string;
  companyCode?: string;
  companyName?: string;
  projectId?: string;
  projectCode?: string;
  projectName?: string;
}

/**
 * A receipt must inherit the owning PO's scope. The receipt list is DataScope
 * filtered, so dropping these fields makes a successfully-created row
 * immediately invisible to non-global procurement users.
 */
export function receiptScopeFromPurchaseOrder(
  po: ReceiptPurchaseOrderScope,
): ReceiptPurchaseOrderScope {
  return {
    companyId: po.companyId || undefined,
    companyCode: po.companyCode || undefined,
    companyName: po.companyName || undefined,
    projectId: po.projectId || undefined,
    projectCode: po.projectCode || undefined,
    projectName: po.projectName || undefined,
  };
}
