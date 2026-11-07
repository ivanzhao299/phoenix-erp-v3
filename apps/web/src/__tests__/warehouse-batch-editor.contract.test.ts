import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(__dirname, "..");
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("warehouse batch document editor contract", () => {
  it("keeps header plus items batch payloads on inbound and outbound pages", () => {
    const inbound = read("app/(admin)/warehouse/inbound/page.tsx");
    const outbound = read("app/(admin)/warehouse/outbound/page.tsx");
    const editor = read("components/warehouse/BatchDocumentEditor.tsx");
    expect(inbound).toContain('request("/inbound/batch"');
    expect(outbound).toContain('apiRequest("/outbound/batch"');
    expect(inbound).toContain("documents");
    expect(outbound).toContain("documents");
    expect(inbound).toContain("const items = batchItems.map");
    expect(inbound).toContain("documents: [{ ...batchHeader");
    expect(outbound).toContain("const items = batchItems.map");
    expect(outbound).toContain("documents: [{ ...batchHeader");
    expect(outbound).toContain("destination_type");
    expect(editor).toContain("新增明细");
    expect(editor).toContain("newBatchLine");
    expect(inbound).toContain('request<InboundConfirmResponse>("/inbound/batch/confirm"');
    expect(outbound).toContain("/outbound/batch/confirm");
  });
});
