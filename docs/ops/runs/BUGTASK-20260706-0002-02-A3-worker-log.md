# Agent Worker Log

| Field | Value |
| --- | --- |
| Task ID | BUGTASK-20260706-0002-02-A3 |
| Agent | A3-Backend-Critical-Path |
| Dry run | No |
| Exit code | 0 |

## Command

```bash
node scripts/ops/run-agent-task.mjs --agent A3-Backend-Critical-Path --worktree /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path --prompt docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md --task-contract docs/ops/runs/BUGTASK-20260706-0002-02-A3-contract.md --assembled-prompt-output docs/ops/runs/BUGTASK-20260706-0002-02-A3-worker-assembled-prompt.md --require-approval-token APPROVE_AGENT_EXECUTION --skip-baseline-autopilot --allow-ops-runtime-dirty
```

## Stdout

```text
Agent: A3-Backend-Critical-Path
Worktree: /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
Branch: w5-a3-backend-critical-path
Prompt: docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md
Task contract: docs/ops/runs/BUGTASK-20260706-0002-02-A3-contract.md
Assembled prompt: docs/ops/runs/BUGTASK-20260706-0002-02-A3-worker-assembled-prompt.md
Assembled prompt chars: 31311
Codex command: codex exec -C /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path --sandbox workspace-write -
Codex timeout ms: 600000
Run log: /Users/mac/phoenix-erp-worktrees/codex-orchestrator/docs/ops/runs/2026-07-07T10-52-06-188Z-A3-Backend-Critical-Path.md
PASS WITH CONDITIONS.

Fixed backend route `/api/v3/iot/devices/all-summary`: it no longer returns hardcoded `null` for `feedToday` / `waterToday`. It now computes today usage from IoT cumulative readings (`2488`/`2532` feed, `2484` water) using today-minus-yesterday aggregate values, with realtime snapshot fallback.

Changed:
- [iot-v3.controller.ts](/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path/apps/api/src/modules/iot/iot-v3.controller.ts:90)
- [A3 report](/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path/docs/ops/BUG-20260706-0002_A3_BACKEND_CRITICAL_PATH_REPORT.md:1)

Validation:
- `cd apps/api && ./node_modules/.bin/tsc --noEmit` passed
- `cd apps/api && ./node_modules/.bin/jest --runInBand` passed: 6 suites, 54 tests
- `pnpm test -- --runInBand` was blocked by the runtime trying to install dependencies with network/TTY restrictions before reaching Jest

Commit was attempted but blocked by sandbox permissions: this worktree’s gitdir points to `/Users/mac/phoenix-erp/.git/worktrees/a3-backend-critical-path`, and the sandbox cannot write `index.lock` there. No push/deploy/migration/database write was performed.
Baseline autopilot skipped by caller; caller must run lifecycle hook.

```

## Stderr

```text
2026-07-07T10:47:14.353086Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt: maximum of 3 prompts is supported path=/Users/mac/.codex/plugins/cache/openai-primary-runtime/template-creator/26.630.12135/.codex-plugin/plugin.json
2026-07-07T10:47:14.354748Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt: maximum of 3 prompts is supported path=/Users/mac/.codex/plugins/cache/openai-primary-runtime/template-creator/26.630.12135/.codex-plugin/plugin.json
OpenAI Codex v0.142.5
--------
workdir: /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
model: gpt-5.5
provider: openai
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR]
reasoning effort: high
reasoning summaries: none
session id: 019f3c30-6c44-7432-8b1d-9977b48292fd
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

Source bug: BUG-20260706-0002
Source repair task: BUGTASK-20260706-0002
Assigned agent: A3-Backend-Critical-Path

## Issue

运营工作台不显示今日饲料消耗、今日用水

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
  "bugNo": "BUG-20260706-0002",
  "route": "/home",
  "title": "运营工作台不显示今日饲料消耗、今日用水",
  "taskNo": "BUGTASK-20260706-0002",
  "context": {
    "attachments": [
      {
        "sha256": "93350645acbe845fe9c43daf43fcd5af48a2c794a4380b5d71d066fe06a74ab0",
        "fileName": "01-1783324231815-108b018c.png",
        "mimeType": "image/png",
        "sizeBytes": 1115335,
        "originalName": "pasted-screenshot-1783324080138-1.png",
        "relativePath": "storage/bug-reports/2026/07/06/BUG-20260706-0002/01-1783324231815-108b018c.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260706-0002/attachments/01-1783324231815-108b018c.png"
      }
    ],
    "clientContext": {
      "language": "zh-CN",
      "timezone": "Asia/Shanghai",
      "viewport": {
        "width": 1600,
        "height": 865
      },
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36",
      "capturedAt": "2026-07-06T07:50:31.817Z",
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
          "pasted-screenshot-1783324080138-1.png",
          "退出",
          "·",
          "2026年7月6日星期一",
          "下午好，金凤凰总控",
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
          "主数据健康度",
          "/ 100",
          "在管 798 条",
          "风险 3 条",
          "业务中心",
          "· 一键直达（8）",
          "01:00"
        ],
        "interactiveElements": [
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__groupHeader.sidebar-module__C8A-ya__groupActive",
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
            "path": ".sidebar-module__C8A-ya__subItem.",
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
            "path": ".sidebar-module__C8A-ya__subItem.",
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
              "x": 767,
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
            "tag": "a",
            "path": "",
            "rect": {
              "h": 36,
              "w": 148,
              "x": 293,
              "y": 204
            },
            "label": "进入采购中心",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 36,
              "w": 117,
              "x": 449,
              "y": 204
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
              "y": 387
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
              "y": 631
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
              "y": 631
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
              "y": 631
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
              "y": 631
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
              "y": 367
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
              "y": 541
            },
            "label": "需立即关注 2 项高危告警 · 共 4 条",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 147,
              "w": 487,
              "x": 1060,
              "y": 710
            },
            "label": "主数据健康度 93 / 100 在管 798 条 风险 3 条",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 58,
              "w": 172,
              "x": 283,
              "y": 922
            },
            "label": "客户中心",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 58,
              "w": 172,
              "x": 463,
              "y": 922
            },
            "label": "供应商中心",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 58,
              "w": 172,
              "x": 642,
              "y": 922
            },
            "label": "采购中心",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 58,
              "w": 172,
              "x": 822,
              "y": 922
            },
            "label": "销售中心",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 58,
              "w": 172,
              "x": 1001,
              "y": 922
            },
            "label": "财务中心",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 58,
              "w": 172,
              "x": 1181,
              "y": 922
            },
            "label": "库存中心",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 58,
              "w": 172,
              "x": 1360,
              "y": 922
            },
            "label": "审批工作台",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 58,
              "w": 172,
              "x": 283,
              "y": 988
            },
            "label": "数据质量",
            "disabled": false
          }
        ]
      },
      "devicePixelRatio": 2
    },
    "consoleErrors": [
      {
        "type": "console.error",
        "message": "useCrud [brd_houses] Error: 「brd_houses」存在重复值，请检查后重试",
        "timestamp": "2026-07-06T07:00:56.780Z"
      }
    ],
    "failedRequests": [
      {
        "url": "/api/farm-device/cabins/daily-report/generate",
        "method": "POST",
        "status": 404,
        "requestId": "",
        "timestamp": "2026-07-06T06:41:01.990Z",
        "responseExcerpt": "{\"code\":404,\"message\":\"Cannot POST /api/farm-device/cabins/daily-report/generate\",\"error\":\"Not Found\",\"statusCode\":404}"
      },
      {
        "url": "/api/crud/brd_houses",
        "method": "POST",
        "status": 400,
        "requestId": "",
        "timestamp": "2026-07-06T07:00:56.779Z",
        "responseExcerpt": "{\"code\":400,\"message\":\"「brd_houses」存在重复值，请检查后重试\",\"error\":\"Bad Request\",\"statusCode\":400}"
      }
    ],
    "localEvidence": {
      "localAttachments": [
        {
          "fileName": "01-1783324231815-108b018c.png",
          "originalName": "pasted-screenshot-1783324080138-1.png",
          "mimeType": "image/png",
          "sourceEndpoint": "/api/bug-intake/reports/BUG-20260706-0002/attachments/01-1783324231815-108b018c.png",
          "localPath": "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260706-155325/BUG-20260706-0002/attachments/01-1783324231815-108b018c.png",
          "sizeBytes": 1115335
        }
      ],
      "localAttachmentPaths": [
        "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260706-155325/BUG-20260706-0002/attachments/01-1783324231815-108b018c.png"
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
    "source_bug_no": "BUG-20260706-0002",
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
    "source_repair_task_no": "BUGTASK-20260706-0002"
  },
  "createdAt": "2026-07-06T07:51:46.230Z",
  "createdBy": "admin",
  "moduleCode": "_____",
  "suggestedOwner": "_____",
  "repairGuardrails": {
    "autoRepairExecuted": false,
    "noProductionDeploy": true,
    "noDbWriteWithoutGate": true,
    "requiresHumanApproval": true
  },
  "acceptanceCriteria": "",
  "agentPlanGeneratedAt": "2026-07-06T07:51:48.241Z",
  "agentPlanGeneratedBy": "admin",
  "agentExecutionApproval": {
    "approved": true,
    "approvedAt": "2026-07-06T07:51:51.270Z",
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

- /Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260706-155325/BUG-20260706-0002/attachments/01-1783324231815-108b018c.png

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

2026-07-07T10:47:14.676535Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt: maximum of 3 prompts is supported path=/Users/mac/.cache/codex-runtimes/codex-primary-runtime/plugins/openai-primary-runtime/plugins/template-creator/.codex-plugin/plugin.json
2026-07-07T10:47:14.785528Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt[0]: prompt must be at most 128 characters path=/Users/mac/.codex/.tmp/plugins/plugins/ngs-analysis/.codex-plugin/plugin.json
2026-07-07T10:47:14.891276Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:14.891290Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:14.891931Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:14.891937Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:14.892280Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:14.892287Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:14.892636Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:14.892641Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:14.892957Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:14.892961Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:14.893648Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:14.893655Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:15.521873Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt: maximum of 3 prompts is supported path=/Users/mac/.codex/plugins/cache/openai-primary-runtime/template-creator/26.630.12135/.codex-plugin/plugin.json
2026-07-07T10:47:15.523182Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt: maximum of 3 prompts is supported path=/Users/mac/.codex/plugins/cache/openai-primary-runtime/template-creator/26.630.12135/.codex-plugin/plugin.json
2026-07-07T10:47:15.847399Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt[0]: prompt must be at most 128 characters path=/Users/mac/.codex/.tmp/plugins/plugins/ngs-analysis/.codex-plugin/plugin.json
2026-07-07T10:47:15.849430Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt[0]: prompt must be at most 128 characters path=/Users/mac/.codex/.tmp/plugins/plugins/ngs-analysis/.codex-plugin/plugin.json
2026-07-07T10:47:16.915832Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt: maximum of 3 prompts is supported path=/Users/mac/.cache/codex-runtimes/codex-primary-runtime/plugins/openai-primary-runtime/plugins/template-creator/.codex-plugin/plugin.json
2026-07-07T10:47:16.923036Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt[0]: prompt must be at most 128 characters path=/Users/mac/.codex/.tmp/plugins/plugins/ngs-analysis/.codex-plugin/plugin.json
2026-07-07T10:47:16.936556Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:16.936575Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:16.937000Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:16.937008Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:16.937389Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:16.937396Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:16.937767Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:16.937773Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:16.938160Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:16.938165Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:16.938992Z  WARN codex_core_skills::loader: ignoring interface.icon_small: icon path with '..' must resolve under plugin assets/
2026-07-07T10:47:16.938997Z  WARN codex_core_skills::loader: ignoring interface.icon_large: icon path with '..' must resolve under plugin assets/
codex
我先做合同要求的环境门禁检查，只读取当前目录、分支、状态和最近提交；如果不满足就停止。
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
411f204a (HEAD -> w5-a3-backend-critical-path, w5-a4-frontend-uat-smoke, main) docs(ops): record baseline lifecycle report
a433dfe0 feat(web): record A4-Frontend-UAT-Smoke result
68dd814d docs(ops): record baseline lifecycle report
2f8a48b5 feat(api): record A3-Backend-Critical-Path result
9d683b03 docs(ops): record production rbac atomicity clearance
e57099f1 fix(ops): dedupe role permission matrix repair plan
bee9bae9 docs(ops): rescore production readiness hardening plan
6af407d7 fix(mobile): show device diagnostics when data is unavailable

exec
/bin/zsh -lc 'git status --short' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
2026-07-07T10:47:23.156031Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt: maximum of 3 prompts is supported path=/Users/mac/.cache/codex-runtimes/codex-primary-runtime/plugins/openai-primary-runtime/plugins/template-creator/.codex-plugin/plugin.json
2026-07-07T10:47:23.161514Z  WARN codex_core_plugins::manifest: ignoring interface.defaultPrompt[0]: prompt must be at most 128 characters path=/Users/mac/.codex/.tmp/plugins/plugins/ngs-analysis/.codex-plugin/plugin.json
codex
门禁通过：目录、分支和工作区清洁都符合。现在进入 dry-run 诊断，我会先定位 `/home` 运营工作台背后的 API 和“今日饲料/用水”字段来源，不改文件。
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
/bin/zsh -lc "rg -n \"home|dashboard|workbench|运营工作台|经营概览|farm\" apps/api/src apps/web/src apps/web/app -g '"'!**/node_modules/**'"'" in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 exited 2 in 0ms:
rg: apps/web/app: No such file or directory (os error 2)
apps/api/src/app.module.ts:21:import { FarmModule } from './modules/farm/farm.module';
apps/web/src/lib/workflow-templates.ts:175:    key: "farm_medicine",
apps/web/src/lib/workflow-templates.ts:190:    approvals: [{ id: "vet_review", name: "驻场兽医审批", role: "ROLE_VET" }, { id: "farm_review", name: "养殖场长确认", role: "ROLE_FARM_MGR" }],
apps/web/src/lib/shareholder-api.ts:107:  dashboard: () => request<{ scope: string; count?: number; projects: ShrProject[]; note?: string }>('/shareholders/dashboard'),
apps/web/src/lib/impersonate.ts:56:  window.location.href = "/dashboard";
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:15:@Index('idx_fin_ar_ledger_farm_period', ['farmCode', 'periodDate'])
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:17:@Unique('uq_fin_ar_ledger', ['farmCode', 'counterpartyName', 'periodDate'])
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:23:  @Column({ name: 'farm_code', type: 'varchar', length: 32 })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:24:  farmCode: string;
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:26:  @Column({ name: 'farm_name', type: 'varchar', length: 64 })
apps/api/src/modules/finance-v2/entities/fin-ar-ledger.entity.ts:27:  farmName: string;
apps/web/src/lib/design-tokens.ts:294:  dashboard:   '#1F3864', // 驾驶舱—品牌蓝
apps/web/src/lib/mobile-api.ts:140:  farm_code?:       string;
apps/web/src/lib/mobile-api.ts:308:  getKpi: () => get<KpiData>('/api/dashboard/kpi'),
apps/web/src/lib/mobile-api.ts:328:    get<DeviceAlert[]>('/api/farm-device/alerts?status=OPEN'),
apps/web/src/lib/mobile-api.ts:336:    get<FeedLedgerRow[]>(`/api/farm/feed/ledger?date=${date}`),
apps/web/src/lib/mobile-api.ts:340:    fetch((process.env.NEXT_PUBLIC_API_BASE || '') + '/api/farm/feed/ledger', {
apps/web/src/lib/mobile-api.ts:351:    getCached('feedHousesDetail', () => get<Array<{ house_code: string; house_name: string; capacity?: number | null }>>('/api/farm/feed/houses'), 5 * 60_000)
apps/web/src/lib/mobile-api.ts:363:  /** G109 场长新建本场鸡舍（farm/site/company 后端按 scope 自动派生）。返回信封 {code,data,msg} */
apps/web/src/lib/mobile-api.ts:365:    post<{ code: number; data?: { house_code: string }; msg?: string }>('/api/farm/feed/houses', body),
apps/web/src/lib/mobile-api.ts:381:    get<EggStockRow[]>('/api/farm/egg/stock'),
apps/web/src/lib/mobile-api.ts:385:    get<EggLedgerEntry[]>(`/api/farm/egg/ledger?start=${start}&end=${end}`),
apps/web/src/lib/mobile-api.ts:389:    post('/api/farm/egg/inbound', { date, items, operator }),
apps/web/src/lib/mobile-api.ts:393:    post('/api/farm/egg/outbound', { date, items, operator, ref_no: refNo }),
apps/web/src/lib/mobile-api.ts:397:    post('/api/farm/egg/write-off', { date, items, operator }),
apps/web/src/lib/mobile-api.ts:401:    getCached('farmCustomers', () => get<FarmCustomer[]>('/api/farm/sales/customers'), 5 * 60_000),
apps/web/src/lib/mobile-api.ts:405:    get<FarmSaleRecord[]>(`/api/farm/sales?date=${date}`),
apps/web/src/lib/mobile-api.ts:415:  }) => post<{ order_no: string; total_amount: number }>('/api/farm/sales', data),
apps/web/src/lib/mobile-api.ts:419:    post(`/api/farm/sales/${orderNo}/cancel`, { operator }),
apps/web/src/lib/mobile-api.ts:423:    getCached('medStock', () => get<MedStockRow[]>('/api/farm/medicine/stock'), 60_000),
apps/web/src/lib/mobile-api.ts:427:    get<MedLedgerEntry[]>(`/api/farm/medicine/ledger?start=${start}&end=${end}`),
apps/web/src/lib/mobile-api.ts:431:    post('/api/farm/medicine/inbound', { date, items, operator }),
apps/web/src/lib/mobile-api.ts:435:    post('/api/farm/medicine/outbound', { date, items, operator }),
apps/web/src/lib/mobile-api.ts:439:    get<DailyHenReport>(`/api/v3/farm/daily-hen-report?date=${date}`),
apps/web/src/lib/mobile-api.ts:443:    get<FarmTrend>(`/api/v3/farm/trend?days=${days}`),
apps/web/src/lib/mobile-api.ts:458:  }) => post<{ code: number; msg: string }>('/api/v3/farm/daily-logs', payload),
apps/web/src/lib/mobile-roles.ts:127:  dashboard: {
apps/web/src/lib/mobile-roles.ts:273:  dashboard: {
apps/api/src/auth/auth.service.ts:122:         -- 绑定的生产场站（brd_farms.farm_code）
apps/api/src/auth/auth.service.ts:124:           (SELECT json_agg(ufs.farm_code) FROM sys_user_farm_scopes ufs WHERE ufs.user_id = u.user_id),
apps/api/src/auth/auth.service.ts:126:         ) AS bound_farm_codes,
apps/api/src/auth/auth.service.ts:283:      boundFarmCodes: user.bound_farm_codes || [],
apps/web/src/hooks/useMobilePermission.ts:24: * - allowed=false 且 loading=false → 自动重定向到 /mobile/home
apps/web/src/hooks/useMobilePermission.ts:42:      router.replace('/mobile/home');
apps/api/src/database/migrations/1782052418112-RepairRolePermissionMatrixAtomicity.ts:17:        ('MENU_PRC2_DASHBOARD', '采购看板', NULL, 'PRC', 'MENU_PRC2_MASTER', 58, 'LayoutDashboard', '/procurement2/dashboard'),
apps/api/src/modules/product-master/controllers/lookup.controller.ts:43:    farmCodes: string[];
apps/api/src/modules/product-master/controllers/lookup.controller.ts:49:      if (!user) return { isGlobal: false, companyCodes: [], farmCodes: [], warehouseCodes: [], allowedSiteCodes: [] };
apps/api/src/modules/product-master/controllers/lookup.controller.ts:57:        farmCodes: scope.allowedFarmCodes ?? [],   // G87 场授权清单
apps/api/src/modules/product-master/controllers/lookup.controller.ts:62:      return { isGlobal: false, companyCodes: [], farmCodes: [], warehouseCodes: [], allowedSiteCodes: [] };
apps/api/src/modules/product-master/controllers/lookup.controller.ts:516:  /** GET /api/lookup/farms — 养殖场下拉（替代 /crud/brd_farms） */
apps/api/src/modules/product-master/controllers/lookup.controller.ts:517:  @Get('farms')
apps/api/src/modules/product-master/controllers/lookup.controller.ts:518:  async farms() {
apps/api/src/modules/product-master/controllers/lookup.controller.ts:519:    const rows: Array<{ farmCode: string; companyCode: string | null }> = await this.cached('farms', () => this.em.query(
apps/api/src/modules/product-master/controllers/lookup.controller.ts:520:      `SELECT farm_code AS "farmCode", farm_name AS "farmName", location, status,
apps/api/src/modules/product-master/controllers/lookup.controller.ts:522:         FROM brd_farms
apps/api/src/modules/product-master/controllers/lookup.controller.ts:524:         ORDER BY farm_code`,
apps/api/src/modules/product-master/controllers/lookup.controller.ts:528:    const { isGlobal, companyCodes, farmCodes } = await this.resolveCompanyScope('MENU_BREEDING');
apps/api/src/modules/product-master/controllers/lookup.controller.ts:530:    if (farmCodes.length === 0 && companyCodes.length === 0) return { code: 200, data: [] };
apps/api/src/modules/product-master/controllers/lookup.controller.ts:532:    if (farmCodes.length > 0) out = out.filter(r => farmCodes.includes(r.farmCode));
apps/api/src/modules/product-master/controllers/lookup.controller.ts:537:  /** GET /api/lookup/houses?farmCode=&siteCode= — 鸡舍下拉
apps/api/src/modules/product-master/controllers/lookup.controller.ts:541:  async houses(@Query('farmCode') farmCode?: string, @Query('siteCode') siteCode?: string) {
apps/api/src/modules/product-master/controllers/lookup.controller.ts:546:      && scope.farmCodes.length === 0
apps/api/src/modules/product-master/controllers/lookup.controller.ts:553:    if (farmCode) { params.push(farmCode); conds.push(`h.farm_code=$${params.length}`); }
apps/api/src/modules/product-master/controllers/lookup.controller.ts:557:      if (scope.farmCodes.length > 0) {
apps/api/src/modules/product-master/controllers/lookup.controller.ts:558:        params.push(scope.farmCodes);
apps/api/src/modules/product-master/controllers/lookup.controller.ts:559:        scopeConds.push(`h.farm_code = ANY($${params.length})`);
apps/api/src/modules/product-master/controllers/lookup.controller.ts:569:            FROM brd_farms f
apps/api/src/modules/product-master/controllers/lookup.controller.ts:570:           WHERE f.farm_code = h.farm_code
apps/api/src/modules/product-master/controllers/lookup.controller.ts:578:              h.farm_code AS "farmCode", h.site_code AS "siteCode", h.house_type AS "houseType",
apps/api/src/modules/product-master/controllers/lookup.controller.ts:588:  /** GET /api/lookup/flocks?houseCode=&farmCode=&siteCode= — 鸡群下拉 */
apps/api/src/modules/product-master/controllers/lookup.controller.ts:590:  async flocks(@Query('houseCode') houseCode?: string, @Query('farmCode') farmCode?: string, @Query('siteCode') siteCode?: string) {
apps/api/src/modules/product-master/controllers/lookup.controller.ts:595:      && scope.farmCodes.length === 0
apps/api/src/modules/product-master/controllers/lookup.controller.ts:603:    if (farmCode)  { params.push(farmCode);  conds.push(`fl.farm_code=$${params.length}`); }
apps/api/src/modules/product-master/controllers/lookup.controller.ts:607:      if (scope.farmCodes.length > 0) {
apps/api/src/modules/product-master/controllers/lookup.controller.ts:608:        params.push(scope.farmCodes);
apps/api/src/modules/product-master/controllers/lookup.controller.ts:609:        scopeConds.push(`fl.farm_code = ANY($${params.length})`);
apps/api/src/modules/product-master/controllers/lookup.controller.ts:625:            FROM brd_farms f
apps/api/src/modules/product-master/controllers/lookup.controller.ts:626:           WHERE f.farm_code = fl.farm_code
apps/api/src/modules/product-master/controllers/lookup.controller.ts:633:      `SELECT fl.flock_no AS "flockNo", fl.house_code AS "houseCode", fl.farm_code AS "farmCode",
apps/web/src/__tests__/mobile-roles.test.ts:160:    // DRIVER can see dashboard (read) and delivery (write) but NOT feed.
apps/web/src/__tests__/mobile-roles.test.ts:161:    expect(pages).toContain('dashboard');
apps/api/src/modules/finance-v2/services/ar-ledger.service.ts:30:    const farms = await this.ds.query(
apps/api/src/modules/finance-v2/services/ar-ledger.service.ts:31:      `SELECT DISTINCT farm_code AS "farmCode", farm_name AS "farmName" FROM fin_ar_ledger ${sf} ORDER BY farm_code`,
apps/api/src/modules/finance-v2/services/ar-ledger.service.ts:38:    return { farms, periods };
apps/api/src/modules/finance-v2/services/ar-ledger.service.ts:43:   * @param filters farmCode? / periodDate?（YYYY-MM-DD）
apps/api/src/modules/finance-v2/services/ar-ledger.service.ts:45:  async list(user: any, filters: { farmCode?: string; periodDate?: string }) {
apps/api/src/modules/finance-v2/services/ar-ledger.service.ts:52:    if (filters.farmCode)   { where.push(`farm_code = $${i}`); params.push(filters.farmCode); i++; }
apps/api/src/modules/finance-v2/services/ar-ledger.service.ts:58:      `SELECT id, farm_code AS "farmCode", farm_name AS "farmName", company_code AS "companyCode",
apps/api/src/modules/finance-v2/services/ar-ledger.service.ts:66:        ORDER BY farm_code, period_date DESC, counterparty_code NULLS LAST, counterparty_name`,
apps/api/src/database/migrations/1782720000000-SeedStorePaymentAndSales2DashboardMenus.ts:19: *   均为静态矩阵误报——FIN_ACCT 实持 AR/AP/EXPENSE 增改权；dashboard/采购看板服务层已按
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:263:  //   3. 按 (farm_code=companyCode, counterparty_name, period_date) upsert,
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:281:    farmCode: string;
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:290:    const farmCode = map.companyCode;
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:294:      return { companyCode, period, periodDate, farmCode, newRows: [], changedRows: [], unchangedCount: 0 };
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:310:      .where('l.farm_code = :farmCode AND l.period_date = :periodDate', { farmCode, periodDate })
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:333:    return { companyCode, period, periodDate, farmCode, newRows, changedRows, unchangedCount };
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:352:    farmCode: string;
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:362:    const farmCode = map.companyCode;
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:363:    const farmName = map.companyName;
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:393:      // 按 uq_fin_ar_ledger (farm_code, counterparty_name, period_date) upsert
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:398:            farmCode,
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:399:            farmName,
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:415:            conflictPaths: ['farmCode', 'counterpartyName', 'periodDate'],
apps/api/src/modules/chanjet/chanjet-ar-sync.service.ts:429:    return { companyCode, period, periodDate, farmCode, dryRun, upserted, skipped, source };
apps/api/src/modules/farm/farm-sales.controller.ts:2:import { FarmSalesService, CreateFarmSaleDto } from './farm-sales.service';
apps/api/src/modules/farm/farm-sales.controller.ts:8:@Controller('api/farm/sales')
apps/api/src/modules/farm/farm-sales.controller.ts:14:  /** GET /api/farm/sales/customers */
apps/api/src/modules/farm/farm-sales.controller.ts:20:  /** GET /api/farm/sales?date=YYYY-MM-DD — G108-B：按 store_code 收口数据范围 */
apps/api/src/modules/farm/farm-sales.controller.ts:28:  /** POST /api/farm/sales */
apps/api/src/modules/farm/farm-sales.controller.ts:36:  /** POST /api/farm/sales/:orderNo/cancel */
apps/api/src/modules/finance-v2/services/financial-reports.service.ts:87:               SELECT DISTINCT ON (farm_code, counterparty_code) closing_amount_base
apps/api/src/modules/finance-v2/services/financial-reports.service.ts:89:               ORDER BY farm_code, counterparty_code, period_date DESC
apps/api/src/modules/generic-crud/generic-crud.controller.ts:127:    //   主档表（houses/farms/flocks 档案）→ MENU_FARM_MASTER（高权限）
apps/api/src/modules/generic-crud/generic-crud.controller.ts:130:    if (table === 'brd_houses' || table === 'brd_farms') return 'MENU_FARM_MASTER';
apps/api/src/modules/generic-crud/generic-crud.controller.ts:231:    // 历史上 brd_* 一律按 farm_code 过滤，但 userStoreCode 是 SITE 维度（如
apps/api/src/modules/generic-crud/generic-crud.controller.ts:232:    // 'SITE-MENGSAI-LAYER'），而 brd_daily_logs.farm_code 是 farm 维度（如
apps/api/src/modules/generic-crud/generic-crud.controller.ts:234:    // MDM-1 后 brd_daily_logs 有 site_code、brd_farms 有 mapped_site_code，
apps/api/src/modules/generic-crud/generic-crud.controller.ts:238:      brd_farms:        'mapped_site_code',  // mdm1_03 已加 + 回填
apps/api/src/modules/generic-crud/generic-crud.controller.ts:389:    brd_farms:        'farm_code',
apps/api/src/modules/farm/farm.cron.ts:45:      await this.cronMon.ok('farm_daily');
apps/api/src/modules/farm/farm.cron.ts:48:      await this.cronMon.fail('farm_daily', (e as Error)?.message ?? String(e));
apps/web/src/components/ErrorBoundary.tsx:19:          <button type="button" className="phx-btn phx-btn-secondary" onClick={() => { window.location.href = '/home'; }}>
apps/api/src/modules/farm/farm-sales.service.ts:8: * R1（删除重复库存体系）：farm-sales 不再直接修改库存。
apps/api/src/modules/farm/farm-sales.service.ts:49:   *   全局口径与 farm 模块 deriveOrgScope 一致：ALL/ORG-GROUP/admin/含'*' → 全量。
apps/api/src/modules/farm/farm-sales.service.ts:69:      // 非全局：本场单值 ∪ 真实多场授权（farm/site），store_code = ANY 覆盖多场。
apps/api/src/modules/farm/farm.controller.ts:3:import { FarmService, OrgScope, deriveOrgScope } from './farm.service';
apps/api/src/modules/farm/farm.controller.ts:9:@Controller('api/v3/farm')
apps/api/src/modules/farm/farm.controller.ts:14:    private readonly farmService: FarmService,
apps/api/src/modules/farm/farm.controller.ts:19:   * 组织作用域：遗留 storeCode（farm/site，向后兼容场长）∪ G98 公司维度。
apps/api/src/modules/farm/farm.controller.ts:33:    return await this.farmService.submitBreedingDailyLog(body, this.getScope(req));
apps/api/src/modules/farm/farm.controller.ts:39:    return await this.farmService.updateBreedingDailyLog(id, body);
apps/api/src/modules/farm/farm.controller.ts:43:   * GET /api/v3/farm/daily-logs/eggs-breakdown?date=&houseCode=
apps/api/src/modules/farm/farm.controller.ts:54:    return await this.farmService.getEggsBreakdown(date, houseCode, this.getScope(req));
apps/api/src/modules/farm/farm.controller.ts:60:    return await this.farmService.getDailyHenReport(d, this.getScope(req));
apps/api/src/modules/farm/farm.controller.ts:65:    return await this.farmService.getFarmTrend(Number(days) || 7, this.getScope(req));
apps/api/src/modules/quality/quality.service.ts:227:           FROM farm_device_realtime_snapshot
apps/api/src/modules/generic-crud/generic-crud.service.ts:86:        CREATE TABLE IF NOT EXISTS brd_farms (
apps/api/src/modules/generic-crud/generic-crud.service.ts:87:          farm_code VARCHAR(50) PRIMARY KEY,
apps/api/src/modules/generic-crud/generic-crud.service.ts:88:          farm_name VARCHAR(100),
apps/api/src/modules/generic-crud/generic-crud.service.ts:96:          farm_code VARCHAR(50),
apps/api/src/modules/generic-crud/generic-crud.service.ts:103:          farm_code VARCHAR(50),
apps/api/src/modules/generic-crud/generic-crud.service.ts:119:        `ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS farm_code      VARCHAR(50)`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:120:        `ALTER TABLE brd_houses ADD COLUMN IF NOT EXISTS farm_name      VARCHAR(100)`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:127:        // brd_farms
apps/api/src/modules/generic-crud/generic-crud.service.ts:128:        `ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS farm_code      VARCHAR(50)`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:129:        `ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS farm_name      VARCHAR(100)`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:130:        `ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS location       VARCHAR(200)`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:131:        `ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS houses        INT DEFAULT 0`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:132:        `ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS capacity       INT DEFAULT 0`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:133:        `ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS status         VARCHAR(20) DEFAULT 'ACTIVE'`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:134:        `ALTER TABLE brd_farms ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMP`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:138:        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS farm_code         VARCHAR(50)`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:149:        `ALTER TABLE brd_flocks ADD COLUMN IF NOT EXISTS source_farm        VARCHAR(100)`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:157:        // ── Phase C 修复：补全 brd_farms/houses/flocks 的 store_code 列 ──
apps/api/src/modules/generic-crud/generic-crud.service.ts:160:        // （brd_daily_logs.farm_code / brd_medications.medication_code 在各自 CREATE
apps/api/src/modules/generic-crud/generic-crud.service.ts:163:        `ALTER TABLE brd_farms  ADD COLUMN IF NOT EXISTS store_code VARCHAR(64) DEFAULT 'ALL'`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:166:        // B4: lookup.controller farms()/houses() 查询的列（company_code / site_code），
apps/api/src/modules/generic-crud/generic-crud.service.ts:167:        //   CI bootstrap 缺 → /api/lookup/farms、/api/lookup/houses 生产 500。补可空列对齐
apps/api/src/modules/generic-crud/generic-crud.service.ts:170:        `ALTER TABLE brd_farms  ADD COLUMN IF NOT EXISTS company_code VARCHAR(64)`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:577:        `ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS farm_house     VARCHAR(100)`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:579:        `ALTER TABLE brd_vaccinations ADD COLUMN IF NOT EXISTS farm_code      VARCHAR(50)`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:1232:           farm_code     VARCHAR(64),
apps/api/src/modules/generic-crud/generic-crud.service.ts:1235:           farm_name     VARCHAR(256),
apps/api/src/modules/generic-crud/generic-crud.service.ts:1773:      //   原 INSERT brd_farms FARM-01 + brd_houses A001-B001 + brd_flocks 的 startup seed
apps/api/src/modules/generic-crud/generic-crud.service.ts:2248:    if (table === 'brd_farms') {
apps/api/src/modules/generic-crud/generic-crud.service.ts:2249:      const houses = await this.entityManager.query(`SELECT 1 FROM "brd_houses" WHERE farm_code = $1 LIMIT 1`, [id]);
apps/api/src/modules/farm/farm-egg.controller.ts:2:import { FarmEggService } from './farm-egg.service';
apps/api/src/modules/farm/farm-egg.controller.ts:8:@Controller('api/farm/egg')
apps/api/src/modules/farm/farm-egg.controller.ts:14:  /** GET /api/farm/egg/stock */
apps/api/src/modules/farm/farm-egg.controller.ts:20:  /** GET /api/farm/egg/ledger?start=YYYY-MM-DD&end=YYYY-MM-DD */
apps/api/src/modules/farm/farm-egg.controller.ts:43:  /** POST /api/farm/egg/inbound —— R1 冻结（不再写库存） */
apps/api/src/modules/farm/farm-egg.controller.ts:49:  /** POST /api/farm/egg/outbound —— R1 冻结（不再扣库存） */
apps/api/src/modules/farm/farm-egg.controller.ts:55:  /** POST /api/farm/egg/write-off —— R1 冻结（不�
```
