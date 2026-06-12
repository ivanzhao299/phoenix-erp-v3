/**
 * /procurement2/projects — DEPRECATED (MDM-1 项目主数据统一)
 *
 * 该页面历史上管理 prc2_projects（已被 biz_projects 统一项目主表取代的空表）。
 * 项目主数据统一收口至主数据中心：
 *   · 项目 CRUD + 生命周期由 /master-data/projects 提供（数据源 biz_projects）
 *   · 业务单据项目下拉统一走 ProjectSelector（/biz/projects/active）
 *
 * 本路径保留作为兼容性重定向。
 */

import { redirect } from "next/navigation";

export default function DeprecatedProcurementProjectsPage() {
  redirect("/master-data/projects");
}
