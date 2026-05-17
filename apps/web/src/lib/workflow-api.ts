"use client";

const API_BASE = "/api/workflow";

function token() {
  if (typeof window === "undefined") return "";
  return sessionStorage.getItem("phoenix_token") || "";
}

async function req<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token()}`,
      ...(init.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.message || `请求失败 (${res.status})`);
  return data;
}

export interface WorkflowList<T> {
  code: number;
  data: T[];
  total?: number;
}

export interface WorkflowOne<T> {
  code: number;
  data: T;
}

export interface WorkflowDefinition {
  id: number;
  code: string;
  name: string;
  description?: string;
  category?: string;
  status: string;
  current_version_id?: number;
}

export interface WorkflowForm {
  id: number;
  code: string;
  name: string;
  description?: string;
  category?: string;
  status: string;
  current_version_id?: number;
}

export interface WorkflowTask {
  id: number;
  task_no: string;
  instance_id: number;
  node_name: string;
  status: string;
  action_result?: string;
  title: string;
  instance_no?: string;
  instance_status?: string;
  definition_name?: string;
  starter_name: string;
  assignee_role_code?: string;
  due_at?: string;
  completed_at?: string;
  form_data_json?: Record<string, unknown>;
  created_at: string;
}

export interface WorkflowInstance {
  id: number;
  instance_no: string;
  title: string;
  status: string;
  starter_name: string;
  form_data_json?: Record<string, unknown>;
  tasks?: WorkflowTask[];
  actions?: Record<string, unknown>[];
  created_at: string;
}

export const workflowApi = {
  definitions: () => req<WorkflowList<WorkflowDefinition>>("/definitions"),
  createDefinition: (data: Record<string, unknown>) =>
    req<WorkflowOne<WorkflowDefinition>>("/definitions", { method: "POST", body: JSON.stringify(data) }),
  generateIndustryTemplates: () =>
    req<WorkflowOne<Record<string, unknown>>>("/definitions/industry-templates/generate", { method: "POST", body: JSON.stringify({}) }),
  cloneDefinition: (id: number, data: Record<string, unknown>) =>
    req<WorkflowOne<WorkflowDefinition>>(`/definitions/${id}/clone`, { method: "POST", body: JSON.stringify(data) }),
  publishDefinition: (id: number, data: Record<string, unknown>) =>
    req<WorkflowOne<Record<string, unknown>>>(`/definitions/${id}/publish`, { method: "POST", body: JSON.stringify(data) }),
  definitionDesigner: (id: number) => req<WorkflowOne<Record<string, unknown>>>(`/definitions/${id}/designer`),

  forms: () => req<WorkflowList<WorkflowForm>>("/forms"),
  createForm: (data: Record<string, unknown>) =>
    req<WorkflowOne<WorkflowForm>>("/forms", { method: "POST", body: JSON.stringify(data) }),
  publishForm: (id: number, data: Record<string, unknown>) =>
    req<WorkflowOne<Record<string, unknown>>>(`/forms/${id}/publish`, { method: "POST", body: JSON.stringify(data) }),
  formDesigner: (id: number) => req<WorkflowOne<Record<string, unknown>>>(`/forms/${id}/designer`),

  dataSources: () => req<WorkflowList<Record<string, unknown>>>("/data-sources"),
  createDataSource: (data: Record<string, unknown>) =>
    req<WorkflowOne<Record<string, unknown>>>("/data-sources", { method: "POST", body: JSON.stringify(data) }),
  previewDataSource: (data: Record<string, unknown>) =>
    req<WorkflowList<Record<string, unknown>>>("/data-sources/preview", { method: "POST", body: JSON.stringify(data) }),

  start: (data: Record<string, unknown>) =>
    req<WorkflowOne<WorkflowInstance>>("/start", { method: "POST", body: JSON.stringify(data) }),
  instances: () => req<WorkflowList<WorkflowInstance>>("/instances"),
  instance: (id: number) => req<WorkflowOne<WorkflowInstance>>(`/instances/${id}`),
  cancelInstance: (id: number, comment = "") =>
    req<WorkflowOne<WorkflowInstance>>(`/instances/${id}/cancel`, { method: "POST", body: JSON.stringify({ comment }) }),

  todo: () => req<WorkflowList<WorkflowTask>>("/tasks/todo"),
  done: () => req<WorkflowList<WorkflowTask>>("/tasks/done"),
  approve: (id: number, comment: string) =>
    req<WorkflowOne<WorkflowInstance>>(`/tasks/${id}/approve`, { method: "POST", body: JSON.stringify({ comment }) }),
  reject: (id: number, comment: string) =>
    req<WorkflowOne<WorkflowInstance>>(`/tasks/${id}/reject`, { method: "POST", body: JSON.stringify({ comment }) }),
};
