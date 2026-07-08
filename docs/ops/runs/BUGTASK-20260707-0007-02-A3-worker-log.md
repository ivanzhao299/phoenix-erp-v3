# Agent Worker Log

| Field | Value |
| --- | --- |
| Task ID | BUGTASK-20260707-0007-02-A3 |
| Agent | A3-Backend-Critical-Path |
| Dry run | No |
| Exit code | 0 |

## Command

```bash
/usr/local/bin/node scripts/ops/run-agent-task.mjs --agent A3-Backend-Critical-Path --worktree /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path --prompt docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md --task-contract docs/ops/runs/BUGTASK-20260707-0007-02-A3-contract.md --assembled-prompt-output docs/ops/runs/BUGTASK-20260707-0007-02-A3-worker-assembled-prompt.md --require-approval-token APPROVE_AGENT_EXECUTION --skip-baseline-autopilot --allow-ops-runtime-dirty
```

## Stdout

```text
Agent: A3-Backend-Critical-Path
Worktree: /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
Branch: w5-a3-backend-critical-path
Prompt: docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md
Task contract: docs/ops/runs/BUGTASK-20260707-0007-02-A3-contract.md
Assembled prompt: docs/ops/runs/BUGTASK-20260707-0007-02-A3-worker-assembled-prompt.md
Assembled prompt chars: 29720
Codex command: codex exec -C /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path --sandbox workspace-write -
Codex timeout ms: 600000
Run log: /Users/mac/phoenix-erp-worktrees/codex-orchestrator/docs/ops/runs/2026-07-08T06-16-15-499Z-A3-Backend-Critical-Path.md
PASS / GO for A3 backend.

Completed and committed locally:

- Commit: `1eeefc33 test: bug-20260707-0007 wms location crud route`
- Added regression coverage in [generic-crud.controller.spec.ts](/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path/apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts) proving `PUT /api/crud/wms_locations/:id` resolves by `location_code`.
- Updated the backend report in [BUG-20260707-0007_A3_BACKEND_CRITICAL_PATH_REPORT.md](/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path/docs/ops/BUG-20260707-0007_A3_BACKEND_CRITICAL_PATH_REPORT.md).

Validation run:

- `apps/api ./node_modules/.bin/jest src/modules/generic-crud/generic-crud.service.spec.ts src/modules/generic-crud/generic-crud.controller.spec.ts --runInBand` → 2 suites passed, 23 tests passed
- `apps/api ./node_modules/.bin/tsc --noEmit` → 0 errors

Frozen items respected: no migrations, no schema/entity/table/column changes, no database writes, no deploy, no push, no frontend changes. Worktree is clean.
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
session id: 019f405c-b955-7680-9411-d9d1590bb2a7
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

Source bug: BUG-20260707-0007
Source repair task: BUGTASK-20260707-0007
Assigned agent: A3-Backend-Critical-Path

## Issue

库位管理新增库位时需要选择库区，库区管理界面没有新增库区的功能

## Route

/warehouse/locations

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "url": "https://erp.eggslao.com/warehouse/locations",
  "bugNo": "BUG-20260707-0007",
  "route": "/warehouse/locations",
  "title": "库位管理新增库位时需要选择库区，库区管理界面没有新增库区的功能",
  "taskNo": "BUGTASK-20260707-0007",
  "context": {
    "attachments": [
      {
        "sha256": "4515cfa5e4580183468939217062ca1216e0d46f92fcf0604b74a7a9727124be",
        "fileName": "01-1783387884409-e59460b2.png",
        "mimeType": "image/png",
        "sizeBytes": 374361,
        "originalName": "pasted-screenshot-1783387763821-1.png",
        "relativePath": "storage/bug-reports/2026/07/07/BUG-20260707-0007/01-1783387884409-e59460b2.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260707-0007/attachments/01-1783387884409-e59460b2.png"
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
      "capturedAt": "2026-07-07T01:31:24.410Z",
      "pageSnapshot": {
        "route": "/warehouse/locations",
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
          "仓库看板",
          "成品批次",
          "库存来源模式",
          "入库管理",
          "出库管理",
          "调拨管理",
          "盘点管理",
          "库存台账",
          "库存查询",
          "临期预警",
          "日结对账",
          "报损管理",
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
          "日生产日报",
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
          "pasted-screenshot-1783387763821-1.png",
          "退出",
          "仓储管理",
          "/库位管理",
          "/",
          "·仓库货位档案维护 · 合计 0 个库位",
          "·",
          "100%",
          "区",
          "1/1 已用",
          "容量 1,000",
          "库位编码",
          "库位名称",
          "仓库",
          "库区",
          "站点",
          "容量枚",
          "使用率",
          "状态",
          "站点编码",
          "操作",
          "CS-0000001",
          "测试区1排1层",
          "LPH_MS_EGG_FARM",
          "ALL",
          "1,000",
          "65%",
          "在用",
          "编辑 删除",
          "01:00"
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
            "path": ".sidebar-module__C8A-ya__groupHeader.sidebar-module__C8A-ya__groupActive",
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
            "path": ".sidebar-module__C8A-ya__subItem.sidebar-module__C8A-ya__subActive",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 309
            },
            "label": "仓库看板",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 341
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
              "y": 373
            },
            "label": "库存来源模式",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 405
            },
            "label": "入库管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 437
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
              "y": 469
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
              "y": 501
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
              "y": 533
            },
            "label": "库存台账",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 565
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
              "y": 597
            },
            "label": "临期预警",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 629
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
              "y": 661
            },
            "label": "报损管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 693
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
              "y": 725
            },
            "label": "库区管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.sidebar-module__C8A-ya__subActive",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 757
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
              "y": 789
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
              "y": 827
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
              "y": 865
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
              "y": 903
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
              "y": 941
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
              "y": 979
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
              "y": 1017
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
              "y": 1055
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
              "y": 1093
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
              "y": 1131
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
              "y": 1169
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
            "label": "在线 0",
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
            "label": "99+",
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
              "x": 766,
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
            "tag": "button",
            "path": "",
            "rect": {
              "h": 36,
              "w": 83,
              "x": 1377,
              "y": 88
            },
            "label": "刷新",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 36,
              "w": 108,
              "x": 1468,
              "y": 88
            },
            "label": "新增库位",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 39,
              "w": 1062,
              "x": 244,
              "y": 473
            },
            "label": "搜索库位编码名称",
            "disabled": false
          },
          {
            "tag": "select",
            "path": "",
            "rect": {
              "h": 39,
              "w": 130,
              "x": 1316,
              "y": 473
            },
            "label": "全部库区",
            "disabled": false
          },
          {
            "tag": "select",
            "path": "",
            "rect": {
              "h": 39,
              "w": 120,
              "x": 1456,
              "y": 473
            },
            "label": "全部状态 空闲 在用 锁定 已满",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 27,
              "w": 62,
              "x": 1378,
              "y": 590
            },
            "label": "编辑",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 27,
              "w": 62,
              "x": 1446,
              "y": 590
            },
            "label": "删除",
            "disabled": false
          }
        ]
      },
      "devicePixelRatio": 2
    },
    "consoleErrors": [
      {
        "type": "unhandledrejection",
        "stack": "Error: Record not found\n    at c (https://erp.eggslao.com/_next/static/chunks/0-1cw0ignuk_a.js:1:12620)\n    at h (https://erp.eggslao.com/_next/static/chunks/0-1cw0ignuk_a.js:1:13861)\n    at async ea (https://erp.eggslao.com/_next/static/chunks/0f49x_3g~736r.js:1:30008)",
        "message": "Record not found",
        "timestamp": "2026-07-07T01:25:45.550Z"
      },
      {
        "type": "unhandledrejection",
        "stack": "Error: Record not found\n    at c (https://erp.eggslao.com/_next/static/chunks/0-1cw0ignuk_a.js:1:12620)\n    at h (https://erp.eggslao.com/_next/static/chunks/0-1cw0ignuk_a.js:1:13861)\n    at async ea (https://erp.eggslao.com/_next/static/chunks/0f49x_3g~736r.js:1:30008)",
        "message": "Record not found",
        "timestamp": "2026-07-07T01:25:53.210Z"
      },
      {
        "type": "unhandledrejection",
        "stack": "Error: Record not found\n    at c (https://erp.eggslao.com/_next/static/chunks/0-1cw0ignuk_a.js:1:12620)\n    at h (https://erp.eggslao.com/_next/static/chunks/0-1cw0ignuk_a.js:1:13861)\n    at async ea (https://erp.eggslao.com/_next/static/chunks/0f49x_3g~736r.js:1:30008)",
        "message": "Record not found",
        "timestamp": "2026-07-07T01:26:14.837Z"
      },
      {
        "type": "unhandledrejection",
        "stack": "Error: Record not found\n    at c (https://erp.eggslao.com/_next/static/chunks/0-1cw0ignuk_a.js:1:12620)\n    at h (https://erp.eggslao.com/_next/static/chunks/0-1cw0ignuk_a.js:1:13861)\n    at async et (https://erp.eggslao.com/_next/static/chunks/0f49x_3g~736r.js:1:30090)",
        "message": "Record not found",
        "timestamp": "2026-07-07T01:26:20.014Z"
      },
      {
        "type": "unhandledrejection",
        "stack": "Error: Record not found\n    at c (https://erp.eggslao.com/_next/static/chunks/0-1cw0ignuk_a.js:1:12620)\n    at h (https://erp.eggslao.com/_next/static/chunks/0-1cw0ignuk_a.js:1:13861)\n    at async et (https://erp.eggslao.com/_next/static/chunks/0f49x_3g~736r.js:1:30090)",
        "message": "Record not found",
        "timestamp": "2026-07-07T01:26:21.604Z"
      }
    ],
    "failedRequests": [
      {
        "url": "/api/farm-device/cabins/daily-report/generate",
        "method": "POST",
        "status": 404,
        "requestId": "",
        "timestamp": "2026-07-07T01:13:04.022Z",
        "responseExcerpt": "{\"code\":404,\"message\":\"Cannot POST /api/farm-device/cabins/daily-report/generate\",\"error\":\"Not Found\",\"statusCode\":404}"
      },
      {
        "url": "/api/crud/wms_locations/undefined",
        "method": "PUT",
        "status": 400,
        "requestId": "",
        "timestamp": "2026-07-07T01:25:45.546Z",
        "responseExcerpt": "{\"code\":400,\"message\":\"Record not found\",\"error\":\"Bad Request\",\"statusCode\":400}"
      },
      {
        "url": "/api/crud/wms_locations/undefined",
        "method": "PUT",
        "status": 400,
        "requestId": "",
        "timestamp": "2026-07-07T01:25:53.206Z",
        "responseExcerpt": "{\"code\":400,\"message\":\"Record not found\",\"error\":\"Bad Request\",\"statusCode\":400}"
      },
      {
        "url": "/api/crud/wms_locations/undefined",
        "method": "PUT",
        "status": 400,
        "requestId": "",
        "timestamp": "2026-07-07T01:26:14.832Z",
        "responseExcerpt": "{\"code\":400,\"message\":\"Record not found\",\"error\":\"Bad Request\",\"statusCode\":400}"
      },
      {
        "url": "/api/crud/wms_locations/undefined",
        "method": "PUT",
        "status": 400,
        "requestId": "",
        "timestamp": "2026-07-07T01:26:20.011Z",
        "responseExcerpt": "{\"code\":400,\"message\":\"Record not found\",\"error\":\"Bad Request\",\"statusCode\":400}"
      },
      {
        "url": "/api/crud/wms_locations/undefined",
        "method": "PUT",
        "status": 400,
        "requestId": "",
        "timestamp": "2026-07-07T01:26:21.603Z",
        "responseExcerpt": "{\"code\":400,\"message\":\"Record not found\",\"error\":\"Bad Request\",\"statusCode\":400}"
      }
    ],
    "localEvidence": {
      "localAttachments": [
        {
          "fileName": "01-1783387884409-e59460b2.png",
          "sourceEndpoint": "/api/bug-intake/reports/BUG-20260707-0007/attachments/01-1783387884409-e59460b2.png",
          "downloadError": "GET /api/bug-intake/reports/BUG-20260707-0007/attachments/01-1783387884409-e59460b2.png failed HTTP 404: {\"code\":404,\"message\":\"附件文件不存在\",\"error\":\"Not Found\",\"statusCode\":404}"
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
    "source_bug_no": "BUG-20260707-0007",
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
    "source_repair_task_no": "BUGTASK-20260707-0007"
  },
  "createdAt": "2026-07-08T01:16:02.803Z",
  "createdBy": "admin",
  "moduleCode": "____",
  "suggestedOwner": "_____",
  "redispatchCount": 1,
  "timeoutRecovery": {},
  "repairGuardrails": {
    "autoRepairExecuted": false,
    "noProductionDeploy": true,
    "noDbWriteWithoutGate": true,
    "requiresHumanApproval": true
  },
  "latestAgentResult": {},
  "redispatchHistory": [
    {
      "mode": "REQUEUE",
      "note": "管理员要求按原 Agent 计划重新派发。",
      "redispatchNo": 1,
      "approvalScope": "仅允许按当前 Agent 修复计划写入本地任务队列；不自动部署、不写数据库、不执行 migration。",
      "previousStatus": "TRIAGED",
      "redispatchedAt": "2026-07-08T06:07:33.747Z",
      "redispatchedBy": "admin",
      "selectedAgents": [
        "A2-Security-Regression-Gate",
        "A3-Backend-Critical-Path",
        "A4-Frontend-UAT-Smoke",
        "A5-Data-Readiness",
        "A1-CI-Runtime-Gate"
      ],
      "previousRepairTaskStatus": "AGENT_APPROVED"
    }
  ],
  "acceptanceCriteria": "新增库位的时候选择库区可以查询到已新增的库区",
  "agentPlanGeneratedAt": "2026-07-08T01:16:03.775Z",
  "agentPlanGeneratedBy": "admin",
  "agentExecutionApproval": {
    "approved": true,
    "approvedAt": "2026-07-08T06:07:33.747Z",
    "approvedBy": "admin",
    "redispatch": true,
    "approvalScope": "仅允许按当前 Agent 修复计划写入本地任务队列；不自动部署、不写数据库、不执行 migration。",
    "redispatchCount": 1,
    "forbiddenActions": [
      "production deploy without separate approval",
      "database write without separate gate",
      "migration execution without separate gate",
      "push without release approval",
      "force push"
    ]
  },
  "previousAgentResultsBeforeRedispatch": []
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
我先做合约要求的环境检查；如果目录、分支或工作区状态不符合，就停下来只出诊断。
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
bbd33f30 (HEAD -> w5-a3-backend-critical-path, main) docs(ops): record baseline lifecycle report
96208ffb (w5-a4-frontend-uat-smoke) docs(ops): record baseline lifecycle report
c5acfda7 docs: update bug 20260707 0010 a4 report
2638d9f3 docs(ops): record baseline lifecycle report
6ea9f556 docs(ops): record baseline lifecycle report
e61e118d fix: bug-20260708-0001 align inbound inventory query
0b5b0c19 docs(ops): record baseline lifecycle report
5c0dcdaf feat(web): record A4-Frontend-UAT-Smoke result

exec
/bin/zsh -lc 'git status --short' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
codex
环境检查通过：当前在指定 worktree 和分支，工作区干净。现在只读诊断仓库/库区/库位相关后端路由，判断这个 bug 是否落在 A3 后端范围内。
exec
/bin/zsh -lc 'find docs/ops -maxdepth 1 -type f | sort | tail -40' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
docs/ops/STORE_PAYMENT_CONTROLLED_PILOT_RELEASE_DECISION.md
docs/ops/STORE_PAYMENT_CONTROLLED_UAT_SMOKE_REPORT.md
docs/ops/STORE_PAYMENT_FAST_TRACK_PILOT_EXECUTION_REPORT.md
docs/ops/STORE_PAYMENT_FILE_METADATA_ACL_GATE_REPORT.md
docs/ops/STORE_PAYMENT_GITHUB_STAGING_SECRETS_SETUP_FROM_SERVER_CARD.md
docs/ops/STORE_PAYMENT_MENU_ROLE_REGISTRATION_PLAN.md
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
docs/ops/bug-20260707-0002-a4-frontend-uat-smoke.md
docs/ops/bug-20260707-0009-a3-backend-critical-path.md
docs/ops/bug-20260707-0009-a4-frontend-uat-report.md
docs/ops/bug-20260707-0010-a3-backend-critical-path.md

exec
/bin/zsh -lc 'rg --files apps/api/src | rg "(wms|warehouse|crud|zone|location)"' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
apps/api/src/modules/finance-v2/entities/fin-ar-receipt-allocation.entity.ts
apps/api/src/modules/procurement-v2/entities/prc2-payment-allocation.entity.ts
apps/api/src/modules/procurement-v2/dto/payment-allocation.dto.ts
apps/api/src/modules/org/entities/sys-user-warehouse-scope.entity.ts
apps/api/src/modules/wms/entities/wms-location.entity.ts
apps/api/src/modules/wms/entities/wms-stock-ledger.entity.ts
apps/api/src/modules/wms/entities/wms-stock-balance.entity.ts
apps/api/src/modules/wms/inventory.controller.ts
apps/api/src/modules/wms/wms.service.ts
apps/api/src/modules/wms/inventory/inventory.service.spec.ts
apps/api/src/modules/wms/inventory/inventory.service.ts
apps/api/src/modules/wms/outbound.controller.ts
apps/api/src/modules/wms/inbound.controller.ts
apps/api/src/modules/wms/wms.module.ts
apps/api/src/modules/generic-crud/generic-crud.controller.ts
apps/api/src/modules/generic-crud/generic-crud.service.ts
apps/api/src/modules/generic-crud/generic-crud.module.ts
apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts
apps/api/src/modules/generic-crud/generic-crud.service.spec.ts
apps/api/src/modules/generic-crud/crud.constants.ts

exec
/bin/zsh -lc "rg -n \"wms_zones|wms_locations|Warehouse|Zone|Location|crud/wms\" apps/api/src docs -g '"'!node_modules'"'" in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
docs/g9-business-mapping.md:52:| warehouse_code | SITE-MENGSAI-LAYER | ✓ WarehouseSelector | ✓ |
apps/api/src/modules/procurement-v2/services/receipts.service.ts:150:      this.scopeHelper.assertWritableWarehouse(dto.warehouseCode, '采购收货单');
apps/api/src/modules/procurement-v2/services/receipts.service.ts:224:      this.scopeHelper.assertWritableWarehouse(rcp.warehouseCode, '采购收货单');
apps/api/src/modules/procurement-v2/services/receipts.service.ts:321:      this.scopeHelper.assertWritableWarehouse(rcp.warehouseCode, '采购收货单');
docs/master-data-phase3-audit.md:328:| `wms_locations` / `wms_stock_balance` 旧库存 | legacy | 被 inv_batches/inv_ledger 替代 | C：冻结（旧库存数据历史归档） |
docs/master-data-phase3-audit.md:383:- `wms_stock_balance` / `wms_locations` — 确认无历史报表需求后可归档
docs/g55d-master-data-governance-finalization.md:127:DataScope 4 维度（Company / Project / Warehouse / Farm）已在 G4-D + G4-E 完整建立：
docs/g55d-master-data-governance-finalization.md:128:- `sys_user_orgs` ←  组织树派生 Company/Project/Warehouse
docs/procurement-ui-template-audit.md:61:- **`ScopedSelect` 无缓存**：明细表每行一个 WarehouseSelector → N 行 = N 个相同 `/crud/wms_warehouses` 请求；一个抽屉 5 个 Selector = 5 并发。
apps/api/src/modules/workflow/workflow-sla.service.ts:325:    const due    = row.due_at ? new Date(row.due_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' }) : '';
docs/M1_ORGANIZATION_MODEL_DECISIONS.md:100:  allowedWarehouseCodes: string[],
docs/M1_ORGANIZATION_MODEL_DECISIONS.md:122:              allowedSiteCodes / allowedWarehouseCodes 的初步集合
docs/M1_ORGANIZATION_MODEL_DECISIONS.md:128:          sys_user_warehouse_scopes → allowedWarehouseCodes 取并集
docs/g4d-inventory-governance.md:5:> 目标：库存单据主数据驱动 + 字典驱动 + 库存状态统一 + WarehouseScope 在 CompanyScope 之下 + 台账唯一性。
docs/g4d-inventory-governance.md:37:| `WarehouseSelector` | 5 张单据通用，支持按 companyCode 过滤 |
docs/g4d-inventory-governance.md:38:| `ZoneSelector` | 调拨/盘点/报损的库区，支持按 warehouseCode 过滤 |
docs/g4d-inventory-governance.md:39:| `LocationSelector` | 调拨/盘点/报损的货位，支持按 warehouseCode + zoneCode 过滤 |
docs/g4d-inventory-governance.md:72:| 入库仓库 | 文本 `<input>` | `WarehouseSelector` | A |
docs/g4d-inventory-governance.md:83:| 出库仓库 | 文本 `<input>` | `WarehouseSelector` | A |
docs/g4d-inventory-governance.md:92:| 调出仓库 | 文本 `<input>` | `WarehouseSelector` | A |
docs/g4d-inventory-governance.md:93:| 调出库区 *(新增)* | — | `ZoneSelector`（按 from_warehouse 过滤） | A |
docs/g4d-inventory-governance.md:94:| 调出货位 *(新增)* | — | `LocationSelector`（按 from_warehouse + from_zone 过滤） | A |
docs/g4d-inventory-governance.md:95:| 调入仓库 | 文本 `<input>` | `WarehouseSelector` | A |
docs/g4d-inventory-governance.md:96:| 调入库区 *(新增)* | — | `ZoneSelector`（按 to_warehouse 过滤） | A |
docs/g4d-inventory-governance.md:97:| 调入货位 *(新增)* | — | `LocationSelector`（按 to_warehouse + to_zone 过滤） | A |
docs/g4d-inventory-governance.md:107:| 仓库 | 文本 `<input>` | `WarehouseSelector` | A |
docs/g4d-inventory-governance.md:108:| 库区 *(新增)* | — | `ZoneSelector` | A |
docs/g4d-inventory-governance.md:109:| 货位 *(新增)* | — | `LocationSelector` | A |
docs/g4d-inventory-governance.md:118:| 报损仓库 | 文本 `<input>` | `WarehouseSelector` | A |
docs/g4d-inventory-governance.md:119:| 报损库区 | 文本 `<input>` | `ZoneSelector` | A |
docs/g4d-inventory-governance.md:120:| 报损货位 *(新增)* | — | `LocationSelector` | A |
docs/g4d-inventory-governance.md:135:| 仓库 | `wms_warehouses` | `WarehouseSelector` | ✅ allowedWarehouseCodes |
docs/g4d-inventory-governance.md:136:| 库区 | `wms_zones` | `ZoneSelector` | ✅（继承仓库） |
docs/g4d-inventory-governance.md:137:| 货位 | `wms_locations` | `LocationSelector` | ✅（继承仓库） |
docs/g4d-inventory-governance.md:182:## 4. WarehouseScope（已建立，本阶段贯通文档化）
docs/g4d-inventory-governance.md:190:| **Service** | `DataScopeService.resolve()` line 209 合并 `userWhRepo` → `allowedWarehouseCodes` ✅ |
docs/g4d-inventory-governance.md:192:| **前端 Selector** | `WarehouseSelector` 通过 `/api/crud/wms_warehouses?status=ACTIVE`（generic-crud 按 storeCode 隔离） ✅ |
docs/g4d-inventory-governance.md:200:├── allowedWarehouseCodes (WarehouseScope ←  sys_user_orgs.warehouse_code
docs/g4d-inventory-governance.md:206:- `allowedWarehouseCodes` 与 `allowedCompanyCodes` 同层存储；二者**取交集**才是用户实际可见仓库范围
docs/g4d-inventory-governance.md:217:> - allowedWarehouseCodes = ['MS01', 'DP01', 'FZK01']
docs/g4d-inventory-governance.md:219:业务侧服务读取 CLS `dataScope.allowedWarehouseCodes` 即可对 `wms_inbound/outbound/transfer/stocktake/loss-report` 做 `WHERE warehouse_code IN (...)` 过滤。
docs/g4d-inventory-governance.md:291:| 4 | WarehouseScope 是否建立 | **✅ 已建立**（表 / Entity / Service / Guard 端到端就位，本阶段文档化） |
docs/g4d-inventory-governance.md:304:| 仓库/库区/货位全部主数据化 | ✅ 5 张单据 100% 由 WarehouseSelector/ZoneSelector/LocationSelector 接管 |
docs/g4d-inventory-governance.md:307:| WarehouseScope 建立 | ✅ 端到端已就位 |
docs/g4d-inventory-governance.md:331:2. WarehouseScope 端到端就绪并文档化
docs/g4b-procurement-document-runtime-refactor.md:37:| `WarehouseSelector` | `/api/crud/wms_warehouses?status=ACTIVE` | `warehouse_code` | `companyCode` |
docs/g4b-procurement-document-runtime-refactor.md:38:| `ZoneSelector` | `/api/crud/wms_zones?status=ACTIVE` | `zone_code` | `warehouseCode` |
docs/g4b-procurement-document-runtime-refactor.md:39:| `LocationSelector` | `/api/crud/wms_locations?status=ACTIVE` | `location_code` | `warehouseCode`、`zoneCode` |
docs/g4b-procurement-document-runtime-refactor.md:101:> 已在 `MasterDataSelectors.tsx` 提供 `ZoneSelector` / `LocationSelector`，后续如扩展明细字段可即插即用。
docs/g4b-procurement-document-runtime-refactor.md:134:| 仓库 | `wms_warehouses` | `WarehouseSelector` | `/api/crud/wms_warehouses?status=ACTIVE` |
docs/g4b-procurement-document-runtime-refactor.md:135:| 库区 / 货位 | `wms_zones` / `wms_locations` | `ZoneSelector` / `LocationSelector` | `/api/crud/wms_zones`、`/api/crud/wms_locations` |
docs/g4b-procurement-document-runtime-refactor.md:185:| 采购申请 PR | Company / Project / Warehouse / Supplier(转单) / SKU | 5/5 ✅ |
docs/g4b-procurement-document-runtime-refactor.md:186:| 采购订单 PO | Company / Project / Supplier / Warehouse / SKU | 5/5 ✅ |
docs/g4b-procurement-document-runtime-refactor.md:187:| 采购收货 GR | Warehouse / User / SKU | 3/3 ✅ |
docs/g4b-procurement-document-runtime-refactor.md:231:| 采购退货 | 控制器/页面均无；与现有 `procurement-v2` 模块无对应实体 | 列入 **G4-D Procurement Lifecycle Extension**：复用 GR 的 SkuSelector + WarehouseSelector + DictSelect(退货原因 `PRC_RETURN_REASON`) |
docs/g4b-procurement-document-runtime-refactor.md:235:预制 Selector（`Sku/Warehouse/Zone/Location/User`）已就位，**这 3 类单据的表单可在 1 个迭代内完成主数据驱动接入**。
docs/g4b-procurement-document-runtime-refactor.md:262:1. **复用 12 个组件**：`Company / Customer / Project / Supplier / Cash / Shareholder / Dict / Attachment / User / Warehouse / Zone / Location / Sku`。
docs/g4b-procurement-document-runtime-refactor.md:266:5. **DataScope 治理**：销售公司、销售仓库、销售渠道 均应纳入；`WarehouseSelector` 已支持 `companyCode` 过滤。
docs/uix7-product-experience-refactor.md:130:| 仓库中心详情 | 未做 | 仿 customer/supplier 写 WarehouseDetailDrawer |
docs/uix7-product-experience-refactor.md:176:| UIX8-02 | WarehouseDetailDrawer（库存 / 库龄 / 冻结 / 异常 / 出入库） | 1d |
docs/mdm-1-unified-model-design.md:246:  allowedWarehouseCodes: string[];
docs/g55a-master-data-center-full-audit.md:141:            [鸡舍 brd_houses]│   [库区 wms_zones]
docs/g55a-master-data-center-full-audit.md:143:            [鸡群 brd_flocks]│   [货位 wms_locations]
docs/g55a-master-data-center-full-audit.md:198:| `WarehouseSelector` | 8 处 | 财务/采购/销售/库存 |
docs/g55a-master-data-center-full-audit.md:320:for sel in CompanySelector CustomerSelector SupplierSelector ProjectSelector WarehouseSelector SkuSelector; do
docs/g5-data-quality-center-enhancement.md:102:**检查 4 维度**：`CompanyScope / ProjectScope / WarehouseScope / FarmScope`
docs/g5-data-quality-center-enhancement.md:198:| 3 | DataScope 风险数量 | 由 `GET /api/data-quality/datascope` 实时返回风险列表。4 维度（Company/Project/Warehouse/Farm）越权风险。**审计能力已建立** ✅ |
docs/master-data-governance-phase-g0-blueprint.md:43:| 库区 | wms_zones | 无独立页面 | **无前端维护** | 货位 | 部门 |
docs/master-data-governance-phase-g0-blueprint.md:44:| 货位 | wms_locations | 无独立页面 | **无前端维护** | 库存 | 部门 |
docs/master-data-governance-phase-g0-blueprint.md:274:| `WarehouseSelector` | `/api/crud/wms_warehouses` | ✅ company_code | — |
docs/ERP_BUSINESS_AGENT_AUDIT.md:26:2. ⚠️ **`store_code` 一词三义**:`mst_stores.store_code`(门店)、`inv_batches.store_code`(库存所属公司)、`wms_locations.store_code`(默认 ALL),后续主数据治理必须先约定语义
docs/ERP_BUSINESS_AGENT_AUDIT.md:29:5. ⚠️ **DataScope 三层覆盖不齐**:仅 `allowedCompanyCodes` 完整覆盖;`allowedProjectCodes` / `allowedWarehouseCodes` 在 sales-v2 / store-pos 多处缺失
docs/ERP_BUSINESS_AGENT_AUDIT.md:123:3. 🟡 **DataScope 单层**:仅 `allowedCompanyCodes`,无 `allowedProjectCodes` / `allowedWarehouseCodes`,跨公司隔离全靠 Guard 中间件
docs/ERP_BUSINESS_AGENT_AUDIT.md:139:- `wms_zones` — `warehouse_code`
docs/ERP_BUSINESS_AGENT_AUDIT.md:140:- `wms_locations` — `warehouse_code` / `zone_code` / `store_code`(默认 `ALL`)
docs/ERP_BUSINESS_AGENT_AUDIT.md:179:   - `wms_locations.store_code`:默认值 `'ALL'`
docs/ERP_BUSINESS_AGENT_AUDIT.md:186:7. 🟡 **DataScope 降至 Controller 层**:Service(尤其 POS FIFO)无 `allowedWarehouseCodes` 强制过滤
docs/ERP_BUSINESS_AGENT_AUDIT.md:216:| `/procurement2/requests` | Company / Project / Warehouse | `PRC_PURCHASE_TYPE` / `PRC_URGENCY` / `SYS_CURRENCY` | ❌ |
docs/ERP_BUSINESS_AGENT_AUDIT.md:217:| `/procurement2/receipts` | Warehouse / User / Material | `PRC_QUALITY_STATUS` / `SYS_COUNTRY` | ❌ |
docs/ERP_BUSINESS_AGENT_AUDIT.md:219:| `/procurement2/orders` | Company / Warehouse / Supplier | — | ✅ |
docs/ERP_BUSINESS_AGENT_AUDIT.md:234:| `/crud/wms_zones` / `/crud/wms_locations` | 257 / 275 | **绕过 lookup,直接 crud**,每次 `pageSize=500` 全拉 |
docs/ERP_BUSINESS_AGENT_AUDIT.md:250:4. 🟡 **`/crud/wms_zones` / `/crud/wms_locations` 绕过 lookup**:无缓存、无 DataScope hint,每次 500 条全拉
docs/ERP_BUSINESS_AGENT_AUDIT.md:296:13. `/lookup/companies` 端点补 DataScope;`/crud/wms_zones` 端点改用 `/lookup/*` 形态
docs/glp1-go-live-preparation.md:17:  · 权限准备度：       60（Company/Org Scope 已配 / Warehouse/Project Scope 表 0 行）
docs/glp1-go-live-preparation.md:123:| WarehouseScope   | sys_user_warehouse_scopes              | **0 行** | ❌ 待配 |
docs/glp1-go-live-preparation.md:138:- **WarehouseScope 0 行** → 仓库维度数据隔离未启用
docs/glp1-go-live-preparation.md:314:| 3 | 权限准备完成率 | **60%**（CompanyScope ✅，Project/Warehouse Scope 待配）|
docs/glp1-go-live-preparation.md:342:| GLP-P1-A | ProjectScope / WarehouseScope 真实授权配置 | P1 |
docs/glp1-go-live-preparation.md:358:[ ] §11 GLP-P1-A 凤凰食品下 6 pilot_ 用户的 ProjectScope/WarehouseScope 授权
apps/api/src/modules/wms/entities/wms-location.entity.ts:3:@Entity('wms_locations')
apps/api/src/modules/wms/entities/wms-location.entity.ts:4:export class WmsLocationEntity {
docs/M1_ORGANIZATION_MODEL.md:467:- 子：`wms_zones`（库区）→ `wms_locations`（货位）
docs/M1_ORGANIZATION_MODEL.md:866:  allowedWarehouseCodes: string[],
docs/M1_ORGANIZATION_MODEL.md:898:        sys_user_warehouse_scopes → allowedWarehouseCodes 取并集
apps/api/src/modules/sales-v2/services/customer-credit-scheduler.service.ts:29:  @Cron('0 0 2 * * *', { name: 'credit_daily_refresh', timeZone: 'Asia/Vientiane' })
docs/M1_ORGANIZATION_MODEL_REVIEW.md:123:| warehouse | sys_user_warehouse_scopes | `allowedWarehouseCodes` |
apps/api/src/modules/wms/wms.service.ts:21:    if (!scope || scope.isGlobal || scope.allowedWarehouseCodes.length === 0) {
apps/api/src/modules/wms/wms.service.ts:26:      params: [scope.allowedWarehouseCodes],
apps/api/src/modules/wms/wms.service.ts:30:  private assertWritableWarehouse(warehouseCode: string | null | undefined, label: string): void {
apps/api/src/modules/wms/wms.service.ts:32:    if (!scope || scope.isGlobal || scope.allowedWarehouseCodes.length === 0) return;
apps/api/src/modules/wms/wms.service.ts:36:    if (!scope.allowedWarehouseCodes.includes(warehouseCode)) {
apps/api/src/modules/wms/wms.service.ts:163:      this.assertWritableWarehouse(task.warehouse_code || null, `入库单 ${task_no}`);
apps/api/src/modules/wms/wms.service.ts:171:      const defaultWarehouse = task.warehouse_code || 'WMS-VTE-MAIN';
apps/api/src/modules/wms/wms.service.ts:187:        const warehouseCode = item.warehouse_code || item.warehouse || defaultWarehouse;
apps/api/src/modules/wms/wms.service.ts:188:        this.assertWritableWarehouse(warehouseCode, `入库明细 ${baseBatchNo}`);
apps/api/src/modules/wms/wms.service.ts:272:    this.assertWritableWarehouse(warehouseCode, `采购收货 ${ctx.refNo}`);
apps/api/src/modules/wms/wms.service.ts:393:          this.assertWritableWarehouse(batch.warehouse_code, `出库批次 ${it.batch_no}`);
apps/api/src/modules/wms/wms.service.ts:549:      this.assertWritableWarehouse(rows[0].warehouse_code || null, `收货单 ${orderNo}`);
apps/api/src/modules/wms/wms.service.ts:641:    this.assertWritableWarehouse(from_warehouse, '库存调拨源仓库');
apps/api/src/modules/wms/wms.service.ts:642:    this.assertWritableWarehouse(to_warehouse, '库存调拨目标仓库');
apps/api/src/modules/wms/wms.service.ts:672:        this.assertWritableWarehouse(src.warehouse_code, `调拨源批次 ${it.batch_no}`);
apps/api/src/modules/wms/wms.service.ts:724:        this.assertWritableWarehouse(stocktakeRows[0].warehouse_code || null, `盘点单 ${stocktake_no}`);
apps/api/src/modules/wms/wms.service.ts:738:        this.assertWritableWarehouse(batchRows[0].warehouse_code, `盘点批次 ${batch_no}`);
apps/api/src/modules/wms/wms.service.ts:765:   * 仅在仓库可写范围内执行（assertWritableWarehouse）；批次不存在/非数则跳过并回报。
apps/api/src/modules/wms/wms.service.ts:790:        this.assertWritableWarehouse(b.warehouse_code, `盘点批次 ${batchNo}`);
apps/api/src/modules/wms/wms.service.ts:911:        this.assertWritableWarehouse(lossRows[0].warehouse_code || null, `损耗单 ${loss_no}`);
apps/api/src/modules/wms/wms.service.ts:925:        this.assertWritableWarehouse(batchRows[0].warehouse_code, `损耗批次 ${batch_no}`);
apps/api/src/modules/sales-v2/services/egg-inventory-scheduler.service.ts:32:    timeZone: 'Asia/Vientiane',
docs/g4c-sales-runtime-refactor.md:119:| 仓库 | `wms_warehouses` | `WarehouseSelector` | `/api/crud/wms_warehouses` |
docs/g4c-sales-runtime-refactor.md:235:- `Company / Warehouse / Zone / Location / Sku / Project / User` ← 直接落表
docs/g4c-sales-runtime-refactor.md:256:- **库存按 company + warehouse 双维度过滤**：`WarehouseSelector` 已支持 `companyCode` 过滤，可直接复用
apps/api/src/modules/wms/inventory/inventory.service.ts:16:  private assertWritableWarehouse(warehouseCode: string | null | undefined, label: string): void {
apps/api/src/modules/wms/inventory/inventory.service.ts:18:    if (!scope || scope.isGlobal || scope.allowedWarehouseCodes.length === 0) return;
apps/api/src/modules/wms/inventory/inventory.service.ts:22:    if (!scope.allowedWarehouseCodes.includes(warehouseCode)) {
apps/api/src/modules/wms/inventory/inventory.service.ts:41:    this.assertWritableWarehouse(dto.warehouse_code, '库存扣减');
apps/api/src/modules/wms/inventory/inventory.service.ts:112:    this.assertWritableWarehouse(dto.warehouse_code, '库存入库');
docs/g5-b-lookup-unified.md:21:| `GET /api/lookup/warehouses?companyCode=` | wms_warehouses | `/crud/wms_warehouses` |
docs/g5-b-lookup-unified.md:38:- `WarehouseSelector` → `/lookup/warehouses?companyCode=`
docs/g5-b-lookup-unified.md:51:- `ZoneSelector / LocationSelector` — 维度二级过滤；后续 G5-B++ 可加 `/lookup/zones?warehouseCode=` 等
apps/api/src/modules/wms/wms.module.ts:8:import { WmsLocationEntity } from './entities/wms-location.entity';
apps/api/src/modules/wms/wms.module.ts:20:      WmsLocationEntity,
docs/g197-real-drift-investigation.md:20:| `wms_locations` | 0 | 0 | 15 | — |
docs/W5_READINESS_REVIEW.md:179:| **store_code 一词三义现状**（inv_batches.store_code / wms_locations.store_code='ALL' / mst_stores.store_code）| 🔴 未拆 | 5 | 0 |
apps/api/src/modules/product-master/controllers/lookup.controller.ts:58:        warehouseCodes: scope.allowedWarehouseCodes ?? [],
apps/api/src/modules/generic-crud/generic-crud.controller.ts:27:    'wms_zones',
apps/api/src/modules/generic-crud/generic-crud.controller.ts:28:    'wms_locations',
apps/api/src/modules/generic-crud/generic-crud.controller.ts:245:  private async assertWmsInboundWarehouseScope(warehouseCode: string | null, req: any, taskNo: string): Promise<void> {
apps/api/src/modules/generic-crud/generic-crud.controller.ts:257:    if (!scope.allowedWarehouseCodes.includes(warehouseCode)) {
apps/api/src/modules/generic-crud/generic-crud.controller.ts:271:    await this.assertWmsInboundWarehouseScope(warehouseCode || null, req, taskNo);
apps/api/src/modules/generic-crud/generic-crud.controller.ts:348:      'wms_warehouses', 'wms_zones', 'wms_locations',
apps/api/src/modules/generic-crud/generic-crud.controller.ts:378:      const data = await this.crudService.findAllInventoryScoped(table, query, scope.allowedWarehouseCodes);
apps/api/src/modules/generic-crud/generic-crud.controller.ts:527:    wms_locations:    'location_code',
apps/api/src/modules/generic-crud/generic-crud.controller.ts:528:    wms_zones:        'zone_code',
apps/api/src/modules/generic-crud/generic-crud.service.ts:8:    wms_locations: 'location_code',
apps/api/src/modules/generic-crud/generic-crud.service.ts:9:    wms_zones: 'zone_code',
apps/api/src/modules/generic-crud/generic-crud.service.ts:57:        'wms_warehouses', 'wms_locations',
apps/api/src/modules/generic-crud/generic-crud.service.ts:1084:        // ── 仓储补充（wms_zones/wms_transfer/wms_stock_transfers） ──────
apps/api/src/modules/generic-crud/generic-crud.service.ts:1085:        `CREATE TABLE IF NOT EXISTS wms_zones (
apps/api/src/modules/generic-crud/generic-crud.service.ts:1094:        `ALTER TABLE wms_zones ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:1095:        // B5: wms_zones 加 warehouse_code 与 wms_warehouses 关联（旧 warehouse 列已不再使用）
apps/api/src/modules/generic-crud/generic-crud.service.ts:1096:        `ALTER TABLE wms_zones ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(50)`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:1098:        `UPDATE wms_zones SET warehouse_code = warehouse WHERE warehouse_code IS NULL AND warehouse IS NOT NULL`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:1989:        { code: 'ROLE_WH_CLERK',        nameZh: '仓管员',      nameEn: 'Warehouse Clerk'      },
apps/api/src/modules/generic-crud/generic-crud.service.ts:2270:  async findAllInventoryScoped(table: 'inv_batches' | 'inv_ledger', query: any, allowedWarehouseCodes: string[] | null) {
apps/api/src/modules/generic-crud/generic-crud.service.ts:2274:    if (allowedWarehouseCodes !== null) {
apps/api/src/modules/generic-crud/generic-crud.service.ts:2275:      if (allowedWarehouseCodes.length === 0) {
apps/api/src/modules/generic-crud/generic-crud.service.ts:2279:        extraValues.push(allowedWarehouseCodes);
apps/api/src/modules/generic-crud/generic-crud.service.ts:2290:        extraValues.push(allowedWarehouseCodes);
docs/non-v2-functional-audit.md:58:| 3 | `/warehouse` | `wms/` | `/api/crud/wms_*` + `/api/stocktake/*` | 仓储库存 | **A** |
docs/non-v2-functional-audit.md:111:**API**: `/api/crud/wms_*`、`/api/inventory/*`、`/api/stocktake/*`、`/api/inbound/*`、`/api/outbound/*`  
apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts:35:        allowedWarehouseCodes: ['WH-A', 'WH-B'],
apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts:60:      controller.findAll('wms_zones', { limit: '100', offset: '0' }, req(['MENU_WMS_INOUT:V'])),
apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts:62:    expect(svc.findAll).toHaveBeenCalledWith('wms_zones', { limit: '100', offset: '0' });
apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts:67:      controller.findAll('wms_zones', { status: 'ACTIVE', pageSize: '500' }, req(['MENU_WMS_MASTER:V'])),
apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts:69:    expect(svc.findAll).toHaveBeenCalledWith('wms_zones', { status: 'ACTIVE', pageSize: '500' });
apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts:74:      controller.create('wms_zones', { zone_code: 'ZONE-A', zone_name: 'A区' }, req(['MENU_WMS_MASTER:C'])),
apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts:76:    expect(svc.create).toHaveBeenCalledWith('wms_zones', {
apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts:84:      controller.create('wms_locations', { location_code: 'LOC-A-01' }, req(['MENU_WMS_INOUT:C'])),
apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts:86:    expect(svc.create).toHaveBeenCalledWith('wms_locations', {
apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts:122:      allowedWarehouseCodes: [],
apps/api/src/modules/generic-crud/generic-crud.service.spec.ts:138:      await expect(svc.findAll('wms_locations', {})).resolves.toEqual([
apps/api/src/modules/generic-crud/generic-crud.service.spec.ts:149:      await expect(svc.findAll('wms_zones', {})).resolves.toEqual([
apps/api/src/modules/generic-crud/generic-crud.service.spec.ts:160:      await expect(svc.update('wms_locations', 'location_code', 'LOC-A-01', { status: 'NORMAL' }))
apps/api/src/modules/generic-crud/generic-crud.service.spec.ts:169:      await expect(svc.update('wms_locations', 'location_code', 'missing', { status: 'NORMAL' }))
apps/api/src/modules/generic-crud/generic-crud.service.spec.ts:179:      await expect(svc.remove('wms_zones', 'zone_code', 'ZONE-A'))
apps/api/src/modules/generic-crud/generic-crud.service.spec.ts:188:      await expect(svc.remove('wms_zones', 'zone_code', 'missing'))
apps/api/src/modules/generic-crud/crud.constants.ts:12:  'wms_warehouses', 'wms_locations', 'wms_inbound', 'wms_inbound_items', 'wms_outbound', 'wms_outbound_items', 'wms_stocktake',
apps/api/src/modules/generic-crud/crud.constants.ts:13:  'wms_zones', 'wms_transfer', 'wms_stock_transfers', 'wms_suppliers',
docs/chanjet-zplus-api-catalog.md:442:| `POST` | [`/accounting/openapi/cc/inv/wareLocationOnhandqty/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/kc?id=33375) | 货位结存账查询 | 查询货位结存账 |  |
docs/g15-architecture-audit.md:104:| `/warehouse/inbound` | WarehouseSelector | `/api/lookup/warehouses` | ⚠️ wms_warehouses 0 行 → 下拉空 |
docs/g15-architecture-audit.md:125:- WarehouseSelector 支持 `type` 过滤（如 `<WarehouseSelector type="MEDICINE" />`）
docs/g15-architecture-audit.md:167:- WarehouseSelector 按 type 显示对应仓
docs/g15-architecture-audit.md:177:| B WarehouseSelector type 过滤 | 30min | 低 |
docs/g15-architecture-audit.md:191:B (30m)      WarehouseSelector 加 type 过滤
apps/api/src/modules/farm/farm-medicine.service.spec.ts:14:      assertWritableWarehouse: jest.fn(),
apps/api/src/modules/farm/farm-medicine.service.spec.ts:54:    expect(scopeHelper.assertWritableWarehouse).toHaveBeenCalledWith('MEDICINE', '药品库存');
apps/api/src/modules/farm/farm-medicine.service.spec.ts:81:    expect(scopeHelper.assertWritableWarehouse).toHaveBeenCalledWith('MEDICINE', '药品库存');
docs/g5-d-scope-typed.md:17:  allowedWarehouseCodes: string[];
apps/api/src/modules/farm/farm-medicine.service.ts:90:    this.scopeHelper.assertWritableWarehouse(WAREHOUSE, '药品库存');
apps/api/src/modules/farm/farm-medicine.service.ts:131:    this.scopeHelper.assertWritableWarehouse(WAREHOUSE, '药品库存');
docs/schema-snapshot.sql:9485:-- Name: wms_locations; Type: TABLE; Schema: public; Owner: -
docs/schema-snapshot.sql:9488:CREATE TABLE public.wms_locations (
docs/schema-snapshot.sql:9502:-- Name: wms_locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
docs/schema-snapshot.sql:9505:CREATE SEQUENCE public.wms_locations_id_seq
docs/schema-snapshot.sql:9904:-- Name: wms_zones; Type: TABLE; Schema: public; Owner: -
docs/schema-snapshot.sql:9907:CREATE TABLE public.wms_zones (
docs/schema-snapshot.sql:9920:-- Name: wms_zones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
docs/schema-snapshot.sql:9923:CREATE SEQUENCE public.wms_zones_id_seq
docs/schema-snapshot.sql:9933:-- Name: wms_zones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
docs/schema-snapshot.sql:9936:ALTER SEQUENCE public.wms_zones_id_seq OWNED BY public.wms_zones.id;
docs/schema-snapshot.sql:11400:-- Name: wms_zones id; Type: DEFAULT; Schema: public; Owner: -
docs/schema-snapshot.sql:11403:ALTER TABLE ONLY public.wms_zones ALTER COLUMN id SET DEFAULT nextval('public.wms_zones_id_seq'::regclass);
docs/schema-snapshot.sql:14181:-- Name: wms_locations wms_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
docs/schema-snapshot.sql:14184:ALTER TABLE ONLY public.wms_locations
docs/schema-snapshot.sql:14185:    ADD CONSTRAINT wms_locations_pkey PRIMARY KEY (location_code);
docs/schema-snapshot.sql:14309:-- Name: wms_zones wms_zones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
docs/schema-snapshot.sql:14312:ALTER TABLE ONLY public.wms_zones
docs/schema-snapshot.sql:14313:    ADD CONSTRAINT wms_zones_pkey PRIMARY KEY (id);
docs/schema-snapshot.sql:14317:-- Name: wms_zones wms_zones_zone_code_key; Type: CONSTRAINT; Schema: public; Owner: -
docs/schema-snapshot.sql:14320:ALTER TABLE ONLY public.wms_zones
docs/schema-snapshot.sql:14321:    ADD CONSTRAINT wms_zones_zone_code_key UNIQUE (zone_code);
docs/MULTI_AGENT_PHASE2_PLAN.md:30:| R0-5 | **`store_code` 一词三义 + POS 客户无 FK** | ERP §3.4 / Master §2 S1 / Master §2 S3 | `inv_batches.store_code` ≈ company_code，`wms_locations.store_code='ALL'` 兜底，跨公司采购入库直接破隔离；`sal_store_sales.customer_code` 无 `mst_customers` FK，赊销 AR 对账风险 |
docs/MULTI_AGENT_PHASE2_PLAN.md:66:- `/lookup/companies` 端点补 DataScope 与 `/crud/wms_zones` 走 lookup（ERP §4.4）
docs/g55b-g6-recovery-plan.md:281:| 多公司 / 多项目 / 多场站维度切换 | G4-D WarehouseScope + G4-E FarmScope（已就绪 ✅） |
docs/FINANCE_AGENT_AUDIT.md:217:| WarehouseSelector / SkuSelector / Driver / Vehicle / Channel | — | 财务子域不引用 |
docs/FINANCE_AGENT_AUDIT.md:254:- CLS 写入字段：`dataScope.{ isGlobal, allowedCompanyCodes, allowedProjectCodes, allowedWarehouseCodes }`（org/services/data-scope.service.ts）
docs/mdm-0-master-data-audit.md:53:| wms_zones | n/a | warehouse_code → wms_warehouses | ⚠️ wms_warehouses 空 |
docs/mdm-0-master-data-audit.md:54:| wms_locations | n/a | warehouse_code + zone_code | ⚠️ 同上 |
docs/mdm-0-master-data-audit.md:146:| `<WarehouseSelector>` | `/api/crud/wms_warehouses` | wms_warehou
```
