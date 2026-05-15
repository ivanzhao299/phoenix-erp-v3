"use client";
import { useEffect, useState } from "react";
import { crudApi } from "@/lib/api-client";
import PageHeader from "@/components/PageHeader";
import Link from "next/link";
import { FileText, Truck, Award } from "lucide-react";
import styles from "./wholesale.module.css";

export default function WholesaleOverviewPage() {
  const [stats, setStats] = useState<Record<string,number>>({ contracts: 0, shipments: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      crudApi.list("ws_contracts", { limit: 1 } as any).catch(() => ({ total: 0 })),
      crudApi.list("ws_shipments", { limit: 1 } as any).catch(() => ({ total: 0 })),
    ]).then(([contractsRes, shipmentsRes]) => {
      setStats({
        contracts: (contractsRes as any).total ?? 0,
        shipments: (shipmentsRes as any).total ?? 0,
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const KPIs = [
    { label: "合同总数", value: stats.contracts, color: "#3b82f6" },
    { label: "发货记录数", value: stats.shipments, color: "#22c55e" },
  ];

  const QUICK = [
    { path: "/wholesale/contracts", Icon: FileText, label: "批发合同", desc: "ws_contracts" },
    { path: "/wholesale/shipments", Icon: Truck, label: "发货记录", desc: "ws_shipments" },
    { path: "/b2b/distributor-grading", Icon: Award, label: "经销商分级", desc: "chn_distributor_grading" },
  ];

  return (
    <div>
      <PageHeader title="批发管理" subtitle="批发合同与履约发货记录（ws_contracts + ws_shipments）" />
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
