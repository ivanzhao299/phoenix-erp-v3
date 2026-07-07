# Agent Worker Log

| Field | Value |
| --- | --- |
| Task ID | BUGTASK-20260707-0002-01-A2 |
| Agent | A2-Security-Regression-Gate |
| Dry run | No |
| Exit code | 0 |

## Command

```bash
node scripts/ops/run-agent-task.mjs --agent A2-Security-Regression-Gate --worktree /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate --prompt docs/ops/prompts/A2_SECURITY_REVIEW_PROMPT.md --task-contract docs/ops/runs/BUGTASK-20260707-0002-01-A2-contract.md --assembled-prompt-output docs/ops/runs/BUGTASK-20260707-0002-01-A2-worker-assembled-prompt.md --require-approval-token APPROVE_AGENT_EXECUTION --skip-baseline-autopilot --allow-ops-runtime-dirty
```

## Stdout

```text
Agent: A2-Security-Regression-Gate
Worktree: /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate
Branch: w5-a2-security-regression-gate
Prompt: docs/ops/prompts/A2_SECURITY_REVIEW_PROMPT.md
Task contract: docs/ops/runs/BUGTASK-20260707-0002-01-A2-contract.md
Assembled prompt: docs/ops/runs/BUGTASK-20260707-0002-01-A2-worker-assembled-prompt.md
Assembled prompt chars: 20245
Codex command: codex exec -C /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate --sandbox workspace-write -
Codex timeout ms: 600000
Run log: /Users/mac/phoenix-erp-worktrees/codex-orchestrator/docs/ops/runs/2026-07-07T00-24-59-596Z-A2-Security-Regression-Gate.md
PASS WITH CONDITIONS / HOLD.

A2 security gate report is written and committed:

- Report: [BUGTASK-20260707-0002_A2-Security-Regression-Gate_REPORT.md](/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate/docs/ops/BUGTASK-20260707-0002_A2-Security-Regression-Gate_REPORT.md)
- Commit: `283abd18 docs(ops): record a2 security gate for warehouse 403 bug`
- Worktree: clean

Key finding: backend RBAC is correctly denying `wms_*` Generic CRUD reads for a user without `MENU_WMS_INOUT`; the regression is frontend/API contract mismatch. `/warehouse` is visible with `MENU_WMS_VIEW`, but the page unconditionally calls `wms_zones`, `wms_inbound`, and `wms_outbound`, which require `MENU_WMS_INOUT`.

Release decision: HOLD until `/warehouse` stops producing 403 for view-only users without relaxing WMS CRUD permissions. No code, migrations, DB writes, deploy, merge, or push were performed.
Baseline autopilot skipped by caller; caller must run lifecycle hook.

```

## Stderr

```text
OpenAI Codex v0.142.5
--------
workdir: /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate
model: gpt-5.5
provider: openai
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR]
reasoning effort: medium
reasoning summaries: none
session id: 019f39f4-6f8d-70f3-aff3-1384e68017eb
--------
user
# Base Agent Prompt

# A2 Security Review Prompt

## Agent Identity

You are `A2-Security-Regression-Gate`.

## Worktree and Branch

Worktree: `/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate`

Branch: `w5-a2-security-regression-gate`

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

Security review reports, read-only code inspection, approved security tests, docs/ops evidence.

## Forbidden Scope

Do not change code unless the task contract explicitly allows it. No migrations, schema/entity/table/column edits, production deploy, database writes, push, or secret exposure.

## Review Focus

RBAC, DataScope, JWT/session handling, SSE/WebSocket behavior, third-party interface security, logs redaction, attachment ACL, status transitions, and sensitive data handling.

## Output Report Format

Write PASS / FAIL / PASS WITH CONDITIONS with findings, evidence, file references, required remediation, and release impact.

## Commit Rule

Commit only approved docs/ops reports unless explicitly authorized otherwise.

## Failure Rule

Stop on security bypass, unreviewable scope, missing evidence, forbidden path changes, or unexpected dirty files.

---

# Agent Task Contract

# Bug Repair Agent Contract

Source bug: BUG-20260707-0002
Source repair task: BUGTASK-20260707-0002
Assigned agent: A2-Security-Regression-Gate

## Issue

打开库存总览报错403

## Route

/warehouse

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "url": "https://erp.eggslao.com/warehouse",
  "bugNo": "BUG-20260707-0002",
  "route": "/warehouse",
  "title": "打开库存总览报错403",
  "taskNo": "BUGTASK-20260707-0002",
  "context": {
    "attachments": [
      {
        "sha256": "b800275cb5e48e124d2d5673b072bce741b585d426a18adbffc636d8708a9223",
        "fileName": "01-1783383618124-3188771d.png",
        "mimeType": "image/png",
        "sizeBytes": 495164,
        "originalName": "pasted-screenshot-1783383528457-1.png",
        "relativePath": "storage/bug-reports/2026/07/07/BUG-20260707-0002/01-1783383618124-3188771d.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260707-0002/attachments/01-1783383618124-3188771d.png"
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
      "capturedAt": "2026-07-07T00:20:18.125Z",
      "pageSnapshot": {
        "route": "/warehouse",
        "title": "金凤凰数字运营管理平台",
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
          "库存管理",
          "库存总览",
          "出入库流水",
          "库存查询",
          "临期库存",
          "采购管理",
          "销售管理",
          "财务结算中心",
          "股东权益中心",
          "审批中心",
          "经营分析",
          "主数据中心",
          "个人中心 / 修改密码",
          "⚠️",
          "影子模式：正在以 王玮华 身份查看（由 admin 发起）— 仅用于测试/排障，操作会以该用户身份执行",
          "1",
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
          "pasted-screenshot-1783383528457-1.png",
          "退出",
          "仓储管理",
          "/仓库看板",
          "/",
          "仓库看板",
          "·全仓储实时监控 · 0 个库区 · 实时库存数据",
          "·",
          "单位",
          "单",
          "批",
          "库区状态",
          "快捷入口",
          "临期预警",
          "库存台账",
          "今日出入库动态",
          "本月汇总",
          "总入库单数",
          "0",
          "总出库单数",
          "库区满载预警",
          "临期批次"
        ],
        "interactiveElements": [
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 220,
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
              "w": 220,
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
              "w": 220,
              "x": 0,
              "y": 195
            },
            "label": "经营仪表盘",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.sidebar-module__C8A-ya__groupActive",
            "rect": {
              "h": 38,
              "w": 220,
              "x": 0,
              "y": 233
            },
            "label": "库存管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.sidebar-module__C8A-ya__subActive",
            "rect": {
              "h": 32,
              "w": 220,
              "x": 0,
              "y": 271
            },
            "label": "库存总览",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 220,
              "x": 0,
              "y": 303
            },
            "label": "出入库流水",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 220,
              "x": 0,
              "y": 335
            },
            "label": "库存查询",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 220,
              "x": 0,
              "y": 367
            },
            "label": "临期库存",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 220,
              "x": 0,
              "y": 399
            },
            "label": "采购管理",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 220,
              "x": 0,
              "y": 437
            },
            "label": "销售管理",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 220,
              "x": 0,
              "y": 475
            },
            "label": "财务结算中心",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 220,
              "x": 0,
              "y": 513
            },
            "label": "股东权益中心",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 220,
              "x": 0,
              "y": 551
            },
            "label": "审批中心",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 220,
              "x": 0,
              "y": 589
            },
            "label": "经营分析",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 220,
              "x": 0,
              "y": 627
            },
            "label": "主数据中心",
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
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 100,
              "x": 1482,
              "y": 7
            },
            "label": "退出影子模式",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".admin-module__uYgI-a__headerSelect",
            "rect": {
              "h": 30,
              "w": 96,
              "x": 1021,
              "y": 53
            },
            "label": "🇨🇳 中文 🇱🇦 ລາວ 🇬🇧 English",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 34,
              "w": 34,
              "x": 1178,
              "y": 51
            },
            "label": "1",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".bug-intake-module__OBjRZW__feedbackButton",
            "rect": {
              "h": 40,
              "w": 122,
              "x": 1226,
              "y": 48
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
              "y": -44
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
              "y": 179
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
              "y": 261
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
              "y": 341
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
              "y": 482
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
              "y": 482
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
              "x": 768,
              "y": 662
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
              "w": 136,
              "x": 1362,
              "y": 52
            },
            "label": "王 王玮华 孟赛/东鹏蛋鸡场 出纳",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-module__uYgI-a__logoutBtn",
            "rect": {
              "h": 30,
              "w": 68,
              "x": 1512,
              "y": 53
            },
            "label": "退出",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 36,
              "w": 83,
              "x": 1493,
              "y": 128
            },
            "label": "刷新",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".block",
            "rect": {
              "h": 98,
              "w": 284,
              "x": 244,
              "y": 415
            },
            "label": "库存查询 按批次/库位/品目/到期日多维查询。",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".block",
            "rect": {
              "h": 98,
              "w": 284,
              "x": 540,
              "y": 415
            },
            "label": "临期预警 14 天内临期批次提示与紧急处置入口。",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".block",
            "rect": {
              "h": 98,
              "w": 284,
              "x": 835,
              "y": 415
            },
            "label": "库存台账 inv_batches 唯一台账,所有动作全可追溯。",
            "disabled": false
          }
        ]
      },
      "devicePixelRatio": 2
    },
    "consoleErrors": [],
    "failedRequests": [
      {
        "url": "/api/crud/wms_zones?limit=100&offset=0",
        "method": "GET",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-07T00:18:07.780Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"权限不足：您（角色=ROLE_MENGSAI_DONGPENG_TREASURER）无权 GET 访问 [wms_zones]，需 menu=MENU_WMS_INOUT 的对应权限\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/crud/wms_inbound?limit=200&offset=0",
        "method": "GET",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-07T00:18:07.780Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"权限不足：您（角色=ROLE_MENGSAI_DONGPENG_TREASURER）无权 GET 访问 [wms_inbound]，需 menu=MENU_WMS_INOUT 的对应权限\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/crud/wms_outbound?limit=200&offset=0",
        "method": "GET",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-07T00:18:07.780Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"权限不足：您（角色=ROLE_MENGSAI_DONGPENG_TREASURER）无权 GET 访问 [wms_outbound]，需 menu=MENU_WMS_INOUT 的对应权限\",\"error\":\"Forbidden\",\"statusCode\":403}"
      }
    ],
    "localEvidence": {
      "localAttachments": [
        {
          "fileName": "01-1783383618124-3188771d.png",
          "originalName": "pasted-screenshot-1783383528457-1.png",
          "mimeType": "image/png",
          "sourceEndpoint": "/api/bug-intake/reports/BUG-20260707-0002/attachments/01-1783383618124-3188771d.png",
          "localPath": "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260707-082222/BUG-20260707-0002/attachments/01-1783383618124-3188771d.png",
          "sizeBytes": 495164
        }
      ],
      "localAttachmentPaths": [
        "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260707-082222/BUG-20260707-0002/attachments/01-1783383618124-3188771d.png"
      ]
    }
  },
  "priority": "P2",
  "reporter": {
    "name": "王玮华",
    "roles": [
      "ROLE_MENGSAI_DONGPENG_TREASURER",
      "ROLE_FIN_ACCT"
    ],
    "username": "wangweihua",
    "companyCode": "",
    "projectCode": ""
  },
  "severity": "MEDIUM",
  "agentPlan": {
    "source_bug_no": "BUG-20260707-0002",
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
    "hard_constraints": [
      "no automatic production deploy",
      "no automatic DB write",
      "no automatic migration",
      "human approval required before code repair execution"
    ],
    "source_repair_task_no": "BUGTASK-20260707-0002"
  },
  "createdAt": "2026-07-07T00:22:01.553Z",
  "createdBy": "admin",
  "moduleCode": "____",
  "suggestedOwner": "_____",
  "repairGuardrails": {
    "autoRepairExecuted": false,
    "noProductionDeploy": true,
    "noDbWriteWithoutGate": true,
    "requiresHumanApproval": true
  },
  "acceptanceCriteria": "账号有权限查看就不要报错403权限不足，若没有权限查看直接隐藏左侧菜单",
  "agentPlanGeneratedAt": "2026-07-07T00:22:02.707Z",
  "agentPlanGeneratedBy": "admin",
  "agentExecutionApproval": {
    "approved": true,
    "approvedAt": "2026-07-07T00:22:03.901Z",
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

- /Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260707-082222/BUG-20260707-0002/attachments/01-1783383618124-3188771d.png

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
我先做合约要求的目录、分支、工作区和最近提交检查；如果这些不匹配会直接停，不会进入代码审计。
exec
/bin/zsh -lc pwd in /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate
 succeeded in 0ms:
/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate

exec
/bin/zsh -lc 'git branch --show-current' in /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate
 succeeded in 0ms:
w5-a2-security-regression-gate

exec
/bin/zsh -lc 'git log --oneline --decorate -8' in /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate
 succeeded in 0ms:
beefce6e (HEAD -> w5-a2-security-regression-gate) docs(ops): record a2 security gate for home kpi bug
4ef76aa2 docs(ops): record a2 security gate for cash account bug
7bd5c23f docs(ops): record baseline lifecycle report
83b70cca docs(ops): record baseline lifecycle report
306e7d86 docs(ops): prioritize production readiness remediation tasks
8ebf8089 docs(ops): record baseline lifecycle report
e26335fb chore(ops): add agent inbox short command mode
ccff7ca2 docs(ops): record baseline lifecycle report

exec
/bin/zsh -lc 'git status --short' in /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate
 succeeded in 0ms:
codex
检查通过：当前目录和分支正确，工作区干净。现在只做只读审计，重点看 `/warehouse` 前端请求、CRUD 表权限映射、菜单/RBAC 显示逻辑是否一致。
exec
/bin/zsh -lc "rg --files apps/api | rg 'crud|permission|rbac|menu|auth|data-scope|wms'" in /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate
 succeeded in 0ms:
apps/api/src/modules/permissions/entities/sys-role.entity.ts
apps/api/src/modules/permissions/entities/sys-role-conflict.entity.ts
apps/api/src/modules/permissions/entities/sys-menu.entity.ts
apps/api/src/modules/permissions/entities/sys-role-menu-permission.entity.ts
apps/api/src/modules/permissions/entities/sys-user-role.entity.ts
apps/api/src/modules/permissions/permissions.module.ts
apps/api/src/modules/permissions/permissions.service.ts
apps/api/src/modules/permissions/permission-sets.service.ts
apps/api/src/modules/permissions/permissions.controller.ts
apps/api/src/modules/permissions/permission-sets.controller.ts
apps/api/src/modules/permission-sets/permission-sets.module.ts
apps/api/src/modules/permission-sets/permission-sets.service.ts
apps/api/src/modules/permission-sets/permission-sets.controller.ts
apps/api/src/modules/data-quality/services/data-scope-audit.service.ts
apps/api/src/modules/org/entities/sys-data-scope.entity.ts
apps/api/src/modules/org/guards/data-scope.guard.ts
apps/api/src/modules/org/services/data-scope.service.ts
apps/api/src/modules/org/helpers/data-scope.helper.ts
apps/api/src/modules/org/dto/update-data-scope.dto.ts
apps/api/ddl/09_rbac_advanced.sql
apps/api/ddl/18_mobile_menu_permissions.sql
apps/api/ddl/10_rbac_complete_matrix.sql
apps/api/ddl/01_create_rbac_tables.sql
apps/api/migrations/20260606_rbac_orphan_menus_backfill.sql
apps/api/migrations/20260602_production_inventory_source_mode_phase_p1a_b_menus.sql
apps/api/migrations/20260602_finance_authority_phase1_c_menu_visibility.sql
apps/api/scripts/init_wms_tables.ts
apps/api/scripts/run_wms_test.sh
apps/api/migrations/20260606_g5a_rbac_matrix_backfill.sql
apps/api/migrations/20260608_g20_menu_granularity.sql
apps/api/migrations/20260608_g35_fin_cash_menu_granularity.sql
apps/api/migrations/20260527_v2_menu_rbac_seed.sql
apps/api/migrations/20260602_finance_authority_phase1_b_user_binding.sql
apps/api/scripts/test_auth.js
apps/api/migrations/20260615_g118a_permission_sets_seed.sql
apps/api/migrations/20260602_production_chain_convergence_phase1_b_menus.sql
apps/api/migrations/20260602_finance_authority_phase1_d_expense_approval.sql
apps/api/migrations/20260602_finance_authority_phase2_b_shareholder_scope.sql
apps/api/scripts/wms-regression.sh
apps/api/scripts/test_wms_flow.js
apps/api/migrations/20260602_finance_authority_phase1_a_org_roles.sql
apps/api/migrations/20260611_g83_sales2_price_menu_grant.sql
apps/api/migrations/20260601_finance_hardening_p2_menu_visibility.sql
apps/api/migrations/20260608_g33_farm_master_menu.sql
apps/api/migrations/20260608_g23_ar_ap_expense_menu_split.sql
apps/api/migrations/20260602_finance_authority_phase2_a_datascope_company.sql
apps/api/migrations/20260603_r5_traceability_indexes_menus.sql
apps/api/migrations/20260527_rbac_permission_fix.sql
apps/api/migrations/archive/v12_mobile_rbac_dynamic.sql
apps/api/src/modules/generic-crud/generic-crud.controller.ts
apps/api/src/modules/generic-crud/generic-crud.service.ts
apps/api/src/modules/generic-crud/generic-crud.module.ts
apps/api/src/modules/generic-crud/crud.constants.ts
apps/api/src/modules/chanjet/chanjet-auth.service.ts
apps/api/src/modules/wms/outbound.controller.ts
apps/api/src/modules/wms/inbound.controller.ts
apps/api/src/modules/wms/wms.module.ts
apps/api/src/common/guards/menu-registry.service.ts
apps/api/src/common/guards/menu.guard.ts
apps/api/src/modules/wms/wms.service.ts
apps/api/src/modules/product-master/controllers/menu-admin.controller.ts
apps/api/src/modules/wms/inventory.controller.ts
apps/api/src/modules/wms/inventory/inventory.service.spec.ts
apps/api/src/modules/wms/inventory/inventory.service.ts
apps/api/src/common/filters/auth-exception.filter.ts
apps/api/src/modules/wms/entities/wms-location.entity.ts
apps/api/src/modules/wms/entities/wms-stock-ledger.entity.ts
apps/api/src/modules/wms/entities/wms-stock-balance.entity.ts
apps/api/src/auth/jwt.strategy.ts
apps/api/src/auth/jwt-rotation.spec.ts
apps/api/src/auth/auth.controller.ts
apps/api/src/auth/permissions-resolver.spec.ts
apps/api/src/auth/auth.service.ts
apps/api/src/auth/permissions-resolver.ts
apps/api/src/auth/entities/sys-user.entity.ts
apps/api/src/auth/auth.module.ts
apps/api/src/auth/permissions.util.ts

exec
/bin/zsh -lc "rg --files apps/web | rg 'warehouse|wms|admin|sidebar|menu'" in /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate
 succeeded in 0ms:
apps/web/src/components/layout/sidebar.module.css
apps/web/src/components/ui/admin-ui.module.css
apps/web/src/app/(admin)/store/page.tsx
apps/web/src/app/(admin)/store/receiving/page.tsx
apps/web/src/app/(admin)/store/inventory/page.tsx
apps/web/src/app/(admin)/store/replenish/page.tsx
apps/web/src/app/(admin)/store/daily/page.tsx
apps/web/src/app/(admin)/store/store.module.css
apps/web/src/app/(admin)/store/losses/page.tsx
apps/web/src/app/(admin)/analytics/analytics.module.css
apps/web/src/app/(admin)/analytics/page.tsx
apps/web/src/app/(admin)/analytics/production/page.tsx
apps/web/src/app/(admin)/analytics/inventory/page.tsx
apps/web/src/app/(admin)/analytics/feed/page.tsx
apps/web/src/app/(admin)/packaging/page.tsx
apps/web/src/app/(admin)/analytics/price-review/page.tsx
apps/web/src/app/(admin)/packaging/daily-report/page.tsx
apps/web/src/app/(admin)/notifications/page.tsx
apps/web/src/app/(admin)/packaging/inbound/page.tsx
apps/web/src/app/(admin)/packaging/batch/page.tsx
apps/web/src/app/(admin)/shareholders/scopes/page.tsx
apps/web/src/app/(admin)/shareholders/page.tsx
apps/web/src/app/(admin)/packaging/print-logs/page.tsx
apps/web/src/app/(admin)/shareholders/equity/page.tsx
apps/web/src/app/(admin)/packaging/exceptions/page.tsx
apps/web/src/app/(admin)/shareholders/SummaryBar.tsx
apps/web/src/app/(admin)/shareholders/dashboard/page.tsx
apps/web/src/app/(admin)/daily-work/page.tsx
apps/web/src/app/(admin)/shareholders/projects/page.tsx
apps/web/src/app/(admin)/shareholders/contributions/page.tsx
apps/web/src/app/(admin)/shareholders/capital/page.tsx
apps/web/src/app/(admin)/shareholders/capital/import/page.tsx
apps/web/src/app/(admin)/shareholders/capital/[id]/page.tsx
apps/web/src/app/(admin)/warehouse/loss-report/page.tsx
apps/web/src/app/(admin)/warehouse/daily-close/page.tsx
apps/web/src/app/(admin)/warehouse/page.tsx
apps/web/src/app/(admin)/warehouse/query/page.tsx
apps/web/src/app/(admin)/warehouse/expiry/page.tsx
apps/web/src/app/(admin)/warehouse/outbound/page.tsx
apps/web/src/app/(admin)/warehouse/inbound/page.tsx
apps/web/src/app/(admin)/warehouse/locations/page.tsx
apps/web/src/app/(terminal)/terminal/packaging/warehouse-handover/page.tsx
apps/web/src/app/(admin)/warehouse/stocktake/page.tsx
apps/web/src/app/(admin)/warehouse/source-mode/page.tsx
apps/web/src/app/(admin)/warehouse/warehouse.module.css
apps/web/src/app/(admin)/warehouse/transfer/page.tsx
apps/web/src/app/(admin)/warehouse/zones/page.tsx
apps/web/src/app/(admin)/warehouse/warehouses/page.tsx
apps/web/src/app/(admin)/warehouse/ledger/page.tsx
apps/web/src/app/(admin)/loading.tsx
apps/web/src/app/(admin)/layout.tsx
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
apps/web/src/app/(admin)/store-payment/page.tsx
apps/web/src/app/(admin)/store-payment/store-payment.module.css
apps/web/src/app/(admin)/traceability/page.tsx
apps/web/src/app/(admin)/workflow/form-designer/[id]/page.tsx
apps/web/src/app/(admin)/finance2/reports/page.tsx
apps/web/src/app/(admin)/finance2/page.tsx
apps/web/src/app/(admin)/workflow/forms/page.tsx
apps/web/src/app/(admin)/finance2/fund-transfers/page.tsx
apps/web/src/app/(admin)/workflow/forms/runtime/page.tsx
apps/web/src/app/(admin)/workflow/forms/submit/[formCode]/page.tsx
apps/web/src/app/(admin)/workflow/monitor/page.tsx
apps/web/src/app/(admin)/finance2/ar/page.tsx
apps/web/src/app/(admin)/workflow/tasks/cc/page.tsx
apps/web/src/app/(admin)/workflow/tasks/done/page.tsx
apps/web/src/app/(admin)/workflow/tasks/todo/page.tsx
apps/web/src/app/(admin)/workflow/metrics/page.tsx
apps/web/src/app/(admin)/finance2/ar-ledger/page.tsx
apps/web/src/app/(admin)/sales2/channels/page.tsx
apps/web/src/app/(admin)/finance2/reimbursements/page.tsx
apps/web/src/app/(admin)/sales2/reports/page.tsx
apps/web/src/app/(admin)/sales2/pricing/page.tsx
apps/web/src/app/(admin)/sales2/page.tsx
apps/web/src/app/(admin)/data-quality/page.tsx
apps/web/src/app/(admin)/finance2/shareholder-funds/page.tsx
apps/web/src/app/(admin)/sales2/orders/page.tsx
apps/web/src/app/(admin)/finance2/chanjet-sync/page.tsx
apps/web/src/app/(admin)/sales2/returns/page.tsx
apps/web/src/app/(admin)/finance2/expenses/page.tsx
apps/web/src/app/(admin)/procurement2/orders/page.tsx
apps/web/src/app/(admin)/sales2/delivery/page.tsx
apps/web/src/app/(admin)/finance2/cash-accounts/page.tsx
apps/web/src/app/(admin)/procurement2/init/page.tsx
apps/web/src/app/(admin)/sales2/inventory/page.tsx
apps/web/src/app/(admin)/finance2/ap/page.tsx
apps/web/src/app/(admin)/procurement2/receipts/page.tsx
apps/web/src/app/(admin)/procurement2/orders/[id]/edit/page.tsx
apps/web/src/app/(admin)/sales2/credit/page.tsx
apps/web/src/app/(admin)/finance2/ar-reconciliation/page.tsx
apps/web/src/app/(admin)/store-pos/page.tsx
apps/web/src/app/(admin)/procurement2/orders/new/page.tsx
apps/web/src/app/(admin)/procurement2/orders/OrderForm.tsx
apps/web/src/app/(admin)/sales2/customers/page.tsx
apps/web/src/app/(admin)/pilot-run/page.tsx
apps/web/src/app/(admin)/procurement2/_shared/actionButtons.ts
apps/web/src/app/(admin)/master/page.tsx
apps/web/src/app/(admin)/procurement2/dashboard/page.tsx
apps/web/src/app/(admin)/master/orgs/page.tsx
apps/web/src/app/(admin)/quality/standards/page.tsx
apps/web/src/app/(admin)/procurement2/requests/page.tsx
apps/web/src/app/(admin)/master/farms/page.tsx
apps/web/src/app/(admin)/breeding/daily-inbound/page.tsx
apps/web/src/app/(admin)/breeding/page.tsx
apps/web/src/app/(admin)/quality/forward/page.tsx
apps/web/src/app/(admin)/quality/page.tsx
apps/web/src/app/(admin)/master/stores/page.tsx
apps/web/src/app/(admin)/breeding/egg-ledger/page.tsx
apps/web/src/app/(admin)/quality/product/page.tsx
apps/web/src/app/(admin)/quality/quality.module.css
apps/web/src/app/(admin)/procurement2/requests/[id]/edit/page.tsx
apps/web/src/app/(admin)/master/products/page.tsx
apps/web/src/app/(admin)/breeding/flock/page.tsx
apps/web/src/app/(admin)/quality/backward/page.tsx
apps/web/src/app/(admin)/procurement2/requests/new/page.tsx
apps/web/src/app/(admin)/procurement2/requests/RequestForm.tsx
apps/web/src/app/(admin)/profile/page.tsx
apps/web/src/app/(admin)/admin.module.css
apps/web/src/app/(admin)/breeding/device/page.tsx
apps/web/src/app/(admin)/quality/nonconformance/page.tsx
apps/web/src/app/(admin)/procurement2/shareholder-funds/page.tsx
apps/web/src/app/(admin)/breeding/device/[houseCode]/page.tsx
apps/web/src/app/(admin)/quality/farm/page.tsx
apps/web/src/app/(admin)/procurement2/projects/page.tsx
apps/web/src/app/(admin)/breeding/med-stock/page.tsx
apps/web/src/app/(admin)/uat/page.tsx
apps/web/src/app/(admin)/procurement2/suppliers/page.tsx
apps/web/src/app/(admin)/breeding/medicine/page.tsx
apps/web/src/app/(admin)/breeding/daily/page.tsx
apps/web/src/app/(admin)/home/page.tsx
apps/web/src/app/(admin)/breeding/breeding.module.css
apps/web/src/app/(admin)/procurement2/payments/PaymentForm.tsx
apps/web/src/app/(admin)/procurement2/payments/page.tsx
apps/web/src/app/(admin)/breeding/henhouse/page.tsx
apps/web/src/app/(admin)/system/backup/page.tsx
apps/web/src/app/(admin)/breeding/device-alerts/page.tsx
apps/web/src/app/(admin)/settings/notifications/page.tsx
apps/web/src/app/(admin)/procurement2/payments/[id]/edit/page.tsx
apps/web/src/app/(admin)/breeding/feed/page.tsx
apps/web/src/app/(admin)/breeding/device-ops/page.tsx
apps/web/src/app/(admin)/settings/dict/page.tsx
apps/web/src/app/(admin)/system/configs/page.tsx
apps/web/src/app/(admin)/procurement2/payments/new/page.tsx
apps/web/src/app/(admin)/breeding/immune/page.tsx
apps/web/src/app/(admin)/settings/pda-terminals/page.tsx
apps/web/src/app/(admin)/settings/page.tsx
apps/web/src/app/(admin)/procurement2/shipments/page.tsx
apps/web/src/app/(admin)/system/alerts/page.tsx
apps/web/src/app/(admin)/settings/pos-config/page.tsx
apps/web/src/app/(admin)/dashboard/page.tsx
apps/web/src/app/(admin)/settings/online-users/page.tsx
apps/web/src/app/(admin)/breeding/henreport/page.tsx
apps/web/src/app/(admin)/master-data/pending/page.tsx
apps/web/src/app/(admin)/dashboard/_components/dashboard.module.css
apps/web/src/app/(admin)/dashboard/_components/DashboardKPIs.tsx
apps/web/src/app/(admin)/dashboard/dashboard.module.css
apps/web/src/app/(admin)/system/health/page.tsx
apps/web/src/app/(admin)/settings/users/page.tsx
apps/web/src/app/(admin)/system/error-logs/page.tsx
apps/web/src/app/(admin)/master-data/companies/page.tsx
apps/web/src/app/(admin)/master-data/page.tsx
apps/web/src/app/(admin)/master-data/cash-accounts/page.tsx
apps/web/src/app/(admin)/settings/users/[id]/page.tsx
apps/web/src/app/(admin)/master-data/dictionaries/page.tsx
apps/web/src/app/(admin)/master-data/cash-accounts/new/page.tsx
apps/web/src/app/(admin)/settings/profile/page.tsx
apps/web/src/app/(admin)/master-data/bank-accounts/page.tsx
apps/web/src/app/(admin)/settings/master-data/page.tsx
apps/web/src/app/(admin)/master-data/bank-accounts/new/page.tsx
apps/web/src/app/(admin)/master-data/cash-accounts/[code]/edit/page.tsx
apps/web/src/app/(admin)/settings/permissions/page.tsx
apps/web/src/app/(admin)/master-data/quality/page.tsx
apps/web/src/app/(admin)/settings/approval-flows/page.tsx
apps/web/src/app/(admin)/master-data/bank-accounts/[code]/edit/page.tsx
apps/web/src/app/(admin)/master-data/suppliers/page.tsx
apps/web/src/app/(admin)/settings/permission-sets/page.tsx
apps/web/src/app/(admin)/master-data/vehicles/page.tsx
apps/web/src/app/(admin)/master-data/suppliers/new/page.tsx
apps/web/src/app/(admin)/settings/audit-log/page.tsx
apps/web/src/app/(admin)/master-data/governance/page.tsx
apps/web/src/app/(admin)/master-data/suppliers/[code]/page.tsx
apps/web/src/app/(admin)/settings/roles/page.tsx
apps/web/src/app/(admin)/master-data/product-grades/page.tsx
apps/web/src/app/(admin)/master-data/suppliers/[code]/edit/page.tsx
apps/web/src/app/(admin)/settings/roles/[code]/page.tsx
apps/web/src/app/(admin)/master-data/user-orgs/page.tsx
apps/web/src/app/(admin)/master-data/products/page.tsx
apps/web/src/app/(admin)/settings/brand/page.tsx
apps/web/src/app/(admin)/settings/settings.module.css
apps/web/src/app/(admin)/master-data/operations/page.tsx
apps/web/src/app/(admin)/master-data/products/new/page.tsx
apps/web/src/app/(admin)/settings/security/page.tsx
apps/web/src/app/(admin)/master-data/stores/page.tsx
apps/web/src/app/(admin)/settings/store-stock/page.tsx
apps/web/src/app/(admin)/master-data/packaging-specs/page.tsx
apps/web/src/app/(admin)/master-data/products/[code]/edit/page.tsx
apps/web/src/app/(admin)/settings/approval-rules/page.tsx
apps/web/src/app/(admin)/master-data/projects/page.tsx
apps/web/src/app/(admin)/master-data/drivers/page.tsx
apps/web/src/app/(admin)/settings/data-scopes/page.tsx
apps/web/src/app/(admin)/master-data/warehouses/page.tsx
apps/web/src/app/(admin)/settings/organizations/page.tsx
apps/web/src/app/(admin)/master-data/materials/page.tsx
apps/web/src/app/(admin)/master-data/organizations/page.tsx
apps/web/src/app/(admin)/master-data/business-units/page.tsx
apps/web/src/app/(admin)/master-data/product-skus/page.tsx
apps/web/src/app/(admin)/master-data/customers/page.tsx
apps/web/src/app/(admin)/master-data/customers/new/page.tsx
apps/web/src/app/(admin)/master-data/customers/[code]/page.tsx
apps/web/src/app/(admin)/master-data/customers/[code]/edit/page.tsx

exec
/bin/zsh -lc "rg -n \"wms_zones|wms_inbound|wms_outbound|MENU_WMS_INOUT|/warehouse|warehouse\" apps/web apps/api docs scripts -g '"'!node_modules'"'" in /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate
 succeeded in 0ms:
apps/web/src/lib/packaging-api.ts:169:    request<{ code: string }>('POST', '/api/packaging/terminal/warehouse/confirm', body),
docs/operation-validation-phase-o1.md:26:**操作**（车间，真实 HTTP）：开班选 FARM-MS → 集蛋接收 → 分级 → 包装 → 成品交接（warehouse/confirm）。
scripts/smoke-test.sh:13:#   3. 核心 lookup endpoint：houses/customers/warehouses（DictSelect 依赖）
scripts/smoke-test.sh:65:check "lookup/warehouses count"  "$CURL_PREFIX -H '$AUTH' $API/api/lookup/warehouses | python3 -c 'import sys,json; print(len(json.load(sys.stdin).get(\"data\",[])))'" "^[1-9]"
apps/web/src/lib/workflow-data-catalog.ts:120:    table: "wms_warehouses",
apps/web/src/lib/workflow-data-catalog.ts:121:    valueField: "warehouse_code",
apps/web/src/lib/workflow-data-catalog.ts:122:    labelField: "warehouse_name_zh",
apps/web/src/lib/workflow-data-catalog.ts:125:      { key: "warehouse_code", label: "仓库编码", usage: "作为提交值" },
apps/web/src/lib/workflow-data-catalog.ts:126:      { key: "warehouse_name_zh", label: "仓库名称", usage: "作为页面显示" },
apps/web/src/lib/workflow-templates.ts:131:      { key: "warehouse", label: "仓库/门店", type: "text", required: true },
apps/web/src/lib/workflow-templates.ts:137:    approvals: [{ id: "warehouse_review", name: "仓储负责人审批", role: "ROLE_WMS_MGR" }, { id: "finance_record", name: "财务备案", role: "ROLE_FIN_ACCT" }],
scripts/go-live-data-reset.sql:32:    'wms_inbound_items','wms_inbound',
apps/web/src/lib/design-tokens.ts:316:  warehouse:   '#0891b2',
docs/g22-schema-governance.md:12:| G15 | mig fail：`UPDATE inv_ledger SET warehouse_code=...` 列不存在 | 凭印象写列名，CI 测试库与生产 schema 不一致 |
docs/g9-business-mapping.md:52:| warehouse_code | SITE-MENGSAI-LAYER | ✓ WarehouseSelector | ✓ |
docs/g9-business-mapping.md:162:仓储：MENU_WMS_VIEW:V / MENU_WMS_INOUT:V,C / MENU_INV_BATCH:V,C,E
docs/g9-business-mapping.md:177:| 仓库收发员 | `ROLE_WH_CLERK` / `ROLE_WMS_OP` | MENU_WMS_INOUT | ✅ |
scripts/migrate_v2_to_v3.py:94:    "wms_inbound":        {"arrive_time", "arrival_time", "inbound_time",
scripts/migrate_v2_to_v3.py:102:    "wms_inbound": {"task_no":    lambda row: f"WMS-MIG-{row.get('inbound_no', 'NA')}"},
docs/sales-v2-architecture-audit.md:62:| `/warehouse` | 仓库管理（WMS 前端，有真实后端）|
docs/sales-v2-architecture-audit.md:83:| `wms_warehouses` | 仓库主档 | v3_schema_complete.sql | 存在 |
docs/sales-v2-architecture-audit.md:84:| `wms_outbound_items` | 出库明细 | v3_schema_complete.sql | 存在 |
docs/sales-v2-architecture-audit.md:195:warehouse_code（出库仓库）
docs/sales-v2-architecture-audit.md:316:| 多仓库 | ✅ `wms_warehouses` 存在，`inv_batches.warehouse_code` 有值，但查询中 warehouse 过滤不彻底 |
docs/sales-v2-architecture-audit.md:375:| 仓库主档 | ✅ `wms_warehouses` 存在 |
docs/sales-v2-architecture-audit.md:713:  company_code, channel_type, warehouse_code,
docs/sales-v2-architecture-audit.md:902:| WMS 入库（wms_inbound） | ✅ 可用 |
docs/uat-p0-phase1-runtime-validation.md:79:warehouse      wms_warehouses      ✓✓✓✓✓ rows=0
docs/uat-p0-phase1-runtime-validation.md:93:全部 HTTP 200 + 返回 JSON array。6 类业务数据为零（supplier/project/cash-account/product/bank-account/warehouse）但端点本身可用。
docs/uat-p0-phase1-runtime-validation.md:411:| 3 | 6 类空表录入业务数据（supplier/project/cash-account/product/bank-account/warehouse） | P1 |
docs/uix-prod1-product-experience-reconstruction.md:273:  customers / suppliers / products / warehouses / projects / product-skus /
scripts/check-master-data-references.mjs:53:  'wms_warehouses',              // user 拍板 #1:仓库 ≠ site,独立 canonical
docs/rbac-production-hardening-audit.md:60:| MENU_WMS_INOUT | *(Sidebar引用)* | ❌ 未注册 |
docs/rbac-production-hardening-audit.md:372:**WMS_OUTBOUND/WMS_INBOUND 未注册风险**：这两个 MENU 在 rbac.matrix.ts 中有定义（MENU_WMS_INBOUND, MENU_WMS_OUTBOUND），但 Sidebar 引用的是 `MENU_WMS_INOUT`（**未注册**）。意味着：
docs/rbac-production-hardening-audit.md:422:| 仓库看板 `/warehouse` | `MENU_WMS_VIEW` | 后端 WMS inventory 使用 `MENU_INVENTORY` | ❌ 不一致，Sidebar 未注册 MENU 会显示但 403 |
docs/rbac-production-hardening-audit.md:423:| 入库管理 `/warehouse/inbound` | `MENU_WMS_INOUT` | 后端使用 `MENU_WMS_INBOUND` | ❌ 不一致 |
docs/rbac-production-hardening-audit.md:424:| 出库管理 `/warehouse/outbound` | `MENU_WMS_INOUT` | 后端使用 `MENU_WMS_OUTBOUND` | ❌ 不一致 |
docs/rbac-production-hardening-audit.md:501:| C3 | **WMS 仓库功能实际全面不可用** | `Sidebar.tsx` + `rbac.matrix.ts` | Sidebar 使用 MENU_WMS_VIEW/MENU_WMS_INOUT/MENU_WMS_MASTER，后端 controller 使用 MENU_WMS/MENU_WMS_INBOUND/MENU_WMS_OUTBOUND/MENU_INVENTORY，MENU 不匹配导致所有 WMS 接口对非 ADMIN 用户 403 |
docs/rbac-production-hardening-audit.md:511:| H5 | **12 个 MENU 代码在 Sidebar 引用但未在矩阵注册** | `Sidebar.tsx` → `rbac.matrix.ts` | 注册 MENU_WMS_VIEW, MENU_WMS_INOUT, MENU_WMS_MASTER, MENU_QA_OP, MENU_QA_MGR, MENU_PKG_OP, MENU_PKG_MGR, MENU_FARM_VET, MENU_STORE_MGR, MENU_B2B_SALE, MENU_DASHBOARD, MENU_SETTINGS_USER |
docs/rbac-production-hardening-audit.md:536:   MENU_WMS_INOUT:  { ROLE_ADMIN: [...], ROLE_WMS_MGR: ['V','C','E','D','A','X'], ... },
docs/uix5-design-system-migration.md:113:| UIX6-03 | warehouse 16 → DocumentTemplate / TreePage 手工迁移 | 2d | P1 |
docs/g199-chanjet-permission-status.md:118:| 32541 | `POST` | `/accounting/openapi/cc/warehouse/list/{bookid}` | 查询仓库列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/ck?id=32541) |
docs/g199-chanjet-permission-status.md:119:| 32542 | `POST` | `/accounting/openapi/cc/warehouseCategory/list/{bookid}` | 查询仓库分类 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/ck?id=32542) |
apps/web/src/types/index.ts:128:  warehouseCode: string | null;
apps/web/src/types/index.ts:241:// ── 仓库 wms_warehouses ──────────────────────────────────────
apps/web/src/types/index.ts:243:  warehouse_code: string;
apps/web/src/types/index.ts:244:  warehouse_name: string;
apps/web/src/types/index.ts:253:  warehouse_code: string;
apps/web/src/types/index.ts:265:  warehouse_code: string;
scripts/g10_etl_mengsai_medicine.py:17:     · warehouse_code: 'MEDICINE'
scripts/g10_etl_mengsai_medicine.py:187:    sql.append(f"  INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code, company_code, source_type, source_no)")
scripts/g10_etl_mengsai_medicine.py:213:        sql.append(f"  INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, log_date, warehouse_code, company_code, note)")
scripts/g10_etl_mengsai_medicine.py:218:        sql.append(f"  INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, log_date, warehouse_code, company_code, note)")
scripts/g10_etl_mengsai_medicine.py:228:sql.append("-- SELECT count(*) FROM inv_batches WHERE warehouse_code='MEDICINE' AND store_code='SITE-MENGSAI-LAYER';  -- 期望 45")
scripts/g10_etl_mengsai_medicine.py:244:print(f"   - 45 inv_batches (MEDICINE warehouse)")
apps/web/src/types/packaging-terminal.ts:249:  warehouseId?: string;
apps/web/src/types/packaging-terminal.ts:347:  'warehouse-handover':  ['ROLE_WH_CLERK', 'ROLE_LINE_SUPERVISOR'],
docs/ERP_BUSINESS_AGENT_AUDIT.md:49:| `prc2_order_items` | `project_code`(允许跨项目)/ `product_code` / `item_code` / `warehouse_code` |
docs/ERP_BUSINESS_AGENT_AUDIT.md:50:| `prc2_request_items` | `project_code` / `item_code` / `warehouse_code` |
docs/ERP_BUSINESS_AGENT_AUDIT.md:54:| `prc2_receipts` | `company_code` / `project_code` / `warehouse_code` / `po_id` |
docs/ERP_BUSINESS_AGENT_AUDIT.md:68:- **DataScope** `prc2_receipts` 已用 `warehouseField='warehouseCode'`(G85-C);其余 service 未完全验证
docs/ERP_BUSINESS_AGENT_AUDIT.md:136:- `wms_inbound` / `wms_inbound_items` — `warehouse_code` / `store_code` / `task_no`
docs/ERP_BUSINESS_AGENT_AUDIT.md:137:- `wms_transfer` — `from_warehouse` / `to_warehouse` / `operator_id`
docs/ERP_BUSINESS_AGENT_AUDIT.md:139:- `wms_zones` — `warehouse_code`
docs/ERP_BUSINESS_AGENT_AUDIT.md:140:- `wms_locations` — `warehouse_code` / `zone_code` / `store_code`(默认 `ALL`)
docs/ERP_BUSINESS_AGENT_AUDIT.md:141:- `wms_stock_balance` — `warehouse_code` / `location_code` / `spec_code` / `batch_no` / `store_code`
docs/ERP_BUSINESS_AGENT_AUDIT.md:145:- `inv_batches` — `batch_no` / `product_code` / `sku_code` / `warehouse_code` / `location_code` / `store_code` / `status`(AVAILABLE/QUARANTINE/EXPIRED/LOCKED)
docs/ERP_BUSINESS_AGENT_AUDIT.md:168:| `MENU_WMS_INOUT` (V/C/E) | `wms/inbound.controller.ts:13-31` / `outbound.controller.ts:13-37` | 入出库 |
docs/ERP_BUSINESS_AGENT_AUDIT.md:206:- 数据源(1911-1920):`SYS_USERS / SYS_ROLES / SYS_ORGS` + 业务表 `sal_customers / prc_suppliers / wms_warehouses / mst_stores`
docs/ERP_BUSINESS_AGENT_AUDIT.md:230:| `/lookup/warehouses` / `/lookup/stores` / `/lookup/farms` | — | 支持 type / companyCode |
docs/ERP_BUSINESS_AGENT_AUDIT.md:234:| `/crud/wms_zones` / `/crud/wms_locations` | 257 / 275 | **绕过 lookup,直接 crud**,每次 `pageSize=500` 全拉 |
docs/ERP_BUSINESS_AGENT_AUDIT.md:250:4. 🟡 **`/crud/wms_zones` / `/crud/wms_locations` 绕过 lookup**:无缓存、无 DataScope hint,每次 500 条全拉
docs/ERP_BUSINESS_AGENT_AUDIT.md:265:| wms | company_code(隐式) | — | store_code(语义二义)| — | — | product_code / sku_code | MENU_WMS_INOUT / MENU_INV_BATCH | INV_STOCK_STATUS(未真正接) |
docs/ERP_BUSINESS_AGENT_AUDIT.md:296:13. `/lookup/companies` 端点补 DataScope;`/crud/wms_zones` 端点改用 `/lookup/*` 形态
docs/master-data-phase3-audit.md:418:| 仓库 | `/warehouse/*` | ✅ 实现 | — |
docs/M1_ORGANIZATION_MODEL_DECISIONS.md:27:| C-7 | sys_organizations PROJECT/WAREHOUSE 占位行 | **保留 + 只读化**：占位行存在；canonical 主权在 biz_projects / wms_warehouses；占位行仅可改 status | 本 wave 文档化；M3 子文档定细则 | 物理删除占位行永禁；新建 sys_organizations.PROJECT/WAREHOUSE 行需走特批 |
docs/M1_ORGANIZATION_MODEL_DECISIONS.md:115:          解出该 org 的 (company_code, project_code, site_code, warehouse_code)
docs/M1_ORGANIZATION_MODEL_DECISIONS.md:128:          sys_user_warehouse_scopes → allowedWarehouseCodes 取并集
docs/M1_ORGANIZATION_MODEL_DECISIONS.md:435:| canonical 主权 | 永远在 `biz_projects` / `wms_warehouses`；占位行**仅作 org 树展示** |
docs/M1_ORGANIZATION_MODEL_DECISIONS.md:443:- 永久双轨不是问题：只要主权清晰（biz_projects / wms_warehouses 是唯一写权威）+ 占位行只读，无运行时歧义
docs/M1_ORGANIZATION_MODEL_DECISIONS.md:462:| 新建仓库 | 必须走 wms_warehouses（master-data-runtime/warehouse）；不再产生 sys_organizations 行 |
docs/M1_ORGANIZATION_MODEL_DECISIONS.md:464:| 业务 service 查 project / warehouse | 一律读 canonical 表，不读占位行 |
docs/M1_ORGANIZATION_MODEL_DECISIONS.md:505:| #1 仓库 ≠ site | C-7 保留 sys_organizations(WAREHOUSE) 占位行不与本拍板冲突；canonical 仍是 wms_warehouses |
apps/web/src/middleware.ts:36:  '/warehouse',
scripts/uat-runner.sh:170:  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/crud/wms_inbound?limit=20" -H "Authorization: Bearer $TK")
scripts/uat-runner.sh:171:  [ "$HTTP" = "200" ] && record P1 P1-4.3 wms test_wms PASS "GET wms_inbound" "$HTTP" 200 || record P1 P1-4.3 wms test_wms FAIL "GET wms_inbound" "$HTTP" 200
scripts/uat-runner.sh:269:  $PSQL "$DB" -q -c "INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code) VALUES ('$P2_BATCH','PRD-EGG-1',1000,1000,'AVAILABLE','WMS-VTE-MAIN','ALL');" >/dev/null
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:299:      moduleCode: 'MENU_MASTER_DATA', tableName: 'wms_warehouses',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:301:      onApproved: mdAuditHook('WAREHOUSE', 'wms_warehouses', 'warehouse_code', 'APPROVE_ACTIVE'),
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:302:      onRejected: mdAuditHook('WAREHOUSE', 'wms_warehouses', 'warehouse_code', 'REJECT'),
docs/organization-runtime-phase1-report.md:91:| GET | `/api/organizations/user-scopes/:userId` | MENU_ORG_VIEW | V | 用户组织授权范围（含 projects + warehouses） |
docs/organization-runtime-phase1-report.md:113:| GET | `/api/org/user-scopes/:userId` | MENU_SYS_ORG | V | 用户额外授权（project+warehouse） |
docs/organization-runtime-phase1-report.md:116:| POST | `/api/org/user-scopes/warehouse` | MENU_SYS_ORG | C | 新增仓库授权 |
docs/organization-runtime-phase1-report.md:117:| DELETE | `/api/org/user-scopes/warehouse/:id` | MENU_SYS_ORG | D | 移除仓库授权 |
docs/g55d-master-data-governance-finalization.md:130:- `sys_user_warehouse_scopes` ←  额外仓库授权
docs/g55d-master-data-governance-finalization.md:180:product / store / bank-account / sku / warehouse /
scripts/seed-uat-fixture.sh:54:  PSQLQ -c "DELETE FROM wms_inbound         WHERE task_no  LIKE 'UAT-%';"
scripts/seed-uat-fixture.sh:55:  PSQLQ -c "DELETE FROM wms_outbound        WHERE task_no  LIKE 'UAT-%' OR outbound_no LIKE 'UAT-%';"
scripts/seed-uat-fixture.sh:133:INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code)
scripts/seed-uat-fixture.sh:137:INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code)
scripts/seed-uat-fixture.sh:141:INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, store_code)
docs/M1_ORGANIZATION_MODEL_REVIEW.md:37:| **WAREHOUSE** | `wms_warehouses` | `sys_organizations(org_type='WAREHOUSE')` "仅作为历史兼容；M3 子文档评估是否退役" | §6.2 canonical = wms_warehouses | 🟡 同上，退役与否未明 |
docs/M1_ORGANIZATION_MODEL_REVIEW.md:68:| SITE → WAREHOUSE（via wms_warehouses.mapped_site_code） | 单向 | ✅ 无环 |
docs/M1_ORGANIZATION_MODEL_REVIEW.md:123:| warehouse | sys_user_warehouse_scopes | `allowedWarehouseCodes` |
docs/M1_ORGANIZATION_MODEL_REVIEW.md:259:- 综合店仓（warehouse-store-combo）— 一个地点同时 STORE + WAREHOUSE
docs/M1_ORGANIZATION_MODEL_REVIEW.md:345:| W6 inv_batches 改造 | §6.4 | ✅ 维度对照保留 warehouse_code 不变 |
docs/production-inventory-integration-audit.md:51:- `onModuleInit()`：为 8 个等级（`0/1/2/3/4/5/DIRTY/BROKEN`）预建 8 个**固定累加批次** `EGG-STOCK-{grade}`，`product_code = EGG-{grade}`，`warehouse_code = 'FARM_EGG'`，无 `expire_date`、无 `egg_date`、无 `source_no`。
docs/production-inventory-integration-audit.md:71:3. `POST /api/packaging/tasks/:id/pack-complete` → `packComplete()`：包装结单 → 写 `inv_batches`（`PRD-EGG-{grade}-PACK`，`PACK_DONE` / `PACK_DONE_QUARANTINE`）+ **自动建 `wms_inbound` 任务**等待仓库验收上架。
docs/production-inventory-integration-audit.md:105:| warehouse_code | `FARM_EGG` | `WMS-VTE-MAIN` | 生产录入仓库 |
docs/production-inventory-integration-audit.md:135:        └─【闭环B 包装】pkg_shifts→pkg_tasks(分级/包装)→ inv_batches(PRD-EGG-*-PACK)→ wms_inbound
docs/production-inventory-integration-audit.md:153:`MENU_PKG_OP`（包装作业）、`MENU_PKG_MGR`（包装管理·含集蛋/批次）、`MENU_PACKAGE_RUN`、`MENU_WMS_VIEW`、`MENU_WMS_INOUT`（出入库作业）、`MENU_WMS_OP`、`MENU_WMS_MASTER`、`MENU_WMS_INBOUND`(API)、`MENU_WMS_OUTBOUND`(API)、`MENU_INVENTORY`、`MENU_SALES2_INVENTORY`。
docs/production-inventory-integration-audit.md:159:- 「库存入库」：`MENU_WMS_INOUT` → `/api/inbound/confirm`（写 `inv_batches`），与包装 `wms_inbound` 自动建单并存，无幂等校验。
docs/production-inventory-integration-audit.md:197:5. **库存入库管理**：`MENU_WMS_INOUT` / `/api/inbound/confirm` 明确仅用于采购/调拨/手工调整，禁止录包装成品；加幂等校验。
docs/production-inventory-integration-audit.md:230:- 前端：`sales2/inventory/page.tsx`、`warehouse/ledger/page.tsx`
docs/mdm-1-unified-model-design.md:40:业务表（brd_daily_logs / wms_inbound / pkg_tasks ...）
docs/mdm-1-unified-model-design.md:60:| wms_warehouses | ⏳ 保留 + 加 `mapped_site_code`（仓库挂在 WAREHOUSE site 下）| 当前空 |
docs/mdm-1-unified-model-design.md:175:| wms_inbound / wms_outbound | ❌ | ❌ | ✅ |
docs/mdm-1-unified-model-design.md:222:sys_user_warehouse_scopes     （额外仓库授权）
docs/mdm-1-unified-model-design.md:228:  -- 与 farm/warehouse 同层：当用户岗位需要单点站点（非 farm/warehouse 类）授权时
docs/mdm-1-unified-model-design.md:256:- + `sys_user_warehouse_scopes.warehouse_code` 通过 wms_warehouses.mapped_site_code 映射
docs/mdm-1-unified-model-design.md:299:| 9 | 是否新建 sys_user_site_scopes 表 | 是（与 farm/warehouse 同层）| 待确认 |
scripts/glp1a3_etl_mengsai_initial.py:117:  batch_no, product_code, qty, qty_available, status, warehouse_code, store_code,
docs/MASTER_DATA_W4_EXECUTION_PLAN.md:10:>   1. 仓库 ≠ site。`site_code` 表示场区/地点，`warehouse_code` 是具体库存仓。库存、FIFO、批次、库位必须用 `warehouse_code`。
docs/MASTER_DATA_W4_EXECUTION_PLAN.md:33:- ❌ 不动 `inv_batches.store_code → owning_company_code`（属 W6，user 拍板 #1 后还需 M3 重写，确认 warehouse_code 是库存唯一维度）
docs/MASTER_DATA_W4_EXECUTION_PLAN.md:45:| #1 仓库 ≠ site，库存维度用 `warehouse_code` | 本 wave 不重命名 `inv_batches.store_code`；本 wave 不写入 inv_batches / wms_warehouses 治理；governance 计数侧不混淆 site 与 warehouse | W6 E1：`inv_batches.store_code → owning_company_code` 同时**保留** `warehouse_code`；FIFO 维度=`(warehouse_code, sku_code)`。MASTER_DATA_PHASE2_DESIGN.md §5.5 需在 M3 子文档里重写 |
docs/MASTER_DATA_W4_EXECUTION_PLAN.md:48:| #4 shareholder scope 不并入 sys_user_scopes | 本 wave 不动 `shr_shareholder_scope`；不规划 `sys_user_scopes` 表；DataScope 输出层未来仍可暴露 `allowedShareholderCodes`（由 service 从 `shr_shareholder_scope` 计算后透传），底层不变 | W7+ sys_user_scopes 合表方案文档（M-Architect）只覆盖 4 张以 user_id 为主键的 scope 表（org / project / farm / warehouse），不动 shr_shareholder_scope |
docs/MASTER_DATA_W4_EXECUTION_PLAN.md:78:| WAREHOUSE | 仓库（树内占位） | `^(WH_\|SITE-)` | `[org_name, company_code]` | `[COMPANY, SITE]` | `[]` | canonical 走 wms_warehouses；树内占位（user 拍板 #1：仓库 ≠ site） |
docs/MASTER_DATA_W4_EXECUTION_PLAN.md:104:- ❌ **WAREHOUSE_LEGACY_CODE 不再适用**：仓库不属于 site，没必要把 warehouse 旧 code 映射到 site_code。仓库历史 code 的治理在 W5+ 单独走（属 wms 模块）。
docs/MASTER_DATA_W4_EXECUTION_PLAN.md:177:1. **canonical 表存在性**（sys_organizations / biz_projects / sal_customers / prc2_suppliers / mst_products / mst_materials / product_skus / mst_stores / wms_warehouses / fin_cash_accounts / fin_bank_accounts / sal_drivers / sys_dict / shr_shareholders / biz_business_units / biz_site_aliases / sys_organization_type_rules）—— 静态检查模块源码引用
docs/MASTER_DATA_W4_EXECUTION_PLAN.md:295:| W6 | M3 子文档（inv_batches 字段约束方案，**保留 warehouse_code** 不重命名为 owning_company_code） | user 拍板 #1 |
docs/g80-rbac-org-consolidation.md:63:  ∪ sys_user_project_scopes / sys_user_warehouse_scopes / sys_user_farm_scopes(跨组织额外授权)
docs/g80-rbac-org-consolidation.md:70:- 按 scope_level 在 `sys_organizations` 树展开（REGION 穿透同父公司，COMPANY 含其下场站），再并入 project/warehouse/farm 额外授权
docs/final-hardening-phase-f3-product-polish.md:65:| warehouse/source-mode subtitle | `统一进入 Sales V2 库存体系` | `统一进入库存体系` |
docs/packaging-runtime-convergence-validation-phase-p1d.md:30:- 库存接入：`warehouse/confirm` → `completeTerminalPacking`。
docs/packaging-runtime-convergence-validation-phase-p1d.md:40:✅ `warehouse/confirm`（成品交接）已接入库存生成：
docs/packaging-runtime-convergence-validation-phase-p1d.md:50:✅ 前端 warehouse-handover 实传 `packingCode: ctx.packingCode`（已核对）。
docs/packaging-runtime-convergence-validation-phase-p1d.md:53:> `warehouse/confirm`（成品交接完成），符合 P1C 第三步推荐。
docs/packaging-runtime-convergence-validation-phase-p1d.md:88:幂等键 = `packingCode`，warehouse/confirm 重复提交安全。
docs/packaging-runtime-convergence-validation-phase-p1d.md:174:**逻辑层完成，生产可用性未达。** 真实车间流（warehouse/confirm）已接入库存生成，
docs/procurement-ui-template-audit.md:61:- **`ScopedSelect` 无缓存**：明细表每行一个 WarehouseSelector → N 行 = N 个相同 `/crud/wms_warehouses` 请求；一个抽屉 5 个 Selector = 5 并发。
docs/g5-b-lookup-unified.md:21:| `GET /api/lookup/warehouses?companyCode=` | wms_warehouses | `/crud/wms_warehouses` |
docs/g5-b-lookup-unified.md:38:- `WarehouseSelector` → `/lookup/warehouses?companyCode=`
docs/g5-b-lookup-unified.md:46:字段命名统一改 camelCase（warehouseCode/houseCode/currentQty 等）。
docs/g5-b-lookup-unified.md:51:- `ZoneSelector / LocationSelector` — 维度二级过滤；后续 G5-B++ 可加 `/lookup/zones?warehouseCode=` 等
docs/packaging-runtime-convergence-phase-p1c.md:43:| **`warehouse/confirm`** ✅ | **成品交接完成** | **推荐**：实际成品交付仓库后才进库存，符合"成品交接完成才进入库存" |
docs/packaging-runtime-convergence-phase-p1c.md:45:**采用 `warehouse/confirm` 作为库存生成点**：
docs/packaging-runtime-convergence-phase-p1c.md:47:warehouse/confirm（成品交接）
docs/packaging-runtime-convergence-phase-p1c.md:104:- 对某场站设 `SITE/{siteCode} = PACKAGING_INBOUND` → 该场站 `warehouse/confirm` 开始生成包装库存；其余场站仍 TEMP（`completeTerminalPacking` 经模式门控 `skippedByMode` 跳过）。
docs/packaging-runtime-convergence-phase-p1c.md:106:- 切换经 P1A 的 `/warehouse/source-mode`（风险评估 + 二次确认 + 审计），仅 ADMIN/CEO/FACTORY_MGR。
docs/packaging-runtime-convergence-phase-p1c.md:118:| 前端传参核对 | ✅ warehouse-handover 前端确传 `packingCode: ctx.packingCode` → 接入会收到并生成库存 |
docs/packaging-runtime-convergence-phase-p1c.md:119:| 幂等键 | ✅ `packaging_batch_ref=packingCode`，重复 warehouse/confirm 不重复入库 |
docs/packaging-runtime-convergence-phase-p1c.md:123:1. 包装 → 成品交接 warehouse/confirm → 自动生成 `EGG-YYYYMMDD-*` → 库存查询可见 ✅
docs/packaging-runtime-convergence-phase-p1c.md:147:- 真实车间流接入库存生成（warehouse/confirm → completeTerminalPacking）。
docs/packaging-runtime-convergence-phase-p1c.md:168:**可以。** 为目标场站设 `inv_source_mode(SITE, <siteCode>, PACKAGING_INBOUND)`（经 /warehouse/source-mode 风险评估 + 二次确认 + 审计），该场站包装即开始生成库存，其余场站不受影响（仍 TEMP）。前提：该场站的 packing 流程带正确 shift_id→site_id，且 `PKG_EGG_GRADE` 字典等级与 `product_grades` 对齐。
docs/packaging-runtime-convergence-phase-p1c.md:183:  —— `PackagingTerminalBffController` 注入服务；`warehouse/confirm` 接入库存生成。
apps/api/src/modules/procurement-v2/entities/prc2-request-item.entity.ts:48:  @Column({ name: 'warehouse_code', type: 'varchar', length: 64, nullable: true })
apps/api/src/modules/procurement-v2/entities/prc2-request-item.entity.ts:49:  warehouseCode: string;
scripts/f5-prod-diagnostic.sql:18:\echo '=== B. wms_outbound / wms_inbound 去向·备注列是否存在 ==='
scripts/f5-prod-diagnostic.sql:21: WHERE (table_name='wms_outbound' AND column_name IN ('destination_type','destination_house_code','remark'))
scripts/f5-prod-diagnostic.sql:22:    OR (table_name='wms_inbound'  AND column_name='remark')
docs/go-live-checklist-r6.md:27:1. **库存来源**：孟赛出问题 → `inv_source_mode(SITE,FARM-MS)` 切回 `TEMP_PRODUCTION_INBOUND`（经 /warehouse/source-mode 风险评估），包装入库立即停，回到日产蛋入库，**现场不断货**。
docs/g198-null-unique-residue-audit.md:34:| 9 | `sys_user_warehouse_scope` / `uq_user_warehouse` | 都 NOT NULL | — | 🟢 |
docs/g5-a-rbac-audit.md:149:| `ROLE_WMS_MGR` | `MENU_WMS_INOUT` | A,C,D,E,V,X | C,E,V,X |
docs/g5-a-rbac-audit.md:159:| `ROLE_WMS_OP` | `MENU_WMS_INOUT` | C,E,V | C,V |
docs/g5-a-rbac-audit.md:245:| `MENU_WMS_INOUT` | A,C,D,E,V,X |
docs/g5-a-rbac-audit.md:401:| `MENU_WMS_INOUT` | C,E,V |
docs/g5-a-rbac-audit.md:441:| `MENU_WMS_INOUT` | C,E,V |
docs/g5-a-rbac-audit.md:639:| `MENU_WMS_INOUT` | V,X |
docs/M1_ORGANIZAT
```
