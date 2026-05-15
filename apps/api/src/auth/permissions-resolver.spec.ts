import { resolvePermissions, PermSource, __testing__ } from './permissions-resolver';

const { parseCodes, formatCodes } = __testing__;

const src = (over: Partial<PermSource>): PermSource => ({
  menu_code: 'MENU_X',
  perm_codes: null,
  deny_codes: null,
  scope_type: null,
  scope_value: null,
  approval_level: 0,
  source: 'role',
  ...over,
});

describe('permissions-resolver', () => {
  // ─── parseCodes ──────────────────────────────────────────────
  describe('parseCodes', () => {
    it('returns empty Set for null/empty', () => {
      expect(parseCodes(null).size).toBe(0);
      expect(parseCodes(undefined).size).toBe(0);
      expect(parseCodes('').size).toBe(0);
      expect(parseCodes('   ').size).toBe(0);
    });

    it('expands "*" to all 6 codes V/C/E/D/A/X', () => {
      const s = parseCodes('*');
      expect([...s].sort()).toEqual(['A', 'C', 'D', 'E', 'V', 'X']);
    });

    it('parses comma-separated codes with whitespace', () => {
      const s = parseCodes(' V , C , E ');
      expect([...s].sort()).toEqual(['C', 'E', 'V']);
    });

    it('uppercases lowercase input', () => {
      const s = parseCodes('v,c');
      expect([...s].sort()).toEqual(['C', 'V']);
    });

    it('ignores invalid codes silently', () => {
      const s = parseCodes('V,FOO,C,BAR');
      expect([...s].sort()).toEqual(['C', 'V']);
    });
  });

  // ─── formatCodes ─────────────────────────────────────────────
  describe('formatCodes', () => {
    it('returns codes in fixed order V/C/E/D/A/X', () => {
      expect(formatCodes(new Set(['X', 'V', 'A'] as any))).toBe('V,A,X');
      expect(formatCodes(new Set(['E', 'C', 'D', 'A', 'V', 'X'] as any))).toBe('V,C,E,D,A,X');
    });

    it('returns empty string for empty set', () => {
      expect(formatCodes(new Set())).toBe('');
    });
  });

  // ─── resolvePermissions: 基础用例 ────────────────────────────
  describe('resolvePermissions — basic', () => {
    it('returns empty array for no sources', () => {
      expect(resolvePermissions([])).toEqual([]);
    });

    it('single source single menu — passthrough', () => {
      const out = resolvePermissions([src({ menu_code: 'MENU_FIN', perm_codes: 'V,C' })]);
      expect(out).toEqual(['MENU_FIN:V,C']);
    });

    it('skips menus that end with empty grants', () => {
      const out = resolvePermissions([src({ menu_code: 'MENU_FIN', perm_codes: '' })]);
      expect(out).toEqual([]);
    });
  });

  // ─── resolvePermissions: 多源 union ──────────────────────────
  describe('resolvePermissions — multi-source union', () => {
    it('two sources same menu union grants', () => {
      const out = resolvePermissions([
        src({ menu_code: 'MENU_FIN', perm_codes: 'V,C' }),
        src({ menu_code: 'MENU_FIN', perm_codes: 'E,A' }),
      ]);
      expect(out).toEqual(['MENU_FIN:V,C,E,A']);
    });

    it('multiple menus listed separately', () => {
      const out = resolvePermissions([
        src({ menu_code: 'MENU_FIN', perm_codes: 'V' }),
        src({ menu_code: 'MENU_WMS', perm_codes: 'V,C' }),
      ]).sort();
      expect(out).toEqual(['MENU_FIN:V', 'MENU_WMS:V,C']);
    });

    it('wildcard * union', () => {
      const out = resolvePermissions([
        src({ menu_code: 'MENU_X', perm_codes: 'V,C' }),
        src({ menu_code: 'MENU_X', perm_codes: '*' }),
      ]);
      expect(out).toEqual(['MENU_X:V,C,E,D,A,X']);
    });
  });

  // ─── resolvePermissions: DENY 优先 ───────────────────────────
  describe('resolvePermissions — DENY overrides GRANT', () => {
    it('deny E removes E even if multiple sources grant it', () => {
      const out = resolvePermissions([
        src({ menu_code: 'MENU_FIN', perm_codes: 'V,C,E', approval_level: 100, source: 'role' }),
        src({ menu_code: 'MENU_FIN', perm_codes: 'V,E,D', approval_level: 50, source: 'role' }),
        src({ menu_code: 'MENU_FIN', deny_codes: 'E', approval_level: 10, source: 'role' }),
      ]);
      // V,C,D 保留；E 被拒
      expect(out).toEqual(['MENU_FIN:V,C,D']);
    });

    it('deny * wipes all grants on that menu', () => {
      const out = resolvePermissions([
        src({ menu_code: 'MENU_FIN', perm_codes: '*', approval_level: 100 }),
        src({ menu_code: 'MENU_FIN', deny_codes: '*', approval_level: 0 }),
      ]);
      expect(out).toEqual([]); // 完全被拒 → 不进 permissions 数组
    });

    it('deny on one menu does not affect another', () => {
      const out = resolvePermissions([
        src({ menu_code: 'MENU_FIN', perm_codes: 'V,E' }),
        src({ menu_code: 'MENU_FIN', deny_codes: 'E' }),
        src({ menu_code: 'MENU_WMS', perm_codes: 'V,E' }),
      ]).sort();
      expect(out).toEqual(['MENU_FIN:V', 'MENU_WMS:V,E']);
    });

    it('deny without grant is no-op', () => {
      const out = resolvePermissions([
        src({ menu_code: 'MENU_FIN', deny_codes: 'V,C' }),
      ]);
      expect(out).toEqual([]);
    });
  });

  // ─── resolvePermissions: 优先级排序 ──────────────────────────
  describe('resolvePermissions — priority ordering', () => {
    it('higher approval_level processed first (but final result still respects DENY)', () => {
      // 高优先级角色 grants E；低优先级角色 denies E
      // 不管顺序如何，DENY 都生效
      const out = resolvePermissions([
        src({ menu_code: 'M', perm_codes: 'V,E', approval_level: 100 }),
        src({ menu_code: 'M', deny_codes: 'E',   approval_level: 10 }),
      ]);
      expect(out).toEqual(['M:V']);
    });

    it('approval_level decides order of processing, not outcome semantics', () => {
      // 三个 grant 来源不同优先级；最终都是 union；本测验证不会因排序丢失任何 grant
      const out = resolvePermissions([
        src({ menu_code: 'M', perm_codes: 'V', approval_level: 50 }),
        src({ menu_code: 'M', perm_codes: 'C', approval_level: 200 }),
        src({ menu_code: 'M', perm_codes: 'E', approval_level: 1 }),
      ]);
      expect(out).toEqual(['M:V,C,E']);
    });
  });

  // ─── resolvePermissions: 复合源（角色 + 权限集 + 用户直绑）──
  describe('resolvePermissions — 4-layer model integration', () => {
    it('merges role + role_set + user_set sources', () => {
      const out = resolvePermissions([
        // 角色直绑：V,C
        src({ menu_code: 'M', perm_codes: 'V,C', source: 'role',     approval_level: 100 }),
        // 角色带的权限集：E
        src({ menu_code: 'M', perm_codes: 'E',   source: 'role_set', approval_level: 100 }),
        // 用户直绑权限集：A
        src({ menu_code: 'M', perm_codes: 'A',   source: 'user_set', approval_level: 0   }),
      ]);
      expect(out).toEqual(['M:V,C,E,A']);
    });

    it('user_set DENY 也能覆盖 role grant', () => {
      const out = resolvePermissions([
        src({ menu_code: 'M', perm_codes: 'V,C,E,D', source: 'role',     approval_level: 200 }),
        src({ menu_code: 'M', deny_codes: 'D',       source: 'user_set', approval_level: 0   }),
      ]);
      expect(out).toEqual(['M:V,C,E']);
    });
  });

  // ─── RACI 场景模拟（业务场景）────────────────────────────────
  describe('resolvePermissions — RACI red-line scenarios', () => {
    it('某用户同时持 MENU_ORDER_MGR + MENU_FIN_AUDIT（红线 BLOCK）会在 perms 里都出现', () => {
      // resolver 本身不阻断红线，只算最终权限；红线检测在另一个表/服务
      const out = resolvePermissions([
        src({ menu_code: 'MENU_ORDER_MGR', perm_codes: '*' }),
        src({ menu_code: 'MENU_FIN_AUDIT', perm_codes: '*' }),
      ]).sort();
      expect(out).toContain('MENU_ORDER_MGR:V,C,E,D,A,X');
      expect(out).toContain('MENU_FIN_AUDIT:V,C,E,D,A,X');
    });
  });
});
