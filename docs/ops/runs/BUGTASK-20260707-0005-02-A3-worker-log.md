# Agent Worker Log

| Field | Value |
| --- | --- |
| Task ID | BUGTASK-20260707-0005-02-A3 |
| Agent | A3-Backend-Critical-Path |
| Dry run | No |
| Exit code | 0 |

## Command

```bash
/usr/local/bin/node scripts/ops/run-agent-task.mjs --agent A3-Backend-Critical-Path --worktree /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path --prompt docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md --task-contract docs/ops/runs/BUGTASK-20260707-0005-02-A3-contract.md --assembled-prompt-output docs/ops/runs/BUGTASK-20260707-0005-02-A3-worker-assembled-prompt.md --require-approval-token APPROVE_AGENT_EXECUTION --skip-baseline-autopilot --allow-ops-runtime-dirty
```

## Stdout

```text
Agent: A3-Backend-Critical-Path
Worktree: /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
Branch: w5-a3-backend-critical-path
Prompt: docs/ops/prompts/A3_BACKEND_TASK_PROMPT.md
Task contract: docs/ops/runs/BUGTASK-20260707-0005-02-A3-contract.md
Assembled prompt: docs/ops/runs/BUGTASK-20260707-0005-02-A3-worker-assembled-prompt.md
Assembled prompt chars: 33854
Codex command: codex exec -C /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path --sandbox workspace-write -
Codex timeout ms: 600000
Run log: /Users/mac/phoenix-erp-worktrees/codex-orchestrator/docs/ops/runs/2026-07-07T15-33-27-515Z-A3-Backend-Critical-Path.md
PASS WITH CONDITIONS / Backend GO.

Backend diagnosis found the required guard already present: `POST /api/v3/farm/daily-logs` rejects empty or `加载中…` `house_code` before any DB access with `请先选择鸡舍后再提交`. I added the required report at [BUG-20260707-0005_A3_BACKEND_CRITICAL_PATH_REPORT.md](/Users/mac/phoenix-erp-worktrees/a3-backend-critical-path/docs/ops/BUG-20260707-0005_A3_BACKEND_CRITICAL_PATH_REPORT.md) and committed it as `11fa71a9`.

Validation:
- `cd apps/api && pnpm test -- farm.service.spec.ts --runInBand` PASS, 3/3
- `cd apps/api && ./node_modules/.bin/tsc --noEmit` PASS
- `cd apps/web && ./node_modules/.bin/tsc --noEmit` FAIL due existing missing `vitest` / `vitest/config` types, unrelated to this backend guard

No migrations, DB writes, deploy, push, frontend edits, or schema/entity changes were performed. Working tree is clean.
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
session id: 019f3d34-a322-7440-bb64-4dd63ec81e03
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

Source bug: BUG-20260707-0005
Source repair task: BUGTASK-20260707-0005
Assigned agent: A3-Backend-Critical-Path

## Issue

日生产日报不选择鸡舍也能提交成功

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
  "url": "https://erp.eggslao.com/breeding/daily?action=create&date=today",
  "bugNo": "BUG-20260707-0005",
  "route": "/breeding/daily",
  "title": "日生产日报不选择鸡舍也能提交成功",
  "taskNo": "BUGTASK-20260707-0005",
  "context": {
    "attachments": [
      {
        "sha256": "f961c9036b46e2752abecf44d62b5ab3833fd389fac552159dceda6e5f880f77",
        "fileName": "01-1783385890768-eec55765.png",
        "mimeType": "image/png",
        "sizeBytes": 841957,
        "originalName": "pasted-screenshot-1783385734893-1.png",
        "relativePath": "storage/bug-reports/2026/07/07/BUG-20260707-0005/01-1783385890768-eec55765.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260707-0005/attachments/01-1783385890768-eec55765.png"
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
      "capturedAt": "2026-07-07T00:58:10.770Z",
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
          "养殖总览",
          "鸡舍管理",
          "鸡群档案",
          "日生产日报",
          "免疫计划",
          "用药记录",
          "设备监控",
          "环境预警",
          "设备运维",
          "日产蛋入库",
          "包装作业",
          "包装批次",
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
          "pasted-screenshot-1783385734893-1.png",
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
          "未知",
          "210",
          "1",
          "INJURY",
          "10.00",
          "30.00℃",
          "28.00%",
          "晚班测试",
          "10",
          "SICKNESS",
          "白班测试",
          "2026-07-06T00:00:00.000Z",
          "测试鸡舍2",
          "5",
          "LOW_PRODUCTION",
          "36.00℃",
          "30.00%",
          "鸡舍2晚班测试",
          "AGE",
          "鸡舍2早班测试",
          "测试鸡舍",
          "11",
          "1.00",
          "37.00℃",
          "31.00%",
          "早班测试",
          "9",
          "0"
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
            "label": "养殖总览",
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
            "label": "包装作业",
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
            "label": "包装批次",
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
              "x": 940,
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
              "w": 93,
              "x": 1097,
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
              "x": 769,
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
              "y": -512
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
              "y": -512
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
              "y": -512
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
              "y": -512
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
              "y": -415
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
              "y": -415
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
              "y": -261
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
              "y": -159
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
              "y": -159
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
              "y": -159
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
              "y": -159
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
              "y": -44
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
              "y": -44
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
              "y": -44
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
              "y": -44
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
              "y": 73
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
              "y": 73
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
              "y": 73
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
              "y": 73
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
              "y": 73
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
              "y": 164
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
              "y": 266
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
              "y": 266
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
              "y": 266
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
              "y": 266
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
          "fileName": "01-1783385890768-eec55765.png",
          "sourceEndpoint": "/api/bug-intake/reports/BUG-20260707-0005/attachments/01-1783385890768-eec55765.png",
          "downloadError": "GET /api/bug-intake/reports/BUG-20260707-0005/attachments/01-1783385890768-eec55765.png failed HTTP 404: {\"code\":404,\"message\":\"附件文件不存在\",\"error\":\"Not Found\",\"statusCode\":404}"
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
    "source_bug_no": "BUG-20260707-0005",
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
    "source_repair_task_no": "BUGTASK-20260707-0005"
  },
  "createdAt": "2026-07-07T00:58:52.243Z",
  "createdBy": "admin",
  "moduleCode": "__________",
  "suggestedOwner": "_____",
  "repairGuardrails": {
    "autoRepairExecuted": false,
    "noProductionDeploy": true,
    "noDbWriteWithoutGate": true,
    "requiresHumanApproval": true
  },
  "acceptanceCriteria": "日生产日报点击”提交日报“时检查是否选择鸡舍，鸡舍显示“加载中...”就是没选择，若没选择鸡舍给一个提示“请先选择鸡舍后再提交”",
  "agentPlanGeneratedAt": "2026-07-07T00:58:53.452Z",
  "agentPlanGeneratedBy": "admin",
  "agentExecutionApproval": {
    "approved": true,
    "approvedAt": "2026-07-07T00:58:54.580Z",
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
我先做合约要求的执行检查，确认目录、分支和工作区状态；如果有非预期脏文件会先停下来报告。
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
 succeeded in 0ms:
exec
/bin/zsh -lc 'git log --oneline --decorate -8' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
68251b42 (HEAD -> w5-a3-backend-critical-path, main) docs(ops): record baseline lifecycle report
7837c762 feat(api): record A3-Backend-Critical-Path result
4c90ee24 docs(ops): record baseline lifecycle report
2509d07c feat(api): record A3-Backend-Critical-Path result
58d7acea fix: allow dashboard iot summary read
61748096 (w5-a4-frontend-uat-smoke) docs(ops): record baseline lifecycle report
af92d6da feat(web): record A4-Frontend-UAT-Smoke result
39001e31 docs(ops): record baseline lifecycle report

codex
执行检查通过：目录、分支正确，工作区干净。现在进入 dry-run 诊断，只读定位 `/breeding/daily` 对应的 API、DTO、service 和既有测试边界。
exec
/bin/zsh -lc 'find docs/ops -maxdepth 1 -type f | sort | tail -30' in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
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

exec
/bin/zsh -lc "rg --files apps/api/src | rg 'breeding|daily|production|report'" in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 succeeded in 0ms:
apps/api/src/modules/finance-v2/services/financial-reports.service.ts
apps/api/src/modules/finance-v2/controllers/financial-reports.controller.ts
apps/api/src/modules/store/entities/store-daily-close.entity.ts
apps/api/src/modules/analytics/services/production-analytics.service.ts
apps/api/src/modules/sales-v2/services/production-inbound.service.ts

exec
/bin/zsh -lc "rg -n \"breeding/daily|daily.*report|DailyReport|daily report|production daily|日生产日报|daily\" apps/api/src apps/api/test test docs/ops --glob '"'!**/node_modules/**'"'" in /Users/mac/phoenix-erp-worktrees/a3-backend-critical-path
 exited 2 in 0ms:
rg: test: No such file or directory (os error 2)
docs/ops/A5_DATA_READINESS_STORE_PAYMENT_001_REPORT.md:222:   - Legacy `pos_sales.sale_no` also exists in migrations and daily-close code.
docs/ops/A5_DATA_READINESS_STORE_PAYMENT_001_REPORT.md:300:1. MVP-1 cannot safely reuse `fin_ar_receipts`, POS payment completion, or daily close tables without violating the finance boundary.
docs/ops/AUTOMATED_WORKTREE_SYNC_AND_SAFE_MERGE.md:65:`agent-sync-and-merge.mjs` is the daily operator entrypoint.
docs/ops/PROCUREMENT_MATERIAL_QUICK_CREATE_REMEDIATION_20260626.md:9:The quick-create endpoint delegated directly to master-data runtime creation. Duplicate material names were rejected by validation after a new material code was already requested, and frontend behavior surfaced the failure as a hard create error. In daily procurement work, users often type a material that already exists with minor spacing/case differences, so this became a noisy production blocker.
docs/ops/MOBILE_DELIVERY_SCOPE_GATE_REMEDIATION_20260626.md:19:2. Mobile daily dashboard delivery section now recognizes `MENU_MOBILE_DELIVERY:V` in addition to sales/logistics menu entries.
apps/api/src/modules/finance-v2/controllers/finance-v2.controller.ts:167:            'GET /api/v2/finance/reports/cash-daily-flow',
apps/api/src/modules/finance-v2/controllers/financial-reports.controller.ts:121:   * GET /api/v2/finance/reports/cash-daily-flow
apps/api/src/modules/finance-v2/controllers/financial-reports.controller.ts:125:  @Get('cash-daily-flow')
apps/api/src/database/migrations/1782710000000-FixReimburseMenuAndSourceModeGrants.ts:16: * F5（高 · 局部 403）：/breeding/daily-inbound 页（view-gate=MENU_PROD_INBOUND，已授 FARMER/FARM_MGR）
docs/ops/WORKFLOW_RBAC_ATOMIC_PERMISSION_REMEDIATION_20260625.md:25:- Updated daily workbench, home shortcuts, workflow settings pages, form runtime page, and metrics page to check the corresponding atomic menu code.
docs/ops/FRONTEND_MENU_TREE_PERMISSION_GATE_20260626.md:26:- daily work shortcuts
docs/ops/REQ_STORE_PAYMENT_UNIFIED_CODE_001_SPEC.md:223:4. Reconcile daily between ERP payment records and actual account receipts.
docs/ops/AGENT_BASELINE_AUTOPILOT.md:78:`agent-baseline-autopilot.mjs` is the normal daily entrypoint. `agent-sync-and-merge.mjs` is the lower-level merge helper.
docs/ops/AI_DELIVERY_AGENT_PLATFORM_V2_SYNC_REVIEW.md:80:After this branch is merged, daily Agent branch merges should use:
docs/ops/BUG-20260706-0002_A3_BACKEND_CRITICAL_PATH_REPORT.md:26:The older `MonDeviceService.getAllSummary()` already had the cumulative-meter daily difference algorithm, but it was not used by the route that `/home` calls.
docs/ops/BUG-20260706-0002_A3_BACKEND_CRITICAL_PATH_REPORT.md:39:- `feedToday`: daily difference from property `2488`, falling back to `2532`
docs/ops/BUG-20260706-0002_A3_BACKEND_CRITICAL_PATH_REPORT.md:40:- `waterToday`: daily difference from property `2484`
docs/ops/BUG-20260706-0002_A3_BACKEND_CRITICAL_PATH_REPORT.md:46:- Prefer `mon_device_property_daily_agg.max_val` for today minus yesterday.
docs/ops/GLOBAL_REGRESSION_FINAL_ISSUES_20260628.md:32:| M3 | **前端调不存在端点** `/api/daily-work/today-stats`（无后端，try-catch 吞 404 → 每日工作台统计静默空白） | `daily-work/page.tsx:100` | 建后端 today-stats 端点 或 移除死调用 |
docs/ops/GLOBAL_RBAC_MENU_GATE_AUDIT_20260625.md:17:`/daily-work` cash receive/pay shortcuts previously required:
docs/ops/GLOBAL_RBAC_MENU_GATE_AUDIT_20260625.md:86:1. Sidebar and home/daily-work entry points now use atomic procurement and cash permissions where atomic codes already exist.
docs/ops/GLOBAL_RBAC_MENU_GATE_AUDIT_20260625.md:157:   - Split inbound/outbound/transfer/stocktake/loss/daily-close.
docs/ops/GLOBAL_RBAC_MENU_GATE_AUDIT_20260625.md:167:     - Home/daily-work shortcuts match the sidebar.
apps/api/src/modules/traceability/traceability.service.ts:11: *   鸡舍 brd_houses → 鸡群 brd_flocks → 生产 brd_daily_logs → 集蛋 pkg_source_batches
apps/api/src/modules/traceability/traceability.service.ts:175:    let houses: any[] = [], flocks: any[] = [], dailyLogs: any[] = [];
apps/api/src/modules/traceability/traceability.service.ts:189:        dailyLogs = await this.q(
apps/api/src/modules/traceability/traceability.service.ts:191:             FROM brd_daily_logs WHERE house_code = ANY($1) AND log_date = $2 LIMIT 20`,
apps/api/src/modules/traceability/traceability.service.ts:258:      production: { site: shift?.site_id ?? null, line: shift?.line_id ?? null, houses, flocks, dailyLogs, source, productionDate: packaging?.production_date ?? batch.egg_date },
apps/api/src/modules/terminal/stocktake.controller.ts:21:@Controller('api/dailyClose')
apps/api/src/modules/terminal/packaging.controller.ts:45:  @Get('daily-report')
apps/api/src/modules/terminal/packaging.controller.ts:47:  getDailyReport(@Query('date') date: string) {
apps/api/src/modules/terminal/packaging.controller.ts:48:    return this.packagingService.getDailyReport(date);
apps/api/src/modules/terminal/packaging.controller.ts:52:  @Get('daily-report-range')
apps/api/src/modules/terminal/packaging.controller.ts:54:  getDailyReportRange(@Query('end_date') endDate: string, @Query('days') days: string) {
apps/api/src/modules/terminal/packaging.controller.ts:55:    return this.packagingService.getDailyReportRange(endDate, Number(days) || 7);
docs/ops/NAMING_STYLE_UNIFICATION_AUDIT_20260627.md:100:| P3-9 | 门户页硬编码 accent 调色板（home/daily-work） | 样式 | `home/page.tsx:40-47`；`daily-work/page.tsx:44-59` | **7** |
docs/ops/NAMING_STYLE_UNIFICATION_AUDIT_20260627.md:194:**回归风险**：🟡 中 — 路由冲突现状下已有一个 handler 被静默覆盖，修复会改变实际命中的 handler。需确认前端调用方依赖的是哪个响应契约。stocktake 拆分（wms 改 api/inventory/daily-close）会变 URL，需同步前端调用。
docs/ops/NAMING_STYLE_UNIFICATION_AUDIT_20260627.md:227:**回归风险**：🟢 低（视觉层），但量大。建议**按页分多个小 PR**（ar-reconciliation+chanjet-sync 一组同模式可一起；reimbursements 一组；采购 orders+requests 一组；门户 home+daily-work 一组）。
apps/api/src/modules/terminal/packaging.service.ts:109:   * ② INSERT/UPDATE brd_daily_logs（产蛋日报，按日期+鸡舍+班次去重累加）
apps/api/src/modules/terminal/packaging.service.ts:205:        // ② brd_daily_logs（同日+鸡舍+班次去重累加）
apps/api/src/modules/terminal/packaging.service.ts:207:        await mgr.query('SAVEPOINT sp_daily_logs');
apps/api/src/modules/terminal/packaging.service.ts:210:            `SELECT id FROM brd_daily_logs
apps/api/src/modules/terminal/packaging.service.ts:217:              `UPDATE brd_daily_logs
apps/api/src/modules/terminal/packaging.service.ts:225:              `INSERT INTO brd_daily_logs
apps/api/src/modules/terminal/packaging.service.ts:237:          await mgr.query('RELEASE SAVEPOINT sp_daily_logs');
apps/api/src/modules/terminal/packaging.service.ts:239:          await mgr.query('ROLLBACK TO SAVEPOINT sp_daily_logs');
apps/api/src/modules/terminal/packaging.service.ts:240:          console.warn('[completeShift][WARN] brd_daily_logs skipped:', e?.message);
apps/api/src/modules/terminal/packaging.service.ts:846:  async getDailyReport(date: string) {
apps/api/src/modules/terminal/packaging.service.ts:894:   * B6: 一次返回 N 天的日报趋势（替代前端 Promise.all 串发 N 次 /daily-report）
apps/api/src/modules/terminal/packaging.service.ts:897:  async getDailyReportRange(endDate: string, days: number) {
apps/api/src/modules/terminal/packaging.service.ts:929:      console.error('[getDailyReportRange][ERR]', e?.message);
docs/ops/RBAC_EXTERNAL_INTERFACE_REMEDIATION_BATCH_20260626.md:8:2. Mobile daily dashboard module visibility still used hard-coded role arrays.
docs/ops/WORKFLOW_PERMISSION_ATOMIZATION_REMEDIATION_20260626.md:9:- Kept daily approval entries compatible:
docs/ops/WORKFLOW_PERMISSION_ATOMIZATION_REMEDIATION_20260626.md:25:This changes access behavior for workflow administration. It is intentional: users with only daily approval permissions should not see or call administration endpoints.
apps/api/src/modules/notification/notification-scheduler.service.ts:7: * 使用极简的 cron 匹配（分 时 日 月 周）。复杂表达式（@daily / L / W）
apps/api/src/modules/notification/notification-config.controller.ts:173:         daily_quota=COALESCE($4,daily_quota),
apps/api/src/modules/notification/notification-config.controller.ts:179:       body.daily_quota, body.rate_limit_per_min, body.status, body.remark],
docs/ops/runs/remediation-r3-menu-role-datascope-audit-20260624-122800/menu_inventory.txt:30:      12 | MENU_FARM_DAILY               | 鸡舍日报          | FARM        | [NULL]            |         12 | /farm/daily                     | 2026-05-21 06:18:17.358931
docs/ops/runs/remediation-r3-menu-role-datascope-audit-20260624-122800/menu_inventory.txt:37:    9010 | MENU_PROD_INBOUND             | 日产蛋入库        | FARM        | [NULL]            |         17 | /breeding/daily-inbound         | 2026-06-02 14:35:49.540757
apps/api/src/modules/store-pos/controllers/store-pos.controller.ts:9: *   GET    /daily-summary         — 当日汇总
apps/api/src/modules/store-pos/controllers/store-pos.controller.ts:57:  @Get('daily-summary')
apps/api/src/modules/uat/services/pilot-run-dashboard.service.ts:181:       FROM pilot_daily_reports
apps/api/src/modules/uat/services/pilot-run-dashboard.service.ts:350:  async generateDailyReport(pilotRunId: number, date?: string): Promise<any> {
apps/api/src/modules/uat/services/pilot-run-dashboard.service.ts:358:      `INSERT INTO pilot_daily_reports (
apps/api/src/modules/uat/services/pilot-run-dashboard.service.ts:412:  async getDailyReports(pilotRunId: number, page = 1, limit = 14) {
apps/api/src/modules/uat/services/pilot-run-dashboard.service.ts:417:        `SELECT * FROM pilot_daily_reports
apps/api/src/modules/uat/services/pilot-run-dashboard.service.ts:424:        `SELECT COUNT(*) AS total FROM pilot_daily_reports WHERE pilot_run_id = $1`,
apps/api/src/modules/uat/controllers/pilot-run-dashboard.controller.ts:8: *   POST /api/uat/pilot-runs/:id/daily-report     — 手动触发日报生成
apps/api/src/modules/uat/controllers/pilot-run-dashboard.controller.ts:9: *   GET  /api/uat/pilot-runs/:id/daily-reports    — 日报历史列表
apps/api/src/modules/uat/controllers/pilot-run-dashboard.controller.ts:40:  @Post(':id/daily-report')
apps/api/src/modules/uat/controllers/pilot-run-dashboard.controller.ts:42:  async generateDailyReport(
apps/api/src/modules/uat/controllers/pilot-run-dashboard.controller.ts:46:    return this.dashboardService.generateDailyReport(id, date);
apps/api/src/modules/uat/controllers/pilot-run-dashboard.controller.ts:50:  @Get(':id/daily-reports')
apps/api/src/modules/uat/controllers/pilot-run-dashboard.controller.ts:52:  async getDailyReports(
apps/api/src/modules/uat/controllers/pilot-run-dashboard.controller.ts:57:    return this.dashboardService.getDailyReports(id, page, limit);
apps/api/src/modules/wms/inventory.controller.ts:6:// 同步暴露 /api/stocktake/daily-close 给前端 daily-close 页（避免改前端）
apps/api/src/modules/wms/inventory.controller.ts:13:  @Get('daily-close')
apps/api/src/modules/wms/inventory.controller.ts:19:  @Post('daily-close')
apps/api/src/modules/store/entities/store-daily-close.entity.ts:7:@Entity('biz_store_daily_close')
apps/api/src/modules/wms/wms.service.ts:825:  // A6: 日结 (daily-close)
apps/api/src/modules/wms/wms.service.ts:826:  //   前端 daily-close/page.tsx 调 /api/stocktake/daily-close (旧路由不存在)
apps/api/src/modules/wms/wms.service.ts:827:  //   新挂在 /api/inventory/daily-close 下（同 inventory.controller）
apps/api/src/modules/store/store.controller.ts:3:import { StoreDailyCloseEntity } from './entities/store-daily-close.entity';
apps/api/src/modules/store/store.controller.ts:13:  @Post('daily-close')
apps/api/src/modules/store/store.controller.ts:19:  @Put('daily-close/:id')
apps/api/src/modules/store/store.controller.ts:25:  @Post('daily-close/:id/close')
apps/api/src/modules/store/store.controller.ts:32:  // 来源：_archive/phoenix-backend-v2-sqlite/src/routes/dailyClose.js
apps/api/src/modules/store/store.controller.ts:33:  // 路径：/api/v3/store/daily-close-v2/* (与现有 entity-based 路由共存)
apps/api/src/modules/store/store.controller.ts:36:  @Get('daily-close-v2/preview')
apps/api/src/modules/store/store.controller.ts:43:  @Post('daily-close-v2/submit')
apps/api/src/modules/store/store.controller.ts:50:  @Get('daily-close-v2')
apps/api/src/modules/store/store.service.ts:4:import { StoreDailyCloseEntity } from './entities/store-daily-close.entity';
apps/api/src/modules/store/store.service.ts:10:    private readonly dailyCloseRepo: Repository<StoreDailyCloseEntity>,
apps/api/src/modules/store/store.service.ts:15:    const record = this.dailyCloseRepo.create(dto);
apps/api/src/modules/store/store.service.ts:17:    return await this.dailyCloseRepo.save(record);
apps/api/src/modules/store/store.service.ts:21:    const record = await this.dailyCloseRepo.findOne({ where: { id } });
apps/api/src/modules/store/store.service.ts:33:    return await this.dailyCloseRepo.save(record);
apps/api/src/modules/store/store.service.ts:43:  // 来源：_archive/phoenix-backend-v2-sqlite/src/routes/dailyClose.js
apps/api/src/modules/store/store.service.ts:47:  //   2. INSERT daily_close (close_no, status='SUBMITTED')
apps/api/src/modules/store/store.service.ts:72:      `SELECT id FROM daily_close WHERE store_code = $1 AND close_date = $2 AND status = 'SUBMITTED' LIMIT 1`,
apps/api/src/modules/store/store.service.ts:110:  /** 日结提交 — 原子事务写入 daily_close + acc_ledger + fin_transactions (V2 fidelity)
apps/api/src/modules/store/store.service.ts:130:        `SELECT id FROM daily_close WHERE store_code = $1 AND close_date = $2 AND status = 'SUBMITTED' LIMIT 1`,
apps/api/src/modules/store/store.service.ts:159:        `SELECT id FROM daily_close WHERE close_no = $1 LIMIT 1`,
apps/api/src/modules/store/store.service.ts:164:          `UPDATE daily_close
apps/api/src/modules/store/store.service.ts:178:          `INSERT INTO daily_close
apps/api/src/modules/store/store.service.ts:248:          `SELECT * FROM daily_close WHERE store_code = $1 ORDER BY close_date DESC LIMIT 30`,
apps/api/src/modules/store/store.service.ts:251:      : await this.em.query(`SELECT * FROM daily_close ORDER BY close_date DESC LIMIT 30`);
apps/api/src/modules/store/store.module.ts:5:import { StoreDailyCloseEntity } from './entities/store-daily-close.entity';
apps/api/src/modules/analytics/services/forecast-analytics.service.ts:80:         FROM brd_daily_logs WHERE log_date > CURRENT_DATE - 30
apps/api/src/modules/analytics/services/production-analytics.service.ts:9: * 数据源：brd_daily_logs / brd_flocks / pkg_exceptions / wms_outbound（销售）
apps/api/src/modules/analytics/services/production-analytics.service.ts:30:         FROM brd_daily_logs
apps/api/src/modules/analytics/services/production-analytics.service.ts:40:         FROM brd_daily_logs
apps/api/src/modules/analytics/services/production-analytics.service.ts:54:         FROM brd_daily_logs d
apps/api/src/modules/analytics/services/production-analytics.service.ts:68:         FROM brd_daily_logs
apps/api/src/modules/analytics/services/production-analytics.service.ts:78:         FROM brd_daily_logs
apps/api/src/modules/generic-crud/generic-crud.controller.ts:135:    //   业务记录表（daily_logs/medication_records/vaccinations）→ MENU_FARM_DATA（业务录入权）
apps/api/src/modules/generic-crud/generic-crud.controller.ts:228:    //   username≠'admin' → 被判非全局 → brd_daily_logs 等行级注入 store/site → 只看一个场」。
apps/api/src/modules/generic-crud/generic-crud.controller.ts:239:    // 'SITE-MENGSAI-LAYER'），而 brd_daily_logs.farm_code 是 farm 维度（如
apps/api/src/modules/generic-crud/generic-crud.controller.ts:241:    // MDM-1 后 brd_daily_logs 有 site_code、brd_farms 有 mapped_site_code，
apps/api/src/modules/generic-crud/generic-crud.controller.ts:244:      brd_daily_logs:   'site_code',         // mdm1_05 已加 + 回填
apps/api/src/modules/generic-crud/generic-crud.service.ts:58:        'pos_sales', 'pos_sale_items', 'daily_close', 'acc_ledger',
apps/api/src/modules/generic-crud/generic-crud.service.ts:59:        'brd_daily_logs', 'brd_medications',
apps/api/src/modules/generic-crud/generic-crud.service.ts:160:        // （brd_daily_logs.farm_code / brd_medications.medication_code 在各自 CREATE
apps/api/src/modules/generic-crud/generic-crud.service.ts:591:        // A1: 把 brd_daily_logs 唯一键从 (log_date, house_code) 扩展到含 shift，
apps/api/src/modules/generic-crud/generic-crud.service.ts:598:             WHERE conrelid = 'brd_daily_logs'::regclass
apps/api/src/modules/generic-crud/generic-crud.service.ts:599:               AND conname = 'brd_daily_logs_date_house_key'
apps/api/src/modules/generic-crud/generic-crud.service.ts:601:             ALTER TABLE brd_daily_logs DROP CONSTRAINT brd_daily_logs_date_house_key;
apps/api/src/modules/generic-crud/generic-crud.service.ts:604:           UPDATE brd_daily_logs SET shift = '' WHERE shift IS NULL;
apps/api/src/modules/generic-crud/generic-crud.service.ts:607:             WHERE conrelid = 'brd_daily_logs'::regclass
apps/api/src/modules/generic-crud/generic-crud.service.ts:608:               AND conname = 'brd_daily_logs_date_house_shift_key'
apps/api/src/modules/generic-crud/generic-crud.service.ts:610:             ALTER TABLE brd_daily_logs
apps/api/src/modules/generic-crud/generic-crud.service.ts:611:               ADD CONSTRAINT brd_daily_logs_date_house_shift_key
apps/api/src/modules/generic-crud/generic-crud.service.ts:617:        `ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS elimination_qty  INT          DEFAULT 0`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:618:        `ALTER TABLE brd_daily_logs ADD COLUMN IF NOT EXISTS culling_reason   VARCHAR(200)`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:905:        // ── V2 fidelity backfill: daily_close.close_no 索引 (加速幂等查询) ───
apps/api/src/modules/generic-crud/generic-crud.service.ts:906:        `CREATE INDEX IF NOT EXISTS daily_close_close_no_idx ON daily_close(close_no)`,
apps/api/src/modules/generic-crud/generic-crud.service.ts:1215:        // ── 养殖日报（brd_daily_logs）────────────────────────────────────
apps/api/src/modules/generic-crud/generic-crud.service.ts:1216:        `CREATE TABLE IF NOT EXISTS brd_daily_logs (
apps/api/src/modules/generic-crud/generic-crud.service.ts:1575:        `CREATE TABLE IF NOT EXISTS daily_close (
apps/api/src/modules/generic-crud/crud.constants.ts:16:  'brd_farms', 'brd_flocks', 'brd_daily_logs', 'brd_vaccinations', 'brd_houses', 'brd_medications', 'brd_medication_records',
apps/api/src/modules/generic-crud/crud.constants.ts:24:  'pos_sales', 'pos_sale_items', 'daily_close',
apps/api/src/modules/bff/bff.controller.ts:99:               FROM brd_daily_logs WHERE log_date::text = $1 AND farm_code = $2`
apps/api/src/modules/bff/bff.controller.ts:101:               FROM brd_daily_logs WHERE log_date::text = $1`,
apps/api/src/modules/bff/bff.controller.ts:365:    const [dailyFilled] = await safe(
apps/api/src/modules/bff/bff.controller.ts:366:      this.em.query(`SELECT COUNT(DISTINCT house_code)::int AS cnt FROM brd_daily_logs WHERE log_date::text=$1`, [today]),
apps/api/src/modules/bff/bff.controller.ts:397:    const d2 = score(Number(dailyFilled?.cnt) || 0, Number(houseTotal?.cnt) || 0);
apps/api/src/modules/bff/bff.controller.ts:412:          { name: '日报录入完整度', score: d2, maxScore: 20, detail: `今日 ${dailyFilled?.cnt || 0}/${houseTotal?.cnt || 0} 鸡舍已提交日报` },
apps/api/src/modules/bff/bff.controller.ts:699:           FROM brd_daily_logs WHERE log_date >= CURRENT_DATE - INTERVAL '30 days'`
apps/api/src/modules/bff/bff.controller.ts:727:           FROM brd_daily_logs WHERE log_date >= CURRENT_DATE - INTERVAL '30 days'`
apps/api/src/modules/bff/bff.controller.ts:733:           FROM brd_daily_logs
apps/api/src/modules/bff/bff.controller.ts:808:        FROM brd_daily_logs
apps/api/src/modules/farm/farm.service.spec.ts:56:      expect(manager.query.mock.calls[0][0]).toContain('INSERT INTO "brd_daily_logs"');
apps/api/src/modules/farm/farm.cron.ts:19:    this.logger.log('Starting daily medication status update cron job...');
apps/api/src/modules/farm/farm.cron.ts:45:      await this.cronMon.ok('farm_daily');
apps/api/src/modules/farm/farm.cron.ts:48:      await this.cronMon.fail('farm_daily', (e as Error)?.message ?? String(e));
apps/api/src/modules/farm/farm.controller.ts:30:  @Post('daily-logs')
apps/api/src/modules/farm/farm.controller.ts:36:  @Put('daily-logs/:id')
apps/api/src/modules/farm/farm.controller.ts:43:   * GET /api/v3/farm/daily-logs/eggs-breakdown?date=&houseCode=
apps/api/src/modules/farm/farm.controller.ts:47:  @Get('daily-logs/eggs-breakdown')
apps/api/src/modules/farm/farm.controller.ts:57:  @Get('daily-hen-report')
apps/api/src/modules/farm/farm.service.ts:9: *   - A6: 移除 FarmDailyEntity 死代码（entity 指向不存在的 biz_farm_daily 表，3 个旧路由全死）
apps/api/src/modules/farm/farm.service.ts:10: *   - A1: brd_daily_logs UNIQUE(log_date, house_code) 与"多班次"业务模型冲突 →
apps/api/src/modules/farm/farm.service.ts:105:// brd_daily_logs 允许写入的列（白名单 — 任何前端伪造的列名都会被丢弃）
apps/api/src/modules/farm/farm.service.ts:182:          `SELECT closing_qty FROM brd_daily_logs
apps/api/src/modules/farm/farm.service.ts:262:        `INSERT INTO "brd_daily_logs" (${quotedFields}) VALUES (${placeholders}) ${conflictClause}`,
apps/api/src/modules/farm/farm.service.ts:272:           FROM brd_daily_logs
apps/api/src/modules/farm/farm.service.ts:335:         FROM brd_daily_logs WHERE id = $1`,
apps/api/src/modules/farm/farm.service.ts:351:        `UPDATE "brd_daily_logs" SET ${setClauses} WHERE id = $${fields.length + 1}`,
apps/api/src/modules/farm/farm.service.ts:362:           FROM brd_daily_logs
apps/api/src/modules/farm/farm.service.ts:417:   * 用于 daily-inbound 页"从今日日报预填"按钮 — 业务方录完日报后，
apps/api/src/modules/farm/farm.service.ts:434:      `SELECT eggs_by_grade FROM brd_daily_logs WHERE ${where.join(' AND ')}`,
apps/api/src/modules/farm/farm.service.ts:481:       FROM brd_daily_logs
apps/api/src/modules/farm/farm.service.ts:557:       FROM brd_daily_logs
apps/api/src/modules/farm/farm-feed.service.ts:7:  { name: '玉米',     unit: '公斤', daily_usage: 15000 },
apps/api/src/modules/farm/farm-feed.service.ts:8:  { name: '豆粕',     unit: '公斤', daily_usage: 6000  },
apps/api/src/modules/farm/farm-feed.service.ts:9:  { name: '预混料',   unit: '公斤', daily_usage: 450   },
apps/api/src/modules/farm/farm-feed.service.ts:10:  { name: '青年预混料', unit: '公斤', daily_usage: 150  },
apps/api/src/modules/farm/farm-feed.service.ts:11:  { name: '豆油',     unit: '公斤', daily_usage: 240   },
apps/api/src/modules/farm/farm-feed.service.ts:12:  { name: '石粉',     unit: '公斤', daily_usage: 1300  },
apps/api/src/modules/farm/farm-feed.service.ts:13:  { name: '米糠',     unit: '公斤', daily_usage: 500   },
apps/api/src/modules/farm/farm-feed.service.ts:36:        daily_usage   DECIMAL(12,2) NOT NULL DEFAULT 0,
apps/api/src/modules/farm/farm-feed.service.ts:76:        daily_usage: prev ? Number(prev.daily_usage) : m.daily_usage,
apps/api/src/modules/farm/farm-feed.service.ts:93:           outbound_detail, outbound_total, daily_usage, note, operator, updated_at)
apps/api/src/modules/farm/farm-feed.service.ts:100:          daily_usage     = EXCLUDED.daily_usage,
apps/api/src/modules/farm/farm-feed.service.ts:109:        item.daily_usage ?? 0, item.note ?? '', operator,
apps/api/src/modules/farm/farm-feed.service.ts:203:    const dailyUsage   = Number(r.daily_usage   ?? 0);
apps/api/src/modules/farm/farm-feed.service.ts:205:    const daysLeft     = dailyUsage > 0 ? Math.floor(currentStock / dailyUsage) : null;
apps/api/src/modules/farm/farm-feed.service.ts:217:      daily_usage:     dailyUsage,
apps/api/src/common/guards/roles.guard.ts:11: *   @Post('daily-logs')
apps/api/src/modules/procurement/procurement.service.ts:397:        FROM mon_device_property_daily_agg
apps/api/src/modules/iot/mon-device.controller.ts:68:  @Post('daily-report/generate')
apps/api/src/modules/iot/mon-device.controller.ts:70:  async generateDailyReport(@Body() body: { house_code: string; log_date: string; snapshot_hour?: number }) {
apps/api/src/modules/iot/mon-device.controller.ts:71:    return this.monDeviceService.generateDailyReportFromIoT(
apps/api/src/modules/iot/mon-device.controller.ts:78:  @Post('daily-report/batc
```
