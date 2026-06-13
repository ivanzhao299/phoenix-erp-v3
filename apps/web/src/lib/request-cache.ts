/**
 * G89-P1 通用前端取数缓存 —— 与取数实现无关（loader 走 request() 或裸 fetch 均可）。
 *
 * 三件事：
 *  ① 并发去重：同 key 在 in-flight 时复用同一个 Promise（解决"同页 N 个下拉拉同一资源 N 次"）
 *  ② TTL 缓存：命中且未过期直接返回（解决"切回页面重复拉低频主数据"）
 *  ③ 失败不缓存：loader 抛错时清掉 in-flight，不污染缓存
 *
 * ⚠️ 只用于「低频主数据」（字典/lookup/品牌/权限），**不要用于会被用户改动后需立即可见的列表数据**。
 *    主数据写操作后可调 invalidateCache(prefix) 主动失效。
 */

interface Entry<T> { value: T; expireAt: number }

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

export async function cachedGet<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const now = Date.now();
  const hit = store.get(key) as Entry<T> | undefined;
  if (hit && hit.expireAt > now) return hit.value;

  const flying = inflight.get(key) as Promise<T> | undefined;
  if (flying) return flying;

  const p = loader()
    .then((value) => {
      store.set(key, { value, expireAt: Date.now() + ttlMs });
      inflight.delete(key);
      return value;
    })
    .catch((err) => {
      inflight.delete(key);   // 失败不缓存
      throw err;
    });
  inflight.set(key, p);
  return p;
}

/** 主数据写后主动失效（前缀匹配；不传则清空全部缓存） */
export function invalidateCache(prefix?: string): void {
  if (!prefix) { store.clear(); return; }
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
}

/** 常用 TTL（毫秒） */
export const TTL = {
  dict: 5 * 60_000,      // 字典 5min（与后端 lookup 缓存同量级）
  lookup: 5 * 60_000,    // 主数据下拉 5min
  brand: 10 * 60_000,    // 品牌/系统配置 10min
} as const;
