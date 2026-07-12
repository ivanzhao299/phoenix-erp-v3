import type { AccentColor } from "@/lib/design-tokens";

export type PilotScoreStatus = "GREEN" | "YELLOW" | "RED";
export type PilotStatusVariant = "good" | "warn" | "danger";

export function formatPilotAmount(value: number): string {
  if (!Number.isFinite(value)) return "¥0";
  if (Math.abs(value) >= 10000) return `¥${(value / 10000).toFixed(1)}万`;
  return `¥${value.toLocaleString("zh-CN", { maximumFractionDigits: 0 })}`;
}

export function getPilotStatusVariant(status: string): PilotStatusVariant {
  if (status === "GREEN") return "good";
  if (status === "YELLOW") return "warn";
  return "danger";
}

export function getPilotStatusTone(status: string): AccentColor {
  if (status === "GREEN") return "green";
  if (status === "YELLOW") return "amber";
  return "red";
}

export function getPilotReadinessLabel(goLiveReady: boolean, blockerCount: number): {
  label: string;
  accentColor: AccentColor;
} {
  if (goLiveReady) return { label: "可上线", accentColor: "green" };
  return { label: `${Math.max(0, blockerCount)} 项阻塞`, accentColor: "red" };
}
