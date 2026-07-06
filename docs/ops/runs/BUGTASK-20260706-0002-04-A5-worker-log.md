# Agent Worker Log

| Field | Value |
| --- | --- |
| Task ID | BUGTASK-20260706-0002-04-A5 |
| Agent | A5-Data-Readiness |
| Dry run | No |
| Exit code | 0 |

## Command

```bash
node scripts/ops/run-agent-task.mjs --agent A5-Data-Readiness --worktree /Users/mac/phoenix-erp-worktrees/a5-data-readiness --prompt docs/ops/prompts/A5_DATA_READINESS_PROMPT.md --task-contract docs/ops/runs/BUGTASK-20260706-0002-04-A5-contract.md --assembled-prompt-output docs/ops/runs/BUGTASK-20260706-0002-04-A5-worker-assembled-prompt.md --require-approval-token APPROVE_AGENT_EXECUTION --skip-baseline-autopilot --allow-ops-runtime-dirty
```

## Stdout

```text
Agent: A5-Data-Readiness
Worktree: /Users/mac/phoenix-erp-worktrees/a5-data-readiness
Branch: w5-a5-data-readiness
Prompt: docs/ops/prompts/A5_DATA_READINESS_PROMPT.md
Task contract: docs/ops/runs/BUGTASK-20260706-0002-04-A5-contract.md
Assembled prompt: docs/ops/runs/BUGTASK-20260706-0002-04-A5-worker-assembled-prompt.md
Assembled prompt chars: 31089
Codex command: codex exec -C /Users/mac/phoenix-erp-worktrees/a5-data-readiness --sandbox workspace-write -
Codex timeout ms: 600000
Run log: /Users/mac/phoenix-erp-worktrees/codex-orchestrator/docs/ops/runs/2026-07-06T07-59-52-416Z-A5-Data-Readiness.md
PASS WITH CONDITIONS.

已完成 A5 只读诊断报告：[docs/ops/BUGTASK-20260706-0002_A5_DATA_READINESS_REPORT.md](/Users/mac/phoenix-erp-worktrees/a5-data-readiness/docs/ops/BUGTASK-20260706-0002_A5_DATA_READINESS_REPORT.md)

关键结论：`/home` 调用的是 `GET /api/v3/iot/devices/all-summary`，该接口当前在 `apps/api/src/modules/iot/iot-v3.controller.ts` 里把 `feedToday` / `waterToday` 硬编码为 `null`，所以即使数据库有今日饲料/用水读数，运营工作台也拿不到真实值。另一个服务 `MonDeviceService.getAllSummary()` 已有基于 `mon_device_property_daily_agg` 的今日/昨日累计差额算法，但 `/home` 当前没有走这条数据路径。

验证/限制：
- 环境检查通过：目录、分支、初始工作区干净。
- 只新增 docs/ops 报告，未改业务代码、未写 DB、未迁移、未部署、未 push。
- 本地 `psql` 只读连接被沙箱拦截：`Operation not permitted`；`docker` 不可用，所以 live DB baseline 未能证明，发布前仍需补一次只读 DB 证据。
- 当前工作区仅有一个未跟踪报告文件；按合同未提交 commit。
Baseline autopilot skipped by caller; caller must run lifecycle hook.

```

## Stderr

```text
OpenAI Codex v0.142.5
--------
workdir: /Users/mac/phoenix-erp-worktrees/a5-data-readiness
model: gpt-5.5
provider: openai
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR]
reasoning effort: medium
reasoning summaries: none
session id: 019f366e-5355-75d1-8de0-bda05179cceb
--------
user
# Base Agent Prompt

# A5 Data Readiness Prompt

## Agent Identity

You are `A5-Data-Readiness`.

## Worktree and Branch

Worktree: `/Users/mac/phoenix-erp-worktrees/a5-data-readiness`

Branch: `w5-a5-data-readiness`

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

Read-only data baseline checks, master-data readiness reports, gray-data planning, docs/ops evidence.

## Forbidden Scope

No data writes, no migrations, no schema/entity/table/column edits, no seed execution, no production deploy, no push, and no business code.

## Output Report Format

Write a report with data sources inspected, read-only commands, baseline findings, blockers, required user decisions, and GO/HOLD recommendation for data readiness.

## Commit Rule

Commit only approved docs/ops reports unless explicitly authorized.

## Failure Rule

Stop on required DB write, unclear environment, missing read-only proof, forbidden scope, or unexpected dirty files.

---

# Agent Task Contract

# Bug Repair Agent Contract

Source bug: BUG-20260706-0002
Source repair task: BUGTASK-20260706-0002
Assigned agent: A5-Data-Readiness

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
我会先跑合同要求的环境检查；如果目录、分支或工作区状态不符合，就停在诊断阶段，不做任何写入。
exec
/bin/zsh -lc pwd in /Users/mac/phoenix-erp-worktrees/a5-data-readiness
 succeeded in 0ms:
/Users/mac/phoenix-erp-worktrees/a5-data-readiness

exec
/bin/zsh -lc 'git branch --show-current' in /Users/mac/phoenix-erp-worktrees/a5-data-readiness
 succeeded in 0ms:
w5-a5-data-readiness

exec
/bin/zsh -lc 'git log --oneline --decorate -8' in /Users/mac/phoenix-erp-worktrees/a5-data-readiness
 succeeded in 0ms:
4837848f (HEAD -> w5-a5-data-readiness) docs(ops): record cash account data readiness report
83b70cca docs(ops): record baseline lifecycle report
306e7d86 docs(ops): prioritize production readiness remediation tasks
8ebf8089 docs(ops): record baseline lifecycle report
e26335fb chore(ops): add agent inbox short command mode
ccff7ca2 docs(ops): record baseline lifecycle report
e1481a39 docs(ops): record menu role datascope repair execution
9ab76f89 docs(ops): record baseline lifecycle report

exec
/bin/zsh -lc 'git status --short' in /Users/mac/phoenix-erp-worktrees/a5-data-readiness
 succeeded in 0ms:
codex
环境检查通过：目录和分支匹配，工作区干净。现在只做只读取证：先定位 `/home` 工作台指标来源，再看是否有本地只读数据可证明“今日饲料/用水”为空、接口未返回，还是前端映射没展示。
exec
/bin/zsh -lc 'rg --files apps/web apps/api | rg "(home|dashboard|workbench|daily|farm|device|production|overview)"' in /Users/mac/phoenix-erp-worktrees/a5-data-readiness
 succeeded in 0ms:
apps/web/src/components/design-system/workbench/WorkbenchParts.tsx
apps/web/src/components/design-system/workbench/WorkbenchKit.tsx
apps/api/src/modules/procurement-v2/services/dashboard.service.ts
apps/api/src/modules/procurement-v2/controllers/dashboard.controller.ts
apps/api/src/modules/procurement-v2/dto/query-dashboard.dto.ts
apps/api/src/modules/store/entities/store-daily-close.entity.ts
apps/api/src/modules/analytics/services/production-analytics.service.ts
apps/api/src/modules/sales-v2/services/production-inbound.service.ts
apps/api/src/modules/iot/farm-cabin.controller.ts
apps/api/src/modules/iot/mon-device.controller.ts
apps/api/src/modules/iot/farm-device.controller.ts
apps/api/src/modules/iot/mon-device.service.ts
apps/web/src/app/(admin)/store/daily/page.tsx
apps/web/src/app/(admin)/analytics/production/page.tsx
apps/web/src/app/(admin)/shareholders/dashboard/page.tsx
apps/api/src/modules/org/entities/sys-user-farm-scope.entity.ts
apps/web/src/app/(admin)/warehouse/daily-close/page.tsx
apps/api/src/modules/uat/services/pilot-run-dashboard.service.ts
apps/api/src/modules/uat/controllers/pilot-run-dashboard.controller.ts
apps/api/src/modules/farm/farm-sales.controller.ts
apps/api/src/modules/farm/farm.cron.ts
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
apps/api/ddl/25_production_ops_tables.sql
apps/web/src/app/(terminal)/terminal/packaging/dashboard/page.tsx
apps/api/migrations/20260613_g87d_mengsai_farm_company.sql
apps/api/migrations/20260602_production_chain_convergence_phase1_b_menus.sql
apps/api/migrations/20260605_mdm1_03_brd_farms_extend.sql
apps/api/migrations/20260605_mdm1_05_brd_daily_logs_extend.sql
apps/api/migrations/20260602_production_inventory_source_mode_phase_p1a_a_tables.sql
apps/api/migrations/20260615_g123_cleanup_debug_farm.sql
apps/api/migrations/20260602_production_chain_convergence_phase1_a_inv_columns.sql
apps/api/migrations/20260606_brd_daily_logs_eggs_by_grade.sql
apps/api/migrations/20260608_g33_farm_master_menu.sql
apps/api/migrations/20260605_g4e_user_farm_scopes_table.sql
apps/api/migrations/20260615_g121_product_master_production.sql
apps/api/migrations/20260613_g97_farm_daily_view_to_shareholder_region.sql
apps/api/migrations/20260612_g87_farm_company_scope.sql
apps/web/src/app/(admin)/master/farms/page.tsx
apps/api/migrations/archive/v3_production_migration.sql
apps/api/migrations/20260606_cleanup_redundant_farms.sql
apps/api/migrations/20260607_g19_daily_mortality_reason.sql
apps/api/migrations/20260602_production_inventory_source_mode_phase_p1a_b_menus.sql
apps/api/migrations/20260605_mengsai_production_data_lead_role.sql
apps/web/src/app/(admin)/quality/farm/page.tsx
apps/web/src/app/(admin)/breeding/daily-inbound/page.tsx
apps/web/src/app/(admin)/breeding/device-ops/page.tsx
apps/web/src/app/(admin)/home/page.tsx
apps/web/src/app/(admin)/procurement2/dashboard/page.tsx
apps/web/src/app/(admin)/breeding/device/page.tsx
apps/web/src/app/(admin)/breeding/daily/page.tsx
apps/web/src/app/(admin)/daily-work/page.tsx
apps/web/src/app/(admin)/breeding/device/[houseCode]/page.tsx
apps/web/src/app/(admin)/breeding/device-alerts/page.tsx
apps/web/src/app/(admin)/packaging/daily-report/page.tsx
apps/web/src/app/(admin)/dashboard/page.tsx
apps/web/src/app/(admin)/dashboard/_components/dashboard.module.css
apps/web/src/app/(admin)/dashboard/_components/DashboardKPIs.tsx
apps/web/src/app/(admin)/dashboard/dashboard.module.css
apps/web/src/app/(mobile)/mobile/home/page.tsx
apps/web/src/app/(mobile)/mobile/dashboard/page.tsx

exec
/bin/zsh -lc 'ls -la docs | tail -40' in /Users/mac/phoenix-erp-worktrees/a5-data-readiness
 succeeded in 0ms:
-rw-r--r--    1 mac  staff    6871 Jun 21 13:54 ui-ux-governance-phase-ui24-pilot-migration.md
-rw-r--r--    1 mac  staff    7478 Jun 21 13:54 ui-ux-governance-phase-ui25-high-risk-migration.md
-rw-r--r--    1 mac  staff    7716 Jun 21 13:54 ui-ux-governance-phase-ui26-medium-risk-migration.md
-rw-r--r--    1 mac  staff    5399 Jun 21 13:54 ui-ux-page-template-guide.md
-rw-r--r--    1 mac  staff   12959 Jun 21 13:54 ui-ux-phase1-production-validation.md
-rw-r--r--    1 mac  staff    7541 Jun 21 13:54 ui-ux-phase1-report.md
-rw-r--r--    1 mac  staff    3149 Jun 21 13:54 ui-ux-template-pilot-plan.md
-rw-r--r--    1 mac  staff   11820 Jun 21 13:54 uix-prod1-product-experience-reconstruction.md
-rw-r--r--    1 mac  staff   14734 Jun 21 13:54 uix1-design-system-framework.md
-rw-r--r--    1 mac  staff   10554 Jun 21 13:54 uix2-design-system-migration.md
drwxr-xr-x    4 mac  staff     128 Jun 21 13:54 uix2-screenshots
-rw-r--r--    1 mac  staff    8662 Jun 21 13:54 uix2a-design-debt-elimination.md
-rw-r--r--    1 mac  staff    7882 Jun 21 13:54 uix3-design-system-finalization.md
drwxr-xr-x    5 mac  staff     160 Jun 21 13:54 uix3-screenshots
-rw-r--r--    1 mac  staff    9130 Jun 21 13:54 uix4-design-system-final.md
drwxr-xr-x    5 mac  staff     160 Jun 21 13:54 uix4-screenshots
-rw-r--r--    1 mac  staff    6375 Jun 21 13:54 uix5-design-system-migration.md
-rw-r--r--    1 mac  staff    6888 Jun 21 13:54 uix6-design-system-migration.md
drwxr-xr-x    4 mac  staff     128 Jun 21 13:54 uix6-screenshots
-rw-r--r--    1 mac  staff    8673 Jun 21 13:54 uix7-product-experience-refactor.md
drwxr-xr-x    5 mac  staff     160 Jun 21 13:54 uix7-screenshots
-rw-r--r--    1 mac  staff    7844 Jun 21 13:54 uix8-product-experience-expansion.md
drwxr-xr-x    4 mac  staff     128 Jun 21 13:54 uix8-screenshots
-rw-r--r--    1 mac  staff   11190 Jun 21 13:54 uix9a-master-data-productization-final.md
-rw-r--r--    1 mac  staff    6216 Jun 21 13:54 user-role-matrix-v3.md
-rw-r--r--    1 mac  staff   26860 Jun 21 13:54 v3-final-readiness-audit.md
-rw-r--r--    1 mac  staff    2496 Jun 21 13:54 v3-refine-b-impersonation-sweep.md
-rw-r--r--    1 mac  staff    2057 Jun 21 13:54 v3-refine-m1-settings.md
-rw-r--r--    1 mac  staff    4417 Jun 21 13:54 v3-refine-m2-master-data.md
-rw-r--r--    1 mac  staff   14595 Jun 21 13:54 wf1-approval-center-full-audit.md
drwxr-xr-x    6 mac  staff     192 Jun 21 13:54 wf1-screenshots
-rw-r--r--    1 mac  staff   11673 Jun 21 13:54 wf2-approval-center-completion.md
drwxr-xr-x    7 mac  staff     224 Jun 21 13:54 wf2-screenshots
-rw-r--r--    1 mac  staff    8821 Jun 21 13:54 workflow-2-phase-a.md
-rw-r--r--    1 mac  staff    9149 Jun 21 13:54 workflow-hardening-p0-report.md
-rw-r--r--    1 mac  staff    9741 Jun 21 13:54 workflow-rule-designer-capability-check.md
-rw-r--r--    1 mac  staff   12149 Jun 21 13:54 workflow-sla-push-ops.md
-rw-r--r--    1 mac  staff   74515 Jun 21 13:54 金凤凰ERP-生产初始化导入确认表-M5-已填确认.docx
-rw-r--r--    1 mac  staff   67523 Jun 21 13:54 金凤凰ERP-生产初始化导入确认表-M5.docx
-rw-r--r--    1 mac  staff    7423 Jun 21 13:54 金凤凰ERP正式用户角色矩阵V2.xlsx

exec
/bin/zsh -lc 'rg -n "今日饲料|今日用水|饲料|用水|feed|water|workbench|dashboard|运营工作台" apps/web apps/api docs scripts' in /Users/mac/phoenix-erp-worktrees/a5-data-readiness
 succeeded in 0ms:
apps/web/src/lib/shareholder-api.ts:58:  FEED_MILL: '饲料厂', OTHER: '其他',
apps/web/src/lib/shareholder-api.ts:107:  dashboard: () => request<{ scope: string; count?: number; projects: ShrProject[]; note?: string }>('/shareholders/dashboard'),
docs/shareholder-runtime-phase2b-r4-dongpeng-beneficial-equity.md:58:- `dashboardProject` 返回 beneficialStructure。
docs/shareholder-runtime-phase2b-r4-dongpeng-beneficial-equity.md:104:- `apps/api/src/modules/shareholder/services/shareholder.service.ts`（listBeneficial + dashboardProject 实益结构）
apps/web/src/lib/impersonate.ts:56:  window.location.href = "/dashboard";
docs/ui-ux-governance-phase-ui2-components.md:12:21 个统一组件落地于 `components/design-system/`,八大体系(cards/tables/forms/feedback/dialogs/drawers/detail/layouts+charts)齐备。
docs/ui-ux-governance-phase-ui2-components.md:28:├── feedback/   EmptyState.tsx / LoadingSkeleton.tsx / ErrorState.tsx
apps/web/src/lib/design-tokens.ts:294:  dashboard:   '#1F3864', // 驾驶舱—品牌蓝
docs/g9-business-mapping.md:11:| `prc2_purchase_orders` | 5 | 饲料/物料采购单 |
docs/g9-business-mapping.md:68:| subject | "饲料 采购 - YYYY-MM-DD" | ✓ 表单 | ✓ |
docs/g9-business-mapping.md:150:| 饲料 / 用水 / 温湿度 | ✓ | 高效 ✓ | |
apps/web/src/lib/mobile-api.ts:116:  feed_consumed?:  number | string;
apps/web/src/lib/mobile-api.ts:117:  water_consumed?: number | string;
apps/web/src/lib/mobile-api.ts:261:  feed:           number;
apps/web/src/lib/mobile-api.ts:275:    feed:        number;
apps/web/src/lib/mobile-api.ts:284:  feed:        number;
apps/web/src/lib/mobile-api.ts:296:    avg_feed:        number;
apps/web/src/lib/mobile-api.ts:308:  getKpi: () => get<KpiData>('/api/dashboard/kpi'),
apps/web/src/lib/mobile-api.ts:334:  /** 饲料台账 — 查询某日 */
apps/web/src/lib/mobile-api.ts:336:    get<FeedLedgerRow[]>(`/api/farm/feed/ledger?date=${date}`),
apps/web/src/lib/mobile-api.ts:338:  /** 饲料台账 — 保存 */
apps/web/src/lib/mobile-api.ts:340:    fetch((process.env.NEXT_PUBLIC_API_BASE || '') + '/api/farm/feed/ledger', {
apps/web/src/lib/mobile-api.ts:351:    getCached('feedHousesDetail', () => get<Array<{ house_code: string; house_name: string; capacity?: number | null }>>('/api/farm/feed/houses'), 5 * 60_000)
apps/web/src/lib/mobile-api.ts:365:    post<{ code: number; data?: { house_code: string }; msg?: string }>('/api/farm/feed/houses', body),
apps/web/src/lib/mobile-api.ts:441:  /** 生产趋势（最近 N 天日均产蛋/死淘/饲料 + 上期对比） */
apps/web/src/lib/mobile-roles.ts:122:  dashboard: {
apps/web/src/lib/mobile-roles.ts:127:  /** 饲料台账：农场相关角色可录入；仓储/物流/采购/成本会计可查看 */
apps/web/src/lib/mobile-roles.ts:128:  feed: {
docs/deployment-tiers.md:69:[data-page="dashboard"] .cockpit-kpi-value { font-size: 22px; }
docs/deployment-tiers.md:117:- API 容器**完全不动**:解决 `feedback_frequent_deploys_break_stateful_services` —— chanjet `appTicket` / token cache 内存状态保留。
docs/deployment-tiers.md:231:- `feedback_review_before_push`:**fast-css 模式仍然属于视觉改动**,push 前必须本地浏览器看一眼或截图给用户(skill 加 hook 提醒后续补)
docs/deployment-tiers.md:232:- `feedback_local_batch_then_push`:fast-css 是例外 — 它就是给"想边看边调"用的快通道,可逐次小推
docs/deployment-tiers.md:233:- `feedback_frequent_deploys_break_stateful_services`:web 模式专治此痛点(api 容器不再被无意义重启)
apps/web/src/lib/dict-type-labels.ts:43:  SYS: "系统", TRP: "运输", VET: "兽医", WMS: "仓储", FARM: "养殖", STORE: "门店", FEED: "饲料",
docs/uix-prod1-product-experience-reconstruction.md:158:## 6. 运营工作台统一（Phase 6）
apps/web/src/hooks/useMobilePermission.ts:22: *   const { allowed, readonly, loading } = useMobilePermission('feed');
docs/shareholder-runtime-ux-enhancement.md:64:**本阶段已修复**：在上述接口注入 `resolveAccessibleProjects(user)`，与 dashboard scope 口径对齐。`getFlow` 详情按 scope 校验，越权抛"无权查看（不在股东查看范围内）"。
docs/rbac-production-hardening-audit.md:161:| `/dashboard` | `null` | LOW |
docs/mobile-runtime-architecture-audit.md:14:- 唯一高优先级问题：`/mobile/dashboard` 中的配送波次区块仍调用旧 `log_dispatch` 表，应替换为 `/api/v2/mobile/delivery/dashboard`。  
docs/mobile-runtime-architecture-audit.md:26:| 3 | `/mobile/dashboard` | 每日数据看板 | 生产/包装/品质/蛋品库存/销售情况/配送波次 | `/api/dashboard/kpi`<br>`/api/packaging/daily-report`<br>`/api/quality/inspections`<br>`/api/crud/brd_daily_logs`<br>`/api/crud/brd_flocks`<br>`/api/farm/egg/stock`<br>`/api/farm-device/alerts`<br>**`crudApi.list('log_dispatch')`** ⚠️ | ⚠️ 部分 | ✅（配送区块） | ⚠️ 部分 |
docs/mobile-runtime-architecture-audit.md:27:| 4 | `/mobile/feed` | 饲料台账 | 饲料出入库登记，库存预警 | `/api/farm/feed/ledger`<br>`/api/farm/feed/houses` | ✅ | ✗ | ✅（农场模块在用） |
docs/mobile-runtime-architecture-audit.md:31:| 8 | `/mobile/analytics` | 生产趋势 | 7/14/30天产蛋/死淘/饲料趋势图 | `/api/v3/farm/trend` | ✅ | ✗ | ✅（v3 API） |
docs/mobile-runtime-architecture-audit.md:61:| `/mobile/feed` | 农场模块，饲料 API 完整 |
docs/mobile-runtime-architecture-audit.md:79:**B1 — `/mobile/dashboard`**  
docs/mobile-runtime-architecture-audit.md:80:**问题：** 配送波次区块调用 `crudApi.list('log_dispatch', ...)` — 旧的 `log_dispatch` 通用表，而新的配送数据在 `sal_delivery_orders`（`/api/v2/mobile/delivery/dashboard`）。  
docs/mobile-runtime-architecture-audit.md:81:**修复方案：** 将 `showDelivery` 区块的数据源从 `crudApi.list('log_dispatch')` 替换为调用 `/api/v2/mobile/delivery/dashboard`，展示今日配送统计摘要而不是旧的波次列表。  
docs/mobile-runtime-architecture-audit.md:109:| `dashboard/page.tsx:211` | `crudApi.list('log_dispatch', { limit: 30 })` | `log_dispatch` 是旧配送波次表，Sales V2 已迁移到 `sal_delivery_orders` | 替换为 `GET /api/v2/mobile/delivery/dashboard`，展示今日统计摘要 |
docs/mobile-runtime-architecture-audit.md:129:| 农场基础 | `/api/farm/feed/*`<br>`/api/farm/egg/*`<br>`/api/farm/medicine/*`<br>`/api/farm/sales/*` | `farm/` 模块 | ✅ 有效 |
docs/mobile-runtime-architecture-audit.md:134:| KPI 看板 | `/api/dashboard/kpi` | `dashboard/` 模块 | ✅ 有效 |
docs/mobile-runtime-architecture-audit.md:141:| `crudApi.list('log_dispatch')` | `/api/v2/mobile/delivery/dashboard` | **Phase 2 前必须完成** |
docs/mobile-runtime-architecture-audit.md:157:  dashboard, feed, mortality, egglog, henreport, analytics,
docs/mobile-runtime-architecture-audit.md:320:1. **修复 dashboard 配送区块**（高优先级）
docs/mobile-runtime-architecture-audit.md:321:   - 文件：`apps/web/src/app/(mobile)/mobile/dashboard/page.tsx`
docs/mobile-runtime-architecture-audit.md:322:   - 将 `crudApi.list('log_dispatch')` 替换为 `fetch('/api/v2/mobile/delivery/dashboard')`
docs/mobile-runtime-architecture-audit.md:344:| 🔴 HIGH | 替换 dashboard 配送区块数据源 | `mobile/dashboard/page.tsx` | 30 分钟 |
docs/mobile-runtime-architecture-audit.md:381:| dashboard 调用旧 log_dispatch | 🔴 HIGH | 配送波次显示不正确 | 未修复，列入 Phase 2 前置 |
docs/mobile-runtime-architecture-audit.md:394:| **旧 API 残留** | 仅 1 处：`dashboard.tsx` 的 `log_dispatch` 查询 |
scripts/gen-api-docs.sh:123:| 主仪表盘 | \`GET /api/dashboard/kpi\` |
scripts/gen-api-docs.sh:124:| 单店分析 | \`GET /api/dashboard/store-analysis?store_code=...\` |
scripts/gen-api-docs.sh:125:| 数据完整性 | \`GET /api/dashboard/integrity\` |
docs/user-role-matrix-v3.md:23:        └── 万象饲料厂         SITE-VTE-FEED
docs/organization-runtime-phase1-report.md:72:| SITE-VTE-FEED | 万象饲料厂 | SITE | L4 | COMP-LAO-FOOD | PLANNED | FEED_MILL |
docs/organization-runtime-phase1-report.md:164:| Procurement V2 | 9（orders / payments / projects / receipts / requests / shareholder-funds / shipments / suppliers / dashboard） |
scripts/uat-runner.sh:238:  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/dashboard/kpi" -H "Authorization: Bearer $TK")
scripts/uat-runner.sh:240:  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/dashboard/store-analysis?store_code=ST-VTE-001" -H "Authorization: Bearer $TK")
scripts/uat-runner.sh:242:  HTTP=$(curl -s -o /tmp/u.json -w '%{http_code}' "$API/api/dashboard/integrity" -H "Authorization: Bearer $TK")
scripts/uat-runner.sh:277:    -d "{\"flock_no\":\"UAT-FK-2025-001\",\"log_date\":\"$TODAY\",\"shift\":\"MORNING\",\"eggs_produced\":2400,\"mortality_qty\":5,\"feed_qty\":380,\"operator\":\"test_farm_mgr\"}")
scripts/uat-runner.sh:570:  perf_test P5-2 "/api/dashboard/kpi" 2000 "$API/api/dashboard/kpi" -H "Authorization: Bearer $TK"
scripts/uat-runner.sh:578:  perf_test P5-10 "/api/dashboard/integrity" 3000 "$API/api/dashboard/integrity" -H "Authorization: Bearer $TK"
apps/api/src/modules/finance-v2/controllers/finance-v2.controller.ts:21: * 本控制器仅保留通用接口（health / dashboard / ap/legacy-source）。
apps/api/src/modules/finance-v2/controllers/finance-v2.controller.ts:90:   * GET /api/v2/finance/dashboard
apps/api/src/modules/finance-v2/controllers/finance-v2.controller.ts:93:  @Get('dashboard')
apps/api/src/modules/finance-v2/controllers/finance-v2.controller.ts:95:  async dashboard() {
docs/uix7-product-experience-refactor.md:163:| 管理体验 | 78 | 主数据中心 + 审批工作台均有 dashboard |
docs/score-9-phase-r1-report.md:109:| farm | `farm-feed.controller.ts` | RolesGuard → MenuGuard + MENU_BREEDING |
docs/score-9-phase-r1-report.md:132:| farm | farm-egg, farm-feed, farm-medicine, farm-sales, farm |
docs/score-9-phase-r1-report.md:286:farm/farm-feed.controller.ts        [HIGH-2]
docs/score-9-phase-r1-report.md:306:farm/farm-feed.controller.ts        [HIGH-3]
docs/ui-ux-governance-phase-ui26-medium-risk-migration.md:102:✅ **允许。** 6 模块硬编码清零、暗色可读、功能零回归,token 化路线对大批量页面安全有效。UI-2.7 可推进:① 稳定模块(finance2/analytics/dashboard/executive)优化;② 本阶段遗留的结构性收口(DataTableV3/DrawerV2/WorkbenchTemplate 逐页采用,独立验证)。
docs/ui-ux-governance-phase-ui2-foundation.md:43:| `CHART_PALETTE` | 业务域色(sales/procurement/inventory/finance/shareholder/approval/dashboard)+ `series[8]` | 图表内散写 hex |
docs/ui-ux-governance-phase-ui2-foundation.md:67:- 落地示例(供 UI-2.9 参考):shareholders/dashboard 趋势图 `fill="#1F4E79"` → `fill={CHART_PALETTE.shareholder}`;analytics BarChart `color` → `CHART_PALETTE.<域>`。
docs/M2_PROJECT_CONSOLIDATION_REVIEW.md:58:- 读取路径未明：F2 / shareholder service / dashboard 应读哪个？
docs/production-deployment-reconciliation-report.md:135:| `20260530_pilot_run_1_execution_center.sql` | pilot_daily_reports 表、uat_feedbacks.pilot_run_id | 试运行中心 |
docs/production-deployment-reconciliation-report.md:196:uat_feedbacks.pilot_run_id
docs/uat2-real-operation-acceptance-test.md:148:GET /api/inbound/dashboard        HTTP=200 ✅
docs/uat2-real-operation-acceptance-test.md:149:GET /api/outbound/dashboard       HTTP=200 ✅
docs/master-data-phase3-audit.md:264:| UAT 反馈号 | `FB-` | PG sequence `seq_uat_feedback_no` | FB-20260530-00001 | ✅ 安全 |
apps/web/src/components/design-system/index.ts:87:// feedback
apps/web/src/components/design-system/index.ts:88:export { EmptyState } from './feedback/EmptyState';
apps/web/src/components/design-system/index.ts:89:export type { EmptyStateProps } from './feedback/EmptyState';
apps/web/src/components/design-system/index.ts:90:export { LoadingSkeleton } from './feedback/LoadingSkeleton';
apps/web/src/components/design-system/index.ts:91:export type { LoadingSkeletonProps } from './feedback/LoadingSkeleton';
apps/web/src/components/design-system/index.ts:92:export { ErrorState } from './feedback/ErrorState';
apps/web/src/components/design-system/index.ts:93:export type { ErrorStateProps } from './feedback/ErrorState';
apps/web/src/components/design-system/index.ts:94:export { PermissionDeniedState, NoDataState } from './feedback/States';
apps/web/src/components/design-system/index.ts:124:// workbench kit
apps/web/src/components/design-system/index.ts:125:export { WorkbenchShell, WorkbenchActionButton, WorkbenchStatusCard } from './workbench/WorkbenchKit';
apps/web/src/components/design-system/index.ts:129:} from './workbench/WorkbenchParts';
docs/ERP_BUSINESS_AGENT_AUDIT.md:309:- `apps/api/src/modules/procurement-v2/services/dashboard.service.ts:7`
docs/ui-ux-page-template-guide.md:12:| 驾驶舱 | `DashboardTemplate` | /dashboard /executive /finance2 /sales2 /shareholders/dashboard /analytics |
docs/g20-role-matrix.md:110:| MENU_FARM_FEED | V,C,E | 饲料台账 |
docs/glp1-go-live-preparation.md:200:| 下属 SITE | 万象肉鸡养殖场 / 万象饲料厂 / 万象屠宰加工厂（3 个） |
docs/glp1-go-live-preparation.md:201:| 业务流 | 养殖 → 饲料 → 屠宰加工 → 销售 |
docs/glp1-go-live-preparation.md:328:| **GLP-P0-02** | 导入真实仓库（wms_warehouses 0 行 — 至少 3 个含万象肉鸡场/饲料厂/屠宰厂）| 仓库 | 1d |
docs/navigation-final.md:21:| 工作台 | `/dashboard` | `MENU_DASHBOARD` |
docs/navigation-final.md:54:> 快捷入口：包装作业台（新窗口 `/terminal/packaging/dashboard`）
docs/navigation-final.md:86:| 采购看板 | `/procurement2/dashboard` | `MENU_PRC2` |
docs/navigation-final.md:329:| 经营分析子菜单 | 价格分析/生产报表/饲料核对 | 销售分析/渠道分析/配送分析/财务分析/信用分析 |
docs/M1_ORGANIZATION_MODEL.md:359:- 工厂（饲料 / 屠宰 / 食品加工 / 有机肥）
docs/M1_ORGANIZATION_MODEL.md:376:| FACTORY | 工厂（饲料 / 屠宰 / 食品 / 有机肥） | 下挂生产 / 加工记录表 |
docs/M1_ORGANIZATION_MODEL.md:410:  SITE-VTE-FEED           万象饲料厂          site_business_type=FACTORY
docs/M1_ORGANIZATION_MODEL.md:490:  WH_LAO_MENGSAI_01    孟赛饲料仓
docs/role-runtime-phase-c-recovery-report.md:82:│       └── SITE-VTE-FEED 万象饲料厂 (FEED_MILL, PLANNED)
docs/legacy-ord-tables-archive.md:92:| `apps/web/src/app/(admin)/dashboard/page.tsx` | 快捷入口 `/order` → `/sales2/orders` |
docs/uix4-design-system-final.md:151:| `01-workflow.png`     | 审批中心 dashboard | ✅ PageHeader + KPI 卡片 + 入口卡片 + 主题色统一 |
docs/performance-optimization-phase-p0-audit.md:23:| `/dashboard` | 1 | ✅ | 已聚合 |
docs/performance-optimization-phase-p0-audit.md:60:| 股东首页 | 4 独立接口（capital-summary/stats/dashboard/project） | ❌ 无聚合 |
docs/performance-optimization-phase-p0-audit.md:73:| `GET /api/v2/finance/*` (dashboard) | finance-v2 ap-invoices.service 640行，复杂聚合 | P1 |
docs/performance-optimization-phase-p0-audit.md:76:| `GET /shareholders/dashboard` | shareholder.service for 循环 | P1 |
docs/performance-optimization-phase-p0-audit.md:130:| `/finance2`（财务） | 8 | 🔴 **强烈建议** | `GET /api/bff/dashboard/finance` |
docs/performance-optimization-phase-p0-audit.md:131:| `/procurement2`（采购） | 6 | 🟡 建议 | `GET /api/bff/dashboard/procurement` |
docs/performance-optimization-phase-p0-audit.md:132:| `/shareholders`（股东） | 4 | 🟡 建议 | `GET /api/bff/dashboard/shareholder` |
docs/performance-optimization-phase-p0-audit.md:134:| `/dashboard`（首页） | 1 | ✅ 已聚合 | |
docs/performance-optimization-phase-p0-audit.md:174:- 用户访问 `/dashboard` 时，浏览器要下载包括 traceability、报表、工作流等全部代码
docs/performance-optimization-phase-p0-audit.md:233:| P1-3 | **财务 Dashboard BFF 聚合接口**：8 接口 → 1 `/api/bff/finance-dashboard` | 财务首页提速 | M |
apps/web/src/components/design-system/templates/Templates.tsx:12:import { WorkbenchShell } from '../workbench/WorkbenchKit';
docs/rbac-matrix.md:418:| `MENU_DASHBOARD` | `/dashboard` | 主仪表盘（未注册=全员可见） |
docs/procurement-ui-template-audit.md:13:| dashboard | 一级 | 419 | — | PageHeader | — | **Panel✅** | 裸 s.table×6 | — | **KpiCardV2✅** | — | ★★★★ 样板 |
docs/procurement-ui-template-audit.md:25:**样板基准**：`dashboard`（Panel + KpiCardV2）与 `payments 列表`（PageHeader + ModalV2 + 整页表单）最接近设计系统，其余页向这两页对齐。
docs/procurement-ui-template-audit.md:64:- 样板正例：dashboard 的 7 路 `Promise.all` + `safe()` 容错。
docs/procurement-ui-template-audit.md:74:- "待审批采购订单/申请" KPI **恒为 0**：dashboard 查 `PENDING_APPROVAL`/`SUBMITTED`，而 submit 实写 `PENDING`/`PENDING_APPROVAL`，值对不上。
docs/procurement-ui-template-audit.md:76:- 运单状态三方漂移（service 实写 READY/IN_TRANSIT/CUSTOMS_CLEARING；dashboard label 用 CONFIRMED/SHIPPED 等不存在值）→ 看板运单分布显示英文裸码。
docs/glp1a2-production-extension.md:159:| `FEED_` | 饲料类物料 | FEED_CORN / FEED_SOY_MEAL |
docs/v3-refine-b-impersonation-sweep.md:13:| 超管 | admin | /dashboard | 全量基线 ✓ |
docs/v3-refine-b-impersonation-sweep.md:28:3. **🟢 CEO 画面泄漏（已修）**：/dashboard 加页面级守卫 + 中间件根路径/越权回弹改 /home。
docs/master-data-initialization-phase-m3-dryrun.md:42:│       ├── SITE-VTE-FEED 万象饲料厂 (SITE, PLANNED) ├ 各含 7 部门
docs/master-data-initialization-phase-m3-dryrun.md:69:> 说明：GROUP/BU/COMPANY/SITE/DEPARTMENT 五级齐全。M2/M3 矩阵用户全部绑定到 ACTIVE 节点。PLANNED 节点（孵化场/有机肥/饲料厂/供应链群/贸易群）为规划占位，不影响本期导入。
docs/master-data-initialization-phase-m3-dryrun.md:194:| SUP-HBAGD-001 | 湖北艾格多 | 饲料/添加剂 | ∅ | ∅ |
docs/master-data-initialization-phase-m3-dryrun.md:197:| SUP-COFCO-001 | 中粮 | 饲料原料 | ∅ | ∅ |
docs/master-data-initialization-phase-m3-dryrun.md:199:| SUP-LYZB-001 | 临沂众邦 | 饲料/物料 | ∅ | ∅ |
docs/uix6-design-system-migration.md:147:| UIX7-05 | data-quality/analytics/settings/dashboard 等 25 页 | 2d | P1 |
docs/g20-governance-debt-ledger.md:28:| B3 | 业务模型混淆 | `brd_medications` 8 列主档 vs medicine 页存 batch_no/disease 业务字段；feed 台账 vs 单据未定 |
docs/g20-governance-debt-ledger.md:86:| **G20-5** | **CrudPage 推广 5 页**：breeding/flock + feed + medicine + warehouse/transfer + warehouse/stocktake | C1 + B5 |
docs/product-master-governance.md:21:| 产品 | `mst_products` | `product_code` | 最高级别业务对象（如：鸡蛋、饲料、礼盒）|
docs/legacy-dependency-audit.md:72:| 路由数 | 19 个端点（requests/orders/payments/receipts/suppliers/dashboard/kpi/three-way） |
docs/legacy-dependency-audit.md:96:| 路由数 | 22 个端点（egg, feed, sales, medicine, daily-logs） |
docs/legacy-dependency-audit.md:100:| 前端使用 | 是，桌面端 `/breeding/egg-ledger`, `/breeding/feed`, `/breeding/med-stock`；移动端 `mobile-api.ts` 大量使用 |
docs/legacy-dependency-audit.md:396:**是否被移动端使用：** 是，`apps/web/src/lib/mobile-api.ts` 包含大量对 `/api/farm/egg/*`、`/api/farm/feed/*`、`/api/farm/medicine/*`、`/api/farm/sales/*` 的调用，对应移动端页面：`/mobile/egg`、`/mobile/feed`、`/mobile/medicine`、`/mobile/sales`
docs/ui-ux-global-migration-map.md:34:| **dashboard** | 8.3 | 微调,接 DashboardTemplate |
docs/ui-ux-global-migration-map.md:55:| 驾驶舱 | dashboard/executive/finance2/shareholders/analytics | `DashboardTemplate` | KpiCardV2 / SummaryCard / WarningCard / ChartCard |
docs/pilot-run-1-launch-report.md:183:| 异常数 | uat_feedbacks（当日 severity=HIGH/CRITICAL）|
docs/pilot-run-1-launch-report.md:184:| 未解决问题 | uat_feedbacks（status=OPEN/IN_PROGRESS）|
docs/pilot-run-1-launch-report.md:202:- API：`GET /api/uat/pilot-run/dashboard?id=1`
docs/pilot-run-1-launch-report.md:213:| ✅ 系统录入 | 所有问题必须通过 `/uat` 页面提交 uat_feedbacks |
docs/g15-architecture-audit.md:11:| **日生产日报** | `/breeding/daily` | POST `/api/v3/farm/daily-logs` | `brd_daily_logs` | **养殖统计**：班次产蛋数 + 死淘 + 饲料 + 环境（+ G14 可选 9 档 JSONB） |
docs/g15-architecture-audit.md:74:| 饲料仓 | `FEED` | 玉米/豆粕/预混料 | ❌ 缺（mst_products 有 FEED_* 但 inv_batches 无饲料行）|
docs/g15-architecture-audit.md:101:| `/breeding/egg-ledger` | apiFetch `/api/farm/feed/houses` | brd_houses 自取 | ⚠️ 老路径，未走 lookup |
docs/g15-architecture-audit.md:115:   - `LPH_MS_FEED`         (FEED)      饲料仓
docs/product-master-consolidation-audit.md:254:| `FEED` | 饲料 | |
docs/product-master-consolidation-audit.md:450:| M5 | Procurement 模块产品维度（饲料/兽药/原材料）与 Sales 模块产品维度（蛋品/成品）混用同一张 mst_products |
docs/g8-perf-ux-cleanup.md:43:| `ROLE_REGION_MGR` | chenyifei, xuegang | `/dashboard` |
docs/g8-perf-ux-cleanup.md:63:1. admin（含 ROLE_ADMIN 或 perms='*'）→ /dashboard（强制）
docs/g8-perf-ux-cleanup.md:64:2. terminal 角色（PKG_OP/QC_INSPECTOR/...）→ /terminal/packaging/dashboard
docs/g8-perf-ux-cleanup.md:66:4. fallback → /home（运营工作台）
docs/g8-perf-ux-cleanup.md:67:5. returnUrl 仅非 /dashboard 同源路径才放行
docs/g8-perf-ux-cleanup.md:70:**评价**：逻辑严密 — 避免历史 sessionStorage 残留把普通用户错送到 /dashboard。补完 ROLE_HOME 即闭环。
docs/shareholder-runtime-phase1.md:52:| GET | /dashboard · /dashboard/:code | DASHBOARD 'V'（scope 过滤） |
docs/g55e-master-data-operations-platform.md:25:| 前端新增页面 | **1**（/master-data/operations 运营工作台） |
docs/g55e-master-data-operations-platform.md:26:| 前端重构页面 | **1**（/master-data 首页改为运营工作台模式） |
docs/g55e-master-data-operations-platform.md:42:| 模式 | 静态卡片分组导航 | **运营工作台**（实时数据驱动） |
docs/g55e-master-data-operations-platform.md:128:| **运营工作台** | 缺联系信息 / 重复编码 / 归档阻断 集中视图 |
docs/g55e-master-data-operations-platform.md:144:## 5. 运营工作台（第五部分）
docs/g55e-master-data-operations-platform.md:233:| 首页平台化 | 60 | **95** | 100 | 静态导航 → 实时运营工作台 |
docs/g55e-master-data-operations-platform.md:237:| 运营工作台 | 0 | **100** | 100 | 全新建立 |
docs/g55e-master-data-operations-platform.md:255:| 2 | 首页是否平台化 | **✅ 是**（运营工作台模式 + 6 中心实时�
```
