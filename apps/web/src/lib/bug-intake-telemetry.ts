type ConsoleErrorRecord = {
  type: "console.error" | "unhandledrejection" | "error";
  message: string;
  stack?: string;
  source?: string;
  timestamp: string;
};

export type FailedRequestRecord = {
  url: string;
  method: string;
  status?: number;
  requestId?: string;
  responseExcerpt?: string;
  timestamp: string;
};

const MAX_ITEMS = 30;
const TELEMETRY_KEY = "__phoenix_bug_intake_telemetry__";

type TelemetryState = {
  installed: boolean;
  consoleErrors: ConsoleErrorRecord[];
  failedRequests: FailedRequestRecord[];
  originalConsoleError?: typeof console.error;
};

function state(): TelemetryState {
  const w = window as typeof window & { [TELEMETRY_KEY]?: TelemetryState };
  if (!w[TELEMETRY_KEY]) {
    w[TELEMETRY_KEY] = { installed: false, consoleErrors: [], failedRequests: [] };
  }
  return w[TELEMETRY_KEY]!;
}

function pushBounded<T>(items: T[], item: T) {
  items.push(item);
  if (items.length > MAX_ITEMS) items.splice(0, items.length - MAX_ITEMS);
}

function stringifyError(input: unknown): { message: string; stack?: string } {
  if (input instanceof Error) return { message: input.message, stack: input.stack };
  if (typeof input === "string") return { message: input };
  try {
    return { message: JSON.stringify(input).slice(0, 1000) };
  } catch {
    return { message: String(input) };
  }
}

export function installBugIntakeTelemetry() {
  if (typeof window === "undefined") return;
  const s = state();
  if (s.installed) return;
  s.installed = true;

  s.originalConsoleError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const first = stringifyError(args[0]);
    pushBounded(s.consoleErrors, {
      type: "console.error",
      message: args.map(arg => stringifyError(arg).message).join(" "),
      stack: first.stack,
      timestamp: new Date().toISOString(),
    });
    s.originalConsoleError?.(...args);
  };

  window.addEventListener("unhandledrejection", event => {
    const err = stringifyError(event.reason);
    pushBounded(s.consoleErrors, {
      type: "unhandledrejection",
      message: err.message,
      stack: err.stack,
      timestamp: new Date().toISOString(),
    });
  });

  window.addEventListener("error", event => {
    pushBounded(s.consoleErrors, {
      type: "error",
      message: event.message,
      source: event.filename ? `${event.filename}:${event.lineno}:${event.colno}` : undefined,
      stack: event.error?.stack,
      timestamp: new Date().toISOString(),
    });
  });
}

export function recordFailedRequest(record: Omit<FailedRequestRecord, "timestamp">) {
  if (typeof window === "undefined") return;
  pushBounded(state().failedRequests, {
    ...record,
    responseExcerpt: record.responseExcerpt?.slice(0, 1200),
    timestamp: new Date().toISOString(),
  });
}

export function getBugIntakeSnapshot() {
  if (typeof window === "undefined") return { consoleErrors: [], failedRequests: [] };
  const s = state();
  return {
    consoleErrors: [...s.consoleErrors],
    failedRequests: [...s.failedRequests],
  };
}
