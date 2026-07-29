import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const flockPageSource = readFileSync(
  join(process.cwd(), "src/app/(admin)/breeding/flock/page.tsx"),
  "utf8",
);
const useCrudSource = readFileSync(
  join(process.cwd(), "src/hooks/useCrud.ts"),
  "utf8",
);

describe("BUG-20260716-0001 flock refresh", () => {
  it("refreshes the flock list before closing the editor and confirming success", () => {
    const refresh = flockPageSource.indexOf("await load();");
    const close = flockPageSource.indexOf("setShowDrawer(false);", refresh);
    const success = flockPageSource.indexOf("await showAlert({", close);

    expect(refresh).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(refresh);
    expect(success).toBeGreaterThan(close);
  });

  it("patches the visible row immediately before the server reconciliation", () => {
    const optimistic = flockPageSource.indexOf("setFlocks(current => current.map");
    const refresh = flockPageSource.indexOf("await load();", optimistic);
    expect(optimistic).toBeGreaterThan(-1);
    expect(refresh).toBeGreaterThan(optimistic);
    expect(flockPageSource.slice(optimistic, refresh)).toContain(
      "quantity: Number(form.qty) || 0",
    );
  });

  it("prevents duplicate submissions while the mutation and refresh are pending", () => {
    expect(flockPageSource).toContain("const [submitting, setSubmitting] = useState(false)");
    expect(flockPageSource).toContain("disabled={submitting}");
    expect(flockPageSource).toContain("setSubmitting(false)");
  });

  it("bypasses stale browser cache for post-mutation CRUD list reads", () => {
    expect(useCrudSource).toContain("{ method:'GET', cache:'no-store' }");
  });
});
