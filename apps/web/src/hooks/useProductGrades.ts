'use client';
import { useState, useEffect, useMemo } from 'react';
import request from '@/lib/api-client';

/**
 * useProductGrades — 全局等级权威源 hook（2026-06-06 收口）
 * ════════════════════════════════════════════════════════════════════════
 * 数据源：/api/lookup/product-grades（product_grades 主数据表，仅 ACTIVE）
 *   · grade_code   — 现行等级码：GRADE_0..5 + DIRTY/CRACKED/BROKEN/DAMAGED（10 档；
 *                    GRADE_0 为集团标准特大档，Issue #532 起九档全部纳入库存管理）
 *   · grade_name   — 中文名：0号蛋 / 1号蛋..5号蛋（可售）+ 脏蛋 / 裂缝蛋 / 破损蛋 / 损坏蛋（缺陷）
 *   · stock_managed / sale_enabled — Issue #532 策略列（库存管理 / 销售授权），优先于 legacy 列
 *   · is_saleable / is_storable — legacy 标志（迁移窗口期兜底）
 *
 * 过滤语义与 API 对齐（egg-inventory.service 的 COALESCE(stock_managed, is_storable)）：
 *   onlyStorable  → stock_managed ?? is_storable
 *   onlySaleable  → sale_enabled ?? is_saleable
 * 缺陷档（脏/裂/破/损）stock_managed=true 但 sale_enabled=false：
 * 入库表单必须显示（sale_enabled 只影响销售 FIFO），销售侧才按 onlySaleable 过滤。
 *
 * 替代历史多源（均已统一到 product_grades）：
 *   ✗ 硬编码 EGG_GRADES 0-5（已废）
 *   ✗ 旧尺寸方案 XL/L/M/S/XS（特大/一号..四号）— G67 已 DEPRECATED
 *   ✗ 旧等级方案 AA/A/B/C（特级/一级/二级/三级）— 已 DEPRECATED
 *   ✗ sys_dict.PKG_EGG_GRADE（整类 DEPRECATED，BFF /terminal/dicts 现读 product_grades）
 *   ✗ 后端 validGrades 14 档混杂表（已改运行时拉 product_grades）
 *
 * 用法：
 *   const { grades } = useProductGrades();                    // 全部 ACTIVE 等级
 *   const { grades } = useProductGrades({ onlySaleable: true }); // 仅可售（销售侧）
 *   const { grades } = useProductGrades({ onlyStorable: true }); // 仅可入库（含脏/裂/破/损，生产入库用）
 */

export interface ProductGrade {
  grade_code: string;
  grade_name: string;
  grade_name_lo?: string | null;
  sort_order: number;
  is_saleable: boolean;
  is_storable: boolean;
  stock_managed?: boolean | null;
  sale_enabled?: boolean | null;
  default_stock_status?: 'AVAILABLE' | 'RESERVED' | 'QUARANTINE' | 'DAMAGED' | 'FROZEN' | null;
  status: string;
  remark?: string | null;
}

interface UseProductGradesOpts {
  onlySaleable?: boolean;
  onlyStorable?: boolean;
}

/** 模块级缓存：5 分钟 TTL，多组件共享一次请求 */
const _cache: { data: ProductGrade[] | null; expireAt: number; promise: Promise<ProductGrade[]> | null } = {
  data: null,
  expireAt: 0,
  promise: null,
};
const TTL_MS = 5 * 60 * 1000;

/** 兜底：API 失败时与权威源 product_grades 同款（GRADE_0..5 + 4 缺陷，Issue #532 策略）。
 *  2026-06-10 修：原兜底误用旧 realign 方案(XL/L/M/S/XS)，已对齐 GRADE_1..5。
 *  2026-11-14 修：补 GRADE_0（此前 API 失败时 0 号档静默消失）；缺陷档 BROKEN/DAMAGED
 *  按 Issue #532 策略 stock_managed=true（破损蛋/损坏蛋必须能从日产蛋入库登记）。 */
const FALLBACK: ProductGrade[] = [
  { grade_code: 'GRADE_0', grade_name: '0号蛋', sort_order: 5, is_saleable: true, is_storable: true,
    stock_managed: true, sale_enabled: true, default_stock_status: 'AVAILABLE', status: 'ACTIVE' },
  { grade_code: 'GRADE_1', grade_name: '1号蛋', sort_order: 10, is_saleable: true, is_storable: true,
    stock_managed: true, sale_enabled: true, default_stock_status: 'AVAILABLE', status: 'ACTIVE' },
  { grade_code: 'GRADE_2', grade_name: '2号蛋', sort_order: 20, is_saleable: true, is_storable: true,
    stock_managed: true, sale_enabled: true, default_stock_status: 'AVAILABLE', status: 'ACTIVE' },
  { grade_code: 'GRADE_3', grade_name: '3号蛋', sort_order: 30, is_saleable: true, is_storable: true,
    stock_managed: true, sale_enabled: true, default_stock_status: 'AVAILABLE', status: 'ACTIVE' },
  { grade_code: 'GRADE_4', grade_name: '4号蛋', sort_order: 40, is_saleable: true, is_storable: true,
    stock_managed: true, sale_enabled: true, default_stock_status: 'AVAILABLE', status: 'ACTIVE' },
  { grade_code: 'GRADE_5', grade_name: '5号蛋', sort_order: 50, is_saleable: true, is_storable: true,
    stock_managed: true, sale_enabled: true, default_stock_status: 'AVAILABLE', status: 'ACTIVE' },
  { grade_code: 'DIRTY',   grade_name: '脏蛋',   sort_order: 60, is_saleable: false, is_storable: true,
    stock_managed: true, sale_enabled: false, default_stock_status: 'QUARANTINE', status: 'ACTIVE' },
  { grade_code: 'CRACKED', grade_name: '裂缝蛋', sort_order: 70, is_saleable: false, is_storable: true,
    stock_managed: true, sale_enabled: false, default_stock_status: 'QUARANTINE', status: 'ACTIVE' },
  { grade_code: 'BROKEN',  grade_name: '破损蛋', sort_order: 80, is_saleable: false, is_storable: true,
    stock_managed: true, sale_enabled: false, default_stock_status: 'DAMAGED', status: 'ACTIVE' },
  { grade_code: 'DAMAGED', grade_name: '损坏蛋', sort_order: 90, is_saleable: false, is_storable: true,
    stock_managed: true, sale_enabled: false, default_stock_status: 'DAMAGED', status: 'ACTIVE' },
];

export function useProductGrades(opts: UseProductGradesOpts = {}) {
  const [raw, setRaw] = useState<ProductGrade[]>(_cache.data ?? []);
  const [loading, setLoading] = useState(_cache.data === null);

  useEffect(() => {
    const now = Date.now();
    if (_cache.data && _cache.expireAt > now) {
      setRaw(_cache.data);
      setLoading(false);
      return;
    }
    if (!_cache.promise) {
      _cache.promise = request<ProductGrade[]>('/lookup/product-grades')
        .then(rows => {
          const list = Array.isArray(rows) ? rows : (rows as unknown as { data?: ProductGrade[] })?.data || [];
          const final = list.length > 0 ? list : FALLBACK;
          _cache.data = final;
          _cache.expireAt = Date.now() + TTL_MS;
          return final;
        })
        .catch(() => {
          _cache.data = FALLBACK;
          _cache.expireAt = Date.now() + TTL_MS;
          return FALLBACK;
        })
        .finally(() => { _cache.promise = null; });
    }
    _cache.promise.then(list => { setRaw(list); setLoading(false); });
  }, []);

  const grades = useMemo(() => {
    return raw
      .filter(g => {
        // 与 API 的 COALESCE 新列优先语义一致（Issue #532）；迁移窗口期旧列兜底。
        if (opts.onlySaleable && !((g.sale_enabled ?? g.is_saleable) !== false)) return false;
        if (opts.onlyStorable && !((g.stock_managed ?? g.is_storable) !== false)) return false;
        return true;
      })
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [raw, opts.onlySaleable, opts.onlyStorable]);

  return { grades, loading };
}
