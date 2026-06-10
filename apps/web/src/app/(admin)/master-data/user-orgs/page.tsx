import { redirect } from "next/navigation";

/**
 * G80 Phase 2：用户组织权限页已下线。
 * 组织绑定 / 数据范围管理能力已并入「系统设置中心 · 用户管理」(/settings/users)。
 */
export default function DeprecatedUserOrgsPage() {
  redirect("/settings/users");
}
