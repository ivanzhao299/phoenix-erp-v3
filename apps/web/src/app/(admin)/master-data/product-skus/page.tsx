'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SkuManagementPage } from '@/components/master-data/SkuManagementPage';

function Content() {
  const query = useSearchParams();
  return <SkuManagementPage key={query.toString()} productCode={query.get('product_code') ?? undefined} initialSkuCode={query.get('sku_code') ?? ''} />;
}
export default function SkuRuntimePage() {
  return <Suspense fallback={<p>正在加载 SKU/销售规格…</p>}><Content /></Suspense>;
}
