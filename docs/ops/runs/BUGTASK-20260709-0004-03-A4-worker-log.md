# Agent Worker Log

| Field | Value |
| --- | --- |
| Task ID | BUGTASK-20260709-0004-03-A4 |
| Agent | A4-Frontend-UAT-Smoke |
| Dry run | No |
| Exit code | 0 |

## Command

```bash
/usr/local/bin/node scripts/ops/run-agent-task.mjs --agent A4-Frontend-UAT-Smoke --worktree /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke --prompt docs/ops/prompts/A4_FRONTEND_TASK_PROMPT.md --task-contract docs/ops/runs/BUGTASK-20260709-0004-03-A4-contract.md --assembled-prompt-output docs/ops/runs/BUGTASK-20260709-0004-03-A4-worker-assembled-prompt.md --require-approval-token APPROVE_AGENT_EXECUTION --skip-baseline-autopilot --allow-ops-runtime-dirty
```

## Stdout

```text
Agent: A4-Frontend-UAT-Smoke
Worktree: /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
Branch: w5-a4-frontend-uat-smoke
Prompt: docs/ops/prompts/A4_FRONTEND_TASK_PROMPT.md
Task contract: docs/ops/runs/BUGTASK-20260709-0004-03-A4-contract.md
Assembled prompt: docs/ops/runs/BUGTASK-20260709-0004-03-A4-worker-assembled-prompt.md
Assembled prompt chars: 24633
Codex command: codex exec -C /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke --sandbox workspace-write -
Codex timeout ms: 600000
Run log: /Users/mac/phoenix-erp-worktrees/codex-orchestrator/docs/ops/runs/2026-07-09T08-40-10-430Z-A4-Frontend-UAT-Smoke.md
PASS WITH CONDITIONS for A4.

The current branch already contains the frontend count fix in [page.tsx](/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke/apps/web/src/app/(admin)/workflow/todos/page.tsx:133): `items=1,total=0` now displays `共 1 条`, so no new frontend code change was needed for this duplicate/redispatched bug.

I added the required report here: [bug-20260709-0004-a4-frontend-uat-smoke.md](/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke/docs/ops/bug-20260709-0004-a4-frontend-uat-smoke.md)

Validation run:
- `cd apps/web && ./node_modules/.bin/tsc --noEmit`: PASS
- `pnpm --filter web exec eslint 'src/app/(admin)/workflow/todos/page.tsx'`: PASS
- Count normalization dry-run: PASS
- Static permission/API path check: PASS
- Local browser smoke: BLOCKED by sandbox `listen EPERM 127.0.0.1:3001`
- Runtime RBAC/DataScope audit: BLOCKED because API credentials / `ADMIN_PASS` are unavailable

Committed locally, not pushed:
- `bf34bcf4 docs(ops): add bug 20260709 0004 a4 report`

Worktree is clean.
Baseline autopilot skipped by caller; caller must run lifecycle hook.

```

## Stderr

```text
OpenAI Codex v0.142.5
--------
workdir: /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
model: gpt-5.5
provider: openai
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR]
reasoning effort: high
reasoning summaries: none
session id: 019f4606-233c-7651-a8b7-d9f07c188a3b
--------
user
# Base Agent Prompt

# A4 Frontend Task Prompt

## Agent Identity

You are `A4-Frontend-UIUX-UAT`.

The canonical branch/worktree name remains `A4-Frontend-UAT-Smoke` for compatibility, but your responsibility is expanded to frontend implementation, UI/UX polish, styling, responsive layout, permission-aware UI, and UAT smoke.

## Worktree And Branch

Worktree: `/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke`

Branch: `w5-a4-frontend-uat-smoke`

## Responsibility

You own:

1. frontend page development;
2. UI/UX optimization;
3. style adjustment;
4. form, list, detail page, modal, drawer, and filter area polish;
5. button, menu, tag, status color, icon, spacing, and layout improvements;
6. PC and mobile responsive adaptation;
7. frontend permission visibility;
8. frontend routes and menu display;
9. frontend UAT smoke validation.

## Execution Checks

Run before work:

```bash
pwd
git branch --show-current
git status --short
git log --oneline --decorate -8
```

Stop if directory, branch, or worktree cleanliness is invalid.

## Allowed Scope

1. `apps/web/**`
2. `docs/ops/**`

## Forbidden Scope

1. `apps/api/**`
2. migrations
3. schema/entity/table/column changes
4. deployment scripts or production deploy logic
5. database writes
6. permission bypass or hidden security shortcuts

## Required Output Report

Write a report under `docs/ops/**` containing:

1. changed file list;
2. page/component list;
3. UI/UX adjustment summary;
4. permission visibility notes;
5. responsive behavior notes;
6. UAT smoke result;
7. whether A2 security review is required;
8. whether A1 validation is required;
9. blockers and next recommendation.

## Commit Rule

Commit only approved frontend files and the required report.

## Failure Rule

Stop on backend dependency missing, forbidden scope, unverified UI path, unexpected dirty files, permission ambiguity, migration need, DB write need, or deployment requirement.

## Hard Boundaries

1. Do not deploy.
2. Do not execute migrations.
3. Do not write databases.
4. Do not modify backend code.
5. Do not modify schema/entity/table/column.

---

# Agent Task Contract

# Bug Repair Agent Contract

Source bug: BUG-20260709-0004
Source repair task: BUGTASK-20260709-0004
Assigned agent: A4-Frontend-UAT-Smoke

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
我会先做规定的 dry-run 检查，确认当前 worktree、分支和脏文件状态，再只读定位 `/workflow/todos` 的计数来源。
exec
/bin/zsh -lc pwd in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke

exec
/bin/zsh -lc 'git branch --show-current' in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
w5-a4-frontend-uat-smoke

exec
/bin/zsh -lc 'git log --oneline --decorate -8' in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
68b4b323 (HEAD -> w5-a4-frontend-uat-smoke, w5-a3-backend-critical-path, main) docs(ops): record baseline lifecycle report
5c0a4720 docs(ops): add bug 20260709 0004 backend report
8f6d9249 (w5-a7-final-qa-gate) docs(ops): record baseline lifecycle report
410385e2 docs(ops): add bug 20260709 0003 final qa gate
c5cd2134 (w5-a6-staging-deploy-runbook) docs(ops): record baseline lifecycle report
fc744daf docs(ops): add bug 20260709 0003 staging runbook
ba5fa4d6 docs(ops): record baseline lifecycle report
c00267e1 feat(web): record A4-Frontend-UAT-Smoke result

exec
/bin/zsh -lc 'git status --short' in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
codex
检查通过：目录和分支匹配，当前没有脏文件。我现在只读查找待办页实现和标题“共 X 条”的计算逻辑。
exec
/bin/zsh -lc "rg --files apps/web | rg 'workflow|todo|approval|审批'" in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
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
/bin/zsh -lc 'rg -n "workflow/todos|我的待办|审批待办|待审批任务|共 .* 条|todos" apps/web' in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
apps/web/public/sw.js:120:  const body    = payload.body   || '你有新的审批待办';
apps/web/src/locales/zh.json:4002:  "no_pending_approval": "当前无待审批任务",
apps/web/src/locales/zh.json:4105:  "menu.wf-approval-todos": "审批待办",
apps/web/src/locales/zh.json:4504:  "dwork.todosToHandle": "项待办需要处理",
apps/web/src/locales/zh.json:4505:  "dwork.clickTodoCard": "点下方\"我的待办\"卡片快速处理",
apps/web/src/locales/zh.json:4540:  "dwork.card.todo.title": "我的待办",
apps/web/src/locales/zh.json:4578:  "home.todosUnit": "个待办",
apps/web/src/locales/zh.json:4587:  "home.viewMyTodos": "查看我的待办",
apps/web/src/locales/zh.json:4594:  "home.todosPending": "个待办待处理",
apps/web/src/locales/zh.json:4616:  "home.todoFlow": "事务流 · 我的待办",
apps/web/src/locales/zh.json:7129:  "mob.home.desc_workflow": "统一审批待办",
apps/web/src/locales/zh.json:9452:  "ui.审批待办": "审批待办",
apps/web/src/locales/zh.json:9658:  "ui.当前没有待审批任务。": "当前没有待审批任务。",
apps/web/src/locales/zh.json:9698:  "ui.待审批任务": "待审批任务",
apps/web/src/locales/zh.json:9726:  "ui.我的待办": "我的待办",
apps/web/src/locales/zh.json:9727:  "ui.我的待办优先 · SLA 实时监控 · 业务驱动审批 · 智能发起常用流程": "我的待办优先 · SLA 实时监控 · 业务驱动审批 · 智能发起常用流程",
apps/web/src/locales/zh.json:9728:  "ui.我的待审批任务（共": "我的待审批任务（共",
apps/web/src/locales/zh.json:10025:  "ui.暂无待审批任务": "暂无待审批任务",
apps/web/src/locales/zh.json:10151:  "ui.查看全部审批待办 →": "查看全部审批待办 →",
apps/web/src/locales/lo.json:4105:  "menu.wf-approval-todos": "ລໍຖ້າອະນຸມັດ",
apps/web/src/locales/lo.json:4527:  "dwork.todosToHandle": "ລາຍການລໍຖ້າດຳເນີນການ",
apps/web/src/locales/lo.json:4601:  "home.todosUnit": "ລາຍການລໍຖ້າ",
apps/web/src/locales/lo.json:4617:  "home.todosPending": "ລາຍການລໍຖ້າດຳເນີນການ",
apps/web/src/locales/lo.json:9452:  "ui.审批待办": "ວຽກອະນຸມັດທີ່ຕ້ອງເຮັດ",
apps/web/src/locales/lo.json:9658:  "ui.当前没有待审批任务。": "ບໍ່ມີວຽກທີ່ລໍຖ້າອະນຸມັດ.",
apps/web/src/locales/lo.json:9698:  "ui.待审批任务": "ວຽກທີ່ລໍຖ້າອະນຸມັດ",
apps/web/src/locales/lo.json:9726:  "ui.我的待办": "ສິ່ງທີ່ຂ້ອຍຕ້ອງເຮັດ",
apps/web/src/locales/lo.json:9727:  "ui.我的待办优先 · SLA 实时监控 · 业务驱动审批 · 智能发起常用流程": "ສິ່ງທີ່ຕ້ອງເຮັດກ່ອນ · ຕິດຕາມ SLA ແບບສົດ · ການອະນຸມັດຕາມທຸລະກິດ · ເລີ່ມຂັ້ນຕອນທີ່ໃຊ້ປະຈຳແບບສະຫຼາດ",
apps/web/src/locales/lo.json:9728:  "ui.我的待审批任务（共": "ໜ້າວຽກລໍຖ້າອະນຸມັດຂອງຂ້ອຍ (ລວມ",
apps/web/src/locales/lo.json:10025:  "ui.暂无待审批任务": "ບໍ່ມີວຽກທີ່ລໍຖ້າອະນຸມັດ",
apps/web/src/locales/lo.json:10151:  "ui.查看全部审批待办 →": "ເບິ່ງການອະນຸມັດທີ່ຄ້າງທັງໝົດ →",
apps/web/src/locales/en.json:4105:  "menu.wf-approval-todos": "Approval Todos",
apps/web/src/locales/en.json:4527:  "dwork.todosToHandle": "to-dos to handle",
apps/web/src/locales/en.json:4601:  "home.todosUnit": "to-dos",
apps/web/src/locales/en.json:4617:  "home.todosPending": "to-dos pending",
apps/web/src/locales/en.json:9452:  "ui.审批待办": "Approval to-do",
apps/web/src/locales/en.json:9658:  "ui.当前没有待审批任务。": "No tasks pending approval.",
apps/web/src/locales/en.json:9698:  "ui.待审批任务": "Tasks pending approval",
apps/web/src/locales/en.json:9726:  "ui.我的待办": "My to-do",
apps/web/src/locales/en.json:9727:  "ui.我的待办优先 · SLA 实时监控 · 业务驱动审批 · 智能发起常用流程": "My to-do first · Real-time SLA monitoring · Business-driven approval · Smart initiation of common workflows",
apps/web/src/locales/en.json:9728:  "ui.我的待审批任务（共": "My pending approval tasks (total",
apps/web/src/locales/en.json:10025:  "ui.暂无待审批任务": "No tasks pending approval",
apps/web/src/locales/en.json:10151:  "ui.查看全部审批待办 →": "View All Pending Approvals →",
apps/web/src/app/(admin)/procurement2/orders/page.tsx:256:  // 操作对话框（审批通过/驳回已收口至集团审批引擎，见 /workflow/todos）
apps/web/src/app/(admin)/procurement2/orders/page.tsx:624:                        <Link href="/workflow/todos" style={{ ...actBtnTone("info"), display: "inline-flex", alignItems: "center", textDecoration: "none" }} title={t('prc2.go_approve_title', '审批请前往『工作流·待办』')}>{t('prc2.go_approve', '前往审批')}</Link>
apps/web/src/app/(admin)/procurement2/orders/page.tsx:976:      {/* 审批通过/驳回已收口至集团审批引擎，请前往『工作流·待办』(/workflow/todos) 处理 */}
apps/web/src/app/(admin)/system/backup/page.tsx:92:        subtitle={`共 ${total} 条记录 · 数据库备份 / 定时计划 / 保留策略`}
apps/web/src/app/(admin)/notifications/page.tsx:149:      router.push(n.linkId ? `/workflow/todos?instanceId=${encodeURIComponent(n.linkId)}` : "/workflow/todos");
apps/web/src/app/(admin)/system/alerts/page.tsx:172:        subtitle={`系统异常台账 · API 500 / 定时任务失败 / IoT 同步异常会进入此处 · 共 ${total} 条`}
apps/web/src/app/(admin)/system/error-logs/page.tsx:84:        subtitle={`共 ${total} 条 · 系统异常记录 / 错误追踪（只读 append-only）`}
apps/web/src/app/(admin)/system/error-logs/page.tsx:136:          <span style={{ lineHeight: "32px", fontSize: 13, color: "var(--text-secondary)" }}>第 {page} / {pages} 页 · 共 {total} 条</span>
apps/web/src/components/layout/ApprovalNotifier.tsx:47:    return `/workflow/todos?instanceId=${encodeURIComponent(n.linkId)}`;
apps/web/src/components/layout/ApprovalNotifier.tsx:49:  return "/workflow/todos";
apps/web/src/components/layout/ApprovalNotifier.tsx:244:            <button type="button" onClick={() => { setOpen(false); router.push("/workflow/todos"); }}
apps/web/src/components/layout/ApprovalNotifier.tsx:246:              {t('ui.查看全部审批待办 →','查看全部审批待办 →')}
apps/web/src/app/(admin)/home/page.tsx:65:  { key: 'workflow',  label: '审批工作台',   href: '/workflow/todos',          icon: GitBranch,   accent: '#EC4899', gradient: 'linear-gradient(135deg, #EC489922 0%, transparent 60%)', perm: 'MENU_WORKFLOW_TODO', altPerms: ['MENU_WORKFLOW_HISTORY', 'MENU_WORKFLOW_NOTIFY'], groupId: 'approval' },
apps/web/src/app/(admin)/home/page.tsx:87:  if (todo > 0 && hasPermission('MENU_WORKFLOW_TODO')) return { label: `${t('home.handleNow', '立即处理')} ${todo} ${t('home.todosUnit', '个待办')}`, href: '/workflow/todos', icon: Inbox };
apps/web/src/app/(admin)/home/page.tsx:110:  return { label: firstPath ? t('home.enterWorkspace', '进入我的工作区') : t('home.viewMyTodos', '查看我的待办'), href: firstPath || '/workflow/todos', icon: Inbox };
apps/web/src/app/(admin)/home/page.tsx:211:    if (todoCount > 0)                          parts.push(`${todoCount} ${t('home.todosPending', '个待办待处理')}`);
apps/web/src/app/(admin)/home/page.tsx:426:        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>{tr('home.todoFlow', '事务流 · 我的待办')}</h3>
apps/web/src/app/(admin)/home/page.tsx:430:        <Link href="/workflow/todos" style={{ fontSize: 12, color: 'var(--color-primary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 2 }}>
apps/web/src/app/(admin)/home/page.tsx:453:              <Link key={i} href={`/workflow/todos?taskNo=${encodeURIComponent(t.task_no)}`} style={{
apps/web/src/components/layout/Sidebar.tsx:199:    { id: "ap-todos",   path: "/workflow/todos",         aliases: ["/workflow/tasks/todo"], Icon: ClipboardList,  label: "我的待办",   perm: "MENU_WORKFLOW_TODO"    },
apps/web/src/app/(admin)/procurement2/requests/page.tsx:213:  // 审批通过/驳回已收口至集团审批引擎，见 /workflow/todos
apps/web/src/app/(admin)/procurement2/requests/page.tsx:563:                      {row.status === "SUBMITTED" && <Link href="/workflow/todos" style={{ ...actBtnTone("info"), display: "inline-flex", alignItems: "center", textDecoration: "none" }} title={t('prc2.go_approve_title', "审批请前往『工作流·待办』")}>{t('prc2.go_approve', "前往审批")}</Link>}
apps/web/src/app/(admin)/procurement2/requests/page.tsx:755:      {/* 审批通过/驳回已收口至集团审批引擎，请前往『工作流·待办』(/workflow/todos) 处理 */}
apps/web/src/app/(admin)/daily-work/page.tsx:82:  { key: 'todo',        title: '我的待办',          desc: '待处理审批任务',
apps/web/src/app/(admin)/daily-work/page.tsx:83:    icon: Inbox,         href: '/workflow/todos',                                     accent: '#3B82F6', perm: 'MENU_WORKFLOW_TODO',      permOp: 'V' },
apps/web/src/app/(admin)/daily-work/page.tsx:128:              {t('dwork.youHave', '你有')} {todoCount} {t('dwork.todosToHandle', '项待办需要处理')}
apps/web/src/app/(admin)/daily-work/page.tsx:131:              {t('dwork.clickTodoCard', '点下方"我的待办"卡片快速处理')}
apps/web/src/app/(admin)/procurement2/payments/page.tsx:139:  // 操作弹窗（审批通过/驳回已收口至集团审批引擎，见 /workflow/todos）
apps/web/src/app/(admin)/procurement2/payments/page.tsx:345:                      <Link href="/workflow/todos" style={{ ...actBtnTone("info"), display: "inline-flex", alignItems: "center", textDecoration: "none" }} title={t('prc2.go_approve_title', "审批请前往『工作流·待办』")}>{t('prc2.go_approve', "前往审批")}</Link>
apps/web/src/app/(admin)/layout.tsx:78:  "/workflow/todos":               "menu.wf-approval-todos",
apps/web/src/app/(admin)/workflow/page.tsx:21:  ["我的待办", "/workflow/tasks/todo", "处理分配给我的审批任务"],
apps/web/src/app/(admin)/workflow/page.tsx:46:      <PageHeader title={t('ui.审批工作台','审批工作台')} subtitle={t('ui.我的待办优先 · SLA 实时监控 · 业务驱动审批 · 智能发起常用流程','我的待办优先 · SLA 实时监控 · 业务驱动审批 · 智能发起常用流程')} breadcrumb={[t('ui.审批工作台','审批工作台')]} />
apps/web/src/app/(admin)/workflow/page.tsx:51:          <Metric label={t('ui.我的待办','我的待办')} value={summary?.todo ?? 0} href="/workflow/tasks/todo" tone="primary" />
apps/web/src/app/(mobile)/mobile/workflow/page.tsx:1070:type Tab = 'todos' | 'history';
apps/web/src/app/(mobile)/mobile/workflow/page.tsx:1084:  const [tab, setTab] = useState<Tab>('todos');
apps/web/src/app/(mobile)/mobile/workflow/page.tsx:1085:  const [todos, setTodos] = useState<WorkflowTask[]>([]);
apps/web/src/app/(mobile)/mobile/workflow/page.tsx:1127:    if (tab === 'todos') loadTodos();else loadHistory();
apps/web/src/app/(mobile)/mobile/workflow/page.tsx:1230:          {tab === 'todos' && total > 0 && <span style={{
apps/web/src/app/(mobile)/mobile/workflow/page.tsx:1246:          tab === 'todos' ? loadTodos() : loadHistory();
apps/web/src/app/(mobile)/mobile/workflow/page.tsx:1276:        {([['todos', tr('mob.sys.todo', '待办'), todos.length], ['history', tr('mob.sys.done', '已办'), 0]] as const).map(([key, label, cnt]) => <button key={key} onClick={() => setTab(key)} style={{
apps/web/src/app/(mobile)/mobile/workflow/page.tsx:1293:            {key === 'todos' && cnt > 0 && <span style={{
apps/web/src/app/(mobile)/mobile/workflow/page.tsx:1294:          background: tab === 'todos' ? 'var(--overlay-white-10)' : 'var(--status-danger)',
apps/web/src/app/(mobile)/mobile/workflow/page.tsx:1321:        {!loading && !err && tab === 'todos' && (todos.length === 0 ? <MobileEmptyState icon="✅" title={tr('mob.sys.no_todo_approval', '暂无待办审批')} desc={tr('mob.sys.no_todo_approval_desc', '当前没有需要您处理的审批任务')} /> : todos.map(task => <TaskCard key={`${task.taskSource}-${task.taskId}`} task={task} onApprove={openApprove} onReject={openReject} onTransfer={openTransfer} onDetail={t => setDetailTask(t)} />))}
apps/web/src/app/(admin)/workflow/todos/page.tsx:324:  // 消息中心深链：/workflow/todos?instanceId=<id> 直接打开该审批实例详情，
apps/web/src/app/(admin)/workflow/todos/page.tsx:507:      <PageHeader title={t('ui.审批待办','审批待办')} subtitle={`${t('ui.我的待审批任务（共','我的待审批任务（共')} ${displayTotal} ${t('ui.条）','条）')}`} breadcrumb={[t('ui.审批中心','审批中心'), t('ui.待办','待办')]} />
apps/web/src/app/(admin)/workflow/todos/page.tsx:577:            <p>{t('ui.暂无待审批任务','暂无待审批任务')}</p>
apps/web/src/app/(admin)/workflow/instances/page.tsx:89:            <p className={`${s.modalDesc} ${u.mt4}`}>当前条件下共 {rows.length} 条流程。</p>
apps/web/src/app/(mobile)/mobile/home/page.tsx:217:  desc: '统一审批待办',
apps/web/src/app/(mobile)/mobile/home/page.tsx:279:  // 动态角标：审批待办数 + 未读通知数
apps/web/src/app/(admin)/workflow/start/page.tsx:372:              <Link href="/workflow/tasks/todo" style={secondaryActionButton}>{t('ui.我的待办','我的待办')}</Link>
apps/web/src/app/(admin)/workflow/metrics/page.tsx:417:          <KpiCard label={t('ui.待审批任务','待审批任务')} value={overview.pendingTasks} sub={t('ui.当前未完成','当前未完成')} icon={Clock} color="var(--status-special)" />
apps/web/src/app/(admin)/workflow/tasks/done/page.tsx:59:              <p className={`${s.modalDesc} ${u.mt4}`}>共 {rows.length} 条记录</p>
apps/web/src/app/(admin)/workflow/instances/[id]/page.tsx:57:                <Link href="/workflow/tasks/todo" style={secondaryActionButton}>{t('ui.我的待办','我的待办')}</Link>
apps/web/src/app/(admin)/workflow/tasks/todo/page.tsx:137:      <PageHeader title={t('ui.我的待办','我的待办')} subtitle={t('ui.处理分配给我的审批任务，查看表单内容后给出审批意见','处理分配给我的审批任务，查看表单内容后给出审批意见')} breadcrumb={[t('ui.工作流','工作流'), t('ui.我的待办','我的待办')]} />
apps/web/src/app/(admin)/workflow/tasks/todo/page.tsx:163:              </div> : <div className={s.emptyState}><div className={s.emptyStateText}>{t('ui.当前没有待审批任务。','当前没有待审批任务。')}</div></div>}

codex
定位到页面在 `apps/web/src/app/(admin)/workflow/todos/page.tsx`，截图里的标题使用 `displayTotal`。我继续读该页的数据加载和筛选代码，确认是 API total、前端筛选后数量，还是分页字段映射问题。
exec
/bin/zsh -lc "sed -n '220,560p' 'apps/web/src/app/(admin)/workflow/todos/page.tsx'" in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
    items: [],
    total: 0,
    page: 1,
    pageSize: 20
  };
  return res.json();
}
async function fetchDetail(instanceId: string): Promise<InstanceDetail | null> {
  const res = await fetch(`/api/approval/instances/${instanceId}`, {
    headers: authHdr(),
    cache: "no-store"
  });
  if (!res.ok) return null;
  return res.json();
}
async function approveInstance(instanceId: string, comment: string) {
  const res = await fetch(`/api/approval/instances/${instanceId}/approve`, {
    method: "POST",
    headers: authHdr(),
    body: JSON.stringify({
      comment
    })
  });
  return res.json();
}
async function fetchReassignCandidates(instanceId: string): Promise<ReassignCandidate[]> {
  const res = await fetch(`/api/approval/instances/${instanceId}/reassign-candidates`, {
    headers: authHdr(),
    cache: "no-store"
  });
  if (!res.ok) return [];
  return res.json();
}
async function reassignInstance(instanceId: string, toUserId: string) {
  const res = await fetch(`/api/approval/instances/${instanceId}/reassign`, {
    method: "POST",
    headers: authHdr(),
    body: JSON.stringify({ toUserId })
  });
  return res.json();
}
async function rejectInstance(instanceId: string, comment: string) {
  const res = await fetch(`/api/approval/instances/${instanceId}/reject`, {
    method: "POST",
    headers: authHdr(),
    body: JSON.stringify({
      comment
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
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
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
      page: 1,
      taskSource: "",
      bizType: "",
      keyword: ""
    });
  };
  const openDetail = async (todo: UnifiedTask) => {
    setSelected(todo);
    setComment("");
    setDecision("approve");
    setCandidates([]);
    setPickedTo("");
    setDrawerOpen(true);
    if (todo.taskSource === "APPROVAL_ENGINE") {
      setDetail(await fetchDetail(todo.instanceId));
    } else {
      setDetail(null);
    }
  };
  const selectedInstanceId = selected?.instanceId;
  useEffect(() => {
    if (!drawerOpen || !selectedInstanceId || decision !== "transfer") return;
    let alive = true;
    const timer = window.setTimeout(() => {
      if (!alive) return;
      setPickedTo("");
      setReassignLoading(true);
      fetchReassignCandidates(selectedInstanceId)
        .then(rows => {
          if (!alive) return;
          setCandidates(rows);
          setPickedTo(rows[0]?.userId ?? "");
        })
        .catch(() => {
          if (!alive) return;
          setCandidates([]);
          setPickedTo("");
        })
        .finally(() => {
          if (alive) setReassignLoading(false);
        });
    }, 0);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [drawerOpen, selectedInstanceId, decision]);
  const handleApprove = async () => {
    if (!selected) return;
    setSubmitting(true);
    try {
      const r = await approveInstance(selected.instanceId, comment);
      if (r.statusCode && r.statusCode >= 400) {
        toast.error(r.message || t('ui.操作失败','操作失败'));
      } else {
        toast.success(r.finished ? t('ui.审批完成，单据已通过','审批完成，单据已通过') : t('ui.已通过，等待下一级审批','已通过，等待下一级审批'));
        setDrawerOpen(false);
        // G150：乐观移除——点完即从列表消失，不等整页刷新；随后 load() 对账
        //   （若本人恰是下一级审批人，会在 load() 后以新步骤正确重新出现）
        setResp(prev => ({ ...prev, items: prev.items.filter(t => t.instanceId !== selected.instanceId), total: Math.max(0, prev.total - 1) }));
        load();
      }
    } catch {
      toast.error(t('ui.网络错误','网络错误'));
    } finally {
      setSubmitting(false);
    }
  };
  const handleReject = async () => {
    if (!selected) return;
    if (!comment.trim()) {
      toast.warning(t('ui.拒绝时必须填写意见','拒绝时必须填写意见'));
      return;
    }
    setSubmitting(true);
    try {
      const r = await rejectInstance(selected.instanceId, comment);
      if (r.statusCode && r.statusCode >= 400) {
        toast.error(r.message || t('ui.操作失败','操作失败'));
      } else {
        toast.error(t('ui.已拒绝，单据流程终止','已拒绝，单据流程终止'));
        setDrawerOpen(false);
        setResp(prev => ({ ...prev, items: prev.items.filter(t => t.instanceId !== selected.instanceId), total: Math.max(0, prev.total - 1) }));
        load();
      }
    } catch {
      toast.error(t('ui.网络错误','网络错误'));
    } finally {
      setSubmitting(false);
    }
  };
  const handleReassign = async () => {
    if (!selected || !pickedTo) return;
    setSubmitting(true);
    try {
      const r = await reassignInstance(selected.instanceId, pickedTo);
      if (r.statusCode && r.statusCode >= 400) {
        toast.error(r.message || t('ui.转交失败','转交失败'));
      } else {
        toast.success(`${t('ui.已转交给','已转交给')} ${r.toName ?? t('ui.审批人','审批人')}`);
        setDrawerOpen(false);
        setResp(prev => ({ ...prev, items: prev.items.filter(t => t.instanceId !== selected.instanceId), total: Math.max(0, prev.total - 1) }));
        load();
      }
    } catch {
      toast.error(t('ui.网络错误','网络错误'));
    } finally {
      setSubmitting(false);
    }
  };
  const submitDecision = () => {
    if (decision === "approve") void handleApprove();
    else if (decision === "reject") void handleReject();
    else void handleReassign();
  };
  const isApprovalEngine = selected?.taskSource === "APPROVAL_ENGINE";
  const displayTotal = getDisplayTotal(resp);
  return <div>
      <PageHeader title={t('ui.审批待办','审批待办')} subtitle={`${t('ui.我的待审批任务（共','我的待审批任务（共')} ${displayTotal} ${t('ui.条）','条）')}`} breadcrumb={[t('ui.审批中心','审批中心'), t('ui.待办','待办')]} />

      <section className={s.card}>
        {/* ── 筛选栏 ── */}
        <div className={s.cardBody} style={{
        borderBottom: "1px solid var(--bg-muted)",
        paddingBottom: 12,
        display: "flex",
        gap: 12,
        flexWrap: "wrap",
        alignItems: "center"
      }}>
          <select value={taskSource} onChange={e => setTaskSource(e.target.value)} className={s.select} style={{
          minWidth: 120
        }}>
            <option value="">{t('ui.全部来源','全部来源')}</option>
            <option value="APPROVAL_ENGINE">{t('ui.审批引擎','审批引擎')}</option>
            <option value="WORKFLOW_ENGINE">{t('ui.通用流程','通用流程')}</option>
          </select>

          <select value={bizType} onChange={e => setBizType(e.target.value)} className={s.select} style={{
          minWidth: 120
        }}>
            <option value="">{t('ui.全部类型','全部类型')}</option>
            <option value="PR">{t('ui.采购申请','采购申请')}</option>
            <option value="PO">{t('ui.采购订单','采购订单')}</option>
            <option value="PAYMENT">{t('ui.付款申请','付款申请')}</option>
            <option value="FUND">{t('ui.股东资金','股东资金')}</option>
          </select>

          <div style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          flex: 1,
          minWidth: 180
        }}>
            <Search size={14} style={{
            color: "var(--text-disabled)"
          }} />
            <input type="text" value={keyword} onChange={e => setKeyword(e.target.value)} onKeyDown={e => e.key === "Enter" && applyFilter()} placeholder={t('ui.搜索单号、主题…','搜索单号、主题…')} className={`${s.input} ${u.flex1}`} />
          </div>

          <button className={`${s.btnPrimary} ${u.fs12}`} onClick={applyFilter}>
            {t('ui.搜索','搜索')}
          </button>
          <button className={`${s.btnSecondary} ${u.fs12}`} onClick={resetFilter}>
            {t('ui.重置','重置')}
          </button>
          <button onClick={() => load()} disabled={loading} style={{ ...secondaryActionButton, fontSize: 12, marginLeft: "auto" }}>
            <RefreshCw size={13} style={{
            marginRight: 5
          }} />
            {t('ui.刷新','刷新')}

exec
/bin/zsh -lc "sed -n '1,220p' 'apps/web/src/app/(admin)/workflow/todos/page.tsx'" in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
"use client";

import { useState, useEffect, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { CheckCircle, XCircle, RefreshCw, User, FileText, Banknote, ShoppingBag, Building2, FolderOpen, DollarSign, Search, Forward } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { RightDrawer } from "@/components/ui/RightDrawer";
import { useToast } from "@/contexts/ToastContext";
import s from "@/components/ui/admin-ui.module.css";
import { primaryActionButton, secondaryActionButton, actionPill } from "@/components/design-system/cockpit-styles";
import { WorkflowFormRenderer, type FormSchema, type UiSchema } from "@/components/workflow/WorkflowFormRenderer";
import { useLanguage } from "@/contexts/LanguageContext";

// ── Auth helper ───────────────────────────────────────────────────────────────
import u from "@/styles/uix-utils.module.css";
function getToken() {
  if (typeof window === 'undefined') return '';
  return sessionStorage.getItem('phoenix_token') || '';
}
function authHdr(extra?: Record<string, string>) {
  return {
    Authorization: `Bearer ${getToken()}`,
    'Content-Type': 'application/json',
    ...extra
  };
}

// ── 统一任务类型 ───────────────────────────────────────────────────────────────
interface UnifiedTask {
  taskSource: string;
  taskId: string;
  instanceId: string;
  instanceNo: string | null;
  bizType: string;
  bizId: string;
  bizNo: string | null;
  subject: string | null;
  amount: number | null;
  currencyCode: string | null;
  companyCode: string | null;
  companyName: string | null;
  projectCode: string | null;
  projectName: string | null;
  requiredRole: string;
  stepNo: number | null;
  totalSteps: number | null;
  currentStepNo: number | null;
  startedBy: string | null;
  status: string;
  createdAt: string;
}
interface TaskListResponse {
  items: UnifiedTask[];
  total: number;
  page: number;
  pageSize: number;
}
interface FormSubmissionSnapshot {
  id: number;
  submissionNo: string;
  formCode: string;
  dataJson: Record<string, unknown>;
  schemaJson: Record<string, unknown>;
  uiSchemaJson: Record<string, unknown>;
  status: string;
  submittedByName: string | null;
  formName: string | null;
}
interface InstanceDetail {
  id: string;
  instanceNo: string;
  bizType: string;
  bizId: string;
  bizNo: string;
  status: string;
  totalSteps: number;
  currentStepNo: number;
  startedAt: string;
  amount: number | null;
  currencyCode: string | null;
  companyCode: string | null;
  companyName: string | null;
  projectCode: string | null;
  projectName: string | null;
  subject: string | null;
  formSubmission: FormSubmissionSnapshot | null; // Phase I
  steps: {
    id: string;
    stepNo: number;
    approverRole: string;
    approverName: string;
    requiredRole: string;
    status: string;
    action: string;
    comment: string;
    actedAt: string;
  }[];
}

type ApprovalDecision = "approve" | "reject" | "transfer";
type ReassignCandidate = { userId: string; displayName: string; roleNameZh: string | null };

// ── 工具函数 ──────────────────────────────────────────────────────────────────
const BIZ_TYPE_LABEL: Record<string, string> = {
  PR: "采购申请",
  PO: "采购订单",
  PAYMENT: "付款申请",
  FUND: "股东资金"
};
const BIZ_TYPE_ICON: Record<string, React.ReactNode> = {
  PR: <FileText size={14} />,
  PO: <ShoppingBag size={14} />,
  PAYMENT: <Banknote size={14} />,
  FUND: <Banknote size={14} />
};
function fmtDate(s: string) {
  if (!s) return "-";
  return new Date(s).toLocaleString("zh-CN", {
    month: "2-digit",
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
function getDisplayTotal(resp: TaskListResponse) {
  const apiTotal = Number.isFinite(Number(resp.total)) ? Number(resp.total) : 0;
  const currentPage = Math.max(1, Number(resp.page) || 1);
  const currentPageSize = Math.max(1, Number(resp.pageSize) || 20);
  const loadedMinimum = (currentPage - 1) * currentPageSize + resp.items.length;
  return Math.max(apiTotal, loadedMinimum);
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
  if (params.keyword) p.set("keyword", params.keyword);
  const res = await fetch(`/api/workflow/my-tasks?${p.toString()}`, {
    headers: authHdr(),
    cache: "no-store"   // G150：禁浏览器缓存，避免审批后刷新仍读到旧待办列表
  });
  if (!res.ok) return {
    items: [],

exec
/bin/zsh -lc "sed -n '560,760p' 'apps/web/src/app/(admin)/workflow/todos/page.tsx'" in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
            {t('ui.刷新','刷新')}
          </button>
        </div>

        {loading ? <div className={s.cardBody} styl
```
