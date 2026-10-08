// Conservative legacy-window ingress policy. This is never an old-image rollback waiver.
export const SAFE_READ_PATHS = ['/api/chanjet/integration/alignment/status', '/api/chanjet/integration/sync-jobs', '/api/chanjet/ar-snapshot'];
export function denyDuringHold(method, pathname) {
  return method !== 'GET' || !SAFE_READ_PATHS.includes(pathname);
}
export function controllerRoutes(source) {
  return [...source.matchAll(/@(Get|Post|Put|Patch|Delete|All)\(['"]([^'"]*)['"]\)/g)]
    .map(([, method, suffix]) => ({ method: method.toUpperCase(), path: `/api/chanjet/${suffix}` }));
}
export function assertFenceCoverage(source) {
  const routes = controllerRoutes(source);
  if (!routes.length) throw new Error('FENCE_HOLD=ROUTE_INVENTORY_EMPTY');
  for (const route of routes) {
    if (route.method !== 'GET' && !denyDuringHold(route.method, route.path)) throw new Error('FENCE_HOLD=UNPROTECTED_ROUTE');
  }
  return routes;
}
export function nginxFenceMap() {
  return `map "$request_method:$uri" $phoenix_chanjet_hold_exempt {\n    default 0;\n${SAFE_READ_PATHS.map(p => `    "GET:${p}" 1;`).join('\n')}\n}\n`;
}
