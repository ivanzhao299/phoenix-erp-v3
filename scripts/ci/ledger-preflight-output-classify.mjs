// R4.2d preflight output classification (pure, shared by the ledger
// compatibility fixture runner and its tests).
//
// The preflight's REAL output contract (scripts/ledger-preflight.mjs):
//   - evaluation completed: a single JSON document on stdout
//     ({ mode, pass, failures, counts, diagnostics }, pretty-printed);
//     exit 0 = PASS, exit 1 = BLOCK with the failure list in the JSON.
//   - crashed BEFORE evaluating (bad/missing arguments, unreadable or
//     invalid inventory/registry files, psql failures, ...): a human
//     `BLOCK: <message>` line on STDERR (the thrown message may itself
//     start with 'BLOCK: ', historically producing the doubled
//     'BLOCK: BLOCK: ...' prefix), exit 1, empty stdout.
//
// Classification rules (exit status and JSON are CROSS-CHECKED — neither
// alone is ever a verdict):
//   PASS   requires exit status === 0 AND a stdout JSON document whose
//          `pass` is exactly true. An abnormal output with exit 0 (empty,
//          truncated, illegal, or pass:false) is NEVER a PASS.
//   BLOCK  with a truthful kind:
//     EVALUATION        — a real evaluation JSON concluded not-pass; reasons
//                         are its real failure list.
//     STATUS_MISMATCH   — the JSON says pass:true but the exit status is
//                         missing or non-zero (status is never coerced: a
//                         null/undefined status can never become a PASS).
//     CRASH             — the crash contract line on stderr (or stdout);
//                         no evaluation conclusion was formed.
//     EMPTY             — no output at all; no evaluation conclusion.
//     UNPARSEABLE       — stdout is not a JSON document and no crash line:
//                         genuinely corrupt output; no evaluation conclusion.
//   Every verdict carries the trimmed stderr separately (never concatenated
//   into the JSON attempt), so callers keep the real diagnostics without
//   corrupting evaluation parsing. Business semantics are preserved: every
//   non-PASS classification is a BLOCK.

export function classifyPreflightOutput({ status, stdout = '', stderr = '' } = {}) {
  const stdoutText = String(stdout ?? '');
  const stderrText = String(stderr ?? '');
  const meta = { stderr: stderrText.trim() };
  let evaluation = null;
  let stdoutIsJson = false;
  try {
    const parsed = JSON.parse(stdoutText);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) { evaluation = parsed; stdoutIsJson = true; }
  } catch { evaluation = null; }
  if (stdoutIsJson) {
    if (evaluation.pass === true) {
      if (status !== 0 || typeof status !== 'number' || !Number.isFinite(status)) {
        return { result: 'BLOCK', kind: 'STATUS_MISMATCH', reasons: `EXIT_STATUS_MISMATCH: status=${String(status)}, pass=true`, ...meta };
      }
      return { result: 'PASS', kind: 'EVALUATION', reasons: [], ...meta };
    }
    return { result: 'BLOCK', kind: 'EVALUATION', reasons: evaluation.failures ?? evaluation.diagnostics ?? evaluation, ...meta };
  }
  const crash = stderrText.match(/^BLOCK: (.+)$/m) || stdoutText.match(/^BLOCK: (.+)$/m);
  if (crash) return { result: 'BLOCK', kind: 'CRASH', reasons: `PREFLIGHT_CRASH: ${crash[1].trim()}`, ...meta };
  if (!stdoutText.trim() && !stderrText.trim()) return { result: 'BLOCK', kind: 'EMPTY', reasons: 'EMPTY_PREFLIGHT_OUTPUT', ...meta };
  return { result: 'BLOCK', kind: 'UNPARSEABLE', reasons: 'UNPARSEABLE_PREFLIGHT_OUTPUT', ...meta };
}
