'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PageHeader from '@/components/PageHeader';
import { ProductSelector } from '@/components/shared-selectors/MasterDataSelectors';
import { MasterDataRuntimePanel } from './MasterDataRuntimePanel';
import { MasterDataDetailDrawer } from './MasterDataDetailDrawer';
import { skuConfig } from './detail-configs';
import { skuFields } from './sku-fields';
import { skuManagementRoute } from './ProductSkuAssociation';
import { useLanguage } from '@/contexts/LanguageContext';
import { useSkuPermission } from '@/hooks/useSkuPermission';

export function SkuManagementPage({ productCode, initialSkuCode = '' }: { productCode?: string; initialSkuCode?: string }) {
  const { t, translateLiteral: tr } = useLanguage();
  const { canView } = useSkuPermission();
  const router = useRouter();
  const [detailCode, setDetailCode] = useState<string | null>(initialSkuCode || null);
  return <div className="animate-fade-in" style={{ padding: '24px 32px' }}>
    <PageHeader title={tr('SKU/销售规格中心')} subtitle={tr('按产品维护等级与规格，支持全部历史状态；采购物料在采购物料中心管理。')} breadcrumb={[tr('主数据中心'), tr('SKU/销售规格中心')]} />
    {canView && <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
      <label>{tr('产品过滤')}
        <ProductSelector value={productCode ?? ''} onChange={code => router.replace(skuManagementRoute(code))} />
      </label>
      {productCode && <><span>{tr('当前产品')}：{productCode}</span><button onClick={() => router.replace(skuManagementRoute())}>{tr('清除产品过滤，查看全部 SKU')}</button></>}
    </div>}
    <MasterDataRuntimePanel type="sku" title="SKU/销售规格" codeKey="sku_code" nameKey="sku_name"
      productCode={productCode}
      onCreate={() => router.push(`/master-data/product-skus/new${productCode !== undefined ? `?product_code=${encodeURIComponent(productCode)}` : ''}`)}
      onCodeClick={code => setDetailCode(code)} fields={skuFields(t)}
      columns={[
        { key: 'sku_name', label: tr('SKU 名称') }, { key: 'product_code', label: tr('产品') },
        { key: 'grade_code', label: tr('等级') }, { key: 'spec_code', label: tr('规格') }, { key: 'barcode', label: tr('条码') },
      ]} />
    {canView && <MasterDataDetailDrawer open={detailCode !== null} code={detailCode} config={skuConfig} onClose={() => setDetailCode(null)} />}
  </div>;
}
