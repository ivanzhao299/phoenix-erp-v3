# Agent Worker Log

| Field | Value |
| --- | --- |
| Task ID | BUGTASK-20260709-0003-02-A3 |
| Agent | A3-Backend-Critical-Path |
| Dry run | No |
| Exit code | 0 |

## Command

```bash
/usr/local/bin/node scripts/ops/run-agent-task.mjs --agent A3-Backend-Critical-Path --worktree /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path --prompt docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md --task-contract docs/ops/runs/BUGTASK-20260709-0003-02-A3-contract.md --assembled-prompt-output docs/ops/runs/BUGTASK-20260709-0003-02-A3-worker-assembled-prompt.md --require-approval-token APPROVE_AGENT_EXECUTION --skip-baseline-autopilot --allow-ops-runtime-dirty
```

## Stdout

```text
Agent: A3-Backend-Critical-Path
Worktree: /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
Branch: w5-a3-backend-critical-path
Prompt: docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md
Task contract: docs/ops/runs/BUGTASK-20260709-0003-02-A3-contract.md
Assembled prompt: docs/ops/runs/BUGTASK-20260709-0003-02-A3-worker-assembled-prompt.md
Assembled prompt chars: 25803
Codex command: codex exec -C /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path --sandbox workspace-write -
Codex timeout ms: 600000
Run log: /Users/mac/phoenix-erp-worktrees/codex-orchestrator/docs/ops/runs/2026-07-09T07-46-54-009Z-A3-Backend-Critical-Path.md
PASS WITH CONDITIONS for A3.

Backend diagnosis found the repair already present: `GET /api/crud/inv_ledger` returns `change_type_label`, and `/warehouse/ledger` already prefers that label for display. I made no backend code changes; I added the required report at [BUG-20260709-0003-a3-backend-critical-path.md](/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path/docs/ops/BUG-20260709-0003-a3-backend-critical-path.md).

Validation:
- `apps/api tsc --noEmit`: PASS
- `generic-crud.service.spec.ts`: PASS, 13 tests
- `check-wms-datascope-writes.mjs`: PASS
- `check-nullable-in-unique.js`: PASS
- Web `tsc`: HOLD, local `vitest` types missing
- Integration `scope-audit.sh`: HOLD, API not running; starting it would violate no-DB-write guardrail because bootstrap contains DDL auto-repair

Committed locally only, no push/deploy:
`69586883 docs: record bug-20260709-0003 a3 report`

Worktree is clean.
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
session id: 019f45d5-561d-7e01-8cba-0b64a9f3e85c
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

Source bug: BUG-20260709-0003
Source repair task: BUGTASK-20260709-0003
Assigned agent: A3-Backend-Critical-Path

## Issue

库存管理-库存台账，事务类型一栏显示的是英文代码，需要转换成对应的中文

## Route

/warehouse/ledger

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "url": "https://erp.eggslao.com/warehouse/ledger",
  "bugNo": "BUG-20260709-0003",
  "route": "/warehouse/ledger",
  "title": "库存管理-库存台账，事务类型一栏显示的是英文代码，需要转换成对应的中文",
  "taskNo": "BUGTASK-20260709-0003",
  "context": {
    "attachments": [
      {
        "sha256": "5b496b92129338ed5f0491ec4da0dd2d8012a4dcb427a248aeb48237006cf81b",
        "fileName": "01-1783582850342-ec1f5758.png",
        "mimeType": "image/png",
        "sizeBytes": 679498,
        "originalName": "pasted-screenshot-1783582590020-1.png",
        "relativePath": "storage/bug-reports/2026/07/09/BUG-20260709-0003/01-1783582850342-ec1f5758.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260709-0003/attachments/01-1783582850342-ec1f5758.png"
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
      "capturedAt": "2026-07-09T07:40:50.346Z",
      "pageSnapshot": {
        "route": "/warehouse/ledger",
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
          "问题反馈",
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
          "pasted-screenshot-1783582590020-1.png",
          "退出",
          "·实时库存进出流水台账",
          "·",
          "共 0 条记录",
          "事务时间",
          "批次号",
          "事务类型",
          "数量变动",
          "关联单据",
          "操作员",
          "门店",
          "备注",
          "2026-06-06 15:30",
          "MED-STOCK-LPH-MED-019",
          "FARM_OUT_MEDICATION",
          "-63.000",
          "—",
          "ETL_INITIAL",
          "SITE-MENGSAI-LAYER",
          "Excel: 期初=140瓶, 6.2出=63瓶, 6.3=0(无出库), 6.4出=0, 期末=77瓶",
          "MED-STOCK-LPH-MED-021",
          "-3.800",
          "Excel: 期初=17.55公斤, 6.2出=3.8公斤, 6.3=0(无出库), 6.4出=2.5公斤, 期末=11.25公斤",
          "-2.500",
          "MED-STOCK-LPH-MED-024",
          "Excel: 期初=20.2公斤, 6.2出=3.8公斤, 6.3=0(无出库), 6.4出=2.5公斤, 期末=13.9公斤",
          "2026-07-07 01:13",
          "EGG-20260707-00001",
          "TEMP_PRODUCTION_INBOUND",
          "+1.000",
          "TEMP-2026-07-07-PROD",
          "admin",
          "ALL",
          "生产入库 product=PRD-EGG-GRADE_1 grade=GRADE_1 qty=1 expire=2026-08-06",
          "2026-07-07 01:14",
          "EGG-20260707-00002",
          "2026-07-07 01:55",
          "FARM_IN",
          "+10.000",
          "FK-MR8VGZS4M0Q",
          "金凤凰总控",
          "FACTORY",
          "日报产蛋入账 10枚",
          "+210.000",
          "日报产蛋入账 210枚",
          "2026-07-07 03:40",
          "MED-STOCK-LPH-MED-001",
          "MED_INBOUND",
          "mobile",
          "采购入库",
          "2026-07-07 03:41",
          "测试",
          "2026-07-07 03:42",
          "MED_OUTBOUND",
          "-2.000",
          "用药出库",
          "2026-07-07 03:44",
          "2026-07-07 05:53",
          "EGG-20260707-00003",
          "2026-07-07 06:04",
          "EGG-20260707-00004",
          "EGG-20260707-00005",
          "生产入库 product=PRD-EGG-GRADE_2 grade=GRADE_2 qty=1 expire=2026-08-06",
          "EGG-20260707-00006",
          "+2.000",
          "生产入库 product=PRD-EGG-GRADE_3 grade=GRADE_3 qty=2 expire=2026-08-06",
          "EGG-20260707-00007",
          "生产入库 product=PRD-EGG-GRADE_4 grade=GRADE_4 qty=1 expire=2026-08-06",
          "EGG-20260707-00008",
          "生产入库 product=PRD-EGG-GRADE_5 grade=GRADE_5 qty=1 expire=2026-08-06",
          "2026-07-08 00:34",
          "-3.000",
          "2026-07-08 00:37"
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
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 404
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
            "path": ".sidebar-module__C8A-ya__subItem.sidebar-module__C8A-ya__subActive",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 532
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
              "y": 117
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
              "y": 338
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
              "y": 419
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
              "y": 498
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
              "y": 638
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
              "y": 638
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
              "y": 815
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
              "y": 869
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
              "y": 869
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
          }
        ]
      },
      "devicePixelRatio": 1.7999999523162842
    },
    "consoleErrors": [],
    "failedRequests": [
      {
        "url": "/api/bug-intake/reports/BUG-20260708-0004/redispatch",
        "method": "POST",
        "status": 400,
        "requestId": "",
        "timestamp": "2026-07-09T07:19:33.954Z",
        "responseExcerpt": "{\"code\":400,\"message\":\"已解决或已关闭的问题不能直接重新派发，请先重新打开并确认仍需修复\",\"error\":\"Bad Request\",\"statusCode\":400}"
      }
    ],
    "localEvidence": {
      "localAttachments": [
        {
          "fileName": "01-1783582850342-ec1f5758.png",
          "originalName": "pasted-screenshot-1783582590020-1.png",
          "mimeType": "image/png",
          "sourceEndpoint": "/api/bug-intake/reports/BUG-20260709-0003/attachments/01-1783582850342-ec1f5758.png",
          "localPath": "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260709-154351/BUG-20260709-0003/attachments/01-1783582850342-ec1f5758.png",
          "sizeBytes": 679498
        }
      ],
      "localAttachmentPaths": [
        "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260709-154351/BUG-20260709-0003/attachments/01-1783582850342-ec1f5758.png"
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
    "source_bug_no": "BUG-20260709-0003",
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
      },
      {
        "agent": "A6-Staging-Deploy-Runbook",
        "reasons": [
          "deploy/runbook signal matched"
        ],
        "execution_mode": "dry-run-first",
        "approval_required": true
      },
      {
        "agent": "A7-Final-QA-Gate",
        "reasons": [
          "release gate signal matched"
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
      "A1-CI-Runtime-Gate",
      "A6-Staging-Deploy-Runbook",
      "A7-Final-QA-Gate"
    ],
    "failure_category": null,
    "hard_constraints": [
      "no automatic production deploy",
      "no automatic DB write",
      "no automatic migration",
      "human approval required before code repair execution"
    ],
    "route_confidence": null,
    "source_repair_task_no": "BUGTASK-20260709-0003"
  },
  "createdAt": "2026-07-09T07:41:27.170Z",
  "createdBy": "admin",
  "moduleCode": "____",
  "suggestedOwner": "",
  "repairGuardrails": {
    "autoRepairExecuted": false,
    "noProductionDeploy": true,
    "noDbWriteWithoutGate": true,
    "requiresHumanApproval": true
  },
  "acceptanceCriteria": "事务类型一栏显示的是英文代码，需要转换成对应的中文，比如FARM_OUT_MEDICATION、TEMP_PRODUCTION_INBOUND、FARM_IN等，都转换为中文显示",
  "agentPlanGeneratedAt": "2026-07-09T07:41:28.544Z",
  "agentPlanGeneratedBy": "admin",
  "agentExecutionApproval": {
    "approved": true,
    "approvedAt": "2026-07-09T07:41:30.242Z",
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

- /Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260709-154351/BUG-20260709-0003/attachments/01-1783582850342-ec1f5758.png

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
先做合同要求的 dry-run 入口检查：目录、分支、工作区和最近提交。只有这些通过，才继续定位 `/warehouse/ledger` 的后端数据来源。
exec
/bin/zsh -lc pwd in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path

exec
/bin/zsh -lc 'git branch --show-current' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
w5-a3-backend-critical-path

exec
/bin/zsh -lc 'git status --short' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
exec
/bin/zsh -lc 'git log --oneline --decorate -8' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
 succeeded in 0ms:
b03974ca (HEAD -> w5-a3-backend-critical-path, w5-a4-frontend-uat-smoke, main) docs(ops): record baseline lifecycle report
ddece465 feat(web): record A4-Frontend-UAT-Smoke result
3bbf16bf docs(ops): record baseline lifecycle report
4541773c feat(api): record A3-Backend-Critical-Path result
a2c98479 docs(ops): record baseline lifecycle report
3728b52c feat(web): record A4-Frontend-UAT-Smoke result
63269a5d docs(ops): record baseline lifecycle report
fa15cfac docs: record bug-20260707-0009 a4 redispatch

codex
入口检查通过：目录和分支匹配，工作区干净。现在只读诊断后端 ledger 数据流，先找页面调用的 API 和 WMS ledger 服务边界。
exec
/bin/zsh -lc "rg \"transaction_type|transactionType|txn_type|movement_type\" apps/api/src/modules apps/web/src -g '*.ts' -g '*.tsx'" in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
exec
/bin/zsh -lc "rg \"warehouse/ledger|库存台账|inv_ledger|ledger\" apps/api/src apps/web/src -g '*.ts' -g '*.tsx'" in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
apps/web/src/app/(admin)/warehouse/ledger/page.tsx:    change_type: String(row.change_type ?? row.txn_type ?? row.type ?? "—"),

 succeeded in 0ms:
apps/web/src/lib/shareholder-api.ts:  totalPaidInCapital?: number | null; ledgerPaidIn?: number;
apps/api/src/modules/finance-v2/finance-v2.module.ts:import { FinArLedgerController }        from './controllers/fin-ar-ledger.controller';
apps/api/src/modules/finance-v2/finance-v2.module.ts:import { ArLedgerService }                 from './services/ar-ledger.service';
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts: * 应收往来余额台账  fin_ar_ledger（应收总账）
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:@Entity('fin_ar_ledger')
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:@Index('idx_fin_ar_ledger_farm_period', ['farmCode', 'periodDate'])
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:@Index('idx_fin_ar_ledger_counterparty', ['counterpartyName'])
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:@Unique('uq_fin_ar_ledger', ['farmCode', 'counterpartyName', 'periodDate'])
apps/api/src/modules/finance-v2/entities/index.ts:export { FinArLedgerEntity }                 from './fin-ar-ledger.entity';
apps/api/src/modules/finance-v2/entities/fin-ap-invoice.entity.ts: *   PO            — 从采购 PO / prc2_ap_ledger 导入
apps/web/src/app/trace/[batchNo]/page.tsx:  ledger?: Record<string, unknown>[];
apps/web/src/lib/mobile-api.ts:  ledger_date:     string;
apps/web/src/lib/mobile-api.ts:    get<FeedLedgerRow[]>(`/api/farm/feed/ledger?date=${date}`),
apps/web/src/lib/mobile-api.ts:    fetch((process.env.NEXT_PUBLIC_API_BASE || '') + '/api/farm/feed/ledger', {
apps/web/src/lib/mobile-api.ts:    get<EggLedgerEntry[]>(`/api/farm/egg/ledger?start=${start}&end=${end}`),
apps/web/src/lib/mobile-api.ts:    get<MedLedgerEntry[]>(`/api/farm/medicine/ledger?start=${start}&end=${end}`),
apps/api/src/modules/finance-v2/services/ap-adapter.service.ts: * 从 prc2_ap_ledger（Procurement V2 的真实 AP 台账）读取数据，
apps/api/src/modules/finance-v2/services/ap-adapter.service.ts:   * 从 prc2_ap_ledger 读取 AP 数据，支持：
apps/api/src/modules/finance-v2/services/ap-adapter.service.ts:      FROM prc2_ap_ledger a
apps/api/src/modules/finance-v2/services/ap-adapter.service.ts:      FROM prc2_ap_ledger a
apps/api/src/modules/finance-v2/services/ap-adapter.service.ts:      source:   'prc2_ap_ledger',          // 明确标注数据源
apps/api/src/modules/finance-v2/services/ap-adapter.service.ts:      FROM prc2_ap_ledger
apps/api/src/modules/finance-v2/services/ap-adapter.service.ts:      source: 'prc2_ap_ledger',
apps/api/src/modules/traceability/traceability.service.ts: *     → 分级 pkg_grading_records → 包装 pkg_packing_records → 库存 inv_batches / inv_ledger
apps/api/src/modules/traceability/traceability.service.ts:    const ledger = await this.q(
apps/api/src/modules/traceability/traceability.service.ts:         FROM inv_ledger WHERE batch_no = $1 ORDER BY created_at ASC LIMIT 100`,
apps/api/src/modules/traceability/traceability.service.ts:    // 退货：RET-/inv_ledger SALE_RETURN
apps/api/src/modules/traceability/traceability.service.ts:         FROM inv_ledger WHERE batch_no = $1 AND change_type IN ('SALE_RETURN','DAMAGE_WRITEOFF') ORDER BY created_at DESC LIMIT 50`,
apps/api/src/modules/traceability/traceability.service.ts:        ledger,
apps/web/src/components/layout/Sidebar.tsx:    { id: "wh-ledger",   path: "/warehouse/ledger",       Icon: ScrollText,      label: "出入库流水", perm: "MENU_WMS_VIEW"  },
apps/web/src/components/layout/Sidebar.tsx:    { id: "f2-ar-ledger", path: "/finance2/ar-ledger",          Icon: BookOpen,        label: "应收总账",   perm: "MENU_FIN2_AR_LEDGER"  },
apps/api/src/modules/finance-v2/services/ar-ledger.service.ts: * 只读查询 fin_ar_ledger：按场 / 期间 / 往来单位过滤，返回明细 + 合计 + 可选维度。
apps/api/src/modules/finance-v2/services/ar-ledger.service.ts:      `SELECT DISTINCT farm_code AS "farmCode", farm_name AS "farmName" FROM fin_ar_ledger ${sf} ORDER BY farm_code`,
apps/api/src/modules/finance-v2/services/ar-ledger.service.ts:      `SELECT DISTINCT to_char(period_date,'YYYY-MM-DD') AS "periodDate" FROM fin_ar_ledger ${sf} ORDER BY 1 DESC`,
apps/api/src/modules/finance-v2/services/ar-ledger.service.ts:         FROM fin_ar_ledger ${ws}
apps/api/src/modules/finance-v2/services/ar-ledger.service.ts:         FROM fin_ar_ledger ${ws}`,
apps/api/src/modules/store-pos/services/store-pos.service.ts: *   - Egg Inventory Runtime：FIFO 扣减 inv_batches + inv_ledger（FIFO_OUT）
apps/api/src/modules/store-pos/services/store-pos.service.ts:      // A. 库存反向:每行入 QUARANTINE 退货批 + inv_ledger SALE_RETURN
apps/api/src/modules/store-pos/services/store-pos.service.ts:          // 写 inv_ledger FIFO_OUT（Phase H5: 传递 sku_code）
apps/api/src/modules/store-pos/services/store-pos.service.ts:            `INSERT INTO inv_ledger
apps/api/src/modules/store-pos/services/store-pos.service.ts:  /** 退货库存反向：每行入 QUARANTINE 退货批（待 QC 复检）+ inv_ledger SALE_RETURN（沿用 sales-v2 退货入库语义） */
apps/api/src/modules/store-pos/services/store-pos.service.ts:        `INSERT INTO inv_ledger
apps/api/src/modules/terminal/packaging.service.ts:   * ④ INSERT inv_batches 鲜蛋批次 + inv_ledger EGG_IN 流水（保质 7 天）
apps/api/src/modules/terminal/packaging.service.ts:        // ④ inv_ledger EGG_IN 流水
apps/api/src/modules/terminal/packaging.service.ts:        await mgr.query('SAVEPOINT sp_inv_ledger');
apps/api/src/modules/terminal/packaging.service.ts:            `INSERT INTO inv_ledger
apps/api/src/modules/terminal/packaging.service.ts:          await mgr.query('RELEASE SAVEPOINT sp_inv_ledger');
apps/api/src/modules/terminal/packaging.service.ts:          await mgr.query('ROLLBACK TO SAVEPOINT sp_inv_ledger');
apps/api/src/modules/terminal/packaging.service.ts:          console.warn('[completeShift][WARN] inv_ledger skipped:', e?.message);
apps/api/src/modules/terminal/packaging.service.ts:   *   - inv_ledger EGG_IN 流水（继续累计产量）
apps/api/src/modules/terminal/packaging.service.ts:              `INSERT INTO inv_ledger
apps/api/src/modules/terminal/packaging.service.ts:   * ③ 对每个等级 INSERT inv_ledger EGG_GRADED 流水（关联 ref_no=原 EGG- 批次号）
apps/api/src/modules/terminal/packaging.service.ts:        // ② + ③ 对每个非零等级生成 inv_batches + inv_ledger（V2 同款行为）
apps/api/src/modules/terminal/packaging.service.ts:              `INSERT INTO inv_ledger
apps/api/src/modules/terminal/packaging.service.ts:            // 多等级 → 拆多条 inv_batches + 每条配一条 inv_ledger PACK_DONE 流水
apps/api/src/modules/terminal/packaging.service.ts:                  `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
apps/api/src/modules/finance-v2/services/financial-reports.service.ts:               FROM fin_ar_ledger WHERE 1=1 ${sf}
apps/api/src/modules/finance-v2/services/financial-reports.service.ts:    // G61：应收待收 = 发票应收(fin_ar_invoices) + 应收总账OCR快照最新期末(fin_ar_ledger)
apps/web/src/components/design-system/templates/Templates.tsx:      <DataTableV3 rows={p.rows} columns={p.columns} loading={p.loading} pageSize={p.pageSize} exportName={p.exportName || 'ledger'} rowKey={p.rowKey} />
apps/api/src/modules/generic-crud/generic-crud.controller.ts:    if (table === 'inv_batches' || table === 'inv_ledger') return 'MENU_WMS_VIEW';
apps/api/src/modules/generic-crud/generic-crud.controller.ts:function isScopedInventoryTable(table: string): table is 'inv_batches' | 'inv_ledger' {
apps/api/src/modules/generic-crud/generic-crud.controller.ts:  return table === 'inv_batches' || table === 'inv_ledger';
apps/api/src/modules/finance-v2/services/ap-invoices.service.ts: * 不依赖 prc2_ap_ledger（import-from-prc2 除外）。
apps/api/src/modules/finance-v2/services/ap-invoices.service.ts:  // ── 4. 从 PO / prc2_ap_ledger 创建 ───────────────────────────────────────
apps/api/src/modules/finance-v2/services/ap-invoices.service.ts:  // ── 10. 从 prc2_ap_ledger 幂等导入 ───────────────────────────────────────
apps/api/src/modules/finance-v2/services/ap-invoices.service.ts:      `SELECT * FROM prc2_ap_ledger WHERE ${conds.join(' AND ')} ORDER BY id`,
apps/api/src/modules/finance-v2/services/ap-invoices.service.ts:      source:   'prc2_ap_ledger',
apps/api/src/modules/quality/quality.service.ts:    const ledger = await this.em.query(
apps/api/src/modules/quality/quality.service.ts:         FROM inv_ledger WHERE batch_no = $1 ORDER BY created_at ASC`,
apps/api/src/modules/quality/quality.service.ts:    for (const l of ledger) {
apps/api/src/modules/quality/quality.service.ts:        total_distributed: ledger
apps/api/src/modules/quality/quality.service.ts:      ledger,
apps/api/src/modules/quality/quality.service.ts:           FROM inv_ledger
apps/api/src/modules/generic-crud/generic-crud.service.ts:        'inv_batches', 'inv_ledger',
apps/api/src/modules/generic-crud/generic-crud.service.ts:        'pos_sales', 'pos_sale_items', 'daily_close', 'acc_ledger',
apps/api/src/modules/generic-crud/generic-crud.service.ts:        // crm_points_ledger = 余额台账（当前余额快照，按会员+周期汇总）
apps/api/src/modules/generic-crud/generic-crud.service.ts:        `CREATE TABLE IF NOT EXISTS crm_points_ledger (
apps/api/src/modules/generic-crud/generic-crud.service.ts:        `ALTER TABLE crm_points_ledger ADD COLUMN IF NOT EXISTS expired   INT DEFAULT 0`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:        `ALTER TABLE crm_points_ledger ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:        `CREATE TABLE IF NOT EXISTS inv_ledger (
apps/api/src/modules/generic-crud/generic-crud.service.ts:        `ALTER TABLE inv_ledger ADD COLUMN IF NOT EXISTS log_date      DATE`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:        `ALTER TABLE inv_ledger ADD COLUMN IF NOT EXISTS warehouse_code VARCHAR(50)`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:        `ALTER TABLE inv_ledger ADD COLUMN IF NOT EXISTS house_code    VARCHAR(50)`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:        `ALTER TABLE inv_ledger ADD COLUMN IF NOT EXISTS customer_no   VARCHAR(100)`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:        `CREATE TABLE IF NOT EXISTS acc_ledger (
apps/api/src/modules/generic-crud/generic-crud.service.ts:           ledger_type   VARCHAR(64),
apps/api/src/modules/generic-crud/generic-crud.service.ts:      if (table === 'inv_ledger') {
apps/api/src/modules/generic-crud/generic-crud.service.ts:  async findAllInventoryScoped(table: 'inv_batches' | 'inv_ledger', query: any, allowedWarehouseCodes: string[] | null) {
apps/api/src/modules/generic-crud/generic-crud.service.ts:      if (table === 'inv_ledger') {
apps/api/src/modules/shareholder/services/shareholder.service.ts:      ledgerPaidIn: Number(pm.get(p.projectCode)?.paid_in ?? 0),
apps/api/src/modules/shareholder/services/shareholder.service.ts:      ledgerPaidInTotal: Number([...paidMap.values()].reduce((a, b) => a + b, 0)),
apps/api/src/modules/shareholder/services/shareholder.service.ts:        ledgerPaidIn: paidMap.get(e.shareholderCode) ?? 0, // 逐笔台账累计（核对用）
apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts:      controller.findAll('inv_ledger', { limit: '50', offset: '0' }, {
apps/api/src/modules/generic-crud/generic-crud.controller.spec.ts:    expect(svc.findAllInventoryScoped).toHaveBeenCalledWith('inv_ledger', { limit: '50', offset: '0' }, []);
apps/api/src/modules/generic-crud/generic-crud.service.spec.ts:    it('adds Chinese labels to inventory ledger change types without replacing raw codes', async () => {
apps/api/src/modules/generic-crud/generic-crud.service.spec.ts:      await expect(svc.findAll('inv_ledger', {})).resolves.toEqual([
apps/api/src/modules/generic-crud/generic-crud.service.spec.ts:    it('adds Chinese labels to scoped inventory ledger rows and keeps DataScope SQL', async () => {
apps/api/src/modules/generic-crud/generic-crud.service.spec.ts:      await expect(svc.findAllInventoryScoped('inv_ledger', { limit: '50' }, ['WH-A'])).resolves.toEqual([
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts: * g199-C AR 三方对账 — fin_ar_invoices(业务侧) ↔ fin_ar_ledger(ERP 总账) ↔ chanjet_ar_snapshot(好业财)
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts: *   - ERP 总账:fin_ar_ledger 直接取 closing_amount(已是该期间客户期末)
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:  // 三方金额(原币不同 → 折成本币 RMB 后比较,这里 invoices 用 amount_base / ledger 用 closing_amount_base ?? closing_amount / chanjet endbalance 已是 RMB)
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:  ledgerClosing: number;     // ERP 总账:fin_ar_ledger.closing_amount_base ?? closing_amount
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:  ledgerSource: string | null;
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:    // 公司列表:从 chanjet_book_company_map(权威) + fin_ar_ledger / fin_ar_invoices 取并集
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:         SELECT DISTINCT company_code FROM fin_ar_ledger WHERE company_code IS NOT NULL
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:       FROM fin_ar_ledger
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:    totals: { invoiceBalance: number; ledgerClosing: number; chanjetEndbalance: number };
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:        return { companyCode, periodDate, rows: [], totals: { invoiceBalance: 0, ledgerClosing: 0, chanjetEndbalance: 0 }, counts: { ok: 0, warn: 0, mismatch: 0 } };
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:          return { companyCode: '', periodDate, rows: [], totals: { invoiceBalance: 0, ledgerClosing: 0, chanjetEndbalance: 0 }, counts: { ok: 0, warn: 0, mismatch: 0 } };
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:    // period: YYYY-MM-DD → chanjet 用 'YYYYMM',ledger 用 date,invoice 用月份范围
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:      FROM fin_ar_ledger
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:      ledgerClosing: 0,
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:      ledgerSource: null,
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:      a.ledgerClosing += Number(r.closing) || 0;
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:      if (r.source) a.ledgerSource = r.source;
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:      r.deltaInvLedger     = r.invoiceBalance - r.ledgerClosing;
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:      r.deltaLedgerChanjet = r.ledgerClosing - r.chanjetEndbalance;
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:      if (r.invoiceBalance === 0 && r.ledgerClosing === 0 && r.chanjetEndbalance !== 0) {
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:      if (r.invoiceBalance !== 0 && r.ledgerClosing === 0 && r.chanjetEndbalance === 0) {
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:      if (r.invoiceBalance === 0 && r.ledgerClosing !== 0 && r.chanjetEndbalance === 0) {
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:      const allZero = r.invoiceBalance === 0 && r.ledgerClosing === 0 && r.chanjetEndbalance === 0;
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:      totalLed += r.ledgerClosing;
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:      totals: { invoiceBalance: totalInv, ledgerClosing: totalLed, chanjetEndbalance: totalCj },
apps/api/src/modules/finance-v2/services/ar-reconciliation.service.ts:          const top = c.topRows.map(r => `  • ${r.customerName}: ②=${r.ledgerClosing.toFixed(2)} ③=${r.chanjetEndbalance.toFixed(2)} 差=${r.deltaLedgerChanjet.toFixed(2)}`).join('\n');
apps/api/src/modules/generic-crud/crud.constants.ts:  'inv_batches', 'inv_ledger',
apps/api/src/modules/generic-crud/crud.constants.ts:  'crm_members', 'crm_points_ledger', 'crm_levels', 'crm_coupons', 'crm_activities', 'crm_points_log', 'crm_points_rules',
apps/api/src/modules/generic-crud/crud.constants.ts:  'acc_ledger',
apps/api/src/modules/data-quality/services/data-quality-alerts.service.ts:        recommendation: '检查 wms.service 与 packaging.service 是否绕过 inv_ledger 写入',
apps/api/src/modules/data-quality/services/data-quality-alerts.service.ts:        message: `${trace.orphanBatches} 个孤儿批次（无 ledger 入账）`,
apps/api/src/modules/data-quality/services/data-quality-alerts.service.ts:        recommendation: '回滚批次或补登 ledger',
apps/api/src/modules/chanjet/chanjet-callback.controller.ts:   * GET /api/chanjet/ar-ledger-import-preview?companyCode=&period=
apps/api/src/modules/chanjet/chanjet-callback.controller.ts:  @Get('ar-ledger-import-preview')
apps/api/src/modules/chanjet/chanjet-callback.controller.ts:   * POST /api/chanjet/ar-ledger-import
apps/api/src/modules/chanjet/chanjet-callback.controller.ts:   * g199-B 审核入账:chanjet_ar_snapshot → fin_ar_ledger。
apps/api/src/modules/chanjet/chanjet-callback.controller.ts:  @Post('ar-ledger-import')
apps/api/src/modules/data-quality/services/traceability-health.service.ts:  orphanBatches: number;        // inv_batches 无对应 ledger 入账
apps/api/src/modules/data-quality/services/traceability-health.service.ts: *   batch → ledger(INBOUND) → 元数据中的 source_house/flock → brd_houses.farm_code → brd_farms
apps/api/src/modules/data-quality/services/traceability-health.service.ts:      const ledger = await this.safe<{ c: string }>(
apps/api/src/modules/data-quality/services/traceability-health.service.ts:        `SELECT COUNT(*)::text AS c FROM inv_ledger WHERE batch_no = $1`,
apps/api/src/modules/data-quality/services/traceability-health.service.ts:      const hasLedger = parseInt(ledger[0]?.c ?? '0', 10) > 0;
apps/api/src/modules/data-quality/services/traceability-health.service.ts:        details.push({ batch_no: b.batch_no, reason: '无 inv_ledger 入账' });
apps/api/src/modules/data-quality/services/traceability-health.service.ts:      // 有 ledger 即视为最小追溯能力达成；上游/下游链 JOIN 可继续深挖
apps/api/src/modules/data-quality/services/traceability-health.service.ts:    // 全局：inv_batches 无 ledger 入账（孤儿批次）
apps/api/src/modules/data-quality/services/traceability-health.service.ts:         WHERE NOT EXISTS (SELECT 1 FROM inv_ledger l WHERE l.batch_no = b.batch_no)`,
apps/api/src/modules/finance-v2/controllers/fin-ar-reconciliation.controller.ts: * 业务侧 fin_ar_invoices ↔ ERP fin_ar_ledger ↔ 好业财 chanjet_ar_snapshot
apps/api/src/modules/finance-v2/controllers/fin-ap.controller.ts: *   POST   /api/v2/finance/ap/import-from-prc2  — 从 prc2_ap_ledger 幂等导入
apps/api/src/modules/finance-v2/controllers/fin-ap.controller.ts:   * 从 prc2_ap_ledger 幂等导入历史 AP 数据。
apps/api/src/modules/finance-v2/controllers/finance-v2.controller.ts:   * 从 prc2_ap_ledger 读取 AP 数据（只读，DataScope 过滤）。
apps/api/src/modules/finance-v2/controllers/fin-ar-ledger.controller.ts:import { ArLedgerService }        from '../services/ar-ledger.service';
apps/api/src/modules/finance-v2/controllers/fin-ar-ledger.controller.ts: * 路由前缀：/api/v2/finance/ar-ledger
apps/api/src/modules/finance-v2/controllers/fin-ar-ledger.controller.ts:@Controller('api/v2/finance/ar-ledger')
apps/api/src/modules/chanjet/chanjet.module.ts:import { FinArLedgerEntity } from '../finance-v2/entities/fin-ar-ledger.entity';
apps/api/src/modules/data-quality/services/inventory-health.service.ts:  withoutBatch: number;              // inv_ledger.batch_no 引用不存在的 batch
apps/api/src/modules/data-quality/services/inventory-health.service.ts: *   - 孤儿账：inv_ledger 引用不存在的 batch_no
apps/api/src/modules/data-quality/services/inventory-health.service.ts:      `SELECT COUNT(*)::text AS c FROM inv_ledger l
apps/api/src/modules/wms/entities/wms-stock-ledger.entity.ts:@Entity('wms_stock_ledger')
apps/api/src/modules/wms/wms.service.ts:      `SELECT 1 FROM inv_ledger WHERE ref_no = $1 AND batch_no = $2 AND change_type = $3 LIMIT 1`,
apps/api/src/modules/wms/wms.service.ts:   *   现改为 ON CONFLICT DO UPDATE 把数量累加 + 同步写 inv_ledger 流水
apps/api/src/modules/wms/wms.service.ts:   *   每条 inv_batches 入库都必须配套写入 inv_ledger，让库存守恒可审计
apps/api/src/modules/wms/wms.service.ts:              `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
apps/api/src/modules/wms/wms.service.ts:              `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
apps/api/src/modules/wms/wms.service.ts:   * G84 采购收货入库 — 供采购模块在其「收货确认」事务内调用，统一写 inv_batches/inv_ledger。
apps/api/src/modules/wms/wms.service.ts:      refNo: string;             // 收货单号（→ inv_ledger.ref_no 可追溯）
apps/api/src/modules/wms/wms.service.ts:        `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
apps/api/src/modules/wms/wms.service.ts:   * A1 心脏修复：出库时按 batch 扣减 inv_batches.qty + 写 inv_ledger OUTBOUND 流水
apps/api/src/modules/wms/wms.service.ts:            `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
apps/api/src/modules/wms/wms.service.ts:      // 签收差异写入 inv_ledger（reconcile path）
apps/api/src/modules/wms/wms.service.ts:          `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
apps/api/src/modules/wms/wms.service.ts:          `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
apps/api/src/modules/wms/wms.service.ts:          `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
apps/api/src/modules/wms/wms.service.ts:  // A5: 盘点审批 (stocktake approve) — 差额写 inv_ledger + 调 inv_batches.qty
apps/api/src/modules/wms/wms.service.ts:          `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
apps/api/src/modules/wms/wms.service.ts:   * 写 wms_stocktake(APPROVED, count_type='PDA') + 调整 inv_batches + 写 inv_ledger 守恒流水）。
apps/api/src/modules/wms/wms.service.ts:            `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
apps/api/src/modules/wms/wms.service.ts:         FROM inv_ledger
apps/api/src/modules/wms/wms.service.ts:          `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
apps/api/src/modules/wms/inventory/inventory.service.spec.ts:  it('atomicDecrement deducts and writes ledger on success', async () => {
apps/api/src/modules/wms/inventory/inventory.service.spec.ts:    expect(manager.save).toHaveBeenCalledTimes(2); // balance + ledger
apps/api/src/modules/wms/inventory/inventory.service.ts:import { WmsStockLedgerEntity } from '../entities/wms-stock-ledger.entity';
apps/api/src/modules/wms/inventory/inventory.service.ts:      const ledger = new WmsStockLedgerEntity();
apps/api/src/modules/wms/inventory/inventory.service.ts:      ledger.biz_type = dto.biz_type;
apps/api/src/modules/wms/inventory/inventory.service.ts:      ledger.bill_no = dto.bill_no;
apps/api/src/modules/wms/inventory/inventory.service.ts:      ledger.warehouse_code = dto.warehouse_code;
apps/api/src/modules/wms/inventory/inventory.service.ts:      ledger.location_code = dto.location_code;
apps/api/src/modules/wms/inventory/inventory.service.ts:      ledger.spec_code = dto.spec_code;
apps/api/src/modules/wms/inventory/inventory.service.ts:      ledger.batch_no = dto.batch_no;
apps/api/src/modules/wms/inventory/inventory.service.ts:      ledger.in_qty = 0;
apps/api/src/modules/wms/inventory/inventory.service.ts:      ledger.out_qty = dto.qty;
apps/api/src/modules/wms/inventory/inventory.service.ts:      ledger.balance_qty = balance.qty;
apps/api/src/modules/wms/inventory/inventory.service.ts:      ledger.store_code = storeCode;
apps/api/src/modules/wms/inventory/inventory.service.ts:      ledger.operator = operator;
apps/api/src/modules/wms/inventory/inventory.service.ts:      await manager.save(WmsStockLedgerEntity, ledger);
apps/api/src/modules/wms/inventory/inventory.service.ts:      const ledger = new WmsStockLedgerEntity();
apps/api/src/modules/wms/inventory/inventory.service.ts:      ledger.biz_type = dto.biz_type;
apps/api/src/modules/wms/inventory/inventory.service.ts:      ledger.bill_no = dto.bill_no;
apps/api/src/modules/wms/inventory/inventory.service.ts:      ledger.warehouse_code = dto.warehouse_code;
apps/api/src/modules/wms/inventory/inventory.service.ts:      ledger.location_code = dto.location_code;
apps/api/src/modules/wms/inventory/inventory.service.ts:      ledger.spec_code = dto.spec_code;
apps/api/src/modules/wms/inventory/inventory.service.ts:      ledger.batch_no = dto.batch_no;
apps/api/src/modules/wms/inventory/inventory.service.ts:      ledger.in_qty = dto.qty;
apps/api/src/modules/wms/inventory/inventory.service.ts:      ledger.out_qty = 0;
apps/api/src/modules/wms/inventory/inventory.service.ts:      ledger.balance_qty = balance.qty;
apps/api/src/modules/wms/inventory/inventory.service.ts:      ledger.store_code = storeCode;
apps/api/src/modules/wms/inventory/inventory.service.ts:      ledger.operator = operator;
apps/api/src/modules/wms/inventory/inventory.service.ts:      await manager.save(WmsStockLedgerEntity, ledger);
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:import { FinArLedgerEntity } from '../finance-v2/entities/fin-ar-ledger.entity';
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:    private readonly ledgerRepo: Repository<FinArLedgerEntity>,
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:  // ─── g199-B: chanjet_ar_snapshot → fin_ar_ledger 审核入账 ────────────────
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:  //      让 fin_ar_ledger 的 uq_fin_ar_ledger 真生效
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:   * 预览入账差异:不写库,只算 chanjet_ar_snapshot 行 vs 已有 fin_ar_ledger 行的差异。
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:    const existing = await this.ledgerRepo
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:   * 审核入账 chanjet_ar_snapshot → fin_ar_ledger。
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:      // 按 uq_fin_ar_ledger (farm_code, counterparty_name, period_date) upsert
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:        await this.ledgerRepo.upsert(
apps/api/src/modules/wms/wms.module.ts:import { WmsStockLedgerEntity } from './entities/wms-stock-ledger.entity';
apps/web/src/app/(admin)/warehouse/page.tsx:    { path: "/warehouse/ledger",    Icon: BookOpen,       label: t("ui.库存台账", "库存台账"), desc: t("ui.库存台账", "inv_batches 唯一台账,所有动作全可追溯。"),     accent: "cyan"   as const, perm: "MENU_WMS_VIEW" },
apps/web/src/app/(mobile)/mobile/medicine/page.tsx:  const [ledger, setLedger]   = useState<MedLedgerEntry[]>([]);
apps/web/src/app/(mobile)/mobile/medicine/page.tsx:        <span style={{ fontSize: 15, fontWeight: 700, color: t.text, flex: 1 }}>💊 {tr('mob.brd.medicine_ledger', '药品台账')}</span>
apps/web/src/app/(mobile)/mobile/medicine/page.tsx:        {tab === 'outbound' && ledger.length > 0 && (
apps/web/src/app/(mobile)/mobile/medicine/page.tsx:            <div style={{ fontSize: 12, color: t.textFaint, marginBottom: 8 }}>{tr('mob.brd.today_ledger', '今日流水')}</div>
apps/web/src/app/(mobile)/mobile/medicine/page.tsx:            {ledger.map(e => (
apps/api/src/modules/approval-engine/workflow-biz-registry.service.ts:import { Prc2ApLedgerEntity } from '../procurement-v2/entities/prc2-ap-ledger.entity';
apps/api/src/modules/farm/farm-medicine.service.spec.ts:  it('inbound upserts medicine stock before writing ledger', async () => {
apps/api/src/modules/farm/farm-medicine.service.spec.ts:  it('inbound rejects inactive or missing medicine without writing ledger', async () => {
apps/api/src/modules/farm/farm-medicine.service.spec.ts:  it('outbound deducts existing stock and writes ledger', async () => {
apps/api/src/modules/farm/farm-medicine.service.spec.ts:  it('outbound rejects missing stock without writing ledger', async () => {
apps/api/src/modules/farm/farm-medicine.service.ts:       FROM inv_ledger l
apps/api/src/modules/farm/farm-medicine.service.ts:          `INSERT INTO inv_ledger
apps/api/src/modules/farm/farm-medicine.service.ts:          `INSERT INTO inv_ledger
apps/api/src/modules/farm/farm-medicine.controller.ts:  /** GET /api/farm/medicine/ledger?start=&end= */
apps/api/src/modules/farm/farm-medicine.controller.ts:  @Get('ledger')
apps/web/src/app/(mobile)/mobile/feed/page.tsx:      const [ledger, houseList] = await Promise.all([mobileApi.getFeedLedger(d), mobileApi.getFeedHousesDetail()]);
apps/web/src/app/(mobile)/mobile/feed/page.tsx:      const arr = Array.isArray(ledger) ? ledger : (ledger as any)?.data ?? [];
apps/web/src/app/(mobile)/mobile/feed/page.tsx:  if (permLoading) return <MobilePageSkeleton title={tr('mob.brd.feed_ledger', '饲料台账')} onBack={() => router.back()} />;
apps/web/src/app/(mobile)/mobile/feed/page.tsx:        toast.success(tr('mob.brd.feed_ledger_save_ok', '饲料台账保存成功'));
apps/web/src/app/(mobile)/mobile/feed/page.tsx:      }}>🌾 {tr('mob.brd.feed_ledger', '饲料台账')}</span>
apps/api/src/modules/farm/farm-egg.controller.ts:  /** GET /api/farm/egg/ledger?start=YYYY-MM-DD&end=YYYY-MM-DD */
apps/api/src/modules/farm/farm-egg.controller.ts:  @Get('ledger')
apps/api/src/modules/farm/farm-egg.service.ts:       FROM inv_ledger l
apps/web/src/app/(admin)/warehouse/inbound/page.tsx:            <Link href={`/warehouse/ledger?q=${encodeURIComponent(String(row.inbound_no ?? row.item ?? ""))}`} style={linkedPill("brand")}>
apps/web/src/app/(admin)/warehouse/inbound/page.tsx:                    <Link href="/warehouse/ledger" style={linkedPill("info")}>{t("ui.出入库流水", "出入库流水")}</Link>
apps/api/src/modules/farm/farm.service.ts: *   - A4: 无 PRD-EGG 批次时不再抛 400 阻塞日报，改为告警 + ledger 跳过
apps/api/src/modules/farm/farm.service.ts:      // A4: inv_ledger 记账 — 无 PRD-EGG 批次时不阻塞日报，只记 warning
apps/api/src/modules/farm/farm.service.ts:              `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
apps/api/src/modules/farm/farm.service.ts:          console.warn('[FarmService][WARN] inv_ledger 记账失败（不阻塞日报）:', e?.message);
apps/api/src/modules/farm/farm.service.ts:              `INSERT INTO inv_ledger (batch_no, change_type, qty_change, operator, store_code, ref_no, note)
apps/api/src/modules/farm/farm.service.ts:          console.warn('[FarmService][WARN] inv_ledger 差额记账失败:', e?.message);
apps/api/src/main.ts:    //   （根除 ar-ledger 那类"新菜单建好但内存注册表是启动快照→403"问题）。
apps/api/src/modules/farm/farm-feed.controller.ts:  /** GET /api/farm/feed/ledger?date=2026-05-16 */
apps/api/src/modules/farm/farm-feed.controller.ts:  @Get('ledger')
apps/api/src/modules/farm/farm-feed.controller.ts:  /** POST /api/farm/feed/ledger  body: { date, items: [...] } */
apps/api/src/modules/farm/farm-feed.controller.ts:  @Post('ledger')
apps/api/src/modules/farm/farm-feed.controller.ts:  /** GET /api/farm/feed/ledger-range?start=...&end=... */
apps/api/src/modules/farm/farm-feed.controller.ts:  @Get('ledger-range')
apps/api/src/modules/farm/farm-feed.service.ts:      CREATE TABLE IF NOT EXISTS farm_feed_ledger (
apps/api/src/modules/farm/farm-feed.service.ts:        ledger_date   DATE         NOT NULL,
apps/api/src/modules/farm/farm-feed.service.ts:        UNIQUE (ledger_date, material_name)
apps/api/src/modules/farm/farm-feed.service.ts:    await this.em.query(`CREATE INDEX IF NOT EXISTS idx_feed_ledger_date ON farm_feed_ledger(ledger_date DESC)`);
apps/api/src/modules/farm/farm-feed.service.ts:      `SELECT * FROM farm_feed_ledger WHERE ledger_date = $1 ORDER BY sort_order, material_name`,
apps/api/src/modules/farm/farm-feed.service.ts:      `SELECT * FROM farm_feed_ledger WHERE ledger_date = $1 ORDER BY sort_order, material_name`,
apps/api/src/modules/farm/farm-feed.service.ts:        id: null, ledger_date: date,
apps/api/src/modules/farm/farm-feed.service.ts:        INSERT INTO farm_feed_ledger
apps/api/src/modules/farm/farm-feed.service.ts:          (ledger_date, material_name, unit, sort_order, prev_stock, inbound_qty,
apps/api/src/modules/farm/farm-feed.service.ts:        ON CONFLICT (ledger_date, material_name)
apps/api/src/modules/farm/farm-feed.service.ts:      `SELECT * FROM farm_feed_ledger WHERE ledger_date BETWEEN $1 AND $2 ORDER BY ledger_date DESC, sort_order`,
apps/api/src/modules/farm/farm-feed.service.ts:      ledger_date:     r.ledger_date,
apps/api/src/modules/procurement-v2/entities/prc2-ap-ledger.entity.ts:/** 应付账款台账  prc2_ap_ledger */
apps/api/src/modules/procurement-v2/entities/prc2-ap-ledger.entity.ts:@Entity('prc2_ap_ledger')
apps/api/src/modules/procurement-v2/services/payments.service.ts:import { Prc2ApLedgerEntity }           from '../entities/prc2-ap-ledger.entity';
apps/web/src/app/(admin)/warehouse/transfer/page.tsx:        //     源 batch FOR UPDATE 扣减 + 目标新 batch 增加 + 双向 inv_ledger 流水
apps/api/src/database/migrations/1782052418112-RepairRolePermissionMatrixAtomicity.ts:        ('MENU_FIN2_AR_LEDGER', '应收总账', NULL, 'FIN2', 'MENU_FIN2_AR', 55, 'BookOpen', '/finance2/ar-ledger'),
apps/web/src/app/(admin)/warehouse/ledger/page.tsx:// B6: inv_ledger 真实列 — batch_no / change_type / qty_change / operator / store_code / ref_no / note / created_at
apps/web/src/app/(admin)/warehouse/ledger/page.tsx:        "/api/inventory/ledger?limit=1000",
apps/web/src/app/(admin)/warehouse/ledger/page.tsx:        "/api/crud/inv_ledger?limit=1000",
apps/web/src/app/(admin)/warehouse/ledger/page.tsx:        title={t("ui.库存台账", "库存台账")}
apps/api/src/modules/procurement-v2/services/init.service.ts:import { Prc2ApLedgerEntity }           from '../entities/prc2-ap-ledger.entity';
apps/api/src/modules/procurement-v2/controllers/orders.controller.ts:  /** GET /api/v2/procurement/orders/:id/ap-ledger — AP 台账 */
apps/api/src/modules/procurement-v2/controllers/orders.controller.ts:  @Get('orders/:id/ap-ledger')
apps/api/src/modules/procurement-v2/services/
```
