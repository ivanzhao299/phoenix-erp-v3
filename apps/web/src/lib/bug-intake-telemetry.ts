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

function cleanText(value: string | null | undefined) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 160);
}

function visibleText(element: Element) {
  if (!(element instanceof HTMLElement)) return "";
  const style = window.getComputedStyle(element);
  if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) return "";
  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return "";
  return cleanText(element.innerText || element.textContent || element.getAttribute("aria-label") || "");
}

export function getBugIntakePageSnapshot() {
  if (typeof window === "undefined") return null;
  const buttons = Array.from(document.querySelectorAll("button,[role='button'],a,input,select,textarea"))
    .map((el) => {
      const element = el as HTMLElement;
      const rect = element.getBoundingClientRect();
      const label = cleanText(
        element.getAttribute("aria-label") ||
        element.getAttribute("placeholder") ||
        element.innerText ||
        element.textContent ||
        (element as HTMLInputElement).value ||
        element.getAttribute("href") ||
        "",
      );
      if (!label) return null;
      return {
        tag: element.tagName.toLowerCase(),
        label,
        disabled: Boolean((element as HTMLButtonElement).disabled || element.getAttribute("aria-disabled") === "true"),
        path: element.id ? `#${element.id}` : (element.className ? `.${String(element.className).split(/\s+/).slice(0, 2).join(".")}` : ""),
        rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
      };
    })
    .filter(Boolean)
    .slice(0, 80);
  const textBlocks = Array.from(document.querySelectorAll("h1,h2,h3,h4,p,li,td,th,label,span"))
    .map(visibleText)
    .filter(Boolean)
    .filter((text, index, arr) => arr.indexOf(text) === index)
    .slice(0, 120);
  return {
    title: document.title,
    route: window.location.pathname,
    scroll: { x: Math.round(window.scrollX), y: Math.round(window.scrollY) },
    viewport: { width: window.innerWidth, height: window.innerHeight },
    interactiveElements: buttons,
    visibleText: textBlocks,
  };
}
