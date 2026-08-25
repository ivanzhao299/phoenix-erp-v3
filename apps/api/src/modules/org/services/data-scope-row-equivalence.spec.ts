type Fixture = {
  code: string;
  farmCode?: string;
  siteCode?: string;
  companyCode?: string;
  warehouseCode?: string;
};

type Scope = {
  isGlobal: boolean;
  farmCodes: string[];
  siteCodes: string[];
  companyCodes: string[];
  warehouseCodes: string[];
};

const houses: Fixture[] = [
  { code: 'HOUSE-A', farmCode: 'FARM-A', siteCode: 'SITE-A', companyCode: 'COMP-A' },
  { code: 'HOUSE-B', farmCode: 'FARM-B', siteCode: 'SITE-B', companyCode: 'COMP-B' },
];
const flocks: Fixture[] = [
  { code: 'FLOCK-A', farmCode: 'FARM-A', siteCode: 'SITE-A', companyCode: 'COMP-A' },
  { code: 'FLOCK-B', farmCode: 'FARM-B', siteCode: 'SITE-B', companyCode: 'COMP-B' },
];
const warehouses: Fixture[] = [
  { code: 'WH-A', warehouseCode: 'WH-A', companyCode: 'COMP-A' },
  { code: 'WH-B', warehouseCode: 'WH-B', companyCode: 'COMP-B' },
];

function visibleBreeding(rows: Fixture[], scope: Scope): string[] {
  if (scope.isGlobal) return rows.map((row) => row.code);
  return rows.filter((row) =>
    scope.farmCodes.includes(row.farmCode ?? '')
      || scope.siteCodes.includes(row.siteCode ?? '')
      || scope.companyCodes.includes(row.companyCode ?? ''),
  ).map((row) => row.code);
}

function visibleWarehouses(rows: Fixture[], scope: Scope): string[] {
  if (scope.isGlobal) return rows.map((row) => row.code);
  return rows.filter((row) => scope.warehouseCodes.includes(row.warehouseCode ?? '')).map((row) => row.code);
}

describe('DataScope row-set equivalence: five authorization quadrants', () => {
  const quadrants: Array<{
    name: string;
    scope: Scope;
    expected: { houses: string[]; flocks: string[]; warehouses: string[] };
  }> = [
    {
      name: 'admin',
      scope: { isGlobal: true, farmCodes: [], siteCodes: [], companyCodes: [], warehouseCodes: [] },
      expected: { houses: ['HOUSE-A', 'HOUSE-B'], flocks: ['FLOCK-A', 'FLOCK-B'], warehouses: ['WH-A', 'WH-B'] },
    },
    {
      name: 'site',
      scope: { isGlobal: false, farmCodes: ['FARM-A'], siteCodes: ['SITE-A'], companyCodes: ['COMP-A'], warehouseCodes: ['WH-A'] },
      expected: { houses: ['HOUSE-A'], flocks: ['FLOCK-A'], warehouses: ['WH-A'] },
    },
    {
      name: 'company',
      scope: { isGlobal: false, farmCodes: [], siteCodes: [], companyCodes: ['COMP-A'], warehouseCodes: ['WH-A'] },
      expected: { houses: ['HOUSE-A'], flocks: ['FLOCK-A'], warehouses: ['WH-A'] },
    },
    {
      name: 'warehouse-only',
      scope: { isGlobal: false, farmCodes: [], siteCodes: [], companyCodes: [], warehouseCodes: ['WH-A'] },
      expected: { houses: [], flocks: [], warehouses: ['WH-A'] },
    },
    {
      name: 'unbound',
      scope: { isGlobal: false, farmCodes: [], siteCodes: [], companyCodes: [], warehouseCodes: [] },
      expected: { houses: [], flocks: [], warehouses: [] },
    },
  ];

  it.each(quadrants)('$name returns the exact house set', ({ scope, expected }) => {
    expect(visibleBreeding(houses, scope)).toEqual(expected.houses);
  });

  it.each(quadrants)('$name returns the exact flock set', ({ scope, expected }) => {
    expect(visibleBreeding(flocks, scope)).toEqual(expected.flocks);
  });

  it.each(quadrants)('$name returns the exact warehouse set', ({ scope, expected }) => {
    expect(visibleWarehouses(warehouses, scope)).toEqual(expected.warehouses);
  });
});
