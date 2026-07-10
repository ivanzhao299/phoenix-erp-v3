# Agent Worker Log

| Field | Value |
| --- | --- |
| Task ID | BUGTASK-20260710-0002-02-A3 |
| Agent | A3-Backend-Critical-Path |
| Dry run | No |
| Exit code | 0 |

## Command

```bash
/usr/local/bin/node scripts/ops/run-agent-task.mjs --agent A3-Backend-Critical-Path --worktree /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path --prompt docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md --task-contract docs/ops/runs/BUGTASK-20260710-0002-02-A3-contract.md --assembled-prompt-output docs/ops/runs/BUGTASK-20260710-0002-02-A3-worker-assembled-prompt.md --require-approval-token APPROVE_AGENT_EXECUTION --skip-baseline-autopilot --allow-ops-runtime-dirty
```

## Stdout

```text
Agent: A3-Backend-Critical-Path
Worktree: /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
Branch: w5-a3-backend-critical-path
Prompt: docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md
Task contract: docs/ops/runs/BUGTASK-20260710-0002-02-A3-contract.md
Assembled prompt: docs/ops/runs/BUGTASK-20260710-0002-02-A3-worker-assembled-prompt.md
Assembled prompt chars: 26748
Codex command: codex exec -C /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path --sandbox workspace-write -
Codex timeout ms: 600000
Run log: /Users/mac/phoenix-erp-worktrees/codex-orchestrator/docs/ops/runs/2026-07-10T02-19-38-311Z-A3-Backend-Critical-Path.md
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
session id: 019f49d2-926c-7361-91a1-28d88cedda1a
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

Source bug: BUG-20260710-0002
Source repair task: BUGTASK-20260710-0002
Assigned agent: A3-Backend-Critical-Path

## Issue

账户收款后，余额不变

## Route

/finance2/ar

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "url": "https://erp.eggslao.com/finance2/ar",
  "bugNo": "BUG-20260710-0002",
  "route": "/finance2/ar",
  "title": "账户收款后，余额不变",
  "taskNo": "BUGTASK-20260710-0002",
  "context": {
    "attachments": [
      {
        "sha256": "33031748bfc401e95ab11c96ffb073b78a2ca953260b44634c15664e61b28810",
        "fileName": "01-1783649533350-f5c90f99.png",
        "mimeType": "image/png",
        "sizeBytes": 686727,
        "originalName": "pasted-screenshot-1783648622337-1.png",
        "relativePath": "storage/bug-reports/2026/07/10/BUG-20260710-0002/01-1783649533350-f5c90f99.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260710-0002/attachments/01-1783649533350-f5c90f99.png"
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
      "capturedAt": "2026-07-10T02:12:13.351Z",
      "pageSnapshot": {
        "route": "/finance2/ar",
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
          "经营仪表盘",
          "生产管理",
          "库存管理",
          "全链追溯",
          "采购管理",
          "销售管理",
          "财务结算中心",
          "财务总览",
          "应收账款",
          "应收总账",
          "应收三方对账",
          "好业财同步",
          "好业财中间层",
          "应付账款",
          "资金账户",
          "资金调拨",
          "股东资金",
          "费用管理",
          "报销管理",
          "财务报表",
          "股东权益中心",
          "审批中心",
          "经营分析",
          "主数据中心",
          "系统设置",
          "验收试运行",
          "系统运维",
          "个人中心 / 修改密码",
          "99+",
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
          "pasted-screenshot-1783648622337-1.png",
          "退出",
          "财务管理",
          "/应收账款",
          "/",
          "应收账款管理",
          "·客户应收账款 · 收款核销 · 账龄分析",
          "·",
          "应收账单总数",
          "未收款",
          "部分收款",
          "已收清",
          "逾期笔数",
          "待收余额",
          "应收编号",
          "来源",
          "客户",
          "公司",
          "发票日期",
          "到期日",
          "发票金额",
          "状态",
          "AR-202607-00004",
          "手工",
          "测试客户2 CUS-00002",
          "COMP-LAO-AGRI",
          "—",
          "¥10.00",
          "¥0.00",
          "AR-202607-00003",
          "2026-07-10",
          "2027-07-10",
          "¥5.00",
          "AR-202607-00002",
          "AR-202607-00001",
          "2028-07-09",
          "¥100.00",
          "共 4 条（第 1 / 1 页）",
          "1 / 1"
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
              "y": 384
            },
            "label": "销售管理",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.sidebar-module__C8A-ya__groupActive",
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
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.sidebar-module__C8A-ya__subActive",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 460
            },
            "label": "财务总览",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.sidebar-module__C8A-ya__subActive",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 492
            },
            "label": "应收账款",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 524
            },
            "label": "应收总账",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 556
            },
            "label": "应收三方对账",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 588
            },
            "label": "好业财同步",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 620
            },
            "label": "好业财中间层",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 652
            },
            "label": "应付账款",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 684
            },
            "label": "资金账户",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 716
            },
            "label": "资金调拨",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 748
            },
            "label": "股东资金",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 780
            },
            "label": "费用管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 812
            },
            "label": "报销管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 844
            },
            "label": "财务报表",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 876
            },
            "label": "股东权益中心",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 914
            },
            "label": "审批中心",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 952
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
              "y": 990
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
              "y": 1028
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
              "y": 1066
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
              "y": 1104
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
            "label": "99+",
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
              "x": 857,
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
            "tag": "button",
            "path": "",
            "rect": {
              "h": 35,
              "w": 82,
              "x": 1415,
              "y": 89
            },
            "label": "刷新",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 35,
              "w": 108,
              "x": 1505,
              "y": 89
            },
            "label": "录入收款",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 35,
              "w": 133,
              "x": 1621,
              "y": 89
            },
            "label": "新建应收发票",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 45,
              "w": 96,
              "x": 244,
              "y": 261
            },
            "label": "应收账单",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 45,
              "w": 96,
              "x": 340,
              "y": 261
            },
            "label": "收款记录",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 45,
              "w": 96,
              "x": 436,
              "y": 261
            },
            "label": "账龄分析",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 30,
              "w": 65,
              "x": 285,
              "y": 340
            },
            "label": "未收款",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 30,
              "w": 77,
              "x": 360,
              "y": 340
            },
            "label": "部分收款",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 30,
              "w": 65,
              "x": 447,
              "y": 340
            },
            "label": "已收清",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 30,
              "w": 65,
              "x": 522,
              "y": 340
            },
            "label": "已逾期",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 30,
              "w": 65,
              "x": 597,
              "y": 340
            },
            "label": "已取消",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 37,
              "w": 240,
              "x": 1408,
              "y": 337
            },
            "label": "应收编号 / 客户 / 发票号…",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 37,
              "w": 81,
              "x": 1656,
              "y": 337
            },
            "label": "搜索",
            "disabled": false
          }
        ]
      },
      "devicePixelRatio": 1.7999999523162842
    },
    "consoleErrors": [],
    "failedRequests": [
      {
        "url": "/api/v2/finance/ap/invoices/8",
        "method": "GET",
        "status": 500,
        "requestId": "",
        "timestamp": "2026-07-10T01:12:50.111Z",
        "responseExcerpt": "{\"code\":500,\"msg\":\"服务器内部错误，请联系管理员\"}"
      },
      {
        "url": "/api/v2/finance/ap/invoices/8",
        "method": "GET",
        "status": 500,
        "requestId": "",
        "timestamp": "2026-07-10T01:12:53.553Z",
        "responseExcerpt": "{\"code\":500,\"msg\":\"服务器内部错误，请联系管理员\"}"
      }
    ],
    "localEvidence": {
      "localAttachments": [
        {
          "fileName": "01-1783649533350-f5c90f99.png",
          "originalName": "pasted-screenshot-1783648622337-1.png",
          "mimeType": "image/png",
          "sourceEndpoint": "/api/bug-intake/reports/BUG-20260710-0002/attachments/01-1783649533350-f5c90f99.png",
          "localPath": "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260710-101906/BUG-20260710-0002/attachments/01-1783649533350-f5c90f99.png",
          "sizeBytes": 686727
        }
      ],
      "localAttachmentPaths": [
        "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260710-101906/BUG-20260710-0002/attachments/01-1783649533350-f5c90f99.png"
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
    "source_bug_no": "BUG-20260710-0002",
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
    "source_repair_task_no": "BUGTASK-20260710-0002"
  },
  "createdAt": "2026-07-10T02:16:28.819Z",
  "createdBy": "admin",
  "moduleCode": "______",
  "suggestedOwner": "",
  "repairGuardrails": {
    "autoRepairExecuted": false,
    "noProductionDeploy": true,
    "noDbWriteWithoutGate": true,
    "requiresHumanApproval": true
  },
  "acceptanceCriteria": "选择收款账户确认收款后，对应的账户余额需要根据收款金额进行准确的余额改变",
  "agentPlanGeneratedAt": "2026-07-10T02:16:29.784Z",
  "agentPlanGeneratedBy": "admin",
  "agentExecutionApproval": {
    "approved": true,
    "approvedAt": "2026-07-10T02:16:30.774Z",
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

- /Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260710-101906/BUG-20260710-0002/attachments/01-1783649533350-f5c90f99.png

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
我会先执行合同要求的目录、分支、状态和最近提交检查；如果工作树不干净或分支不对，会停下来只报告，不继续改代码。
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
09135c9b (HEAD -> w5-a3-backend-critical-path, w5-a4-frontend-uat-smoke, main) docs(ops): record baseline lifecycle report
20a3c2c0 docs: align procurement cta priority comment
4e82eb0a fix: repair procurement center cta route
7d7a4d42 docs(ops): record baseline lifecycle report
9b60c09a docs(ops): record bug 20260710 0001 a3 report
f5d35a5a docs(ops): record baseline lifecycle report
ff064230 fix: restore sales pricing lifecycle actions
3da4d2c5 docs(ops): record baseline lifecycle report

exec
/bin/zsh -lc 'git status --short' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
codex
检查通过：目录、分支和工作树都符合合同，当前没有未提交改动。现在进入 dry-run 诊断，只读定位 `/finance2/ar` 对应后端收款接口和账户余额写入路径。
exec
/bin/zsh -lc "rg --files apps/api/src/modules | rg 'finance|ar|cash|account|payment|receipt'" in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
apps/api/src/modules/finance-v2/finance-v2.module.ts
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts
apps/api/src/modules/finance-v2/entities/index.ts
apps/api/src/modules/finance-v2/entities/fin-ar-invoice.entity.ts
apps/api/src/modules/finance-v2/entities/fin-cash-transaction.entity.ts
apps/api/src/modules/finance-v2/entities/fin-shareholder-settlement.entity.ts
apps/api/src/modules/finance-v2/entities/fin-ap-invoice.entity.ts
apps/api/src/modules/finance-v2/entities/fin-expense-request.entity.ts
apps/api/src/modules/finance-v2/entities/fin-cash-account.entity.ts
apps/api/src/modules/finance-v2/entities/fin-fund-transfer.entity.ts
apps/api/src/modules/finance-v2/entities/fin-reimbursement.entity.ts
apps/api/src/modules/finance-v2/entities/fin-ar-receipt.entity.ts
apps/api/src/modules/finance-v2/entities/fin-ar-receipt-allocation.entity.ts
apps/api/src/modules/finance-v2/entities/fin-exchange-rate.entity.ts
apps/api/src/modules/finance-v2/services/ap-adapter.service.ts
apps/api/src/modules/finance-v2/services/cash-accounts.service.ts
apps/api/src/modules/finance-v2/services/shareholder-settlements.service.ts
apps/api/src/modules/finance-v2/services/ar-ledger.service.ts
apps/api/src/modules/finance-v2/services/financial-reports.service.ts
apps/api/src/modules/finance-v2/services/expense-requests.service.ts
apps/api/src/modules/finance-v2/services/ar-invoices.service.ts
apps/api/src/modules/finance-v2/services/ap-invoices.service.ts
apps/api/src/modules/finance-v2/services/reimbursements.service.ts
apps/api/src/modules/finance-v2/services/fund-transfers.service.ts
apps/api/src/modules/finance-v2/services/ar-receipts.service.ts
apps/api/src/modules/finance-v2/services/shareholder-contributions.service.ts
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts
apps/api/src/modules/finance-v2/services/cash-transactions.service.ts
apps/api/src/modules/finance-v2/controllers/finance-order-bridge.controller.ts
apps/api/src/modules/finance-v2/controllers/fin-expense.controller.ts
apps/api/src/modules/finance-v2/controllers/fin-ar-reconciliation.controller.ts
apps/api/src/modules/finance-v2/controllers/fin-ap.controller.ts
apps/api/src/modules/finance-v2/controllers/finance-v2.controller.ts
apps/api/src/modules/finance-v2/controllers/fin-ar-ledger.controller.ts
apps/api/src/modules/finance-v2/controllers/financial-reports.controller.ts
apps/api/src/modules/finance-v2/controllers/fin-ar.controller.ts
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.spec.ts
apps/api/src/modules/finance-v2/controllers/fin-shareholder.controller.ts
apps/api/src/modules/finance-v2/controllers/fin-cash.controller.ts
apps/api/src/modules/finance-v2/dto/shareholder.dto.ts
apps/api/src/modules/finance-v2/dto/expense.dto.ts
apps/api/src/modules/finance-v2/dto/ap-invoice.dto.ts
apps/api/src/modules/finance-v2/dto/ar-invoice.dto.ts
apps/api/src/modules/finance-v2/dto/cash-account.dto.spec.ts
apps/api/src/modules/finance-v2/dto/ar-receipt.dto.ts
apps/api/src/modules/finance-v2/dto/fund-transfer.dto.ts
apps/api/src/modules/finance-v2/dto/cash-account.dto.ts
apps/api/src/modules/procurement-v2/entities/prc2-payment.entity.ts
apps/api/src/modules/procurement-v2/entities/prc2-receipt-item.entity.ts
apps/api/src/modules/procurement-v2/entities/prc2-receipt.entity.ts
apps/api/src/modules/procurement-v2/entities/prc2-payment-allocation.entity.ts
apps/api/src/modules/procurement-v2/entities/prc2-shareholder-fund.entity.ts
apps/api/src/modules/procurement-v2/services/payments.service.ts
apps/api/src/modules/procurement-v2/services/shareholder-funds.service.ts
apps/api/src/modules/procurement-v2/services/dashboard.service.ts
apps/api/src/modules/procurement-v2/services/receipts.service.ts
apps/api/src/modules/procurement-v2/controllers/payments.controller.ts
apps/api/src/modules/procurement-v2/controllers/receipts.controller.ts
apps/api/src/modules/procurement-v2/controllers/shareholder-funds.controller.ts
apps/api/src/modules/procurement-v2/controllers/dashboard.controller.ts
apps/api/src/modules/procurement-v2/dto/query-shareholder-funds.dto.ts
apps/api/src/modules/procurement-v2/dto/pay-payment.dto.ts
apps/api/src/modules/procurement-v2/dto/confirm-receipt.dto.ts
apps/api/src/modules/procurement-v2/dto/arrive-shipment.dto.ts
apps/api/src/modules/procurement-v2/dto/payment-allocation.dto.ts
apps/api/src/modules/procurement-v2/dto/create-payment.dto.ts
apps/api/src/modules/procurement-v2/dto/create-receipt.dto.ts
apps/api/src/modules/procurement-v2/dto/cancel-payment.dto.ts
apps/api/src/modules/procurement-v2/dto/cancel-receipt.dto.ts
apps/api/src/modules/procurement-v2/dto/receipt-item.dto.ts
apps/api/src/modules/procurement-v2/dto/update-payment.dto.ts
apps/api/src/modules/procurement-v2/dto/query-receipt.dto.ts
apps/api/src/modules/procurement-v2/dto/query-payment.dto.ts
apps/api/src/modules/procurement-v2/dto/query-dashboard.dto.ts
apps/api/src/modules/procurement-v2/dto/submit-payment.dto.ts
apps/api/src/modules/procurement-v2/dto/approve-payment.dto.ts
apps/api/src/modules/analytics/services/finance-analytics.service.ts
apps/api/src/modules/analytics/services/shareholder-analytics.service.ts
apps/api/src/modules/sales-v2/entities/sal-receipt.entity.ts
apps/api/src/modules/sales-v2/services/receipts.service.ts
apps/api/src/modules/sales-v2/adapters/finance-credit-note.adapter.ts
apps/api/src/modules/sales-v2/adapters/finance-ar.adapter.ts
apps/api/src/modules/iot/farm-cabin.controller.ts
apps/api/src/modules/iot/farm-device.controller.ts
apps/api/src/modules/store-payment/entities/store-payment-account.entity.ts
apps/api/src/modules/store-payment/entities/store-payment-record.entity.ts
apps/api/src/modules/store-payment/store-payment.service.ts
apps/api/src/modules/store-payment/store-payment.module.ts
apps/api/src/modules/store-payment/store-payment.controller.ts
apps/api/src/modules/store-payment/dto/store-payment.dto.ts
apps/api/src/modules/shareholder/entities/shr-project-equity.entity.ts
apps/api/src/modules/shareholder/entities/shr-capital-contribution.entity.ts
apps/api/src/modules/shareholder/entities/shr-project.entity.ts
apps/api/src/modules/shareholder/entities/shr-beneficial-equity.entity.ts
apps/api/src/modules/shareholder/entities/shr-shareholder.entity.ts
apps/api/src/modules/shareholder/entities/shr-shareholder-scope.entity.ts
apps/api/src/modules/shareholder/services/capital-aggregation.service.ts
apps/api/src/modules/shareholder/services/shareholder.service.ts
apps/api/src/modules/shareholder/controllers/shareholder.controller.ts
apps/api/src/modules/shareholder/shareholder.module.ts
apps/api/src/modules/shareholder/dto/shareholder.dto.ts
apps/api/src/modules/org/entities/sys-user-farm-scope.entity.ts
apps/api/src/modules/org/entities/sys-user-warehouse-scope.entity.ts
apps/api/src/modules/org/guards/data-scope.guard.ts
apps/api/src/modules/uat/services/pilot-run-dashboard.service.ts
apps/api/src/modules/uat/controllers/pilot-run-dashboard.controller.ts
apps/api/src/modules/chanjet/chanjet-ar-snapshot.entity.ts
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts
apps/api/src/modules/farm/farm.service.spec.ts
apps/api/src/modules/farm/farm-sales.controller.ts
apps/api/src/modules/farm/farm.cron.ts
apps/api/src/modules/farm/farm-medicine.service.spec.ts
apps/api/src/modules/farm/farm-medicine.service.ts
apps/api/src/modules/farm/farm.controller.ts
apps/api/src/modules/farm/farm-egg.controller.ts
apps/api/src/modules/farm/farm-egg.service.ts
apps/api/src/modules/farm/farm.module.ts
apps/api/src/modules/farm/farm.service.ts
apps/api/src/modules/farm/farm-sales.service.ts
apps/api/src/modules/farm/farm-feed.controller.ts
apps/api/src/modules/farm/farm-feed.service.ts
apps/api/src/modules/farm/farm-medicine.controller.ts

exec
/bin/zsh -lc "rg -n \"ar|receiv|receipt|payment|收款|fin_ar|cash_accounts|cash account|account balance|balance\" apps/api/src/modules apps/api/src -g '*.{ts}'" in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
apps/api/src/guards/phoenix-jwt.guard.ts:7: * PhoenixJwtGuard — 绕过 Passport，直接用 jsonwebtoken 验证 JWT。
apps/api/src/guards/phoenix-jwt.guard.ts:21:export class PhoenixJwtGuard implements CanActivate {
apps/api/src/guards/phoenix-jwt.guard.ts:25:    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
apps/api/src/modules/finance-v2/finance-v2.module.ts:5:import { FinArController }      from './controllers/fin-ar.controller';
apps/api/src/modules/finance-v2/finance-v2.module.ts:7:import { FinShareholderController } from './controllers/fin-shareholder.controller';
apps/api/src/modules/finance-v2/finance-v2.module.ts:11:import { FinArLedgerController }        from './controllers/fin-ar-ledger.controller';
apps/api/src/modules/finance-v2/finance-v2.module.ts:12:import { FinArReconciliationController } from './controllers/fin-ar-reconciliation.controller';
apps/api/src/modules/finance-v2/finance-v2.module.ts:15:import { ArInvoicesService }    from './services/ar-invoices.service';
apps/api/src/modules/finance-v2/finance-v2.module.ts:16:import { ArReceiptsService }    from './services/ar-receipts.service';
apps/api/src/modules/finance-v2/finance-v2.module.ts:20:import { ShareholderContributionsService } from './services/shareholder-contributions.service';
apps/api/src/modules/finance-v2/finance-v2.module.ts:21:import { ShareholderSettlementsService }   from './services/shareholder-settlements.service';
apps/api/src/modules/finance-v2/finance-v2.module.ts:25:import { ArLedgerService }                 from './services/ar-ledger.service';
apps/api/src/modules/finance-v2/finance-v2.module.ts:26:import { ArReconciliationService }         from './services/ar-reconciliation.service';
apps/api/src/modules/finance-v2/finance-v2.module.ts:35:  FinShareholderContributionEntity,
apps/api/src/modules/finance-v2/finance-v2.module.ts:36:  FinShareholderSettlementEntity,
apps/api/src/modules/finance-v2/finance-v2.module.ts:49: *   Phase 2 — AR Runtime：fin_ar_invoices + fin_ar_receipts + 核销分摊           ✅
apps/api/src/modules/finance-v2/finance-v2.module.ts:50: *   Phase 3 — Cash Runtime：fin_cash_accounts + fin_cash_transactions + 转账     ✅
apps/api/src/modules/finance-v2/finance-v2.module.ts:51: *   Phase 4 — Shareholder Runtime：fin_shareholder_contributions + settlements   ✅
apps/api/src/modules/finance-v2/finance-v2.module.ts:56: *   - 不引用 fin_transactions / fin_payments / biz_cash_flow（旧表废弃）
apps/api/src/modules/finance-v2/finance-v2.module.ts:63: *   ApInvoicesService  — fin_ap_invoices CRUD + 状态机 + Aging + Summary + 导入
apps/api/src/modules/finance-v2/finance-v2.module.ts:66: *   FinArController    — /api/v2/finance/ar/* 路由
apps/api/src/modules/finance-v2/finance-v2.module.ts:67: *   ArInvoicesService  — fin_ar_invoices CRUD + 状态机 + Aging + Summary
apps/api/src/modules/finance-v2/finance-v2.module.ts:68: *   ArReceiptsService  — fin_ar_receipts 创建/确认/取消 + 核销分摊（事务）
apps/api/src/modules/finance-v2/finance-v2.module.ts:76: * Shareholder Runtime（Phase 4）：
apps/api/src/modules/finance-v2/finance-v2.module.ts:77: *   FinShareholderController         — /api/v2/finance/shareholders/* 路由
apps/api/src/modules/finance-v2/finance-v2.module.ts:78: *   ShareholderContributionsService  — 出资台账 CRUD + 状态机 + 审批 + prc2 导入
apps/api/src/modules/finance-v2/finance-v2.module.ts:79: *   ShareholderSettlementsService    — 还款/核销（SERIALIZABLE 事务 + 现金账户联动）
apps/api/src/modules/finance-v2/finance-v2.module.ts:91:      FinShareholderContributionEntity,
apps/api/src/modules/finance-v2/finance-v2.module.ts:92:      FinShareholderSettlementEntity,
apps/api/src/modules/finance-v2/finance-v2.module.ts:104:    FinShareholderController,
apps/api/src/modules/finance-v2/finance-v2.module.ts:115:    ShareholderContributionsService, ShareholderSettlementsService,
apps/api/src/modules/finance-v2/finance-v2.module.ts:125:    ShareholderContributionsService, ShareholderSettlementsService,
apps/api/src/modules/finance-v2/finance-v2.module.ts:5:import { FinArController }      from './controllers/fin-ar.controller';
apps/api/src/modules/finance-v2/finance-v2.module.ts:7:import { FinShareholderController } from './controllers/fin-shareholder.controller';
apps/api/src/modules/finance-v2/finance-v2.module.ts:11:import { FinArLedgerController }        from './controllers/fin-ar-ledger.controller';
apps/api/src/modules/finance-v2/finance-v2.module.ts:12:import { FinArReconciliationController } from './controllers/fin-ar-reconciliation.controller';
apps/api/src/modules/finance-v2/finance-v2.module.ts:15:import { ArInvoicesService }    from './services/ar-invoices.service';
apps/api/src/modules/finance-v2/finance-v2.module.ts:16:import { ArReceiptsService }    from './services/ar-receipts.service';
apps/api/src/modules/finance-v2/finance-v2.module.ts:20:import { ShareholderContributionsService } from './services/shareholder-contributions.service';
apps/api/src/modules/finance-v2/finance-v2.module.ts:21:import { ShareholderSettlementsService }   from './services/shareholder-settlements.service';
apps/api/src/modules/finance-v2/finance-v2.module.ts:25:import { ArLedgerService }                 from './services/ar-ledger.service';
apps/api/src/modules/finance-v2/finance-v2.module.ts:26:import { ArReconciliationService }         from './services/ar-reconciliation.service';
apps/api/src/modules/finance-v2/finance-v2.module.ts:35:  FinShareholderContributionEntity,
apps/api/src/modules/finance-v2/finance-v2.module.ts:36:  FinShareholderSettlementEntity,
apps/api/src/modules/finance-v2/finance-v2.module.ts:49: *   Phase 2 — AR Runtime：fin_ar_invoices + fin_ar_receipts + 核销分摊           ✅
apps/api/src/modules/finance-v2/finance-v2.module.ts:50: *   Phase 3 — Cash Runtime：fin_cash_accounts + fin_cash_transactions + 转账     ✅
apps/api/src/modules/finance-v2/finance-v2.module.ts:51: *   Phase 4 — Shareholder Runtime：fin_shareholder_contributions + settlements   ✅
apps/api/src/modules/finance-v2/finance-v2.module.ts:56: *   - 不引用 fin_transactions / fin_payments / biz_cash_flow（旧表废弃）
apps/api/src/modules/finance-v2/finance-v2.module.ts:63: *   ApInvoicesService  — fin_ap_invoices CRUD + 状态机 + Aging + Summary + 导入
apps/api/src/modules/finance-v2/finance-v2.module.ts:66: *   FinArController    — /api/v2/finance/ar/* 路由
apps/api/src/modules/finance-v2/finance-v2.module.ts:67: *   ArInvoicesService  — fin_ar_invoices CRUD + 状态机 + Aging + Summary
apps/api/src/modules/finance-v2/finance-v2.module.ts:68: *   ArReceiptsService  — fin_ar_receipts 创建/确认/取消 + 核销分摊（事务）
apps/api/src/modules/finance-v2/finance-v2.module.ts:76: * Shareholder Runtime（Phase 4）：
apps/api/src/modules/finance-v2/finance-v2.module.ts:77: *   FinShareholderController         — /api/v2/finance/shareholders/* 路由
apps/api/src/modules/finance-v2/finance-v2.module.ts:78: *   ShareholderContributionsService  — 出资台账 CRUD + 状态机 + 审批 + prc2 导入
apps/api/src/modules/finance-v2/finance-v2.module.ts:79: *   ShareholderSettlementsService    — 还款/核销（SERIALIZABLE 事务 + 现金账户联动）
apps/api/src/modules/finance-v2/finance-v2.module.ts:91:      FinShareholderContributionEntity,
apps/api/src/modules/finance-v2/finance-v2.module.ts:92:      FinShareholderSettlementEntity,
apps/api/src/modules/finance-v2/finance-v2.module.ts:104:    FinShareholderController,
apps/api/src/modules/finance-v2/finance-v2.module.ts:115:    ShareholderContributionsService, ShareholderSettlementsService,
apps/api/src/modules/finance-v2/finance-v2.module.ts:125:    ShareholderContributionsService, ShareholderSettlementsService,
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:2:  Entity, Column, Index, Unique, PrimaryGeneratedColumn,
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:7: * 应收往来余额台账  fin_ar_ledger（应收总账）
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:11: * 与 fin_ar_invoices（发票级、含收款状态机）不同：本表是只读余额台账，
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:14:@Entity('fin_ar_ledger')
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:15:@Index('idx_fin_ar_ledger_farm_period', ['farmCode', 'periodDate'])
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:16:@Index('idx_fin_ar_ledger_counterparty', ['counterpartyName'])
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:17:@Unique('uq_fin_ar_ledger', ['farmCode', 'counterpartyName', 'periodDate'])
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:19:  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:23:  @Column({ name: 'farm_code', type: 'varchar', length: 32 })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:24:  farmCode: string;
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:26:  @Column({ name: 'farm_name', type: 'varchar', length: 64 })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:27:  farmName: string;
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:29:  @Column({ name: 'company_code', type: 'varchar', length: 64, nullable: true })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:32:  @Column({ name: 'counterparty_code', type: 'varchar', length: 64, nullable: true })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:33:  counterpartyCode: string | null;
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:35:  @Column({ name: 'counterparty_name', type: 'varchar', length: 256 })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:36:  counterpartyName: string;
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:41:  @Column({ name: 'currency_code', type: 'varchar', length: 8, default: 'LAK' })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:47:  @Column({ name: 'period_charge', type: 'numeric', precision: 20, scale: 2, default: 0 })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:48:  periodCharge: string;
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:50:  @Column({ name: 'period_received', type: 'numeric', precision: 20, scale: 2, default: 0 })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:59:  @Column({ name: 'base_currency', type: 'varchar', length: 8, default: 'CNY' })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:63:  @Column({ name: 'source', type: 'varchar', length: 32, default: 'OCR_PENDING_VERIFY' })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:66:  @Column({ name: 'remark', type: 'text', nullable: true })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:67:  remark: string | null;
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:2:  Entity, Column, Index, PrimaryGeneratedColumn,
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:7: * 股东出资 / 代付台账  fin_shareholder_contributions
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:9: * Finance V2 Phase 4 — Shareholder Runtime 正式启用
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:15:@Entity('fin_shareholder_contributions')
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:17:export class FinShareholderContributionEntity {
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:18:  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:21:  @Column({ name: 'contribution_no', type: 'varchar', length: 60, unique: true })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:25:  @Column({ name: 'shareholder_id', type: 'bigint', nullable: true })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:26:  shareholderId: string | null;
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:28:  @Column({ name: 'shareholder_code', type: 'varchar', length: 64, nullable: true })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:29:  shareholderCode: string | null;
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:31:  @Column({ name: 'shareholder_name', type: 'varchar', length: 200 })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:32:  shareholderName: string;
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:35:  @Column({ name: 'company_code', type: 'varchar', length: 64 })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:38:  @Column({ name: 'company_name', type: 'varchar', length: 256, nullable: true })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:42:  @Column({ name: 'project_code', type: 'varchar', length: 64, nullable: true })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:45:  @Column({ name: 'project_name', type: 'varchar', length: 256, nullable: true })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:50:  @Column({ name: 'source_type', type: 'varchar', length: 30, default: 'MANUAL' })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:56:  @Column({ name: 'source_no', type: 'varchar', length: 80, nullable: true })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:61:  @Column({ name: 'contribution_type', type: 'varchar', length: 40 })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:64:  @Column({ name: 'fund_nature', type: 'varchar', length: 40, nullable: true })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:68:  @Column({ name: 'currency_code', type: 'varchar', length: 8 })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:80:  @Column({ name: 'base_currency', type: 'varchar', length: 8, default: 'CNY' })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:90:  @Column({ name: 'balance_amount_original', type: 'numeric', precision: 18, scale: 2, default: 0 })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:91:  balanceAmountOriginal: number;
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:93:  @Column({ name: 'balance_amount_base', type: 'numeric', precision: 18, scale: 2, default: 0 })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:94:  balanceAmountBase: number;
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:109:  @Column({ name: 'status', type: 'varchar', length: 30, default: 'DRAFT' })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:118:  @Column({ name: 'remark', type: 'text', nullable: true })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:119:  remark: string | null;
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:121:  @Column({ name: 'created_by', type: 'varchar', length: 80, nullable: true })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:124:  @Column({ name: 'updated_by', type: 'varchar', length: 80, nullable: true })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:2:  Entity, Column, Index, Unique, PrimaryGeneratedColumn,
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:7: * 应收往来余额台账  fin_ar_ledger（应收总账）
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:11: * 与 fin_ar_invoices（发票级、含收款状态机）不同：本表是只读余额台账，
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:14:@Entity('fin_ar_ledger')
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:15:@Index('idx_fin_ar_ledger_farm_period', ['farmCode', 'periodDate'])
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:16:@Index('idx_fin_ar_ledger_counterparty', ['counterpartyName'])
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:17:@Unique('uq_fin_ar_ledger', ['farmCode', 'counterpartyName', 'periodDate'])
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:19:  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:23:  @Column({ name: 'farm_code', type: 'varchar', length: 32 })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:24:  farmCode: string;
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:26:  @Column({ name: 'farm_name', type: 'varchar', length: 64 })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:27:  farmName: string;
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:29:  @Column({ name: 'company_code', type: 'varchar', length: 64, nullable: true })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:32:  @Column({ name: 'counterparty_code', type: 'varchar', length: 64, nullable: true })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:33:  counterpartyCode: string | null;
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:35:  @Column({ name: 'counterparty_name', type: 'varchar', length: 256 })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:36:  counterpartyName: string;
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:41:  @Column({ name: 'currency_code', type: 'varchar', length: 8, default: 'LAK' })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:47:  @Column({ name: 'period_charge', type: 'numeric', precision: 20, scale: 2, default: 0 })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:48:  periodCharge: string;
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:50:  @Column({ name: 'period_received', type: 'numeric', precision: 20, scale: 2, default: 0 })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:59:  @Column({ name: 'base_currency', type: 'varchar', length: 8, default: 'CNY' })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:63:  @Column({ name: 'source', type: 'varchar', length: 32, default: 'OCR_PENDING_VERIFY' })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:66:  @Column({ name: 'remark', type: 'text', nullable: true })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:67:  remark: string | null;
apps/api/src/modules/finance-v2/entities/index.ts:2:export { FinArInvoiceEntity }                from './fin-ar-invoice.entity';
apps/api/src/modules/finance-v2/entities/index.ts:3:export { FinArReceiptEntity }                from './fin-ar-receipt.entity';
apps/api/src/modules/finance-v2/entities/index.ts:4:export { FinArReceiptAllocationEntity }      from './fin-ar-receipt-allocation.entity';
apps/api/src/modules/finance-v2/entities/index.ts:8:export { FinShareholderContributionEntity }  from './fin-shareholder-contribution.entity';
apps/api/src/modules/finance-v2/entities/index.ts:10:export { FinShareholderSettlementEntity }    from './fin-shareholder-settlement.entity';
apps/api/src/modules/finance-v2/entities/index.ts:13:export { FinArLedgerEntity }                 from './fin-ar-ledger.entity';
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:2:  Entity, Column, Index, PrimaryGeneratedColumn,
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:7: * 股东出资 / 代付台账  fin_shareholder_contributions
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:9: * Finance V2 Phase 4 — Shareholder Runtime 正式启用
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:15:@Entity('fin_shareholder_contributions')
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:17:export class FinShareholderContributionEntity {
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:18:  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:21:  @Column({ name: 'contribution_no', type: 'varchar', length: 60, unique: true })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:25:  @Column({ name: 'shareholder_id', type: 'bigint', nullable: true })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:26:  shareholderId: string | null;
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:28:  @Column({ name: 'shareholder_code', type: 'varchar', length: 64, nullable: true })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:29:  shareholderCode: string | null;
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:31:  @Column({ name: 'shareholder_name', type: 'varchar', length: 200 })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:32:  shareholderName: string;
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:35:  @Column({ name: 'company_code', type: 'varchar', length: 64 })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:38:  @Column({ name: 'company_name', type: 'varchar', length: 256, nullable: true })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:42:  @Column({ name: 'project_code', type: 'varchar', length: 64, nullable: true })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:45:  @Column({ name: 'project_name', type: 'varchar', length: 256, nullable: true })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:50:  @Column({ name: 'source_type', type: 'varchar', length: 30, default: 'MANUAL' })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:56:  @Column({ name: 'source_no', type: 'varchar', length: 80, nullable: true })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:61:  @Column({ name: 'contribution_type', type: 'varchar', length: 40 })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:64:  @Column({ name: 'fund_nature', type: 'varchar', length: 40, nullable: true })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:68:  @Column({ name: 'currency_code', type: 'varchar', length: 8 })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:80:  @Column({ name: 'base_currency', type: 'varchar', length: 8, default: 'CNY' })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:90:  @Column({ name: 'balance_amount_original', type: 'numeric', precision: 18, scale: 2, default: 0 })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:91:  balanceAmountOriginal: number;
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:93:  @Column({ name: 'balance_amount_base', type: 'numeric', precision: 18, scale: 2, default: 0 })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:94:  balanceAmountBase: number;
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:109:  @Column({ name: 'status', type: 'varchar', length: 30, default: 'DRAFT' })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:118:  @Column({ name: 'remark', type: 'text', nullable: true })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:119:  remark: string | null;
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:121:  @Column({ name: 'created_by', type: 'varchar', length: 80, nullable: true })
apps/api/src/modules/finance-v2/entities/fin-shareholder-contribution.entity.ts:124:  @Column({ name: 'updated_by', type: 'varchar', length: 80, nullable: true })
apps/api/src/modules/finance-v2/entities/index.ts:2:export { FinArInvoiceEntity }                from './fin-ar-invoice.entity';
apps/api/src/modules/finance-v2/entities/index.ts:3:export { FinArReceiptEntity }                from './fin-ar-receipt.entity';
apps/api/src/modules/finance-v2/entities/index.ts:4:export { FinArReceiptAllocationEntity }      from './fin-ar-receipt-allocation.entity';
apps/api/src/modules/finance-v2/entities/index.ts:8:export { FinShareholderContributionEntity }  from './fin-shareholder-contribution.entity';
apps/api/src/modules/finance-v2/entities/index.ts:10:export { FinShareholderSettlementEntity }    from './fin-shareholder-settlement.entity';
apps/api/src/modules/finance-v2/entities/index.ts:13:export { FinArLedgerEntity }                 from './fin-ar-ledger.entity';
apps/api/src/modules/finance-v2/entities/fin-ar-invoice.entity.ts:2:  Entity, Column, Index, PrimaryGeneratedColumn,
apps/api/src/modules/finance-v2/entities/fin-ar-invoice.entity.ts:7: * 应收发票台账  fin_ar_invoices
apps/api/src/modules/finance-v2/entities/fin-ar-invoice.entity.ts:21: *   OPEN / PARTIALLY_RECEIVED → CANCELLED（未收款可取消）
apps/api/src/modules/finance-v2/entities/fin-ar-invoice.entity.ts:24: * 收款状态（collection_status，冗余便于查询）：
apps/api/src/modules/finance-v2/entities/fin-ar-invoice.entity.ts:27:@Entity('fin_ar_invoices')
apps/api/src/modules/finance-v2/entities/fin-ar-invoice.entity.ts:28:@Index('idx_fin_ar_company_status', ['companyCode', 'status'])
apps/api/src/modules/finance-v2/entities/fin-ar-invoice.entity.ts:29:@Index('idx_fin_ar_customer_status', ['customerCode', 'status'], { where: '"customer_code" IS NOT NULL' })
apps/api/src/modules/finance-v2/entities/fin-ar-invoice.entity.ts:30:@Index('idx_fin_ar_due_date', ['dueDate'], { where: '"due_date" IS NOT NULL' })
apps/api/src/modules/finance-v2/entities/fin-ar-invoice.entity.ts:31:@Index('idx_fin_ar_source_no', ['sourceNo'], { where: '"source_no" IS NOT NULL' })
apps/api/src/modules/finance-v2/entities/fin-ar-invoice.entity.ts:32:// idx_fin_ar_inv_sal_cust 跳过:DB 列 sal_customer_id 在 entity 缺(g197 真业务漂移)
apps/api/src/modules/finance-v2/entities/fin-ar-invoice.entity.ts:34:  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
apps/api/src/modules/finance-v2/entities/fin-ar-invoice.entity.ts:37:  @Column({ name: 'ar_no', type: 'varchar', length: 60, unique: true })
apps/api/src/modules/finance-v2/entities/fin-ar-invoice.entity.ts:38:  arNo: strin
```
