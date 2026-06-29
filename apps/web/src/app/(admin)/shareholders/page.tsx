'use client';

import Link from 'next/link';
import u from "@/styles/uix-utils.module.css";
import PageHeader from '@/components/PageHeader';
import { useLanguage } from "@/contexts/LanguageContext";
const CARDS = [{
  href: '/shareholders/dashboard',
  title: '股东驾驶舱',
  desc: '按查看范围展示可见项目与出资概览'
}, {
  href: '/shareholders/capital',
  title: '资本流管理',
  desc: '新增/审批/确认到账/冲销，仅确认参与汇总'
}, {
  href: '/shareholders/projects',
  title: '股东项目',
  desc: '项目、公司、场区、出资状态、股东人数、股比合计'
}, {
  href: '/shareholders/equity',
  title: '股权结构',
  desc: '按项目展示股东、股比、应缴、实缴、未缴'
}, {
  href: '/shareholders/contributions',
  title: '出资台账',
  desc: '录入/确认/取消出资，查看来源'
}, {
  href: '/shareholders/scopes',
  title: '查看范围',
  desc: '绑定用户可查看的项目/公司/场区'
}];
export default function ShareholderHome() {
  const { t } = useLanguage();
  return <div className={u.p24}>
      <PageHeader title={t("ui.股东权益中心", "股东权益中心")} />
      <p style={{ color: 'var(--text-secondary)', marginBottom: 20 }}>{t("ui.股东权益实缴出资台账实益出资结构按项目授权的查看范围实缴口径", "股东权益、实缴出资台账、实益出资结构、按项目授权的查看范围（实缴口径）")}</p>
      <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))',
      gap: 16
    }}>
        {CARDS.map(c => <Link key={c.href} href={c.href} style={{
        display: 'block',
        padding: 18,
        borderRadius: 10,
        background: 'var(--bg-card)',
        borderLeft: '4px solid var(--color-primary)',
        boxShadow: '0 1px 3px var(--overlay-black-08)',
        textDecoration: 'none'
      }}>
            <div style={{
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--color-primary)'
        }}>{t(`ui.${c.title}`, c.title)}</div>
            <div style={{
          fontSize: 13,
          color: 'var(--text-secondary)',
          marginTop: 6
        }}>{t(`ui.${c.desc}`, c.desc)}</div>
          </Link>)}
      </div>
    </div>;
}