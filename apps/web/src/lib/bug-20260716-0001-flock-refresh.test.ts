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
  it("refreshes the flock list before closing the editor and showing non-blocking success", () => {
    const refresh = flockPageSource.indexOf("await load();");
    const close = flockPageSource.indexOf("setShowDrawer(false);", refresh);
    const success = flockPageSource.indexOf("toast.success(successMessage);", close);

    expect(refresh).toBeGreaterThan(-1);
    expect(close).toBeGreaterThan(refresh);
    expect(success).toBeGreaterThan(close);
    expect(flockPageSource).not.toContain("await showAlert({");
  });

  it("uses the controlled server reload as the single post-save source of truth", () => {
    expect(flockPageSource).not.toContain("setFlocks(current => current.map");
    expect(flockPageSource).toContain("await load();");
    expect(useCrudSource).toContain("listRequests.current.run(async signal =>");
  });

  it("prevents duplicate submissions while the mutation and refresh are pending", () => {
    expect(flockPageSource).toContain("const [submitting, setSubmitting] = useState(false)");
    expect(flockPageSource).toContain("disabled={submitting}");
    expect(flockPageSource).toContain("closeDisabled={submitting}");
    expect(flockPageSource).toContain("onClick={() => { if (submitting) return; setShowDrawer(false);");
    expect(flockPageSource).toContain("setSubmitting(false)");
  });

  it("bypasses stale browser cache for post-mutation CRUD list reads", () => {
    expect(useCrudSource).toContain("{ method:'GET', cache:'no-store', signal }");
  });
});
