"use client";

import Link from "next/link";
import PageHeader from "@/components/PageHeader";

const links = [
  ["流程定义", "/workflow/definitions"],
  ["表单定义", "/workflow/forms"],
  ["我的待办", "/workflow/tasks/todo"],
  ["我的已办", "/workflow/tasks/done"],
  ["流程实例", "/workflow/instances"],
  ["数据源", "/workflow/data-sources"],
];

export default function WorkflowHomePage() {
  return (
    <div>
      <PageHeader title="工作流中心" subtitle="配置流程、表单、数据源，并处理业务待办" breadcrumb={["工作流"]} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        {links.map(([label, href]) => (
          <Link key={href} href={href} style={cardStyle}>
            <span style={{ fontSize: 16, fontWeight: 800 }}>{label}</span>
            <span style={{ color: "var(--text-secondary)", fontSize: 12 }}>{href}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

const cardStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  padding: 16,
  border: "1px solid var(--border)",
  borderRadius: "var(--radius-md)",
  background: "var(--bg-card)",
};
