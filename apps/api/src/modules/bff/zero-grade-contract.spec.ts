import { PackagingTerminalBffController } from './bff.controller';

describe('Packaging terminal GRADE_0 contract', () => {
  it('preserves NULL weight_range and includes active GRADE_0 in grade dictionary', async () => {
    const em = { query: jest.fn(async (sql: string) => {
      if (sql.includes('FROM product_grades')) return [{ grade_code: 'GRADE_0', grade_name: '0号特大蛋', grade_name_lo: null, sort_order: 5, is_saleable: true, is_storable: true, weight_range: null }];
      return [];
    }) };
    const controller = new PackagingTerminalBffController(em as never, undefined as never);
    const result = await controller.getDicts('PKG_EGG_GRADE');
    expect(result.data.PKG_EGG_GRADE).toEqual([expect.objectContaining({ code: 'GRADE_0', label: '0号特大蛋', weightRange: null })]);
    expect(em.query.mock.calls[0][0]).toContain("status='ACTIVE' AND is_saleable=true");
  });
});
