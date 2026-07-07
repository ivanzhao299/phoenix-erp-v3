# Agent Worker Log

| Field | Value |
| --- | --- |
| Task ID | BUGTASK-20260707-0003-01-A2 |
| Agent | A2-Security-Regression-Gate |
| Dry run | No |
| Exit code | 0 |

## Command

```bash
/usr/local/bin/node scripts/ops/run-agent-task.mjs --agent A2-Security-Regression-Gate --worktree /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate --prompt docs/ops/prompts/A2_SECURITY_REVIEW_PROMPT.md --task-contract docs/ops/runs/BUGTASK-20260707-0003-01-A2-contract.md --assembled-prompt-output docs/ops/runs/BUGTASK-20260707-0003-01-A2-worker-assembled-prompt.md --require-approval-token APPROVE_AGENT_EXECUTION --skip-baseline-autopilot --allow-ops-runtime-dirty
```

## Stdout

```text
Agent: A2-Security-Regression-Gate
Worktree: /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate
Branch: w5-a2-security-regression-gate
Prompt: docs/ops/prompts/A2_SECURITY_REVIEW_PROMPT.md
Task contract: docs/ops/runs/BUGTASK-20260707-0003-01-A2-contract.md
Assembled prompt: docs/ops/runs/BUGTASK-20260707-0003-01-A2-worker-assembled-prompt.md
Assembled prompt chars: 21528
Codex command: codex exec -C /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate --sandbox workspace-write -
Codex timeout ms: 600000
Run log: /Users/mac/phoenix-erp-worktrees/codex-orchestrator/docs/ops/runs/2026-07-07T12-22-45-445Z-A2-Security-Regression-Gate.md
A2 gate complete.

Decision: **PASS WITH CONDITIONS / HOLD**  
Report: [BUGTASK-20260707-0003_A2-Security-Regression-Gate_REPORT.md](/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate/docs/ops/BUGTASK-20260707-0003_A2-Security-Regression-Gate_REPORT.md)

Key result: production 403 is a correct RBAC denial for raw IoT telemetry. The `/home` regression should be fixed by gating the optional IoT KPI call with `MENU_IOT` and making optional dashboard calls silent, not by granting finance roles `MENU_IOT`.

Committed docs-only report:

`0c837c84 docs(ops): record a2 security gate for home 403 bug`

Validation done: environment precheck, code inspection, RBAC/menu evidence, final `git status --short` clean. No code changes, no DB access, no migrations, no deploy, no push.
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
reasoning effort: high
reasoning summaries: none
session id: 019f3c85-2379-7122-873c-656a5e7b87b7
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

Source bug: BUG-20260707-0003
Source repair task: BUGTASK-20260707-0003
Assigned agent: A2-Security-Regression-Gate

## Issue

打开运营工作台报错[403] MENU_PERMISSION_DENIED

## Route

/home

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "url": "https://erp.eggslao.com/home",
  "bugNo": "BUG-20260707-0003",
  "route": "/home",
  "title": "打开运营工作台报错[403] MENU_PERMISSION_DENIED",
  "taskNo": "BUGTASK-20260707-0003",
  "context": {
    "attachments": [
      {
        "sha256": "c855ed46adcfda3d042a0c130bc3f2da2778a4e6387e5e0001a603565c1d861f",
        "fileName": "01-1783384095554-6aec182d.png",
        "mimeType": "image/png",
        "sizeBytes": 1216992,
        "originalName": "pasted-screenshot-1783383887907-1.png",
        "relativePath": "storage/bug-reports/2026/07/07/BUG-20260707-0003/01-1783384095554-6aec182d.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260707-0003/attachments/01-1783384095554-6aec182d.png"
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
      "capturedAt": "2026-07-07T00:28:15.565Z",
      "pageSnapshot": {
        "route": "/home",
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
          "采购管理",
          "销售管理",
          "财务结算中心",
          "股东权益中心",
          "审批中心",
          "经营分析",
          "主数据中心",
          "个人中心 / 修改密码",
          "⚠️",
          "影子模式：正在以 刘汉涛 身份查看（由 admin 发起）— 仅用于测试/排障，操作会以该用户身份执行",
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
          "pasted-screenshot-1783383887907-1.png",
          "退出",
          "·",
          "2026年7月7日星期二",
          "早上好，刘汉涛",
          "今天没有紧急事项，可以专注做事。",
          "待办",
          "超时",
          "高危告警",
          "羽",
          "枚",
          "%",
          "kg",
          "L",
          "条",
          "事务流 · 我的待办",
          "共 0 单",
          "经营概览",
          "· 业务全景（4）",
          "销售",
          "订单 · 收款",
          "现金",
          "账户 · 流水",
          "应收",
          "发票 · 账龄",
          "应付",
          "账期 · 付款",
          "数据质量驾驶舱",
          "综合评分",
          "需整改 · 7 维加权",
          "主数据健康 98/100",
          "业务中心",
          "· 一键直达（5）"
        ],
        "interactiveElements": [
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__groupHeader.sidebar-module__C8A-ya__groupActive",
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
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 220,
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
              "w": 220,
              "x": 0,
              "y": 271
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
              "y": 309
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
              "y": 347
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
              "y": 385
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
              "y": 423
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
              "y": 461
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
              "y": 499
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
              "x": 1057,
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
              "x": 1214,
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
              "x": 1262,
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
              "y": -26
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
              "x": 768,
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
              "w": 100,
              "x": 1398,
              "y": 52
            },
            "label": "刘 刘汉涛 总部财务审计",
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
            "tag": "a",
            "path": "",
            "rect": {
              "h": 36,
              "w": 148,
              "x": 293,
              "y": 244
            },
            "label": "进入财务中心",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 36,
              "w": 117,
              "x": 449,
              "y": 244
            },
            "label": "主数据中心",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 18,
              "w": 38,
              "x": 995,
              "y": 427
            },
            "label": "全部",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 74,
              "w": 180,
              "x": 283,
              "y": 671
            },
            "label": "销售 订单 · 收款",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 74,
              "w": 180,
              "x": 473,
              "y": 671
            },
            "label": "现金 账户 · 流水",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 74,
              "w": 180,
              "x": 663,
              "y": 671
            },
            "label": "应收 发票 · 账龄",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 74,
              "w": 180,
              "x": 853,
              "y": 671
            },
            "label": "应付 账期 · 付款",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 162,
              "w": 487,
              "x": 1060,
              "y": 407
            },
            "label": "数据质量驾驶舱 79 / 100 综合评分 需整改 · 7 维加权 主数据健康 98/100",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 158,
              "w": 487,
              "x": 1060,
              "y": 581
            },
            "label": "需立即关注 2 项高危告警 · 共 4 条",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 58,
              "w": 243,
              "x": 283,
              "y": 825
            },
            "label": "采购中心",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 58,
              "w": 243,
              "x": 534,
              "y": 825
            },
            "label": "销售中心",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 58,
              "w": 243,
              "x": 786,
              "y": 825
            },
            "label": "财务中心",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 58,
              "w": 243,
              "x": 1037,
              "y": 825
            },
            "label": "审批工作台",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 58,
              "w": 243,
              "x": 1289,
              "y": 825
            },
            "label": "数据质量",
            "disabled": false
          }
        ]
      },
      "devicePixelRatio": 2
    },
    "consoleErrors": [],
    "failedRequests": [
      {
        "url": "/api/v3/iot/devices/all-summary",
        "method": "GET",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-07T00:23:44.898Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"MENU_PERMISSION_DENIED\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/v3/iot/devices/all-summary",
        "method": "GET",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-07T00:23:56.948Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"MENU_PERMISSION_DENIED\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/v3/iot/devices/all-summary",
        "method": "GET",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-07T00:24:04.879Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"MENU_PERMISSION_DENIED\",\"error\":\"Forbidden\",\"statusCode\":403}"
      }
    ],
    "localEvidence": {
      "localAttachments": [
        {
          "fileName": "01-1783384095554-6aec182d.png",
          "sourceEndpoint": "/api/bug-intake/reports/BUG-20260707-0003/attachments/01-1783384095554-6aec182d.png",
          "downloadError": "GET /api/bug-intake/reports/BUG-20260707-0003/attachments/01-1783384095554-6aec182d.png failed HTTP 404: {\"code\":404,\"message\":\"附件文件不存在\",\"error\":\"Not Found\",\"statusCode\":404}"
        }
      ],
      "localAttachmentPaths": []
    }
  },
  "priority": "P2",
  "reporter": {
    "name": "刘汉涛",
    "roles": [
      "ROLE_HQ_FINANCE",
      "ROLE_FIN_COST",
      "ROLE_TREASURY_MANAGER",
      "ROLE_FINANCE_ANALYST",
      "ROLE_COST_ACCOUNTING_MANAGER",
      "ROLE_FIN_ACCOUNT_MASTER_MGR"
    ],
    "username": "liuhantao",
    "companyCode": "",
    "projectCode": ""
  },
  "severity": "MEDIUM",
  "agentPlan": {
    "source_bug_no": "BUG-20260707-0003",
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
    "source_repair_task_no": "BUGTASK-20260707-0003"
  },
  "createdAt": "2026-07-07T00:29:35.583Z",
  "createdBy": "admin",
  "moduleCode": "_____",
  "suggestedOwner": "_____",
  "repairGuardrails": {
    "autoRepairExecuted": false,
    "noProductionDeploy": true,
    "noDbWriteWithoutGate": true,
    "requiresHumanApproval": true
  },
  "acceptanceCriteria": "可正常访问运营工作台，要求右上角不报[403] MENU_PERMISSION_DENIED",
  "agentPlanGeneratedAt": "2026-07-07T00:29:36.902Z",
  "agentPlanGeneratedBy": "admin",
  "agentExecutionApproval": {
    "approved": true,
    "approvedAt": "2026-07-07T00:29:38.118Z",
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
我先做合同要求的环境门禁检查，只读验证目录、分支、状态和最近提交；如果 worktree 不干净或分支不匹配会停止。
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
2a91657c (HEAD -> w5-a2-security-regression-gate) docs(ops): record a2 security gate for cash account rbac bug
283abd18 docs(ops): record a2 security gate for warehouse 403 bug
beefce6e docs(ops): record a2 security gate for home kpi bug
4ef76aa2 docs(ops): record a2 security gate for cash account bug
7bd5c23f docs(ops): record baseline lifecycle report
83b70cca docs(ops): record baseline lifecycle report
306e7d86 docs(ops): prioritize production readiness remediation tasks
8ebf8089 docs(ops): record baseline lifecycle report

exec
/bin/zsh -lc 'git status --short' in /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate
 succeeded in 0ms:
codex
门禁通过：目录、分支正确，worktree 干净。现在进入只读诊断，重点确认 `/home` 是否无条件调用了需要 IoT 菜单权限的接口，以及后端 RBAC 装饰器/菜单码是否匹配。
exec
/bin/zsh -lc "rg -n \"MenuPermission|RequirePermission|MENU_|permission\" apps/api/src --glob '"'!**/node_modules/**'"'" in /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate
 succeeded in 0ms:
apps/api/src/guards/phoenix-jwt.guard.ts:57:        permissions: decoded.permissions || [],
apps/api/src/modules/finance-v2/services/cash-accounts.service.ts:359:   * 删后逐个重算受影响账户余额链。需 MENU_FIN2_CASH_TXN:D + 数据域(逐条公司校验)。
apps/api/src/modules/finance-v2/services/shareholder-settlements.service.ts:245:          moduleCode:   'MENU_FIN2_SHAREHOLDER',
apps/api/src/modules/terminal/stocktake.controller.ts:10:@RequireMenu('MENU_PKG_MGR', 'V')
apps/api/src/modules/terminal/stocktake.controller.ts:23:@RequireMenu('MENU_PKG_MGR', 'E')
apps/api/src/modules/terminal/pda.controller.ts:11:@RequireMenu('MENU_PDA', 'V')
apps/api/src/modules/terminal/packaging.controller.ts:25:  @RequireMenu('MENU_PACKAGING', 'V')
apps/api/src/modules/terminal/packaging.controller.ts:32:  @RequireMenu('MENU_PACKAGING', 'V')
apps/api/src/modules/terminal/packaging.controller.ts:39:  @RequireMenu('MENU_PACKAGING', 'V')
apps/api/src/modules/terminal/packaging.controller.ts:46:  @RequireMenu('MENU_PACKAGING', 'V')
apps/api/src/modules/terminal/packaging.controller.ts:53:  @RequireMenu('MENU_PACKAGING', 'V')
apps/api/src/modules/terminal/packaging.controller.ts:60:  @RequireMenu('MENU_PACKAGING', 'V')
apps/api/src/modules/terminal/packaging.controller.ts:70:  @RequireMenu('MENU_PACKAGING', 'V')
apps/api/src/modules/terminal/packaging.controller.ts:77:  @RequireMenu('MENU_PACKAGING', 'V')
apps/api/src/modules/terminal/packaging.controller.ts:84:  @RequireMenu('MENU_PKG_MGR', 'C')
apps/api/src/modules/terminal/packaging.controller.ts:91:  @RequireMenu('MENU_PKG_MGR', 'C')
apps/api/src/modules/terminal/packaging.controller.ts:98:  @RequireMenu('MENU_PKG_MGR', 'E')
apps/api/src/modules/terminal/packaging.controller.ts:105:  @RequireMenu('MENU_PKG_MGR', 'C')
apps/api/src/modules/terminal/packaging.controller.ts:112:  @RequireMenu('MENU_PKG_MGR', 'C')
apps/api/src/modules/terminal/packaging.controller.ts:119:  @RequireMenu('MENU_PKG_MGR', 'E')
apps/api/src/modules/terminal/packaging.controller.ts:127:  @RequireMenu('MENU_PKG_MGR', 'C')
apps/api/src/modules/terminal/packaging.controller.ts:152:  @RequireMenu('MENU_PACKAGING', 'V')
apps/api/src/modules/terminal/packaging.controller.ts:158:  @RequireMenu('MENU_PACKAGING', 'V')
apps/api/src/modules/terminal/packaging.controller.ts:164:  @RequireMenu('MENU_PKG_MGR', 'C')
apps/api/src/modules/finance-v2/services/shareholder-contributions.service.ts:396:          moduleCode:   'MENU_FIN2_SHAREHOLDER',
apps/api/src/modules/finance-v2/services/shareholder-contributions.service.ts:412:        // 不再自动入账），由另一持 MENU_FIN2_SHAREHOLDER:E 的非创建者在台账「确认」完成。
apps/api/src/modules/terminal/labels.controller.ts:11:@RequireMenu('MENU_PKG_MGR', 'V')
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:307:  //   - 通知接收者:所有有 MENU_FIN2_AR_LEDGER:V 权限的活跃用户
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:323:  /** 查所有有 MENU_FIN2_AR_LEDGER:V 权限的活跃用户 ID
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:333:        JOIN sys_role_menu_permission rmp ON rmp.role_id = ur.role_id
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:335:        WHERE m.menu_code = 'MENU_FIN2_AR_LEDGER'
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:342:        JOIN sys_role_permission_set rps      ON rps.role_id = ur.role_id
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:343:        JOIN sys_permission_set_item psi      ON psi.set_id = rps.set_id
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:345:        WHERE m.menu_code = 'MENU_FIN2_AR_LEDGER'
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:351:        SELECT ups.user_id FROM sys_user_permission_set ups
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:352:        JOIN sys_permission_set_item psi ON psi.set_id = ups.set_id
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:354:        WHERE m.menu_code = 'MENU_FIN2_AR_LEDGER'
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:396:      this.log.warn('g199-D cron 跳过通知:无 MENU_FIN2_AR_LEDGER:V 接收者');
apps/api/src/modules/finance-v2/controllers/finance-order-bridge.controller.ts:43:  @RequireMenu('MENU_FIN2_AR', 'C')
apps/api/src/modules/finance-v2/controllers/finance-order-bridge.controller.ts:103:  @RequireMenu('MENU_FIN2_AR', 'V')
apps/api/src/modules/finance-v2/controllers/fin-expense.controller.ts:26:const MENU       = 'MENU_FIN2_EXPENSE';
apps/api/src/modules/finance-v2/controllers/fin-expense.controller.ts:27:const REIMB_MENU = 'MENU_FIN2_REIMBURSE'; // Phase 2A: 独立报销管理菜单权限
apps/api/src/modules/finance-v2/controllers/fin-ar-reconciliation.controller.ts:10: * 权限:沿用 MENU_FIN2_AR_LEDGER:V(看总账即可看对账;入账权 E 在 chanjet-sync 页)
apps/api/src/modules/finance-v2/controllers/fin-ar-reconciliation.controller.ts:19:  @RequireMenu('MENU_FIN2_AR_LEDGER', 'V')
apps/api/src/modules/finance-v2/controllers/fin-ar-reconciliation.controller.ts:26:  @RequireMenu('MENU_FIN2_AR_LEDGER', 'V')
apps/api/src/modules/finance-v2/controllers/fin-ap.controller.ts:31: * 权限：MENU_FIN2_AP（所有接口）
apps/api/src/modules/finance-v2/controllers/fin-ap.controller.ts:46:  @RequireMenu('MENU_FIN2_AP', 'V')
apps/api/src/modules/finance-v2/controllers/fin-ap.controller.ts:58:  @RequireMenu('MENU_FIN2_AP', 'V')
apps/api/src/modules/finance-v2/controllers/fin-ap.controller.ts:70:  @RequireMenu('MENU_FIN2_AP', 'E')
apps/api/src/modules/finance-v2/controllers/fin-ap.controller.ts:82:  @RequireMenu('MENU_FIN2_AP', 'E')
apps/api/src/modules/finance-v2/controllers/fin-ap.controller.ts:97:  @RequireMenu('MENU_FIN2_AP', 'E')
apps/api/src/modules/finance-v2/controllers/fin-ap.controller.ts:113:  @RequireMenu('MENU_FIN2_AP', 'V')
apps/api/src/modules/finance-v2/controllers/fin-ap.controller.ts:126:  @RequireMenu('MENU_FIN2_AP', 'V')
apps/api/src/modules/finance-v2/controllers/fin-ap.controller.ts:139:  @RequireMenu('MENU_FIN2_AP', 'E')
apps/api/src/modules/finance-v2/controllers/finance-v2.controller.ts:94:  @RequireMenu('MENU_FIN2', 'V')
apps/api/src/modules/finance-v2/controllers/finance-v2.controller.ts:191:  @RequireMenu('MENU_FIN2_AP', 'V')
apps/api/src/modules/finance-v2/controllers/finance-v2.controller.ts:215:  @RequireMenu('MENU_FIN2_AP', 'V')
apps/api/src/modules/finance-v2/controllers/fin-ar-ledger.controller.ts:14: * 权限：MENU_FIN2_AR_LEDGER 'V'（刘杰 ROLE_FINANCE_REVIEW_MANAGER 已授）。
apps/api/src/modules/finance-v2/controllers/fin-ar-ledger.controller.ts:39:  @RequireMenu('MENU_FIN2_AR_LEDGER', 'V')
apps/api/src/modules/finance-v2/controllers/fin-ar-ledger.controller.ts:46:  @RequireMenu('MENU_FIN2_AR_LEDGER', 'V')
apps/api/src/modules/shareholder/controllers/shareholder.controller.ts:13:const VIEW    = 'MENU_SHAREHOLDER_VIEW';
apps/api/src/modules/shareholder/controllers/shareholder.controller.ts:14:const MANAGE  = 'MENU_SHAREHOLDER_MANAGE';
apps/api/src/modules/shareholder/controllers/shareholder.controller.ts:15:const CONTRIB = 'MENU_SHAREHOLDER_CONTRIBUTION';
apps/api/src/modules/shareholder/controllers/shareholder.controller.ts:16:const SCOPE   = 'MENU_SHAREHOLDER_SCOPE';
apps/api/src/modules/shareholder/controllers/shareholder.controller.ts:17:const DASH    = 'MENU_SHAREHOLDER_DASHBOARD';
apps/api/src/modules/shareholder/controllers/shareholder.controller.ts:18:const CAPITAL = 'MENU_SHAREHOLDER_CAPITAL';
apps/api/src/modules/finance-v2/controllers/financial-reports.controller.ts:15: * 11 个只读聚合端点，全部需要 MENU_FIN2_REPORT 的 'V' 权限。
apps/api/src/modules/finance-v2/controllers/financial-reports.controller.ts:51:  @RequireMenu('MENU_FIN2_REPORT', 'V')
apps/api/src/modules/finance-v2/controllers/financial-reports.controller.ts:64:  @RequireMenu('MENU_FIN2_REPORT', 'V')
apps/api/src/modules/finance-v2/controllers/financial-reports.controller.ts:76:  @RequireMenu('MENU_FIN2_REPORT', 'V')
apps/api/src/modules/finance-v2/controllers/financial-reports.controller.ts:89:  @RequireMenu('MENU_FIN2_REPORT', 'V')
apps/api/src/modules/finance-v2/controllers/financial-reports.controller.ts:101:  @RequireMenu('MENU_FIN2_REPORT', 'V')
apps/api/src/modules/finance-v2/controllers/financial-reports.controller.ts:113:  @RequireMenu('MENU_FIN2_REPORT', 'V')
apps/api/src/modules/finance-v2/controllers/financial-reports.controller.ts:126:  @RequireMenu('MENU_FIN2_REPORT', 'V')
apps/api/src/modules/finance-v2/controllers/financial-reports.controller.ts:141:  @RequireMenu('MENU_FIN2_REPORT', 'V')
apps/api/src/modules/finance-v2/controllers/financial-reports.controller.ts:153:  @RequireMenu('MENU_FIN2_REPORT', 'V')
apps/api/src/modules/finance-v2/controllers/financial-reports.controller.ts:165:  @RequireMenu('MENU_FIN2_REPORT', 'V')
apps/api/src/modules/finance-v2/controllers/financial-reports.controller.ts:178:  @RequireMenu('MENU_FIN2_REPORT', 'V')
apps/api/src/modules/finance-v2/controllers/financial-reports.controller.ts:190:  @RequireMenu('MENU_FIN2_REPORT', 'V')
apps/api/src/modules/finance-v2/controllers/fin-ar.controller.ts:45: * 权限：MENU_FIN2_AR
apps/api/src/modules/finance-v2/controllers/fin-ar.controller.ts:60:  @RequireMenu('MENU_FIN2_AR', 'V')
apps/api/src/modules/finance-v2/controllers/fin-ar.controller.ts:66:  @RequireMenu('MENU_FIN2_AR', 'V')
apps/api/src/modules/finance-v2/controllers/fin-ar.controller.ts:72:  @RequireMenu('MENU_FIN2_AR', 'E')
apps/api/src/modules/finance-v2/controllers/fin-ar.controller.ts:78:  @RequireMenu('MENU_FIN2_AR', 'E')
apps/api/src/modules/finance-v2/controllers/fin-ar.controller.ts:87:  @RequireMenu('MENU_FIN2_AR', 'E')
apps/api/src/modules/finance-v2/controllers/fin-ar.controller.ts:100:  @RequireMenu('MENU_FIN2_AR', 'V')
apps/api/src/modules/finance-v2/controllers/fin-ar.controller.ts:106:  @RequireMenu('MENU_FIN2_AR', 'V')
apps/api/src/modules/finance-v2/controllers/fin-ar.controller.ts:112:  @RequireMenu('MENU_FIN2_AR', 'E')
apps/api/src/modules/finance-v2/controllers/fin-ar.controller.ts:118:  @RequireMenu('MENU_FIN2_AR', 'A')   // H2 修复：收款确认是审批级操作，需要 A（Approve）权限
apps/api/src/modules/finance-v2/controllers/fin-ar.controller.ts:127:  @RequireMenu('MENU_FIN2_AR', 'E')
apps/api/src/modules/finance-v2/controllers/fin-ar.controller.ts:140:  @RequireMenu('MENU_FIN2_AR', 'V')
apps/api/src/modules/finance-v2/controllers/fin-ar.controller.ts:146:  @RequireMenu('MENU_FIN2_AR', 'V')
apps/api/src/modules/finance-v2/controllers/fin-shareholder.controller.ts:26:const MENU = 'MENU_FIN2_SHAREHOLDER';
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:29:// G35 父子菜单粒度治理：17 endpoint 按子菜单细分（替代旧 MENU_FIN2_CASH 父菜单）
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:30:const MENU_VIEW     = 'MENU_FIN2_CASH_VIEW';      // 账户列表/详情/汇总
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:31:const MENU_MASTER   = 'MENU_FIN2_CASH_MASTER';    // 账户主档（建/改/冻/关）
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:32:const MENU_TXN      = 'MENU_FIN2_CASH_TXN';       // 流水（查/录）
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:33:const MENU_TRANSFER = 'MENU_FIN2_CASH_TRANSFER';  // 资金转账（查/建/审/执/撤）
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:66:  @RequireMenu(MENU_VIEW, 'V')
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:73:  @RequireMenu(MENU_VIEW, 'V')
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:80:  @RequireMenu(MENU_VIEW, 'V')
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:87:  @RequireMenu(MENU_MASTER, 'C')
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:108:  @RequireMenu(MENU_MASTER, 'E')
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:119:  @RequireMenu(MENU_MASTER, 'E')
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:127:  @RequireMenu(MENU_MASTER, 'E')
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:135:  @RequireMenu(MENU_MASTER, 'E')
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:143:  @RequireMenu(MENU_MASTER, 'E')
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:155:  @RequireMenu(MENU_TXN, 'V')
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:170:   * G35：需要 MENU_FIN2_CASH_TXN:C
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:173:  @RequireMenu(MENU_TXN, 'C')
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:183:   * 属账户主档级修正，需 MENU_FIN2_CASH_MASTER:E。
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:186:  @RequireMenu(MENU_MASTER, 'E')
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:193:   *   G103：仅 source_type='MANUAL' 可改，改后重算余额链。需 MENU_FIN2_CASH_TXN:E。
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:196:  @RequireMenu(MENU_TXN, 'E')
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:203:   *   G103：仅 source_type='MANUAL' 可删，删后重算余额链。需 MENU_FIN2_CASH_TXN:D。
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:206:  @RequireMenu(MENU_TXN, 'D')
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:214:   *   删后重算受影响账户余额链。需 MENU_FIN2_CASH_TXN:D。
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:217:  @RequireMenu(MENU_TXN, 'D')
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:229:  @RequireMenu(MENU_TRANSFER, 'V')
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:236:  @RequireMenu(MENU_TRANSFER, 'V')
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:243:  @RequireMenu(MENU_TRANSFER, 'C')
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:250:  @RequireMenu(MENU_TRANSFER, 'E')
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:258:  @RequireMenu(MENU_TRANSFER, 'A')
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:266:  @RequireMenu(MENU_TRANSFER, 'E')
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts:274:  @RequireMenu(MENU_TRANSFER, 'E')
apps/api/src/modules/org/guards/data-scope.guard.ts:11:import { REQUIRE_MENU_KEY } from '../../../common/guards/menu.guard';
apps/api/src/modules/org/guards/data-scope.guard.ts:24:      REQUIRE_MENU_KEY,
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:38:      moduleCode:      'MENU_PRC2_ORDER',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:46:      moduleCode:      'MENU_PRC2_ORDER',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:83:      moduleCode:      'MENU_PRC2_PAYMENT',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:91:      moduleCode:      'MENU_PRC2_FUND',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:99:      moduleCode:      'MENU_FIN2_SHAREHOLDER',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:107:      moduleCode:      'MENU_FIN2_SHAREHOLDER',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:117:      moduleCode:      'MENU_FIN2_EXPENSE',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:181:      moduleCode:      'MENU_FIN2_EXPENSE',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:191:      moduleCode:      'MENU_SALES2_PRICE',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:202:      moduleCode:      'MENU_SALES2_ORDER',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:213:      moduleCode:      'MENU_SALES2_RETURN',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:222:      moduleCode:      'MENU_SHAREHOLDER_CAPITAL',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:246:      moduleCode: 'MENU_MASTER_DATA', tableName: 'sal_customers',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:252:      moduleCode: 'MENU_MASTER_DATA', tableName: 'prc2_suppliers',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:259:      moduleCode: 'MENU_MASTER_DATA', tableName: 'prc2_projects',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:265:      moduleCode: 'MENU_MD_BANK_ACCOUNT', tableName: 'fin_cash_accounts',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:272:      moduleCode: 'MENU_MD_BANK_ACCOUNT', tableName: 'fin_bank_accounts',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:281:      moduleCode: 'MENU_MASTER_DATA', tableName: 'mst_products',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:287:      moduleCode: 'MENU_MASTER_DATA', tableName: 'mst_stores',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:293:      moduleCode: 'MENU_MASTER_DATA', tableName: 'product_skus',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:299:      moduleCode: 'MENU_MASTER_DATA', tableName: 'wms_warehouses',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:305:      moduleCode: 'MENU_MASTER_DATA', tableName: 'product_grades',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:311:      moduleCode: 'MENU_MASTER_DATA', tableName: 'packaging_specs',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:317:      moduleCode: 'MENU_MASTER_DATA', tableName: 'sal_drivers',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:323:      moduleCode: 'MENU_MASTER_DATA', tableName: 'sal_vehicles',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:329:      moduleCode: 'MENU_MASTER_DATA', tableName: 'sys_organizations',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:335:      moduleCode: 'MENU_MASTER_DATA', tableName: 'sys_organizations',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:341:      moduleCode: 'MENU_MASTER_DATA', tableName: 'sys_dict',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:351:      moduleCode:      'MENU_MASTER_DATA',
apps/api/src/modules/store-pos/services/sales-engine.service.ts:120:            ` you (${order.seller_subject_id}) have no permission to place order.`,
apps/api/src/modules/approval-engine/approval-rules.controller.ts:23:  @RequireMenu('MENU_WORKFLOW', 'V')
apps/api/src/modules/approval-engine/approval-rules.controller.ts:30:  @RequireMenu('MENU_WORKFLOW', 'V')
apps/api/src/modules/approval-engine/approval-rules.controller.ts:37:  @RequireMenu('MENU_WORKFLOW', 'C')
apps/api/src/modules/approval-engine/approval-rules.controller.ts:44:  @RequireMenu('MENU_WORKFLOW', 'E')
apps/api/src/modules/approval-engine/approval-rules.controller.ts:51:  @RequireMenu('MENU_WORKFLOW', 'E')
apps/api/src/modules/approval-engine/approval-rules.controller.ts:62:  @RequireMenu('MENU_WORKFLOW', 'D')
apps/api/src/modules/org/services/org.service.ts:83:      const s = await this.dataScopeService.resolve(userId, roles, 'MENU_SYS_ORG');
apps/api/src/modules/store-pos/controllers/store-pos.controller.ts:47:  @RequireMenu('MENU_STORE_POS', 'V')
apps/api/src/modules/store-pos/controllers/store-pos.controller.ts:58:  @RequireMenu('MENU_STORE_POS', 'V')
apps/api/src/modules/store-pos/controllers/store-pos.controller.ts:66:  @RequireMenu('MENU_STORE_POS', 'V')
apps/api/src/modules/store-pos/controllers/store-pos.controller.ts:72:  @RequireMenu('MENU_STORE_POS', 'C')
apps/api/src/modules/store-pos/controllers/store-pos.controller.ts:80:  @RequireMenu('MENU_STORE_POS', 'C')
apps/api/src/modules/store-pos/controllers/store-pos.controller.ts:89:  @RequireMenu('MENU_STORE_POS', 'V')
apps/api/src/modules/store-pos/controllers/store-pos.controller.ts:103:  @RequireMenu('MENU_STORE_POS', 'V')
apps/api/src/modules/store-pos/controllers/store-pos.controller.ts:124:  @RequireMenu('MENU_STORE_POS', 'C')
apps/api/src/modules/store-pos/controllers/store-pos.controller.ts:155:  @RequireMenu('MENU_STORE_POS', 'V')
apps/api/src/modules/store-pos/controllers/store-pos.controller.ts:163:  @RequireMenu('MENU_STORE_POS', 'E')
apps/api/src/modules/store-pos/controllers/store-pos.controller.ts:172:  @RequireMenu('MENU_STORE_POS', 'E')
apps/api/src/modules/store-pos/controllers/store-pos.controller.ts:178:  @RequireMenu('MENU_STORE_POS', 'E')
apps/api/src/modules/store-pos/controllers/store-pos.controller.ts:193:  @RequireMenu('MENU_STORE_POS', 'D')
apps/api/src/modules/org/organization.controller.ts:8: * 本控制器=组织树 Runtime 视角（MENU_ORG_VIEW，树/CRUD/启停，master-data/organizations
apps/api/src/modules/org/organization.controller.ts:82:  @RequireMenu('MENU_ORG_VIEW', 'V')
apps/api/src/modules/org/organization.controller.ts:96:  @RequireMenu('MENU_ORG_VIEW', 'V')
apps/api/src/modules/org/organization.controller.ts:111:  @RequireMenu('MENU_ORG_VIEW', 'V')
apps/api/src/modules/org/organization.controller.ts:134:  @RequireMenu('MENU_ORG_VIEW', 'V')
apps/api/src/modules/org/organization.controller.ts:147:  @RequireMenu('MENU_ORG_VIEW', 'V')
apps/api/src/modules/org/organization.controller.ts:161:  @RequireMenu('MENU_ORG_MANAGE', 'C')
apps/api/src/modules/org/organization.controller.ts:174:  @RequireMenu('MENU_ORG_MANAGE', 'C')
apps/api/src/modules/org/organization.controller.ts:193:  @RequireMenu('MENU_ORG_MANAGE', 'E')
apps/api/src/modules/org/organization.controller.ts:209:  @RequireMenu('MENU_ORG_MANAGE', 'E')
apps/api/src/modules/org/organization.controller.ts:226:  @RequireMenu('MENU_ORG_MANAGE', 'D')
apps/api/src/modules/approval-engine/approval-engine.controller.ts:14:  @RequireMenu('MENU_WORKFLOW', 'V')
apps/api/src/modules/approval-engine/approval-engine.controller.ts:21:  @RequireMenu('MENU_WORKFLOW', 'V')
apps/api/src/modules/approval-engine/approval-engine.controller.ts:32:  @RequireMenu('MENU_WORKFLOW', 'V')
apps/api/src/modules/approval-engine/approval-engine.controller.ts:39:  @RequireMenu('MENU_WORKFLOW', 'V')
apps/api/src/modules/approval-engine/approval-engine.controller.ts:49:  @RequireMenu('MENU_WORKFLOW', 'V')
apps/api/src/modules/approval-engine/approval-engine.controller.ts:61:  @RequireMenu('MENU_WORKFLOW', 'A')
apps/api/src/modules/approval-engine/approval-engine.controller.ts:71:  @RequireMenu('MENU_WORKFLOW', 'A')
apps/api/src/modules/approval-engine/approval-engine.controller.ts:82:  @RequireMenu('MENU_WORKFLOW', 'V')
apps/api/src/modules/approval-engine/approval-engine.controller.ts:89:  @RequireMenu('MENU_WORKFLOW', 'V')
apps/api/src/modules/quality/quality.controller.ts:18:  @RequireMenu('MENU_QA', 'V')
apps/api/src/modules/quality/quality.controller.ts:26:  @RequireMenu('MENU_QA', 'V')
apps/api/src/modules/quality/quality.controller.ts:36:  @RequireMenu('MENU_QA', 'V')
apps/api/src/modules/quality/quality.controller.ts:42:  @RequireMenu('MENU_QA', 'C')
apps/api/src/modules/quality/quality.controller.ts:48:  @RequireMenu('MENU_QA', 'V')
apps/api/src/modules/quality/quality.controller.ts:54:  @RequireMenu('MENU_QA', 'V')
apps/api/src/modules/quality/quality.controller.ts:60:  @RequireMenu('MENU_QA', 'C')
apps/api/src/modules/quality/quality.controller.ts:66:  @RequireMenu('MENU_QA', 'V')
apps/api/src/modules/org/org.controller.ts:9: *   · 本控制器 /api/org/*：管理视角（MENU_SYS_ORG），含 用户-组织绑定 / 数据范围规则 /
apps/api/src/modules/org/org.controller.ts:11: *   · OrganizationController /api/organizations/*：组织树 Runtime 视角（MENU_ORG_VIEW），
apps/api/src/modules/org/org.controller.ts:45:  @RequireMenu('MENU_SYS_ORG', 'V')
apps/api/src/modules/org/org.controller.ts:52:  @RequireMenu('MENU_SYS_ORG', 'V')
apps/api/src/modules/org/org.controller.ts:59:  @RequireMenu('MENU_SYS_ORG', 'C')
apps/api/src/modules/org/org.controller.ts:66:  @RequireMenu('MENU_SYS_ORG', 'E')
apps/api/src/modules/org/org.controller.ts:76:  @RequireMenu('MENU_SYS_ORG', 'D')
apps/api/src/modules/org/org.controller.ts:87:  @RequireMenu('MENU_SYS_ORG', 'V')
apps/api/src/modules/org/org.controller.ts:94:  @RequireMenu('MENU_SYS_ORG', 'V')
apps/api/src/modules/org/org.controller.ts:101:  @RequireMenu('MENU_SYS_ORG', 'C')
apps/api/src/modules/org/org.controller.ts:108:  @RequireMenu('MENU_SYS_ORG', 'E')
apps/api/src/modules/org/org.controller.ts:118:  @RequireMenu('MENU_SYS_ORG', 'D')
apps/api/src/modules/org/org.controller.ts:128:  @RequireMenu('MENU_SYS_ORG', 'V')
apps/api/src/modules/org/org.controller.ts:135:  @RequireMenu('MENU_SYS_ORG', 'C')
apps/api/src/modules/org/org.controller.ts:142:  @RequireMenu('MENU_SYS_ORG', 'D')
apps/api/src/modules/org/org.controller.ts:150:  @RequireMenu('MENU_SYS_ORG', 'C')
apps/api/src/modules/org/org.controller.ts:157:  @RequireMenu('MENU_SYS_ORG', 'D')
apps/api/src/modules/org/org.controller.ts:167:  @RequireMenu('MENU_SYS_ORG', 'V')
apps/api/src/modules/org/org.controller.ts:174:  @RequireMenu('MENU_SYS_ORG', 'C')
apps/api/src/modules/org/org.controller.ts:181:  @RequireMenu('MENU_SYS_ORG', 'E')
apps/api/src/modules/org/org.controller.ts:191:  @RequireMenu('MENU_SYS_ORG', 'D')
apps/api/src/modules/approval-engine/approval-rules.service.ts:55:        'MENU_WORKFLOW',
apps/api/src/modules/notification/presence.controller.ts:9: * 全局 MenuGuard 生效，@RequireMenu('MENU_SYSTEM','V') 限管理员/系统角色（ROLE_ADMIN 持 * 通过）。
apps/api/src/modules/notification/presence.controller.ts:21:  @RequireMenu('MENU_SYSTEM', 'V')
apps/api/src/modules/notification/presence.controller.ts:72:  @RequireMenu('MENU_SYSTEM', 'V')
apps/api/src/modules/notification/notification.controller.ts:16:  @RequireMenu('MENU_WORKFLOW', 'V')
apps/api/src/modules/notification/notification.controller.ts:34:  @RequireMenu('MENU_WORKFLOW', 'V')
apps/api/src/modules/notification/notification.controller.ts:41:  @RequireMenu('MENU_WORKFLOW', 'V')
apps/api/src/modules/notification/notification.controller.ts:48:  @RequireMenu('MENU_WORKFLOW', 'V')
apps/api/src/modules/notification/notification.controller.ts:55:  @RequireMenu('MENU_WORKFLOW', 'V')
apps/api/src/modules/notification/notification.controller.ts:71:  @RequireMenu('MENU_WORKFLOW', 'V')
apps/api/src/modules/notification/notification.controller.ts:78:  @RequireMenu('MENU_WORKFLOW', 'V')
apps/api/src/modules/notification/notification.controller.ts:85:  @RequireMenu('MENU_WORKFLOW', 'V')
apps/api/src/modules/uat/controllers/uat-pilot-run.controller.ts:16:  @RequireMenu('MENU_UAT', 'V')
apps/api/src/modules/uat/controllers/uat-pilot-run.controller.ts:27:  @RequireMenu('MENU_UAT', 'V')
apps/api/src/modules/uat/controllers/uat-pilot-run.controller.ts:33:  @RequireMenu('MENU_UAT', 'V')
apps/api/src/modules/uat/controllers/uat-pilot-run.controller.ts:39:  @RequireMenu('MENU_UAT', 'C')
apps/api/src/modules/uat/controllers/uat-pilot-run.controller.ts:45:  @RequireMenu('MENU_UAT', 'E')
apps/api/src/modules/uat/controllers/uat-training.controller.ts:16:  @RequireMenu('MENU_UAT', 'V')
apps/api/src/modules/uat/controllers/uat-training.controller.ts:27:  @RequireMenu('MENU_UAT', 'V')
apps/api/src/modules/uat/controllers/uat-training.controller.ts:33:  @RequireMenu('MENU_UAT', 'C')
apps/api/src/modules/uat/controllers/pilot-run-dashboard.controller.ts:27:  @RequireMenu('MENU_UAT', 'V')
apps/api/src/modules/uat/controllers/pilot-run-dashboard.controller.ts:34:  @RequireMenu('MENU_UAT', 'V')
apps/api/src/modules/uat/controllers/pilot-run-dashboard.controller.ts:41:  @RequireMenu('MENU_UAT', 'C')
apps/api/src/modules/uat/controllers/pilot-run-dashboard.controller.ts:51:  @RequireMenu('MENU_UAT', 'V')
apps/api/src/modules/file/file-access.service.ts:13:import { hasPerm } from '../../auth/permissions.util';
apps/api/src/modules/file/file-access.service.ts:155:    if (hasPerm(user.permissions, policy.requiredMenu, 'V')) return;
apps/api/src/modules/file/file-access.service.ts:237:    permissions?: string[];
apps/api/src/modules/file/file-access.service.ts:250:    return this.roles().includes('ROLE_ADMIN') || user.role === 'ROLE_ADMIN' || user.permissions?.includes('*') === true;
apps/api/src/modules/uat/controllers/uat-feedback.controller.ts:20:  @RequireMenu('MENU_UAT', 'V')
apps/api/src/modules/uat/controllers/uat-feedback.controller.ts:33:  @RequireMenu('MENU_UAT', 'V')
apps/api/src/modules/uat/controllers/uat-feedback.controller.ts:39:  @RequireMenu('MENU_UAT', 'V')
apps/api/src/modules/uat/controllers/uat-feedback.controller.ts:45:  @RequireMenu('MENU_UAT', 'C')
apps/api/src/modules/uat/controllers/uat-feedback.controller.ts:56:  @RequireMenu('MENU_UAT', 'E')
apps/api/src/modules/procurement-v2/services/payments.service.ts:300:        moduleCode:   'MENU_PRC2_PAYMENT',
apps/api/src/modules/procurement-v2/services/requests.service.ts:335:        moduleCode:   'MENU_PRC2_ORDER',
apps/api/src/modules/uat/controllers/uat-readiness.controller.ts:14:  @RequireMenu('MENU_UAT', 'V')
apps/api/src/modules/uat/controllers/uat-checklist.controller.ts:21:  @RequireMenu('MENU_UAT', 'V')
apps/api/src/modules/uat/controllers/uat-checklist.controller.ts:28:  @RequireMenu('MENU_UAT', 'V')
apps/api/src/modules/uat/controllers/uat-checklist.controller.ts:35:  @RequireMenu('MENU_UAT', 'V')
apps/api/src/modules/uat/controllers/uat-checklist.controller.ts:48:  @RequireMenu('MENU_UAT', 'E')
apps/api/src/modules/procurement-v2/services/orders.service.ts:558:        moduleCode:   'MENU_PRC2_ORDER',
apps/api/src/modules/procurement-v2/services/shareholder-funds.service.ts:148:    // G156 安全：补归属校验——原 findOne 无任何 scope 校验，持 MENU_PRC2_FUND V 权者凭 id 可读
apps/api/src/modules/procurement-v2/services/shareholder-funds.service.ts:222:        moduleCode:   'MENU_PRC2_FUND',
apps/api/src/modules/master/master.controller.ts:109:  @RequireMenu('MENU_SETTINGS_IT', 'E')
apps/api/src/modules/procurement-v2/controllers/requests.controller.ts:24:  @RequireMenu('MENU_PRC2_MASTER', 'V')
apps/api/src/modules/procurement-v2/controllers/requests.controller.ts:31:  @RequireMenu('MENU_PRC2_MASTER', 'V')
apps/api/src/modules/procurement-v2/controllers/requests.controller.ts:38:  @RequireMenu('MENU_PRC2_MASTER', 'V')
apps/api/src/modules/procurement-v2/controllers/requests.controller.ts:45:  @RequireMenu('MENU_PRC2_MASTER', 'C')
apps/api/src/modules/procurement-v2/controllers/requests.controller.ts:52:  @RequireMenu('MENU_PRC2_MASTER', 'E')
apps/api/src/modules/procurement-v2/controllers/requests.controller.ts:59:  @RequireMenu('MENU_PRC2_MASTER', 'E')
apps/api/src/modules/procurement-v2/controllers/requests.controller.ts:66:  @RequireMenu('MENU_PRC2_MASTER', 'A')
apps/api/src/modules/procurement-v2/controllers/requests.controller.ts:73:  @RequireMenu('MENU_PRC2_MASTER', 'A')
apps/api/src/modules/procurement-v2/controllers/requests.controller.ts:80:  @RequireMenu('MENU_PRC2_MASTER', 'E')
apps/api/src/modules/master/system-users.controller.ts:53:@RequireMenu('MENU_SYSTEM', 'V')
apps/api/src/debug.controller.ts:12:  @RequireMenu('MENU_SYS_CONFIG', 'V')
apps/api/src/modules/procurement-v2/controllers/suppliers.controller.ts:21:  @RequireMenu('MENU_PRC2_MASTER', 'V')
apps/api/src/modules/procurement-v2/controllers/suppliers.controller.ts:28:  @RequireMenu('MENU_PRC2_MASTER', 'V')
apps/api/src/modules/procurement-v2/controllers/suppliers.controller.ts:35:  @RequireMenu('MENU_PRC2_MASTER', 'C')
apps/api/src/modules/procurement-v2/controllers/suppliers.controller.ts:42:  @RequireMenu('MENU_PRC2_MASTER', 'E')
apps/api/src/modules/procurement-v2/controllers/suppliers.controller.ts:49:  @RequireMenu('MENU_PRC2_MASTER', 'E')
apps/api/src/modules/procurement-v2/controllers/orders.controller.ts:27:  @RequireMenu('MENU_PRC2_ORDER', 'V')
apps/api/src/modules/procurement-v2/controllers/orders.controller.ts:34:  @RequireMenu('MENU_PRC2_ORDER', 'V')
apps/api/src/modules/procurement-v2/controllers/orders.controller.ts:41:  @RequireMenu('MENU_PRC2_ORDER', 'V')
apps/api/src/modules/procurement-v2/controllers/orders.controller.ts:48:  @RequireMenu('MENU_PRC2_ORDER', 'V')
apps/api/src/modules/procurement-v2/controllers/orders.controller.ts:55:  @RequireMenu('MENU_PRC2_ORDER', 'V')
apps/api/src/modules/procurement-v2/controllers/orders.controller.ts:62:  @RequireMenu('MENU_PRC2_ORDER', 'C')
apps/api/src/modules/procurement-v2/controllers/orders.controller.ts:69:  @RequireMenu('MENU_PRC2_ORDER', 'E')
apps/api/src/modules/procurement-v2/controllers/orders.controller.ts:76:  @RequireMenu('MENU_PRC2_ORDER', 'E')
apps/api/src/modules/procurement-v2/controllers/orders.controller.ts:83:  @RequireMenu('MENU_PRC2_ORDER', 'A')
apps/api/src/modules/procurement-v2/controllers/orders.controller.ts:90:  @RequireMenu('MENU_PRC2_ORDER', 'A')
apps/api/src/modules/procurement-v2/controllers/orders.controller.ts:97:  @RequireMenu('MENU_PRC2_ORDER', 'E')
apps/api/src/modules/procurement-v2/controllers/orders.controller.ts:106:  @RequireMenu('MENU_PRC2_ORDER', 'C')
apps/api/src/modules/procurement-v2/controllers/payments.controller.ts:25:  @RequireMenu('MENU_PRC2_PAYMENT', 'V')
apps/api/src/modules/procurement-v2/controllers/payments.controller.ts:29:  @RequireMenu('MENU_PRC2_PAYMENT', 'V')
apps/api/src/modules/procurement-v2/controllers/payments.controller.ts:33:  @RequireMenu('MENU_PRC2_PAYMENT', 'V')
apps/api/src/modules/procurement-v2/controllers/payments.controller.ts:37:  @RequireMenu('MENU_PRC2_PAYMENT', 'C')
apps/api/src/modules/procurement-v2/controllers/payments.controller.ts:41:  @RequireMenu('MENU_PRC2_PAYMENT', 'E')
apps/api/src/modules/procurement-v2/controllers/payments.controller.ts:45:  @RequireMenu('MENU_PRC2_PAYMENT', 'E')
apps/api/src/modules/procurement-v2/controllers/payments.controller.ts:49:  @RequireMenu('MENU_PRC2_PAYMENT', 'A')
apps/api/src/modules/procurement-v2/controllers/payments.controller.ts:55:  @RequireMenu('MENU_PRC2_PAYMENT', 'E')
apps/api/src/modules/procurement-v2/controllers/payments.controller.ts:59:  @RequireMenu('MENU_PRC2_PAYMENT', 'E')
apps/api/src/modules/procurement-v2/controllers/payments.controller.ts:65:  @RequireMenu('MENU_PRC2_PAYMENT', 'V')
apps/api/src/modules/procurement-v2/controllers/payments.controller.ts:78:  @RequireMenu('MENU_PRC2_FUND', 'V')
apps/api/src/modules/store/store.controller.ts:14:  @RequireMenu('MENU_FIN_CLOSE', 'C') // 结账操作映射到财务结算相关的菜单权限
apps/api/src/modules/store/store.controller.ts:20:  @RequireMenu('MENU_FIN_CLOSE', 'E')
apps/api/src/modules/store/store.controller.ts:26:  @RequireMenu('MENU_FIN_CLOSE', 'A') // 提交给财务，需要较高权限或者复核权限
apps/api/src/modules/store/store.controller.ts:37:  @RequireMenu('MENU_FIN_CLOSE', 'V')
apps/api/src/modules/store/store.controller.ts:44:  @RequireMenu('MENU_FIN_CLOSE', 'C')
apps/api/src/modules/store/store.controller.ts:51:  @RequireMenu('MENU_FIN_CLOSE', 'V')
apps/api/src/modules/procurement-v2/controllers/receipts.controller.ts:19:  @RequireMenu('MENU_PRC2_RECEIPT', 'V')
apps/api/src/modules/procurement-v2/controllers/receipts.controller.ts:23:  @RequireMenu('MENU_PRC2_RECEIPT', 'V')
apps/api/src/modules/procurement-v2/controllers/receipts.controller.ts:27:  @RequireMenu('MENU_PRC2_RECEIPT', 'C')
apps/api/src/modules/procurement-v2/controllers/receipts.controller.ts:31:  @RequireMenu('MENU_PRC2_RECEIPT', 'E')
apps/api/src/modules/procurement-v2/controllers/receipts.controller.ts:35:  @RequireMenu('MENU_PRC2_RECEIPT', 'E')
apps/api/src/common/entities/sys-operation-log.entity.ts:34:  /** MENU 代码，如 MENU_PRC2_FUND */
apps/api/src/modules/procurement-v2/controllers/shareholder-funds.controller.ts:14:  @RequireMenu('MENU_PRC2_FUND', 'V')
apps/api/src/modules/procurement-v2/controllers/shareholder-funds.controller.ts:20:  @RequireMenu('MENU_PRC2_FUND', 'V')
apps/api/src/modules/procurement-v2/controllers/shareholder-funds.controller.ts:26:  @RequireMenu('MENU_PRC2_FUND', 'C')
apps/api/src/modules/procurement-v2/controllers/shareholder-funds.controller.ts:32:  @RequireMenu('MENU_PRC2_FUND', 'E')
apps/api/src/modules/procurement-v2/controllers/shareholder-funds.controller.ts:38:  @RequireMenu('MENU_PRC2_FUND', 'E')
apps/api/src/modules/procurement-v2/controllers/shipments.controller.ts:22:  @RequireMenu('MENU_PRC2_SHIPMENT', 'V')
apps/api/src/modules/procurement-v2/controllers/shipments.controller.ts:26:  @RequireMenu('MENU_PRC2_SHIPMENT', 'V')
apps/api/src/modules/procurement-v2/controllers/shipments.controller.ts:30:  @RequireMenu('MENU_PRC2_SHIPMENT', 'C')
apps/api/src/modules/procurement-v2/controllers/shipments.controller.ts:34:  @RequireMenu('MENU_PRC2_SHIPMENT', 'E')
apps/api/src/modules/procurement-v2/controllers/shipments.controller.ts:38:  @RequireMenu('MENU_PRC2_SHIPMENT', 'E')
apps/api/src/modules/procurement-v2/controllers/shipments.controller.ts:42:  @RequireMenu('MENU_PRC2_SHIPMENT', 'E')
apps/api/src/modules/procurement-v2/controllers/shipments.controller.ts:46:  @RequireMenu('MENU_PRC2_SHIPMENT', 'E')
apps/api/src/modules/procurement-v2/controllers/shipments.controller.ts:50:  @RequireMenu('MENU_PRC2_SHIPMENT', 'E')
apps/api/src/modules/procurement-v2/controllers/shipments.controller.ts:54:  @RequireMenu('MENU_PRC2_SHIPMENT', 'E')
apps/api/src/modules/procurement-v2/controllers/init.controller.ts:21:  @RequireMenu('MENU_PRC2_INIT', 'V')
apps/api/src/modules/procurement-v2/controllers/init.controller.ts:33:  @RequireMenu('MENU_PRC2_INIT', 'V')
apps/api/src/modules/procurement-v2/controllers/init.controller.ts:40:  @RequireMenu('MENU_PRC2_INIT', 'V')
apps/api/src/modules/procurement-v2/controllers/init.controller.ts:47:  @RequireMenu('MENU_PRC2_INIT', 'V')
apps/api/src/modules/procurement-v2/controllers/init.controller.ts:54:  @RequireMenu('MENU_PRC2_INIT', 'C')
apps/api/src/modules/procurement-v2/controllers/init.controller.ts:66:  @RequireMenu('MENU_PRC2_INIT', 'C')
apps/api/src/modules/procurement-v2/controllers/init.controller.ts:73:  @RequireMenu('MENU_PRC2_INIT', 'C')
apps/api/src/modules/wms/inventory.controller.ts:14:  @RequireMenu('MENU_WMS_VIEW', 'V')
apps/api/src/modules/wms/inventory.controller.ts:20:  @RequireMenu('MENU_INV_BATCH', 'E')
apps/api/src/modules/wms/inventory.controller.ts:32:  @RequireMenu('MENU_WMS_VIEW', 'V')
apps/api/src/modules/wms/inventory.controller.ts:38:  @RequireMenu('MENU_WMS_VIEW', 'V')
apps/api/src/modules/wms/inventory.controller.ts:44:  @RequireMenu('MENU_WMS_VIEW', 'V')
apps/api/src/modules/wms/inventory.controller.ts:50:  @RequireMenu('MENU_INV_BATCH', 'E')
apps/api/src/modules/wms/inventory.controller.ts:56:  @RequireMenu('MENU_PDA', 'C')
apps/api/src/modules/wms/inventory.controller.ts:63:  @RequireMenu('MENU_INV_BATCH', 'E')
apps/api/src/modules/wms/inventory.controller.ts:70:  @RequireMenu('MENU_INV_BATCH', 'E')
apps/api/src/modules/wms/inventory.controller.ts:77:  @RequireMenu('MENU_INV_BATCH', 'E')
apps/api/src/modules/procurement-v2/controllers/dashboard.controller.ts:14:  @RequireMenu('MENU_PRC2', 'V')
apps/api/src/modules/procurement-v2/controllers/dashboard.controller.ts:21:  @RequireMenu('MENU_PRC2', 'V')
apps/api/src/modules/procurement-v2/controllers/dashboard.controller.ts:28:  @RequireMenu('MENU_PRC2', 'V')
apps/api/src/modules/procurement-v2/controllers/dashboard.controller.ts:35:  @RequireMenu('MENU_PRC2', 'V')
apps/api/src/modules/procurement-v2/controllers/dashboard.controller.ts:42:  @RequireMenu('MENU_PRC2_FUND', 'V')
apps/api/src/modules/procurement-v2/controllers/dashboard.controller.ts:49:  @RequireMenu('MENU_PRC2', 'V')
apps/api/src/modules/procurement-v2/controllers/dashboard.controller.ts:56:  @RequireMenu('MENU_PRC2', 'V')
apps/api/src/modules/procurement-v2/controllers/projects.controller.ts:21:  @RequireMenu('MENU_PRC2_MASTER', 'V')
apps/api/src/modules/procurement-v2/controllers/projects.controller.ts:28:  @RequireMenu('MENU_PRC2_MASTER', 'V')
apps/api/src/modules/procurement-v2/controllers/projects.controller.ts:35:  @RequireMenu('MENU_PRC2_MASTER', 'C')
apps/api/src/modules/procurement-v2/controllers/projects.controller.ts:42:  @RequireMenu('MENU_PRC2_MASTER', 'E')
apps/api/src/modules/procurement-v2/controllers/projects.controller.ts:49:  @RequireM
```
