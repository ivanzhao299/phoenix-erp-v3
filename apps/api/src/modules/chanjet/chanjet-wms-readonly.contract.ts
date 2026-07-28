export type ChanjetInventoryEntityType =
  | 'STOCK_IN'
  | 'SALES_STOCK_OUT'
  | 'INVENTORY_ON_HAND'
  | 'INVENTORY_ON_HAND_LOT'
  | 'FINISHED_GOODS_STOCK_IN'
  | 'MATERIAL_STOCK_OUT'
  | 'OTHER_STOCK_IN'
  | 'OTHER_STOCK_OUT'
  | 'STOCK_TRANSFER'
  | 'STOCK_COUNT'
  | 'RETAIL_STOCK_OUT';

export interface ChanjetWmsFieldContract {
  sourcePath: string;
  canonicalField: string;
  erpTarget: string;
  required: boolean;
  storage: 'BUSINESS_COLUMN' | 'MIDDLE_LAYER_JSON' | 'CONTROLLED_ATTACHMENT_METADATA';
}

export interface NormalizedChanjetInventoryLine {
  externalLineId: string;
  externalLineCode: string;
  productCode: string;
  productName: string;
  productSpecNo: string;
  itemBarcode: string;
  warehouseCode: string;
  warehouseName: string;
  inventoryLotNo: string;
  quantity: number | null;
  unitName: string;
  secondaryQuantity: number | null;
  secondaryUnitName: string;
  listPrice: number | null;
  netPriceWithTax: number | null;
  netPriceWithoutTax: number | null;
  netAmountWithTax: number | null;
  netAmountWithoutTax: number | null;
  taxRate: number | null;
  taxAmount: number | null;
  costPrice: number | null;
  costAmount: number | null;
  discountAmount: number | null;
  allocatedExpenseAmount: number | null;
  freeGift: boolean;
  sourceOrderId: string;
  sourceOrderNo: string;
  serialNumbers: Array<Record<string, unknown>>;
}

export interface NormalizedChanjetInventoryDocument {
  entityType: ChanjetInventoryEntityType;
  bookId: string;
  externalDocumentId: string;
  externalDocumentCode: string;
  externalCode: string;
  status: string;
  erpWorkflowStatus: 'PENDING' | 'COMPLETED' | 'UNKNOWN';
  source: string;
  redBlueFlag: string;
  businessDate: string;
  counterpartyCode: string;
  counterpartyName: string;
  soldToCustomerCode: string;
  soldToCustomerName: string;
  billToCustomerCode: string;
  billToCustomerName: string;
  departmentCode: string;
  departmentName: string;
  employeeCode: string;
  employeeName: string;
  projectCode: string;
  projectName: string;
  warehouseCode: string;
  warehouseName: string;
  currencyId: string;
  currencyCode: string;
  currencyName: string;
  sourceOrderId: string;
  sourceOrderNo: string;
  invoiceNo: string;
  invoiceAmount: number | null;
  comments: string;
  shipping: Record<string, string>;
  attachments: Array<{ name: string; fileType: string }>;
  lines: NormalizedChanjetInventoryLine[];
  rawUrlExposed: false;
}

const header = (
  sourcePath: string,
  canonicalField: string,
  target: string,
  required = false,
): ChanjetWmsFieldContract => ({
  sourcePath,
  canonicalField,
  erpTarget: target,
  required,
  storage: 'BUSINESS_COLUMN',
});

const line = (
  sourcePath: string,
  canonicalField: string,
  target: string,
  required = false,
): ChanjetWmsFieldContract => ({
  sourcePath,
  canonicalField,
  erpTarget: target,
  required,
  storage: 'BUSINESS_COLUMN',
});

const raw = (sourcePath: string, canonicalField: string): ChanjetWmsFieldContract => ({
  sourcePath,
  canonicalField,
  erpTarget: 'chanjet_entity_snapshots.raw_data',
  required: false,
  storage: 'MIDDLE_LAYER_JSON',
});

export const CHANJET_STOCK_IN_FIELD_CONTRACT: ChanjetWmsFieldContract[] = [
  header('id', 'externalDocumentId', 'wms_inbound.external_document_id', true),
  header('code', 'externalDocumentCode', 'wms_inbound.external_document_no', true),
  header('externalCode', 'externalCode', 'wms_inbound.external_document_id'),
  header('voucherStatusEnum', 'status', 'wms_inbound.external_status', true),
  header('redBlueFlagEnum', 'redBlueFlag', 'wms_inbound.red_blue_flag'),
  header('bizDate', 'businessDate', 'wms_inbound.date', true),
  header('custVendorCode', 'counterpartyCode', 'wms_inbound.counterparty_code'),
  header('custVendorName', 'counterpartyName', 'wms_inbound.counterparty_name'),
  header('vendorCode', 'counterpartyCode', 'wms_inbound.counterparty_code'),
  header('vendorName', 'counterpartyName', 'wms_inbound.counterparty_name'),
  header('departmentCode', 'departmentCode', 'wms_inbound.department_code'),
  header('departmentName', 'departmentName', 'wms_inbound.department_name'),
  header('bizEmployeeCode', 'employeeCode', 'wms_inbound.biz_employee_code'),
  header('bizEmployeeName', 'employeeName', 'wms_inbound.biz_employee_name'),
  header('expenseNoteTypeEnum', 'expenseNoteType', 'wms_inbound.expense_note_type'),
  header('invoiceNo', 'invoiceNo', 'wms_inbound.invoice_no'),
  header('invoiceAmount', 'invoiceAmount', 'wms_inbound.invoice_amount'),
  header('comments', 'comments', 'wms_inbound.comments'),
  header('refVoucherCode', 'sourceOrderNo', 'wms_inbound.source_order_no'),
  header('srcPurchaseOrderId', 'sourceOrderId', 'wms_inbound.source_order_id'),
  header('warehouseCode', 'warehouseCode', 'wms_inbound.warehouse_code', true),
  header('warehouseName', 'warehouseName', 'wms_inbound.warehouse_name'),
  raw('attachmentList', 'attachments'),
  line('voucherDetailList[].id', 'externalLineId', 'wms_inbound_items.external_line_id'),
  line('voucherDetailList[].externalCode', 'externalLineCode', 'wms_inbound_items.external_line_code'),
  line('voucherDetailList[].productCode', 'productCode', 'wms_inbound_items.product_code', true),
  line('voucherDetailList[].productName', 'productName', 'wms_inbound_items.product_name', true),
  line('voucherDetailList[].productSpecNo', 'productSpecNo', 'wms_inbound_items.product_spec_no'),
  line('voucherDetailList[].itemBarcode', 'itemBarcode', 'wms_inbound_items.item_barcode'),
  line('voucherDetailList[].warehouseCode', 'warehouseCode', 'wms_inbound_items.warehouse_code'),
  line('voucherDetailList[].warehouseName', 'warehouseName', 'wms_inbound_items.warehouse_name'),
  line('voucherDetailList[].inventoryLotNo', 'inventoryLotNo', 'wms_inbound_items.inventory_lot_no'),
  line('voucherDetailList[].transQty', 'quantity', 'wms_inbound_items.trans_qty', true),
  line('voucherDetailList[].transUomName', 'unitName', 'wms_inbound_items.trans_uom_name'),
  line('voucherDetailList[].trans2Qty', 'secondaryQuantity', 'wms_inbound_items.trans2_qty'),
  line('voucherDetailList[].trans2UomName', 'secondaryUnitName', 'wms_inbound_items.trans2_uom_name'),
  line('voucherDetailList[].listPrice', 'listPrice', 'wms_inbound_items.list_price'),
  line('voucherDetailList[].netPriceWithTax', 'netPriceWithTax', 'wms_inbound_items.net_price_with_tax'),
  line('voucherDetailList[].netPriceWithoutTax', 'netPriceWithoutTax', 'wms_inbound_items.net_price_without_tax'),
  line('voucherDetailList[].netAmountWithTax', 'netAmountWithTax', 'wms_inbound_items.net_amount_with_tax'),
  line('voucherDetailList[].netAmountWithoutTax', 'netAmountWithoutTax', 'wms_inbound_items.net_amount_without_tax'),
  line('voucherDetailList[].taxPct', 'taxRate', 'wms_inbound_items.tax_rate'),
  line('voucherDetailList[].netTax', 'taxAmount', 'wms_inbound_items.tax_amount'),
  line('voucherDetailList[].costPrice', 'costPrice', 'wms_inbound_items.cost_price'),
  line('voucherDetailList[].costAmount', 'costAmount', 'wms_inbound_items.cost_amount'),
  line('voucherDetailList[].netDiscount', 'discountAmount', 'wms_inbound_items.discount_amount'),
  line('voucherDetailList[].vBaseAllocatedExpenseAmount', 'allocatedExpenseAmount', 'wms_inbound_items.allocated_expense_amount'),
  line('voucherDetailList[].isFreeGift', 'freeGift', 'wms_inbound_items.is_free_gift'),
  line('voucherDetailList[].srcPurchaseOrderId', 'sourceOrderId', 'wms_inbound_items.source_order_id'),
  raw('voucherDetailList[].hierarchyPkgQtysText', 'packageQuantityText'),
  raw('voucherDetailList[].isDirectStockOut', 'directStockOut'),
  raw('voucherDetailList[].serialNumberList', 'serialNumbers'),
];

export const CHANJET_SALES_STOCK_OUT_FIELD_CONTRACT: ChanjetWmsFieldContract[] = [
  header('id', 'externalDocumentId', 'wms_outbound.external_document_id', true),
  header('code', 'externalDocumentCode', 'wms_outbound.external_document_no', true),
  header('externalCode', 'externalCode', 'wms_outbound.external_document_id'),
  header('voucherStatusEnum', 'status', 'wms_outbound.external_status', true),
  header('srcWebsiteEnum', 'source', 'wms_outbound.external_source'),
  header('redBlueFlagEnum', 'redBlueFlag', 'wms_outbound.red_blue_flag'),
  header('bizDate', 'businessDate', 'wms_outbound.date', true),
  header('soldToCustomerCode', 'soldToCustomerCode', 'wms_outbound.sold_to_customer_code'),
  header('soldToCustomerName', 'soldToCustomerName', 'wms_outbound.sold_to_customer_name'),
  header('billToCustomerCode', 'billToCustomerCode', 'wms_outbound.bill_to_customer_code'),
  header('billToCustomerName', 'billToCustomerName', 'wms_outbound.bill_to_customer_name'),
  header('departmentCode', 'departmentCode', 'wms_outbound.department_code'),
  header('departmentName', 'departmentName', 'wms_outbound.department_name'),
  header('bizEmployeeCode', 'employeeCode', 'wms_outbound.biz_employee_code'),
  header('bizEmployeeName', 'employeeName', 'wms_outbound.biz_employee_name'),
  header('projectCode', 'projectCode', 'wms_outbound.project_code'),
  header('projectName', 'projectName', 'wms_outbound.project_name'),
  header('warehouseCode', 'warehouseCode', 'wms_outbound.warehouse_code', true),
  header('warehouseName', 'warehouseName', 'wms_outbound.warehouse_name'),
  header('currencyId', 'currencyId', 'wms_outbound.currency_id'),
  header('currencyCode', 'currencyCode', 'wms_outbound.currency_code'),
  header('currencyName', 'currencyName', 'wms_outbound.currency_name'),
  header('refVoucherId', 'sourceOrderId', 'wms_outbound.source_order_id'),
  header('refVoucherCode', 'sourceOrderNo', 'wms_outbound.source_order_no'),
  header('srcSalesOrderId', 'sourceOrderId', 'wms_outbound.source_order_id'),
  header('srcSalesOrderCode', 'sourceOrderNo', 'wms_outbound.source_order_no'),
  header('expectedDeliveryDate', 'expectedDeliveryDate', 'wms_outbound.expected_delivery_date'),
  header('deliveryAddress', 'deliveryAddress', 'wms_outbound.delivery_address'),
  header('contact', 'contact', 'wms_outbound.contact_name'),
  header('contactPhone', 'contactPhone', 'wms_outbound.contact_phone'),
  header('shipMethodName', 'shipMethod', 'wms_outbound.ship_method'),
  header('pickUpPerson', 'pickupPerson', 'wms_outbound.pickup_person'),
  header('pickUpTel', 'pickupPhone', 'wms_outbound.pickup_phone'),
  header('trackingNo', 'trackingNo', 'wms_outbound.tracking_no'),
  header('driverName', 'driverName', 'wms_outbound.driver_name'),
  header('truckNo', 'truckNo', 'wms_outbound.truck_no'),
  header('carrierCode', 'carrierCode', 'wms_outbound.carrier_code'),
  header('carrierName', 'carrierName', 'wms_outbound.carrier_name'),
  header('comments', 'comments', 'wms_outbound.comments'),
  raw('invoiceTypeEnum', 'invoiceType'),
  raw('customFieldMap', 'customFields'),
  line('voucherDetailList[].id', 'externalLineId', 'wms_outbound_items.external_line_id'),
  line('voucherDetailList[].externalCode', 'externalLineCode', 'wms_outbound_items.external_line_code'),
  line('voucherDetailList[].productCode', 'productCode', 'wms_outbound_items.product_code', true),
  line('voucherDetailList[].productName', 'productName', 'wms_outbound_items.product_name', true),
  line('voucherDetailList[].productSpecNo', 'productSpecNo', 'wms_outbound_items.product_spec_no'),
  line('voucherDetailList[].itemBarcode', 'itemBarcode', 'wms_outbound_items.item_barcode'),
  line('voucherDetailList[].warehouseCode', 'warehouseCode', 'wms_outbound_items.warehouse_code'),
  line('voucherDetailList[].warehouseName', 'warehouseName', 'wms_outbound_items.warehouse_name'),
  line('voucherDetailList[].inventoryLotNo', 'inventoryLotNo', 'wms_outbound_items.inventory_lot_no'),
  line('voucherDetailList[].issuedQty', 'quantity', 'wms_outbound_items.trans_qty', true),
  line('voucherDetailList[].transQty', 'quantity', 'wms_outbound_items.trans_qty'),
  line('voucherDetailList[].transUomName', 'unitName', 'wms_outbound_items.trans_uom_name'),
  line('voucherDetailList[].trans2Qty', 'secondaryQuantity', 'wms_outbound_items.trans2_qty'),
  line('voucherDetailList[].trans2UomName', 'secondaryUnitName', 'wms_outbound_items.trans2_uom_name'),
  line('voucherDetailList[].listPrice', 'listPrice', 'wms_outbound_items.list_price'),
  line('voucherDetailList[].netPriceWithTax', 'netPriceWithTax', 'wms_outbound_items.net_price_with_tax'),
  line('voucherDetailList[].netPriceWithoutTax', 'netPriceWithoutTax', 'wms_outbound_items.net_price_without_tax'),
  line('voucherDetailList[].netAmountWithTax', 'netAmountWithTax', 'wms_outbound_items.net_amount_with_tax'),
  line('voucherDetailList[].netAmountWithoutTax', 'netAmountWithoutTax', 'wms_outbound_items.net_amount_without_tax'),
  line('voucherDetailList[].taxPct', 'taxRate', 'wms_outbound_items.tax_rate'),
  line('voucherDetailList[].netTax', 'taxAmount', 'wms_outbound_items.tax_amount'),
  line('voucherDetailList[].netDiscount', 'discountAmount', 'wms_outbound_items.discount_amount'),
  line('voucherDetailList[].isFreeGift', 'freeGift', 'wms_outbound_items.is_free_gift'),
  line('voucherDetailList[].srcSalesOrderId', 'sourceOrderId', 'wms_outbound_items.source_order_id'),
  line('voucherDetailList[].srcSalesOrderCode', 'sourceOrderNo', 'wms_outbound_items.source_order_no'),
  raw('voucherDetailList[].customFieldMap', 'lineCustomFields'),
  raw('voucherDetailList[].serialNumberList', 'serialNumbers'),
];

export const CHANJET_WMS_ERP_COLUMN_REQUIREMENTS = [
  ...new Set([
    ...CHANJET_STOCK_IN_FIELD_CONTRACT,
    ...CHANJET_SALES_STOCK_OUT_FIELD_CONTRACT,
  ].filter((field) => field.storage === 'BUSINESS_COLUMN').map((field) => field.erpTarget)),
];

const record = (value: unknown): Record<string, unknown> => (
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
);

const text = (source: Record<string, unknown>, ...keys: string[]): string => {
  for (const key of keys) {
    const value = source[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  }
  return '';
};

const numeric = (source: Record<string, unknown>, ...keys: string[]): number | null => {
  for (const key of keys) {
    const value = source[key];
    if (value === null || value === undefined || value === '') continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
};

const array = (source: Record<string, unknown>, ...keys: string[]): Record<string, unknown>[] => {
  for (const key of keys) {
    const value = source[key];
    if (Array.isArray(value)) return value.map(record).filter((item) => Object.keys(item).length > 0);
  }
  return [];
};

const normalizeStatus = (status: string): NormalizedChanjetInventoryDocument['erpWorkflowStatus'] => {
  if (status === 'SUBMITTED') return 'PENDING';
  if (status === 'EFFECTIVE') return 'COMPLETED';
  return 'UNKNOWN';
};

export function normalizeChanjetInventoryDocument(
  rawInput: Record<string, unknown>,
  entityType: ChanjetInventoryEntityType,
  bookId: string,
): NormalizedChanjetInventoryDocument {
  const raw = record(rawInput);
  const status = text(raw, 'voucherStatusEnum', 'statusEnum', 'status');
  const lines = array(raw, 'voucherDetailList', 'detailList', 'details', 'items').map((item) => ({
    externalLineId: text(item, 'id', 'detailId'),
    externalLineCode: text(item, 'externalCode', 'code'),
    productCode: text(item, 'productCode', 'itemCode'),
    productName: text(item, 'productName', 'itemName'),
    productSpecNo: text(item, 'productSpecNo', 'specification', 'specNo'),
    itemBarcode: text(item, 'itemBarcode', 'barcode'),
    warehouseCode: text(item, 'warehouseCode'),
    warehouseName: text(item, 'warehouseName'),
    inventoryLotNo: text(item, 'inventoryLotNo', 'lotNo', 'batchNo'),
    quantity: numeric(item, 'issuedQty', 'transQty', 'quantity', 'qty'),
    unitName: text(item, 'transUomName', 'uomName', 'unitName'),
    secondaryQuantity: numeric(item, 'trans2Qty', 'secondaryQty'),
    secondaryUnitName: text(item, 'trans2UomName', 'secondaryUomName'),
    listPrice: numeric(item, 'listPrice'),
    netPriceWithTax: numeric(item, 'netPriceWithTax'),
    netPriceWithoutTax: numeric(item, 'netPriceWithoutTax'),
    netAmountWithTax: numeric(item, 'netAmountWithTax'),
    netAmountWithoutTax: numeric(item, 'netAmountWithoutTax'),
    taxRate: numeric(item, 'taxPct', 'taxRate'),
    taxAmount: numeric(item, 'netTax', 'taxAmount'),
    costPrice: numeric(item, 'costPrice'),
    costAmount: numeric(item, 'costAmount'),
    discountAmount: numeric(item, 'netDiscount', 'discountAmount'),
    allocatedExpenseAmount: numeric(item, 'vBaseAllocatedExpenseAmount', 'allocatedExpenseAmount'),
    freeGift: item.isFreeGift === true,
    sourceOrderId: text(item, 'srcPurchaseOrderId', 'srcSalesOrderId', 'refVoucherId'),
    sourceOrderNo: text(item, 'srcPurchaseOrderCode', 'srcSalesOrderCode', 'refVoucherCode'),
    serialNumbers: array(item, 'serialNumberList', 'serialNumbers'),
  }));
  const attachments = array(raw, 'attachmentList').map((item) => ({
    name: text(item, 'fileName', 'name', 'originalName'),
    fileType: text(item, 'fileType', 'extension', 'type'),
  }));
  return {
    entityType,
    bookId,
    // Provider codes are not stable substitutes for immutable document IDs.
    // Keep them separate so downstream promotion can require manual review.
    externalDocumentId: text(raw, 'id', 'voucherId'),
    externalDocumentCode: text(raw, 'code', 'voucherCode', 'billCode'),
    externalCode: text(raw, 'externalCode'),
    status,
    erpWorkflowStatus: normalizeStatus(status),
    source: text(raw, 'srcWebsiteEnum', 'sourceEnum', 'source'),
    redBlueFlag: text(raw, 'redBlueFlagEnum', 'redBlueFlag'),
    businessDate: text(raw, 'bizDate', 'businessDate', 'voucherDate'),
    counterpartyCode: text(raw, 'custVendorCode', 'vendorCode', 'customerCode'),
    counterpartyName: text(raw, 'custVendorName', 'vendorName', 'customerName'),
    soldToCustomerCode: text(raw, 'soldToCustomerCode'),
    soldToCustomerName: text(raw, 'soldToCustomerName'),
    billToCustomerCode: text(raw, 'billToCustomerCode'),
    billToCustomerName: text(raw, 'billToCustomerName'),
    departmentCode: text(raw, 'departmentCode'),
    departmentName: text(raw, 'departmentName'),
    employeeCode: text(raw, 'bizEmployeeCode', 'employeeCode'),
    employeeName: text(raw, 'bizEmployeeName', 'employeeName'),
    projectCode: text(raw, 'projectCode'),
    projectName: text(raw, 'projectName'),
    warehouseCode: text(raw, 'warehouseCode'),
    warehouseName: text(raw, 'warehouseName'),
    currencyId: text(raw, 'currencyId'),
    currencyCode: text(raw, 'currencyCode'),
    currencyName: text(raw, 'currencyName'),
    sourceOrderId: text(raw, 'srcPurchaseOrderId', 'srcSalesOrderId', 'refVoucherId'),
    sourceOrderNo: text(raw, 'srcPurchaseOrderCode', 'srcSalesOrderCode', 'refVoucherCode'),
    invoiceNo: text(raw, 'invoiceNo'),
    invoiceAmount: numeric(raw, 'invoiceAmount'),
    comments: text(raw, 'comments', 'remark'),
    shipping: {
      expectedDeliveryDate: text(raw, 'expectedDeliveryDate'),
      deliveryAddress: text(raw, 'deliveryAddress', 'address'),
      contactName: text(raw, 'contact', 'contactName'),
      contactPhone: text(raw, 'contactPhone', 'mobilePhone'),
      shipMethod: text(raw, 'shipMethodName', 'shipMethod'),
      pickupPerson: text(raw, 'pickUpPerson', 'pickupPerson'),
      pickupPhone: text(raw, 'pickUpTel', 'pickupPhone'),
      trackingNo: text(raw, 'trackingNo'),
      driverName: text(raw, 'driverName'),
      truckNo: text(raw, 'truckNo'),
      carrierCode: text(raw, 'carrierCode'),
      carrierName: text(raw, 'carrierName'),
    },
    attachments,
    lines,
    rawUrlExposed: false,
  };
}
