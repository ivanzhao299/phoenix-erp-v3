import {
  CHANJET_SALES_STOCK_OUT_FIELD_CONTRACT,
  CHANJET_STOCK_IN_FIELD_CONTRACT,
  normalizeChanjetInventoryDocument,
} from './chanjet-wms-readonly.contract';

describe('Chanjet WMS readonly contract', () => {
  it('covers official inbound and outbound header and detail contracts', () => {
    expect(CHANJET_STOCK_IN_FIELD_CONTRACT.length).toBeGreaterThanOrEqual(45);
    expect(CHANJET_SALES_STOCK_OUT_FIELD_CONTRACT.length).toBeGreaterThanOrEqual(60);
    expect(CHANJET_STOCK_IN_FIELD_CONTRACT.some((field) => field.sourcePath === 'voucherStatusEnum')).toBe(true);
    expect(CHANJET_SALES_STOCK_OUT_FIELD_CONTRACT.some((field) => field.sourcePath === 'voucherDetailList[].serialNumberList')).toBe(true);
  });

  it('normalizes stock-in without exposing attachment urls', () => {
    const normalized = normalizeChanjetInventoryDocument({
      id: 'IN-1',
      code: 'RK-001',
      voucherStatusEnum: 'EFFECTIVE',
      bizDate: '2026-07-28',
      custVendorCode: 'SUP-1',
      custVendorName: '供应商一',
      attachmentList: [{ fileName: '采购合同.pdf', originalUrl: 'https://unsafe.example/file.pdf' }],
      voucherDetailList: [{
        id: 'LINE-1',
        productCode: 'FEED-1',
        productName: '蛋鸡饲料',
        transQty: '100.5',
        transUomName: 'kg',
        costPrice: '3.2',
      }],
    }, 'STOCK_IN', 'BOOK-1');

    expect(normalized.erpWorkflowStatus).toBe('COMPLETED');
    expect(normalized.counterpartyCode).toBe('SUP-1');
    expect(normalized.lines[0]).toMatchObject({
      productCode: 'FEED-1',
      quantity: 100.5,
      unitName: 'kg',
      costPrice: 3.2,
    });
    expect(normalized.attachments).toEqual([{ name: '采购合同.pdf', fileType: '' }]);
    expect(JSON.stringify(normalized)).not.toContain('unsafe.example');
    expect(normalized.rawUrlExposed).toBe(false);
  });

  it('normalizes sales stock-out shipping, customer and dual-uom fields', () => {
    const normalized = normalizeChanjetInventoryDocument({
      id: 'OUT-1',
      code: 'CK-001',
      voucherStatusEnum: 'SUBMITTED',
      srcWebsiteEnum: 'PDA',
      soldToCustomerCode: 'CUS-1',
      soldToCustomerName: '客户一',
      shipMethodName: '配送',
      trackingNo: 'TRK-1',
      voucherDetailList: [{
        productCode: 'EGG-XL',
        productName: 'XL 鸡蛋',
        issuedQty: '360',
        transUomName: '枚',
        trans2Qty: '12',
        trans2UomName: '盘',
        serialNumberList: [{ serialNo: 'S-1' }],
      }],
    }, 'SALES_STOCK_OUT', 'BOOK-1');

    expect(normalized.erpWorkflowStatus).toBe('PENDING');
    expect(normalized.source).toBe('PDA');
    expect(normalized.soldToCustomerCode).toBe('CUS-1');
    expect(normalized.shipping).toMatchObject({ shipMethod: '配送', trackingNo: 'TRK-1' });
    expect(normalized.lines[0]).toMatchObject({
      quantity: 360,
      unitName: '枚',
      secondaryQuantity: 12,
      secondaryUnitName: '盘',
    });
  });

  it('normalizes production inventory documents through the shared contract', () => {
    const normalized = normalizeChanjetInventoryDocument({
      id: 'MATERIAL-OUT-1',
      code: 'MO-001',
      voucherStatusEnum: 'EFFECTIVE',
      bizDate: '2026-07-28',
      voucherDetailList: [{
        productCode: 'FEED-001',
        productName: '产蛋鸡饲料',
        warehouseCode: 'WH-RAW',
        issuedQty: 12,
        transUomName: '袋',
      }],
    }, 'MATERIAL_STOCK_OUT', 'BOOK-1');

    expect(normalized.entityType).toBe('MATERIAL_STOCK_OUT');
    expect(normalized.erpWorkflowStatus).toBe('COMPLETED');
    expect(normalized.lines[0]).toMatchObject({
      productCode: 'FEED-001',
      warehouseCode: 'WH-RAW',
      quantity: 12,
      unitName: '袋',
    });
    expect(normalized.rawUrlExposed).toBe(false);
  });
});
