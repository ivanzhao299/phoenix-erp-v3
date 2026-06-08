/**
 * G25-A · 字典异步加载模块缓存 (D1 欠债治理)
 * ════════════════════════════════════════════════════════════════════════
 * 用途：async 上下文（如 Selector loader）取字典 zh label
 *   - useDictOptions hook 仅适用于 React 组件 (function body)
 *   - 但 ScopedSelect loader 是 async function，不能用 hook
 *   - 此 helper 提供模块级 Promise 缓存，多次调用共享一次 fetch
 *
 * 用法：
 *   const houseTypeMap = await fetchDictMap('BRD_HOUSE_TYPE');
 *   const zh = houseTypeMap[code] ?? code;  // fallback 不存在的 code 显示原值
 */

const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';

interface DictRow {
  dict_code: string;
  dict_type: string;
  dict_label_zh?: string;
  dict_label_lo?: string;
  dict_value?: string;
  status: string;
}

type DictMap = Record<string, string>;

const _cache: Record<string, { map: DictMap; expireAt: number; promise: Promise<DictMap> | null }> = {};
const TTL_MS = 5 * 60 * 1000;

function tok(): string {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || localStorage.getItem('phoenix_token') || '';
}

async function fetchAndCache(dictType: string): Promise<DictMap> {
  try {
    const res = await fetch(`${API_BASE}/api/crud/sys_dict?limit=2000`, {
      headers: { Authorization: `Bearer ${tok()}` },
    });
    if (!res.ok) return {};
    const body = await res.json();
    const rows: DictRow[] = body.data ?? body.records ?? [];
    const map: DictMap = {};
    for (const r of rows) {
      if (r.dict_type === dictType && r.status === 'ACTIVE' && r.dict_label_zh) {
        map[r.dict_code] = r.dict_label_zh;
      }
    }
    return map;
  } catch {
    return {};
  }
}

/**
 * 拉指定 dict_type 的 {code → zh} 映射；
 * 模块级 5min 缓存 + Promise 共享（并发调用只发一次 HTTP）。
 */
export async function fetchDictMap(dictType: string): Promise<DictMap> {
  const now = Date.now();
  const entry = _cache[dictType];
  if (entry && entry.expireAt > now && entry.map) return entry.map;
  if (entry?.promise) return entry.promise;

  const promise = fetchAndCache(dictType);
  _cache[dictType] = { map: {}, expireAt: now + TTL_MS, promise };
  const map = await promise;
  _cache[dictType] = { map, expireAt: Date.now() + TTL_MS, promise: null };
  return map;
}

/** 清空缓存（如登出/角色切换时） */
export function clearDictCache(): void {
  for (const k of Object.keys(_cache)) delete _cache[k];
}
