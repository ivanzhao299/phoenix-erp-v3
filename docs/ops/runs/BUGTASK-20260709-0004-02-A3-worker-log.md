# Agent Worker Log

| Field | Value |
| --- | --- |
| Task ID | BUGTASK-20260709-0004-02-A3 |
| Agent | A3-Backend-Critical-Path |
| Dry run | No |
| Exit code | 0 |

## Command

```bash
/usr/local/bin/node scripts/ops/run-agent-task.mjs --agent A3-Backend-Critical-Path --worktree /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path --prompt docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md --task-contract docs/ops/runs/BUGTASK-20260709-0004-02-A3-contract.md --assembled-prompt-output docs/ops/runs/BUGTASK-20260709-0004-02-A3-worker-assembled-prompt.md --require-approval-token APPROVE_AGENT_EXECUTION --skip-baseline-autopilot --allow-ops-runtime-dirty
```

## Stdout

```text
Agent: A3-Backend-Critical-Path
Worktree: /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
Branch: w5-a3-backend-critical-path
Prompt: docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md
Task contract: docs/ops/runs/BUGTASK-20260709-0004-02-A3-contract.md
Assembled prompt: docs/ops/runs/BUGTASK-20260709-0004-02-A3-worker-assembled-prompt.md
Assembled prompt chars: 23842
Codex command: codex exec -C /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path --sandbox workspace-write -
Codex timeout ms: 600000
Run log: /Users/mac/phoenix-erp-worktrees/codex-orchestrator/docs/ops/runs/2026-07-09T08-31-53-940Z-A3-Backend-Critical-Path.md
PASS / GO.

A3 后端复核完成。当前分支已包含同症状修复：`GET /api/workflow/my-tasks` 现在由 `WorkflowService.listMyTasks()` 用同一批过滤后的统一待办结果生成 `items` 和 `total`，覆盖 ApprovalEngine 待办“列表有 1 条但 total 为 0”的口径漂移。

本次只新增结果报告并提交：
[bug-20260709-0004-a3-backend-critical-path.md](/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path/docs/ops/bug-20260709-0004-a3-backend-critical-path.md)

验证：
- `cd apps/api && pnpm test -- workflow.service.spec.ts --runInBand` -> PASS，3 tests
- `cd apps/api && ./node_modules/.bin/tsc --noEmit` -> PASS

Commit:
`5c0a4720 docs(ops): add bug 20260709 0004 backend report`

未执行 push、部署、迁移、数据库写入，也未改前端或 schema。
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
session id: 019f45fe-c7a6-7920-b25c-bb8d0780c1f1
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

Source bug: BUG-20260709-0004
Source repair task: BUGTASK-20260709-0004
Assigned agent: A3-Backend-Critical-Path

## Issue

审批中心-我的待办，审批待办中有一条未审批的记录，但是上方显示共0条

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
  "bugNo": "BUG-20260709-0004",
  "route": "/workflow/todos",
  "title": "审批中心-我的待办，审批待办中有一条未审批的记录，但是上方显示共0条",
  "taskNo": "BUGTASK-20260709-0004",
  "context": {
    "attachments": [
      {
        "sha256": "0ef1b7645cbab43dd384ea508dd6963d9e9144ee3461483de21fa96b9186b92f",
        "fileName": "01-1783585535582-c93362f7.png",
        "mimeType": "image/png",
        "sizeBytes": 372690,
        "originalName": "pasted-screenshot-1783585476092-1.png",
        "relativePath": "storage/bug-reports/2026/07/09/BUG-20260709-0004/01-1783585535582-c93362f7.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260709-0004/attachments/01-1783585535582-c93362f7.png"
      }
    ],
    "clientContext": {
      "language": "zh-CN",
      "timezone": "Asia/Shanghai",
      "viewport": {
        "width": 1778,
        "height": 961
      },
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      "capturedAt": "2026-07-09T08:25:35.583Z",
      "pageSnapshot": {
        "route": "/workflow/todos",
        "title": "金凤凰 ERP — Phoenix ERP V3",
        "scroll": {
          "x": 0,
          "y": 0
        },
        "viewport": {
          "width": 1778,
          "height": 961
        },
        "visibleText": [
          "运营工作台",
          "每日工作台",
          "仪表盘",
          "生产管理",
          "库存管理",
          "全链追溯",
          "采购供应中心",
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
          "经营分析中心",
          "主数据中心",
          "系统设置中心",
          "验收试运行",
          "系统运维",
          "个人中心 / 修改密码",
          "经营仪表盘",
          "10",
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
          "pasted-screenshot-1783585476092-1.png",
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
              "y": 118
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
              "y": 156
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
              "y": 194
            },
            "label": "仪表盘",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 232
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
              "y": 270
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
              "y": 308
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
              "y": 346
            },
            "label": "采购供应中心",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 384
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
              "y": 422
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
              "y": 460
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
              "y": 498
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
              "y": 536
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
              "y": 568
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
              "y": 600
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
              "y": 632
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
              "y": 664
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
              "y": 696
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
              "y": 728
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
              "y": 760
            },
            "label": "经营分析中心",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 798
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
              "y": 836
            },
            "label": "系统设置中心",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 874
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
              "y": 912
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
              "y": 923
            },
            "label": "个人中心 / 修改密码",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".admin-module__uYgI-a__headerSelect",
            "rect": {
              "h": 29,
              "w": 95,
              "x": 1123,
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
              "w": 92,
              "x": 1278,
              "y": 11
            },
            "label": "在线 1",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 34,
              "w": 34,
              "x": 1384,
              "y": 11
            },
            "label": "10",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".bug-intake-module__OBjRZW__feedbackButton",
            "rect": {
              "h": 40,
              "w": 121,
              "x": 1432,
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
              "x": 1145,
              "y": 115
            },
            "label": "关闭",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 41,
              "w": 570,
              "x": 601,
              "y": 337
            },
            "label": "例如：采购付款单项目下拉为空",
            "disabled": false
          },
          {
            "tag": "select",
            "path": "",
            "rect": {
              "h": 38,
              "w": 570,
              "x": 601,
              "y": 418
            },
            "label": "低：样式/文案问题 中：影响局部流程 高：阻断业务操作 紧急：系统不可用/数据风险",
            "disabled": false
          },
          {
            "tag": "textarea",
            "path": "",
            "rect": {
              "h": 99,
              "w": 570,
              "x": 601,
              "y": 496
            },
            "label": "请描述你刚才做了什么、期望结果、实际结果。",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".bug-intake-module__OBjRZW__captureButton",
            "rect": {
              "h": 39,
              "w": 100,
              "x": 601,
              "y": 636
            },
            "label": "全屏截图",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".bug-intake-module__OBjRZW__captureButton",
            "rect": {
              "h": 39,
              "w": 126,
              "x": 712,
              "y": 636
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
              "x": 856,
              "y": 814
            },
            "label": "移除附件",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".bug-intake-module__OBjRZW__secondaryButton",
            "rect": {
              "h": 42,
              "w": 61,
              "x": 1011,
              "y": 867
            },
            "label": "取消",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".bug-intake-module__OBjRZW__primaryButton",
            "rect": {
              "h": 42,
              "w": 89,
              "x": 1082,
              "y": 867
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
              "x": 1567,
              "y": 12
            },
            "label": "金 金凤凰总控 集团超级管理员",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-module__uYgI-a__logoutBtn",
            "rect": {
              "h": 29,
              "w": 67,
              "x": 1691,
              "y": 13
            },
            "label": "退出",
            "disabled": false
          },
          {
            "tag": "select",
            "path": "",
            "rect": {
              "h": 22,
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
              "h": 22,
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
              "h": 25,
              "w": 939,
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
              "h": 37,
              "w": 62,
              "x": 1499,
              "y": 162
            },
            "label": "搜索",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 39,
              "w": 63,
              "x": 1573,
              "y": 162
            },
            "label": "重置",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 33,
              "w": 85,
              "x": 1648,
              "y": 165
            },
            "label": "刷新",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnPrimary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 37,
              "w": 62,
              "x": 1651,
              "y": 274
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
              "x": 2246,
              "y": 16
            },
            "label": "关闭抽屉",
            "disabled": false
          }
        ]
      },
      "devicePixelRatio": 1.7999999523162842
    },
    "consoleErrors": [],
    "failedRequests": [
      {
        "url": "/api/bug-intake/reports/BUG-20260707-0010/redispatch",
        "method": "POST",
        "status": 400,
        "requestId": "",
        "timestamp": "2026-07-09T06:52:45.053Z",
        "responseExcerpt": "{\"code\":400,\"message\":\"已解决或已关闭的问题不能直接重新派发，请先重新打开并确认仍需修复\",\"error\":\"Bad Request\",\"statusCode\":400}"
      },
      {
        "url": "/api/bug-intake/reports/BUG-20260708-0006/redispatch",
        "method": "POST",
        "status": 400,
        "requestId": "",
        "timestamp": "2026-07-09T06:53:10.247Z",
        "responseExcerpt": "{\"code\":400,\"message\":\"已解决或已关闭的问题不能直接重新派发，请先重新打开并确认仍需修复\",\"error\":\"Bad Request\",\"statusCode\":400}"
      }
    ],
    "localEvidence": {
      "localAttachments": [
        {
          "fileName": "01-1783585535582-c93362f7.png",
          "originalName": "pasted-screenshot-1783585476092-1.png",
          "mimeType": "image/png",
          "sourceEndpoint": "/api/bug-intake/reports/BUG-20260709-0004/attachments/01-1783585535582-c93362f7.png",
          "localPath": "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260709-162907/BUG-20260709-0004/attachments/01-1783585535582-c93362f7.png",
          "sizeBytes": 372690
        }
      ],
      "localAttachmentPaths": [
        "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260709-162907/BUG-20260709-0004/attachments/01-1783585535582-c93362f7.png"
      ]
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
    "source_bug_no": "BUG-20260709-0004",
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
    "source_repair_task_no": "BUGTASK-20260709-0004"
  },
  "createdAt": "2026-07-09T08:26:26.840Z",
  "createdBy": "admin",
  "moduleCode": "____",
  "suggestedOwner": "_____",
  "repairGuardrails": {
    "autoRepairExecuted": false,
    "noProductionDeploy": true,
    "noDbWriteWithoutGate": true,
    "requiresHumanApproval": true
  },
  "acceptanceCriteria": "审批中心-我的待办，审批待办中有一条未审批的记录，但是上方显示共0条，要求按实际展示的待办任务数量显示",
  "agentPlanGeneratedAt": "2026-07-09T08:26:27.967Z",
  "agentPlanGeneratedBy": "admin",
  "agentExecutionApproval": {
    "approved": true,
    "approvedAt": "2026-07-09T08:26:29.141Z",
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

- /Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260709-162907/BUG-20260709-0004/attachments/01-1783585535582-c93362f7.png

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
先做合同要求的执行检查：目录、分支、工作区状态和最近提交。只有这些条件都满足，才继续诊断 `/workflow/todos` 的后端计数来源。
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
8f6d9249 (HEAD -> w5-a3-backend-critical-path, w5-a7-final-qa-gate, main) docs(ops): record baseline lifecycle report
410385e2 docs(ops): add bug 20260709 0003 final qa gate
c5cd2134 (w5-a6-staging-deploy-runbook) docs(ops): record baseline lifecycle report
fc744daf docs(ops): add bug 20260709 0003 staging runbook
ba5fa4d6 (w5-a4-frontend-uat-smoke) docs(ops): record baseline lifecycle report
c00267e1 feat(web): record A4-Frontend-UAT-Smoke result
035ff2ab docs(ops): record baseline lifecycle report
2d508a01 docs(ops): record baseline lifecycle report

exec
/bin/zsh -lc 'git status --short' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
codex
执行检查通过：目录、分支、工作区干净。现在只读诊断后端接口和计数字段，先定位 `/workflow/todos` 页面调用的 API 与对应 Nest 模块。
exec
/bin/zsh -lc 'rg --files apps/api/src | rg "workflow|approval|todo|process"' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
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
apps/api/src/modules/procurement-v2/entities/prc2-approval.entity.ts
apps/api/src/modules/data-quality/services/workflow-health.service.ts
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
apps/api/src/modules/workflow/workflow.service.spec.ts
apps/api/src/modules/workflow/workflow.module.ts
apps/api/src/common/interceptors/approval-hint.interceptor.ts

exec
/bin/zsh -lc 'rg --files apps/web | rg "workflow|todos|approval"' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
apps/web/src/lib/workflow-data-catalog.ts
apps/web/src/lib/workflow-templates.ts
apps/web/src/lib/workflow-api.ts
apps/web/src/components/workflow/FormRenderer.tsx
apps/web/src/components/workflow/WorkflowFormRenderer.tsx
apps/web/src/components/workflow/WorkflowTimeline.tsx
apps/web/src/components/workflow/WorkflowMetricsStrip.tsx
apps/web/src/components/workflow/WorkflowDataView.tsx
apps/web/src/app/(admin)/workflow/analytics/page.tsx
apps/web/src/app/(admin)/workflow/page.tsx
apps/web/src/app/(admin)/workflow/builder/page.tsx
apps/web/src/app/(admin)/workflow/definitions/page.tsx
apps/web/src/app/(admin)/workflow/data-sources/page.tsx
apps/web/src/app/(admin)/workflow/todos/page.tsx
apps/web/src/app/(admin)/workflow/instances/page.tsx
apps/web/src/app/(admin)/workflow/instances/[id]/page.tsx
apps/web/src/app/(admin)/workflow/designer/[id]/page.tsx
apps/web/src/app/(admin)/workflow/history/page.tsx
apps/web/src/app/(admin)/workflow/start/page.tsx
apps/web/src/app/(admin)/workflow/form-designer/[id]/page.tsx
apps/web/src/app/(admin)/workflow/forms/page.tsx
apps/web/src/app/(admin)/workflow/forms/runtime/page.tsx
apps/web/src/app/(admin)/workflow/forms/submit/[formCode]/page.tsx
apps/web/src/app/(admin)/workflow/monitor/page.tsx
apps/web/src/app/(admin)/workflow/tasks/cc/page.tsx
apps/web/src/app/(admin)/workflow/tasks/done/page.tsx
apps/web/src/app/(admin)/workflow/tasks/todo/page.tsx
apps/web/src/app/(admin)/workflow/metrics/page.tsx
apps/web/src/app/(mobile)/mobile/workflow/page.tsx
apps/web/src/app/(admin)/settings/approval-rules/page.tsx
apps/web/src/app/(admin)/settings/approval-flows/page.tsx

exec
/bin/zsh -lc 'rg -n "workflow/todos|todos|待审批|待办|my.*todo|todo" apps/api/src apps/web/src apps/web/app docs/ops' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 exited 2 in 0ms:
rg: apps/web/app: No such file or directory (os error 2)
apps/web/src/lib/workflow-api.ts:109:  todo: number;
apps/web/src/lib/workflow-api.ts:158:    todo_count: number;
apps/web/src/lib/workflow-api.ts:227:  todo: () => req<WorkflowList<WorkflowTask>>("/tasks/todo"),
apps/web/src/lib/design-tokens.ts:244:  PENDING_APPROVAL:   '待审批',
apps/web/src/lib/mobile-api.ts:665:  /** 统一待办列表（ApprovalEngine + WorkflowEngine 合并） */
apps/web/src/lib/mobile-api.ts:709:  /** 待办数量（用于首页角标） */
apps/web/src/lib/mobile-roles.ts:232:   * 几乎所有管理类角色都可查看（待办为空时也无害），不在此矩阵的角色跳过入口显示。
apps/api/src/modules/finance-v2/services/fund-transfers.service.ts:190:      throw new BadRequestException(`当前状态 ${t.status}，不在待审批`);
apps/web/src/components/layout/ApprovalNotifier.tsx:43:// 点消息进入的目标页：审批类→待办深链（带 instanceId 直接打开该实例详情）；否则待办兜底
apps/web/src/components/layout/ApprovalNotifier.tsx:47:    return `/workflow/todos?instanceId=${encodeURIComponent(n.linkId)}`;
apps/web/src/components/layout/ApprovalNotifier.tsx:49:  return "/workflow/todos";
apps/web/src/components/layout/ApprovalNotifier.tsx:244:            <button type="button" onClick={() => { setOpen(false); router.push("/workflow/todos"); }}
apps/web/src/components/layout/ApprovalNotifier.tsx:246:              {t('ui.查看全部审批待办 →','查看全部审批待办 →')}
apps/web/src/components/layout/Sidebar.tsx:199:    { id: "ap-todos",   path: "/workflow/todos",         aliases: ["/workflow/tasks/todo"], Icon: ClipboardList,  label: "我的待办",   perm: "MENU_WORKFLOW_TODO"    },
apps/web/src/components/layout/Sidebar.tsx:223:  //   组织/公司/事业群/数据范围已拆为原子码；字典→MENU_SETTINGS_DATA；概览=MENU_MD_CENTER；待审批按相关主数据叶子权限可见。
apps/web/src/components/layout/Sidebar.tsx:244:    { id: "mdc-pending",    path: "/master-data/pending",          Icon: Landmark,        label: "主数据待审批", perm: "MENU_MD_CUSTOMER",      altPerms: [
apps/web/src/components/design-system/templates/Templates.tsx:98:// ── 6. ApprovalTemplate（审批：待办/实例/规则）──────────────────────────
apps/web/src/app/(admin)/analytics/page.tsx:326:    label: t("ui.待审批订单", "待审批订单"),
apps/web/src/app/(admin)/analytics/page.tsx:456:          <AlertItem icon={<ShoppingCart size={14} />} label={t("ui.待审批订单", "待审批订单")} value={k.pending_orders} color="var(--status-warning)" noDetailLabel={t("ui.暂无明细", "暂无明细")} items={alerts.pending_orders.slice(0, 5).map(o => ({
docs/ops/runtime-memory/NEXT_ACTIONS.md:13:**部署后待办(优先级序):**
docs/ops/BUG-20260707-0010-a4-frontend-uat-report.md:10:- Code change required in this run: No. The frontend fix is already present in `apps/web/src/app/(admin)/workflow/todos/page.tsx`.
docs/ops/BUG-20260707-0010-a4-frontend-uat-report.md:17:  - `pnpm --filter web exec eslint 'src/app/(admin)/workflow/todos/page.tsx'`: PASS
docs/ops/BUG-20260707-0010-a4-frontend-uat-report.md:26:- `apps/web/src/app/(admin)/workflow/todos/page.tsx`
docs/ops/BUG-20260707-0010-a4-frontend-uat-report.md:31:- Route: `/workflow/todos`
docs/ops/BUG-20260707-0010-a4-frontend-uat-report.md:40:- Fixed the header count display for approval todos.
docs/ops/BUG-20260707-0010-a4-frontend-uat-report.md:63:- `pnpm --filter web exec eslint 'src/app/(admin)/workflow/todos/page.tsx'`: PASS (rerun 2026-07-08)
docs/ops/BUG-20260707-0010-a4-frontend-uat-report.md:75:Recommended, because `/workflow/todos` is RBAC/DataScope-sensitive. This A4 change does not alter authorization, but A2 should confirm that using already-returned `items.length` as a display fallback does not conflict with security reporting expectations.
docs/ops/BUG-20260707-0010-a4-frontend-uat-report.md:83:- Backend dependency: if `/api/workflow/my-tasks` returns `total=0` while more than one page of authorized todos exists, frontend cannot know the true full total without a correct backend total. A3 should verify the endpoint total aggregation.
apps/web/src/app/(admin)/notifications/page.tsx:148:      // 深链带 instanceId，直接打开该审批实例详情，避免落到通用待办列表后查无此条
apps/web/src/app/(admin)/notifications/page.tsx:149:      router.push(n.linkId ? `/workflow/todos?instanceId=${encodeURIComponent(n.linkId)}` : "/workflow/todos");
apps/web/src/app/(admin)/home/page.tsx:31:interface WorkflowSummary { todo: number; ccUnread: number; overdueTodo: number; running: number; startedRunning: number; }
apps/web/src/app/(admin)/home/page.tsx:65:  { key: 'workflow',  label: '审批工作台',   href: '/workflow/todos',          icon: GitBranch,   accent: '#EC4899', gradient: 'linear-gradient(135deg, #EC489922 0%, transparent 60%)', perm: 'MENU_WORKFLOW_TODO', altPerms: ['MENU_WORKFLOW_HISTORY', 'MENU_WORKFLOW_NOTIFY'], groupId: 'approval' },
apps/web/src/app/(admin)/home/page.tsx:70:// 优先：每日工作台（高频用户专用）→ 待办 → 角色专属页面
apps/web/src/app/(admin)/home/page.tsx:75:function ctaFor(role: string | undefined, todo: number, hasPermission: PermissionChecker, t: (k: string, f?: string) => string): { label: string; href: string; icon: any } {
apps/web/src/app/(admin)/home/page.tsx:87:  if (todo > 0 && hasPermission('MENU_WORKFLOW_TODO')) return { label: `${t('home.handleNow', '立即处理')} ${todo} ${t('home.todosUnit', '个待办')}`, href: '/workflow/todos', icon: Inbox };
apps/web/src/app/(admin)/home/page.tsx:110:  return { label: firstPath ? t('home.enterWorkspace', '进入我的工作区') : t('home.viewMyTodos', '查看我的待办'), href: firstPath || '/workflow/todos', icon: Inbox };
apps/web/src/app/(admin)/home/page.tsx:134:  const [todoList, setTodoList] = useState<TodoTask[]>([]);
apps/web/src/app/(admin)/home/page.tsx:143:      request<{ data: TodoTask[] }>('/workflow/tasks/todo?limit=6', { silent: true }).then(r => r.data || []).catch(() => [] as TodoTask[]),
apps/web/src/app/(admin)/home/page.tsx:197:  const todoCount = summary?.todo ?? 0;
apps/web/src/app/(admin)/home/page.tsx:198:  const cta = ctaFor(role, todoCount, hasPermission, t);
apps/web/src/app/(admin)/home/page.tsx:208:  // 今日要点（智能文案）— G11：高危告警/主数据待审批 仅治理类角色可见
apps/web/src/app/(admin)/home/page.tsx:211:    if (todoCount > 0)                          parts.push(`${todoCount} ${t('home.todosPending', '个待办待处理')}`);
apps/web/src/app/(admin)/home/page.tsx:214:    if (hasCentersPerm && totalPending > 0)     parts.push(`${totalPending} ${t('home.mdPendingUnit', '单主数据待审批')}`);
apps/web/src/app/(admin)/home/page.tsx:217:  }, [todoCount, summary, scores, totalPending, hasQualityPerm, hasCentersPerm, t]);
apps/web/src/app/(admin)/home/page.tsx:229:        todoCount={todoCount}
apps/web/src/app/(admin)/home/page.tsx:265:            <TodoTimeline todoList={todoList} todoCount={todoCount} />
apps/web/src/app/(admin)/home/page.tsx:287:          <TodoTimeline todoList={todoList} todoCount={todoCount} />
apps/web/src/app/(admin)/home/page.tsx:301:function HeroBanner({ greeting, userName, briefing, ctaLabel, ctaHref, CtaIcon, todoCount, overdueCount, highAlertCount, masterDataPath, showAlertBubble }: {
apps/web/src/app/(admin)/home/page.tsx:304:  todoCount: number; overdueCount: number; highAlertCount: number;
apps/web/src/app/(admin)/home/page.tsx:376:        <NumberBubble icon={<Inbox size={13} />} label={t('home.todo', '待办')} value={todoCount} tone="brand" />
apps/web/src/app/(admin)/home/page.tsx:412:// 待办 Timeline
apps/web/src/app/(admin)/home/page.tsx:414:function TodoTimeline({ todoList, todoCount }: { todoList: TodoTask[]; todoCount: number }) {
apps/web/src/app/(admin)/home/page.tsx:426:        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{tr('home.todoFlow', '事务流 · 我的待办')}</h3>
apps/web/src/app/(admin)/home/page.tsx:428:          {tr('home.total', '共')} <strong style={{ color: 'var(--color-primary)' }}>{todoCount}</strong> {tr('home.orderUnit', '单')}
apps/web/src/app/(admin)/home/page.tsx:430:        <Link href="/workflow/todos" style={{ fontSize: 12, color: 'var(--color-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
apps/web/src/app/(admin)/home/page.tsx:435:      {todoList.length === 0 ? (
apps/web/src/app/(admin)/home/page.tsx:438:          <div style={{ fontSize: 13 }}>{tr('home.noTodo', '暂无待办任务，今天可以专注做事 ✨')}</div>
apps/web/src/app/(admin)/home/page.tsx:447:          {todoList.map((t, i) => {
apps/web/src/app/(admin)/home/page.tsx:453:              <Link key={i} href={`/workflow/todos?taskNo=${encodeURIComponent(t.task_no)}`} style={{
apps/api/src/modules/approval-engine/approval-engine.service.ts:210:      if (pendingSteps.length === 0) throw new BadRequestException('当前步无待审批节点');
apps/api/src/modules/approval-engine/approval-engine.service.ts:344:      // 业务摘要快照（供待办/历史页展示，避免跨表查询）
apps/api/src/modules/approval-engine/approval-engine.service.ts:772:  /** 获取我的待办（角色匹配 OR 指定用户匹配） */
apps/api/src/modules/approval-engine/approval-engine.service.ts:776:    // G85-D 待办 DataScope：非全局用户只看本公司范围实例（company_code 为 NULL 的全局单据保留）
apps/api/src/modules/approval-engine/approval-engine.service.ts:826:          -- G151：兜底改为「仅卡住才进超管待办」——日常步骤不再灌入超管待办(否则老板兼超管时
apps/api/src/modules/approval-engine/approval-engine.service.ts:827:          --   每一步都进他待办、还能一人连批两步破坏分离)。仅以下三种「卡住」情形才进：
apps/api/src/modules/approval-engine/approval-engine.service.ts:1020:  /** 查询待办数量（用于 badge 展示） */
apps/api/src/modules/approval-engine/approval-engine.controller.ts:12:  /** 我的审批待办 */
apps/api/src/modules/approval-engine/approval-engine.controller.ts:13:  @Get('todos')
apps/web/src/app/(admin)/master-data/pending/page.tsx:14: * 主数据待审批（G3-B）
apps/web/src/app/(admin)/master-data/pending/page.tsx:15: * 汇总展示用户有权查看的主数据类型中处于「待审批」状态的记录。
apps/web/src/app/(admin)/master-data/pending/page.tsx:16: * 实际审批在「审批中心」待办完成（Workflow 2.0）。
apps/web/src/app/(admin)/master-data/pending/page.tsx:209:      <PageHeader title={tr('md.mdPending', '主数据待审批')} subtitle={tr('md.pendingSub', '待审批主数据汇总 · 审批在「审批中心」待办完成（通过后自动生效）')} breadcrumb={[tr('md.center', '主数据中心'), tr('md.mdPending', '主数据待审批')]} />
apps/web/src/app/(admin)/master-data/pending/page.tsx:220:        <Link href="/workflow/tasks/todo" style={{
apps/web/src/app/(admin)/master-data/pending/page.tsx:249:    }}><LoadingSkeleton variant="card" rows={3} /></div> : total === 0 ? <EmptyState title={tr('md.noPendingMdTitle', '暂无待审批主数据')} description={tr('md.allMdApproved', '所有主数据均已审批生效')} /> : <div style={{
apps/web/src/app/(admin)/master-data/pending/page.tsx:274:          }}>{data[t.type].length} {tr('md.pending', '待审批')}</span>
apps/web/src/components/ui/NavCard.tsx:31:  /** 右上角徽章，如"3 笔待审批" */
apps/web/src/app/(admin)/shareholders/capital/page.tsx:220:        <KpiCard title={t('ui.待审批资本流金额', '待审批资本流金额')} value={`¥${money(kpis.pendingApproval)}`} icon={Clock} accentColor="amber" />
apps/web/src/app/(admin)/master-data/page.tsx:7: * · 6 中心运营卡（实时显示 对象数 / 待审批 / 异常 / 健康评分）
apps/web/src/app/(admin)/master-data/page.tsx:241:    desc: t('md.opsWorkbenchDesc', '待审批 / 补资料 / 风险处理'),
apps/web/src/app/(admin)/master-data/page.tsx:256:    label: t('md.mdPending', '主数据待审批'),
apps/web/src/app/(admin)/master-data/page.tsx:412:                <Stat label={t('md.pending', '待审批')} value={c.pendingCount} accent={c.pendingCount > 0 ? 'var(--status-warning)' : 'var(--text-secondary)'} />
apps/web/src/app/(admin)/warehouse/loss-report/page.tsx:41:    DONE:     { tone: "warning", label: t("ui.待审批",       "待审批") },
apps/web/src/app/(admin)/warehouse/loss-report/page.tsx:115:      label: t("ui.待审批", "待审批"),
apps/web/src/app/(admin)/warehouse/loss-report/page.tsx:271:          { label: t("ui.待审批",       "待审批"),       val: `${pendingCount} ${t("ui.单", "单")}`,               tone: "info"    as Tone },
apps/web/src/app/(admin)/master-data/dictionaries/page.tsx:7: *   顶部：5 张运营 KPI（字典总数 / 业务分类数 / 启用 / 停用 / 待审批）
apps/web/src/app/(admin)/master-data/dictionaries/page.tsx:89:  PENDING:   { label: '待审批', color: 'var(--status-warning)', bg: 'var(--status-warning-bg-light)' },
apps/web/src/app/(admin)/master-data/dictionaries/page.tsx:193:        <KpiCard label={t('md.pending', '待审批')}     value={stats.pending}    icon={<Clock size={14} />} suffix={t('md.unitItem', '条')} tone={stats.pending > 0 ? 'warning' : 'default'} />
apps/web/src/app/(admin)/master-data/governance/page.tsx:243:            { href: '/master-data/pending', label: t('md.mdPending', '主数据待审批'), icon: GitPullRequestArrow },
docs/ops/DR_RESTORE_DRILL.md:38:## 5. 待办（本脚本未覆盖）
apps/api/src/modules/procurement-v2/services/requests.service.ts:460:          `当前状态 [${req.status}] 不允许取消，只有草稿/已提交/待审批状态可取消`,
docs/ops/WORKFLOW_APPROVAL_ACTION_UX_REMEDIATION_20260626.md:9:- PC unified approval center `/workflow/todos`
apps/web/src/app/(admin)/master-data/operations/page.tsx:15: * 4 类待办：
apps/web/src/app/(admin)/master-data/operations/page.tsx:16: *   1. 待审批主数据（按 type 分组 + 跳转）
apps/web/src/app/(admin)/master-data/operations/page.tsx:67:  const [todo, setTodo] = useState<Todo | null>(null);
apps/web/src/app/(admin)/master-data/operations/page.tsx:74:      setTodo(await request<Todo>('/master-data/operations/todo'));
apps/web/src/app/(admin)/master-data/operations/page.tsx:81:  const summary = useMemo(() => todo ? {
apps/web/src/app/(admin)/master-data/operations/page.tsx:82:    pendingTotal: todo.pendingApprovals.reduce((s, p) => s + p.count, 0),
apps/web/src/app/(admin)/master-data/operations/page.tsx:83:    missingTotal: todo.missingContact.reduce((s, m) => s + m.count, 0),
apps/web/src/app/(admin)/master-data/operations/page.tsx:84:    duplicateTotal: todo.duplicateCodes.reduce((s, d) => s + d.count, 0),
apps/web/src/app/(admin)/master-data/operations/page.tsx:85:    blockedTotal: todo.archiveBlocked.length
apps/web/src/app/(admin)/master-data/operations/page.tsx:86:  } : null, [todo]);
apps/web/src/app/(admin)/master-data/operations/page.tsx:92:      <PageHeader title={t('md.opsTitle', '主数据运营工作台')} subtitle={t('md.opsSub', '待审批 · 待补资料 · 重复风险 · 归档阻断 — 运营每日工作集中处理')} breadcrumb={[t('md.center', '主数据中心'), t('md.opsWorkbench', '运营工作台')]} actions={<button onClick={() => void load()} disabled={loading} style={secondaryActionButton}>
apps/web/src/app/(admin)/master-data/operations/page.tsx:113:          <KpiCard label={t('md.pendingMdData', '待审批主数据')} value={summary.pendingTotal} icon={CheckSquare} accent="var(--status-warning)" />
apps/web/src/app/(admin)/master-data/operations/page.tsx:119:      {/* 1. 待审批 */}
apps/web/src/app/(admin)/master-data/operations/page.tsx:120:      <Section title={t('md.pendingMdData', '待审批主数据')} icon={CheckSquare} count={summary?.pendingTotal ?? 0}>
apps/web/src/app/(admin)/master-data/operations/page.tsx:121:        {todo?.pendingApprovals.length === 0 ? <EmptyHint text={t('md.noPendingMd', '🎉 暂无待审批主数据')} /> : <div style={{
apps/web/src/app/(admin)/master-data/operations/page.tsx:126:           {todo?.pendingApprovals.map(p => <a key={p.type} href={p.href} style={cardLinkStyle}>
apps/web/src/app/(admin)/master-data/operations/page.tsx:180:        {todo?.missingContact.length === 0 ? <EmptyHint text={t('md.contactComplete', '✓ 客户/供应商联系信息完整')} /> : <div style={{
apps/web/src/app/(admin)/master-data/operations/page.tsx:185:           {todo?.missingContact.map(m => <a key={m.source} href={m.source === 'customer' ? '/master-data/customers' : '/master-data/suppliers'} style={cardLinkStyle}>
apps/web/src/app/(admin)/master-data/operations/page.tsx:218:        {todo?.duplicateCodes.length === 0 ? <EmptyHint text={t('md.noDupCode', '✓ 无重复编码')} /> : <div style={{
apps/web/src/app/(admin)/master-data/operations/page.tsx:223:           {todo?.duplicateCodes.filter(d => d.count > 0).map(d => <div key={d.source} style={{
apps/web/src/app/(admin)/master-data/operations/page.tsx:245:           {todo?.duplicateCodes.every(d => d.count === 0) && <EmptyHint text={t('md.noDupCode', '✓ 无重复编码')} />}
apps/web/src/app/(admin)/master-data/operations/page.tsx:251:        {todo?.archiveBlocked.length === 0 ? <EmptyHint text={t('md.noArchiveBlocked', '✓ 近期无归档阻断事件')} /> : <div style={{
apps/web/src/app/(admin)/master-data/operations/page.tsx:256:           {todo?.archiveBlocked.map((e, i) => <div key={i} style={{
apps/web/src/app/(admin)/master-data/operations/page.tsx:295:      {loading && !todo && <div style={{
apps/web/src/app/(admin)/warehouse/stocktake/page.tsx:338:          { label: t("ui.待审批",       "待审批"),       val: String(pending),                tone: "warning" as Tone },
apps/api/src/modules/procurement-v2/services/orders.service.ts:712:          `当前状态 [${po.status}] 不允许取消（只有草稿/已提交/待审批可取消）`,
apps/web/src/components/master-data/MasterDataCenterStrip.tsx:6: * 4 张 KpiCardV2：在管 / 运行（含进度条+健康度）/ 待审批 / 风险冻结
apps/web/src/components/master-data/MasterDataCenterStrip.tsx:84:          label={t('ui.待审批','待审批')}
apps/web/src/app/(admin)/layout.tsx:78:  "/workflow/todos":               "menu.wf-approval-todos",
apps/web/src/app/(admin)/master-data/suppliers/[code]/page.tsx:34:  PENDING_APPROVAL: { labelKey: "md.status_pending_approval", label: "待审批", tone: "warning" },
apps/web/src/app/(admin)/workflow/analytics/page.tsx:103:                        {row.overdue_count ? `${row.overdue_count} ${t('ui.超时','超时')}` : `${row.todo_count} ${t('ui.待办','待办')}`}
apps/web/src/app/(admin)/workflow/analytics/page.tsx:112:                    <small>{t('ui.平均等待','平均等待')} {hourText(row.avg_waiting_hours)} · {t('ui.待办','待办')} {row.todo_count}</small>
apps/web/src/components/master-data/MasterDataDetailDrawer.tsx:38:  PENDING_APPROVAL: { label: '待审批', color: 'var(--status-warning)' },
apps/web/src/app/(admin)/workflow/page.tsx:21:  ["我的待办", "/workflow/tasks/todo", "处理分配给我的审批任务"],
apps/web/src/app/(admin)/workflow/page.tsx:46:      <PageHeader title={t('ui.审批工作台','审批工作台')} subtitle={t('ui.我的待办优先 · SLA 实时监控 · 业务驱动审批 · 智能发起常用流程','我的待办优先 · SLA 实时监控 · 业务驱动审批 · 智能发起常用流程')} breadcrumb={[t('ui.审批工作台','审批工作台')]} />
apps/web/src/app/(admin)/workflow/page.tsx:51:          <Metric label={t('ui.我的待办','我的待办')} value={summary?.todo ?? 0} href="/workflow/tasks/todo" tone="primary" />
apps/web/src/app/(admin)/workflow/page.tsx:53:          <Metric label={t('ui.超时待办','超时待办')} value={summary?.overdueTodo ?? 0} href="/workflow/monitor" tone="danger" />
apps/web/src/components/master-data/MasterDataRuntimePanel.tsx:61:  PENDING_APPROVAL: { label: "待审批",   tone: 'warning' },
apps/web/src/app/(admin)/daily-work/page.tsx:10: * · 顶部"今日待办"banner 显示未完成项
apps/web/src/app/(admin)/daily-work/page.tsx:82:  { key: 'todo',        title: '我的待办',          desc: '待处理审批任务',
apps/web/src/app/(admin)/daily-work/page.tsx:83:    icon: Inbox,         href: '/workflow/todos',                                     accent: '#3B82F6', perm: 'MENU_WORKFLOW_TODO',      permOp: 'V' },
apps/web/src/app/(admin)/daily-work/page.tsx:107:  const todoCount = (stats.todo || 0) + (stats.overdue || 0);
apps/web/src/app/(admin)/daily-work/page.tsx:117:      {/* 今日待办 banner */}
apps/web/src/app/(admin)/daily-work/page.tsx:118:      {todoCount > 0 && (
apps/web/src/app/(admin)/daily-work/page.tsx:128:              {t('dwork.youHave', '你有')} {todoCount} {t('dwork.todosToHandle', '项待办需要处理')}
apps/web/src/app/(admin)/daily-work/page.tsx:131:              {t('dwork.clickTodoCard', '点下方"我的待办"卡片快速处理')}
apps/web/src/app/(admin)/workflow/todos/page.tsx:150:      label: "待审批",
apps/web/src/app/(admin)/workflow/todos/page.tsx:217:    cache: "no-store"   // G150：禁浏览器缓存，避免审批后刷新仍读到旧待办列表
apps/web/src/app/(admin)/workflow/todos/page.tsx:324:  // 消息中心深链：/workflow/todos?instanceId=<id> 直接打开该审批实例详情，
apps/web/src/app/(admin)/workflow/todos/page.tsx:395:  const openDetail = async (todo: UnifiedTask) => {
apps/web/src/app/(admin)/workflow/todos/page.tsx:396:    setSelected(todo);
apps/web/src/app/(admin)/workflow/todos/page.tsx:402:    if (todo.taskSource === "APPROVAL_ENGINE") {
apps/web/src/app/(admin)/workflow/todos/page.tsx:403:      setDetail(await fetchDetail(todo.instanceId));
apps/web/src/app/(admin)/workflow/todos/page.tsx:507:      <PageHeader title={t('ui.审批待办','审批待办')} subtitle={`${t('ui.我的待审批任务（共','我的待审批任务（共')} ${displayTotal} ${t('ui.条）','条）')}`} breadcrumb={[t('ui.审批中心','审批中心'), t('ui.待办','待办')]} />
apps/web/src/app/(admin)/workflow/todos/page.tsx:577:            <p>{t('ui.暂无待审批任务','暂无待审批任务')}</p>
apps/web/src/app/(admin)/workflow/todos/page.tsx:596:                {resp.items.map(todo => <tr key={`${todo.taskSource}-${todo.taskId}`}>
apps/web/src/app/(admin)/workflow/todos/page.tsx:597:                    <td><TaskSourceBadge source={todo.taskSource} /></td>
apps/web/src/app/(admin)/workflow/todos/page.tsx:604:                        {BIZ_TYPE_ICON[todo.bizType]}
apps/web/src/app/(admin)/workflow/todos/page.tsx:605:                        {BIZ_TYPE_LABEL[todo.bizType] ?? todo.bizType ?? "-"}
apps/web/src/app/(admin)/workflow/todos/page.tsx:614:                        {todo.bizNo || todo.bizId}
apps/web/src/app/(admin)/workflow/todos/page.tsx:627:                        {todo.subject || "-"}
apps/web/src/app/(admin)/workflow/todos/page.tsx:636:                        {fmtAmount(todo.amount, todo.currencyCode)}
apps/web/src/app/(admin)/workflow/todos/page.tsx:646:                        {todo.companyName && <Building2 size={11} style={{
apps/web/src/app/(admin)/workflow/todos/page.tsx:649:                        {todo.companyName ?? todo.companyCode ?? "-"}
apps/web/src/app/(admin)/workflow/todos/page.tsx:659:                        {todo.projectName && <FolderOpen size={11} style={{
apps/web/src/app/(admin)/workflow/todos/page.tsx:662:                        {todo.projectName ?? todo.projectCode ?? "-"}
apps/web/src/app/(admin)/workflow/todos/page.tsx:672:                        {todo.requiredRole || "-"}
apps/web/src/app/(admin)/workflow/todos/page.tsx:676:                      {todo.currentStepNo != null && todo.totalSteps != null ? <span style={{
apps/web/src/app/(admin)/workflow/todos/page.tsx:680:                          {todo.currentStepNo}/{todo.totalSteps}
apps/web/src/app/(admin)/workflow/todos/page.tsx:683:                    <td className={u.fs12}>{fmtDate(todo.createdAt)}</td>
apps/web/src/app/(admin)/workflow/todos/page.tsx:685:                      <button className={`${s.btnPrimary} ${u.fs12}`} onClick={() => openDetail(todo)}>
apps/web/src/app/(admin)/workflow/todos/page.tsx:686:                        {todo.taskSource === "APPROVAL_ENGINE" ? t('ui.审批','审批') : t('ui.查看','查看')}
apps/web/src/app/(admin)/master-data/customers/[code]/page.tsx:34:  PENDING_APPROVAL: { labelKey: "md.status_pending_approval", label: "待审批", tone: "warning" },
apps/web/src/app/(admin)/workflow/instances/[id]/page.tsx:57:                <Link href="/workflow/tasks/todo" style={secondaryActionButton}>{t('ui.我的待办','我的待办')}</Link>
apps/web/src/app/(admin)/workflow/instances/[id]/page.tsx:126:  const todo = tasks.filter(task => String(task.status) === "TODO");
apps/web/src/app/(admin)/workflow/instances/[id]/page.tsx:130:  const current = todo[0];
apps/web/src/app/(admin)/workflow/instances/[id]/page.tsx:131:  const pendingOwners = todo.map(task => task.assignee_role_code || (task.assignee_user_id ? `用户 ${task.assignee_user_id}` : "待分配"));
apps/web/src/app/(admin)/workflow/instances/[id]/page.tsx:144:    nextTitle: nextTitle(data.status, todo.length),
apps/web/src/app/(admin)/workflow/instances/[id]/page.tsx:145:    nextHint: nextHint(data.status, todo)
apps/web/src/app/(admin)/workflow/instances/[id]/page.tsx:148:function nextTitle(status: string, todoCount: number) {
apps/web/src/app/(admin)/workflow/instances/[id]/page.tsx:149:  if (status === "RUNNING" && todoCount > 0) return "等待审批处理";
apps/web/src/app/(admin)/workflow/instances/[id]/page.tsx:156:function nextHint(status: string, todo: WorkflowTask[]) {
apps/web/src/app/(admin)/workflow/instances/[id]/page.tsx:157:  if (status === "RUNNING" && todo.length > 0) {
apps/web/src/app/(admin)/workflow/instances/[id]/page.tsx:158:    return todo.map(task => `${task.node_name} 由 ${task.assignee_role_code || task.assignee_user_id || "待分配"} 处理`).join("；");
docs/ops/MASTER_DATA_AGGREGATE_API_ATOMIC_PERMISSION_REMEDIATION_20260627.md:12:- `GET /api/master-data/operations/todo` now requires `MENU_MD_CENTER:V`.
apps/api/src/modules/workflow/workflow-metrics.controller.ts:76:   * 返回各审批角色的平均处理时长、待办量、超期量
apps/api/src/modules/workflow/workflow-metrics.controller.ts:116:   * 超期待办任务列表（Top 20），供健康看板展示
apps/api/src/modules/workflow/workflow-metrics.controller.ts:170:   * 已升级待办任务列表（escalation_level > 0），供健康看板展示
apps/web/src/app/(admin)/workflow/start/page.tsx:322:                  <span style={hintStyle}>{schema ? t('ui.提交后系统会按审批路径自动生成待办。','提交后系统会按审批路径自动生成待办。') : t('ui.建议管理员先绑定专用表单。','建议管理员先绑定专用表单。')}</span>
apps/web/src/app/(admin)/workflow/start/page.tsx:372:              <Link href="/workflow/tasks/todo" style={secondaryActionButton}>{t('ui.我的待办','我的待办')}</Link>
apps/api/src/modules/workflow/workflow.service.ts:248:      `CREATE INDEX IF NOT EXISTS idx_wf_task_todo_user ON wf_task(status, assignee_user_id)`,
apps/api/src/modules/workflow/workflow.service.ts:249:      `CREATE INDEX IF NOT EXISTS idx_wf_task_todo_role ON wf_task(status, assignee_role_code)`,
apps/api/src/modules/workflow/workflow.service.ts:759:                COUNT(*)::int AS todo_count,
apps/api/src/modules/workflow/workflow.service.ts:766:         ORDER BY overdue_count DESC, avg_waiting_hours DESC, todo_count DESC
apps/api/src/modules/workflow/workflow.service.ts:957:         FROM (${selects.join('\nUNION ALL\n')}) todo
apps/api/src/modules/workflow/workflow.service.ts:958:        ORDER BY todo.created_at DESC, todo.task_id DESC`,
apps/api/src/modules/workflow/workflow.service.ts:1074:    const [todoCount, ccRows, overdueCount, runningRows, startedRows] = await Promise.all([
apps/api/src/modules/workflow/workflow.service.ts:1076:      // CC/running 仍属通用 WorkflowEngine；todo/overdue 采用 /workflow/todos 的统一待办口径。
apps/api/src/modules/workflow/workflow.service.ts:1110:        todo: todoCount,
apps/api/src/modules/workflow/workflow.service.ts:1548:         ) todo
apps/api/src/modules/workflow/workflow.service.ts:1549:        ORDER BY todo.created_at DESC, todo.id DESC
apps/api/src/modules/workflow/workflow-runtime.controller.ts:13:   * 聚合 ApprovalEngine 待办 + WorkflowEngine wf_task
apps/api/src/modules/workflow/workflow-task.controller.ts:11:  @Get('todo')
apps/api/src/modules/workflow/workflow-task.controller.ts:13:  todo(@Query() query: any, @Req() req: any) {
apps/web/src/app/(admin)/finance2/reports/page.tsx:335:        <KpiCard label={t('fin2.reports.expense_pending','费用待审批')} value={`${data.expensePendingCount} ${t('fin2.common.count_unit','笔')}`} sub={fmtMoney(data.expensePendingAmount)} icon={Receipt} color="var(--color-primary)" />
apps/web/src/app/(admin)/finance2/page.tsx:382:            {t('fin2.home.pending_tfr_pre','有')} <strong>{cashDash.pendingTransfers}</strong> {t('fin2.home.pending_tfr_post','笔转账申请等待审批。')}
apps/web/src/app/(admin)/finance2/fund-transfers/page.tsx:80:    label: '待审批',
apps/web/src/app/(admin)/workflow/tasks/cc/page.tsx:74:            <Link href="/workflow/tasks/todo" style={secondaryActionButton}>{t('ui.去处理待办','去处理待办')}</Link>
apps/api/src/modules/workflow/workflow.service.spec.ts:18:  it('keeps total aligned with the filtered unified todo rows', async () => {
apps/api/src/modules/workflow/workflow.service.spec.ts:82:  it('preserves approval todo DataScope parameters', async () => {
docs/ops/FRONTEND_MENU_TREE_PERMISSION_GATE_20260626.md:17:- Legacy workflow links still pointed to `/workflow/tasks/todo`, while the registered menu entry is `/workflow/todos`.
docs/ops/FRONTEND_MENU_TREE_PERMISSION_GATE_20260626.md:37:  - `/workflow/tasks/todo` -> `MENU_WORKFLOW_TODO`
docs/ops/FRONTEND_MENU_TREE_PERMISSION_GATE_20260626.md:47:- Daily work "我的待办" now uses `/workflow/todos`.
docs/ops/FRONTEND_MENU_TREE_PERMISSION_GATE_20260626.md:48:- Home todo detail link now uses `/workflow/todos`.
apps/web/src/app/(admin)/workflow/tasks/done/page.tsx:61:            <Link href="/workflow/tasks/todo" style={{ ...secondaryActionButton, textDecoration: "none" }}>{t('ui.回到待办','回到待办')}</Link>
apps/web/src/app/(admin)/workflow/tasks/todo/page.tsx:32:      const res = await workflowApi.todo();
apps/web/src/app/(admin)/workflow/tasks/todo/page.tsx:37:      console.error('[workflow/todo] load failed:', err);
apps/web/src/app/(admin)/workflow/tasks/todo/page.tsx:38:      setError(err instanceof Error ? `${t('ui.加载待办失败：','加载待办失败：')}${err.message}` : t('ui.加载待办失败','加载待办失败'));
apps/web/src/app/(admin)/workflow/tasks/todo/page.tsx:137:      <PageHeader title={t('ui.我的待办','我的待办')} subtitle={t('ui.处理分配给我的审批任务，查看表单内容后给出审批意见','处理分配给我的审批任务，查看表单内容后给出审批意见')} breadcrumb={[t('ui.工作流','工作流'), t('ui.我的待办','我的待办')]} />
apps/web/src/app/(admin)/workflow/tasks/todo/page.tsx:145:                <p className={`${s.modalDesc} ${u.mt4}`}>{t('ui.共 ','共 ')}{rows.length} {t('ui.条待办','条待办')}</p>
apps/web/src/app/(admin)/workflow/tasks/todo/page.tsx:163:              </div> : <div className={s.emptyState}><div className={s.emptyStateText}>{t('ui.当前没有待审批任务。','当前没有待审批任务。')}</div></div>}
apps/web/src/app/(admin)/workflow/tasks/todo/page.tsx:233:            </div> : <div className={s.emptyState}><div className={s.emptyStateText}>{t('ui.选择一条待办后处理。','选择一条待办后处理。')}</div></div>}
docs/ops/GLOBAL_RBAC_MENU_GATE_AUDIT_20260625.md:93:   - My todo / my done
docs/ops/GLOBAL_RBAC_MENU_GATE_AUDIT_20260625.md:149:   - Split configuration pages from ordinary todo/history visibility.
apps/web/src/app/(admin)/workflow/metrics/page.tsx:417:          <KpiCard label={t('ui.待审批任务','待审批任务')} value={overview.pendingTasks} sub={t('ui.当前未完成','当前未完成')} icon={Clock} color="var(--status-special)" />
apps/web/src/app/(admin)/workflow/metrics/page.tsx:427:        <Section title={t('ui.超期待办 Top 20','超期待办 Top 20')} icon={AlertTriangle} iconColor="var(--status-danger)" badge={overdueTasks.length > 0 ? <span style={{
apps/web/src/app/(admin)/workflow/metrics/page.tsx:581:                  {[t('ui.审批角色','审批角色'), t('ui.待办量','待办量'), t('ui.超期量','超期量'), t('ui.平均处理时长','平均处理时长')].map(h => <th key={h}>{h}</th>)}
apps/api/src/modules/procurement/procurement.controller.ts:18:  // ─── 采购申请（草稿/待审批） ────────────────────────────────────────────────
apps/web/src/app/(admin)/finance2/shareholder-funds/page.tsx:126:  PENDING_APPROVAL: { label: '待审批', color: 'var(--status-warning)' },
apps/web/src/app/(admin)/finance2/shareholder-funds/page.tsx:726:            {t('fin2.shfunds.pick_approver_hint','选一位有确认权、且数据域覆盖本公司的审批人；提交后对方会收到待办通知。也可"不指定"，由任一有权同事确认。')}
apps/web/src/app/(admin)/finance2/expenses/page.tsx:112:    label: '待审批'
apps/web/src/app/(admin)/sales2/page.tsx:122:            <KpiCard label={t('ui.待审批','待审批')}    value={stats.pendingApprov
```
