'use client';
import { useEffect, useState } from 'react';
import request from '@/lib/api-client';
import { useSkuPermission } from '@/hooks/useSkuPermission';
import { useLanguage } from '@/contexts/LanguageContext';

export interface SkuManagementResult {
  items: Record<string, unknown>[];
  total: number;
  relatedTotal: number;
  statusCounts: Record<string, number>;
  page: number;
  pageSize: number;
}
export function skuManagementRoute(productCode?: string) {
  return `/master-data/product-skus${productCode ? `?product_code=${encodeURIComponent(productCode)}` : ''}`;
}
export const skuStatusLabels: Record<string, string> = {
  DRAFT: '草稿', PENDING_APPROVAL: '待审批', ACTIVE: '已生效', FROZEN: '已冻结', ARCHIVED: '已归档', REJECTED: '已驳回',
};

export function ProductSkuAssociation({ product }: { product: Record<string, unknown> | null }) {
  const { canView, canCreate } = useSkuPermission();
  const { translateLiteral } = useLanguage();
  const [loaded, setLoaded] = useState<{ code: string; result?: SkuManagementResult; error?: string } | null>(null);
  const code = String(product?.product_code ?? '');
  useEffect(() => {
    if (!canView || !code) return;
    let live = true;
    request<SkuManagementResult>(`/master-data/runtime/sku/management?product_code=${encodeURIComponent(code)}&pageSize=10`)
      .then(result => { if (live) setLoaded({ code, result }); })
      .catch(() => { if (live) setLoaded({ code, error: '关联 SKU 加载失败，请重新打开详情重试' }); });
    return () => { live = false; };
  }, [code, canView]);
  const current = loaded?.code === code ? loaded : null;
  const tr = translateLiteral;
  if (!code) return <p>{tr("产品信息不可用，暂时无法查看关联 SKU。")}</p>;
  return <div>
    <p>{tr('产品是主档；SKU/销售规格定义该产品的等级与规格。采购物料在采购物料中心管理。')}</p>
    <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
      {canView && code && <a href={skuManagementRoute(code)}>{tr('管理此产品全部 SKU/销售规格')}</a>}
      {canCreate && code && product?.status === 'ACTIVE' && <a href={`/master-data/product-skus/new?product_code=${encodeURIComponent(code)}`}>{tr('为此产品新增 SKU/销售规格')}</a>}
    </div>
    {canCreate && code && product?.status !== 'ACTIVE' && <p>{tr('产品当前未启用，不能从此产品新建 SKU。')} {tr(skuStatusLabels[String(product?.status)] ?? String(product?.status ?? ''))}</p>}
    {!canView ? <p>{tr('无 SKU 查看权限，关联明细不可见。')}</p> : !current ? <p>{tr('正在加载关联 SKU…')}</p>
      : current.error ? <p role="alert">{tr(current.error)}</p> : current.result && <>
        <p>{tr('全部状态共')} <strong>{current.result.relatedTotal}</strong> {tr('个 SKU/销售规格')}</p>
        <p>{Object.entries(current.result.statusCounts).map(([status, count]) => `${tr(skuStatusLabels[status] ?? status)} ${count}`).join(' · ')}</p>
        <ul>{current.result.items.map(row => <li key={String(row.sku_code)}>
          <a href={`${skuManagementRoute(code)}&sku_code=${encodeURIComponent(String(row.sku_code))}`}>{String(row.sku_code)} · {String(row.sku_name ?? '')}</a>
          {' · '}{tr(skuStatusLabels[String(row.status)] ?? String(row.status))}
        </li>)}</ul>
        {current.result.relatedTotal > current.result.items.length && <p>{tr('此处展示前 10 条，进入管理查看全部记录、编辑及状态操作。')}</p>}
      </>}
  </div>;
}
