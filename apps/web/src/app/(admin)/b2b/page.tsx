"use client";
import { useEffect, useState } from "react";
import { crudApi } from "@/lib/api-client";
import PageHeader from "@/components/PageHeader";
import Link from "next/link";
import { Users, ShoppingCart, Award } from "lucide-react";
import styles from "./b2b.module.css";

export default function B2BOverviewPage() {
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
    { label: "B2B 客户数", value: stats.customers, color: "#3b82f6" },
    { label: "B2B 订单数", value: stats.orders, color: "#22c55e" },
  ];

  const QUICK = [
    { path: "/b2b/customers", Icon: Users, label: "B2B 客户", desc: "b2b_customers" },
    { path: "/b2b/orders", Icon: ShoppingCart, label: "B2B 订单", desc: "b2b_orders" },
    { path: "/b2b/distributor-grading", Icon: Award, label: "经销商分级", desc: "chn_distributor_grading" },
  ];

  return (
    <div>
      <PageHeader title="B2B 分销" subtitle="批发分销管理中心（b2b_customers + b2b_orders）" />
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
