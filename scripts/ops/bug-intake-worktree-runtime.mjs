const RUNNER_RUNTIME_DEPENDENCY_PATHS = new Set([
  'node_modules',
  'apps/api/node_modules',
  'apps/web/node_modules',
]);

export function filterRunnerRuntimeStatus(statusOutput) {
  return String(statusOutput || '')
    .split('\n')
    .filter((line) => {
      const file = line.length >= 3 ? line.slice(3).trim() : line.trim();
      const normalized = file.replace(/\/$/, '');
      return !RUNNER_RUNTIME_DEPENDENCY_PATHS.has(normalized);
    })
    .filter(Boolean)
    .join('\n');
}

export function filterRunnerRuntimeFiles(files) {
  return (files || []).filter((file) => !RUNNER_RUNTIME_DEPENDENCY_PATHS.has(String(file || '').replace(/\/$/, '')));
}
