"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel, type MdField } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { productConfig } from "@/components/master-data/detail-configs";
import { useLanguage } from "@/contexts/LanguageContext";

/**
 * G5.5-C — 产品档案 Runtime（UIX-8 产品中心）
 * g200p-3c:11 字段切 page 模式(零售价/批发价/规格 在抽屉里易遗漏)
 * 点击编码 → 产品中心 detail drawer（SKU / 库存 / 销量 聚合）
 */

// g200p-3c:11 字段分 4 组
export const PRODUCT_FIELDS: MdField[] = [
  { key: "product_name",      label: "产品名称",        required: true, group: "基本信息" },
  { key: "product_name_zh",   label: "产品名称(中文)",  group: "基本信息" },
  { key: "product_name_lo",   label: "产品名称(老挝语)", group: "基本信息" },
  { key: "category_code",     label: "品类",            type: "select", group: "基本信息",
    options: [
      { value: "EGG_FRESH", label: "鲜鸡蛋" }, { value: "EGG_SALTED", label: "咸蛋" },
      { value: "EGG_PRESERVED", label: "皮蛋" }, { value: "EGG_PROCESSED", label: "深加工蛋品" },
      { value: "PACK_MATERIAL", label: "包材" }, { value: "FEED", label: "饲料" },
      { value: "PACKAGING", label: "包装物" }, { value: "FUEL", label: "燃料" },
      { value: "MEDICINE", label: "兽药" }, { value: "FINISHED_GOODS", label: "成品" },
      { value: "OTHER", label: "其他" },
    ] },
  { key: "unit_zh",           label: "计量单位(中文)",  group: "规格与保质" },
  { key: "unit_lo",           label: "计量单位(老挝语)", group: "规格与保质" },
  { key: "shelf_life_days",   label: "保质期(天)",      type: "number", group: "规格与保质" },
  { key: "specs",             label: "规格说明",        group: "规格与保质" },
  { key: "price_retail",      label: "零售价",          type: "number", group: "价格与图片" },
  { key: "price_wholesale",   label: "批发价",          type: "number", group: "价格与图片" },
  { key: "image_url",         label: "图片 URL",        group: "价格与图片" },
];

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
