import { buildWarehouseInboundConfirmPayload } from './warehouse-inbound';

describe('issue 549 inbound identity contract', () => {
  it('keeps MATERIAL identity fields in the confirmation payload', () => {
    const result = buildWarehouseInboundConfirmPayload({
      task_no: 'WI-549',
      material_code: 'MAT-VET-NDV',
      item_type: 'MATERIAL',
      material_type: 'VET_DRUG',
      unit: '瓶',
      qty: 10,
    });

    expect(result).toEqual({
      ok: true,
      payload: {
        task_no: 'WI-549',
        items: [{
          material_code: 'MAT-VET-NDV',
          item_type: 'MATERIAL',
          material_type: 'VET_DRUG',
          unit: '瓶',
          actual_qty: 10,
          expected_qty: 10,
        }],
      },
    });
  });
});
