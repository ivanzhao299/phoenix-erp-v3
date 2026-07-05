"use client";

import { useEffect } from "react";
import { installBugIntakeTelemetry } from "@/lib/bug-intake-telemetry";
import { BugReportButton } from "./BugReportButton";

export function BugIntakeProvider() {
  useEffect(() => {
    installBugIntakeTelemetry();
  }, []);

  return <BugReportButton />;
}
