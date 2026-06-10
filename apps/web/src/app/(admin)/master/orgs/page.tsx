/**
 * /master/orgs — DEPRECATED（G80 整合）
 *
 * 旧 V1 组织管理页（裸 inline 样式），与 /master-data/organizations 重复建设。
 * 按 docs/g80-rbac-org-consolidation.md：组织管理统一到 /master-data/organizations。
 * 本路径保留为兼容性重定向。
 */
import { redirect } from "next/navigation";

export default function DeprecatedMasterOrgsPage() {
  redirect("/master-data/organizations");
}
