"use client";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";

export default function MaterialRuntimePage() {
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader
        title="物料档案"
        subtitle="采购申请/订单的物品来源——饲料/兽药/包材/配件/建材等生产物资"
        breadcrumb={["主数据中心", "物料档案"]}
      />
      <MasterDataRuntimePanel
        type="material"
        title="采购物料"
        codeKey="material_code"
        nameKey="material_name"
        fields={[
          { key: "material_name", label: "物料名称", required: true },
          { key: "material_type", label: "物料类型", dictType: "PRC_MATERIAL_TYPE" },
          { key: "spec", label: "规格型号" },
          { key: "unit", label: "计量单位" },
          { key: "default_currency", label: "常用币种", dictType: "SYS_CURRENCY" },
          { key: "remark", label: "备注" },
        ]}
        columns={[
          { key: "material_name", label: "物料名称" },
          { key: "material_type", label: "类型" },
          { key: "spec", label: "规格" },
          { key: "unit", label: "单位" },
        ]}
      />
    </div>
  );
}
