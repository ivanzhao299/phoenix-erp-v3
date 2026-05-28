"use client";
import { useEffect, useState } from "react";
import { crudApi } from "@/lib/api-client";
import PageHeader from "@/components/PageHeader";
import Link from "next/link";
import { Users, ShoppingCart, Award } from "lucide-react";
import styles from "./b2b.module.css";
import { useLanguage } from "@/contexts/LanguageContext";
import { LegacyFreezeBanner } from "@/components/LegacyFreezeBanner";

export default function B2BOverviewPage() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<Record<string,number>>({ customers: 0, orders: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      crudApi.list("b2b_customers", { limit: 1 } as any).catch(() => ({ total: 0 })),
      crudApi.list("b2b_orders", { limit: 1 } as any).catch(() => ({ total: 0 })),
    ]).then(([customersRes, ordersRes]) => {
      setStats({
        customers: (customersRes as any).total ?? 0,
        orders: (ordersRes as any).total ?? 0,
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const KPIs = [
    { label: t("ui.B2B客户数", "B2B 客户数"), value: stats.customers, color: "#3b82f6" },
    { label: t("ui.B2B订单数", "B2B 订单数"), value: stats.orders, color: "#22c55e" },
  ];

  const QUICK = [
    { path: "/b2b/customers", Icon: Users, label: t("ui.B2B客户", "B2B 客户"), desc: "b2b_customers" },
    { path: "/b2b/orders", Icon: ShoppingCart, label: t("ui.B2B订单", "B2B 订单"), desc: "b2b_orders" },
    { path: "/b2b/distributor-grading", Icon: Award, label: t("ui.经销商分级", "经销商分级"), desc: "chn_distributor_grading" },
  ];

  return (
    <div>
      <PageHeader title={t("ui.B2B分销", "B2B 分销")} subtitle={t("ui.批发分销管理中心", "批发分销管理中心（b2b_customers + b2b_orders）")} />
      <LegacyFreezeBanner message="当前模块已冻结，仅保留历史查询，请使用新版销售管理。" newPath="/sales2/orders" newModuleName="新版销售管理" />
      <div className={styles.kpiGrid}>
        {KPIs.map(k => (
          <div key={k.label} className={styles.kpiCard}>
            <div className={styles.kpiValue} style={{ color: k.color }}>
              {loading
                ? <span className={styles.skeleton} style={{display:"inline-block",width:48,height:36}} />
                : k.value}
            </div>
            <div className={styles.kpiLabel}>{k.label}</div>
          </div>
        ))}
      </div>
      <div className={styles.quickGrid}>
        {QUICK.map(q => (
          <Link key={q.path} href={q.path} className={styles.quickCard}>
            <q.Icon size={28} className={styles.quickIcon} />
            <div className={styles.quickLabel}>{q.label}</div>
            <div className={styles.quickDesc}>{q.desc}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
