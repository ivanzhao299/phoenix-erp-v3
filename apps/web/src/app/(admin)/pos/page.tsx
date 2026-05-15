"use client";
import { useEffect, useState } from "react";
import { crudApi } from "@/lib/api-client";
import PageHeader from "@/components/PageHeader";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import styles from "./pos.module.css";

export default function PosOverviewPage() {
  const [stats, setStats] = useState<Record<string,number>>({ sales: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      crudApi.list("pos_sales", { limit: 1 } as any).catch(() => ({ total: 0 })),
    ]).then(([salesRes]) => {
      setStats({
        sales: (salesRes as any).total ?? 0,
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const KPIs = [
    { label: "销售单总数", value: stats.sales, color: "#3b82f6" },
  ];

  const QUICK = [
    { path: "/pos/sales", Icon: ShoppingBag, label: "销售单管理", desc: "pos_sales" },
  ];

  return (
    <div>
      <PageHeader title="POS 销售" subtitle="门店 POS 收银销售管理（pos_sales）" />
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
