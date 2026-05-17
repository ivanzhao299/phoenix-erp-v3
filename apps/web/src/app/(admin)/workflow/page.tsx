"use client";

import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import s from "@/components/ui/admin-ui.module.css";

const userLinks = [
  ["发起申请", "/workflow/start", "选择流程，填写表单并提交审批"],
  ["我的待办", "/workflow/tasks/todo", "处理分配给我的审批任务"],
  ["我的已办", "/workflow/tasks/done", "查看已经处理过的审批记录"],
  ["流程实例", "/workflow/instances", "跟踪我发起的流程进度"],
];

const adminLinks = [
  ["流程定义", "/workflow/definitions", "管理员维护审批节点、条件和发布版本"],
  ["表单定义", "/workflow/forms", "管理员维护可视化表单和字段"],
  ["数据源", "/workflow/data-sources", "管理员维护表单下拉和引用数据"],
];

export default function WorkflowHomePage() {
  return (
    <div>
      <PageHeader title="工作流中心" subtitle="发起申请、处理待办，并由管理员维护流程和表单" breadcrumb={["工作流"]} />

      <section className={s.card} style={sectionStyle}>
        <div className={s.cardBody}>
        <h3 className={s.cardTitle} style={titleStyle}>日常使用</h3>
        <div style={gridStyle}>
          {userLinks.map(([label, href, desc]) => (
            <Link key={href} href={href} style={cardStyle}>
              <span style={cardTitleStyle}>{label}</span>
              <span style={cardDescStyle}>{desc}</span>
            </Link>
          ))}
        </div>
        </div>
      </section>

      <section className={s.card}>
        <div className={s.cardBody}>
        <h3 className={s.cardTitle} style={titleStyle}>管理员配置</h3>
        <div style={gridStyle}>
          {adminLinks.map(([label, href, desc]) => (
            <Link key={href} href={href} style={cardStyle}>
              <span style={cardTitleStyle}>{label}</span>
              <span style={cardDescStyle}>{desc}</span>
            </Link>
          ))}
        </div>
        </div>
      </section>
    </div>
  );
}

const sectionStyle: React.CSSProperties = { marginBottom: 12 };
const titleStyle: React.CSSProperties = { margin: "0 0 12px" };
const gridStyle: React.CSSProperties = { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 };
const cardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  minHeight: 92,
  padding: 16,
  border: "1px solid var(--border)",
  borderRadius: "8px",
  background: "var(--bg-page)",
  color: "var(--text-primary)",
  textDecoration: "none",
};
const cardTitleStyle: React.CSSProperties = { fontSize: 16, fontWeight: 800 };
const cardDescStyle: React.CSSProperties = { color: "var(--text-secondary)", fontSize: 13, lineHeight: 1.6 };
