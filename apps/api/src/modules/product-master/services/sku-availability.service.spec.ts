import { BadRequestException } from '@nestjs/common';
import { SkuAvailabilityService, SkuResolveInput } from './sku-availability.service';

/** Fail-closed contracts; no production database connections or policy mocks. */
describe('SkuAvailabilityService', () => {
  const today = '2026-11-11';
  const skuRow = (code = 'SKU-R', variety: string | null = 'EGG_RED', productVariety = variety) => ({
    sku_code: code, product_code: 'PRD-R', variety_code: variety, product_variety_code: productVariety,
    grade_code: 'GRADE_1', spec_code: 'LOOSE', status: 'ACTIVE', today,
    effective_date: null, expire_date: null,
  });
  const scopeRow = (type = 'COMPANY', code = 'COMP-A', extra = {}) => ({
    scope_type: type, scope_code: code, sale_enabled: true, stock_enabled: true,
    status: 'ACTIVE', effective_date: null as string | null, expire_date: null as string | null, today, ...extra,
  });
  const flockRow = (extra = {}) => ({
    flock_no: 'FLOCK-A', farm_code: 'FARM-A', breed_code: 'HY_LINE_BROWN',
    status: 'LAYING', placement_date: '2026-01-01', elimination_date: null, ...extra,
  });
  const base: SkuResolveInput = { companyCode: 'COMP-A', gradeCode: 'GRADE_1', varietyCode: 'EGG_RED', usage: 'stock', houseCode: 'HOUSE-A', eggDate: '2026-11-01', sourceProfileCode: 'SRC-A' };
  const house: SkuResolveInput = { companyCode: 'COMP-A', gradeCode: 'GRADE_1', houseCode: 'HOUSE-A', eggDate: '2026-11-01', usage: 'stock' };

  const setup = () => {
    const state = {
      company: [{ org_code: 'COMP-A' }],
      ownership: [{ house_code: 'HOUSE-A', farm_code: 'FARM-A', company_code: 'COMP-A', site_code: 'SITE-A' }],
      profiles: [{ profile_code: 'SRC-A', company_code: 'COMP-A', farm_code: 'FARM-A', site_code: 'SITE-A', house_code: 'HOUSE-A', product_mode: 'VARIANT', variety_code: 'EGG_RED' as string | null, effective_date: '2026-01-01', expire_date: null as string | null, status: 'ACTIVE' }],
      flocks: [flockRow()],
      dict: [{ dict_code: 'HY_LINE_BROWN' }],
      mappings: [{ variety_code: 'EGG_RED' }],
      varieties: ['EGG_RED', 'EGG_PINK'].map(variety_code => ({variety_code,status:'ACTIVE',effective_date:'2026-01-01',expire_date:null})),
      skus: [skuRow()],
      scopes: [scopeRow()],
      product: { status: 'ACTIVE', variety_code: 'EGG_RED' as string | null },
      grade: { status: 'ACTIVE', is_saleable: true, is_storable: true },
      spec: { status: 'ACTIVE', base_unit: '枚' },
    };
    const query = jest.fn(async (sql: string, params: unknown[] = []) => {
      if (sql.includes('pg_advisory_xact_lock_shared')) return [];
      if (sql.includes('FROM md_egg_source_profiles')) return state.profiles;
      if (sql.includes('FROM sys_organizations')) return state.company;
      if (sql.includes('FROM brd_houses') || sql.includes('FROM brd_farms')) return state.ownership;
      if (sql.includes('FROM brd_flocks')) return state.flocks;
      if (sql.includes('FROM sys_dict')) return state.dict;
      if (sql.includes('FROM md_variety_breeds')) return state.mappings;
      if (sql.includes('FROM md_product_varieties')) return state.varieties.filter(v => v.variety_code === params[0]);
      if (sql.includes('FROM md_sku_org_scope')) return state.scopes;
      if (sql.includes('FROM product_skus s')) return state.skus;
      if (sql.includes('FROM product_skus WHERE')) return state.skus.filter(s => s.sku_code === params[0]);
      if (sql.includes('FROM mst_products')) return [state.product];
      if (sql.includes('FROM product_grades')) return [state.grade];
      if (sql.includes('FROM packaging_specs')) return [state.spec];
      throw new Error(`Unexpected SQL: ${sql}`);
    });
    return { state, db: { query }, svc: new SkuAvailabilityService({ query } as never) };
  };

  it('resolves a variety SKU through explicit COMPANY authorization', async () => {
    const { svc, db } = setup();
    await expect(svc.resolve(base)).resolves.toMatchObject({
      skuCode: 'SKU-R', varietyCode: 'EGG_RED', scopeType: 'COMPANY', scopeCode: 'COMP-A', stockEnabled: true,
    });
    const [sql, params] = db.query.mock.calls.find(([sql]) => sql.includes('FROM product_skus s'))!;
    expect(sql).toContain('p.variety_code = ANY($3::text[]) OR s.variety_code = ANY($3::text[])');
    expect(params).toEqual(['GRADE_1', 'LOOSE', ['EGG_RED'], false]);
  });

  it('does not let another company same-color SKU block its own authorized SKU', async () => {
    const { svc, state, db } = setup();
    state.skus.push(skuRow('SKU-OTHER'));
    const original = db.query.getMockImplementation()!;
    db.query.mockImplementation(async (sql, args) => sql.includes('FROM md_sku_org_scope') && args?.[0] === 'SKU-OTHER'
      ? [scopeRow('COMPANY', 'COMP-B')] : original(sql, args));
    await expect(svc.resolve(base)).resolves.toMatchObject({ skuCode: 'SKU-R', scopeCode: 'COMP-A' });
  });

  it('rejects multiple usable SKUs rather than choosing the first', async () => {
    const { svc, state } = setup();
    state.skus.push(skuRow('SKU-R-2'));
    await expect(svc.resolve(base)).rejects.toThrow('匹配多个可用 SKU');
  });

  it.each([undefined, null, '', '  '])('rejects missing house provenance %p without global fallback', async houseCode => {
    const { svc, state, db } = setup();
    state.skus = [skuRow('LEGACY', null)];
    state.scopes = [scopeRow('ALL', '')];
    await expect(svc.resolve({ ...base, houseCode })).rejects.toThrow('houseCode');
    expect(db.query.mock.calls.some(([sql]) => sql.includes('FROM product_skus'))).toBe(false);
  });

  it('rejects unknown, inactive or out-of-date explicit varieties', async () => {
    const { svc, state, db } = setup();
    state.varieties = [];
    await expect(svc.resolve(base)).rejects.toThrow('不在业务日期有效期');
    const [sql] = db.query.mock.calls.find(([sql]) => sql.includes('FROM md_product_varieties'))!;
    expect(sql).toContain("status = 'ACTIVE'");
    expect(sql).toContain('effective_date <= COALESCE($2::date, CURRENT_DATE)');
    expect(sql).toContain('expire_date >= COALESCE($2::date, CURRENT_DATE)');
  });

  it('reports zero candidates with the variety context', async () => {
    const { svc, state } = setup();
    state.skus = [];
    await expect(svc.resolve(base)).rejects.toThrow('品种 EGG_RED');
  });

  it.each([
    [null, 'EGG_RED'], ['EGG_RED', null], ['EGG_RED', 'EGG_PINK'], ['EGG_PINK', 'EGG_RED'],
  ])('rejects SKU/product variety disagreement %p/%p', async (skuVariety, productVariety) => {
    const { svc, state } = setup();
    state.skus = [skuRow('BAD', skuVariety, productVariety)];
    await expect(svc.resolve(base)).rejects.toThrow('产品品种不一致');
    await expect(svc.assertUsable('BAD', base)).rejects.toThrow('产品品种不一致');
  });

  it('validates every candidate, not just the first usable match', async () => {
    const { svc, state, db } = setup();
    state.skus.push(skuRow('BAD', 'EGG_RED', 'EGG_PINK'));
    await expect(svc.resolve(base)).rejects.toThrow('SKU BAD');
    expect(db.query.mock.calls.some(([sql]) => sql.includes('FROM packaging_specs'))).toBe(true);
  });

  it.each(['sku', 'product', 'grade', 'spec'])('rejects disabled %s and locks parent decisions', async kind => {
    const { svc, state } = setup();
    if (kind === 'sku') state.skus[0].status = 'DISABLED';
    else state[kind as 'product' | 'grade' | 'spec'].status = 'DISABLED';
    await expect(svc.resolve(base)).rejects.toBeInstanceOf(BadRequestException);
    await expect(svc.assertUsable('SKU-R', base)).rejects.toBeInstanceOf(BadRequestException);
  });

  it.each(['effective_date', 'expire_date'] as const)('rejects SKU outside %s', async key => {
    const { svc, state } = setup();
    Object.assign(state.skus[0], { [key]: key === 'effective_date' ? '2099-01-01' : '2000-01-01' });
    await expect(svc.resolve(base)).rejects.toThrow('不在生效期');
  });

  it.each(['sale', 'stock', 'sale-stock'] as const)('assertUsable enforces scope %s switches', async usage => {
    const { svc, state } = setup();
    state.scopes = [scopeRow('COMPANY', 'COMP-A', { sale_enabled: usage === 'stock', stock_enabled: usage === 'sale' })];
    await expect(svc.assertUsable('SKU-R', { ...base, usage })).rejects.toThrow('用途被禁用');
  });

  it('assertUsable enforces explicit variety and defaults to stock, not any', async () => {
    const { svc, state } = setup();
    await expect(svc.assertUsable('SKU-R', { ...base, varietyCode: 'EGG_PINK' })).rejects.toThrow('来源档案品种');
    state.scopes = [scopeRow('COMPANY', 'COMP-A', { stock_enabled: false })];
    await expect(svc.assertUsable('SKU-R', { ...base, varietyCode: 'EGG_RED' })).rejects.toThrow('用途被禁用');
    await expect(svc.assertUsable('SKU-R', { companyCode: 'COMP-A' })).rejects.toThrow('houseCode');
  });

  it('assertUsable accepts a valid explicit SKU and rejects a missing one', async () => {
    const { svc, state } = setup();
    await expect(svc.assertUsable('SKU-R', { ...base, usage: 'sale' })).resolves.toMatchObject({ saleEnabled: true, scopeType: 'COMPANY' });
    state.skus = [];
    await expect(svc.assertUsable('MISSING', base)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('enforces grade usage independently of scope switches', async () => {
    const { svc, state } = setup();
    state.grade.is_saleable = false;
    await expect(svc.assertUsable('SKU-R', { ...base, usage: 'sale' })).rejects.toThrow('等级不可销售');
    state.grade.is_storable = false;
    await expect(svc.resolve(base)).rejects.toThrow('等级不可库存');
  });

  it.each([
    { scopes: [] }, { scopes: [scopeRow('ALL', '')] },
    { scopes: [scopeRow('FARM', 'FARM-A')] }, { scopes: [scopeRow('SITE', 'SITE-A')] },
  ])(
    'requires COMPANY even with other grants: %p', async ({ scopes }) => {
      const { svc, state } = setup();
      state.scopes = scopes;
      await expect(svc.resolve({ ...base, farmCode: 'FARM-A' })).rejects.toThrow('不适用于公司 COMP-A');
    },
  );

  it('chooses SITE only after all COMPANY/FARM/SITE gates pass', async () => {
    const { svc, state } = setup();
    state.scopes = [scopeRow('COMPANY'), scopeRow('FARM', 'FARM-A'), scopeRow('SITE', 'SITE-A')];
    await expect(svc.resolve({ ...base, farmCode: 'FARM-A' })).resolves.toMatchObject({ scopeType: 'SITE' });
  });

  it.each(['COMPANY', 'FARM', 'SITE'])('does not let another layer bypass %s vetoes', async type => {
    for (const veto of [
      { status: 'DISABLED' }, { effective_date: '2099-01-01' }, { expire_date: '2000-01-01' }, { stock_enabled: false },
    ]) {
      const { svc, state } = setup();
      state.scopes = [scopeRow('COMPANY'), scopeRow('FARM', 'FARM-A'), scopeRow('SITE', 'SITE-A')]
        .map(row => row.scope_type === type ? { ...row, ...veto } : row);
      await expect(svc.resolve({ ...base, farmCode: 'FARM-A' })).rejects.toThrow('不适用于公司');
      await expect(svc.assertUsable('SKU-R', { ...base, farmCode: 'FARM-A' })).rejects.toThrow('不适用于公司');
    }
  });

  it('returns intersection flags even for any usage', async () => {
    const { svc, state } = setup();
    state.scopes = [scopeRow('COMPANY', 'COMP-A', { stock_enabled: false }), scopeRow('SITE', 'SITE-A')];
    await expect(svc.assertUsable('SKU-R', { ...base, farmCode: 'FARM-A', usage: 'any' }))
      .resolves.toMatchObject({ scopeType: 'SITE', saleEnabled: true, stockEnabled: false });
  });

  it('never hides inactive/expired scope vetoes in SQL or selects ALL', async () => {
    const { svc, db } = setup();
    await svc.resolve(base);
    const [sql] = db.query.mock.calls.find(([sql]) => sql.includes('FROM md_sku_org_scope'))!;
    expect(sql).not.toContain("status = 'ACTIVE'");
    expect(sql).not.toContain("scope_type = 'ALL'");
    expect(sql).toContain('FOR SHARE');
  });

  it.each(['ACTIVE', 'LAYING', 'PEAK', 'DECLINING'])('derives %s flock variety with business date and authoritative ownership', async status => {
    const { svc, state, db } = setup();
    state.flocks = [flockRow({ status })];
    await expect(svc.resolveVarietiesByHouse(house)).resolves.toEqual(['EGG_RED']);
    const [sql] = db.query.mock.calls.find(([sql]) => sql.includes('FROM brd_flocks'))!;
    expect(sql).not.toContain('breed_code IS NOT NULL');
    expect(sql).not.toContain('status IN');
    const [, params] = db.query.mock.calls.find(([sql]) => sql.includes('FROM md_product_varieties'))!;
    expect(params).toEqual(['EGG_RED', house.eggDate]);
    expect(db.query.mock.calls.find(([sql]) => sql.includes('FROM brd_houses'))![0]).toContain("NULLIF(to_jsonb(f)->>'mapped_site_code', '')");
  });

  it.each([undefined, '', '2026-02-30', '2026-11-01T00:00:00Z'])('requires a valid business date with house: %p', async eggDate => {
    const { svc, db } = setup();
    await expect(svc.resolve({ ...house, eggDate })).rejects.toThrow('eggDate');
    expect(db.query.mock.calls.some(([sql]) => sql.includes('FROM brd_flocks'))).toBe(false);
  });

  it.each([
    { breed_code: null }, { breed_code: '' }, { breed_code: ' ' }, { placement_date: null },
    { farm_code: 'OTHER' }, { status: 'GROWING' }, { status: 'ELIMINATED' },
    { elimination_date: '2026-11-01' },
  ])('does not discard an uncertain overlapping flock: %p', async bad => {
    const { svc, state } = setup();
    state.flocks.push(flockRow({ flock_no: 'UNKNOWN', ...bad }));
    await expect(svc.resolveVarietiesByHouse(house)).rejects.toThrow('不确定');
  });

  it('excludes only provably non-overlapping flocks, not historical/current guesses', async () => {
    const { svc, state } = setup();
    state.flocks.push(
      flockRow({ status: 'ELIMINATED', breed_code: null, elimination_date: '2026-10-31' }),
      flockRow({ breed_code: null, placement_date: '2026-11-02' }),
    );
    await expect(svc.resolveVarietiesByHouse(house)).resolves.toEqual(['EGG_RED']);
    state.flocks = state.flocks.slice(1);
    await expect(svc.resolveVarietiesByHouse(house)).rejects.toThrow('没有可确认');
  });

  it('accepts the flock UI entry date start_date only when placement_date is absent or agrees', async () => {
    const { svc, state, db } = setup();
    state.flocks = [flockRow({ placement_date: null, start_date: '2026-01-01' })];
    await expect(svc.resolveVarietiesByHouse(house)).resolves.toEqual(['EGG_RED']);
    state.flocks = [flockRow({ start_date: '2026-01-01' })];
    await expect(svc.resolveVarietiesByHouse(house)).resolves.toEqual(['EGG_RED']);
    expect(db.query.mock.calls.find(([sql]) => sql.includes('FROM brd_flocks'))![0]).toContain('f.start_date::text AS start_date');
  });

  it('rejects conflicting historical entry dates rather than choosing the more convenient date', async () => {
    const { svc, state } = setup();
    state.flocks = [flockRow({ placement_date: '2026-01-01', start_date: '2026-11-02' })];
    await expect(svc.resolveVarietiesByHouse(house)).rejects.toThrow('placement_date/start_date 不一致');
    await expect(svc.resolveVarietiesByHouse(house)).rejects.toThrow('placement_date/start_date 不一致');
  });

  it('uses start_date for provable non-overlap, not as an unconditional fallback to today', async () => {
    const { svc, state } = setup();
    state.flocks = [flockRow({ placement_date: null, start_date: '2026-11-02' })];
    await expect(svc.resolveVarietiesByHouse(house)).rejects.toThrow('没有可确认');
    state.flocks = [flockRow({ placement_date: null, start_date: null })];
    await expect(svc.resolveVarietiesByHouse(house)).rejects.toThrow('不确定');
  });

  it('rejects contradictory flock interval dates', async () => {
    const { svc, state } = setup();
    state.flocks = [flockRow({ placement_date: '2026-12-01', elimination_date: '2026-10-01' })];
    await expect(svc.resolveVarietiesByHouse(house)).rejects.toThrow('日期矛盾');
  });

  it('rejects empty house rather than falling back to global legacy SKU', async () => {
    const { svc, state, db } = setup();
    state.flocks = [];
    state.skus = [skuRow('LEGACY', null)];
    await expect(svc.resolveVarietiesByHouse(house)).rejects.toThrow('没有可确认');
    expect(db.query.mock.calls.some(([sql]) => sql.includes('FROM product_skus'))).toBe(false);
  });

  it('requires ACTIVE dictionary breed and ACTIVE mapping for every source breed', async () => {
    const { svc, state, db } = setup();
    state.dict = [];
    await expect(svc.resolveVarietiesByHouse(house)).rejects.toThrow('BRD_BREED 未启用');
    state.dict = [{ dict_code: 'HY_LINE_BROWN' }];
    state.mappings = [];
    await expect(svc.resolveVarietiesByHouse(house)).rejects.toThrow('未映射有效品种');
    expect(db.query.mock.calls.find(([sql]) => sql.includes('FROM sys_dict'))![0]).toContain("status = 'ACTIVE'");
    expect(db.query.mock.calls.find(([sql]) => sql.includes('FROM md_variety_breeds'))![0]).toContain("status = 'ACTIVE'");
  });

  it('rejects an unmapped second breed instead of retaining only the first variety', async () => {
    const { svc, state, db } = setup();
    state.flocks.push(flockRow({ breed_code: 'UNKNOWN' }));
    const original = db.query.getMockImplementation()!;
    db.query.mockImplementation(async (sql, params) => sql.includes('FROM md_variety_breeds') && params?.[0] === 'UNKNOWN' ? [] : original(sql, params));
    await expect(svc.resolveVarietiesByHouse(house)).rejects.toThrow('未映射有效品种');
  });

  it('rejects inactive/out-of-date mapped variety even when another mapping is valid', async () => {
    const { svc, state } = setup();
    state.mappings.push({ variety_code: 'DISABLED' });
    await expect(svc.resolveVarietiesByHouse(house)).rejects.toThrow('品种 DISABLED');
  });

  it('commercial profile is authoritative, independent of mixed/unknown biological breeds', async () => {
    const { svc, state, db } = setup();
    state.flocks.push(flockRow({ breed_code: null }));
    state.mappings.push({ variety_code: 'EGG_PINK' });
    await expect(svc.resolve({ ...house, varietyCode: 'EGG_PINK' })).rejects.toThrow('来源档案品种');
    await expect(svc.resolve(house)).resolves.toMatchObject({ varietyCode: 'EGG_RED' });
    expect(db.query.mock.calls.some(([sql]) => sql.includes('FROM brd_flocks'))).toBe(false);
    await expect(svc.resolveVarietiesByHouse(house)).rejects.toThrow('不确定');
  });

  it.each([
    { company_code: 'COMP-B' }, { farm_code: '' }, { site_code: null },
  ])('rejects house/company/farm/site mismatch %p', async bad => {
    const { svc, state } = setup();
    Object.assign(state.ownership[0], bad);
    await expect(svc.resolve({ ...house, farmCode: 'FARM-A', siteCode: 'SITE-A' })).rejects.toThrow('权威归属');
  });

  it('rejects a client farm or site that disagrees with the house', async () => {
    const { svc } = setup();
    await expect(svc.resolve({ ...house, farmCode: 'FARM-B' })).rejects.toThrow('权威归属');
    await expect(svc.resolve({ ...house, siteCode: 'SITE-B' })).rejects.toThrow('权威归属');
  });

  it('checks farm/site authority without house and rejects ambiguous SITE mappings', async () => {
    const { svc, state } = setup();
    state.ownership[0].company_code = 'COMP-B';
    await expect(svc.resolve({ ...base, farmCode: 'FARM-A' })).rejects.toThrow('权威归属');
    state.ownership[0].company_code = 'COMP-A';
    state.ownership.push({ ...state.ownership[0], farm_code: 'FARM-B' });
    await expect(svc.resolve({ ...base, siteCode: 'SITE-A' })).rejects.toThrow('权威归属');
  });

  it('rejects missing/disabled company, house and farm authority', async () => {
    const { svc, state } = setup();
    state.company = [];
    await expect(svc.resolve(base)).rejects.toThrow('公司 COMP-A');
    state.company = [{ org_code: 'COMP-A' }];
    state.ownership = [];
    await expect(svc.resolve(house)).rejects.toThrow('权威归属');
    await expect(svc.resolve({ ...base, farmCode: 'FARM-A' })).rejects.toThrow('未启用');
    await expect(svc.resolve({ ...base, companyCode: '' })).rejects.toThrow('companyCode');
  });

  it('direct house helper requires full provenance instead of a bare house lookup', async () => {
    const { svc } = setup();
    await expect(svc.resolveVarietiesByHouse(house)).resolves.toEqual(['EGG_RED']);
    await expect(svc.resolveVarietiesByHouse({ ...base, houseCode: undefined })).rejects.toThrow('houseCode');
  });

  it('STANDARD uses explicitly NULL product/SKU and exact COMPANY assignment', async () => {
    const { svc, state } = setup();
    state.profiles[0].product_mode = 'STANDARD';
    state.profiles[0].variety_code = null;
    state.skus = [skuRow('PLAIN', null)];
    state.product.variety_code = null;
    await expect(svc.resolve({ ...house, varietyCode: null })).resolves.toMatchObject({ skuCode: 'PLAIN', varietyCode: null });
    await expect(svc.assertUsable('PLAIN', house)).resolves.toMatchObject({ varietyCode: null });
    state.scopes = [scopeRow('ALL', '')];
    await expect(svc.resolve(house)).rejects.toThrow('不适用于公司');
  });

  it.each(['EGG_RED', 'EGG_PINK'])('STANDARD cannot use colored SKU %s', async variety => {
    const { svc, state } = setup();
    state.profiles[0].product_mode = 'STANDARD';
    state.profiles[0].variety_code = null;
    state.skus = [skuRow('COLORED', variety)];
    await expect(svc.resolve(house)).rejects.toThrow('产品品种不一致');
    await expect(svc.assertUsable('COLORED', house)).rejects.toThrow('产品品种不一致');
  });

  it('VARIANT cannot use plain SKU or client-declared STANDARD', async () => {
    const { svc, state } = setup();
    state.skus = [skuRow('PLAIN', null)];
    await expect(svc.assertUsable('PLAIN', { ...house, productMode: 'STANDARD' } as never)).rejects.toThrow('产品品种不一致');
    await expect(svc.resolve({ ...house, varietyCode: null })).rejects.toThrow('来源档案品种');
  });

  it.each([
    { profiles: [] }, { profile: { effective_date: '2026-11-02' } },
    { profile: { expire_date: '2026-10-31' } }, { profile: { status: 'INACTIVE' } },
  ])('rejects missing/expired/not-yet-effective source %p', async change => {
    const { svc, state, db } = setup();
    if (change.profiles) state.profiles = [];
    if (change.profile) Object.assign(state.profiles[0], change.profile);
    await expect(svc.resolve(house)).rejects.toThrow('缺少有效来源档案');
    expect(db.query.mock.calls.some(([sql]) => sql.includes('FROM product_skus'))).toBe(false);
  });

  it('rejects overlapping profiles even with a client-selected profile code', async () => {
    const { svc, state, db } = setup();
    state.profiles.push({ ...state.profiles[0], profile_code: 'SRC-B' });
    await expect(svc.resolve(base)).rejects.toThrow('重叠');
    await expect(svc.assertUsable('SKU-R', base)).rejects.toThrow('重叠');
    const [sql, args] = db.query.mock.calls.find(([sql]) => sql.includes('FROM md_egg_source_profiles'))!;
    expect(sql).not.toContain('profile_code =');
    expect(args).toEqual(['COMP-A', 'HOUSE-A', '2026-11-01']);
  });

  it.each(['company_code', 'farm_code', 'site_code', 'house_code'])('rejects profile %s spoofing', async field => {
    const { svc, state } = setup();
    Object.assign(state.profiles[0], { [field]: 'OTHER' });
    await expect(svc.resolve(base)).rejects.toThrow('来源档案与');
  });

  it('requires matching profileCode, true date and shared advisory/row locks', async () => {
    const { svc, db } = setup();
    await expect(svc.resolve({ ...base, sourceProfileCode: 'OTHER' })).rejects.toThrow('sourceProfileCode');
    await expect(svc.resolve({ ...base, eggDate: '0000-01-01' })).rejects.toThrow('eggDate');
    await expect(svc.resolveSourceProfile({ ...house, houseCode: 'HOUSE-A', eggDate: '2026-11-01' })).resolves.toMatchObject({
      profileCode: 'SRC-A', productMode: 'VARIANT', effectiveDate: '2026-01-01', farmCode: 'FARM-A', siteCode: 'SITE-A',
    });
    expect(db.query).toHaveBeenCalledWith(expect.stringContaining('pg_advisory_xact_lock_shared'), ['COMP-A:HOUSE-A']);
  });

  it('uses only caller manager and locks all authorization and master decision rows FOR SHARE', async () => {
    const fallback = { query: jest.fn(() => { throw new Error('must not use DataSource'); }) };
    const svc = new SkuAvailabilityService(fallback as never);
    const { db } = setup();
    await svc.resolve(house, db as never);
    await svc.assertUsable('SKU-R', { ...house, varietyCode: 'EGG_RED' }, db as never);
    expect(fallback.query).not.toHaveBeenCalled();
    await svc.resolveVarietiesByHouse(house, db as never);
    const tables = ['md_egg_source_profiles', 'sys_organizations', 'brd_houses', 'brd_flocks', 'sys_dict', 'md_variety_breeds', 'md_product_varieties',
      'product_skus', 'mst_products', 'product_grades', 'packaging_specs', 'md_sku_org_scope'];
    for (const table of tables) {
      const calls = db.query.mock.calls.filter(([sql]) => sql.includes(`FROM ${table}`));
      expect(calls.length).toBeGreaterThan(0);
      for (const [sql] of calls) expect(sql).toContain('FOR SHARE');
    }
  });
});
