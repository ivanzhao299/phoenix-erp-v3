'use client';
import { useState, useEffect, useMemo } from 'react';
import request from '@/lib/api-client';

/**
 * useProductGrades — 全局等级权威源 hook（2026-06-06 收口）
 * ════════════════════════════════════════════════════════════════════════
 * 数据源：/api/lookup/product-grades（product_grades 主数据表）
 *   · grade_code   — 标准等级码（AA/A/B/C/DIRTY/CRACKED/BROKEN/DAMAGED）
 *   · grade_name   — 中文名（特级蛋/一级蛋/.../损坏蛋）
 *   · is_saleable  — 是否可销售（脏/裂/破/损为 false）
 *   · is_storable  — 是否可入库
 *
 * 替代历史多源：
 *   ✗ 硬编码 EGG_GRADES 0-5（已废）
 *   ✗ sys_dict.PKG_EGG_GRADE XL/L/M/S/XS（DEPRECATED，BFF 现已切到 product_grades）
 *   ✗ 后端 validGrades 14 档混杂表（已改运行时拉 product_grades）
 *
 * 用法：
 *   const { grades } = useProductGrades();                    // 全部 ACTIVE 等级
 *   const { grades } = useProductGrades({ onlySaleable: true }); // 仅可售（生产入库默认）
 *   const { grades } = useProductGrades({ onlyStorable: true }); // 仅可库（含脏/裂蛋）
 */

export interface ProductGrade {
  grade_code: string;
  grade_name: string;
  grade_name_lo?: string | null;
  sort_order: number;
  is_saleable: boolean;
  is_storable: boolean;
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

/** 兜底：API 失败时与 product_grades realign 后 seed 同款（孟赛业务口径） */
const FALLBACK: ProductGrade[] = [
  { grade_code: 'XL',      grade_name: '特大蛋',   sort_order: 10, is_saleable: true,  is_storable: true,  status: 'ACTIVE' },
  { grade_code: 'L',       grade_name: '一号蛋',   sort_order: 20, is_saleable: true,  is_storable: true,  status: 'ACTIVE' },
  { grade_code: 'M',       grade_name: '二号蛋',   sort_order: 30, is_saleable: true,  is_storable: true,  status: 'ACTIVE' },
  { grade_code: 'S',       grade_name: '三号蛋',   sort_order: 40, is_saleable: true,  is_storable: true,  status: 'ACTIVE' },
  { grade_code: 'XS',      grade_name: '四号蛋',   sort_order: 50, is_saleable: true,  is_storable: true,  status: 'ACTIVE' },
  { grade_code: 'DIRTY',   grade_name: '脏蛋',     sort_order: 60, is_saleable: false, is_storable: true,  status: 'ACTIVE' },
  { grade_code: 'CRACKED', grade_name: '裂缝蛋',   sort_order: 70, is_saleable: false, is_storable: true,  status: 'ACTIVE' },
  { grade_code: 'BROKEN',  grade_name: '破蛋',     sort_order: 80, is_saleable: false, is_storable: false, status: 'ACTIVE' },
  { grade_code: 'DAMAGED', grade_name: '损坏蛋',   sort_order: 90, is_saleable: false, is_storable: false, status: 'ACTIVE' },
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
        if (opts.onlySaleable && !g.is_saleable) return false;
        if (opts.onlyStorable && !g.is_storable) return false;
        return true;
      })
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));
  }, [raw, opts.onlySaleable, opts.onlyStorable]);

  return { grades, loading };
}
