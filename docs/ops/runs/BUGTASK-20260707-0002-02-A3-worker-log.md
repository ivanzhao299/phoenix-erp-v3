# Agent Worker Log

| Field | Value |
| --- | --- |
| Task ID | BUGTASK-20260707-0002-02-A3 |
| Agent | A3-Backend-Critical-Path |
| Dry run | No |
| Exit code | 0 |

## Command

```bash
/usr/local/bin/node scripts/ops/run-agent-task.mjs --agent A3-Backend-Critical-Path --worktree /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path --prompt docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md --task-contract docs/ops/runs/BUGTASK-20260707-0002-02-A3-contract.md --assembled-prompt-output docs/ops/runs/BUGTASK-20260707-0002-02-A3-worker-assembled-prompt.md --require-approval-token APPROVE_AGENT_EXECUTION --skip-baseline-autopilot --allow-ops-runtime-dirty
```

## Stdout

```text
Agent: A3-Backend-Critical-Path
Worktree: /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
Branch: w5-a3-backend-critical-path
Prompt: docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md
Task contract: docs/ops/runs/BUGTASK-20260707-0002-02-A3-contract.md
Assembled prompt: docs/ops/runs/BUGTASK-20260707-0002-02-A3-worker-assembled-prompt.md
Assembled prompt chars: 20234
Codex command: codex exec -C /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path --sandbox workspace-write -
Codex timeout ms: 600000
Run log: /Users/mac/phoenix-erp-worktrees/codex-orchestrator/docs/ops/runs/2026-07-07T11-28-49-543Z-A3-Backend-Critical-Path.md
PASS WITH CONDITIONS.

Backend fix is implemented and validated, but commit could not be created because git metadata is outside the writable sandbox: `fatal: Unable to create '/Users/mac/phoenix-erp/.git/worktrees/a3-backend-critical-path/index.lock': Operation not permitted`.

Changed files:
- [generic-crud.controller.ts](/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path/apps/api/src/modules/generic-crud/generic-crud.controller.ts:94): `GET wms_*` now uses `MENU_WMS_VIEW:V`, with `MENU_WMS_INOUT:V` as read fallback; writes still require `MENU_WMS_INOUT` C/E/D.
- [generic-crud.controller.spec.ts](/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path/apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts:1): added RBAC regression tests.
- [BUG-20260707-0002-A3-BACKEND-REPORT.md](/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path/docs/ops/BUG-20260707-0002-A3-BACKEND-REPORT.md:1): result report, marked `GO`.

Validation run:
- `cd apps/api && ./node_modules/.bin/jest src/modules/generic-crud/generic-crud.controller.spec.ts --runInBand` → PASS, 3 tests.
- `cd apps/api && ./node_modules/.bin/tsc --noEmit` → PASS, 0 errors.
- `git diff --check` → PASS.

Frozen items preserved: no migrations, no schema/entity/table/column changes, no DB writes, no frontend changes, no deploy, no push.
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
session id: 019f3c53-f0b0-7af1-85e5-6a7c32f0153a
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

Source bug: BUG-20260707-0002
Source repair task: BUGTASK-20260707-0002
Assigned agent: A3-Backend-Critical-Path

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
我会先做合同要求的环境检查，确认目录、分支、工作区状态和最近提交；如果这些基础条件不满足，会先停下来报告。
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
3bd44ef4 (HEAD -> w5-a3-backend-critical-path, w5-a4-frontend-uat-smoke, main) docs(ops): record baseline lifecycle report
eece67c8 docs(ops): record baseline lifecycle report
896d057c docs(ops): record baseline lifecycle report
eed41642 docs(ops): record baseline lifecycle report
c4ac5c3a feat(api): record A3-Backend-Critical-Path result
a5e2323f docs(ops): record baseline lifecycle report
8e17584a feat(web): record A4-Frontend-UAT-Smoke result
411f204a docs(ops): record baseline lifecycle report

exec
/bin/zsh -lc 'git status --short' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
codex
基础检查通过：工作目录和分支匹配，工作区干净。现在进入 dry-run 诊断，先定位 `/api/crud/wms_*` 的权限映射和库存总览相关后端边界，判断是否能在不改 schema、不改前端的范围内修复。
exec
/bin/zsh -lc 'find docs/ops -maxdepth 1 -type f | sort | tail -30' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
docs/ops/STORE_PAYMENT_MIGRATION_EXECUTION_PRECHECK.md
docs/ops/STORE_PAYMENT_PILOT_GATE_S1_APPROVAL_MATRIX.md
docs/ops/STORE_PAYMENT_PILOT_GATE_S1_DECISION.md
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

exec
/bin/zsh -lc 'rg --files apps/api/src | rg "(crud|wms|rbac|permission|auth|menu|audit|data-scope)"' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
apps/api/src/modules/permission-sets/permission-sets.module.ts
apps/api/src/modules/permission-sets/permission-sets.service.ts
apps/api/src/modules/permission-sets/permission-sets.controller.ts
apps/api/src/modules/data-quality/services/data-scope-audit.service.ts
apps/api/src/modules/master-data/master-data-audit.service.ts
apps/api/src/modules/org/entities/sys-data-scope.entity.ts
apps/api/src/modules/wms/entities/wms-location.entity.ts
apps/api/src/modules/wms/entities/wms-stock-ledger.entity.ts
apps/api/src/modules/wms/entities/wms-stock-balance.entity.ts
apps/api/src/modules/wms/inventory.controller.ts
apps/api/src/modules/wms/wms.service.ts
apps/api/src/modules/org/guards/data-scope.guard.ts
apps/api/src/modules/wms/inventory/inventory.service.spec.ts
apps/api/src/modules/wms/inventory/inventory.service.ts
apps/api/src/modules/wms/outbound.controller.ts
apps/api/src/modules/wms/inbound.controller.ts
apps/api/src/modules/wms/wms.module.ts
apps/api/src/modules/permissions/entities/sys-role.entity.ts
apps/api/src/modules/permissions/entities/sys-role-conflict.entity.ts
apps/api/src/modules/permissions/entities/sys-menu.entity.ts
apps/api/src/modules/permissions/entities/sys-role-menu-permission.entity.ts
apps/api/src/modules/permissions/entities/sys-user-role.entity.ts
apps/api/src/modules/permissions/permissions.module.ts
apps/api/src/modules/permissions/permissions.service.ts
apps/api/src/modules/permissions/permission-sets.service.ts
apps/api/src/modules/permissions/permissions.controller.ts
apps/api/src/modules/org/services/data-scope.service.ts
apps/api/src/modules/org/helpers/data-scope.helper.ts
apps/api/src/modules/generic-crud/generic-crud.controller.ts
apps/api/src/modules/generic-crud/generic-crud.service.ts
apps/api/src/modules/generic-crud/generic-crud.module.ts
apps/api/src/modules/generic-crud/crud.constants.ts
apps/api/src/common/guards/menu-registry.service.ts
apps/api/src/common/guards/menu.guard.ts
apps/api/src/modules/chanjet/chanjet-auth.service.ts
apps/api/src/modules/product-master/controllers/menu-admin.controller.ts
apps/api/src/modules/org/dto/update-data-scope.dto.ts
apps/api/src/common/filters/auth-exception.filter.ts
apps/api/src/auth/jwt.strategy.ts
apps/api/src/auth/jwt-rotation.spec.ts
apps/api/src/auth/auth.controller.ts
apps/api/src/auth/permissions-resolver.ts
apps/api/src/auth/auth.service.ts
apps/api/src/auth/permissions-resolver.spec.ts
apps/api/src/auth/permissions.util.ts
apps/api/src/auth/auth.module.ts
apps/api/src/common/interceptors/audit-log.interceptor.ts
apps/api/src/auth/entities/sys-user.entity.ts

exec
/bin/zsh -lc 'rg -n "wms_zones|wms_inbound|wms_outbound|MENU_WMS_INOUT|MENU_WMS|warehouse" apps/api/src docs/ops' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
docs/ops/PROCUREMENT_DATASCOPE_WRITE_REMEDIATION_20260626.md:5:Close the next P0 production-readiness gap after menu atomization: procurement and related finance actions must not rely on frontend visibility alone. All high-frequency procurement write paths now enforce server-side company/project/warehouse DataScope before creating records or changing state.
docs/ops/PROCUREMENT_DATASCOPE_WRITE_REMEDIATION_20260626.md:18:  - Enforces warehouse scope when a user has warehouse restrictions configured.
docs/ops/PROCUREMENT_DATASCOPE_WRITE_REMEDIATION_20260626.md:19:  - Keeps legacy company/project-only users unaffected when no warehouse list is configured.
docs/ops/PROCUREMENT_DATASCOPE_WRITE_REMEDIATION_20260626.md:62:- Receipt warehouse scope when warehouse restrictions exist.
docs/ops/PROCUREMENT_DATASCOPE_WRITE_REMEDIATION_20260626.md:128:- Cross-company/project/warehouse write attempts now fail with `403 Forbidden`.
docs/ops/PROCUREMENT_DATASCOPE_WRITE_REMEDIATION_20260626.md:140:3. Inventory/WMS route-level write DataScope review beyond the currently scoped warehouse paths.
docs/ops/A5_DATA_READINESS_STORE_PAYMENT_001_REPORT.md:91:   - `sys_organizations` has `company_code`, `project_code`, `warehouse_code`, `site_code`, `manager_user_id`, `manager_name`, and parent fields.
docs/ops/A5_DATA_READINESS_STORE_PAYMENT_001_REPORT.md:135:4. DataScope supports company/project/warehouse/farm/site lists in runtime context.
docs/ops/NATURAL_LANGUAGE_REQUEST_EXAMPLES.md:52:| 结构化需求摘要 | Assess master data setup needed for farm/warehouse selection in procurement. |
docs/ops/AI_DELIVERY_PHASE2_NL_DISPATCH_REVIEW.md:51:| Master data / company / project / farm / store / warehouse | A5 read-only first | L4 |
docs/ops/MASTER_DATA_PENDING_ATOMIC_VISIBILITY_REMEDIATION_20260627.md:16:This was too narrow after the approval registry and master-data runtime were atomized. Users responsible for product, material, store, warehouse, organization, company, dictionary, bank-account, driver, vehicle, grade, packaging, or SKU approvals could miss the pending approval entry even though they own the relevant leaf permission.
docs/ops/WMS_DATASCOPE_WRITE_SCOPE_REMEDIATION_20260626.md:5:Close the remaining P0/P1 inventory and WMS write-scope gap so users cannot mutate inventory outside their allowed warehouse scope.
docs/ops/WMS_DATASCOPE_WRITE_SCOPE_REMEDIATION_20260626.md:23:- WMS read lists already apply warehouse filters in several places.
docs/ops/WMS_DATASCOPE_WRITE_SCOPE_REMEDIATION_20260626.md:24:- Several write paths accepted `warehouse_code` or mutated `inv_batches` by `batch_no` without re-checking that the affected warehouse is inside `dataScope.allowedWarehouseCodes`.
docs/ops/WMS_DATASCOPE_WRITE_SCOPE_REMEDIATION_20260626.md:31:- Enforced warehouse write checks for:
docs/ops/WMS_DATASCOPE_WRITE_SCOPE_REMEDIATION_20260626.md:32:  - task-level inbound warehouse
docs/ops/WMS_DATASCOPE_WRITE_SCOPE_REMEDIATION_20260626.md:33:  - inbound item warehouse override
docs/ops/WMS_DATASCOPE_WRITE_SCOPE_REMEDIATION_20260626.md:34:  - receipt posting warehouse
docs/ops/WMS_DATASCOPE_WRITE_SCOPE_REMEDIATION_20260626.md:35:  - outbound batch warehouse
docs/ops/WMS_DATASCOPE_WRITE_SCOPE_REMEDIATION_20260626.md:36:  - receiving order warehouse
docs/ops/WMS_DATASCOPE_WRITE_SCOPE_REMEDIATION_20260626.md:37:  - transfer source and target warehouses
docs/ops/WMS_DATASCOPE_WRITE_SCOPE_REMEDIATION_20260626.md:38:  - transfer source batch warehouse
docs/ops/WMS_DATASCOPE_WRITE_SCOPE_REMEDIATION_20260626.md:39:  - stocktake document warehouse
docs/ops/WMS_DATASCOPE_WRITE_SCOPE_REMEDIATION_20260626.md:40:  - stocktake batch warehouse
docs/ops/WMS_DATASCOPE_WRITE_SCOPE_REMEDIATION_20260626.md:41:  - loss document warehouse
docs/ops/WMS_DATASCOPE_WRITE_SCOPE_REMEDIATION_20260626.md:42:  - loss batch warehouse
docs/ops/WMS_DATASCOPE_WRITE_SCOPE_REMEDIATION_20260626.md:43:  - atomic inventory decrement warehouse
docs/ops/WMS_DATASCOPE_WRITE_SCOPE_REMEDIATION_20260626.md:44:  - atomic inventory increment warehouse
docs/ops/WMS_DATASCOPE_WRITE_SCOPE_REMEDIATION_20260626.md:51:- If a user has no configured warehouse scope, existing company/project DataScope behavior is preserved to avoid breaking roles that have not yet been warehouse-scoped.
docs/ops/WMS_DATASCOPE_WRITE_SCOPE_REMEDIATION_20260626.md:52:- If `allowedWarehouseCodes` is configured, WMS writes must target a permitted warehouse.
docs/ops/WMS_DATASCOPE_WRITE_SCOPE_REMEDIATION_20260626.md:82:Remaining condition: complete production role-by-role warehouse scope evidence and proceed to approval action flow hardening.
docs/ops/NEXT_PRODUCTION_READINESS_REMEDIATION_PLAN_20260626.md:33:   - WMS inbound, purchase receipt posting, outbound batch deduction, receiving confirmation, transfer, stocktake, loss, and atomic inventory increment/decrement now enforce warehouse write ownership when `allowedWarehouseCodes` is configured.
docs/ops/NEXT_PRODUCTION_READINESS_REMEDIATION_PLAN_20260626.md:34:   - Remaining work: production user-by-user warehouse scope evidence and store/order stock view checks.
docs/ops/NEXT_PRODUCTION_READINESS_REMEDIATION_PLAN_20260626.md:67:   - Supplier, project, cash account, product, bank account, warehouse readiness.
docs/ops/PRODUCTION_READINESS_REMEDIATION_BATCH_20260625_DATASCOPE.md:51:1. Sweep remaining inventory/reporting read models for warehouse/site/project DataScope.
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_UNRESOLVED_UPLOADS_OWNER_DIAGNOSIS_REPORT.md:62:- `wms_inbound.attachment_url`
docs/ops/PRODUCTION_SERVER_REMEDIATION_R3_UNRESOLVED_UPLOADS_OWNER_DIAGNOSIS_REPORT.md:63:- `wms_outbound.attachment_url`
docs/ops/GLOBAL_RBAC_MENU_GATE_AUDIT_20260625.md:77:| `MENU_WMS_INOUT` | 9 |
docs/ops/GLOBAL_RBAC_MENU_GATE_AUDIT_20260625.md:119:3. `MENU_WMS_INOUT` gates multiple WMS write workflows:
docs/ops/GLOBAL_RBAC_MENU_GATE_AUDIT_20260625.md:129:   - `MENU_WMS_INBOUND`
docs/ops/GLOBAL_RBAC_MENU_GATE_AUDIT_20260625.md:130:   - `MENU_WMS_OUTBOUND`
docs/ops/GLOBAL_RBAC_MENU_GATE_AUDIT_20260625.md:131:   - `MENU_WMS_TRANSFER`
docs/ops/GLOBAL_RBAC_MENU_GATE_AUDIT_20260625.md:132:   - `MENU_WMS_STOCKTAKE`
docs/ops/GLOBAL_RBAC_MENU_GATE_AUDIT_20260625.md:133:   - `MENU_WMS_DAILY_CLOSE`
docs/ops/GLOBAL_RBAC_MENU_GATE_AUDIT_20260625.md:134:   - `MENU_WMS_LOSS`
docs/ops/GLOBAL_RBAC_MENU_GATE_AUDIT_20260625.md:158:   - Preserve warehouse DataScope.
docs/ops/PRODUCTION_READINESS_REMEDIATION_BATCH_20260625_NEXT.md:60:- `/api/lookup/warehouses`
docs/ops/PRODUCTION_READINESS_REMEDIATION_BATCH_20260625_NEXT.md:139:   - warehouse
docs/ops/WMS_FRONTEND_ATOMIC_MENU_GATE_REMEDIATION_20260626.md:19:- `apps/web/src/app/(admin)/warehouse/inbound/page.tsx`
docs/ops/WMS_FRONTEND_ATOMIC_MENU_GATE_REMEDIATION_20260626.md:20:- `apps/web/src/app/(admin)/warehouse/outbound/page.tsx`
docs/ops/WMS_FRONTEND_ATOMIC_MENU_GATE_REMEDIATION_20260626.md:21:- `apps/web/src/app/(admin)/warehouse/transfer/page.tsx`
docs/ops/WMS_FRONTEND_ATOMIC_MENU_GATE_REMEDIATION_20260626.md:22:- `apps/web/src/app/(admin)/warehouse/stocktake/page.tsx`
docs/ops/WMS_FRONTEND_ATOMIC_MENU_GATE_REMEDIATION_20260626.md:23:- `apps/web/src/app/(admin)/warehouse/loss-report/page.tsx`
docs/ops/WMS_FRONTEND_ATOMIC_MENU_GATE_REMEDIATION_20260626.md:29:   - `canCreate('MENU_WMS_INOUT')`
docs/ops/WMS_FRONTEND_ATOMIC_MENU_GATE_REMEDIATION_20260626.md:30:   - `canEdit('MENU_WMS_INOUT')`
docs/ops/WMS_FRONTEND_ATOMIC_MENU_GATE_REMEDIATION_20260626.md:31:   - `canDelete('MENU_WMS_INOUT')`
docs/ops/WMS_FRONTEND_ATOMIC_MENU_GATE_REMEDIATION_20260626.md:32:   - `canApprove('MENU_WMS_INOUT')`
docs/ops/WMS_FRONTEND_ATOMIC_MENU_GATE_REMEDIATION_20260626.md:33:   - `canExport('MENU_WMS_INOUT')`
docs/ops/PRODUCTION_READINESS_REMEDIATION_BATCH_20260625_CONTROLLER_GATES.md:49:4. Complete production data readiness gaps for supplier, product, warehouse, cash account, bank account, and project master data.
docs/ops/LOOKUP_DATASCOPE_ATOMICITY_REMEDIATION_20260627.md:9:`LookupController.resolveCompanyScope()` previously resolved company scope with `MENU_MASTER_DATA` for all lookup types. That made business forms such as procurement payment project selection, supplier selection, shareholder fund entry, warehouse selection, and cash-account selection depend on a broad master-data context instead of the leaf menu that matches the business data being referenced.
docs/ops/SIDEBAR_MASTER_DATA_ATOMIC_PERMISSION_REMEDIATION_20260627.md:12:- Removed `superPerm: "MENU_MASTER_DATA"` from organization/company/business-unit/project/customer/supplier/material/product/grade/spec/SKU/warehouse/store/driver/vehicle/cash-account/bank-account sidebar entries.
docs/ops/ORG_USER_EXTRA_SCOPE_DATASCOPE_GUARD_20260626.md:7:The organization administration APIs already apply company-scoped visibility to organization tree reads and direct organization mutations. The remaining gap was the extra authorization surface for project and warehouse scopes:
docs/ops/ORG_USER_EXTRA_SCOPE_DATASCOPE_GUARD_20260626.md:11:- user warehouse scope assignment
docs/ops/ORG_USER_EXTRA_SCOPE_DATASCOPE_GUARD_20260626.md:12:- user warehouse scope removal
docs/ops/ORG_USER_EXTRA_SCOPE_DATASCOPE_GUARD_20260626.md:15:Without a write-side scope guard, an operator with limited company scope could assign or inspect extra project / warehouse scopes outside their permitted company boundary if the endpoint was reachable.
docs/ops/ORG_USER_EXTRA_SCOPE_DATASCOPE_GUARD_20260626.md:22:- Added company-scoped validation for `wms_warehouses.warehouse_code`.
docs/ops/ORG_USER_EXTRA_SCOPE_DATASCOPE_GUARD_20260626.md:23:- Filtered `getUserScopes()` by the current operator's visible project and warehouse codes.
docs/ops/ORG_USER_EXTRA_SCOPE_DATASCOPE_GUARD_20260626.md:29:- Global data scope can manage all project and warehouse extra scopes.
docs/ops/ORG_USER_EXTRA_SCOPE_DATASCOPE_GUARD_20260626.md:30:- Non-global users can only list / assign / remove project and warehouse scopes whose `company_code` is inside their resolved organization company DataScope.
docs/ops/ORG_USER_EXTRA_SCOPE_DATASCOPE_GUARD_20260626.md:32:- Missing or archived project / warehouse codes are rejected.
docs/ops/ORG_USER_EXTRA_SCOPE_DATASCOPE_GUARD_20260626.md:37:- `wms_warehouses` uses company and non-archived status checks. No soft-delete column is assumed for this table.
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:299:      moduleCode: 'MENU_MD_WAREHOUSE', tableName: 'wms_warehouses',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:301:      onApproved: mdAuditHook('WAREHOUSE', 'wms_warehouses', 'warehouse_code', 'APPROVE_ACTIVE'),
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:302:      onRejected: mdAuditHook('WAREHOUSE', 'wms_warehouses', 'warehouse_code', 'REJECT'),
docs/ops/ORCHESTRATOR_PROMPT.md:83:3. Master data / company / project / farm / store / warehouse -> A5 read-only first, risk at least L4.
docs/ops/SONGLEI_RBAC_AUDIT_20260628.md:25:库存:MENU_WMS_INOUT(CEV)、MENU_WMS_VIEW(V)
docs/ops/SONGLEI_RBAC_AUDIT_20260628.md:34:- 其余:其库存为 MENU_WMS_INOUT/VIEW，若他需要盘点/调整且这些走独立菜单(如有)可能缺。
docs/ops/RBAC_EXTERNAL_INTERFACE_REMEDIATION_BATCH_20260626.md:32:  - Stock: `MENU_WMS_VIEW` / `MENU_WMS_INOUT` / `MENU_SALES2_INVENTORY`
docs/ops/LOOKUP_DATASCOPE_FAIL_CLOSED_REMEDIATION_20260626.md:25:- Properly scoped users still see authorized companies, warehouses, farms, stores, projects, accounts, and related selectors.
apps/api/src/modules/procurement-v2/entities/prc2-request-item.entity.ts:48:  @Column({ name: 'warehouse_code', type: 'varchar', length: 64, nullable: true })
apps/api/src/modules/procurement-v2/entities/prc2-request-item.entity.ts:49:  warehouseCode: string;
docs/ops/PRODUCTION_READINESS_REMEDIATION_BATCH_20260625.md:33:- WMS raw SQL read lists now apply warehouse scope where the table has `warehouse_code`:
docs/ops/PRODUCTION_READINESS_REMEDIATION_BATCH_20260625.md:68:- warehouse
docs/ops/PRODUCTION_READINESS_REMEDIATION_BATCH_20260625.md:106:  - WMS list visibility for restricted warehouse users
docs/ops/PRODUCTION_READINESS_REMEDIATION_BATCH_20260625.md:115:4. Add a production data-readiness runner that emits machine-readable gaps for supplier / project / cash-account / product / bank-account / warehouse.
docs/ops/PRODUCTION_SERVER_REMEDIATION_R2_LEGACY_UPLOAD_TO_FILE_METADATA_REPORT.md:41:| Likely callers | `AttachmentUploader`, `FileUploadInput`, Procurement V2 order/payment attachments, shareholder capital attachments, CRUD attachment fields, warehouse attachment fields |
docs/ops/ORG_SERVICE_READ_SCOPE_BYPASS_GUARD_20260626.md:7:After tightening direct organization access and extra project / warehouse assignments, the remaining service-level read surface still had two bypass risks:
apps/api/src/modules/procurement-v2/entities/prc2-order-item.entity.ts:63:  @Column({ name: 'warehouse_code', type: 'varchar', length: 64, nullable: true })
apps/api/src/modules/procurement-v2/entities/prc2-order-item.entity.ts:64:  warehouseCode: string;
apps/api/src/modules/procurement-v2/entities/prc2-receipt.entity.ts:50:  @Column({ name: 'warehouse_code', type: 'varchar', length: 64, nullable: true })
apps/api/src/modules/procurement-v2/entities/prc2-receipt.entity.ts:51:  warehouseCode: string;
apps/api/src/modules/procurement-v2/services/requests.service.ts:140:        warehouseCode:      it.warehouseCode,
apps/api/src/modules/procurement-v2/services/init.service.ts:59:      'warehouse_code', 'remark',
apps/api/src/modules/procurement-v2/services/init.service.ts:96:      'receipt_no', 'po_no*', 'receipt_date*', 'warehouse_code',
apps/api/src/modules/procurement-v2/services/init.service.ts:604:        warehouseCode: String(row['warehouse_code']  ?? '') || undefined,
apps/api/src/modules/procurement-v2/services/orders.service.ts:169:        warehouseCode: it.warehouseCode,
apps/api/src/modules/procurement-v2/services/orders.service.ts:455:          warehouseCode: ri.warehouseCode,
apps/api/src/modules/procurement-v2/services/receipts.service.ts:97:    if (q.warehouseCode)   qb.andWhere('r.warehouseCode   = :wc',  { wc:  q.warehouseCode });
apps/api/src/modules/procurement-v2/services/receipts.service.ts:107:    this.scopeHelper.applyToQb(qb, { alias: 'r', warehouseField: 'warehouseCode' });   // G85-C 补仓库维度
apps/api/src/modules/procurement-v2/services/receipts.service.ts:150:      this.scopeHelper.assertWritableWarehouse(dto.warehouseCode, '采购收货单');
apps/api/src/modules/procurement-v2/services/receipts.service.ts:181:        warehouseCode: dto.warehouseCode,
apps/api/src/modules/procurement-v2/services/receipts.service.ts:224:      this.scopeHelper.assertWritableWarehouse(rcp.warehouseCode, '采购收货单');
apps/api/src/modules/procurement-v2/services/receipts.service.ts:299:        warehouseCode: rcp.warehouseCode,
apps/api/src/modules/procurement-v2/services/receipts.service.ts:321:      this.scopeHelper.assertWritableWarehouse(rcp.warehouseCode, '采购收货单');
docs/ops/runs/remediation-r3-menu-role-datascope-audit-20260624-122800/table_columns.txt:8: sys_organizations|id:bigint, org_code:character varying, org_name:character varying, parent_id:bigint, org_type:character varying, level:integer, path:text, status:character varying, company_code:character varying, project_code:character varying, warehouse_code:character varying, remark:text, manager_user_id:bigint, manager_name:character varying, created_at:timestamp with time zone, updated_at:timestamp with time zone, org_name_cn:character varying, org_short_name:character varying, parent_code:character varying, site_code:character varying, site_business_type:character varying, sort_order:integer
docs/ops/runs/remediation-r3-menu-role-datascope-audit-20260624-122800/menu_inventory.txt:44:      21 | MENU_WMS_VIEW                 | 仓储查看          | WMS         | [NULL]            |         21 | /wms/view                       | 2026-05-21 06:18:17.358931
docs/ops/runs/remediation-r3-menu-role-datascope-audit-20260624-122800/menu_inventory.txt:45:      22 | MENU_WMS_INOUT                | 出入库作业        | WMS         | [NULL]            |         22 | /wms/inout                      | 2026-05-21 06:18:17.358931
docs/ops/runs/remediation-r3-menu-role-datascope-audit-20260624-122800/menu_inventory.txt:46:      23 | MENU_WMS_OP                   | 仓储管理          | WMS         | [NULL]            |         23 | /wms/op                         | 2026-05-21 06:18:17.358931
docs/ops/runs/remediation-r3-menu-role-datascope-audit-20260624-122800/menu_inventory.txt:53:      30 | MENU_WMS_MASTER               | 仓库主档          | WMS         | [NULL]            |         29 | /warehouse/warehouses           | 2026-05-21 06:18:17.93765
docs/ops/runs/remediation-r3-menu-role-datascope-audit-20260624-122800/menu_inventory.txt:57:    8909 | MENU_INV_LEDGER               | 库存流水          | WMS         | [NULL]            |         31 | /warehouse/ledger               | 2026-06-02 14:19:15.123439
docs/ops/runs/remediation-r3-menu-role-datascope-audit-20260624-122800/menu_inventory.txt:59:    8910 | MENU_INV_MANUAL_INBOUND       | 手工库存入库      | WMS         | [NULL]            |         32 | /warehouse/inbound              | 2026-06-02 14:19:15.123439
docs/ops/runs/remediation-r3-menu-role-datascope-audit-20260624-122800/menu_inventory.txt:61:    9011 | MENU_INV_SOURCE_MODE          | 库存来源模式      | WMS         | [NULL]            |         33 | /warehouse/source-mode          | 2026-06-02 14:35:49.540757
docs/ops/runs/remediation-r3-menu-role-datascope-audit-20260624-122800/datascope_policy_summary.txt:27: 29 | ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR | MENU_WMS_INOUT          | COMPANY    | t       | 2026-06-05 14:00:58.429498+00
docs/ops/runs/remediation-r3-menu-role-datascope-audit-20260624-122800/datascope_policy_summary.txt:28: 30 | ROLE_MENGSAI_PRODUCTION_DATA_SUPERVISOR | MENU_WMS_VIEW           | COMPANY    | t       | 2026-06-05 14:00:58.429498+00
docs/ops/runs/restore-ssh-and-metadata-claim-dry-run-20260624-111145/db_owner_lookup_summary.json:1454:      "table_name": "wms_inbound",
docs/ops/runs/restore-ssh-and-metadata-claim-dry-run-20260624-111145/db_owner_lookup_summary.json:1460:      "table_name": "wms_outbound",
apps/api/src/modules/procurement-v2/dto/create-receipt.dto.ts:22:  @IsOptional() @IsString()     warehouseCode?: string;
apps/api/src/modules/procurement-v2/dto/query-receipt.dto.ts:8:  @IsOptional() @IsString() warehouseCode?:   string;
apps/api/src/modules/procurement-v2/dto/purchase-request-item.dto.ts:55:  warehouseCode?: string;
apps/api/src/modules/procurement-v2/dto/purchase-order-item.dto.ts:59:  warehouseCode?: string;
docs/ops/runs/remediation-r3-high-throughput-batch1-20260624-124012/unresolved_uploads_owner_diagnosis.txt:46: wms_inbound            | attachment_url      | text
docs/ops/runs/remediation-r3-high-throughput-batch1-20260624-124012/unresolved_uploads_owner_diagnosis.txt:47: wms_outbound           | attachment_url      | text
apps/api/src/modules/quality/quality.service.ts:175:        wms_inbound: wmsSource,
apps/api/src/modules/farm/farm-medicine.service.ts:47:        `INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, warehouse_code, status)
apps/api/src/modules/farm/farm-medicine.service.ts:56:       FROM inv_batches WHERE warehouse_code = $1`,
apps/api/src/modules/farm/farm-medicine.service.ts:80:       WHERE b.warehouse_code = $1
apps/api/src/modules/farm/farm-medicine.service.ts:104:           (batch_no, change_type, qty_change, log_date, warehouse_code, operator, note)
apps/api/src/modules/farm/farm-medicine.service.ts:130:           (batch_no, change_type, qty_change, log_date, warehouse_code, house_code, operator, note)
apps/api/src/modules/analytics/services/inventory-analytics.service.ts:19:  async compute(q: { companyCode?: string; warehouseCode?: string }) {
apps/api/src/modules/analytics/services/inventory-analytics.service.ts:20:    const wFilter = q.warehouseCode ? `AND warehouse_code = '${q.warehouseCode.replace(/'/g, "''")}'` : '';
apps/api/src/database/migrations/1782052418112-RepairRolePermissionMatrixAtomicity.ts:35:        ('MENU_MD_WAREHOUSE', '仓库档案', NULL, 'MASTER', 'MENU_MASTER_DATA', 708, 'Warehouse', '/master-data/warehouses'),
apps/api/src/modules/farm/farm-egg.service.ts:62:       FROM inv_batches WHERE warehouse_code = $1`,
apps/api/src/modules/farm/farm-egg.service.ts:80:       WHERE b.warehouse_code = $1
apps/api/src/auth/permissions-resolver.spec.ts:89:        src({ menu_code: 'MENU_WMS', perm_codes: 'V,C' }),
apps/api/src/auth/permissions-resolver.spec.ts:91:      expect(out).toEqual(['MENU_FIN:V', 'MENU_WMS:V,C']);
apps/api/src/auth/permissions-resolver.spec.ts:127:        src({ menu_code: 'MENU_WMS', perm_codes: 'V,E' }),
apps/api/src/auth/permissions-resolver.spec.ts:129:      expect(out).toEqual(['MENU_FIN:V', 'MENU_WMS:V,E']);
apps/api/src/common/guards/menu-registry.service.ts:26:  'MENU_WMS_VIEW', 'MENU_WMS_INOUT', 'MENU_WMS_MASTER', 'MENU_INVENTORY',
apps/api/src/common/guards/menu-registry.service.ts:27:  'MENU_WMS', 'MENU_WMS_INBOUND', 'MENU_WMS_OUTBOUND', 'MENU_PDA',
apps/api/src/modules/wms/entities/wms-location.entity.ts:9:  warehouse_code: string;
apps/api/src/modules/analytics/services/production-analytics.service.ts:9: * 数据源：brd_daily_logs / brd_flocks / pkg_exceptions / wms_outbound（销售）
apps/api/src/modules/wms/outbound.controller.ts:13:  @RequireMenu('MENU_WMS_INOUT', 'V')
apps/api/src/modules/wms/outbound.controller.ts:19:  @RequireMenu('MENU_WMS_INOUT', 'V')
apps/api/src/modules/wms/outbound.controller.ts:25:  @RequireMenu('MENU_WMS_INOUT', 'V')
apps/api/src/modules/wms/outbound.controller.ts:31:  @RequireMenu('MENU_WMS_INOUT', 'E')
apps/api/src/modules/wms/outbound.controller.ts:37:  @RequireMenu('MENU_WMS_INOUT', 'E')
apps/api/src/modules/wms/entities/wms-stock-ledger.entity.ts:15:  warehouse_code: string;
apps/api/src/common/guards/menu.guard.ts:41: *  @RequireMenu('MENU_SALES2_INVENTORY', 'V', ['MENU_WMS_VIEW'])  // G20-1 备选 OR
apps/api/src/modules/wms/inbound.controller.ts:13:  @RequireMenu('MENU_WMS_INOUT', 'V')
apps/api/src/modules/wms/inbound.controller.ts:19:  @RequireMenu('MENU_WMS_INOUT', 'V')
apps/api/src/modules/wms/inbound.controller.ts:25:  @RequireMenu('MENU_WMS_INOUT', 'V')
apps/api/src/modules/wms/inbound.controller.ts:31:  @RequireMenu('MENU_WMS_INOUT', 'C')
apps/api/src/modules/wms/entities/wms-stock-balance.entity.ts:4:@Unique('wms_stock_balance_warehouse_code_location_code_spec_code_ba_key', ['warehouse_code', 'location_code', 'spec_code', 'batch_no'])
apps/api/src/modules/wms/entities/wms-stock-balance.entity.ts:10:  warehouse_code: string;
apps/api/src/common/guards/master-data-type.guard.ts:38:  warehouse: 'MENU_MD_WAREHOUSE',
apps/api/src/modules/wms/inventory.controller.ts:14:  @RequireMenu('MENU_WMS_VIEW', 'V')
apps/api/src/modules/wms/inventory.controller.ts:32:  @RequireMenu('MENU_WMS_VIEW', 'V')
apps/api/src/modules/wms/inventory.controller.ts:39:  @RequireMenu('MENU_WMS_VIEW', 'V')
apps/api/src/modules/wms/inventory.controller.ts:45:  @RequireMenu('MENU_WMS_VIEW', 'V')
apps/api/src/modules/wms/inventory.controller.ts:51:  @RequireMenu('MENU_WMS_VIEW', 'V')
apps/api/src/modules/wms/inventory.controller.ts:84:  @RequireMenu('MENU_WMS_INOUT', 'E')
apps/api/src/database/migrations/1782000000000-W4MasterDataFoundation.ts:98:        'canonical 走 wms_warehouses;树内占位(user 拍板 #1:仓库 ≠ site)'],
apps/api/src/common/validation-message.ts:77:  warehouseCode: '仓库',
apps/api/src/modules/wms/wms.service.ts:19:  private warehouseScope(column = 'warehouse_code', paramOffset = 0): { sql: string; params: unknown[] } {
apps/api/src/modules/wms/wms.service.ts:30:  private assertWritableWarehouse(warehouseCode: string | null | undefined, label: string): void {
apps/api/src/modules/wms/wms.service.ts:33:    if (!warehouseCode) {
apps/api/src/modules/wms/wms.service.ts:36:    if (!scope.allowedWarehouseCodes.includes(warehouseCode)) {
apps/api/src/modules/wms/wms.service.ts:61:      const scope = this.warehouseScope('warehouse_code', 0);
apps/api/src/modules/wms/wms.service.ts:63:        `SELECT COUNT(*) as count FROM wms_inbound WHERE status = 'PENDING' AND ${scope.sql}`,
apps/api/src/modules/wms/wms.service.ts:67:        `SELECT COUNT(*) as count FROM wms_inbound WHERE status = 'PROCESSING' AND ${scope.sql}`,
apps/api/src/modules/wms/wms.service.ts:85:      const scope = this.warehouseScope('warehouse_code', 0);
apps/api/src/modules/wms/wms.service.ts:87:        `SELECT * FROM wms_inbound WHERE status IN ('PENDING', 'PROCESSING') AND ${scope.sql} ORDER BY created_at DESC`,
apps/api/src/modules/wms/wms.service.ts:98:      const scope = this.warehouseScope('warehouse_code', 1);
apps/api/src/modules/wms/wms.service.ts:100:        `SELECT * FROM wms_inbound WHERE task_no = $1 AND ${scope.sql}`,
apps/api/src/modules/wms/wms.service.ts:105:        `SELECT * FROM wms_inbound_items WHERE task_no = $1`,
apps/api/src/modules/wms/wms.service.ts:156:        `SELECT warehouse_code, operator, store_code, status FROM wms_inbound WHERE task_no = $1 FOR UPDATE`,
apps/api/src/modules/wms/wms.service.ts:163:      this.assertWritableWarehouse(task.warehouse_code || null, `入库单 ${task_no}`);
apps/api/src/modules/wms/wms.service.ts:171:      const defaultWarehouse = task.warehouse_code || 'WMS-VTE-MAIN';
apps/api/src/modules/wms/wms.service.ts:176:        `UPDATE wms_inbound SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE task_no = $1`,
apps/api/src/modules/wms/wms.service.ts:187:        const warehouseCode = item.warehouse_code || item.warehouse || defaultWarehouse;
apps/api/src/modules/wms/wms.service.ts:188:        this.assertWritableWarehouse(warehouseCode, `入库明细 ${baseBatchNo}`);
apps/api/src/modules/wms/wms.service.ts:208:            `INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, location_code, store_code)
apps/api/src/modules/wms/wms.service.ts:214:            [baseBatchNo, item.product_code, actualQty, warehouseCode, locationCode, storeCode],
apps/api/src/modules/wms/wms.service.ts:221:              `入库确认 product=${item.product_code} actual=${actualQty} warehouse=${warehouseCode}`,
apps/api/src/modules/wms/wms.service.ts:230:            `INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, location_code, store_code)
apps/api/src/modules/wms/wms.service.ts:237:            [brokenBatchNo, item.product_code, brokenQty, warehouseCode, 'QUARANTINE-DOCK', storeCode],
apps/api/src/modules/wms/wms.service.ts:263:      warehouseCode?: string;
apps/api/src/modules/wms/wms.service.ts:271:    const warehouseCode = ctx.warehouseCode || 'WMS-VTE-MAIN';
apps/api/src/modules/wms/wms.service.ts:272:    this.assertWritableWarehouse(warehouseCode, `采购收货 ${ctx.refNo}`);
apps/api/src/modules/wms/wms.service.ts:282:        `INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, location_code, store_code)
apps/api/src/modules/wms/wms.service.ts:288:        [batchNo, it.productCode, qty, warehouseCode, locationCode, storeCode],
apps/api/src/modules/wms/wms.service.ts:294:         `采购收货入库 product=${it.productCode} qty=${qty} wh=${warehouseCode}`],
apps/api/src/modules/wms/wms.service.ts:387:            `SELECT qty, warehouse_code FROM inv_batches WHERE batch_no = $1 FOR UPDATE`,
apps/api/src/modules/wms/wms.service.ts:393:          this.assertWritableWarehouse(batch.warehouse_code, `出库批次 ${it.batch_no}`);
apps/api/src/modules/wms/wms.service.ts:465:      const scope = this.warehouseScope('warehouse_code', 0);
apps/api/src/modules/wms/wms.service.ts:485:      const scope = this.warehouseScope('warehouse_code', 0);
apps/api/src/modules/wms/wms.service.ts:520:      const scope = this.warehouseScope('warehouse_code', 0);
apps/api/src/modules/wms/wms.service.ts:522:        `SELECT * FROM wms_inbound WHERE status = 'PENDING' AND ${scope.sql} ORDER BY created_at DESC`,
apps/api/src/modules/wms/wms.service.ts:534:        `SELECT * FROM wms_inbound_items WHERE task_no = $1`,
apps/api/src/modules/wms/wms.service.ts:545:      `SELECT warehouse_code FROM wms_inbound WHERE task_no = $1 LIMIT 1`,
apps/api/src/modules/wms/wms.service.ts:549:      this.assertWritableWarehouse(rows[0].warehouse_code || null, `收货单 ${orderNo}`);
apps/api/src/modules/wms/wms.service.ts:552:      `UPDATE wms_inbound SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE task_no = $1`,
apps/api/src/modules/wms/wms.service.ts:627:   *   from_warehouse, to_warehouse, transfer_no?, items: [{ batch_no, qty }], operator?
apps/api/src/modules/wms/wms.service.ts:637:    const { from_warehouse, to_warehouse, items = [], operator } = body || {};
apps/api/src/modules/wms/wms.service.ts:638:    if (!from_warehouse || !to_warehouse || from_warehouse === to_warehouse) {
apps/api/src/modules/wms/wms.service.ts:641:    this.assertWritableWarehouse(from_warehouse, '库存调拨源仓库');
apps/api/src/modules/wms/wms.service.ts:642:    this.assertWritableWarehouse(to_warehouse, '库存调拨目标仓库');
apps/api/src/modules/wms/wms.service.ts:653:        `INSERT INTO wms_transfer (transfer_no, from_warehouse, to_warehouse, status, operator_id, created_at, updated_at)
apps/api/src/modules/wms/wms.service.ts:655:        [transferNo, from_warehouse, to_warehouse, user?.userId || null],
apps/api/src/modules/wms/wms.service.ts:667:          `SELECT batch_no, product_code, qty, expire_date, store_code, warehouse_code
apps/api/src/modules/wms/wms.service.ts:672:        this.assertWritableWarehouse(src.warehouse_code, `调拨源批次 ${it.batch_no}`);
apps/api/src/modules/wms/wms.service.ts:683:          [it.batch_no, qty, opName, src.store_code || 'ALL', transferNo, `调拨出 → ${to_warehouse}`],
apps/api/src/modules/wms/wms.service.ts:689:          `INSERT INTO inv_batches (batch_no, product_code, qty, warehouse_code, location_code, expire_date, store_code)
apps/api/src/modules/wms/wms.service.ts:691:          [dstBatchNo, src.product_code, qty, to_warehouse, 'TRANSFER-IN', src.expire_date, src.store_code || 'ALL'],
apps/api/src/modules/wms/wms.service.ts:696:          [dstBatchNo, qty, opName, src.store_code || 'ALL', transferNo, `调拨入 ← ${from_warehouse} 源 batch=${it.batch_no}`],
apps/api/src/modules/wms/wms.service.ts:720:        `SELECT warehouse_code FROM wms_stocktake WHERE stocktake_no=$1 LIMIT 1`,
apps/api/src/modules/wms/wms.service.ts:724:        this.assertWritableWarehouse(stocktakeRows[0].warehouse_code || null, `盘点单 ${stocktake_no}`);
apps/api/src/modules/wms/wms.service.ts:734:          `SELECT warehouse_code FROM inv_batches WHERE batch_no = $1 LIMIT 1`,
apps/api/src/modules/wms/wms.service.ts:738:        this.assertWritableWarehouse(batchRows[0].warehouse_code, `盘点批次 ${batch_no}`);
apps/api/src/modules/wms/wms.service.ts:785:          `SELECT qty, warehouse_code, store_code FROM inv_batches WHERE batch_no = $1 FOR UPDATE`,
apps/api/src/modules/wms/wms.service.ts:790:        this.assertWritableWarehouse(b.warehouse_code, `盘点批次 ${batchNo}`);
apps/api/src/modules/wms/wms.service.ts:798:             (stocktake_no, warehouse_code, item, sys_qty, act_qty, diff_qty, status, auditor, date, count_type, store_code)
apps/api/src/modules/wms/wms.service.ts:800:          [stNo, b.warehouse_code, batchNo, sysQty, counted, diff, op, today, storeCode],
apps/api/src/modules/wms/wms.service.ts:907:        `SELECT warehouse_code FROM wms_stocktake WHERE stocktake_no=$1 LIMIT 1`,
apps/api/src/modules/wms/wms.service.ts:911:        this.assertWritableWarehouse(lossRows[0].warehouse_code || null, `损耗单 ${loss_no}`);
apps/api/src/modules/wms/wms.service.ts:921:          `SELECT warehouse_code FROM inv_batches WHERE batch_no = $1 LIMIT 1`,
apps/api/src/modules/wms/wms.service.ts:925:        this.assertWritableWarehouse(batchRows[0].warehouse_code, `损耗批次 ${batch_no}`);
apps/api/src/modules/generic-crud/generic-crud.controller.ts:152:    if (table === 'inv_batches' || table === 'inv_ledger') return 'MENU_WMS_VIEW';
apps/api/src/modules/generic-crud/generic-crud.controller.ts:153:    if (table.startsWith('inv_'))            return 'MENU_WMS_VIEW';
apps/api/src/modules/generic-crud/generic-crud.controller.ts:154:    if (table.startsWith('wms_'))            return 'MENU_WMS_INOUT';
apps/api/src/modules/generic-crud/generic-crud.controller.ts:247:      wms_outbound: 'site_code',
apps/api/src/modules/generic-crud/generic-crud.controller.ts:248:      wms_inbound:  'site_code',
apps/api/src/modules/generic-crud/generic-crud.controller.ts:257:      // G30：仓储主数据无 store_code 列（cause warehouse 看板 500），统一全局可读
apps/api/src/modules/generic-crud/generic-crud.controller.ts:258:      'wms_warehouses', 'wms_zones', 'wms_locations',
apps/api/src/modules/generic-crud/generic-crud.controller.ts:289:    // G17：wms_outbound/inbound 走 site_code 隔离 — 自动注入 site_code
apps/api/src/modules/generic-crud/generic-crud.controller.ts:291:    if ((table === 'wms_outbound' || table === 'wms_inbound') && !body.site_code && sc && sc.startsWith('SITE-')) {
apps/api/src/modules/generic-crud/generic-crud.controller.ts:301:      wms_inbound:             ['operator'],
apps/api/src/modules/generic-crud/generic-crud.controller.ts:302:      wms_outbound:            ['operator', 'picker'],
apps/api/src/modules/generic-crud/generic-crud.controller.ts:393:    wms_warehouses:   'warehouse_code',
apps/api/src/modules/generic-crud/generic-crud.controller.ts:395:    wms_zones:        'zone_code',
apps/api/src/modules/wms/inventory/inventory.service.spec.ts:8:    warehouse_code: 'W1',
apps/api/src/modules/wms/inventory/inventory.service.ts:16:  private assertWritableWarehouse(warehouseCode: string | null | undefined, label: string): void {
apps/api/src/modules/wms/inventory/inventory.service.ts:19:    if (!warehouseCode) {
apps/api/src/modules/wms/inventory/inventory.service.ts:22:    if (!scope.allowedWarehouseCodes.includes(warehouseCode)) {
apps/api/src/modules/wms/inventory/inventory.service.ts:32:    warehouse_code: string;
apps/api/src/modules/wms/inventory/inventory.service.ts:41:    this.assertWritableWarehouse(dto.warehouse_code, '库存扣减');
apps/api/src/modules/wms/inventory/inventory.service.ts:49:          warehouse_code: dto.warehouse_code,
apps/api/src/modules/wms/inventory/inventory.service.ts:84:      ledger.warehouse_code = dto.warehouse_code;
apps/api/src/modules/wms/inventory/inventory.service.ts:103:    warehouse_code: string;
apps/api/src/modules/wms/inventory/inventory.service.ts:112:    this.assertWritableWarehouse(dto.warehouse_code, '库存入库');
apps/api/src/modules/wms/inventory/inventory.service.ts:119:          warehouse_code: dto.warehouse_code,
apps/api/src/modules/wms/inventory/inventory.service.ts:130:        balance.warehouse_code = dto.warehouse_code;
apps/api/src/modules/wms/inventory/inventory.service.ts:155:      ledger.warehouse_code = dto.warehouse_code;
apps/api/src/modules/generic-crud/crud.constants.ts:12:  'wms_warehouses', 'wms_locations', 'wms_inbound', 'wms_inbound_items', 'wms_outbound', 'wms_outbound_items', 'wms_stocktake',
apps/api/src/modules/generic-crud/crud.constants.ts:13:  'wms_zones', 'wms_transfer', 'wms_stock_transfers', 'wms_suppliers',
apps/api/src/modules/generic-crud/generic-crud.service.ts:14:   * e.g. column "source" of relation "wms_inbound" does not exist
apps/api/src/modules/generic-crud/generic-crud.service.ts:52:        'wms_warehouses', 'wms_locations',
apps/api/src/modules/generic-crud/generic-crud.service.ts:53:        'wms_inbound', 'wms_inbound_items', 'wms_outbound', 'wms_outbound_items',
apps/api/src/modules/generic-crud/generic-crud.service.ts:1079:        // ── 仓储补充（wms_zones/wms_transfer/wms_stock_transfers） ──────
apps/api/src/modules/generic-crud/generic-crud.service.ts:1080:        `CREATE TABLE IF NOT EXISTS wms_zones (
apps/api/src/modules/generic-crud/generic-crud.service.ts:1084:           warehouse  VARCHAR(50),
apps/api/src/modules/generic-crud/generic-crud.service.ts:1089:        `ALTER TABLE wms_zones ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:1090:        // B5: wms_zones 加 warehouse_code 与 wms_warehouses 关联（旧 warehouse 列已不再使用）
apps/api/src/modules/generic-crud/generic-crud.service.ts:1091:        `ALTER TABLE wms_zones ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(50)`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:1092:        // 历史数据：把旧 warehouse 列内容迁移到 warehouse_code
apps/api/src/modules/generic-crud/generic-crud.service.ts:1093:        `UPDATE wms_zones SET warehouse_code = ware
```
