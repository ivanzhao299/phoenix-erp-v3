"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { productConfig } from "@/components/master-data/detail-configs";
import { useLanguage } from "@/contexts/LanguageContext";
import { PRODUCT_FIELDS } from "./_fields";

/**
 * G5.5-C — 产品档案 Runtime（UIX-8 产品中心）
 * g200p-3c:11 字段切 page 模式(零售价/批发价/规格 在抽屉里易遗漏)
 * 点击编码 → 产品中心 detail drawer（SKU / 库存 / 销量 聚合）
 */

export default function ProductRuntimePage() {
  const { t } = useLanguage();
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader title={t('md.productCenter', '产品中心')} subtitle={t('md.productCenterSub', '产品 SPU 主档 · SKU 关联 · 上市状态 · 点击编码查看产品全景')} breadcrumb={[t('md.center', '主数据中心'), t('md.productCenter', '产品中心')]} />
      <MasterDataCenterStrip type="product" />
      <MasterDataRuntimePanel
        type="product"
        title={t('md.product', '产品')}
        codeKey="product_code"
        nameKey="product_name"
        mode="page"
        pageRoutePrefix="/master-data/products"
        onCodeClick={(code) => setDetailCode(code)}
        fields={PRODUCT_FIELDS}
        columns={[
          { key: "product_name_zh", label: t('md.nameZh', '中文名') },
          { key: "category_code", label: t('md.category', '品类') },
          { key: "unit_zh", label: t('md.unit', '单位') },
          { key: "shelf_life_days", label: t('md.shelfLife', '保质期') },
          { key: "price_retail", label: t('md.priceRetail', '零售价') },
        ]}
      />
      <MasterDataDetailDrawer
        open={detailCode !== null}
        code={detailCode}
        config={productConfig}
        onClose={() => setDetailCode(null)}
      />
    </div>
  );
}
