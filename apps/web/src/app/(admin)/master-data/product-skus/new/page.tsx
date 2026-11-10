'use client';
import { Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { SkuCreatePage } from '@/components/master-data/SkuCreatePage';

function Content() {
  const query = useSearchParams();
  return <SkuCreatePage key={query.get('product_code') ?? ''} productCode={query.get('product_code') ?? undefined} />;
}
export default function SkuNewPage() {
  return <Suspense fallback={<p>正在加载 SKU/销售规格…</p>}><Content /></Suspense>;
}
