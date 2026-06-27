"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Clock, RefreshCw, ExternalLink } from "lucide-react";
import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import { usePermission } from "@/hooks/usePermission";
import { EmptyState, LoadingSkeleton, DataTableV3 } from "@/components/design-system";
import { secondaryActionButton } from "@/components/design-system/cockpit-styles";
import request from "@/lib/api-client";

/**
 * 主数据待审批（G3-B）
 * 汇总展示用户有权查看的主数据类型中处于「待审批」状态的记录。
 * 实际审批在「审批中心」待办完成（Workflow 2.0）。
 */
import u from "@/styles/uix-utils.module.css";
const TYPES = [{
  type: "customer",
  label: "客户",
  codeKey: "customer_no",
  nameKey: "customer_name",
  menu: "MENU_MD_CUSTOMER"
}, {
  type: "supplier",
  label: "供应商",
  codeKey: "supplier_code",
  nameKey: "supplier_name",
  menu: "MENU_MD_SUPPLIER"
}, {
  type: "project",
  label: "项目公司",
  codeKey: "project_code",
  nameKey: "project_name",
  menu: "MENU_MD_PROJECT"
}, {
  type: "cash-account",
  label: "资金账户",
  codeKey: "account_code",
  nameKey: "account_name",
  menu: "MENU_MD_CASH_ACCOUNT"
}, {
  type: "material",
  label: "物料",
  codeKey: "material_code",
  nameKey: "material_name",
  menu: "MENU_MD_MATERIAL"
}, {
  type: "product",
  label: "产品",
  codeKey: "product_code",
  nameKey: "product_name",
  menu: "MENU_MD_PRODUCT"
}, {
  type: "grade",
  label: "等级",
  codeKey: "grade_code",
  nameKey: "grade_name",
  menu: "MENU_MD_GRADE"
}, {
  type: "spec",
  label: "包装规格",
  codeKey: "spec_code",
  nameKey: "spec_name",
  menu: "MENU_MD_PACKAGING"
}, {
  type: "sku",
  label: "SKU",
  codeKey: "sku_code",
  nameKey: "sku_name",
  menu: "MENU_MD_SKU"
}, {
  type: "warehouse",
  label: "仓库",
  codeKey: "warehouse_code",
  nameKey: "warehouse_name",
  menu: "MENU_MD_WAREHOUSE"
}, {
  type: "store",
  label: "门店",
  codeKey: "store_code",
  nameKey: "store_name",
  menu: "MENU_MD_STORE"
}, {
  type: "driver",
  label: "司机",
  codeKey: "driver_code",
  nameKey: "driver_name",
  menu: "MENU_MD_DRIVER"
}, {
  type: "vehicle",
  label: "车辆",
  codeKey: "vehicle_no",
  nameKey: "vehicle_no",
  menu: "MENU_MD_VEHICLE"
}, {
  type: "bank-account",
  label: "银行账户",
  codeKey: "bank_account_code",
  nameKey: "bank_name",
  menu: "MENU_MD_BANK_ACCOUNT"
}, {
  type: "organization",
  label: "组织",
  codeKey: "org_code",
  nameKey: "org_name",
  menu: "MENU_MD_ORG"
}, {
  type: "company",
  label: "公司",
  codeKey: "org_code",
  nameKey: "org_name",
  menu: "MENU_MD_COMPANY"
}, {
  type: "dict",
  label: "数据字典",
  codeKey: "dict_code",
  nameKey: "dict_label_zh",
  menu: "MENU_SETTINGS_DATA"
}];
export default function MasterDataPendingPage() {
  const customerPerm = usePermission("MENU_MD_CUSTOMER");
  const supplierPerm = usePermission("MENU_MD_SUPPLIER");
  const projectPerm = usePermission("MENU_MD_PROJECT");
  const cashPerm = usePermission("MENU_MD_CASH_ACCOUNT");
  const materialPerm = usePermission("MENU_MD_MATERIAL");
  const productPerm = usePermission("MENU_MD_PRODUCT");
  const gradePerm = usePermission("MENU_MD_GRADE");
  const specPerm = usePermission("MENU_MD_PACKAGING");
  const skuPerm = usePermission("MENU_MD_SKU");
  const warehousePerm = usePermission("MENU_MD_WAREHOUSE");
  const storePerm = usePermission("MENU_MD_STORE");
  const driverPerm = usePermission("MENU_MD_DRIVER");
  const vehiclePerm = usePermission("MENU_MD_VEHICLE");
  const bankPerm = usePermission("MENU_MD_BANK_ACCOUNT");
  const orgPerm = usePermission("MENU_MD_ORG");
  const companyPerm = usePermission("MENU_MD_COMPANY");
  const dictPerm = usePermission("MENU_SETTINGS_DATA");
  const typePerms: Record<string, boolean> = {
    MENU_MD_CUSTOMER: customerPerm.canView,
    MENU_MD_SUPPLIER: supplierPerm.canView,
    MENU_MD_PROJECT: projectPerm.canView,
    MENU_MD_CASH_ACCOUNT: cashPerm.canView,
    MENU_MD_MATERIAL: materialPerm.canView,
    MENU_MD_PRODUCT: productPerm.canView,
    MENU_MD_GRADE: gradePerm.canView,
    MENU_MD_PACKAGING: specPerm.canView,
    MENU_MD_SKU: skuPerm.canView,
    MENU_MD_WAREHOUSE: warehousePerm.canView,
    MENU_MD_STORE: storePerm.canView,
    MENU_MD_DRIVER: driverPerm.canView,
    MENU_MD_VEHICLE: vehiclePerm.canView,
    MENU_MD_BANK_ACCOUNT: bankPerm.canView,
    MENU_MD_ORG: orgPerm.canView,
    MENU_MD_COMPANY: companyPerm.canView,
    MENU_SETTINGS_DATA: dictPerm.canView,
  };
  const visibleTypes = useMemo(() => TYPES.filter(t => typePerms[t.menu]), [
    customerPerm.canView,
    supplierPerm.canView,
    projectPerm.canView,
    cashPerm.canView,
    materialPerm.canView,
    productPerm.canView,
    gradePerm.canView,
    specPerm.canView,
    skuPerm.canView,
    warehousePerm.canView,
    storePerm.canView,
    driverPerm.canView,
    vehiclePerm.canView,
    bankPerm.canView,
    orgPerm.canView,
    companyPerm.canView,
    dictPerm.canView,
  ]);
  const canView = visibleTypes.length > 0;
  const [data, setData] = useState<Record<string, Record<string, any>[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const results = await Promise.allSettled(visibleTypes.map(t => request<Record<string, any>[]>(`/master-data/runtime/${t.type}?status=PENDING_APPROVAL`)));
      const map: Record<string, Record<string, any>[]> = {};
      visibleTypes.forEach((t, i) => {
        map[t.type] = results[i].status === "fulfilled" ? (results[i] as PromiseFulfilledResult<any>).value : [];
      });
      setData(map);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "加载失败");
    } finally {
      setLoading(false);
    }
  }, [visibleTypes]);
  useEffect(() => {
    if (canView) load();
  }, [canView, load]);
  if (!canView) return <div className={u.emptyPad40}>无权限访问</div>;
  const total = Object.values(data).reduce((s, arr) => s + arr.length, 0);
  return <div className="animate-fade-in" style={{
    padding: "24px 32px",
    maxWidth: 1100
  }}>
      <PageHeader title="主数据待审批" subtitle="待审批主数据汇总 · 审批在「审批中心」待办完成（通过后自动生效）" breadcrumb={["主数据中心", "主数据待审批"]} />

      <div style={{
      display: "flex",
      gap: 10,
      alignItems: "center",
      marginBottom: 18
    }}>
        <button onClick={load} disabled={loading} style={secondaryActionButton}>
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} /> 刷新
        </button>
        <Link href="/workflow/tasks/todo" style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
        padding: "8px 16px",
        borderRadius: 8,
        background: "var(--color-primary)",
        color: "white",
        fontSize: 13,
        fontWeight: 600,
        textDecoration: "none",
        marginLeft: "auto"
      }}>
          <ExternalLink size={14} /> 前往审批中心
        </Link>
      </div>

      {error && <div style={{
      padding: "10px 14px",
      borderRadius: 8,
      marginBottom: 14,
      background: "var(--status-danger-bg)",
      border: "1px solid var(--status-danger-border)",
      color: "var(--status-danger)",
      fontSize: 13
    }}>{error}</div>}

      {loading ? <div style={{
      padding: 16
    }}><LoadingSkeleton variant="card" rows={3} /></div> : total === 0 ? <EmptyState title="暂无待审批主数据" description="所有主数据均已审批生效" /> : <div style={{
      display: "flex",
      flexDirection: "column",
      gap: 18
    }}>
            {visibleTypes.map(t => data[t.type]?.length > 0 && <div key={t.type}>
                <div style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          fontSize: 14,
          fontWeight: 600,
          color: "var(--text-primary)"
        }}>
                  <Clock size={15} style={{
            color: "var(--status-warning)"
          }} /> {t.label}
                  <span style={{
            fontSize: 11,
            fontWeight: 400,
            color: "var(--text-secondary)",
            background: "var(--status-warning-bg, var(--bg-muted))",
            padding: "1px 8px",
            borderRadius: 10
          }}>{data[t.type].length} 待审批</span>
                </div>
                <DataTableV3
                  rows={data[t.type]}
                  rowKey={(r) => r[t.codeKey]}
                  columns={[
                    { key: t.codeKey, title: "编码", render: (r) => <span style={{ fontFamily: "monospace", color: "var(--color-primary)" }}>{r[t.codeKey]}</span> },
                    { key: t.nameKey, title: "名称", render: (r) => r[t.nameKey] },
                  ]}
                />
              </div>)}
          </div>}
    </div>;
}
