import {
  assertStatusTransition,
  INV_BATCH_STATUSES,
  INV_BATCH_STATUS_TRANSITIONS,
} from './inventory-status-machine';

/**
 * INV-301c 状态机契约：
 * 1) 白名单全文钉死（防无声扩张——新增迁移必须显式改本 spec）；
 * 2) 全迁移矩阵覆盖：合法对放行、其余全部抛 BadRequestException；
 * 3) 非法状态值（含读侧遗留 LOCKED/EXPIRY_WARN）拒绝写入。
 */
describe('inventory status machine (INV-301c)', () => {
  it('pins the full whitelist — only transitions that actually exist in code', () => {
    expect(INV_BATCH_STATUSES).toEqual([
      'AVAILABLE', 'RESERVED', 'QUARANTINE', 'DAMAGED', 'FROZEN', 'EXPIRED',
    ]);
    expect(INV_BATCH_STATUS_TRANSITIONS).toEqual({
      AVAILABLE: ['AVAILABLE', 'EXPIRED'], // egg markExpired（INV-101）+ farm 用药撤销/入库自环
      RESERVED: [],
      QUARANTINE: [],
      DAMAGED: [],
      FROZEN: [],
      EXPIRED: [],
    });
  });

  it('keeps every whitelist entry inside the known state set (consistency)', () => {
    for (const from of INV_BATCH_STATUSES) {
      for (const to of INV_BATCH_STATUS_TRANSITIONS[from]) {
        expect((INV_BATCH_STATUSES as readonly string[]).includes(to)).toBe(true);
      }
    }
  });

  it.each([
    ['AVAILABLE', 'EXPIRED', 'egg-inventory markExpiredBatches 守卫 UPDATE（INV-101 过期任务）'],
    ['AVAILABLE', 'AVAILABLE', 'farm medication-record cancel 还入重申 / farm-medicine 入库 upsert 冲突腿'],
  ])('allows the whitelisted transition %s → %s (%s)', (from, to) => {
    expect(() => assertStatusTransition(from, to, 'test')).not.toThrow();
    expect(() => assertStatusTransition(from, to)).not.toThrow();
  });

  it('rejects every non-whitelisted pair across the full matrix', () => {
    const legal = new Set(INV_BATCH_STATUS_TRANSITIONS.AVAILABLE);
    let rejected = 0;
    for (const from of INV_BATCH_STATUSES) {
      for (const to of INV_BATCH_STATUSES) {
        const whitelisted = from === 'AVAILABLE' && legal.has(to);
        try {
          assertStatusTransition(from, to);
          expect(whitelisted).toBe(true);
        } catch (error) {
          rejected++;
          expect(whitelisted).toBe(false);
          expect((error as Record<string, unknown>).status).toBe(400);
          expect((error as Error).message).toContain(`${from}→${to}`);
        }
      }
    }
    // 36 pairs total, 2 whitelisted → 34 rejected
    expect(rejected).toBe(INV_BATCH_STATUSES.length ** 2 - 2);
  });

  it('rejects unknown states and the read-side legacy values with a provenance hint', () => {
    for (const bad of ['', 'LOCKED', 'EXPIRY_WARN', 'available', 'EXPIRE', null, undefined]) {
      expect(() => assertStatusTransition(bad as string, 'AVAILABLE')).toThrow(/不是合法状态/);
      expect(() => assertStatusTransition('AVAILABLE', bad as string)).toThrow(/不是合法状态/);
    }
    expect(() => assertStatusTransition('LOCKED', 'AVAILABLE')).toThrow(/LOCKED\/EXPIRY_WARN 无写入路径/);
  });

  it('names the caller context and the registration path in the error', () => {
    expect(() => assertStatusTransition('QUARANTINE', 'AVAILABLE', 'wms 复检放行（尚未存在的路径）'))
      .toThrow(/QUARANTINE→AVAILABLE（wms 复检放行（尚未存在的路径））.*inventory-status-machine/s);
    expect(() => assertStatusTransition('EXPIRED', 'AVAILABLE')).toThrow(/EXPIRED 仅允许 →（无出边）|不在白名单/);
  });

  it('documents RESERVED/FROZEN as dict states without any code write path', () => {
    // 预占建模 = qty_available 减量 + allocations 台账；冻结是批次 4 INV-402 能力缺口。
    // 两者在白名单中必须保持无出边，直到真实写入路径落地并登记来源。
    expect(INV_BATCH_STATUS_TRANSITIONS.RESERVED).toHaveLength(0);
    expect(INV_BATCH_STATUS_TRANSITIONS.FROZEN).toHaveLength(0);
  });
});
