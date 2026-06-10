/**
 * /settings/permissions — DEPRECATED（G80 整合）
 *
 * 旧"菜单权限"行式列表页，与"角色与权限"(/settings/roles) 的权限矩阵编辑同改一张表
 * (sys_role_menu_permission)，重复入口。按 docs/g80-rbac-org-consolidation.md：
 * 权限编辑统一到 /settings/roles 的矩阵 UI。本路径保留为兼容性重定向。
 */
import { redirect } from "next/navigation";

export default function DeprecatedPermissionsPage() {
  redirect("/settings/roles");
}
