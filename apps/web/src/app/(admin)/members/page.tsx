"use client";
import { useEffect, useState } from "react";
import { crudApi } from "@/lib/api-client";
import PageHeader from "@/components/PageHeader";
import Link from "next/link";
import { LayoutDashboard, Users, Tag, Megaphone } from "lucide-react";
import styles from "./members.module.css";
import { useLanguage } from "@/contexts/LanguageContext";

export default function MembersDashboard() {
  const { t } = useLanguage();
  const [stats, setStats] = useState<Record<string,number>>({  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      crudApi.list("crm_members", { limit: 1 } as any).catch(() => ({ total: 0 })),
      crudApi.list("crm_coupons", { limit: 1 } as any).catch(() => ({ total: 0 })),
      crudApi.list("crm_activities", { limit: 1 } as any).catch(() => ({ total: 0 })),
    ]).then(([membersRes, couponsRes, activitiesRes]) => {
      setStats({
        members: (membersRes as any).total ?? 0,
        coupons: (couponsRes as any).total ?? 0,
        activities: (activitiesRes as any).total ?? 0,
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const KPIs = [
    { label: t("ui.会员总数","会员总数"), value: stats.members, color: "#3b82f6" },
    { label: t("ui.优惠券数","优惠券数"), value: stats.coupons, color: "#f59e0b" },
    { label: t("ui.营销活动数","营销活动数"), value: stats.activities, color: "#22c55e" },
  ];

  const QUICK = [
    { path: "/members/list", Icon: Users, label: t("ui.会员档案","会员档案"), desc: t("ui.查看和管理会员信息","查看和管理会员信息") },
    { path: "/members/coupons", Icon: Tag, label: t("ui.优惠券","优惠券"), desc: t("ui.发行与管理优惠券","发行与管理优惠券") },
    { path: "/members/activity", Icon: Megaphone, label: t("ui.营销活动","营销活动"), desc: t("ui.折扣赠品积分活动","折扣·赠品·积分活动") },
    { path: "/members/points", Icon: LayoutDashboard, label: t("ui.积分规则","积分规则"), desc: t("ui.配置积分获取规则","配置积分获取规则") },
  ];

  return (
    <div>
      <PageHeader title={t("ui.会员营销","会员营销")} subtitle={t("ui.积分优惠券与营销活动管理","积分、优惠券与营销活动管理")} />
      <div className={styles.kpiGrid}>
        {KPIs.map(k => (
          <div key={k.label} className={styles.kpiCard}>
            <div className={styles.kpiValue} style={{ color: k.color }}>
              {loading ? <span className={styles.skeleton} style={{display:"inline-block",width:48,height:36}} /> : k.value}
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
