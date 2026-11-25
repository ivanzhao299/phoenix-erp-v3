import request from '@/lib/api-client';

export const eggSourceEndpoint = '/product-master/egg-sources';

type EggSourceResponse<T> = { code: number; data: T };

export async function requestEggSourceData<T>(
  path: string,
  isValid: (data: T) => boolean,
  invalidResponse: string,
  options?: Parameters<typeof request>[1],
): Promise<T> {
  const response = await request<EggSourceResponse<T>>(path, options);
  if (response?.code !== 200 || response.data == null || !isValid(response.data)) {
    throw new Error(invalidResponse);
  }
  return response.data;
}
