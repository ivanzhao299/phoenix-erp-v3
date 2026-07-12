import { describe, expect, it } from "vitest";
import { getWorkflowTodoDisplayTotal } from "./workflow-todos";

describe("workflow todo helpers", () => {
  it("uses the API total when it is at least the loaded rows", () => {
    expect(getWorkflowTodoDisplayTotal({
      items: [{ id: 1 }],
      total: 18,
      page: 1,
      pageSize: 20,
    })).toBe(18);
  });

  it("does not show zero when visible approval todos were returned", () => {
    expect(getWorkflowTodoDisplayTotal({
      items: [{ id: "APPROVAL_ENGINE-1" }],
      total: 0,
      page: 1,
      pageSize: 20,
    })).toBe(1);
  });

  it("covers BUG-20260709-0004: header count follows visible pending rows when API total is stale", () => {
    expect(getWorkflowTodoDisplayTotal({
      items: [{
        taskSource: "APPROVAL_ENGINE",
        taskId: "PR2-20260707-00002",
        subject: "Procurement test 2",
      }],
      total: 0,
      page: 1,
      pageSize: 20,
    })).toBe(1);
  });

  it("accounts for later pages when total is stale", () => {
    expect(getWorkflowTodoDisplayTotal({
      items: [{ id: 41 }, { id: 42 }],
      total: 0,
      page: 3,
      pageSize: 20,
    })).toBe(42);
  });

  it("normalizes incomplete response shapes without inflating empty states", () => {
    expect(getWorkflowTodoDisplayTotal({ items: [], total: "bad", page: 0, pageSize: 0 })).toBe(0);
    expect(getWorkflowTodoDisplayTotal({ total: -3, page: undefined, pageSize: undefined })).toBe(0);
  });
});
