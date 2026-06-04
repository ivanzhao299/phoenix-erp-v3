"use client";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";

/**
 * G5.5-C — 产品档案 Runtime
 * 替换原占位页（"功能开发中"）；统一编码 PRD-00001 + 5 态生命周期 + Workflow
 */
export default function ProductRuntimePage() {
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px", maxWidth: 1200 }}>
      <PageHeader title="产品档案" subtitle="蛋品主档 SPU · 编码自动生成 · 生命周期管控 · 是 SKU 的父对象" breadcrumb={["主数据中心", "产品档案"]} />
      <MasterDataRuntimePanel
        type="product"
        title="产品"
        codeKey="product_code"
        nameKey="product_name"
        fields={[
          { key: "product_name", label: "产品名称（中文）", required: true },
          { key: "product_name_en", label: "产品名称（英文）" },
          { key: "category", label: "品类", type: "select", options: [
            { value: "EGG_FRESH", label: "鲜鸡蛋" }, { value: "EGG_SALTED", label: "咸蛋" },
            { value: "EGG_PRESERVED", label: "皮蛋" }, { value: "EGG_PROCESSED", label: "深加工蛋品" },
            { value: "PACK_MATERIAL", label: "包材" }, { value: "FEED", label: "饲料" },
            { value: "MEDICINE", label: "兽药" }, { value: "OTHER", label: "其他" },
          ] },
          { key: "uom", label: "计量单位", type: "select", options: [
            { value: "PCS", label: "枚" }, { value: "KG", label: "公斤" }, { value: "BOX", label: "箱" },
            { value: "PACK", label: "包" }, { value: "BTL", label: "瓶" }, { value: "L", label: "升" },
          ] },
          { key: "default_grade", label: "默认等级" },
          { key: "shelf_life_days", label: "保质期（天）", type: "number" },
          { key: "effective_date", label: "生效日期", type: "date" },
          { key: "expire_date", label: "失效日期", type: "date" },
          { key: "remark", label: "备注" },
        ]}
        columns={[
          { key: "product_name", label: "产品名称" },
          { key: "category", label: "品类" },
          { key: "uom", label: "单位" },
          { key: "shelf_life_days", label: "保质期" },
        ]}
      />
    </div>
  );
}
