export interface WorkflowTodoListLike {
  items?: readonly unknown[] | null;
  total?: unknown;
  page?: unknown;
  pageSize?: unknown;
}

function finiteNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function getWorkflowTodoDisplayTotal(resp: WorkflowTodoListLike): number {
  const apiTotal = Math.max(0, Math.trunc(finiteNumber(resp.total)));
  const currentPage = Math.max(1, Math.trunc(finiteNumber(resp.page)) || 1);
  const currentPageSize = Math.max(1, Math.trunc(finiteNumber(resp.pageSize)) || 20);
  const visibleRows = Array.isArray(resp.items) ? resp.items.length : 0;
  // Keep the header count aligned with rows already rendered when the API total is stale.
  const loadedMinimum = (currentPage - 1) * currentPageSize + visibleRows;

  return Math.max(apiTotal, loadedMinimum);
}
