export interface SalesPriceAnomaly {
  sales_order_no?: string | null;
  customer_code?: string | null;
  customer_name?: string | null;
  company_code?: string | null;
  product_code?: string | null;
  product_name?: string | null;
  sku_code?: string | null;
  actual_unit_price?: number | string | null;
  resolved_unit_price?: number | string | null;
  floor_price?: number | string | null;
  below_floor_price?: boolean | null;
  diff_rate?: number | string | null;
  created_at?: string | null;
}

export function buildSalesPriceAnomaliesPath(threshold: number, limit = 100): string {
  const params = new URLSearchParams({
    threshold: String(threshold),
    limit: String(limit),
  });
  return `/api/v2/sales/analytics/price-anomalies?${params.toString()}`;
}

export function getSalesPriceAnomalyError(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message.trim()) return error.message;
  return fallback;
}
