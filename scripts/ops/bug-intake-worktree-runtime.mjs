const RUNNER_RUNTIME_DEPENDENCY_PATHS = new Set([
  'node_modules',
  'apps/api/node_modules',
  'apps/web/node_modules',
]);

function statusPath(line) {
  if (/^[ MADRCU?!]{2} /.test(line)) return line.slice(3).trim();
  if (/^[MADRCU?!] /.test(line)) return line.slice(2).trim();
  return line.trim();
}

export function filterRunnerRuntimeStatus(statusOutput) {
  return String(statusOutput || '')
    .split('\n')
    .filter((line) => {
      const file = statusPath(line);
      const normalized = file.replace(/\/$/, '');
      return !RUNNER_RUNTIME_DEPENDENCY_PATHS.has(normalized);
    })
    .filter(Boolean)
    .join('\n');
}

export function gitStatusFiles(statusOutput) {
  return String(statusOutput || '')
    .split('\n')
    .filter(Boolean)
    .map(statusPath)
    .filter(Boolean);
}

export function filterRunnerRuntimeFiles(files) {
  return (files || []).filter((file) => !RUNNER_RUNTIME_DEPENDENCY_PATHS.has(String(file || '').replace(/\/$/, '')));
}
