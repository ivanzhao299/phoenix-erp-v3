# Agent Worker Log

| Field | Value |
| --- | --- |
| Task ID | BUGTASK-20260707-0006-03-A4 |
| Agent | A4-Frontend-UAT-Smoke |
| Dry run | No |
| Exit code | 0 |

## Command

```bash
/usr/local/bin/node scripts/ops/run-agent-task.mjs --agent A4-Frontend-UAT-Smoke --worktree /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke --prompt docs/ops/prompts/A4_FRONTEND_TASK_PROMPT.md --task-contract docs/ops/runs/BUGTASK-20260707-0006-03-A4-contract.md --assembled-prompt-output docs/ops/runs/BUGTASK-20260707-0006-03-A4-worker-assembled-prompt.md --require-approval-token APPROVE_AGENT_EXECUTION --skip-baseline-autopilot --allow-ops-runtime-dirty
```

## Stdout

```text
Agent: A4-Frontend-UAT-Smoke
Worktree: /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
Branch: w5-a4-frontend-uat-smoke
Prompt: docs/ops/prompts/A4_FRONTEND_TASK_PROMPT.md
Task contract: docs/ops/runs/BUGTASK-20260707-0006-03-A4-contract.md
Assembled prompt: docs/ops/runs/BUGTASK-20260707-0006-03-A4-worker-assembled-prompt.md
Assembled prompt chars: 34573
Codex command: codex exec -C /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke --sandbox workspace-write -
Codex timeout ms: 600000
Run log: /Users/mac/phoenix-erp-worktrees/codex-orchestrator/docs/ops/runs/2026-07-07T16-36-38-852Z-A4-Frontend-UAT-Smoke.md
Implemented the frontend display fix for BUG-20260707-0006.

Changed:
- [daily page](/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke/apps/web/src/app/(admin)/breeding/daily/page.tsx): “近期日报记录” now resolves `BRD_CULLING_REASON` codes to Chinese labels, with fallback labels for `LOW_PRODUCTION / SICKNESS / AGE / INJURY / OTHER`. CSV export uses the same label conversion.
- [A4 report](/Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke/docs/ops/BUG-20260707-0006_A4_FRONTEND_UAT_REPORT.md): includes changed files, permission notes, responsive notes, validation, blockers, and GO/HOLD status.

Validation:
- Entry checks passed: correct path, branch `w5-a4-frontend-uat-smoke`, initially clean.
- Static check passed: no remaining direct table output of `String(r.cullingReason || '—')`; it now uses `cullingReasonLabel(...)`.
- `git diff --check` passed.
- `pnpm --filter web typecheck` could not run because this worktree has no `node_modules`; `tsc` is missing.

Result: `PASS WITH CONDITIONS / HOLD`. I did not commit because the UI path and Web tsc are not fully verified in this local environment.
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
session id: 019f3d6e-22e7-7850-a33b-ea042a095bfd
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

Source bug: BUG-20260707-0006
Source repair task: BUGTASK-20260707-0006
Assigned agent: A4-Frontend-UAT-Smoke

## Issue

近期日报记录下的淘汰原因不显示中文

## Route

/breeding/daily

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "url": "https://erp.eggslao.com/breeding/daily",
  "bugNo": "BUG-20260707-0006",
  "route": "/breeding/daily",
  "title": "近期日报记录下的淘汰原因不显示中文",
  "taskNo": "BUGTASK-20260707-0006",
  "context": {
    "attachments": [
      {
        "sha256": "ca878b3924659e40f19200af08714a36db67bb94d414d4ec572f15676c9b5a95",
        "fileName": "01-1783386602602-2500083a.png",
        "mimeType": "image/png",
        "sizeBytes": 523541,
        "originalName": "pasted-screenshot-1783386591914-1.png",
        "relativePath": "storage/bug-reports/2026/07/07/BUG-20260707-0006/01-1783386602602-2500083a.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260707-0006/attachments/01-1783386602602-2500083a.png"
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
      "capturedAt": "2026-07-07T01:10:02.603Z",
      "pageSnapshot": {
        "route": "/breeding/daily",
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
          "🖥️ 进入包装作业台",
          "养殖场总览",
          "鸡舍管理",
          "鸡群档案",
          "日生产日报",
          "免疫计划",
          "用药记录",
          "设备监控",
          "环境预警",
          "设备运维",
          "日产蛋入库",
          "包装管理",
          "批次管理",
          "包装日报",
          "异常处理",
          "补打日志",
          "质检总览",
          "场端质检",
          "成品质检",
          "不合格品处置",
          "正向追溯",
          "反向追溯",
          "质量标准",
          "库存管理",
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
          "pasted-screenshot-1783386591914-1.png",
          "退出",
          "养殖管理",
          "/日生产日报",
          "/",
          "日生产日报录入",
          "·按班次录入当日生产数据",
          "·",
          "日期",
          "鸡舍",
          "羽",
          "枚",
          "%",
          "kg",
          "班次数据录入",
          "早班",
          "产蛋数(枚)",
          "🟡 脏蛋(枚)",
          "🔴 破损蛋(枚)",
          "自用蛋(枚)",
          "死亡(羽)",
          "死亡原因",
          "淘汰(羽)",
          "淘汰原因",
          "饲料(kg)",
          "用水(L)",
          "温度(℃)",
          "湿度(%)",
          "备注",
          "晚班",
          "近期日报记录",
          "产蛋数",
          "脏蛋",
          "破损蛋",
          "死亡",
          "淘汰",
          "温度",
          "湿度",
          "2026-07-07T00:00:00.000Z",
          "测试鸡舍2",
          "10",
          "0",
          "—",
          "9.00",
          "25.00℃",
          "60.00%",
          "未知",
          "210",
          "1",
          "INJURY",
          "10.00",
          "30.00℃",
          "28.00%",
          "晚班测试",
          "SICKNESS",
          "白班测试",
          "2026-07-06T00:00:00.000Z",
          "5",
          "LOW_PRODUCTION",
          "36.00℃",
          "30.00%",
          "鸡舍2晚班测试",
          "AGE",
          "鸡舍2早班测试",
          "测试鸡舍",
          "11",
          "1.00"
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
            "path": ".sidebar-module__C8A-ya__groupHeader.sidebar-module__C8A-ya__groupActive",
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
            "tag": "a",
            "path": "",
            "rect": {
              "h": 38,
              "w": 199,
              "x": 8,
              "y": 277
            },
            "label": "🖥️ 进入包装作业台",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.sidebar-module__C8A-ya__subActive",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 317
            },
            "label": "养殖场总览",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 349
            },
            "label": "鸡舍管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 381
            },
            "label": "鸡群档案",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.sidebar-module__C8A-ya__subActive",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 413
            },
            "label": "日生产日报",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 445
            },
            "label": "免疫计划",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 477
            },
            "label": "用药记录",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 509
            },
            "label": "设备监控",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 541
            },
            "label": "环境预警",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 573
            },
            "label": "设备运维",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 605
            },
            "label": "日产蛋入库",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 637
            },
            "label": "包装管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 669
            },
            "label": "批次管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 701
            },
            "label": "包装日报",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 733
            },
            "label": "异常处理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 765
            },
            "label": "补打日志",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 797
            },
            "label": "质检总览",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 829
            },
            "label": "场端质检",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 861
            },
            "label": "成品质检",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 893
            },
            "label": "不合格品处置",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 925
            },
            "label": "正向追溯",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 957
            },
            "label": "反向追溯",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 989
            },
            "label": "质量标准",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 1021
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
              "y": 1059
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
              "y": 1097
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
              "y": 1135
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
              "y": 1173
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
              "y": 1211
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
              "y": 1249
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
              "y": 1287
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
              "y": 1325
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
              "y": 1363
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
              "y": 1401
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
              "y": 1439
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
            "tag": "button",
            "path": "",
            "rect": {
              "h": 36,
              "w": 90,
              "x": 1054,
              "y": -767
            },
            "label": "历史记录",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 36,
              "w": 110,
              "x": 1154,
              "y": -767
            },
            "label": "导出报表",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 36,
              "w": 178,
              "x": 1274,
              "y": -767
            },
            "label": "⚡ 设备数据一键填入",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 36,
              "w": 109,
              "x": 1462,
              "y": -767
            },
            "label": "提交日报",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 38,
              "w": 160,
              "x": 265,
              "y": -670
            },
            "label": "2026-07-07",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".phx-select",
            "rect": {
              "h": 38,
              "w": 200,
              "x": 445,
              "y": -670
            },
            "label": "加载中… X 测试鸡舍 · 蛋鸡舍 测试鸡舍2 · 蛋鸡舍 2号鸡舍 · 蛋鸡舍 3号鸡舍 · 蛋鸡舍 4号鸡舍 · 蛋鸡舍 5号鸡舍 · 蛋鸡舍 6号鸡舍 · 蛋鸡舍",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 34,
              "w": 92,
              "x": 1447,
              "y": -516
            },
            "label": "按 9 档分级",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 291,
              "y": -414
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 602,
              "y": -414
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 914,
              "y": -414
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 1225,
              "y": -414
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 291,
              "y": -299
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".phx-select",
            "rect": {
              "h": 38,
              "w": 301,
              "x": 602,
              "y": -299
            },
            "label": "请选择 疾病 外伤 热应激 自然 不明",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 914,
              "y": -299
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".phx-select",
            "rect": {
              "h": 38,
              "w": 301,
              "x": 1225,
              "y": -299
            },
            "label": "请选择 产蛋率低 患病 老龄 严重外伤 其它",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 291,
              "y": -182
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 540,
              "y": -182
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 789,
              "y": -182
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 1038,
              "y": -182
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 160,
              "x": 1287,
              "y": -182
            },
            "label": "备注...",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 34,
              "w": 92,
              "x": 1447,
              "y": -91
            },
            "label": "按 9 档分级",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 291,
              "y": 11
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 602,
              "y": 11
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 914,
              "y": 11
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 1225,
              "y": 11
            },
            "label": "0",
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
          "fileName": "01-1783386602602-2500083a.png",
          "sourceEndpoint": "/api/bug-intake/reports/BUG-20260707-0006/attachments/01-1783386602602-2500083a.png",
          "downloadError": "GET /api/bug-intake/reports/BUG-20260707-0006/attachments/01-1783386602602-2500083a.png failed HTTP 404: {\"code\":404,\"message\":\"附件文件不存在\",\"error\":\"Not Found\",\"statusCode\":404}"
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
    "source_bug_no": "BUG-20260707-0006",
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
    "hard_constraints": [
      "no automatic production deploy",
      "no automatic DB write",
      "no automatic migration",
      "human approval required before code repair execution"
    ],
    "source_repair_task_no": "BUGTASK-20260707-0006"
  },
  "createdAt": "2026-07-07T01:10:33.816Z",
  "createdBy": "admin",
  "moduleCode": "",
  "suggestedOwner": "",
  "repairGuardrails": {
    "autoRepairExecuted": false,
    "noProductionDeploy": true,
    "noDbWriteWithoutGate": true,
    "requiresHumanApproval": true
  },
  "acceptanceCriteria": "要求近期日报记录下的淘汰原因显示中文",
  "agentPlanGeneratedAt": "2026-07-07T01:10:34.939Z",
  "agentPlanGeneratedBy": "admin",
  "agentExecutionApproval": {
    "approved": true,
    "approvedAt": "2026-07-07T01:10:36.157Z",
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
我会先做约定的 dry-run 入口检查，确认 worktree、分支和脏文件状态；只要发现超出 A4 范围的已有改动，会先停下来说明。
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
731d6e8e (HEAD -> w5-a4-frontend-uat-smoke) fix: require house before daily report submit
9e74e1fe docs(ops): record baseline lifecycle report
f3813a9d feat(web): record A4-Frontend-UAT-Smoke result
653c1fc0 docs(ops): record baseline lifecycle report
11fa71a9 docs(ops): record BUG-20260707-0005 A3 backend report
68251b42 docs(ops): record baseline lifecycle report
7837c762 feat(api): record A3-Backend-Critical-Path result
4c90ee24 docs(ops): record baseline lifecycle report

exec
/bin/zsh -lc 'git status --short' in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
codex
入口检查通过：目录、分支正确，当前 worktree 干净。现在只读定位 `/breeding/daily` 页面里近期记录的原因字段渲染路径，先判断是不是前端 code-to-label 映射缺失。
exec
/bin/zsh -lc 'find docs/ops -maxdepth 2 -type f | sort | tail -40' in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
docs/ops/runs/router-v1-case3-route-plan.json
docs/ops/runs/router-v1-case3-route-plan.md
docs/ops/runs/router-v1-case4-route-plan.json
docs/ops/runs/router-v1-case4-route-plan.md
docs/ops/runs/router-v1-case5-route-plan.json
docs/ops/runs/router-v1-case5-route-plan.md
docs/ops/runs/router-v1-case6-route-plan.json
docs/ops/runs/router-v1-case6-route-plan.md
docs/ops/runs/router-v1-revalidate-case1-route-plan.json
docs/ops/runs/router-v1-revalidate-case1-route-plan.md
docs/ops/runs/router-v1-revalidate-case2-route-plan.json
docs/ops/runs/router-v1-revalidate-case2-route-plan.md
docs/ops/runs/router-v1-revalidate-case3-route-plan.json
docs/ops/runs/router-v1-revalidate-case3-route-plan.md
docs/ops/runs/router-v1-revalidate-case4-route-plan.json
docs/ops/runs/router-v1-revalidate-case4-route-plan.md
docs/ops/runs/router-v1-revalidate-case5-route-plan.json
docs/ops/runs/router-v1-revalidate-case5-route-plan.md
docs/ops/runs/router-v1-revalidate-case6-route-plan.json
docs/ops/runs/router-v1-revalidate-case6-route-plan.md
docs/ops/runs/store-payment-attachment-metadata-uat-db-evidence.txt
docs/ops/runs/store-payment-attachment-metadata-uat-endpoint-smoke.json
docs/ops/runs/store-payment-closed-loop-fix-route-plan.json
docs/ops/runs/store-payment-closed-loop-fix-route-plan.md
docs/ops/runs/store-payment-controlled-uat-smoke-static.json
docs/ops/runs/store-payment-file-metadata-acl-static-check.json
docs/ops/runs/store-payment-protected-attachment-uat-page-smoke.json
docs/ops/runs/store-payment-protected-attachment-uat-ui-static-check.json
docs/ops/runs/store-payment-protected-streaming-static-check.json
docs/ops/runs/store-payment-record-proof-db-evidence.json
docs/ops/runs/store-payment-record-proof-endpoint-smoke.json
docs/ops/runs/store-payment-record-proof-page-smoke.json
docs/ops/runs/store-payment-wiring-a3-assembled-prompt.md
docs/ops/runs/sys-dict-dedupe-latest.json
docs/ops/runtime-memory/CODEX_ORCHESTRATOR_MEMORY.md
docs/ops/runtime-memory/DECISION_LOG.md
docs/ops/runtime-memory/GUARDRAILS.md
docs/ops/runtime-memory/NEXT_ACTIONS.md
docs/ops/runtime-memory/PROJECT_STATE.json
docs/ops/runtime-memory/STORE_PAYMENT_STATE.md

exec
/bin/zsh -lc 'rg --files apps/web | rg "breeding|daily|production|report"' in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
apps/web/src/app/(admin)/store/daily/page.tsx
apps/web/src/app/(admin)/analytics/production/page.tsx
apps/web/src/app/(admin)/sales2/reports/page.tsx
apps/web/src/app/(admin)/warehouse/loss-report/page.tsx
apps/web/src/app/(admin)/warehouse/daily-close/page.tsx
apps/web/src/app/(admin)/packaging/daily-report/page.tsx
apps/web/src/app/(admin)/daily-work/page.tsx
apps/web/src/app/(admin)/finance2/reports/page.tsx
apps/web/src/app/(mobile)/mobile/henreport/page.tsx
apps/web/src/app/(admin)/breeding/device-ops/page.tsx
apps/web/src/app/(admin)/breeding/daily-inbound/page.tsx
apps/web/src/app/(admin)/breeding/page.tsx
apps/web/src/app/(admin)/breeding/device/page.tsx
apps/web/src/app/(admin)/breeding/immune/page.tsx
apps/web/src/app/(admin)/breeding/egg-ledger/page.tsx
apps/web/src/app/(admin)/breeding/device/[houseCode]/page.tsx
apps/web/src/app/(admin)/breeding/med-stock/page.tsx
apps/web/src/app/(admin)/breeding/flock/page.tsx
apps/web/src/app/(admin)/breeding/daily/page.tsx
apps/web/src/app/(admin)/breeding/breeding.module.css
apps/web/src/app/(admin)/breeding/henhouse/page.tsx
apps/web/src/app/(admin)/breeding/henreport/page.tsx
apps/web/src/app/(admin)/breeding/device-alerts/page.tsx
apps/web/src/app/(admin)/breeding/medicine/page.tsx
apps/web/src/app/(admin)/breeding/feed/page.tsx

exec
/bin/zsh -lc 'rg -n "breeding/daily|日生产日报|淘汰原因|cull|elimin|淘汰" apps/web' in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
apps/web/src/lib/mobile-api.ts:257:  elimination:    number;
apps/web/src/lib/mobile-api.ts:259:  culling_reason: string | null;
apps/web/src/lib/mobile-api.ts:273:    elimination: number;
apps/web/src/lib/mobile-api.ts:283:  elimination: number;
apps/web/src/lib/mobile-api.ts:295:    avg_elimination: number;
apps/web/src/lib/dict-type-labels.ts:10:  BRD_BREED: "品种", BRD_BREED_TYPE: "品种类型", BRD_CULLING_REASON: "淘汰原因",
apps/web/src/locales/lo.json:365:  "ui.日生产日报": "ລາຍງານມື້",
apps/web/src/locales/lo.json:384:  "ui.淘汰期": "ໄລ​ຍະ​ການ​ລົບ​ລ້າງ​",
apps/web/src/locales/lo.json:392:  "ui.日生产日报录入": "ການຜະລິດປະຈໍາວັນເຂົ້າປະຈໍາວັນ",
apps/web/src/locales/lo.json:3620:  "ui.已淘汰": "ຄັດອອກ",
apps/web/src/locales/lo.json:4313:  "ui.淘汰日期必须晚于进雏日期": "ວັນທີກຳຈັດຕ້ອງຫຼັງຈາກວັນທີວາງ",
apps/web/src/locales/lo.json:4315:  "ui.预计淘汰日": "ວັນທີກຳຈັດຄາດ",
apps/web/src/locales/lo.json:6761:  "mob.brd.elimination": "ຄັດອອກ",
apps/web/src/locales/lo.json:6765:  "mob.brd.culling_reason": "ສາເຫດການຄັດອອກ",
apps/web/src/locales/lo.json:6776:  "mob.brd.elimination_total": "ລວມການຄັດອອກ",
apps/web/src/locales/lo.json:6783:  "mob.brd.culling_reason_placeholder": "ສາເຫດການຄັດອອກ (ເຊັ່ນ: ອັດຕາໄຂ່ຕ່ຳ, ບາດເຈັບ)",
apps/web/src/locales/lo.json:8285:  "ui.淘汰": "ຄັດອອກ",
apps/web/src/locales/lo.json:8286:  "ui.淘汰(羽)": "ຄັດອອກ (ໂຕ)",
apps/web/src/locales/lo.json:8287:  "ui.淘汰原因": "ສາເຫດການຄັດອອກ",
apps/web/src/locales/lo.json:8288:  "ui.淘汰数": "ຈຳນວນຄັດອອກ",
apps/web/src/locales/lo.json:8551:  "ui.计划淘汰日期": "ວັນທີຄັດອອກຕາມແຜນ",
apps/web/src/locales/en.json:365:  "ui.日生产日报": "Daily Report",
apps/web/src/locales/en.json:384:  "ui.淘汰期": "elimination period",
apps/web/src/locales/en.json:392:  "ui.日生产日报录入": "Daily production daily entry",
apps/web/src/locales/en.json:3620:  "ui.已淘汰": "Retired",
apps/web/src/locales/en.json:4313:  "ui.淘汰日期必须晚于进雏日期": "Elimination date must be after the placement date",
apps/web/src/locales/en.json:4315:  "ui.预计淘汰日": "Est. cull date",
apps/web/src/locales/en.json:4476:  "analytics.production_avg_mortality_sub": "head/day (deaths + culls)",
apps/web/src/locales/en.json:6761:  "mob.brd.elimination": "Culling",
apps/web/src/locales/en.json:6765:  "mob.brd.culling_reason": "Culling Reason",
apps/web/src/locales/en.json:6772:  "mob.brd.mortality_save_ok": "Mortality & culling records saved successfully",
apps/web/src/locales/en.json:6776:  "mob.brd.elimination_total": "Culling Total",
apps/web/src/locales/en.json:6780:  "mob.brd.no_mortality_record": "No mortality/culling records",
apps/web/src/locales/en.json:6781:  "mob.brd.no_mortality_today": "No mortality/culling data today yet",
apps/web/src/locales/en.json:6783:  "mob.brd.culling_reason_placeholder": "Culling reason (e.g. low lay rate, injury)",
apps/web/src/locales/en.json:7600:  "ui.产蛋数、死淘数及耗材等数据不能录入负数！": "Eggs laid, mortality/culling, and material data cannot be negative!",
apps/web/src/locales/en.json:8285:  "ui.淘汰": "Culls",
apps/web/src/locales/en.json:8286:  "ui.淘汰(羽)": "Culls (birds)",
apps/web/src/locales/en.json:8287:  "ui.淘汰原因": "Cull Reason",
apps/web/src/locales/en.json:8288:  "ui.淘汰数": "Cull Count",
apps/web/src/locales/en.json:8551:  "ui.计划淘汰日期": "Planned Cull Date",
apps/web/src/locales/en.json:9539:  "ui.已定位到死淘登记表单": "Navigated to mortality/culling registration form",
apps/web/src/types/packaging-terminal.ts:190:  REJECTED: '淘汰蛋',
apps/web/src/locales/zh.json:56:  "breeding.daily": "日生产日报",
apps/web/src/locales/zh.json:365:  "ui.日生产日报": "日生产日报",
apps/web/src/locales/zh.json:384:  "ui.淘汰期": "淘汰期",
apps/web/src/locales/zh.json:392:  "ui.日生产日报录入": "日生产日报录入",
apps/web/src/locales/zh.json:3620:  "ui.已淘汰": "已淘汰",
apps/web/src/locales/zh.json:4045:  "menu.brd-daily": "日生产日报",
apps/web/src/locales/zh.json:4313:  "ui.淘汰日期必须晚于进雏日期": "预计淘汰日期必须晚于进雏入栏日期",
apps/web/src/locales/zh.json:4315:  "ui.预计淘汰日": "预计淘汰日",
apps/web/src/locales/zh.json:4453:  "analytics.production_avg_mortality_sub": "只/天（死亡+淘汰）",
apps/web/src/locales/zh.json:4478:  "breeding.prefillTitle": "从所选日期+鸡舍的当日生产日报拉取按 9 档分解的产蛋数量，预填到下方表格",
apps/web/src/locales/zh.json:4498:  "breeding.eggLedgerMerged": "蛋品台账已合并到「日生产日报」，正在跳转…",
apps/web/src/locales/zh.json:4511:  "dwork.card.daily_log.desc": "存栏 / 死亡 / 淘汰 / 产蛋 / 产蛋率",
apps/web/src/locales/zh.json:4515:  "dwork.card.mortality.desc": "紧急死亡 / 淘汰登记 · 含原因",
apps/web/src/locales/zh.json:6738:  "mob.brd.elimination": "淘汰",
apps/web/src/locales/zh.json:6742:  "mob.brd.culling_reason": "淘汰原因",
apps/web/src/locales/zh.json:6753:  "mob.brd.elimination_total": "淘汰合计",
apps/web/src/locales/zh.json:6760:  "mob.brd.culling_reason_placeholder": "淘汰原因（如：产蛋率低、受伤等）",
apps/web/src/locales/zh.json:8279:  "ui.淘汰": "淘汰",
apps/web/src/locales/zh.json:8280:  "ui.淘汰(羽)": "淘汰(羽)",
apps/web/src/locales/zh.json:8281:  "ui.淘汰原因": "淘汰原因",
apps/web/src/locales/zh.json:8282:  "ui.淘汰数": "淘汰数",
apps/web/src/locales/zh.json:8548:  "ui.计划淘汰日期": "计划淘汰日期",
apps/web/src/components/layout/Sidebar.tsx:88:    { id: "brd-daily",      path: "/breeding/daily",          Icon: ClipboardList,  label: "日生产日报",   perm: "MENU_FARM_DAILY" },   // G56-C 日报写入=FARM_DAILY(对齐 POST /api/v3/farm/daily-logs)
apps/web/src/components/layout/Sidebar.tsx:94:    // G15：集蛋记录已废弃 — 蛋品统计合并到「日生产日报」（含 9 档 JSONB）
apps/web/src/components/layout/Sidebar.tsx:96:    { id: "prod-inbound",   path: "/breeding/daily-inbound",  Icon: PackagePlus,    label: "日产蛋入库",   perm: "MENU_PROD_INBOUND" },
apps/web/src/app/login/page.tsx:236:  ROLE_FARMER: "/breeding/daily",                          // 饲养员 → 日报直达
apps/web/src/app/(admin)/daily-work/page.tsx:43:  { key: 'daily_log',   title: '生产日报录入',     desc: '存栏 / 死亡 / 淘汰 / 产蛋 / 产蛋率',
apps/web/src/app/(admin)/daily-work/page.tsx:44:    icon: ClipboardList, href: '/breeding/daily?action=create&date=today',           accent: '#2563EB', perm: 'MENU_FARM_DAILY',         permOp: 'E' },
apps/web/src/app/(admin)/daily-work/page.tsx:47:  { key: 'mortality',   title: '死淘快速登记',     desc: '紧急死亡 / 淘汰登记 · 含原因',
apps/web/src/app/(admin)/daily-work/page.tsx:48:    icon: AlertTriangle, href: '/breeding/daily?action=mortality',                    accent: '#EF4444', perm: 'MENU_FARM_DAILY',         permOp: 'E' },
apps/web/src/app/(admin)/daily-work/page.tsx:57:  // G15：集蛋记录已合并到日生产日报，不再单独显示
apps/web/src/app/(admin)/daily-work/page.tsx:59:    icon: PackagePlus,   href: '/breeding/daily-inbound?action=create&date=today',    accent: '#F97316', perm: 'MENU_PROD_INBOUND',       permOp: 'C' },
apps/web/src/app/(mobile)/mobile/analytics/page.tsx:322:            <StatCard label={tr('mob.sys.daily_mortality', '日均死淘')} value={s.avg_mortality + s.avg_elimination} unit={tr('mob.sys.birds_unit', '只')} color="var(--status-danger)">
apps/web/src/app/(admin)/analytics/production/page.tsx:19:  culled_count?: number;
apps/web/src/app/(admin)/analytics/production/page.tsx:73:  const dead = Number(r.dead_count ?? 0) + Number(r.culled_count ?? 0);
apps/web/src/app/(admin)/analytics/production/page.tsx:117:      apiFetch<ReportResponse | DailyReport[]>("/api/breeding/daily-reports?limit=30", signal).then((raw) =>
apps/web/src/app/(admin)/analytics/production/page.tsx:189:              sub={t("analytics.production_avg_mortality_sub", "只/天（死亡+淘汰）")}
apps/web/src/app/(admin)/analytics/production/page.tsx:234:                          {fmtNum(Number(r.dead_count ?? 0) + Number(r.culled_count ?? 0))}
apps/web/src/app/(admin)/layout.tsx:28:  "/breeding/daily":               "menu.brd-daily",
apps/web/src/app/(mobile)/mobile/mortality/page.tsx:28:    elimination: number;
apps/web/src/app/(mobile)/mobile/mortality/page.tsx:36:      elimination: 0,
apps/web/src/app/(mobile)/mobile/mortality/page.tsx:41:    cur.elimination += Number((r as any).elimination_qty || 0);
apps/web/src/app/(mobile)/mobile/mortality/page.tsx:42:    if ((r as any).culling_reason) cur.reason = (r as any).culling_reason;
apps/web/src/app/(mobile)/mobile/mortality/page.tsx:145:        initElim[house] = v.elimination;
apps/web/src/app/(mobile)/mobile/mortality/page.tsx:209:            elimination_qty: elimEdits[house] ?? 0,
apps/web/src/app/(mobile)/mobile/mortality/page.tsx:210:            culling_reason: reasonEdits[house] || null,    // mobile 死淘共用一个 reason 字段
apps/web/src/app/(mobile)/mobile/mortality/page.tsx:389:          }}>{tr('mob.brd.elimination_total', '淘汰合计')}</div>
apps/web/src/app/(mobile)/mobile/mortality/page.tsx:498:                  {/* 淘汰行 */}
apps/web/src/app/(mobile)/mobile/mortality/page.tsx:510:                }}>{tr('mob.brd.elimination', '淘汰')}</span>
apps/web/src/app/(mobile)/mobile/mortality/page.tsx:521:                  {/* 淘汰原因（当淘汰 > 0 时展开） */}
apps/web/src/app/(mobile)/mobile/mortality/page.tsx:528:            }} placeholder={tr('mob.brd.culling_reason_placeholder', '淘汰原因（如：产蛋率低、受伤等）')} style={{
apps/web/src/app/(mobile)/mobile/henreport/page.tsx:99:          <MetaChip label={tr('mob.brd.elimination', '淘汰')} value={row.elimination} color="var(--status-warning)" />
apps/web/src/app/(mobile)/mobile/henreport/page.tsx:113:          {row.culling_reason && (
apps/web/src/app/(mobile)/mobile/henreport/page.tsx:121:              {tr('mob.brd.culling_reason', '淘汰原因')}：{row.culling_reason}
apps/web/src/app/(mobile)/mobile/henreport/page.tsx:145:        { label: tr('mob.brd.elimination', '淘汰'), value: String(totals.elimination), color: 'var(--status-warning)' },
apps/web/src/app/(admin)/breeding/daily-inbound/page.tsx:255:        }} title={t('breeding.prefillTitle', '从所选日期+鸡舍的当日生产日报拉取按 9 档分解的产蛋数量，预填到下方表格')}>
apps/web/src/app/(admin)/breeding/page.tsx:88:    label: t('ui.日生产日报', '日生产日报'),
apps/web/src/app/(admin)/breeding/page.tsx:89:    path: "/breeding/daily",
apps/web/src/app/(admin)/breeding/egg-ledger/page.tsx:8: *   · 养殖统计 → /breeding/daily（含可选 9 档 JSONB）
apps/web/src/app/(admin)/breeding/egg-ledger/page.tsx:9: *   · 销售入库 → /breeding/daily-inbound（TEMP_PRODUCTION_INBOUND 模式）
apps/web/src/app/(admin)/breeding/egg-ledger/page.tsx:11: * 路由保留作为外链兼容，自动跳转到 /breeding/daily。
apps/web/src/app/(admin)/breeding/egg-ledger/page.tsx:22:    router.replace('/breeding/daily');
apps/web/src/app/(admin)/breeding/egg-ledger/page.tsx:27:      <p>{t('breeding.eggLedgerMerged', '蛋品台账已合并到「日生产日报」，正在跳转…')}</p>
apps/web/src/app/(admin)/breeding/daily/page.tsx:15:  elimination?: unknown; // 淘汰数（主动淘汰，非自然死亡）
apps/web/src/app/(admin)/breeding/daily/page.tsx:16:  cullingReason?: unknown; // 淘汰原因
apps/web/src/app/(admin)/breeding/daily/page.tsx:34:import DictSelect from '@/components/shared-selectors/DictSelect'; // G19-A 死亡/淘汰原因字典化
apps/web/src/app/(admin)/breeding/daily/page.tsx:38:// 纯数字输入列（分前后两段，中间插入淘汰数+淘汰原因）
apps/web/src/app/(admin)/breeding/daily/page.tsx:49:  elimination: '',
apps/web/src/app/(admin)/breeding/daily/page.tsx:92:  const HEADS_ROW1 = [t('ui.班次', '班次'), t('ui.产蛋数(枚)', '产蛋数(枚)'), `🟡${t('ui.脏蛋(枚)', '脏蛋(枚)')}`, `🔴${t('ui.破损蛋(枚)', '破损蛋(枚)')}`, t('ui.死亡(羽)', '死亡(羽)'), t('ui.淘汰(羽)', '淘汰(羽)'), t('ui.淘汰原因', '淘汰原因'), t('ui.9 档分级', '9 档分级')];
apps/web/src/app/(admin)/breeding/daily/page.tsx:164:      elimination: d.elimination_qty || 0,
apps/web/src/app/(admin)/breeding/daily/page.tsx:166:      cullingReason: d.culling_reason || '',
apps/web/src/app/(admin)/breeding/daily/page.tsx:308:        elimination_qty: Number(r.elimination) || 0,
apps/web/src/app/(admin)/breeding/daily/page.tsx:309:        culling_reason: r.elimReason || null,
apps/web/src/app/(admin)/breeding/daily/page.tsx:402:    const headers = [t('ui.班次', '班次'), t('ui.产蛋数', '产蛋数'), t('ui.脏蛋', '脏蛋'), t('ui.破损蛋', '破损蛋'), t('ui.死亡', '死亡'), t('ui.淘汰数', '淘汰数'), t('ui.淘汰原因', '淘汰原因'), t('ui.饲料kg', '饲料kg'), t('ui.用水L', '用水L'), t('ui.温度', '温度'), t('ui.湿度', '湿度'), t('common.remark', '备注')];
apps/web/src/app/(admin)/breeding/daily/page.tsx:403:    const rowData = rows.map(r => [shiftLabel(r.shift), r.eggs || 0, r.dirtyEggs || 0, r.brokenEggs || 0, r.deaths || 0, r.elimination || 0, r.elimReason || '', r.feedKg || 0, r.waterL || 0, r.temp || 0, r.humidity || 0, r.remark]);
apps/web/src/app/(admin)/breeding/daily/page.tsx:476:      <PageHeader title={t('ui.日生产日报录入', '日生产日报录入')} subtitle={t('ui.按班次录入当日生产数据', '按班次录入当日生产数据')} breadcrumb={[t('ui.养殖管理', '养殖管理'), t('ui.日生产日报', '日生产日报')]} actions={<div style={{
apps/web/src/app/(admin)/breeding/daily/page.tsx:703:                {/* 死淘区（红）— 死亡/淘汰 + 各自原因走字典 */}
apps/web/src/app/(admin)/breeding/daily/page.tsx:721:                    <div style={cellStyle}><span style={labelStyle}>{t('ui.淘汰(羽)', '淘汰(羽)')}</span>{numInput('elimination', 130)}</div>
apps/web/src/app/(admin)/breeding/daily/page.tsx:722:                    <div style={cellStyle}><span style={labelStyle}>{t('ui.淘汰原因', '淘汰原因')}</span>
apps/web/src/app/(admin)/breeding/daily/page.tsx:790:              {[t('common.date', '日期'), t('ui.鸡舍', '鸡舍'), t('ui.产蛋数', '产蛋数'), t('ui.脏蛋', '脏蛋'), t('ui.破损蛋', '破损蛋'), t('ui.死亡', '死亡'), t('ui.淘汰', '淘汰'), t('ui.淘汰原因', '淘汰原因'), t('ui.饲料(kg)', '饲料(kg)'), t('ui.温度', '温度'), t('ui.湿度', '湿度'), t('common.remark', '备注')].map(h => <th key={h}>{h}</th>)}
apps/web/src/app/(admin)/breeding/daily/page.tsx:809:              color: Number(r.elimination) > 0 ? 'var(--status-warning)' : 'var(--text-primary)'
apps/web/src/app/(admin)/breeding/daily/page.tsx:810:            }}>{Number(r.elimination) > 0 ? String(r.elimination) : '—'}</td>
apps/web/src/app/(admin)/breeding/daily/page.tsx:811:                <td className={u.muted12}>{String(r.cullingReason || '—')}</td>
apps/web/src/app/(admin)/breeding/flock/page.tsx:43:  eliminationDate: '',
apps/web/src/app/(admin)/breeding/flock/page.tsx:83:      label: t('ui.已淘汰', '已淘汰')
apps/web/src/app/(admin)/breeding/flock/page.tsx:105:    label: t('ui.已淘汰', '已淘汰')
apps/web/src/app/(admin)/breeding/flock/page.tsx:177:      eliminationDate: s(r.elimination_date),
apps/web/src/app/(admin)/breeding/flock/page.tsx:232:    if (form.eliminationDate && form.inDate && form.eliminationDate <= form.inDate) {
apps/web/src/app/(admin)/breeding/flock/page.tsx:237:        message: t('ui.淘汰日期必须晚于进雏日期', '预计淘汰日期必须晚于进雏入栏日期')
apps/web/src/app/(admin)/breeding/flock/page.tsx:253:      elimination_date: form.eliminationDate || null,
apps/web/src/app/(admin)/breeding/flock/page.tsx:332:    key: 'eliminationDate',
apps/web/src/app/(admin)/breeding/flock/page.tsx:333:    title: t('ui.预计淘汰日', '预计淘汰日'),
apps/web/src/app/(admin)/breeding/flock/page.tsx:337:      const d = row._raw?.elimination_date;
apps/web/src/app/(admin)/breeding/flock/page.tsx:457:            <div><label className={s.lbl}>{t('ui.计划淘汰日期', '计划淘汰日期')}</label><input type="date" value={form.eliminationDate} onChange={e => setForm({
apps/web/src/app/(admin)/breeding/flock/page.tsx:459:              eliminationDate: e.target.value
apps/web/src/app/(admin)/breeding/flock/page.tsx:498:              <option value="RETIRED">🏁 {t('ui.已淘汰', '已淘汰')}</option>
apps/web/src/app/(admin)/breeding/henreport/page.tsx:33:  elimination: number;
apps/web/src/app/(admin)/breeding/henreport/page.tsx:35:  culling_reason: string | null;
apps/web/src/app/(admin)/breeding/henreport/page.tsx:47:    elimination: number;
apps/web/src/app/(admin)/breeding/henreport/page.tsx:139:        label: t('ui.淘汰', '淘汰'),
apps/web/src/app/(admin)/breeding/henreport/page.tsx:140:        value: totals.elimination.toLocaleString(),
apps/web/src/app/(admin)/breeding/henreport/page.tsx:201:              {[t('ui.栋舍', '栋舍'), t('ui.批次号', '批次号'), t('ui.存栏数(羽)', '存栏数(羽)'), t('ui.日龄(天)', '日龄(天)'), t('ui.产蛋(枚)', '产蛋(枚)'), t('ui.产蛋率', '产蛋率'), t('ui.死亡(羽)', '死亡(羽)'), t('ui.淘汰(羽)', '淘汰(羽)'), t('ui.损耗合计', '损耗合计'), t('ui.饲料(kg)', '饲料(kg)'), t('ui.淘汰原因', '淘汰原因')].map((h, hi) => <th key={hi} style={{
apps/web/src/app/(admin)/breeding/henreport/page.tsx:233:                color: row.elimination > 0 ? 'var(--status-warning)' : 'var(--text-secondary)'
apps/web/src/app/(admin)/breeding/henreport/page.tsx:234:              }}>{row.elimination}</td>
apps/web/src/app/(admin)/breeding/henreport/page.tsx:244:                  <td className={u.muted12}>{row.culling_reason ?? '—'}</td>
apps/web/src/app/(admin)/breeding/henreport/page.tsx:285:            }}>{totals.elimination}</td>

codex
定位到直接原因的可疑点：录入表单的淘汰原因已经用字典下拉，但近期记录表格直接输出 `cullingReason` 原始值，所以会露出 `INJURY / AGE / LOW_PRODUCTION` 这类 code。接下来读该页面上下文，尽量在前端渲染层补标签映射，不碰 API 和数据。
exec
/bin/zsh -lc "sed -n '1,220p' 'apps/web/src/app/(admin)/breeding/daily/page.tsx'" in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
'use client';

import { useState, useEffect, useRef, useCallback, Fragment, useMemo } from 'react';
import { useSearchParams } from 'next/navigation';
import u from "@/styles/uix-utils.module.css";
interface DailyReport {
  [key: string]: unknown;
  date?: unknown;
  house?: unknown;
  houseName?: unknown;
  eggs?: unknown;
  dirtyEggs?: unknown;
  brokenEggs?: unknown;
  deaths?: unknown;
  elimination?: unknown; // 淘汰数（主动淘汰，非自然死亡）
  cullingReason?: unknown; // 淘汰原因
  feedKg?: unknown;
  waterL?: unknown;
  temp?: unknown;
  humidity?: unknown;
  remark?: unknown;
}
import PageHeader from '@/components/PageHeader';
import { useCrud } from '@/hooks/useCrud';
import { usePermission } from '@/hooks/usePermission';
import { useToast } from '@/contexts/ToastContext';
import { useDialog } from '@/contexts/DialogContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { Save, Download, Cpu, CheckCircle, X as XIcon } from 'lucide-react';
import s from '@/components/ui/admin-ui.module.css';
import { primaryActionButton, secondaryActionButton } from '@/components/design-system/cockpit-styles';
import { HouseSelector } from '@/components/shared-selectors/MasterDataSelectors'; // G4-E 鸡舍主数据
import { useDictOptions } from '@/hooks/useDictOptions'; // 班次字典化
import DictSelect from '@/components/shared-selectors/DictSelect'; // G19-A 死亡/淘汰原因字典化
import { useProductGrades } from '@/hooks/useProductGrades'; // G14 9 档分级
import { ModalV2 } from '@/components/design-system/dialogs/ModalV2';

// 纯数字输入列（分前后两段，中间插入淘汰数+淘汰原因）
const FIELDS_A = ['eggs', 'dirtyEggs', 'brokenEggs', 'deaths'] as const;
const FIELDS_B = ['feedKg', 'waterL', 'selfUse', 'temp', 'humidity'] as const;
const mkRow = (id: number, shift: string) => ({
  id,
  shift,
  eggs: '',
  dirtyEggs: '',
  brokenEggs: '',
  deaths: '',
  mortalityReason: '',   // G19-A 死亡原因（DictSelect BRD_MORTALITY_REASON）
  elimination: '',
  elimReason: '',
  // 手机端 mortality 写入的字段
  feedKg: '',
  waterL: '',
  selfUse: '',  // G9：自用蛋数（孟赛 Excel 实有列）
  temp: '',
  humidity: '',
  remark: '',
  // G14：按 9 档分解的产蛋数量（可选；填了则提交时携带 eggs_by_grade JSON）
  gradeQty: {} as Record<string, string>,
});
export default function DailyPage() {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
  const toast = useToast();
  const {
    showConfirm
  } = useDialog();
  // G23-B：can(role[]) → PBAC（menu+op）；保留 can 兼容性
  const {
    can, canCreate, canEdit, canExport
  } = usePermission('MENU_FARM_DAILY');
  const {
    t
  } = useLanguage();
  const today = new Date().toISOString().split('T')[0];
  const historyRef = useRef<HTMLHeadingElement>(null);
  const formRef = useRef<HTMLDivElement>(null);

  // /daily-work?action=create / mortality 接入：mount 后自动滚到表单 + 提示
  const sp = useSearchParams();
  useEffect(() => {
    const action = sp.get('action');
    if (action === 'create' || action === 'mortality') {
      setTimeout(() => {
        formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        toast.success(action === 'mortality' ? t('ui.已定位到死淘登记表单', '已定位到死淘登记表单') : t('ui.已定位到日报录入表单', '已定位到日报录入表单'));
      }, 300);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // G14：表头分两行 — 第一行业务核心 6 列，第二行次要 5 列
  const HEADS_ROW1 = [t('ui.班次', '班次'), t('ui.产蛋数(枚)', '产蛋数(枚)'), `🟡${t('ui.脏蛋(枚)', '脏蛋(枚)')}`, `🔴${t('ui.破损蛋(枚)', '破损蛋(枚)')}`, t('ui.死亡(羽)', '死亡(羽)'), t('ui.淘汰(羽)', '淘汰(羽)'), t('ui.淘汰原因', '淘汰原因'), t('ui.9 档分级', '9 档分级')];
  const HEADS_ROW2 = [t('ui.饲料(kg)', '饲料(kg)'), t('ui.用水(L)', '用水(L)'), t('ui.自用蛋(枚)', '自用蛋(枚)'), t('ui.温度(℃)', '温度(℃)'), t('ui.湿度(%)'
```
