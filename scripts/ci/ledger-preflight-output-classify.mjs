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
// Business semantics are preserved: every non-zero exit is a BLOCK. The
// classifier only makes the reported REASONS truthful — an evaluation BLOCK
// reports its real failure list, a crash reports the crash message instead
// of the old blanket UNPARSEABLE_PREFLIGHT_OUTPUT (which is now reserved for
// genuinely corrupt output: empty, truncated or non-JSON noise with no
// recognizable crash line).

export function classifyPreflightOutput({ status, stdout = '', stderr = '' } = {}) {
  const code = Number(status);
  if (code === 0) return { result: 'PASS', kind: 'EVALUATION', reasons: [] };
  const combined = `${stdout ?? ''}${stderr ?? ''}`;
  try {
    const diagnostics = JSON.parse(combined);
    return { result: 'BLOCK', kind: 'EVALUATION', reasons: diagnostics?.failures ?? diagnostics?.diagnostics ?? diagnostics };
  } catch { /* not a JSON document — classify the text below */ }
  const text = String(combined).trim();
  if (!text) return { result: 'BLOCK', kind: 'EMPTY', reasons: 'EMPTY_PREFLIGHT_OUTPUT' };
  const crash = text.match(/^BLOCK: (.+)$/m);
  if (crash) return { result: 'BLOCK', kind: 'CRASH', reasons: `PREFLIGHT_CRASH: ${crash[1].trim()}` };
  return { result: 'BLOCK', kind: 'UNPARSEABLE', reasons: 'UNPARSEABLE_PREFLIGHT_OUTPUT' };
}
