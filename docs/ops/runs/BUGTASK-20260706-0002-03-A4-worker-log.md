# Agent Worker Log

| Field | Value |
| --- | --- |
| Task ID | BUGTASK-20260706-0002-03-A4 |
| Agent | A4-Frontend-UAT-Smoke |
| Dry run | No |
| Exit code | 0 |

## Command

```bash
/usr/local/bin/node scripts/ops/run-agent-task.mjs --agent A4-Frontend-UAT-Smoke --worktree /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke --prompt docs/ops/prompts/A4_FRONTEND_TASK_PROMPT.md --task-contract docs/ops/runs/BUGTASK-20260706-0002-03-A4-contract.md --assembled-prompt-output docs/ops/runs/BUGTASK-20260706-0002-03-A4-worker-assembled-prompt.md --require-approval-token APPROVE_AGENT_EXECUTION --skip-baseline-autopilot --allow-ops-runtime-dirty
```

## Stdout

```text
Agent: A4-Frontend-UAT-Smoke
Worktree: /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
Branch: w5-a4-frontend-uat-smoke
Prompt: docs/ops/prompts/A4_FRONTEND_TASK_PROMPT.md
Task contract: docs/ops/runs/BUGTASK-20260706-0002-03-A4-contract.md
Assembled prompt: docs/ops/runs/BUGTASK-20260706-0002-03-A4-worker-assembled-prompt.md
Assembled prompt chars: 32102
Codex command: codex exec -C /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke --sandbox workspace-write -
Codex timeout ms: 600000
Run log: /Users/mac/phoenix-erp-worktrees/codex-orchestrator/docs/ops/runs/2026-07-07T11-23-29-026Z-A4-Frontend-UAT-Smoke.md
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
session id: 019f3c51-508b-7462-b788-fb66c428e6cf
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

Source bug: BUG-20260706-0002
Source repair task: BUGTASK-20260706-0002
Assigned agent: A4-Frontend-UAT-Smoke

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

codex
我先做约定的 dry-run 检查，确认当前目录、分支、工作区和近期提交，再决定是否继续。
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
e3f95993 (HEAD -> w5-a4-frontend-uat-smoke) docs(ops): record baseline lifecycle report
6a006e2f docs(ops): record baseline lifecycle report
a5e2323f docs(ops): record baseline lifecycle report
8e17584a feat(web): record A4-Frontend-UAT-Smoke result
411f204a docs(ops): record baseline lifecycle report
a433dfe0 feat(web): record A4-Frontend-UAT-Smoke result
68dd814d docs(ops): record baseline lifecycle report
2f8a48b5 feat(api): record A3-Backend-Critical-Path result

exec
/bin/zsh -lc 'git status --short' in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
codex
前置检查通过：目录和分支匹配，工作区干净。现在只读 `apps/web` 和 `docs/ops` 相关代码，先定位 `/home` 的工作台指标来源和渲染逻辑。
exec
/bin/zsh -lc 'find apps/web -maxdepth 4 -type d | sort | head -200' in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
apps/web
apps/web/public
apps/web/scripts
apps/web/src
apps/web/src/__tests__
apps/web/src/app
apps/web/src/app/(admin)
apps/web/src/app/(admin)/analytics
apps/web/src/app/(admin)/breeding
apps/web/src/app/(admin)/daily-work
apps/web/src/app/(admin)/dashboard
apps/web/src/app/(admin)/data-quality
apps/web/src/app/(admin)/finance2
apps/web/src/app/(admin)/home
apps/web/src/app/(admin)/master
apps/web/src/app/(admin)/master-data
apps/web/src/app/(admin)/notifications
apps/web/src/app/(admin)/packaging
apps/web/src/app/(admin)/pilot-run
apps/web/src/app/(admin)/procurement2
apps/web/src/app/(admin)/profile
apps/web/src/app/(admin)/quality
apps/web/src/app/(admin)/sales2
apps/web/src/app/(admin)/settings
apps/web/src/app/(admin)/shareholders
apps/web/src/app/(admin)/store
apps/web/src/app/(admin)/store-payment
apps/web/src/app/(admin)/store-pos
apps/web/src/app/(admin)/system
apps/web/src/app/(admin)/traceability
apps/web/src/app/(admin)/uat
apps/web/src/app/(admin)/warehouse
apps/web/src/app/(admin)/workflow
apps/web/src/app/(mobile)
apps/web/src/app/(mobile)/mobile
apps/web/src/app/(terminal)
apps/web/src/app/(terminal)/terminal
apps/web/src/app/login
apps/web/src/app/trace
apps/web/src/app/trace/[batchNo]
apps/web/src/components
apps/web/src/components/cabin
apps/web/src/components/data-table
apps/web/src/components/design-system
apps/web/src/components/design-system/cards
apps/web/src/components/design-system/charts
apps/web/src/components/design-system/detail
apps/web/src/components/design-system/dialogs
apps/web/src/components/design-system/drawers
apps/web/src/components/design-system/feedback
apps/web/src/components/design-system/forms
apps/web/src/components/design-system/layouts
apps/web/src/components/design-system/mobile
apps/web/src/components/design-system/status
apps/web/src/components/design-system/tables
apps/web/src/components/design-system/templates
apps/web/src/components/design-system/timeline
apps/web/src/components/design-system/workbench
apps/web/src/components/finance
apps/web/src/components/layout
apps/web/src/components/master-data
apps/web/src/components/mobile
apps/web/src/components/packaging
apps/web/src/components/settings
apps/web/src/components/shared-selectors
apps/web/src/components/terminal
apps/web/src/components/uat
apps/web/src/components/ui
apps/web/src/components/workflow
apps/web/src/contexts
apps/web/src/hooks
apps/web/src/lib
apps/web/src/locales
apps/web/src/providers
apps/web/src/styles
apps/web/src/types

exec
/bin/zsh -lc "rg --files apps/web | rg 'home|dashboard|workbench|page\\.tsx|page\\.ts"'$'"'" in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
apps/web/src/components/design-system/workbench/WorkbenchParts.tsx
apps/web/src/components/design-system/workbench/WorkbenchKit.tsx
apps/web/src/app/(admin)/store/page.tsx
apps/web/src/app/(admin)/store/receiving/page.tsx
apps/web/src/app/(admin)/store/inventory/page.tsx
apps/web/src/app/(admin)/store/replenish/page.tsx
apps/web/src/app/(admin)/store/daily/page.tsx
apps/web/src/app/(admin)/store/losses/page.tsx
apps/web/src/app/(admin)/analytics/page.tsx
apps/web/src/app/(admin)/analytics/production/page.tsx
apps/web/src/app/(admin)/analytics/inventory/page.tsx
apps/web/src/app/(admin)/analytics/feed/page.tsx
apps/web/src/app/(admin)/analytics/price-review/page.tsx
apps/web/src/app/(admin)/notifications/page.tsx
apps/web/src/app/(admin)/shareholders/scopes/page.tsx
apps/web/src/app/(admin)/shareholders/page.tsx
apps/web/src/app/(admin)/shareholders/equity/page.tsx
apps/web/src/app/(admin)/shareholders/dashboard/page.tsx
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
apps/web/src/app/(admin)/warehouse/stocktake/page.tsx
apps/web/src/app/(admin)/warehouse/source-mode/page.tsx
apps/web/src/app/(admin)/warehouse/transfer/page.tsx
apps/web/src/app/(admin)/warehouse/zones/page.tsx
apps/web/src/app/(admin)/warehouse/warehouses/page.tsx
apps/web/src/app/(admin)/warehouse/ledger/page.tsx
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
apps/web/src/app/(admin)/sales2/channels/page.tsx
apps/web/src/app/(admin)/sales2/reports/page.tsx
apps/web/src/app/(admin)/sales2/pricing/page.tsx
apps/web/src/app/(admin)/sales2/page.tsx
apps/web/src/app/(admin)/sales2/orders/page.tsx
apps/web/src/app/(admin)/sales2/returns/page.tsx
apps/web/src/app/(admin)/sales2/delivery/page.tsx
apps/web/src/app/(admin)/sales2/inventory/page.tsx
apps/web/src/app/(admin)/sales2/credit/page.tsx
apps/web/src/app/(admin)/sales2/customers/page.tsx
apps/web/src/app/(admin)/master/page.tsx
apps/web/src/app/(admin)/master/orgs/page.tsx
apps/web/src/app/(admin)/master/farms/page.tsx
apps/web/src/app/(admin)/master/stores/page.tsx
apps/web/src/app/(admin)/master/products/page.tsx
apps/web/src/app/(admin)/profile/page.tsx
apps/web/src/app/(admin)/system/backup/page.tsx
apps/web/src/app/(admin)/system/configs/page.tsx
apps/web/src/app/(admin)/system/alerts/page.tsx
apps/web/src/app/(admin)/system/health/page.tsx
apps/web/src/app/(admin)/system/error-logs/page.tsx
apps/web/src/app/(admin)/master-data/pending/page.tsx
apps/web/src/app/(admin)/master-data/companies/page.tsx
apps/web/src/app/(admin)/master-data/page.tsx
apps/web/src/app/(admin)/master-data/dictionaries/page.tsx
apps/web/src/app/(admin)/master-data/bank-accounts/page.tsx
apps/web/src/app/(admin)/master-data/bank-accounts/new/page.tsx
apps/web/src/app/(admin)/master-data/bank-accounts/[code]/edit/page.tsx
apps/web/src/app/(admin)/master-data/vehicles/page.tsx
apps/web/src/app/(admin)/master-data/governance/page.tsx
apps/web/src/app/(admin)/master-data/product-grades/page.tsx
apps/web/src/app/(admin)/master-data/user-orgs/page.tsx
apps/web/src/app/(admin)/master-data/operations/page.tsx
apps/web/src/app/(admin)/master-data/stores/page.tsx
apps/web/src/app/(admin)/master-data/packaging-specs/page.tsx
apps/web/src/app/(admin)/master-data/projects/page.tsx
apps/web/src/app/(admin)/master-data/cash-accounts/page.tsx
apps/web/src/app/(admin)/master-data/cash-accounts/new/page.tsx
apps/web/src/app/(admin)/master-data/cash-accounts/[code]/edit/page.tsx
apps/web/src/app/(admin)/master-data/quality/page.tsx
apps/web/src/app/(admin)/master-data/business-units/page.tsx
apps/web/src/app/(admin)/master-data/suppliers/page.tsx
apps/web/src/app/(admin)/master-data/product-skus/page.tsx
apps/web/src/app/(admin)/master-data/suppliers/new/page.tsx
apps/web/src/app/(admin)/finance2/reports/page.tsx
apps/web/src/app/(admin)/finance2/page.tsx
apps/web/src/app/(admin)/master-data/suppliers/[code]/page.tsx
apps/web/src/app/(admin)/master-data/suppliers/[code]/edit/page.tsx
apps/web/src/app/(admin)/master-data/organizations/page.tsx
apps/web/src/app/(admin)/master-data/products/page.tsx
apps/web/src/app/(admin)/finance2/fund-transfers/page.tsx
apps/web/src/app/(admin)/master-data/customers/page.tsx
apps/web/src/app/(admin)/master-data/products/new/page.tsx
apps/web/src/app/(admin)/master-data/drivers/page.tsx
apps/web/src/app/(admin)/master-data/customers/new/page.tsx
apps/web/src/app/(admin)/master-data/warehouses/page.tsx
apps/web/src/app/(admin)/master-data/customers/[code]/page.tsx
apps/web/src/app/(admin)/master-data/products/[code]/edit/page.tsx
apps/web/src/app/(admin)/finance2/ar/page.tsx
apps/web/src/app/(admin)/master-data/materials/page.tsx
apps/web/src/app/(admin)/master-data/customers/[code]/edit/page.tsx
apps/web/src/app/trace/[batchNo]/page.tsx
apps/web/src/app/(admin)/dashboard/page.tsx
apps/web/src/app/(admin)/dashboard/_components/dashboard.module.css
apps/web/src/app/(admin)/dashboard/_components/DashboardKPIs.tsx
apps/web/src/app/(admin)/dashboard/dashboard.module.css
apps/web/src/app/(admin)/finance2/ar-ledger/page.tsx
apps/web/src/app/(admin)/store-payment/page.tsx
apps/web/src/app/(admin)/finance2/reimbursements/page.tsx
apps/web/src/app/(mobile)/mobile/analytics/page.tsx
apps/web/src/app/(admin)/traceability/page.tsx
apps/web/src/app/(mobile)/mobile/login/page.tsx
apps/web/src/app/(mobile)/mobile/expenses/page.tsx
apps/web/src/app/(admin)/finance2/shareholder-funds/page.tsx
apps/web/src/app/(mobile)/mobile/notifications/page.tsx
apps/web/src/app/(mobile)/mobile/quality/page.tsx
apps/web/src/app/(mobile)/mobile/medicine/page.tsx
apps/web/src/app/(admin)/finance2/chanjet-sync/page.tsx
apps/web/src/app/(mobile)/mobile/sales/page.tsx
apps/web/src/app/(mobile)/mobile/device/page.tsx
apps/web/src/app/(admin)/finance2/expenses/page.tsx
apps/web/src/app/(mobile)/mobile/prc-request/page.tsx
apps/web/src/app/(mobile)/mobile/prc-order/page.tsx
apps/web/src/app/(mobile)/mobile/workflow/page.tsx
apps/web/src/app/(mobile)/mobile/egg/page.tsx
apps/web/src/app/(admin)/finance2/cash-accounts/page.tsx
apps/web/src/app/(mobile)/mobile/delivery/page.tsx
apps/web/src/app/(mobile)/mobile/henhouse/page.tsx
apps/web/src/app/(mobile)/mobile/feed/page.tsx
apps/web/src/app/(mobile)/mobile/delivery/performance/page.tsx
apps/web/src/app/(admin)/finance2/ap/page.tsx
apps/web/src/app/(mobile)/mobile/home/page.tsx
apps/web/src/app/(mobile)/mobile/delivery/orders/page.tsx
apps/web/src/app/(mobile)/mobile/packaging/page.tsx
apps/web/src/app/(mobile)/mobile/henreport/page.tsx
apps/web/src/app/(mobile)/mobile/delivery/orders/[id]/exception/page.tsx
apps/web/src/app/(mobile)/mobile/delivery/orders/[id]/page.tsx
apps/web/src/app/(mobile)/mobile/delivery/orders/[id]/photos/page.tsx
apps/web/src/app/(mobile)/mobile/delivery/exceptions/page.tsx
apps/web/src/app/(mobile)/mobile/dashboard/page.tsx
apps/web/src/app/page.tsx
apps/web/src/app/(mobile)/mobile/delivery/receipt/[orderId]/page.tsx
apps/web/src/app/(mobile)/mobile/mortality/page.tsx
apps/web/src/app/(admin)/uat/page.tsx
apps/web/src/app/(admin)/packaging/page.tsx
apps/web/src/app/(admin)/home/page.tsx
apps/web/src/app/(admin)/packaging/daily-report/page.tsx
apps/web/src/app/(admin)/packaging/inbound/page.tsx
apps/web/src/app/(admin)/finance2/ar-reconciliation/page.tsx
apps/web/src/app/(terminal)/terminal/wms/outbound/page.tsx
apps/web/src/app/(admin)/packaging/batch/page.tsx
apps/web/src/app/(terminal)/terminal/wms/inbound/page.tsx
apps/web/src/app/(admin)/settings/notifications/page.tsx
apps/web/src/app/(admin)/packaging/print-logs/page.tsx
apps/web/src/app/(terminal)/terminal/wms/stocktake/page.tsx
apps/web/src/app/(admin)/settings/dict/page.tsx
apps/web/src/app/(admin)/packaging/exceptions/page.tsx
apps/web/src/app/(terminal)/terminal/home/page.tsx
apps/web/src/app/(admin)/settings/pda-terminals/page.tsx
apps/web/src/app/(admin)/settings/page.tsx
apps/web/src/app/(admin)/daily-work/page.tsx
apps/web/src/app/(admin)/settings/pos-config/page.tsx
apps/web/src/app/(terminal)/terminal/packaging/packing/page.tsx
apps/web/src/app/(admin)/procurement2/page.tsx
apps/web/src/app/(admin)/settings/online-users/page.tsx
apps/web/src/app/(terminal)/terminal/packaging/source-receive/page.tsx
apps/web/src/app/(admin)/procurement2/orders/page.tsx
apps/web/src/app/(admin)/settings/users/page.tsx
apps/web/src/app/(terminal)/terminal/packaging/qc-inspection/page.tsx
apps/web/src/app/(admin)/settings/users/[id]/page.tsx
apps/web/src/app/(terminal)/terminal/packaging/dashboard/page.tsx
apps/web/src/app/(admin)/procurement2/orders/[id]/edit/page.tsx
apps/web/src/app/(admin)/settings/profile/page.tsx
apps/web/src/app/(terminal)/terminal/packaging/exceptions/page.tsx
apps/web/src/app/(admin)/settings/master-data/page.tsx
apps/web/src/app/(admin)/procurement2/orders/new/page.tsx
apps/web/src/app/(terminal)/terminal/packaging/warehouse-handover/page.tsx
apps/web/src/app/(admin)/settings/permissions/page.tsx
apps/web/src/app/(terminal)/terminal/packaging/shift-close/page.tsx
apps/web/src/app/(admin)/settings/approval-flows/page.tsx
apps/web/src/app/(admin)/procurement2/dashboard/page.tsx
apps/web/src/app/(terminal)/terminal/packaging/shift-open/page.tsx
apps/web/src/app/(admin)/settings/permission-sets/page.tsx
apps/web/src/app/(admin)/procurement2/requests/page.tsx
apps/web/src/app/(terminal)/terminal/packaging/grading/page.tsx
apps/web/src/app/(admin)/settings/audit-log/page.tsx
apps/web/src/app/(terminal)/terminal/packaging/label-print/page.tsx
apps/web/src/app/(admin)/settings/roles/page.tsx
apps/web/src/app/(admin)/procurement2/requests/[id]/edit/page.tsx
apps/web/src/app/(admin)/settings/store-stock/page.tsx
apps/web/src/app/(admin)/settings/roles/[code]/page.tsx
apps/web/src/app/(admin)/procurement2/requests/new/page.tsx
apps/web/src/app/(admin)/settings/approval-rules/page.tsx
apps/web/src/app/(admin)/settings/brand/page.tsx
apps/web/src/app/(admin)/procurement2/shareholder-funds/page.tsx
apps/web/src/app/(admin)/settings/data-scopes/page.tsx
apps/web/src/app/(admin)/settings/security/page.tsx
apps/web/src/app/(admin)/procurement2/projects/page.tsx
apps/web/src/app/(admin)/settings/organizations/page.tsx
apps/web/src/app/(admin)/procurement2/receipts/page.tsx
apps/web/src/app/(admin)/breeding/daily-inbound/page.tsx
apps/web/src/app/(admin)/breeding/page.tsx
apps/web/src/app/(admin)/procurement2/suppliers/page.tsx
apps/web/src/app/(admin)/pilot-run/page.tsx
apps/web/src/app/(admin)/store-pos/page.tsx
apps/web/src/app/(admin)/breeding/egg-ledger/page.tsx
apps/web/src/app/(admin)/procurement2/payments/page.tsx
apps/web/src/app/(admin)/procurement2/init/page.tsx
apps/web/src/app/(admin)/breeding/flock/page.tsx
apps/web/src/app/(admin)/procurement2/shipments/page.tsx
apps/web/src/app/(admin)/quality/standards/page.tsx
apps/web/src/app/(admin)/breeding/device/page.tsx
apps/web/src/app/(admin)/procurement2/payments/[id]/edit/page.tsx
apps/web/src/app/(admin)/procurement2/payments/new/page.tsx
apps/web/src/app/(admin)/quality/forward/page.tsx
apps/web/src/app/(admin)/quality/page.tsx
apps/web/src/app/(admin)/breeding/device/[houseCode]/page.tsx
apps/web/src/app/(admin)/breeding/med-stock/page.tsx
apps/web/src/app/(admin)/quality/product/page.tsx
apps/web/src/app/(admin)/breeding/henhouse/page.tsx
apps/web/src/app/(admin)/breeding/medicine/page.tsx
apps/web/src/app/(admin)/breeding/daily/page.tsx
apps/web/src/app/(admin)/quality/backward/page.tsx
apps/web/src/app/(admin)/breeding/feed/page.tsx
apps/web/src/app/(admin)/breeding/device-ops/page.tsx
apps/web/src/app/(admin)/quality/nonconformance/page.tsx
apps/web/src/app/(admin)/breeding/henreport/page.tsx
apps/web/src/app/(admin)/breeding/immune/page.tsx
apps/web/src/app/(admin)/data-quality/page.tsx
apps/web/src/app/(admin)/quality/farm/page.tsx
apps/web/src/app/login/page.tsx
apps/web/src/app/(mobile)/mobile/egglog/page.tsx
apps/web/src/app/(admin)/breeding/device-alerts/page.tsx

exec
/bin/zsh -lc 'rg -n "今日|饲料|用水|feed|water|运营工作台|kg|L" apps/web' in /Users/mac/phoenix-erp-worktrees/a4-frontend-uat-smoke
 succeeded in 0ms:
apps/web/src/lib/packaging-api.ts:6:export interface PrintLogRow {
apps/web/src/lib/packaging-api.ts:10:  print_type: 'NORMAL' | 'REPRINT';
apps/web/src/lib/packaging-api.ts:63:  const API_BASE = process.env.NEXT_PUBLIC_API_BASE || '';
apps/web/src/lib/packaging-api.ts:125:  recordPrintLog: (body: Record<string, unknown>) => request<any>('POST', '/api/packaging/terminal/labels/print-log', body),
apps/web/src/lib/packaging-api.ts:126:  getPrintLogs: (params: { startDate: string; endDate: string; type?: string }) => {
apps/web/src/lib/packaging-api.ts:127:    const q = new URLSearchParams({ startDate: params.startDate, endDate: params.endDate });
apps/web/src/lib/packaging-api.ts:128:    if (params.type && params.type !== 'ALL') q.set('type', params.type);
apps/web/src/lib/packaging-api.ts:129:    return request<{ data: PrintLogRow[] }>('GET', `/api/packaging/terminal/labels/print-logs?${q}`);
apps/web/src/lib/packaging-api.ts:137:      shift: { id: number; shiftCode: string; shiftLabel: string; operatorName: string; supervisorName: string } | null;
apps/web/src/lib/packaging-api.ts:143:    const params = new URLSearchParams();
apps/web/src/lib/packaging-api.ts:179:  // ── 班组长候选列表（ROLE_LINE_SUPERVISOR / ROLE_PKG_MGR / ROLE_ADMIN） ──────
apps/web/src/lib/packaging-api.ts:188:  labelLo?: string;
apps/web/src/lib/packaging-api.ts:205:  // PKG_QC_RESULT
apps/web/src/lib/shareholder-api.ts:55:export const PROJECT_TYPE_LABEL: Record<string, string> = {
apps/web/src/lib/shareholder-api.ts:56:  LAYER_FARM: '蛋鸡养殖场', BROILER_FARM: '肉鸡养殖场', SLAUGHTER: '屠宰加工厂',
apps/web/src/lib/shareholder-api.ts:57:  FOOD_FACTORY: '食品厂', ORGANIC_FERTILIZER: '有机肥生产厂', HATCHERY: '孵化场',
apps/web/src/lib/shareholder-api.ts:58:  FEED_MILL: '饲料厂', OTHER: '其他',
apps/web/src/lib/shareholder-api.ts:60:export const CAPITAL_STATUS_LABEL: Record<string, string> = {
apps/web/src/lib/shareholder-api.ts:61:  PAID_IN_FULL: '已到位', PARTIALLY_PAID: '部分到位', PENDING_CONFIRMATION: '待确认',
apps/web/src/lib/shareholder-api.ts:63:export const EQUITY_STATUS_LABEL: Record<string, string> = {
apps/web/src/lib/shareholder-api.ts:64:  CONFIRMED: '已确认股权', PROVISIONAL: '暂定股权',
apps/web/src/lib/shareholder-api.ts:66:export const SOURCE_TYPE_LABEL: Record<string, string> = {
apps/web/src/lib/shareholder-api.ts:69:  SHAREHOLDER_ADVANCE: '股东垫资', GOODS_PAYMENT: '代付货款',
apps/web/src/lib/shareholder-api.ts:70:  PERSONAL_PAYMENT: '股东个人代付', EQUIPMENT_INVESTMENT: '设备投入', LAND_INVESTMENT: '土地投入',
apps/web/src/lib/shareholder-api.ts:71:  REVERSAL: '冲销', CASH: '现金', CAPITAL_SUMMARY_IMPORT: '历史实缴(汇总导入)', OTHER: '其他',
apps/web/src/lib/shareholder-api.ts:76:  'SHAREHOLDER_ADVANCE', 'GOODS_PAYMENT', 'EQUIPMENT_INVESTMENT', 'LAND_INVESTMENT', 'OTHER',
apps/web/src/lib/shareholder-api.ts:78:export const PAID_IN_SOURCE_LABEL: Record<string, string> = {
apps/web/src/lib/shareholder-api.ts:79:  LEDGER: '逐笔台账', CAPITAL_SUMMARY_IMPORT: '资本汇总表',
apps/web/src/lib/shareholder-api.ts:81:export const CONTRIB_STATUS_LABEL: Record<string, string> = {
apps/web/src/lib/shareholder-api.ts:83:  CONFIRMED: '已确认到账', CANCELLED: '已取消', REVERSED: '已冲销',
apps/web/src/lib/shareholder-api.ts:85:export const SCOPE_TYPE_LABEL: Record<string, string> = {
apps/web/src/lib/shareholder-api.ts:89:export const ORG_CODE_LABEL: Record<string, string> = {
apps/web/src/lib/shareholder-api.ts:91:  'COMP-LAO-AGRI': '老挝凤凰农业', 'COMP-LAO-XINGCHI': '星驰养鸡场', 'COMP-LAO-FOOD': '老挝凤凰食品',
apps/web/src/lib/shareholder-api.ts:92:  'SITE-MENGSAI-LAYER': '孟赛蛋鸡养殖场', 'SITE-DONGPENG-LAYER': '东鹏蛋鸡养殖场', 'SITE-VTE-SLAUGHTER': '万象屠宰加工厂',
apps/web/src/lib/shareholder-api.ts:111:    const p = new URLSearchParams(); if (q.projectCode) p.set('projectCode', q.projectCode); if (q.status) p.set('status', q.status);
apps/web/src/lib/workflow-data-catalog.ts:7:  source_type: "TABLE" | "DICT" | "STATIC";
apps/web/src/lib/workflow-data-catalog.ts:20:export const WORKFLOW_DATA_CATALOG: WorkflowDataCatalogItem[] = [
apps/web/src/lib/workflow-data-catalog.ts:25:    source_type: "TABLE",
apps/web/src/lib/workflow-data-catalog.ts:32:    activeValues: ["1", "ACTIVE", "ENABLED", "true"],
apps/web/src/lib/workflow-data-catalog.ts:40:    code: "SYS_ROLES",
apps/web/src/lib/workflow-data-catalog.ts:43:    source_type: "TABLE",
apps/web/src/lib/workflow-data-catalog.ts:48:    activeValues: ["1", "ACTIVE", "ENABLED", "true"],
apps/web/src/lib/workflow-data-catalog.ts:59:    source_type: "TABLE",
apps/web/src/lib/workflow-data-catalog.ts:77:    source_type: "TABLE",
apps/web/src/lib/workflow-data-catalog.ts:91:    source_type: "TABLE",
apps/web/src/lib/workflow-data-catalog.ts:102:    code: "SYS_DICT_APPROVAL",
apps/web/src/lib/workflow-data-catalog.ts:106:    dict_type: "APPROVAL",
apps/web/src/lib/workflow-data-catalog.ts:119:    source_type: "TABLE",
apps/web/src/lib/workflow-data-catalog.ts:130:    code: "PRC_SUPPLIERS",
apps/web/src/lib/workflow-data-catalog.ts:133:    source_type: "TABLE",
apps/web/src/lib/workflow-data-catalog.ts:145:    code: "SAL_CUSTOMERS",
apps/web/src/lib/workflow-data-catalog.ts:148:    source_type: "TABLE",
apps/web/src/lib/workflow-data-catalog.ts:163:  if (item.source_type === "TABLE") {
apps/web/src/lib/workflow-data-catalog.ts:177:export function dataSourceLabel(code?: string) {
apps/web/src/lib/workflow-data-catalog.ts:178:  return WORKFLOW_DATA_CATALOG.find(item => item.code === code)?.name || code || "";
apps/web/src/__tests__/request-cache.test.ts:2:import { cachedGet, invalidateCache, TTL } from '@/lib/request-cache';
apps/web/src/__tests__/request-cache.test.ts:5: * 通用取数缓存：并发去重 + TTL 命中 + 失败不缓存 + 前缀失效。
apps/web/src/__tests__/request-cache.test.ts:34:describe('cachedGet — TTL hit', () => {
apps/web/src/__tests__/request-cache.test.ts:35:  it('returns cached value within TTL without re-invoking loader', async () => {
apps/web/src/__tests__/request-cache.test.ts:52:    vi.advanceTimersByTime(1500); // 越过 TTL
apps/web/src/__tests__/request-cache.test.ts:74:    const dictLoader = vi.fn().mockResolvedValue('dict');
apps/web/src/__tests__/request-cache.test.ts:75:    const lookupLoader = vi.fn().mockResolvedValue('lookup');
apps/web/src/__tests__/request-cache.test.ts:77:    await cachedGet('dict:currency', 10_000, dictLoader);
apps/web/src/__tests__/request-cache.test.ts:78:    await cachedGet('lookup:customer', 10_000, lookupLoader);
apps/web/src/__tests__/request-cache.test.ts:82:    await cachedGet('dict:currency', 10_000, dictLoader); // 重新加载
apps/web/src/__tests__/request-cache.test.ts:83:    await cachedGet('lookup:customer', 10_000, lookupLoader); // 仍命中缓存
apps/web/src/__tests__/request-cache.test.ts:85:    expect(dictLoader).toHaveBeenCalledTimes(2);
apps/web/src/__tests__/request-cache.test.ts:86:    expect(lookupLoader).toHaveBeenCalledTimes(1);
apps/web/src/__tests__/request-cache.test.ts:89:  it('exposes sane default TTL constants', () => {
apps/web/src/__tests__/request-cache.test.ts:90:    expect(TTL.dict).toBe(5 * 60_000);
apps/web/src/__tests__/request-cache.test.ts:91:    expect(TTL.brand).toBe(10 * 60_000);
apps/web/src/lib/request-cache.ts:6: *  ② TTL 缓存：命中且未过期直接返回（解决"切回页面重复拉低频主数据"）
apps/web/src/lib/request-cache.ts:48:/** 常用 TTL（毫秒） */
apps/web/src/lib/request-cache.ts:49:export const TTL = {
apps/web/src/lib/impersonate.ts:23:  document.cookie = `phoenix_access_token=${ck}; path=/; max-age=${7 * 24 * 3600}; SameSite=Lax`;
apps/web/src/lib/workflow-api.ts:24:export interface WorkflowList<T> {
apps/web/src/lib/workflow-api.ts:183:  definitions: () => req<WorkflowList<WorkflowDefinition>>("/definitions"),
apps/web/src/lib/workflow-api.ts:196:  forms: () => req<WorkflowList<WorkflowForm>>("/forms"),
apps/web/src/lib/workflow-api.ts:205:  dataSources: () => req<WorkflowList<Record<string, unknown>>>("/data-sources"),
apps/web/src/lib/workflow-api.ts:209:    req<WorkflowList<Record<string, unknown>>>("/data-sources/sync-defaults", { method: "POST", body: JSON.stringify({}) }),
apps/web/src/lib/workflow-api.ts:211:    req<WorkflowList<Record<string, unknown>>>("/data-sources/refresh-metadata", { method: "POST", body: JSON.stringify({}) }),
apps/web/src/lib/workflow-api.ts:215:    req<WorkflowList<Record<string, unknown>>>("/data-sources/preview", { method: "POST", body: JSON.stringify(data) }),
apps/web/src/lib/workflow-api.ts:220:  instances: (status?: string) => req<WorkflowList<WorkflowInstance>>(`/instances${status ? `?status=${encodeURIComponent(status)}` : ""}`),
apps/web/src/lib/workflow-api.ts:227:  todo: () => req<WorkflowList<WorkflowTask>>("/tasks/todo"),
apps/web/src/lib/workflow-api.ts:228:  done: () => req<WorkflowList<WorkflowTask>>("/tasks/done"),
apps/web/src/lib/workflow-api.ts:229:  cc: () => req<WorkflowList<WorkflowCcTask>>("/tasks/cc"),
apps/web/src/lib/workflow-api.ts:231:  monitorTasks: () => req<WorkflowList<WorkflowMonitorTask>>("/tasks/monitor"),
apps/web/src/__tests__/currency.test.ts:14:    expect(currencySymbol('LAK')).toBe('₭');
apps/web/src/lib/design-tokens.ts:12: *   import { TOKENS, ACCENT_MAP, STATUS_LABEL } from '@/lib/design-tokens';
apps/web/src/lib/design-tokens.ts:42:    radiusLg:       'var(--radius-lg)',
apps/web/src/lib/design-tokens.ts:117:// 用法：borderLeft: `4px solid ${ACCENT_SOLID.blue}`
apps/web/src/lib/design-tokens.ts:118://      background: `color-mix(in srgb, ${ACCENT_SOLID.blue} 12%, transparent)`
apps/web/src/lib/design-tokens.ts:119:export const ACCENT_SOLID: Record<AccentColor, string> = {
apps/web/src/lib/design-tokens.ts:141:  return (hex && m[hex.toLowerCase()]) || 'slate';
apps/web/src/lib/design-tokens.ts:159:  | 'DISABLED' | 'NEUTRAL' | 'PENDING' | 'RUNNING'
apps/web/src/lib/design-tokens.ts:160:  | 'ACTIVE' | 'FROZEN' | 'CANCELLED' | 'COMPLETED';
apps/web/src/lib/design-tokens.ts:163:export const STATUS_CLASS: Record<string, string> = {
apps/web/src/lib/design-tokens.ts:169:  DISABLED:  'text-text-dim bg-bg-muted',
apps/web/src/lib/design-tokens.ts:170:  NEUTRAL:   'text-text-muted bg-bg-muted',
apps/web/src/lib/design-tokens.ts:175:  CANCELLED: 'text-text-dim bg-bg-muted',
apps/web/src/lib/design-tokens.ts:176:  COMPLETED: 'text-violet-700  bg-violet-50   dark:text-violet-300  dark:bg-violet-950/40',
apps/web/src/lib/design-tokens.ts:179:  PARTIALLY_RECEIVED: 'text-blue-700   bg-blue-50    dark:text-blue-300   dark:bg-blue-950/40',
apps/web/src/lib/design-tokens.ts:185:  PARTIALLY_PAID: 'text-blue-700   bg-blue-50   dark:text-blue-300   dark:bg-blue-950/40',
apps/web/src/lib/design-tokens.ts:195:  SETTLED:        'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40',
apps/web/src/lib/design-tokens.ts:196:  PENDING_APPROVAL:  'text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/40',
apps/web/src/lib/design-tokens.ts:198:  NORMAL:         'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40',
apps/web/src/lib/design-tokens.ts:199:  CLOSED:         'text-text-dim bg-bg-muted',
apps/web/src/lib/design-tokens.ts:203:export const STATUS_LABEL: Record<string, string> = {
apps/web/src/lib/design-tokens.ts:208:  DISABLED:  '禁用',
apps/web/src/lib/design-tokens.ts:209:  NEUTRAL:   '正常',
apps/web/src/lib/design-tokens.ts:214:  CANCELLED: '已取消',
apps/web/src/lib/design-tokens.ts:215:  COMPLETED: '已完成',
apps/web/src/lib/design-tokens.ts:221:  CLOSED:            '已关闭',
apps/web/src/lib/design-tokens.ts:223:  RESOLVED:          '已解决',
apps/web/src/lib/design-tokens.ts:225:  PARTIALLY_RECEIVED: '部分收款',
apps/web/src/lib/design-tokens.ts:230:  PARTIALLY_PAID:     '部分付款',
apps/web/src/lib/design-tokens.ts:233:  NORMAL:             '正常',
apps/web/src/lib/design-tokens.ts:240:  SETTLED:            '已结算',
apps/web/src/lib/design-tokens.ts:244:  PENDING_APPROVAL:   '待审批',
apps/web/src/lib/design-tokens.ts:272:// 目的：消灭页面内散落的 STATUS_COLOR / GRADE_COLORS / SEVERITY_COLOR / 图表硬编码色。
apps/web/src/lib/design-tokens.ts:286:export const CHART_PALETTE = {
apps/web/src/lib/design-tokens.ts:299:/** 分级色板（蛋品/质量分级 AA/A/B/C/D）。替换页面内 GRADE_COLORS。 */
apps/web/src/lib/design-tokens.ts:300:export const GRADE_PALETTE: Record<string, string> = {
apps/web/src/lib/design-tokens.ts:304:/** 风险/告警严重度色板。替换页面内 SEVERITY_COLOR。 */
apps/web/src/lib/design-tokens.ts:305:export const SEVERITY_PALETTE: Record<string, string> = {
apps/web/src/lib/design-tokens.ts:306:  CRITICAL: '#dc2626', HIGH: '#f97316', MEDIUM: '#2563eb', LOW: '#64748b', INFO: '#0891b2',
apps/web/src/lib/design-tokens.ts:310:export const ENTITY_PALETTE: Record<string, string> = {
apps/web/src/lib/design-tokens.ts:322:  const s = CHART_PALETTE.series;
apps/web/next.config.ts:9:  // 不在白名单的 origin 会拿到首屏 HTML 但 JS hydration / HMR �
```
