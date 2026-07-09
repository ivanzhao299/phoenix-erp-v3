# Agent Worker Log

| Field | Value |
| --- | --- |
| Task ID | BUGTASK-20260709-0001-02-A3 |
| Agent | A3-Backend-Critical-Path |
| Dry run | No |
| Exit code | 0 |

## Command

```bash
/usr/local/bin/node scripts/ops/run-agent-task.mjs --agent A3-Backend-Critical-Path --worktree /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path --prompt docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md --task-contract docs/ops/runs/BUGTASK-20260709-0001-02-A3-contract.md --assembled-prompt-output docs/ops/runs/BUGTASK-20260709-0001-02-A3-worker-assembled-prompt.md --require-approval-token APPROVE_AGENT_EXECUTION --skip-baseline-autopilot --allow-ops-runtime-dirty
```

## Stdout

```text
Agent: A3-Backend-Critical-Path
Worktree: /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
Branch: w5-a3-backend-critical-path
Prompt: docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md
Task contract: docs/ops/runs/BUGTASK-20260709-0001-02-A3-contract.md
Assembled prompt: docs/ops/runs/BUGTASK-20260709-0001-02-A3-worker-assembled-prompt.md
Assembled prompt chars: 32468
Codex command: codex exec -C /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path --sandbox workspace-write -
Codex timeout ms: 600000
Run log: /Users/mac/phoenix-erp-worktrees/codex-orchestrator/docs/ops/runs/2026-07-09T01-08-29-863Z-A3-Backend-Critical-Path.md
A3 backend dry-run completed: **HOLD**.

The requested fix is not backend scope. The bad label is in frontend at `apps/web/src/components/layout/Sidebar.tsx:118`:

`/warehouse/inbound` currently has `label: "手工入库"` and should be changed by A4 to `入库管理`.

I wrote and committed the backend report only:

[docs/ops/BUG-20260709-0001_A3_BACKEND_CRITICAL_PATH_REPORT.md](/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path/docs/ops/BUG-20260709-0001_A3_BACKEND_CRITICAL_PATH_REPORT.md:1)

Validation:
- Initial directory/branch/worktree checks: PASS
- `apps/api` TypeScript: PASS
- No backend code changed
- No migration, DB write, deploy, or push
- Commit: `bb5a32a7 docs(ops): record BUG-20260709-0001 A3 backend diagnosis`
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
session id: 019f4469-b710-7df1-98d3-8f924875f861
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

Source bug: BUG-20260709-0001
Source repair task: BUGTASK-20260709-0001
Assigned agent: A3-Backend-Critical-Path

## Issue

乱改菜单标题

## Route

/warehouse/inbound

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "url": "https://erp.eggslao.com/warehouse/inbound",
  "bugNo": "BUG-20260709-0001",
  "route": "/warehouse/inbound",
  "title": "乱改菜单标题",
  "taskNo": "BUGTASK-20260709-0001",
  "context": {
    "attachments": [
      {
        "sha256": "67ffbe65d56c8434d98f962bb6bf1df64f21673fce97e486ae2ce3cfa4b4fc55",
        "fileName": "01-1783558830671-bf43ae09.png",
        "mimeType": "image/png",
        "sizeBytes": 544012,
        "originalName": "pasted-screenshot-1783558669106-1.png",
        "relativePath": "storage/bug-reports/2026/07/09/BUG-20260709-0001/01-1783558830671-bf43ae09.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260709-0001/attachments/01-1783558830671-bf43ae09.png"
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
      "capturedAt": "2026-07-09T01:00:30.672Z",
      "pageSnapshot": {
        "route": "/warehouse/inbound",
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
          "库存总览",
          "成品批次",
          "库存来源模式",
          "手工入库",
          "出库管理",
          "调拨管理",
          "盘点管理",
          "出入库流水",
          "库存查询",
          "临期库存",
          "日结对账",
          "损耗管理",
          "仓库主档",
          "库区管理",
          "库位管理",
          "全链追溯",
          "采购管理",
          "销售管理",
          "财务结算中心",
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
          "pasted-screenshot-1783558669106-1.png",
          "退出",
          "仓储管理",
          "/入库管理",
          "/",
          "入库管理",
          "·管理各类仓库入库单审核数据追踪",
          "·",
          "共 0 条记录",
          "入库单号",
          "入库日期",
          "入库类型",
          "仓库",
          "产品编码/物料编码",
          "入库数量",
          "状态",
          "操作员",
          "操作",
          "20260705",
          "2026-07-05T00:00:00.000Z",
          "生产入库",
          "LPH_MS_RAW",
          "测试材料",
          "1",
          "已入库",
          "admin",
          "查库存 编辑 删除",
          "bbbb",
          "退货入库",
          "LPH_MS_EGG_FARM",
          "测试",
          "待处理",
          "tangzhiwen",
          "查库存 编辑 审核 删除",
          "aaaaa",
          "qiantao",
          "CS-00001",
          "11",
          "songlei",
          "WI-527118",
          "2026-07-07T00:00:00.000Z",
          "WI-534374",
          "采购入库",
          "监控摄像头测试",
          "50",
          "WI-535598",
          "2026-07-08T00:00:00.000Z",
          "测试物品"
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
            "path": ".sidebar-module__C8A-ya__groupHeader.sidebar-module__C8A-ya__groupActive",
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
            "path": ".sidebar-module__C8A-ya__subItem.sidebar-module__C8A-ya__subActive",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 308
            },
            "label": "库存总览",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 340
            },
            "label": "成品批次",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 372
            },
            "label": "库存来源模式",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.sidebar-module__C8A-ya__subActive",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 404
            },
            "label": "手工入库",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 436
            },
            "label": "出库管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 468
            },
            "label": "调拨管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 500
            },
            "label": "盘点管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 532
            },
            "label": "出入库流水",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 564
            },
            "label": "库存查询",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 596
            },
            "label": "临期库存",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 628
            },
            "label": "日结对账",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 660
            },
            "label": "损耗管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 692
            },
            "label": "仓库主档",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 724
            },
            "label": "库区管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 756
            },
            "label": "库位管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 788
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
              "y": 826
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
              "y": 864
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
              "y": 902
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
              "y": 940
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
              "y": 978
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
              "y": 1016
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
              "y": 1054
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
              "y": 1092
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
              "y": 1130
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
              "y": 1168
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
              "x": 854,
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
              "h": 33,
              "w": 121,
              "x": 1633,
              "y": 90
            },
            "label": "新建入库单",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 30,
              "w": 53,
              "x": 244,
              "y": 145
            },
            "label": "全部",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 30,
              "w": 77,
              "x": 303,
              "y": 145
            },
            "label": "生产入库",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 30,
              "w": 77,
              "x": 386,
              "y": 145
            },
            "label": "采购入库",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 30,
              "w": 77,
              "x": 469,
              "y": 145
            },
            "label": "调拨入库",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 30,
              "w": 77,
              "x": 552,
              "y": 145
            },
            "label": "退货入库",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 26,
              "w": 57,
              "x": 1522,
              "y": 290
            },
            "label": "查库存",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1585,
              "y": 290
            },
            "label": "编辑",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1637,
              "y": 290
            },
            "label": "删除",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 26,
              "w": 57,
              "x": 1489,
              "y": 351
            },
            "label": "查库存",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1552,
              "y": 351
            },
            "label": "编辑",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 60,
              "x": 1604,
              "y": 351
            },
            "label": "审核",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1670,
              "y": 351
            },
            "label": "删除",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 26,
              "w": 57,
              "x": 1522,
              "y": 412
            },
            "label": "查库存",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1585,
              "y": 412
            },
            "label": "编辑",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1637,
              "y": 412
            },
            "label": "删除",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 26,
              "w": 57,
              "x": 1489,
              "y": 473
            },
            "label": "查库存",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1552,
              "y": 473
            },
            "label": "编辑",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 60,
              "x": 1604,
              "y": 473
            },
            "label": "审核",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1670,
              "y": 473
            },
            "label": "删除",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 26,
              "w": 57,
              "x": 1489,
              "y": 534
            },
            "label": "查库存",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1552,
              "y": 534
            },
            "label": "编辑",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 60,
              "x": 1604,
              "y": 534
            },
            "label": "审核",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1670,
              "y": 534
            },
            "label": "删除",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 26,
              "w": 57,
              "x": 1522,
              "y": 595
            },
            "label": "查库存",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1585,
              "y": 595
            },
            "label": "编辑",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1637,
              "y": 595
            },
            "label": "删除",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 26,
              "w": 57,
              "x": 1522,
              "y": 656
            },
            "label": "查库存",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1585,
              "y": 656
            },
            "label": "编辑",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1637,
              "y": 656
            },
            "label": "删除",
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
          },
          {
            "tag": "input",
            "path": ".crudForm-module__v3To_q__input.",
            "rect": {
              "h": 38,
              "w": 232,
              "x": 1798,
              "y": 108
            },
            "label": "留空自动生成WI",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".crudForm-module__v3To_q__input.",
            "rect": {
              "h": 38,
              "w": 232,
              "x": 2046,
              "y": 109
            },
            "label": "2026-07-09",
            "disabled": false
          }
        ]
      },
      "devicePixelRatio": 1.7999999523162842
    },
    "consoleErrors": [],
    "failedRequests": [],
    "localEvidence": {
      "localAttachments": [
        {
          "fileName": "01-1783558830671-bf43ae09.png",
          "originalName": "pasted-screenshot-1783558669106-1.png",
          "mimeType": "image/png",
          "sourceEndpoint": "/api/bug-intake/reports/BUG-20260709-0001/attachments/01-1783558830671-bf43ae09.png",
          "localPath": "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260709-090635/BUG-20260709-0001/attachments/01-1783558830671-bf43ae09.png",
          "sizeBytes": 544012
        }
      ],
      "localAttachmentPaths": [
        "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260709-090635/BUG-20260709-0001/attachments/01-1783558830671-bf43ae09.png"
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
    "source_bug_no": "BUG-20260709-0001",
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
    "source_repair_task_no": "BUGTASK-20260709-0001"
  },
  "createdAt": "2026-07-09T01:02:05.526Z",
  "createdBy": "admin",
  "moduleCode": "____",
  "suggestedOwner": "_____",
  "repairGuardrails": {
    "autoRepairExecuted": false,
    "noProductionDeploy": true,
    "noDbWriteWithoutGate": true,
    "requiresHumanApproval": true
  },
  "acceptanceCriteria": "没给你明确指令之前能不能不要修改标题，现在给我把“手工入库”改回“入库管理”，并且记住这个问题，以后不要随便改标题",
  "agentPlanGeneratedAt": "2026-07-09T01:02:06.682Z",
  "agentPlanGeneratedBy": "admin",
  "agentExecutionApproval": {
    "approved": true,
    "approvedAt": "2026-07-09T01:02:08.289Z",
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

- /Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260709-090635/BUG-20260709-0001/attachments/01-1783558830671-bf43ae09.png

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
我先执行合同要求的入口检查。这个任务本身指向菜单文案，若定位到前端文件，我会按 A3 后端合同停止，只写诊断报告，不越权改前端。
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
cd177e70 (HEAD -> w5-a3-backend-critical-path, w5-a7-final-qa-gate, main) docs(ops): record baseline lifecycle report
c787637c docs(ops): record baseline lifecycle report
3e94655f docs(ops): update BUG-20260708-0004 A7 final QA gate
772be128 (w5-a6-staging-deploy-runbook) docs(ops): record baseline lifecycle report
2974b8f7 docs(ops): update BUG-20260708-0004 A6 staging runbook
8b8cb9c4 (w5-a4-frontend-uat-smoke) docs(ops): record baseline lifecycle report
eba3edb1 fix: localize warehouse ledger transaction labels
c4805726 docs(ops): record baseline lifecycle report

exec
/bin/zsh -lc 'git status --short' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
codex
入口检查通过：目录、分支、worktree 清洁都符合合同。现在只做 dry-run 诊断，先限定在后端范围内确认是否存在可由 A3 修复的菜单标题来源。
exec
/bin/zsh -lc 'rg -n "手工入库|入库管理|warehouse/inbound|/warehouse/inbound" apps/api docs/ops package.json pnpm-workspace.yaml' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
docs/ops/BUG-20260708-0001-a4-frontend-uat-report.md:9:Frontend repair scope: `/warehouse/inbound` and `/warehouse/query`
docs/ops/BUG-20260708-0001-a4-frontend-uat-report.md:14:- `apps/web/src/app/(admin)/warehouse/inbound/page.tsx`
docs/ops/BUG-20260708-0001-a4-frontend-uat-report.md:20:- `/warehouse/inbound`: manual inbound list, create/edit drawer, permission-aware row actions.
docs/ops/BUG-20260708-0001-a4-frontend-uat-report.md:54:- `git diff --check -- apps/web/src/app/\(admin\)/warehouse/query/page.tsx apps/web/src/app/\(admin\)/warehouse/inbound/page.tsx docs/ops/BUG-20260708-0001-a4-frontend-uat-report.md`: PASS on redispatch validation.
docs/ops/WMS_FRONTEND_ATOMIC_MENU_GATE_REMEDIATION_20260626.md:19:- `apps/web/src/app/(admin)/warehouse/inbound/page.tsx`
docs/ops/BUG-20260708-0001_A3_BACKEND_CRITICAL_PATH_REPORT.md:20:The admin `/warehouse/inbound` page creates and approves rows through Generic CRUD on `wms_inbound`. The stock query page `/warehouse/query` reads `inv_batches` through `/api/inventory/batches`.
docs/ops/BUG-20260708-0001_A3_BACKEND_CRITICAL_PATH_REPORT.md:88:A1/A2 should rerun environment-backed scope-audit and web typecheck after the local API service and web test dependencies are available. A4 should smoke `/warehouse/inbound` approval followed by `/warehouse/query` refresh to confirm the new inbound item appears in inventory.
docs/ops/runs/remediation-r3-menu-role-datascope-audit-20260624-122800/menu_inventory.txt:59:    8910 | MENU_INV_MANUAL_INBOUND       | 手工库存入库      | WMS         | [NULL]            |         32 | /warehouse/inbound              | 2026-06-02 14:19:15.123439
apps/api/src/modules/master-data/master-data-references.service.ts:83:    { refTable: 'wms_inbound',     refDocType: '入库单',       fkColumn: 'item',     noField: 'inbound_no',   linkPattern: '/warehouse/inbound?keyword=:code' },
apps/api/src/modules/master-data/master-data-references.service.ts:87:    { refTable: 'wms_inbound',    refDocType: '入库单',   fkColumn: 'warehouse_code', noField: 'inbound_no',  linkPattern: '/warehouse/inbound?keyword=:code' },
apps/api/migrations/20260607_g12_song_perm_extension.sql:7:--   3. MENU_INV_MANUAL_INBOUND 手工入库 V,C → V,C,E（同上）
apps/api/migrations/20260602_production_chain_convergence_phase1_b_menus.sql:21:      ('MENU_INV_MANUAL_INBOUND',     '手工库存入库', 'ເຂົ້າສາງດ້ວຍມື',      'WMS',  32, 'inbound',    '/warehouse/inbound')
apps/api/migrations/20260602_production_chain_convergence_phase1_b_menus.sql:44:      -- 包装完成入库（与手工入库分离：只授包装主管 + 管理员）

exec
/bin/zsh -lc "rg -n \"MENU_.*INBOUND|INBOUND|wms_inbound|warehouse\" apps/api/src/modules apps/api/src -g '*.ts'" in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
apps/api/src/modules/master-data/master-data-runtime.service.ts:149:  warehouse: {
apps/api/src/modules/master-data/master-data-runtime.service.ts:150:    table: 'wms_warehouses', codeCol: 'warehouse_code', nameCol: 'warehouse_name',
apps/api/src/modules/master-data/master-data-runtime.service.ts:152:    writableCols: ['warehouse_name','warehouse_name_zh','warehouse_name_en','warehouse_name_lo','type','company_code','manager','effective_date','expire_date','remark'],
apps/api/src/modules/master-data/master-data-runtime.service.ts:154:    keyFields: ['warehouse_name','type','company_code','manager'],
apps/api/src/modules/master-data/master-data-runtime.service.ts:188:    writableCols: ['org_name','org_name_cn','org_short_name','parent_id','parent_code','org_type','level','company_code','project_code','warehouse_code','manager_user_id','manager_name','site_code','site_business_type','sort_order','effective_date','expire_date','remark'],
apps/api/src/modules/master-data/master-data-runtime.service.ts:190:    keyFields: ['org_name','org_name_cn','parent_code','parent_id','org_type','company_code','project_code','warehouse_code','manager_user_id','site_code','site_business_type'],
apps/api/src/modules/master-data/master-data-runtime.service.ts:221:  warehouse:       'MD_WAREHOUSE_CREATE',
apps/api/src/modules/master-data/master-data-runtime.service.ts:302:  warehouse: {
apps/api/src/modules/master-data/master-data-runtime.service.ts:303:    required: ['warehouse_name', 'company_code'],
apps/api/src/modules/master-data/master-data-runtime.service.ts:304:    unique: [{ fields: ['warehouse_name'], scopeByCompany: true, label: '仓库名称' }],
apps/api/src/modules/master-data/master-data-runtime.service.ts:339:  product_name: '产品名称', category_code: '类目', store_name: '门店名称', warehouse_name: '仓库名称',
apps/api/src/modules/master-data/operations.service.ts:43:  | 'product' | 'grade' | 'spec' | 'sku' | 'warehouse' | 'driver' | 'vehicle'
apps/api/src/modules/master-data/operations.service.ts:98:        { type: 'warehouse', table: 'wms_warehouses', codeCol: 'warehouse_code', href: '/master-data/warehouses' },
apps/api/src/modules/master-data/operations.service.ts:192:      { type: 'warehouse', sql: `SELECT warehouse_code AS code, COALESCE(warehouse_name_zh,warehouse_name) AS name, status FROM wms_warehouses WHERE warehouse_code ILIKE $1 OR warehouse_name ILIKE $1 OR warehouse_name_zh ILIKE $1 LIMIT 5`, href: '/master-data/warehouses' },
apps/api/src/modules/master-data/master-data-references.service.ts:49:    { refTable: 'wms_outbound',     refDocType: '出库单',   fkColumn: 'dest',          noField: 'outbound_no', linkPattern: '/warehouse/outbound?keyword=:code' },
apps/api/src/modules/master-data/master-data-references.service.ts:82:    { refTable: 'inv_batches',     refDocType: '库存批次',     fkColumn: 'sku_code', noField: 'batch_no',     linkPattern: '/warehouse?keyword=:code' },
apps/api/src/modules/master-data/master-data-references.service.ts:83:    { refTable: 'wms_inbound',     refDocType: '入库单',       fkColumn: 'item',     noField: 'inbound_no',   linkPattern: '/warehouse/inbound?keyword=:code' },
apps/api/src/modules/master-data/master-data-references.service.ts:86:    { refTable: 'inv_batches',    refDocType: '库存批次', fkColumn: 'warehouse_code', noField: 'batch_no',    linkPattern: '/warehouse?keyword=:code' },
apps/api/src/modules/master-data/master-data-references.service.ts:87:    { refTable: 'wms_inbound',    refDocType: '入库单',   fkColumn: 'warehouse_code', noField: 'inbound_no',  linkPattern: '/warehouse/inbound?keyword=:code' },
apps/api/src/modules/master-data/master-data-references.service.ts:88:    { refTable: 'wms_outbound',   refDocType: '出库单',   fkColumn: 'warehouse_code', noField: 'outbound_no', linkPattern: '/warehouse/outbound?keyword=:code' },
apps/api/src/modules/master-data/master-data-references.service.ts:89:    { refTable: 'wms_transfer',   refDocType: '调拨单',   fkColumn: 'from_warehouse', noField: 'transfer_no', linkPattern: '/warehouse/transfer?keyword=:code' },
apps/api/src/modules/master-data/master-data-references.service.ts:109:    { refTable: 'wms_warehouses',     refDocType: '仓库',       fkColumn: 'company_code', noField: 'warehouse_code',    linkPattern: '/master-data/warehouses?keyword=:code' },
apps/api/src/modules/master-data/governance.service.ts:128:         SELECT user_id FROM sys_user_warehouse_scopes
apps/api/src/modules/master-data/dict-governance.service.ts:72:    { dictType: 'INV_INBOUND_TYPE',       domain: 'inventory' },
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:299:      moduleCode: 'MENU_MD_WAREHOUSE', tableName: 'wms_warehouses',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:301:      onApproved: mdAuditHook('WAREHOUSE', 'wms_warehouses', 'warehouse_code', 'APPROVE_ACTIVE'),
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:302:      onRejected: mdAuditHook('WAREHOUSE', 'wms_warehouses', 'warehouse_code', 'REJECT'),
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:299:      moduleCode: 'MENU_MD_WAREHOUSE', tableName: 'wms_warehouses',
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:301:      onApproved: mdAuditHook('WAREHOUSE', 'wms_warehouses', 'warehouse_code', 'APPROVE_ACTIVE'),
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:302:      onRejected: mdAuditHook('WAREHOUSE', 'wms_warehouses', 'warehouse_code', 'REJECT'),
apps/api/src/modules/master-data/master-data-center.controller.ts:65:  warehouse: 'MENU_MD_WAREHOUSE',
apps/api/src/modules/wms/entities/wms-location.entity.ts:9:  warehouse_code: string;
apps/api/src/modules/terminal/stocktake.controller.ts:30:    return await this.terminalService.submitDailyClose(body.warehouse_code, body.date, userId);
apps/api/src/modules/terminal/pda.controller.ts:18:  @Get('inventory/:warehouse_code')
apps/api/src/modules/terminal/pda.controller.ts:19:  async syncInventory(@Param('warehouse_code') warehouseCode: string) {
apps/api/src/modules/terminal/pda.controller.ts:20:    return await this.terminalService.pdaSyncInventory(warehouseCode);
apps/api/src/modules/wms/entities/wms-stock-ledger.entity.ts:9:  biz_type: string; // INBOUND, OUTBOUND, STOCKTAKE, ADJUSTMENT
apps/api/src/modules/wms/entities/wms-stock-ledger.entity.ts:15:  warehouse_code: string;
apps/api/src/modules/procurement-v2/entities/prc2-request-item.entity.ts:48:  @Column({ name: 'warehouse_code', type: 'varchar', length: 64, nullable: true })
apps/api/src/modules/procurement-v2/entities/prc2-request-item.entity.ts:49:  warehouseCode: string;
apps/api/src/modules/procurement-v2/entities/prc2-request-item.entity.ts:48:  @Column({ name: 'warehouse_code', type: 'varchar', length: 64, nullable: true })
apps/api/src/modules/procurement-v2/entities/prc2-request-item.entity.ts:49:  warehouseCode: string;
apps/api/src/modules/terminal/terminal.service.ts:57:  async pdaSyncInventory(warehouseCode: string) {
apps/api/src/modules/terminal/terminal.service.ts:60:        `SELECT batch_no, product_code, qty, warehouse_code, location_code, created_at
apps/api/src/modules/terminal/terminal.service.ts:62:         WHERE warehouse_code = $1 AND qty > 0
apps/api/src/modules/terminal/terminal.service.ts:64:        [warehouseCode],
apps/api/src/modules/terminal/terminal.service.ts:115:  async submitDailyClose(warehouseCode: string, date: string, userId: number) {
apps/api/src/modules/terminal/terminal.service.ts:120:        [userId, 'DAILY_CLOSE', 'SUBMIT', JSON.stringify({ warehouseCode, date })],
apps/api/src/modules/terminal/terminal.service.ts:123:    return { code: 200, msg: `库区 ${warehouseCode} 在 ${date} 的日结已完成` };
apps/api/src/modules/terminal/packaging.service.ts:243:        // ③ inv_batches 鲜蛋批次（V3 实际 schema 仅 batch_no/product_code/qty/expire_date/store_code/warehouse_code）
apps/api/src/modules/terminal/packaging.service.ts:249:               (batch_no, product_code, qty, expire_date, store_code, warehouse_code)
apps/api/src/modules/terminal/packaging.service.ts:572:                 (batch_no, product_code, qty, qty_available, status, expire_date, store_code, warehouse_code)
apps/api/src/modules/terminal/packaging.service.ts:656:      //   - packComplete 完成后自动创建 wms_inbound 任务，等待仓库验收上架
apps/api/src/modules/terminal/packaging.service.ts:694:              `INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, expire_date, store_code, warehouse_code, legacy_source, packaging_batch_ref)
apps/api/src/modules/terminal/packaging.service.ts:715:                     (batch_no, product_code, qty, qty_available, status, expire_date, store_code, warehouse_code, legacy_source, packaging_batch_ref)
apps/api/src/modules/terminal/packaging.service.ts:739:          // V2 fidelity: 包装完结 → 自动建 wms_inbound PENDING 任务，等待仓库上架收货
apps/api/src/modules/terminal/packaging.service.ts:747:                `INSERT INTO wms_inbound (task_no, status, warehouse_code, type, item, qty, store_code, operator, created_at)
apps/api/src/modules/terminal/packaging.service.ts:752:              console.warn('[packComplete][WARN] wms_inbound 自建跳过:', e?.message);
apps/api/src/modules/terminal/packaging.service.ts:763:      //   （EGG-YYYYMMDD-*，PACKAGING_INBOUND，进 FIFO；幂等，重复点击不重复入库）
apps/api/src/modules/bff/bff.controller.ts:703:        `SELECT COALESCE(SUM(qty),0)::bigint AS total FROM wms_inbound
apps/api/src/modules/bff/bff.controller.ts:821:        SELECT warehouse_code, SUM(qty) AS total_qty, COUNT(DISTINCT product_code) AS sku_count
apps/api/src/modules/bff/bff.controller.ts:823:        GROUP BY warehouse_code
apps/api/src/modules/bff/bff.controller.ts:1173:    // 来源 A：wms_inbound 已完成、尚未被 pkg_source_batches 引用的批次
apps/api/src/modules/bff/bff.controller.ts:1181:         FROM wms_inbound wi
apps/api/src/modules/bff/bff.controller.ts:1775:  @Post('warehouse/confirm')
apps/api/src/modules/bff/bff.controller.ts:1798:    //   change_type=PACKAGING_INBOUND, 进 FIFO）。幂等键 = packingCode；
apps/api/src/modules/bff/bff.controller.ts:1799:    //   SITE 级模式门控：仅 PACKAGING_INBOUND 模式生成（TEMP 模式跳过，属正常，非失败）。
apps/api/src/modules/bff/bff.controller.ts:1813:          `[warehouse/confirm][ERR] 包装库存生成失败 packingCode=${body.packingCode}: ${e?.message}`,
apps/api/src/modules/wms/entities/wms-stock-balance.entity.ts:4:@Unique('wms_stock_balance_warehouse_code_location_code_spec_code_ba_key', ['warehouse_code', 'location_code', 'spec_code', 'batch_no'])
apps/api/src/modules/wms/entities/wms-stock-balance.entity.ts:10:  warehouse_code: string;
apps/api/src/modules/analytics/services/inventory-analytics.service.ts:19:  async compute(q: { companyCode?: string; warehouseCode?: string }) {
apps/api/src/modules/analytics/services/inventory-analytics.service.ts:20:    const wFilter = q.warehouseCode ? `AND warehouse_code = '${q.warehouseCode.replace(/'/g, "''")}'` : '';
apps/api/src/modules/procurement-v2/entities/prc2-order-item.entity.ts:63:  @Column({ name: 'warehouse_code', type: 'varchar', length: 64, nullable: true })
apps/api/src/modules/procurement-v2/entities/prc2-order-item.entity.ts:64:  warehouseCode: string;
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
apps/api/src/modules/wms/wms.service.ts:124:   *   change_type = 'INBOUND'  qty_change = item.qty
apps/api/src/modules/wms/wms.service.ts:126:   * 注：硬编码 'INBOUND-DOCK' 库位与 'WH-B' 兜底仓库改为前端传入或用 task 字段
apps/api/src/modules/wms/wms.service.ts:156:        `SELECT warehouse_code, operator, store_code, status FROM wms_inbound WHERE task_no = $1 FOR UPDATE`,
apps/api/src/modules/wms/wms.service.ts:163:      this.assertWritableWarehouse(task.warehouse_code || null, `入库单 ${task_no}`);
apps/api/src/modules/wms/wms.service.ts:171:      const defaultWarehouse = task.warehouse_code || 'WMS-VTE-MAIN';
apps/api/src/modules/wms/wms.service.ts:176:        `UPDATE wms_inbound SET status = 'COMPLETED', updated_at = CURRENT_TIMESTAMP WHERE task_no = $1`,
apps/api/src/modules/wms/wms.service.ts:187:        const warehouseCode = item.warehouse_code || item.warehouse || defaultWarehouse;
apps/api/src/modules/wms/wms.service.ts:188:        this.assertWritableWarehouse(warehouseCode, `入库明细 ${baseBatchNo}`);
apps/api/src/modules/wms/wms.service.ts:189:        const locationCode  = item.location_code || 'INBOUND-DOCK';
apps/api/src/modules/wms/wms.service.ts:208:            `INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, location_code, store_code)
apps/api/src/modules/wms/wms.service.ts:214:            [baseBatchNo, item.product_code, actualQty, warehouseCode, locationCode, storeCode],
apps/api/src/modules/wms/wms.service.ts:218:             VALUES ($1, 'INBOUND', $2::int, $3, $4, $5, $6)`,
apps/api/src/modules/wms/wms.service.ts:221:              `入库确认 product=${item.product_code} actual=${actualQty} warehouse=${warehouseCode}`,
apps/api/src/modules/wms/wms.service.ts:230:            `INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, location_code, store_code)
apps/api/src/modules/wms/wms.service.ts:237:            [brokenBatchNo, item.product_code, brokenQty, warehouseCode, 'QUARANTINE-DOCK', storeCode],
apps/api/src/modules/wms/wms.service.ts:241:             VALUES ($1, 'INBOUND_BROKEN', $2::int, $3, $4, $5, $6)`,
apps/api/src/modules/wms/wms.service.ts:263:      warehouseCode?: string;
apps/api/src/modules/wms/wms.service.ts:271:    const warehouseCode = ctx.warehouseCode || 'WMS-VTE-MAIN';
apps/api/src/modules/wms/wms.service.ts:272:    this.assertWritableWarehouse(warehouseCode, `采购收货 ${ctx.refNo}`);
apps/api/src/modules/wms/wms.service.ts:280:      const locationCode = (it.locationCode || 'INBOUND-DOCK').slice(0, 64);
apps/api/src/modules/wms/wms.service.ts:282:        `INSERT INTO inv_batches (batch_no, product_code, qty, qty_available, status, warehouse_code, location_code, store_code)
apps/api/src/modules/wms/wms.service.ts:288:        [batchNo, it.productCode, qty, warehouseCode, locationCode, storeCode],
apps/api/src/modules/wms/wms.service.ts:292:         VALUES ($1, 'INBOUND', $2::int, $3, $4, $5, $6)`,
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
apps/api/src/modules/procurement-v2/entities/prc2-order-item.entity.ts:63:  @Column({ name: 'warehouse_code', type: 'varchar', length: 64, nullable: true })
apps/api/src/modules/procurement-v2/entities/prc2-order-item.entity.ts:64:  warehouseCode: string;
apps/api/src/modules/procurement-v2/entities/prc2-receipt.entity.ts:50:  @Column({ name: 'warehouse_code', type: 'varchar', length: 64, nullable: true })
apps/api/src/modules/procurement-v2/entities/prc2-receipt.entity.ts:51:  warehouseCode: string;
apps/api/src/modules/procurement-v2/entities/prc2-receipt.entity.ts:50:  @Column({ name: 'warehouse_code', type: 'varchar', length: 64, nullable: true })
apps/api/src/modules/procurement-v2/entities/prc2-receipt.entity.ts:51:  warehouseCode: string;
apps/api/src/modules/wms/inventory/inventory.service.spec.ts:8:    warehouse_code: 'W1',
apps/api/src/modules/workflow/workflow.service.ts:1894:      warehouse_code: '仓库',
apps/api/src/modules/workflow/workflow.service.ts:1895:      warehouse_name: '仓库名称',
apps/api/src/modules/workflow/workflow.service.ts:2196:         ('WMS_WAREHOUSES','仓库列表','TABLE','{"table":"wms_warehouses","valueField":"warehouse_code","labelField":"warehouse_name_zh"}'::jsonb),
apps/api/src/modules/workflow/workflow.service.ts:2343:        { key: 'warehouse', label: '仓库/门店', type: 'text', required: true },
apps/api/src/modules/workflow/workflow.service.ts:2348:      ], [['warehouse_review', '仓储负责人审批', 'ROLE_WMS_MGR'], ['finance_record', '财务备案', 'ROLE_FIN_ACCT']]),
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
apps/api/src/modules/procurement-v2/services/requests.service.ts:140:        warehouseCode:      it.warehouseCode,
apps/api/src/modules/procurement-v2/services/requests.service.ts:140:        warehouseCode:      it.warehouseCode,
apps/api/src/modules/data-quality/services/dict-health.service.ts:42:    'INV_INBOUND_TYPE', 'INV_OUTBOUND_TYPE', 'INV_TRANSFER_REASON',
apps/api/src/modules/procurement-v2/services/init.service.ts:59:      'warehouse_code', 'remark',
apps/api/src/modules/procurement-v2/services/init.service.ts:96:      'receipt_no', 'po_no*', 'receipt_date*', 'warehouse_code',
apps/api/src/modules/procurement-v2/services/init.service.ts:604:        warehouseCode: String(row['warehouse_code']  ?? '') || undefined,
apps/api/src/modules/procurement-v2/services/init.service.ts:59:      'warehouse_code', 'remark',
apps/api/src/modules/procurement-v2/services/init.service.ts:96:      'receipt_no', 'po_no*', 'receipt_date*', 'warehouse_code',
apps/api/src/modules/procurement-v2/services/init.service.ts:604:        warehouseCode: String(row['warehouse_code']  ?? '') || undefined,
apps/api/src/modules/data-quality/services/traceability-health.service.ts:20: *   batch → ledger(INBOUND) → 元数据中的 source_house/flock → brd_houses.farm_code → brd_farms
apps/api/src/modules/procurement-v2/services/orders.service.ts:169:        warehouseCode: it.warehouseCode,
apps/api/src/modules/procurement-v2/services/orders.service.ts:455:          warehouseCode: ri.warehouseCode,
apps/api/src/modules/procurement-v2/services/orders.service.ts:169:        warehouseCode: it.warehouseCode,
apps/api/src/modules/procurement-v2/services/orders.service.ts:455:          warehouseCode: ri.warehouseCode,
apps/api/src/modules/data-quality/services/master-data-health.service.ts:28: *                brd_farms / brd_houses / brd_flocks / wms_warehouses / fin_cash_accounts / bank_accounts
apps/api/src/modules/data-quality/services/master-data-health.service.ts:58:      { tbl: 'wms_warehouses',  codeField: 'warehouse_code',nameField: 'warehouse_name',extra: [] },
apps/api/src/modules/procurement/procurement.service.ts:262:          `INSERT INTO inv_batches (batch_no, product_code, qty, warehouse_code, location_code)
apps/api/src/modules/procurement/procurement.service.ts:264:          [batchNo, item.product_code, item.qty, item.warehouse || 'WH-B', 'INBOUND-TMP'],
apps/api/src/modules/procurement/procurement.service.ts:322:        `SELECT * FROM wms_inbound WHERE source_po_no = $1`, [poNo],
apps/api/src/modules/data-quality/services/code-governance.service.ts:43:      { domain: 'INV', table: 'wms_inbound',     field: 'inbound_no',    pattern: '^WI[-_]?[A-Z0-9]+$' },
apps/api/sr
```
