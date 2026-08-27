import request from '@/lib/api-client';

export async function storePosRequest<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const normalized = path.replace(/^\/api/, '');
  const response: any = await request<any>(normalized, { method, body: body == null ? undefined : JSON.stringify(body) });
  return (response?.data ?? response) as T;
}

export interface StorePosContextOption {
  storeId: string;
  storeCode: string;
  storeName: string;
  companyCode: string;
  role: string;
  roles: string[];
  hasSalesWarehouse: boolean;
  hasWarehouseScopeIntersection: boolean;
}

export const loadStorePosContexts = () => storePosRequest<StorePosContextOption[]>('GET', '/api/v2/store-sales/contexts');
