'use client';
import { useEffect, useMemo, useState } from 'react';
import request from '@/lib/api-client';
import { usePermission } from '@/hooks/usePermission';
import { useSkuPermission } from '@/hooks/useSkuPermission';
import { useLanguage } from '@/contexts/LanguageContext';
import { MasterDataFormPage } from './MasterDataFormPage';
import { skuFields } from './sku-fields';
import { skuManagementRoute, skuStatusLabels } from './ProductSkuAssociation';

type Parent = { product_code: string; product_name: string; product_name_zh?: string; status: string };
export function SkuCreatePage({ productCode }: { productCode?: string }) {
  const { canCreate } = useSkuPermission();
  const { canView: canViewProduct } = usePermission("MENU_MD_PRODUCT");
  const { t, translateLiteral: tr } = useLanguage();
  const [loaded, setLoaded] = useState<{ code: string; product?: Parent; error?: string } | null>(null);
  useEffect(() => {
    if (!productCode || !canCreate) return;
    let live = true;
    const parentRequest = canViewProduct
      ? request<Parent>(`/master-data/runtime/product/${encodeURIComponent(productCode)}`)
      : request<Parent[] | { data: Parent[] }>("/lookup/products").then(result => (Array.isArray(result) ? result : result.data).find(row => row.product_code === productCode));
    parentRequest.then(product => {
        if (live) setLoaded(product?.product_code === productCode && product.product_name
          ? { code: productCode, product: { ...product, product_name: product.product_name_zh || product.product_name } } : { code: productCode, error: '父产品不存在、未启用或信息不完整，无法新建 SKU。' });
      })
      .catch(() => { if (live) setLoaded({ code: productCode, error: '父产品核验失败（不存在、无查看权限或服务异常），无法新建 SKU。请返回产品中心核查后重试。' }); });
    return () => { live = false; };
  }, [productCode, canCreate, canViewProduct]);
  const fields = useMemo(() => skuFields(t).map(field => productCode && field.key === 'product_code' ? { ...field, type: 'readonly' as const } : field), [t, productCode]);
  const parent = loaded?.code === productCode ? loaded?.product : undefined;
  const initialRow = useMemo(() => parent ? { product_code: parent.product_code, product_name: parent.product_name } : undefined, [parent]);
  if (!canCreate) return <p role="alert">{tr('无 SKU 新增权限。')}</p>;
  if (productCode === '') return <p role="alert">{tr('父产品编码为空，无法从此上下文新建 SKU。')}</p>;
  if (productCode && loaded?.code !== productCode) return <p>{tr('正在核验父产品…')}</p>;
  if (productCode && (!parent || parent.status !== 'ACTIVE')) return <div role="alert">
    <p>{tr(loaded?.error ?? '父产品当前未启用，无法新建 SKU。')} {parent && tr(skuStatusLabels[parent.status] ?? parent.status)}</p>
    <a href="/master-data/products">{tr('返回产品中心')}</a>
  </div>;
  return <MasterDataFormPage key={productCode} type="sku" title="SKU/销售规格" codeKey="sku_code" nameKey="sku_name"
    fields={fields} listRoute={skuManagementRoute(productCode)} mode="create" initialRow={initialRow} />;
}
