"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { skuConfig } from "@/components/master-data/detail-configs";

export default function SkuRuntimePage() {
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader title="SKU 中心" subtitle="物料 SKU 主档 · 三键唯一 · 库存批次 · 点击编码查看 SKU 全景" breadcrumb={["主数据中心", "SKU 中心"]} />
      <MasterDataCenterStrip type="sku" />
      <MasterDataRuntimePanel
        type="sku"
        title="SKU"
        codeKey="sku_code"
        nameKey="sku_name"
        onCodeClick={(code) => setDetailCode(code)}
        fields={[
          { key: "sku_name", label: "SKU 名称", required: true },
          { key: "product_code", label: "产品编码", required: true },
          { key: "product_name", label: "产品名称" },
          { key: "grade_code", label: "等级编码", required: true },
          { key: "spec_code", label: "规格编码", required: true },
          { key: "barcode", label: "条码" },
          { key: "effective_date", label: "生效日期", type: "date" },
          { key: "expire_date", label: "失效日期", type: "date" },
          { key: "remark", label: "备注" },
        ]}
        columns={[
          { key: "sku_name", label: "SKU 名称" },
          { key: "product_code", label: "产品" },
          { key: "grade_code", label: "等级" },
          { key: "spec_code", label: "规格" },
          { key: "barcode", label: "条码" },
        ]}
      />
      <MasterDataDetailDrawer
        open={detailCode !== null}
        code={detailCode}
        config={skuConfig}
        onClose={() => setDetailCode(null)}
      />
    </div>
  );
}
