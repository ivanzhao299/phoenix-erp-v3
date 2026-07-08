# Agent Worker Log

| Field | Value |
| --- | --- |
| Task ID | BUGTASK-20260707-0010-02-A3 |
| Agent | A3-Backend-Critical-Path |
| Dry run | No |
| Exit code | 0 |

## Command

```bash
/usr/local/bin/node scripts/ops/run-agent-task.mjs --agent A3-Backend-Critical-Path --worktree /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path --prompt docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md --task-contract docs/ops/runs/BUGTASK-20260707-0010-02-A3-contract.md --assembled-prompt-output docs/ops/runs/BUGTASK-20260707-0010-02-A3-worker-assembled-prompt.md --require-approval-token APPROVE_AGENT_EXECUTION --skip-baseline-autopilot --allow-ops-runtime-dirty
```

## Stdout

```text
Agent: A3-Backend-Critical-Path
Worktree: /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
Branch: w5-a3-backend-critical-path
Prompt: docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md
Task contract: docs/ops/runs/BUGTASK-20260707-0010-02-A3-contract.md
Assembled prompt: docs/ops/runs/BUGTASK-20260707-0010-02-A3-worker-assembled-prompt.md
Assembled prompt chars: 22815
Codex command: codex exec -C /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path --sandbox workspace-write -
Codex timeout ms: 600000
Run log: /Users/mac/phoenix-erp-worktrees/codex-orchestrator/docs/ops/runs/2026-07-08T01-12-47-019Z-A3-Backend-Critical-Path.md
PASS WITH CONDITIONS / GO.

Current branch already contains the backend fix commit:

`99ba3d1d fix: bug-20260707-0010 workflow todo counts`

Verified:

- Worktree: `/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path`
- Branch: `w5-a3-backend-critical-path`
- `git status --short`: clean
- Changed files in commit:
  - [workflow.service.ts](/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path/apps/api/src/modules/workflow/workflow.service.ts)
  - [bug-20260707-0010-a3-backend-critical-path.md](/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path/docs/ops/bug-20260707-0010-a3-backend-critical-path.md)

Validation run:

```bash
cd apps/api && ./node_modules/.bin/tsc --noEmit
```

Result: PASS.

No migrations, schema/entity changes, DB writes, deploy, push, frontend edits, or task-board writes were performed. Condition: I did not run production/runtime smoke against `erp.eggslao.com`; A4/A1 should verify `/workflow/todos` with a user that has at least one ApprovalEngine todo and confirm the header count equals the visible list count.
Baseline autopilot skipped by caller; caller must run lifecycle hook.

```

## Stderr

```text
OpenAI Codex v0.142.5
--------
workdir: /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
model: gpt-5.5
provider: openai
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR]
reasoning effort: high
reasoning summaries: none
session id: 019f3f47-5b7d-7d40-b42b-a9fb74ef6c71
--------
user
# Base Agent Prompt

# A3 Backend Task Prompt

## Agent Identity

You are `A3-Backend-Critical-Path`.

## Worktree and Branch

Worktree: `/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path`

Branch: `w5-a3-backend-critical-path`

## Execution Checks

Run:

```bash
pwd
git branch --show-current
git status --short
git log --oneline --decorate -8
```

Stop if directory, branch, or worktree cleanliness is invalid.

## Allowed Scope

Only files explicitly allowed by the task contract. Backend implementation must follow the approved module, service, controller, DTO, RBAC, DataScope, audit, and test boundaries.

## Forbidden Scope

No migrations, schema/entity/table/column changes, production deploy, database writes, push, frontend work, unrelated business modules, or DataScope service rewrites unless explicitly approved.

## Output Report Format

Write a backend report under `docs/ops/` with changed files, APIs implemented, RBAC/DataScope/audit coverage, tests run, blockers, frozen-item statement, and next review request.

## Commit Rule

Commit only approved backend files and report. Do not stage unrelated changes.

## Failure Rule

Stop on forbidden scope, failing required checks without clear report, missing security guard, dirty unexpected files, or need for migration/schema changes.

---

# Agent Task Contract

# Bug Repair Agent Contract

Source bug: BUG-20260707-0010
Source repair task: BUGTASK-20260707-0010
Assigned agent: A3-Backend-Critical-Path

## Issue

我的待办中有审批任务，但是上方显示0条

## Route

/workflow/todos

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "url": "https://erp.eggslao.com/workflow/todos",
  "bugNo": "BUG-20260707-0010",
  "route": "/workflow/todos",
  "title": "我的待办中有审批任务，但是上方显示0条",
  "taskNo": "BUGTASK-20260707-0010",
  "context": {
    "attachments": [
      {
        "sha256": "a36016cd3434273de00261ddd6ca45fce233a90eb7b2af24d56d5cc254ee1afa",
        "fileName": "01-1783415569511-68df7d8e.png",
        "mimeType": "image/png",
        "sizeBytes": 716311,
        "originalName": "pasted-screenshot-1783415381248-1.png",
        "relativePath": "storage/bug-reports/2026/07/07/BUG-20260707-0010/01-1783415569511-68df7d8e.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260707-0010/attachments/01-1783415569511-68df7d8e.png"
      }
    ],
    "clientContext": {
      "language": "zh-CN",
      "timezone": "Asia/Shanghai",
      "viewport": {
        "width": 1600,
        "height": 865
      },
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      "capturedAt": "2026-07-07T09:12:49.513Z",
      "pageSnapshot": {
        "route": "/workflow/todos",
        "title": "金凤凰 ERP — Phoenix ERP V3",
        "scroll": {
          "x": 0,
          "y": 0
        },
        "viewport": {
          "width": 1600,
          "height": 865
        },
        "visibleText": [
          "运营工作台",
          "每日工作台",
          "经营仪表盘",
          "生产管理",
          "库存管理",
          "全链追溯",
          "采购管理",
          "销售管理",
          "财务结算中心",
          "股东权益中心",
          "审批中心",
          "我的待办",
          "我的已办",
          "通知中心",
          "流程配置",
          "审批规则",
          "表单管理",
          "审批看板",
          "经营分析",
          "主数据中心",
          "系统设置",
          "验收试运行",
          "系统运维",
          "个人中心 / 修改密码",
          "37",
          "反馈问题",
          "反馈页面问题",
          "页面",
          "用户",
          "角色",
          "问题标题 *",
          "严重程度 低：样式/文案问题 中：影响局部流程 高：阻断业务操作 紧急：系统不可用/数据风险",
          "严重程度",
          "问题说明",
          "截图 / PDF（最多 5 个，单个 ≤15MB） 全屏截图 框选区域截图 直接粘贴截图 复制图片后点这里按 Ctrl/Cmd+V，或在说明框里直接粘贴。",
          "截图 / PDF（最多 5 个，单个 ≤15MB）",
          "复制图片后点这里按 Ctrl/Cmd+V，或在说明框里直接粘贴。",
          "pasted-screenshot-1783415381248-1.png",
          "退出",
          "/待办",
          "/",
          "待办",
          "审批待办",
          "·我的待审批任务（共 0 条）",
          "·",
          "来源",
          "业务类型",
          "单据编号",
          "主题",
          "金额",
          "公司",
          "项目",
          "需审批角色",
          "步骤",
          "提交时间",
          "操作",
          "审批引擎",
          "采购申请",
          "PR2-20260707-00002",
          "采购测试2",
          "80 CNY",
          "老挝凤凰农业发展有限公司",
          "PRJ_MENGSAI_LAYER",
          "-",
          "1/1",
          "07/07 16:45",
          "审批"
        ],
        "interactiveElements": [
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 119
            },
            "label": "运营工作台",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 157
            },
            "label": "每日工作台",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 195
            },
            "label": "经营仪表盘",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 233
            },
            "label": "生产管理",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 271
            },
            "label": "库存管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 309
            },
            "label": "全链追溯",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 347
            },
            "label": "采购管理",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 385
            },
            "label": "销售管理",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 423
            },
            "label": "财务结算中心",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 461
            },
            "label": "股东权益中心",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.sidebar-module__C8A-ya__groupActive",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 499
            },
            "label": "审批中心",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.sidebar-module__C8A-ya__subActive",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 537
            },
            "label": "我的待办",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 569
            },
            "label": "我的已办",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 601
            },
            "label": "通知中心",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 633
            },
            "label": "流程配置",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 665
            },
            "label": "审批规则",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 697
            },
            "label": "表单管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 729
            },
            "label": "审批看板",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 761
            },
            "label": "经营分析",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 799
            },
            "label": "主数据中心",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 837
            },
            "label": "系统设置",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 875
            },
            "label": "验收试运行",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 913
            },
            "label": "系统运维",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__profileLink",
            "rect": {
              "h": 38,
              "w": 220,
              "x": 0,
              "y": 827
            },
            "label": "个人中心 / 修改密码",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".admin-module__uYgI-a__headerSelect",
            "rect": {
              "h": 30,
              "w": 96,
              "x": 938,
              "y": 13
            },
            "label": "🇨🇳 中文 🇱🇦 ລາວ 🇬🇧 English",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 34,
              "w": 95,
              "x": 1095,
              "y": 11
            },
            "label": "在线 2",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 34,
              "w": 34,
              "x": 1204,
              "y": 11
            },
            "label": "37",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".bug-intake-module__OBjRZW__feedbackButton",
            "rect": {
              "h": 40,
              "w": 122,
              "x": 1252,
              "y": 8
            },
            "label": "反馈问题",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".bug-intake-module__OBjRZW__iconButton",
            "rect": {
              "h": 26,
              "w": 26,
              "x": 1056,
              "y": 10
            },
            "label": "关闭",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 42,
              "w": 569,
              "x": 513,
              "y": 233
            },
            "label": "例如：采购付款单项目下拉为空",
            "disabled": false
          },
          {
            "tag": "select",
            "path": "",
            "rect": {
              "h": 40,
              "w": 569,
              "x": 513,
              "y": 315
            },
            "label": "低：样式/文案问题 中：影响局部流程 高：阻断业务操作 紧急：系统不可用/数据风险",
            "disabled": false
          },
          {
            "tag": "textarea",
            "path": "",
            "rect": {
              "h": 100,
              "w": 569,
              "x": 513,
              "y": 395
            },
            "label": "请描述你刚才做了什么、期望结果、实际结果。",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".bug-intake-module__OBjRZW__captureButton",
            "rect": {
              "h": 40,
              "w": 101,
              "x": 513,
              "y": 535
            },
            "label": "全屏截图",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".bug-intake-module__OBjRZW__captureButton",
            "rect": {
              "h": 40,
              "w": 127,
              "x": 624,
              "y": 535
            },
            "label": "框选区域截图",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 18,
              "w": 18,
              "x": 764,
              "y": 715
            },
            "label": "移除附件",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".bug-intake-module__OBjRZW__secondaryButton",
            "rect": {
              "h": 43,
              "w": 62,
              "x": 920,
              "y": 769
            },
            "label": "取消",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".bug-intake-module__OBjRZW__primaryButton",
            "rect": {
              "h": 43,
              "w": 90,
              "x": 992,
              "y": 769
            },
            "label": "提交问题",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".admin-module__uYgI-a__userChip",
            "rect": {
              "h": 32,
              "w": 110,
              "x": 1388,
              "y": 12
            },
            "label": "金 金凤凰总控 集团超级管理员",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-module__uYgI-a__logoutBtn",
            "rect": {
              "h": 30,
              "w": 68,
              "x": 1512,
              "y": 13
            },
            "label": "退出",
            "disabled": false
          },
          {
            "tag": "select",
            "path": "",
            "rect": {
              "h": 24,
              "w": 120,
              "x": 265,
              "y": 170
            },
            "label": "全部来源 审批引擎 通用流程",
            "disabled": false
          },
          {
            "tag": "select",
            "path": "",
            "rect": {
              "h": 24,
              "w": 120,
              "x": 397,
              "y": 170
            },
            "label": "全部类型 采购申请 采购订单 付款申请 股东资金",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".undefined.uix-utils-module__8f1Xta__flex1",
            "rect": {
              "h": 26,
              "w": 758,
              "x": 549,
              "y": 169
            },
            "label": "搜索单号、主题…",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnPrimary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 38,
              "w": 62,
              "x": 1319,
              "y": 163
            },
            "label": "搜索",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 40,
              "w": 64,
              "x": 1393,
              "y": 162
            },
            "label": "重置",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 34,
              "w": 86,
              "x": 1469,
              "y": 165
            },
            "label": "刷新",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnPrimary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 38,
              "w": 62,
              "x": 1487,
              "y": 276
            },
            "label": "审批",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".rightDrawer-module__jI_Bsa__closeBtn",
            "rect": {
              "h": 32,
              "w": 32,
              "x": 2068,
              "y": 16
            },
            "label": "关闭抽屉",
            "disabled": false
          }
        ]
      },
      "devicePixelRatio": 2
    },
    "consoleErrors": [],
    "failedRequests": [],
    "localEvidence": {
      "localAttachments": [
        {
          "fileName": "01-1783415569511-68df7d8e.png",
          "sourceEndpoint": "/api/bug-intake/reports/BUG-20260707-0010/attachments/01-1783415569511-68df7d8e.png",
          "downloadError": "GET /api/bug-intake/reports/BUG-20260707-0010/attachments/01-1783415569511-68df7d8e.png failed HTTP 404: {\"code\":404,\"message\":\"附件文件不存在\",\"error\":\"Not Found\",\"statusCode\":404}"
        }
      ],
      "localAttachmentPaths": []
    }
  },
  "priority": "P2",
  "reporter": {
    "name": "金凤凰总控",
    "roles": [
      "ROLE_ADMIN",
      "ROLE_MASTER_DATA_APPROVER"
    ],
    "username": "admin",
    "companyCode": "",
    "projectCode": ""
  },
  "severity": "MEDIUM",
  "agentPlan": {
    "source_bug_no": "BUG-20260707-0010",
    "route_decision": "PLAN_READY",
    "split_strategy": [
      {
        "agent": "A2-Security-Regression-Gate",
        "reasons": [
          "security/RBAC/DataScope signal matched"
        ],
        "execution_mode": "dry-run-first",
        "approval_required": true
      },
      {
        "agent": "A3-Backend-Critical-Path",
        "reasons": [
          "backend/API/error route matched"
        ],
        "execution_mode": "dry-run-first",
        "approval_required": true
      },
      {
        "agent": "A4-Frontend-UAT-Smoke",
        "reasons": [
          "frontend/UI route or wording matched"
        ],
        "execution_mode": "dry-run-first",
        "approval_required": true
      },
      {
        "agent": "A5-Data-Readiness",
        "reasons": [
          "data readiness/master data signal matched"
        ],
        "execution_mode": "dry-run-first",
        "approval_required": true
      },
      {
        "agent": "A1-CI-Runtime-Gate",
        "reasons": [
          "required validation after repair"
        ],
        "execution_mode": "dry-run-first",
        "approval_required": true
      }
    ],
    "selected_agents": [
      "A2-Security-Regression-Gate",
      "A3-Backend-Critical-Path",
      "A4-Frontend-UAT-Smoke",
      "A5-Data-Readiness",
      "A1-CI-Runtime-Gate"
    ],
    "failure_category": null,
    "hard_constraints": [
      "no automatic production deploy",
      "no automatic DB write",
      "no automatic migration",
      "human approval required before code repair execution"
    ],
    "route_confidence": null,
    "source_repair_task_no": "BUGTASK-20260707-0010"
  },
  "createdAt": "2026-07-08T01:09:48.528Z",
  "createdBy": "admin",
  "moduleCode": "_____",
  "suggestedOwner": "_____",
  "repairGuardrails": {
    "autoRepairExecuted": false,
    "noProductionDeploy": true,
    "noDbWriteWithoutGate": true,
    "requiresHumanApproval": true
  },
  "acceptanceCriteria": "要求我的待办上方显示条数按照实际的待办任务数量进行显示",
  "agentPlanGeneratedAt": "2026-07-08T01:09:49.482Z",
  "agentPlanGeneratedBy": "admin",
  "agentExecutionApproval": {
    "approved": true,
    "approvedAt": "2026-07-08T01:09:51.119Z",
    "approvedBy": "admin",
    "approvalScope": "仅允许按当前 Agent 修复计划写入本地任务队列；不自动部署、不写数据库、不执行 migration。",
    "forbiddenActions": [
      "production deploy without separate approval",
      "database write without separate gate",
      "migration execution without separate gate",
      "push without release approval",
      "force push"
    ]
  }
}
```

## Local Evidence

- No local attachment downloaded. If screenshot evidence is required, HOLD and request evidence sync.

---

# Execution Guardrails

1. Do not merge.
2. Do not push.
3. Do not deploy.
4. Do not execute migrations.
5. Do not write to any database.
6. Do not modify the task board from inside the Agent task.
7. Stop immediately if the task requires files outside the allowed contract.
8. Stop immediately if migration/schema/entity/table/column changes are needed but not explicitly approved.
9. Report PASS / FAIL / PASS WITH CONDITIONS with exact evidence.

codex
我会先执行合约要求的工作区检查；如果目录、分支或初始状态不符合，就按规则停下并报告。
exec
/bin/zsh -lc pwd in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path

exec
/bin/zsh -lc 'git branch --show-current' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
w5-a3-backend-critical-path

exec
/bin/zsh -lc 'git log --oneline --decorate -8' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
99ba3d1d (HEAD -> w5-a3-backend-critical-path) fix: bug-20260707-0010 workflow todo counts
5904dfce (main) docs(ops): record baseline lifecycle report
bb316c59 feat(api): record A3-Backend-Critical-Path result
b22cf644 (w5-a4-frontend-uat-smoke) docs(ops): record baseline lifecycle report
e04a0016 fix: bug-20260707-0009 medicine stock refresh
6b5eae1e docs(ops): record baseline lifecycle report
a386c6db feat(web): record A4-Frontend-UAT-Smoke result
0c4b660b docs(ops): record baseline lifecycle report

exec
/bin/zsh -lc 'git status --short' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
codex
初始检查通过：目录和分支匹配，工作区干净。现在做 dry-run 诊断，先定位 `/workflow/todos` 对应的 API、计数逻辑和现有测试，不碰数据库、不跑迁移。
exec
/bin/zsh -lc 'find docs/ops -maxdepth 1 -type f | sort | tail -30' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
docs/ops/STORE_PAYMENT_PILOT_GATE_S1_PACKAGE.md
docs/ops/STORE_PAYMENT_PILOT_GATE_S1_PRECHECK_DECISION.md
docs/ops/STORE_PAYMENT_PROTECTED_ATTACHMENT_PLAN.md
docs/ops/STORE_PAYMENT_PROTECTED_ATTACHMENT_UAT_SMOKE_REPORT.md
docs/ops/STORE_PAYMENT_READINESS_A1_A2_A5_APPROVED_EXECUTION_REPORT.md
docs/ops/STORE_PAYMENT_READ_ONLY_DB_EVIDENCE_REPORT.md
docs/ops/STORE_PAYMENT_RECORD_PROOF_ATTACHMENT_UAT_FIXTURE_REPORT.md
docs/ops/STORE_PAYMENT_S1_APP_001_MIGRATION_EXECUTION_REPORT.md
docs/ops/STORE_PAYMENT_STAGING_BUSINESS_UAT_GUIDE.md
docs/ops/STORE_PAYMENT_STAGING_CONTROLLED_PILOT_DEPLOY_REPORT.md
docs/ops/STORE_PAYMENT_STAGING_DEPLOY_APPROVAL_MATRIX.md
docs/ops/STORE_PAYMENT_STAGING_DEPLOY_APPROVAL_PACKAGE.md
docs/ops/STORE_PAYMENT_STAGING_DEPLOY_APPROVAL_PREP_REPORT.md
docs/ops/STORE_PAYMENT_STAGING_DEPLOY_APPROVAL_V2.md
docs/ops/STORE_PAYMENT_STAGING_TARGET_BOOTSTRAP_GATE_REPORT.md
docs/ops/STORE_PAYMENT_STAGING_TARGET_REQUIRED_INPUTS.md
docs/ops/STORE_PAYMENT_STORE_CODE_NORMALIZATION_PLAN.md
docs/ops/SYS_DICT_DUPLICATE_AUDIT_AND_DEDUP_REPORT.md
docs/ops/V3E_EVOLUTION_CENTER_MIGRATION_PLAN.md
docs/ops/V3E_EVOLUTION_CENTER_REVIEW.md
docs/ops/WMS_DATASCOPE_WRITE_SCOPE_REMEDIATION_20260626.md
docs/ops/WMS_FRONTEND_ATOMIC_MENU_GATE_REMEDIATION_20260626.md
docs/ops/WORKFLOW_APPROVAL_ACTION_UX_REMEDIATION_20260626.md
docs/ops/WORKFLOW_APPROVER_DEFAULT_REMEDIATION_20260626.md
docs/ops/WORKFLOW_BIZ_REGISTRY_ATOMIC_MODULE_REMEDIATION_20260627.md
docs/ops/WORKFLOW_PERMISSION_ATOMIZATION_REMEDIATION_20260626.md
docs/ops/WORKFLOW_RBAC_ATOMIC_PERMISSION_REMEDIATION_20260625.md
docs/ops/bug-20260707-0002-a4-frontend-uat-smoke.md
docs/ops/bug-20260707-0009-a4-frontend-uat-report.md
docs/ops/bug-20260707-0010-a3-backend-critical-path.md

exec
/bin/zsh -lc "rg --files apps/api/src | rg 'workflow|approval|todo'" in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
apps/api/src/modules/workflow/workflow-sla.service.ts
apps/api/src/modules/workflow/workflow-notification.service.ts
apps/api/src/modules/workflow/condition-engine.service.ts
apps/api/src/modules/workflow/workflow-metrics.controller.ts
apps/api/src/modules/workflow/assignment-resolver.service.ts
apps/api/src/modules/workflow/workflow-sla.scheduler.ts
apps/api/src/modules/workflow/workflow.service.ts
apps/api/src/modules/workflow/workflow-runtime.controller.ts
apps/api/src/modules/workflow/workflow-form.controller.ts
apps/api/src/modules/workflow/workflow-task.controller.ts
apps/api/src/modules/workflow/workflow-definition.controller.ts
apps/api/src/modules/workflow/workflow-form-validation.service.ts
apps/api/src/modules/workflow/workflow-datasource.controller.ts
apps/api/src/modules/workflow/workflow-form-runtime.service.ts
apps/api/src/modules/workflow/workflow.module.ts
apps/api/src/modules/data-quality/services/workflow-health.service.ts
apps/api/src/modules/procurement-v2/entities/prc2-approval.entity.ts
apps/api/src/modules/approval-engine/entities/wf-approval-instance.entity.ts
apps/api/src/modules/approval-engine/entities/wf-approval-rule.entity.ts
apps/api/src/modules/approval-engine/entities/wf-approval-rule-step.entity.ts
apps/api/src/modules/approval-engine/entities/wf-approval-instance-step.entity.ts
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts
apps/api/src/modules/approval-engine/approval-engine.service.ts
apps/api/src/modules/approval-engine/approval-rules.controller.ts
apps/api/src/modules/approval-engine/approval-engine.module.ts
apps/api/src/modules/approval-engine/approval-engine.controller.ts
apps/api/src/modules/approval-engine/approval-rules.service.ts
apps/api/src/modules/approval-engine/dto/approval-rule.dto.ts
apps/api/src/common/interceptors/approval-hint.interceptor.ts

exec
/bin/zsh -lc "rg --files apps/api/test apps/api/src | rg 'spec|test' | rg 'workflow|approval|todo'" in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 exited 1 in 0ms:
exec
/bin/zsh -lc "rg -n \"workflow/todos|todos|待办|todo\" apps/api/src apps/web/src docs/ops -g '"'!node_modules'"'" in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 119ms:
apps/api/src/database/migrations/1782045418112-SeedWorkflowAtomicMenus.ts:13:        ('MENU_WORKFLOW_TODO',    '审批待办',   NULL, 'WORKFLOW', 'MENU_WORKFLOW', 10, 'ClipboardList', '/workflow/todos'),

codex
诊断里已经看到一个同号修复报告和同号提交，说明当前分支可能已包含该修复。我会继续核对实现是否真的覆盖“列表有 1 条但计数 0”的源头，再决定是否需要补改。
exec
/bin/zsh -lc "sed -n '880,1045p' apps/api/src/modules/workflow/workflow.service.ts" in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
       LEFT JOIN sys_user u ON u.user_id=t.assignee_user_id
       LEFT JOIN sys_role r ON r.role_code=t.assignee_role_code
       LEFT JOIN (
         SELECT instance_id,
                COUNT(*) FILTER (WHERE action='URGE')::int AS urge_count,
                MAX(created_at) FILTER (WHERE action='URGE') AS last_urged_at
         FROM wf_task_action
         GROUP BY instance_id
       ) a ON a.instance_id=i.id
       WHERE t.status='TODO'
         AND ($1::boolean OR i.starter_id=$2 OR t.assignee_user_id=$2 OR t.assignee_role_code = ANY($3::text[]) OR EXISTS (
           SELECT 1 FROM wf_cc_task c
           WHERE c.instance_id=i.id
             AND (c.receiver_user_id=$2 OR c.receiver_role_code = ANY($3::text[]))
         ))
       ORDER BY (t.due_at IS NOT NULL AND t.due_at < CURRENT_TIMESTAMP) DESC,
                t.due_at ASC NULLS LAST,
                t.created_at ASC,
                t.id ASC
       LIMIT $4 OFFSET $5`,
      [this.isAdmin(user), user.userId || 0, roles, limit, offset],
    );
    return { code: 200, data: rows, total: rows.length };
  }

  async listCcTasks(user: WorkflowUser, query: QueryDto) {
    const { limit, offset } = this.page(query);
    const roles = this.userRoles(user);
    const rows = await this.em.query(
      `SELECT c.*, i.title, i.instance_no, i.status AS instance_status, i.started_at, i.starter_name,
              i.form_data_json, fv.schema_json AS form_schema_json, d.name AS definition_name,
              u.real_name AS receiver_user_name, r.role_name_zh AS receiver_role_name
       FROM wf_cc_task c
       JOIN wf_instance i ON i.id=c.instance_id
       LEFT JOIN wf_definition d ON d.id=i.definition_id
       LEFT JOIN wf_form_version fv ON fv.id=i.form_version_id
       LEFT JOIN sys_user u ON u.user_id=c.receiver_user_id
       LEFT JOIN sys_role r ON r.role_code=c.receiver_role_code
       WHERE $1::boolean OR c.receiver_user_id=$2 OR c.receiver_role_code = ANY($3::text[])
       ORDER BY COALESCE(c.read_at, TIMESTAMP '1970-01-01') ASC, c.created_at DESC, c.id DESC
       LIMIT $4 OFFSET $5`,
      [this.isAdmin(user), user.userId || 0, roles, limit, offset],
    );
    return { code: 200, data: rows, total: rows.length };
  }

  async getTaskSummary(user: WorkflowUser) {
    const roles = this.userRoles(user);
    const isAdmin = this.isAdmin(user);
    const [todoCount, ccRows, overdueCount, runningRows, startedRows] = await Promise.all([
      this.countUnifiedTodoTasks(user),
      // CC/running 仍属通用 WorkflowEngine；todo/overdue 采用 /workflow/todos 的统一待办口径。
      this.em.query(
        `SELECT COUNT(*)::int AS count
         FROM wf_cc_task c
         WHERE c.read_at IS NULL
           AND ($1::boolean OR c.receiver_user_id=$2 OR c.receiver_role_code = ANY($3::text[]))`,
        [isAdmin, user.userId || 0, roles],
      ),
      this.countUnifiedTodoTasks(user, true),
      this.em.query(
        `SELECT COUNT(*)::int AS count
         FROM wf_instance i
         WHERE i.status='RUNNING'
           AND ($1::boolean OR i.starter_id=$2 OR EXISTS (
             SELECT 1 FROM wf_task t
             WHERE t.instance_id=i.id
               AND (t.assignee_user_id=$2 OR t.assignee_role_code = ANY($3::text[]))
           ) OR EXISTS (
             SELECT 1 FROM wf_cc_task c
             WHERE c.instance_id=i.id
               AND (c.receiver_user_id=$2 OR c.receiver_role_code = ANY($3::text[]))
           ))`,
        [isAdmin, user.userId || 0, roles],
      ),
      this.em.query(
        `SELECT COUNT(*)::int AS count
         FROM wf_instance
         WHERE starter_id=$1 AND status='RUNNING'`,
        [user.userId || 0],
      ),
    ]);
    return {
      code: 200,
      data: {
        todo: todoCount,
        ccUnread: Number(ccRows[0]?.count || 0),
        overdueTodo: overdueCount,
        running: Number(runningRows[0]?.count || 0),
        startedRunning: Number(startedRows[0]?.count || 0),
      },
    };
  }

  async markCcRead(id: number, user: WorkflowUser) {
    const rows = await this.em.query(`SELECT * FROM wf_cc_task WHERE id=$1`, [id]);
    const cc = rows[0];
    if (!cc) throw new NotFoundException('workflow cc task not found');
    await this.assertCcVisible(cc, user);
    const updated = await this.em.query(
      `UPDATE wf_cc_task SET read_at=COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id=$1 RETURNING *`,
      [id],
    );
    return { code: 200, data: updated[0] };
  }

  async approveTask(taskId: number, body: any, user: WorkflowUser) {
    return this.completeTask(taskId, 'APPROVE', body, user);
  }

  async rejectTask(taskId: number, body: any, user: WorkflowUser) {
    return this.completeTask(taskId, 'REJECT', body, user);
  }

  async commentTask(taskId: number, body: any, user: WorkflowUser) {
    const task = await this.findTask(taskId);
    await this.assertTaskVisible(task, user);
    await this.writeAction(task.instance_id, taskId, 'COMMENT', user, task.node_id, task.node_id, { comment: body?.comment || '' });
    return { code: 200, data: { success: true } };
  }

  async transferTask(taskId: number, body: any, user: WorkflowUser) {
    const task = await this.findTask(taskId);
    await this.assertTaskOwner(task, user);
    if (!body?.assignee_user_id && !body?.assignee_role_code) {
      throw new BadRequestException('assignee_user_id or assignee_role_code required');
    }
    await this.em.query(
      `UPDATE wf_task SET assignee_user_id=$2, assignee_role_code=$3 WHERE id=$1`,
      [taskId, body.assignee_user_id || null, body.assignee_role_code || null],
    );
    await this.writeAction(task.instance_id, taskId, 'TRANSFER', user, task.node_id, task.node_id, body);
    return { code: 200, data: { success: true } };
  }

  /**
   * WF-UAT-1: 退回（退到上一节点）— 标当前 task DONE/RETURN，写 RETURN action，
   * instance.current_node_id 回退到上节点；最小可用版本（不在 graph 上深度推演）。
   */
  async returnTask(taskId: number, body: any, user: WorkflowUser) {
    const task = await this.findTask(taskId);
    await this.assertTaskOwner(task, user);
    if (task.status !== 'TODO') throw new BadRequestException('task is not TODO');
    const targetNode: string | null = body?.target_node_id || null;
    await this.em.query(
      `UPDATE wf_task SET status='DONE', action_result='RETURN', completed_at=CURRENT_TIMESTAMP WHERE id=$1`,
      [taskId],
    );
    await this.em.query(
      `UPDATE wf_task SET status='CANCELED', action_result='CANCELED', completed_at=CURRENT_TIMESTAMP
       WHERE instance_id=$1 AND node_id=$2 AND status='TODO' AND id<>$3`,
      [task.instance_id, task.node_id, taskId],
    );
    if (targetNode) {
      await this.em.query(
        `UPDATE wf_instance SET current_node_id=$2, updated_at=CURRENT_TIMESTAMP WHERE id=$1`,
        [task.instance_id, targetNode],
      );
    }
    await this.writeAction(task.instance_id, taskId, 'RETURN', user, task.node_id, targetNode, {
      comment: body?.comment || '',
      target_node_id: targetNode,
    });
    return { code: 200, data: { success: true } };
  }


exec
/bin/zsh -lc "sed -n '1360,1435p' apps/api/src/modules/workflow/workflow.service.ts" in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
             i.form_data_json,
             fv.schema_json AS form_schema_json,
             d.name AS definition_name,
             'WORKFLOW_ENGINE'::text AS task_source
           FROM wf_task t
           JOIN wf_instance i ON i.id=t.instance_id
           LEFT JOIN wf_definition d ON d.id=i.definition_id
           LEFT JOIN wf_form_version fv ON fv.id=i.form_version_id
           WHERE t.status='TODO'
             AND (t.assignee_user_id=$1 OR t.assignee_role_code = ANY($2::text[]))

           UNION ALL

           SELECT
             s.id,
             COALESCE('AE-' || i2.instance_no, 'AE-' || s.id::text) AS task_no,
             i2.id AS instance_id,
             ('approval-step-' || s.step_no::text) AS node_id,
             COALESCE(s.approver_name, s.approver_role, '审批') AS node_name,
             s.approver_role AS assignee_role_code,
             s.approver_user_id AS assignee_user_id,
             'TODO'::text AS status,
             NULL::text AS action_result,
             s.due_at,
             NULL::timestamptz AS completed_at,
             i2.started_at AS created_at,
             COALESCE(i2.subject, i2.biz_no, i2.instance_no) AS title,
             i2.instance_no,
             i2.status AS instance_status,
             i2.started_at,
             COALESCE(u.real_name, u.username, i2.started_by::text) AS starter_name,
             NULL::jsonb AS form_data_json,
             NULL::jsonb AS form_schema_json,
             '审批引擎'::text AS definition_name,
             'APPROVAL_ENGINE'::text AS task_source
           FROM wf_approval_instance_steps s
           JOIN wf_approval_instances i2 ON i2.id = s.instance_id
           LEFT JOIN sys_user u ON u.user_id = i2.started_by
           WHERE s.status = 'PENDING'
             AND i2.status = 'PENDING'
             AND s.step_no = i2.current_step_no
             AND ${this.approvalTodoAssigneeWhere('$1', '$2')}
             ${dataScopeWhere}
         ) todo
        ORDER BY todo.created_at DESC, todo.id DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );
  }

  private async countUnifiedTodoTasks(user: WorkflowUser, overdueOnly = false): Promise<number> {
    const params: any[] = [user.userId || 0, this.userRoles(user)];
    const dataScopeWhere = this.approvalTodoDataScopeWhere(params, 'i');
    const wfOverdueWhere = overdueOnly ? `AND t.due_at IS NOT NULL AND t.due_at < CURRENT_TIMESTAMP` : '';
    const aeOverdueWhere = overdueOnly ? `AND s.due_at IS NOT NULL AND s.due_at < CURRENT_TIMESTAMP` : '';
    const rows = await this.em.query(
      `SELECT (
          SELECT COUNT(*)::int
            FROM wf_task t
           WHERE t.status='TODO'
             AND (t.assignee_user_id=$1 OR t.assignee_role_code = ANY($2::text[]))
             ${wfOverdueWhere}
        ) + (
          SELECT COUNT(*)::int
            FROM wf_approval_instance_steps s
            JOIN wf_approval_instances i ON i.id = s.instance_id
           WHERE s.status = 'PENDING'
             AND i.status = 'PENDING'
             AND s.step_no = i.current_step_no
             AND ${this.approvalTodoAssigneeWhere('$1', '$2')}
             ${aeOverdueWhere}
             ${dataScopeWhere}
        ) AS count`,
      params,
    );
    return Number(rows[0]?.count || 0);

exec
/bin/zsh -lc "sed -n '1,130p' apps/api/src/modules/workflow/workflow-runtime.controller.ts" in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
exec
/bin/zsh -lc "sed -n '1,120p' apps/api/src/modules/workflow/workflow-task.controller.ts" in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { WorkflowService } from './workflow.service';
import { ApprovalEngineService } from '../approval-engine/approval-engine.service';

@Controller('api/workflow')
@UseGuards(MenuGuard, DataScopeGuard)
export class WorkflowRuntimeController {
  constructor(
    private readonly workflow: WorkflowService,
    private readonly approvalEngine: ApprovalEngineService,
    @InjectDataSource()
    private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  private currentUser(): { userId: string; roles: string[] } {
    const u = this.cls.get('user') as any;
    return {
      userId: String(u?.userId ?? u?.id ?? '0'),
      roles:  u?.roles ?? (u?.role ? [u.role] : []),
    };
  }

  /**
   * 统一任务入口 — Phase B
   * 聚合 ApprovalEngine 待办 + WorkflowEngine wf_task
   * 支持分页、过滤、关键字搜索
   */
  @Get('my-tasks')
  @RequireMenu('MENU_WORKFLOW_TODO', 'V')
  async getMyTasks(@Query() q: {
    page?:       string;
    pageSize?:   string;
    taskSource?: string;  // APPROVAL_ENGINE | WORKFLOW_ENGINE
    bizType?:    string;
    keyword?:    string;
  }) {
    const page     = Math.max(1, Number(q.page     ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(q.pageSize ?? 20)));
    const { userId, roles } = this.currentUser();

    // ── Phase A: ApprovalEngine 待办 ─────────────────────────────────────
    let aeTasks: any[] = [];
    if (!q.taskSource || q.taskSource === 'APPROVAL_ENGINE') {
      const rows: any[] = await this.approvalEngine.getMyTodos();
      aeTasks = rows.map(t => ({
        taskSource:    'APPROVAL_ENGINE',
        taskId:        String(t.step_id),
        instanceId:    String(t.instance_id),
        instanceNo:    t.instance_no ?? null,
        bizType:       t.biz_type,
        bizId:         String(t.biz_id),
        bizNo:         t.biz_no ?? null,
        subject:       t.subject ?? null,
        amount:        t.amount != null ? Number(t.amount) : null,
        currencyCode:  t.currency_code ?? null,
        companyCode:   t.company_code ?? null,
        companyName:   t.company_name ?? null,
        projectCode:   t.project_code ?? null,
        projectName:   t.project_name ?? null,
        requiredRole:     t.approver_role,
        stepNo:           t.step_no ?? 1,
        totalSteps:       t.total_steps ?? 1,
        currentStepNo:    t.current_step_no ?? 1,
        startedBy:        t.started_by ?? null,
        status:           t.step_status,
        createdAt:        t.started_at,
        dueAt:            t.due_at ?? null,
        isOverdue:        t.is_overdue ?? false,
        escalationLevel:  t.escalation_level ?? 0,
      }));
    }

    // ── Phase B: WorkflowEngine wf_task ──────────────────────────────────
    let wfTasks: any[] = [];
    if (!q.taskSource || q.taskSource === 'WORKFLOW_ENGINE') {
      const wfRows: any[] = await this.ds.query(`
        SELECT
          t.id            AS task_id,
          t.task_no,
          t.node_id,
          t.node_name,
          t.assignee_role_code AS required_role,
          t.status        AS task_status,
          t.created_at,
          i.id            AS instance_id,
          i.instance_no,
          i.business_type AS biz_type,
          i.business_id   AS biz_id,
          i.title         AS subject,
          i.starter_id    AS started_by,
          i.starter_name,
          i.started_at
        FROM wf_task t
        JOIN wf_instance i ON i.id = t.instance_id
        WHERE t.status = 'TODO'
          AND (
            t.assignee_user_id = $1
            OR t.assignee_role_code = ANY($2::varchar[])
          )
        ORDER BY t.created_at ASC
      `, [Number(userId), roles]);

      wfTasks = wfRows.map(t => ({
        taskSource:    'WORKFLOW_ENGINE',
        taskId:        String(t.task_id),
        instanceId:    String(t.instance_id),
        instanceNo:    t.instance_no ?? null,
        bizType:       t.biz_type ?? null,
        bizId:         t.biz_id   ?? null,
        bizNo:         null,
        subject:       t.subject  ?? null,
        amount:        null,
        currencyCode:  null,
        companyCode:   null,
        companyName:   null,
        projectCode:   null,
        projectName:   null,
        requiredRole:  t.required_role ?? null,
        stepNo:        null,
        totalSteps:    null,
        currentStepNo: null,
        startedBy:     t.started_by ? String(t.started_by) : null,
        status:        t.task_status,
        createdAt:     t.started_at ?? t.created_at,

 succeeded in 0ms:
import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { MenuGuard, RequireMenu } from '../../common/guards/menu.guard';
import { DataScopeGuard } from '../org/guards/data-scope.guard';
import { WorkflowService } from './workflow.service';

@Controller('api/workflow/tasks')
@UseGuards(MenuGuard, DataScopeGuard)
export class WorkflowTaskController {
  constructor(private readonly workflow: WorkflowService) {}

  @Get('todo')
  @RequireMenu('MENU_WORKFLOW_TODO', 'V')
  todo(@Query() query: any, @Req() req: any) {
    return this.workflow.listTodo(req.user, query);
  }

  @Get('done')
  @RequireMenu('MENU_WORKFLOW_HISTORY', 'V')
  done(@Query() query: any, @Req() req: any) {
    return this.workflow.listDone(req.user, query);
  }

  @Get('cc')
  @RequireMenu('MENU_WORKFLOW_TODO', 'V')
  cc(@Query() query: any, @Req() req: any) {
    return this.workflow.listCcTasks(req.user, query);
  }

  @Get('summary')
  @RequireMenu('MENU_WORKFLOW_TODO', 'V')
  summary(@Req() req: any) {
    return this.workflow.getTaskSummary(req.user);
  }

  @Get('monitor')
  @RequireMenu('MENU_WORKFLOW_METRICS', 'X')
  monitor(@Query() query: any, @Req() req: any) {
    return this.workflow.listMonitorTasks(req.user, query);
  }

  @Post('cc/:id/read')
  @RequireMenu('MENU_WORKFLOW_NOTIFY', 'E')
  readCc(@Param('id') id: string, @Req() req: any) {
    return this.workflow.markCcRead(Number(id), req.user);
  }

  @Post(':id/approve')
  @RequireMenu('MENU_WORKFLOW_TODO', 'A')
  approve(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.approveTask(Number(id), body, req.user);
  }

  @Post(':id/reject')
  @RequireMenu('MENU_WORKFLOW_TODO', 'A')
  reject(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.rejectTask(Number(id), body, req.user);
  }

  @Post(':id/transfer')
  @RequireMenu('MENU_WORKFLOW_TODO', 'E')
  transfer(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.transferTask(Number(id), body, req.user);
  }

  @Post(':id/comment')
  @RequireMenu('MENU_WORKFLOW_TODO', 'E')
  comment(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.commentTask(Number(id), body, req.user);
  }

  // WF-UAT-1: 退回
  @Post(':id/return')
  @RequireMenu('MENU_WORKFLOW_TODO', 'A')
  return(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.returnTask(Number(id), body, req.user);
  }

  // WF-UAT-1: 加签
  @Post(':id/countersign')
  @RequireMenu('MENU_WORKFLOW_TODO', 'A')
  countersign(@Param('id') id: string, @Body() body: any, @Req() req: any) {
    return this.workflow.countersignTask(Number(id), body, req.user);
  }
}

exec
/bin/zsh -lc "sed -n '1010,1055p' apps/api/src/modules/approval-engine/approval-engine.service.ts" in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
    mgr: EntityManager,
  ): Promise<void> {
    const table = this.bizRegistry.getTableName(bizType);
    if (!table) return;
    await mgr.query(
      `UPDATE ${table} SET status = $1, updated_at = NOW() WHERE id = $2`,
      [status, bizId],
    );
  }

  /** 查询待办数量（用于 badge 展示） */
  async getTodosCount(): Promise<number> {
    const { userId, roles } = this.currentUser();
    const rows = await this.ds.query(
      `SELECT COUNT(*) AS cnt FROM wf_approval_instance_steps s
       JOIN wf_approval_instances i ON i.id = s.instance_id
       WHERE s.status='PENDING' AND i.status='PENDING'
         AND s.step_no = i.current_step_no
         AND (s.approver_role = ANY($1::varchar[]) OR s.approver_user_id = $2
              OR (s.allow_admin_override = true AND 'ROLE_ADMIN' = ANY($1::varchar[])))`,
      [roles, userId],
    );
    return parseInt(rows[0]?.cnt ?? '0', 10);
  }
}

exec
/bin/zsh -lc "sed -n '1,180p' docs/ops/bug-20260707-0010-a3-backend-critical-path.md" in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
# BUG-20260707-0010 A3 Backend Repair Report

## Result

GO

`/workflow/todos` visible task count and Operations/Home todo count now use the same backend todo sources:

- WorkflowEngine `wf_task` assigned to current user or current user roles.
- ApprovalEngine `wf_approval_instance_steps` assigned to current user, current user roles, or the existing stuck-task `ROLE_ADMIN` override rule.

This fixes the reported mismatch where an ApprovalEngine purchase approval was visible in the list while the top count and operations todo count showed `0`.

## Changed Files

- `apps/api/src/modules/workflow/workflow.service.ts`
- `docs/ops/bug-20260707-0010-a3-backend-critical-path.md`

## APIs Covered

- `GET /api/workflow/tasks/summary`
  - `data.todo` now counts unified visible todos.
  - `data.overdueTodo` now counts unified visible overdue todos.
- `GET /api/workflow/tasks/todo`
  - now returns unified visible todos for Operations/Home short list consumers.
- `GET /api/workflow/my-tasks`
  - unchanged, used as the reference behavior for visible todo semantics.

## RBAC / DataScope / Audit

- RBAC: unchanged. Existing `@RequireMenu('MENU_WORKFLOW_TODO', 'V')` guards remain in place.
- DataScope: preserved for ApprovalEngine todos via existing CLS `dataScope` company filter semantics.
- Admin override: preserved with the existing ApprovalEngine stuck-task-only `ROLE_ADMIN` override condition.
- Audit: no write action added. This is read-only query repair, so no operation audit row is created.
- Attachment ACL: not touched.

## Validation

- `cd apps/api && ./node_modules/.bin/tsc --noEmit` -> PASS

## Frozen Items Statement

No migrations, schema/entity/table/column changes, database writes, production deploy, push, frontend changes, or task-board modifications were performed.

## Blockers

None for backend compile validation.

Runtime verification against production data was not performed because the task contract forbids production database writes/deploy and no local synced screenshot/attachment evidence was available.

## Next Review Request

A4/A1 should smoke `/workflow/todos` and the Operations/Home todo badge with an account that has at least one ApprovalEngine todo. Expected: the count equals the visible unified todo list count.

codex
当前实现已把 `/api/workflow/tasks/summary` 和 `/api/workflow/tasks/todo` 改成统一口径。我还要核对页面实际用的 `/api/workflow/my-tasks` 返回结构，确认这不是前端把 `total` 字段读错造成的。
exec
/bin/zsh -lc "sed -n '130,230p' apps/web/src/lib/workflow-api.ts" in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
}

export interface WorkflowAnalytics {
  days: number;
  summary: {
    total: number;
    running: number;
    approved: number;
    rejected: number;
    canceled: number;
    startedToday: number;
    completedToday: number;
    avgCompleteHours: number;
    approvalRate: number;
  };
  statuses: Array<{ status: string; count: number }>;
  definitions: Array<{
    definition_id?: number;
    definition_name?: string;
    category?: string;
    total: number;
    running: number;
    approved: number;
    avg_complete_hours: number;
  }>;
  bottlenecks: Array<{
    node_id?: string;
    node_name?: string;
    todo_count: number;
    overdue_count: number;
    avg_waiting_hours: number;
  }>;
  trend: Array<{ day: string; started: number; approved: number; rejected: number }>;
}

export interface WorkflowInstance {
  id: number;
  instance_no: string;
  title: string;
  status: string;
  business_type?: string;
  current_node_id?: string;
  starter_name: string;
  form_data_json?: Record<string, unknown>;
  form_schema_json?: WorkflowFormSchema;
  tasks?: WorkflowTask[];
  actions?: Record<string, unknown>[];
  started_at?: string;
  ended_at?: string;
  created_at: string;
}

export const workflowApi = {
  definitions: () => req<WorkflowList<WorkflowDefinition>>("/definitions"),
  createDefinition: (data: Record<string, unknown>) =>
    req<WorkflowOne<WorkflowDefinition>>("/definitions", { method: "POST", body: JSON.stringify(data) }),
  generateIndustryTemplates: () =>
    req<WorkflowOne<Record<string, unknown>>>("/definitions/industry-templates/generate", { method: "POST", body: JSON.stringify({}) }),
  createDefinitionFromDataSource: (data: Record<string, unknown>) =>
    req<WorkflowOne<Record<string, unknown>>>("/definitions/from-data-source", { method: "POST", body: JSON.stringify(data) }),
  cloneDefinition: (id: number, data: Record<string, unknown>) =>
    req<WorkflowOne<WorkflowDefinition>>(`/definitions/${id}/clone`, { method: "POST", body: JSON.stringify(data) }),
  publishDefinition: (id: number, data: Record<string, unknown>) =>
    req<WorkflowOne<Record<string, unknown>>>(`/definitions/${id}/publish`, { method: "POST", body: JSON.stringify(data) }),
  definitionDesigner: (id: number) => req<WorkflowOne<Record<string, unknown>>>(`/definitions/${id}/designer`),

  forms: () => req<WorkflowList<WorkflowForm>>("/forms"),
  createForm: (data: Record<string, unknown>) =>
    req<WorkflowOne<WorkflowForm>>("/forms", { method: "POST", body: JSON.stringify(data) }),
  createFormFromDataSource: (data: Record<string, unknown>) =>
    req<WorkflowOne<Record<string, unknown>>>("/forms/from-data-source", { method: "POST", body: JSON.stringify(data) }),
  publishForm: (id: number, data: Record<string, unknown>) =>
    req<WorkflowOne<Record<string, unknown>>>(`/forms/${id}/publish`, { method: "POST", body: JSON.stringify(data) }),
  formDesigner: (id: number) => req<WorkflowOne<Record<string, unknown>>>(`/forms/${id}/designer`),

  dataSources: () => req<WorkflowList<Record<string, unknown>>>("/data-sources"),
  createDataSource: (data: Record<string, unknown>) =>
    req<WorkflowOne<Record<string, unknown>>>("/data-sources", { method: "POST", body: JSON.stringify(data) }),
  syncDefaultDataSources: () =>
    req<WorkflowList<Record<string, unknown>>>("/data-sources/sync-defaults", { method: "POST", body: JSON.stringify({}) }),
  refreshDataSourceMetadata: () =>
    req<WorkflowList<Record<string, unknown>>>("/data-sources/refresh-metadata", { method: "POST", body: JSON.stringify({}) }),
  dataSourceFieldSuggestions: (code: string) =>
    req<WorkflowOne<Record<string, unknown>>>(`/data-sources/${encodeURIComponent(code)}/field-suggestions`),
  previewDataSource: (data: Record<string, unknown>) =>
    req<WorkflowList<Record<string, unknown>>>("/data-sources/preview", { method: "POST", body: JSON.stringify(data) }),

  start: (data: Record<string, unknown>) =>
    req<WorkflowOne<WorkflowInstance>>("/start", { method: "POST", body: JSON.stringify(data) }),
  analytics: (days = 30) => req<WorkflowOne<WorkflowAnalytics>>(`/analytics?days=${encodeURIComponent(String(days))}`),
  instances: (status?: string) => req<WorkflowList<WorkflowInstance>>(`/instances${status ? `?status=${encodeURIComponent(status)}` : ""}`),
  instance: (id: number) => req<WorkflowOne<WorkflowInstance>>(`/instances/${id}`),
  cancelInstance: (id: number, comment = "") =>
    req<WorkflowOne<WorkflowInstance>>(`/instances/${id}/cancel`, { method: "POST", body: JSON.stringify({ comment }) }),
  urgeInstance: (id: number, comment = "") =>
    req<WorkflowOne<{ success: boolean; urgedTaskCount: number }>>(`/instances/${id}/urge`, { method: "POST", body: JSON.stringify({ comment }) }),

  todo: () => req<WorkflowList<WorkflowTask>>("/tasks/todo"),
  done: () => req<WorkflowList<WorkflowTask>>("/tasks/done"),
  cc: () => req<WorkflowList<WorkflowCcTask>>("/tasks/cc"),
  taskSummary: () => req<WorkflowOne<WorkflowTaskSummary>>("/tasks/summary"),

exec
/bin/zsh -lc "sed -n '260,380p' 'apps/web/src/app/(admin)/workflow/todos/page.tsx'" in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
    })
  });
  return res.json();
}

// ── 组件 ─────────────────────────────────────────────────────────────────────
export default function ApprovalTodosPage() {
  const { t } = useLanguage();
  const toast = useToast();
  const searchParams = useSearchParams();
  const [resp, setResp] = useState<TaskListResponse>({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20
  });
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<UnifiedTask | null>(null);
  const [detail, setDetail] = useState<InstanceDetail | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [decision, setDecision] = useState<ApprovalDecision>("approve");
  const [submitting, setSubmitting] = useState(false);
  const [candidates, setCandidates] = useState<ReassignCandidate[]>([]);
  const [pickedTo, setPickedTo] = useState("");
  const [reassignLoading, setReassignLoading] = useState(false);

  // 筛选状态
  const [taskSource, setTaskSource] = useState("");
  const [bizType, setBizType] = useState("");
  const [keyword, setKeyword] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 20;
  const load = useCallback(async (params?: {
    taskSource?: string;
    bizType?: string;
    keyword?: string;
    page?: number;
  }) => {
    setLoading(true);
    try {
      const r = await fetchTodos({
        page: params?.page ?? page,
        pageSize: PAGE_SIZE,
        taskSource: (params?.taskSource !== undefined ? params.taskSource : taskSource) || undefined,
        bizType: (params?.bizType !== undefined ? params.bizType : bizType) || undefined,
        keyword: (params?.keyword !== undefined ? params.keyword : keyword) || undefined
      });
      setResp(r);
    } finally {
      setLoading(false);
    }
  }, [page, taskSource, bizType, keyword]);
  useEffect(() => {
    load();
  }, [load]);
  // 消息中心深链：/workflow/todos?instanceId=<id> 直接打开该审批实例详情，
  // 不依赖 my-tasks 列表是否含该条（修复「点通知进来空白」——通知带的是具体实例，
  // 但列表受 DataScope/分页/已被同角色他人处理 等过滤，可能查不到对应条目）。
  useEffect(() => {
    const focusId = searchParams.get("instanceId");
    if (!focusId) return;
    let alive = true;
    (async () => {
      const d = await fetchDetail(focusId);
      if (!alive) return;
      if (!d) {
        toast.error(t('ui.该审批记录不存在或无权查看','该审批记录不存在或无权查看'));
        return;
      }
      // 由实例详情合成最小 UnifiedTask，供抽屉头部与审批/拒绝/转交动作复用
      const synthetic: UnifiedTask = {
        taskSource: "APPROVAL_ENGINE",
        taskId: String(d.id),
        instanceId: String(d.id),
        instanceNo: d.instanceNo ?? null,
        bizType: d.bizType,
        bizId: d.bizId,
        bizNo: d.bizNo ?? null,
        subject: d.subject ?? null,
        amount: d.amount ?? null,
        currencyCode: d.currencyCode ?? null,
        companyCode: d.companyCode ?? null,
        companyName: d.companyName ?? null,
        projectCode: d.projectCode ?? null,
        projectName: d.projectName ?? null,
        requiredRole: "",
        stepNo: d.currentStepNo ?? null,
        totalSteps: d.totalSteps ?? null,
        currentStepNo: d.currentStepNo ?? null,
        startedBy: null,
        status: d.status,
        createdAt: d.startedAt ?? "",
      };
      setSelected(synthetic);
      setComment("");
      setDecision("approve");
      setCandidates([]);
      setPickedTo("");
      setDetail(d);
      setDrawerOpen(true);
    })();
    return () => { alive = false; };
    // 仅在挂载/深链变化时触发；toast/t 稳定引用，无需入依赖
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const applyFilter = () => {
    setPage(1);
    load({
      page: 1,
      taskSource,
      bizType,
      keyword
    });
  };
  const resetFilter = () => {
    setTaskSource("");
    setBizType("");
    setKeyword("");
    setPage(1);
    load({

exec
/bin/zsh -lc "sed -n '120,260p' 'apps/web/src/app/(admin)/workflow/todos/page.tsx'" in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}
function fmtAmount(amount: number | string | null, currency: string | null) {
  if (amount == null) return "-";
  const n = Number(amount);
  if (isNaN(n)) return "-";
  return `${n.toLocaleString("zh-CN", {
    maximumFractionDigits: 0
  })} ${currency ?? ""}`;
}
function StatusBadge({
  status
}: {
  status: string;
}) {
  const map: Record<string, {
    label: string;
    color: string;
  }> = {
    PENDING: {
      label: "待审批",
      color: "var(--status-warning)"
    },
    APPROVED: {
      label: "已通过",
      color: "var(--status-success)"
    },
    REJECTED: {
      label: "已拒绝",
      color: "var(--status-danger)"
    },
    SKIPPED: {
      label: "已跳过",
      color: "var(--text-disabled)"
    },
    TODO: {
      label: "待处理",
      color: "var(--status-warning)"
    }
  };
  const cfg = map[status] ?? {
    label: status,
    color: "var(--text-disabled)"
  };
  return <span style={{
    color: cfg.color,
    fontWeight: 600,
    fontSize: 12
  }}>{cfg.label}</span>;
}
function TaskSourceBadge({
  source
}: {
  source: string;
}) {
  const isAE = source === "APPROVAL_ENGINE";
  return <span style={{
    display: "inline-flex",
    alignItems: "center",
    gap: 3,
    fontSize: 10,
    fontWeight: 600,
    padding: "2px 6px",
    borderRadius: 4,
    background: isAE ? "var(--status-warning-bg-light)" : "var(--status-info-bg)",
    color: isAE ? "var(--status-warning)" : "var(--color-accent)"
  }}>
      {isAE ? "审批引擎" : "通用流程"}
    </span>;
}

// ── API ───────────────────────────────────────────────────────────────────────
async function fetchTodos(params: {
  page: number;
  pageSize: number;
  taskSource?: string;
  bizType?: string;
  keyword?: string;
}): Promise<TaskListResponse> {
  const p = new URLSearchParams();
  p.set("page", String(params.page));
  p.set("pageSize", String(params.pageSize));
  if (params.taskSource) p.set("taskSource", params.taskSource);
  if (params.bizType) p.set("bizType", params.bizType);
  if
```
