/**
 * /settings/organizations — DEPRECATED (ORG-MERGE 方案 B)
 *
 * 该页面历史上承担组织 CRUD + 成员归属管理，与 /master-data/organizations 重复建设。
 * 按 docs/org-module-duplication-audit.md 的合并方案：
 *   · 组织信息（CRUD + 风险）由 /master-data/organizations 提供
 *   · 成员归属由 /master-data/organizations 的"成员管理"Tab 提供
 *
 * 本路径保留作为兼容性重定向。
 */

import { redirect } from "next/navigation";

export default function DeprecatedOrgSettingsPage() {
  redirect("/master-data/organizations");
}
