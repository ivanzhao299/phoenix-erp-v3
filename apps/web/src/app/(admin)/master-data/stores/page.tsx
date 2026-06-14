"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataCenterStrip } from "@/components/master-data/MasterDataCenterStrip";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { storeConfig } from "@/components/master-data/detail-configs";

/**
 * UIX-9A — 门店中心（接入 MasterDataDetailDrawer）
 */
export default function StoreRuntimePage() {
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px" }}>
      <PageHeader title="门店中心" subtitle="直营/加盟门店 · 销售态势 · 引用单据 · 点击编码查看门店全景" breadcrumb={["主数据中心", "门店中心"]} />
      <MasterDataCenterStrip type="store" />
      <MasterDataRuntimePanel
        type="store"
        title="门店"
        codeKey="store_code"
        nameKey="store_name"
        onCodeClick={(code) => setDetailCode(code)}
        fields={[
          { key: "store_name", label: "门店名称", required: true },
          { key: "company_code", label: "所属公司编码" },
          // G113：经营类型走字典 STORE_OP_TYPE（厂家直营/代理商自营店/代理商合作店/加盟店/合作仓）
          { key: "operation_type", label: "经营类型", type: "select", dictType: "STORE_OP_TYPE" },
          { key: "manager", label: "主要负责人" },
          { key: "contact", label: "联系人" },
          { key: "phone", label: "联系电话" },
          { key: "address", label: "地址" },
          { key: "effective_date", label: "生效日期", type: "date" },
          { key: "expire_date", label: "失效日期", type: "date" },
          { key: "remark", label: "备注" },
        ]}
        columns={[
          { key: "store_name", label: "门店名称" },
          { key: "company_code", label: "公司" },
          { key: "operation_type", label: "经营类型" },
          { key: "manager", label: "负责人" },
          { key: "contact", label: "联系人" },
          { key: "phone", label: "电话" },
        ]}
      />
      <MasterDataDetailDrawer
        open={detailCode !== null}
        code={detailCode}
        config={storeConfig}
        onClose={() => setDetailCode(null)}
      />
    </div>
  );
}
