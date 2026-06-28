import { redirect } from "next/navigation";

/**
 * 个人中心已统一到 /profile（canonical）。
 * 本路径为历史重复页，改为重定向，消除双份维护；旧书签仍可优雅跳转。
 */
export default function DeprecatedSettingsProfilePage() {
  redirect("/profile");
}
