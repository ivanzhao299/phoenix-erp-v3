"use client";
import { useState } from "react";
import PageHeader from "@/components/PageHeader";
import { MasterDataRuntimePanel } from "@/components/master-data/MasterDataRuntimePanel";
import { MasterDataDetailDrawer } from "@/components/master-data/MasterDataDetailDrawer";
import { storeConfig } from "@/components/master-data/detail-configs";

/**
 * UIX-9A — 门店中心（接入 MasterDataDetailDrawer）
 */
export default function StoreRuntimePage() {
  const [detailCode, setDetailCode] = useState<string | null>(null);
  return (
    <div className="animate-fade-in" style={{ padding: "24px 32px", maxWidth: 1200 }}>
      <PageHeader title="门店档案" subtitle="直营门店主档 · 编码自动生成 · 生命周期管控 · 点击编码查看门店中心" breadcrumb={["主数据中心", "门店档案"]} />
      <MasterDataRuntimePanel
        type="store"
        title="门店"
        codeKey="store_code"
        nameKey="store_name"
        onCodeClick={(code) => setDetailCode(code)}
        fields={[
          { key: "store_name", label: "门店名称", required: true },
          { key: "company_code", label: "所属公司编码" },
          { key: "manager", label: "店长（用户名）" },
          { key: "phone", label: "联系电话" },
          { key: "address", label: "地址" },
          { key: "effective_date", label: "生效日期", type: "date" },
          { key: "expire_date", label: "失效日期", type: "date" },
          { key: "remark", label: "备注" },
        ]}
        columns={[
          { key: "store_name", label: "门店名称" },
          { key: "company_code", label: "公司" },
          { key: "manager", label: "店长" },
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
