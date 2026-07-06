# Agent Worker Log

| Field | Value |
| --- | --- |
| Task ID | BUGTASK-20260706-0002-01-A2 |
| Agent | A2-Security-Regression-Gate |
| Dry run | No |
| Exit code | 0 |

## Command

```bash
node scripts/ops/run-agent-task.mjs --agent A2-Security-Regression-Gate --worktree /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate --prompt docs/ops/prompts/A2_SECURITY_REVIEW_PROMPT.md --task-contract docs/ops/runs/BUGTASK-20260706-0002-01-A2-contract.md --assembled-prompt-output docs/ops/runs/BUGTASK-20260706-0002-01-A2-worker-assembled-prompt.md --require-approval-token APPROVE_AGENT_EXECUTION --skip-baseline-autopilot --allow-ops-runtime-dirty
```

## Stdout

```text
Agent: A2-Security-Regression-Gate
Worktree: /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate
Branch: w5-a2-security-regression-gate
Prompt: docs/ops/prompts/A2_SECURITY_REVIEW_PROMPT.md
Task contract: docs/ops/runs/BUGTASK-20260706-0002-01-A2-contract.md
Assembled prompt: docs/ops/runs/BUGTASK-20260706-0002-01-A2-worker-assembled-prompt.md
Assembled prompt chars: 31322
Codex command: codex exec -C /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate --sandbox workspace-write -
Codex timeout ms: 600000
Run log: /Users/mac/phoenix-erp-worktrees/codex-orchestrator/docs/ops/runs/2026-07-06T07-56-56-257Z-A2-Security-Regression-Gate.md
FAIL / HOLD.

已完成 A2 安全回归门禁报告，并按允许范围只提交了 docs/ops 报告：

[docs/ops/BUG-20260706-0002_A2-Security-Regression-Gate_REPORT.md](/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate/docs/ops/BUG-20260706-0002_A2-Security-Regression-Gate_REPORT.md)

核心结论：`/home` 今日饲料消耗/今日用水依赖 `/api/v3/iot/devices/all-summary`，但该 IoT 汇总链路只有 JWT Guard，缺少后端菜单 RBAC 和 DataScope 过滤；同时存在两个同路径 `all-summary` 实现，其中一个把 `feedToday/waterToday` 固定为 `null`。因此不建议放行显示修复，需先由后端消除路由歧义并补齐 RBAC/DataScope。

提交：`beefce6e docs(ops): record a2 security gate for home kpi bug`

验证：已运行合同要求的 `pwd`、分支、状态、日志检查，以及只读 `rg/sed/nl` 证据定位。未改代码、未跑迁移、未写数据库、未部署、未推送。工作区最终干净。
Baseline autopilot skipped by caller; caller must run lifecycle hook.

```

## Stderr

```text
OpenAI Codex v0.142.5
--------
workdir: /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate
model: gpt-5.5
provider: openai
approval: never
sandbox: workspace-write [workdir, /tmp, $TMPDIR]
reasoning effort: medium
reasoning summaries: none
session id: 019f366a-fb92-7fe0-ae16-809077155dab
--------
user
# Base Agent Prompt

# A2 Security Review Prompt

## Agent Identity

You are `A2-Security-Regression-Gate`.

## Worktree and Branch

Worktree: `/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate`

Branch: `w5-a2-security-regression-gate`

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

Security review reports, read-only code inspection, approved security tests, docs/ops evidence.

## Forbidden Scope

Do not change code unless the task contract explicitly allows it. No migrations, schema/entity/table/column edits, production deploy, database writes, push, or secret exposure.

## Review Focus

RBAC, DataScope, JWT/session handling, SSE/WebSocket behavior, third-party interface security, logs redaction, attachment ACL, status transitions, and sensitive data handling.

## Output Report Format

Write PASS / FAIL / PASS WITH CONDITIONS with findings, evidence, file references, required remediation, and release impact.

## Commit Rule

Commit only approved docs/ops reports unless explicitly authorized otherwise.

## Failure Rule

Stop on security bypass, unreviewable scope, missing evidence, forbidden path changes, or unexpected dirty files.

---

# Agent Task Contract

# Bug Repair Agent Contract

Source bug: BUG-20260706-0002
Source repair task: BUGTASK-20260706-0002
Assigned agent: A2-Security-Regression-Gate

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
先做合同要求的四项环境检查；如果目录、分支或工作区不符合，我会停在诊断，不进入代码审查。
exec
/bin/zsh -lc pwd in /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate
 succeeded in 0ms:
/Users/mac/phoenix-erp-worktrees/a2-security-regression-gate

exec
/bin/zsh -lc 'git branch --show-current' in /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate
 succeeded in 0ms:
w5-a2-security-regression-gate

exec
/bin/zsh -lc 'git log --oneline --decorate -8' in /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate
 succeeded in 0ms:
4ef76aa2 (HEAD -> w5-a2-security-regression-gate) docs(ops): record a2 security gate for cash account bug
7bd5c23f docs(ops): record baseline lifecycle report
83b70cca docs(ops): record baseline lifecycle report
306e7d86 docs(ops): prioritize production readiness remediation tasks
8ebf8089 docs(ops): record baseline lifecycle report
e26335fb chore(ops): add agent inbox short command mode
ccff7ca2 docs(ops): record baseline lifecycle report
e1481a39 docs(ops): record menu role datascope repair execution

exec
/bin/zsh -lc 'git status --short' in /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate
 succeeded in 0ms:
codex
环境检查通过：目录和分支匹配，工作区干净。现在只做只读定位，目标是确认 `/home` 今日饲料/用水指标的数据链路是否存在 RBAC/DataScope 或鉴权回归风险。
exec
/bin/zsh -lc 'rg --files apps/web/app apps/web/src apps/api/src | rg "home|dashboard|workbench|farm|daily|device|cabin|feed|water"' in /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate
 succeeded in 0ms:
rg: apps/web/app: No such file or directory (os error 2)
apps/web/src/components/design-system/workbench/WorkbenchParts.tsx
apps/web/src/components/design-system/workbench/WorkbenchKit.tsx
apps/api/src/modules/procurement-v2/services/dashboard.service.ts
apps/api/src/modules/procurement-v2/controllers/dashboard.controller.ts
apps/web/src/components/design-system/feedback/EmptyState.tsx
apps/web/src/components/design-system/feedback/LoadingSkeleton.tsx
apps/web/src/components/design-system/feedback/ErrorState.tsx
apps/web/src/components/design-system/feedback/States.tsx
apps/api/src/modules/procurement-v2/dto/query-dashboard.dto.ts
apps/api/src/modules/store/entities/store-daily-close.entity.ts
apps/web/src/components/cabin/CabinHeaderCard.tsx
apps/web/src/components/cabin/SystemSummaryCard.tsx
apps/web/src/components/cabin/AlarmBanner.tsx
apps/web/src/components/cabin/KpiMetricCard.tsx
apps/api/src/modules/iot/farm-cabin.controller.ts
apps/api/src/modules/iot/mon-device.controller.ts
apps/api/src/modules/iot/farm-device.controller.ts
apps/api/src/modules/iot/mon-device.service.ts
apps/web/src/app/(admin)/store/daily/page.tsx
apps/web/src/app/(admin)/analytics/feed/page.tsx
apps/web/src/app/(admin)/shareholders/dashboard/page.tsx
apps/api/src/modules/org/entities/sys-user-farm-scope.entity.ts
apps/web/src/app/(admin)/warehouse/daily-close/page.tsx
apps/api/src/modules/uat/services/uat-feedback.service.ts
apps/api/src/modules/uat/services/pilot-run-dashboard.service.ts
apps/api/src/modules/uat/controllers/pilot-run-dashboard.controller.ts
apps/api/src/modules/uat/controllers/uat-feedback.controller.ts
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
apps/web/src/app/(admin)/home/page.tsx
apps/web/src/app/(admin)/quality/farm/page.tsx
apps/web/src/app/(mobile)/mobile/dashboard/page.tsx
apps/web/src/app/(terminal)/terminal/packaging/dashboard/page.tsx
apps/web/src/app/(mobile)/mobile/feed/page.tsx
apps/web/src/app/(mobile)/mobile/home/page.tsx
apps/web/src/app/(admin)/packaging/daily-report/page.tsx
apps/web/src/app/(admin)/daily-work/page.tsx
apps/web/src/app/(admin)/dashboard/page.tsx
apps/web/src/app/(admin)/dashboard/_components/dashboard.module.css
apps/web/src/app/(admin)/dashboard/_components/DashboardKPIs.tsx
apps/web/src/app/(admin)/dashboard/dashboard.module.css
apps/web/src/app/(admin)/breeding/daily-inbound/page.tsx
apps/web/src/app/(admin)/breeding/device/page.tsx
apps/web/src/app/(admin)/breeding/device/[houseCode]/page.tsx
apps/web/src/app/(admin)/master/farms/page.tsx
apps/web/src/app/(admin)/breeding/feed/page.tsx
apps/web/src/app/(admin)/breeding/device-alerts/page.tsx
apps/web/src/app/(admin)/breeding/daily/page.tsx
apps/web/src/app/(admin)/breeding/device-ops/page.tsx
apps/web/src/app/(admin)/procurement2/dashboard/page.tsx

exec
/bin/zsh -lc 'find docs -maxdepth 2 -type f | sort | tail -80' in /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate
 succeeded in 0ms:
docs/shareholder-runtime-phase1.md
docs/shareholder-runtime-phase2a-paid-in-capital.md
docs/shareholder-runtime-phase2b-r2-mengsai-capital-import.md
docs/shareholder-runtime-phase2b-r3-vte-food-capital-import.md
docs/shareholder-runtime-phase2b-r4-dongpeng-beneficial-equity.md
docs/shareholder-runtime-phase2b-zhaoyongwei-import.md
docs/shareholder-runtime-phase3-capital-flow-engine.md
docs/shareholder-runtime-phase3-plan.md
docs/shareholder-runtime-phase3-validation.md
docs/shareholder-runtime-ux-enhancement.md
docs/stabilization-freeze-s0.md
docs/uat-p0-phase1-runtime-validation.md
docs/uat1-user-acceptance-test-report.md
docs/uat2-real-operation-acceptance-test.md
docs/uat2-screenshots/01-master-data-overview.png
docs/uat2-screenshots/02-suppliers-empty.png
docs/uat2-screenshots/03-supplier-created-draft.png
docs/uat2-screenshots/04-supplier-pending-approval.png
docs/uat2-screenshots/05-bank-accounts-fixed.png
docs/ui-ux-global-migration-map.md
docs/ui-ux-governance-phase-ui1-audit.md
docs/ui-ux-governance-phase-ui2-components.md
docs/ui-ux-governance-phase-ui2-foundation.md
docs/ui-ux-governance-phase-ui2-global-components.md
docs/ui-ux-governance-phase-ui24-pilot-migration.md
docs/ui-ux-governance-phase-ui25-high-risk-migration.md
docs/ui-ux-governance-phase-ui26-medium-risk-migration.md
docs/ui-ux-page-template-guide.md
docs/ui-ux-phase1-production-validation.md
docs/ui-ux-phase1-report.md
docs/ui-ux-template-pilot-plan.md
docs/uix-prod1-product-experience-reconstruction.md
docs/uix1-design-system-framework.md
docs/uix2-design-system-migration.md
docs/uix2-screenshots/01-master-data-default-theme.png
docs/uix2-screenshots/02-master-data-brand-green.png
docs/uix2a-design-debt-elimination.md
docs/uix3-design-system-finalization.md
docs/uix3-screenshots/01-theme-switcher-in-header.png
docs/uix3-screenshots/02-theme-switcher-dropdown.png
docs/uix3-screenshots/03-brand-green-applied.png
docs/uix4-design-system-final.md
docs/uix4-screenshots/01-workflow.png
docs/uix4-screenshots/02-finance2.png
docs/uix4-screenshots/03-data-quality.png
docs/uix5-design-system-migration.md
docs/uix6-design-system-migration.md
docs/uix6-screenshots/01-finance2-ar-after-codemod.png
docs/uix6-screenshots/02-workflow-todo-after-codemod.png
docs/uix7-product-experience-refactor.md
docs/uix7-screenshots/01-customers-list-clickable-codes.png
docs/uix7-screenshots/02-customer-detail-drawer-CUS-MS-D-001.png
docs/uix7-screenshots/03-workflow-metrics-strip.png
docs/uix8-product-experience-expansion.md
docs/uix8-screenshots/01-sku-detail-drawer.png
docs/uix8-screenshots/02-product-detail-drawer.png
docs/uix9a-master-data-productization-final.md
docs/user-role-matrix-v3.md
docs/v3-final-readiness-audit.md
docs/v3-refine-b-impersonation-sweep.md
docs/v3-refine-m1-settings.md
docs/v3-refine-m2-master-data.md
docs/wf1-approval-center-full-audit.md
docs/wf1-screenshots/01-workflow-home.png
docs/wf1-screenshots/02-workflow-todo-broken.png
docs/wf1-screenshots/03-workflow-instances.png
docs/wf1-screenshots/04-workflow-instances-after-migration.png
docs/wf2-approval-center-completion.md
docs/wf2-screenshots/01-instance-detail-visualization.png
docs/wf2-screenshots/02-mobile-workflow.png
docs/wf2-screenshots/03-sidebar-expanded.png
docs/wf2-screenshots/04-approval-flows-completed.png
docs/wf2-screenshots/05-sidebar-approval-center-expanded.png
docs/workflow-2-phase-a.md
docs/workflow-hardening-p0-report.md
docs/workflow-rule-designer-capability-check.md
docs/workflow-sla-push-ops.md
docs/金凤凰ERP-生产初始化导入确认表-M5-已填确认.docx
docs/金凤凰ERP-生产初始化导入确认表-M5.docx
docs/金凤凰ERP正式用户角色矩阵V2.xlsx

exec
/bin/zsh -lc "rg -n \"今日饲料|今日用水|feed|water|consumption|运营工作台|daily\" apps/web apps/api docs scripts --glob '"'!**/node_modules/**'"'" in /Users/mac/phoenix-erp-worktrees/a2-security-regression-gate
 succeeded in 0ms:
scripts/backup-db.sh:80:find "$BACKUP_DIR" -maxdepth 1 -name 'phoenix-*.dump' -mtime +7 -delete -print | sed 's/^/  cleaned daily: /' || true
docs/ui-ux-governance-phase-ui2-components.md:12:21 个统一组件落地于 `components/design-system/`,八大体系(cards/tables/forms/feedback/dialogs/drawers/detail/layouts+charts)齐备。
docs/ui-ux-governance-phase-ui2-components.md:28:├── feedback/   EmptyState.tsx / LoadingSkeleton.tsx / ErrorState.tsx
scripts/go-live-data-reset.sql:37:    'brd_daily_logs'
docs/g9-business-mapping.md:9:| `brd_daily_logs` | 20 | 5 鸡舍 × 4 天 × 1 班次 |
docs/g9-business-mapping.md:18:### 2.1 brd_daily_logs（养殖日报，19 字段）
docs/g9-business-mapping.md:20:| 字段 | ETL 写入 | 前端 daily 页 | runtime 接入 | 备注 |
docs/g9-business-mapping.md:50:| qty / qty_available | ✓ | ✓ daily-inbound | ✓ |
docs/g9-business-mapping.md:55:| egg_date | log_date | ✓ daily-inbound 表单 | ✓ |
docs/g9-business-mapping.md:106:G9 之前：60/75 (80%) — brd_daily_logs 缺 5 字段
docs/g9-business-mapping.md:114:| brd_daily_logs | `farm.service.submitBreedingDailyLog` | `/breeding/daily` | ✅ |
docs/g9-business-mapping.md:115:| inv_batches | `egg-inventory.service.createProductionBatch` | `/breeding/daily-inbound` | ✅ |
docs/g9-business-mapping.md:128:③ 日报录入      brd_daily_logs  ✓（已 ETL 20 行 + 日更入口）
docs/g9-business-mapping.md:138:业务方 Excel "生产、死淘日报表" 实有列 → 前端 daily 页：
docs/g9-business-mapping.md:140:| Excel 列 | daily 页 | 录入方式 | 备注 |
docs/g9-business-mapping.md:195:| `apps/web/src/app/(admin)/breeding/daily/page.tsx` | row 加 selfUse 字段 + 表头 "自用蛋(枚)" + payload 映射 self_use_qty |
apps/web/src/lib/mobile-api.ts:116:  feed_consumed?:  number | string;
apps/web/src/lib/mobile-api.ts:117:  water_consumed?: number | string;
apps/web/src/lib/mobile-api.ts:131:  daily_usage:     number;
apps/web/src/lib/mobile-api.ts:261:  feed:           number;
apps/web/src/lib/mobile-api.ts:275:    feed:        number;
apps/web/src/lib/mobile-api.ts:284:  feed:        number;
apps/web/src/lib/mobile-api.ts:296:    avg_feed:        number;
apps/web/src/lib/mobile-api.ts:312:    get<PackagingDailyReport>(`/api/packaging/daily-report?date=${date}`),
apps/web/src/lib/mobile-api.ts:314:  /** 包装 N 日趋势（用于迷你柱状图，一次调用替代多次 daily-report） */
apps/web/src/lib/mobile-api.ts:316:    get<PackagingTrendItem[]>(`/api/packaging/daily-report-range?end_date=${endDate}&days=${days}`),
apps/web/src/lib/mobile-api.ts:324:    get<{ data: FarmLog[]; total: number }>(`/api/crud/brd_daily_logs?log_date=${date}&limit=200`),
apps/web/src/lib/mobile-api.ts:336:    get<FeedLedgerRow[]>(`/api/farm/feed/ledger?date=${date}`),
apps/web/src/lib/mobile-api.ts:340:    fetch((process.env.NEXT_PUBLIC_API_BASE || '') + '/api/farm/feed/ledger', {
apps/web/src/lib/mobile-api.ts:351:    getCached('feedHousesDetail', () => get<Array<{ house_code: string; house_name: string; capacity?: number | null }>>('/api/farm/feed/houses'), 5 * 60_000)
apps/web/src/lib/mobile-api.ts:365:    post<{ code: number; data?: { house_code: string }; msg?: string }>('/api/farm/feed/houses', body),
apps/web/src/lib/mobile-api.ts:439:    get<DailyHenReport>(`/api/v3/farm/daily-hen-report?date=${date}`),
apps/web/src/lib/mobile-api.ts:458:  }) => post<{ code: number; msg: string }>('/api/v3/farm/daily-logs', payload),
apps/web/src/lib/mobile-roles.ts:128:  feed: {
scripts/migrate_v2_to_v3.py:70:    "farm_device_property_daily_agg":"mon_device_property_daily_agg",
docs/sales-v2-architecture-audit.md:817:- `GET /api/v2/sales/reports/daily-summary` — 日销售汇总（POS+B2B）
apps/web/src/hooks/useMobilePermission.ts:22: *   const { allowed, readonly, loading } = useMobilePermission('feed');
docs/deployment-tiers.md:117:- API 容器**完全不动**:解决 `feedback_frequent_deploys_break_stateful_services` —— chanjet `appTicket` / token cache 内存状态保留。
docs/deployment-tiers.md:231:- `feedback_review_before_push`:**fast-css 模式仍然属于视觉改动**,push 前必须本地浏览器看一眼或截图给用户(skill 加 hook 提醒后续补)
docs/deployment-tiers.md:232:- `feedback_local_batch_then_push`:fast-css 是例外 — 它就是给"想边看边调"用的快通道,可逐次小推
docs/deployment-tiers.md:233:- `feedback_frequent_deploys_break_stateful_services`:web 模式专治此痛点(api 容器不再被无意义重启)
apps/web/src/hooks/useCrud.ts:4: *   不再用 useCrud hook。本 hook 暂保留兼容 daily/flock/medicine/immune/henhouse 5 个
docs/uix-prod1-product-experience-reconstruction.md:158:## 6. 运营工作台统一（Phase 6）
docs/rbac-production-hardening-audit.md:364:| `POST /api/stocktake/daily-close` | MenuGuard | MENU_INVENTORY 'E' | ✅ |
apps/api/src/modules/finance-v2/controllers/finance-v2.controller.ts:156:            'GET /api/v2/finance/reports/cash-daily-flow',
docs/mobile-runtime-architecture-audit.md:26:| 3 | `/mobile/dashboard` | 每日数据看板 | 生产/包装/品质/蛋品库存/销售情况/配送波次 | `/api/dashboard/kpi`<br>`/api/packaging/daily-report`<br>`/api/quality/inspections`<br>`/api/crud/brd_daily_logs`<br>`/api/crud/brd_flocks`<br>`/api/farm/egg/stock`<br>`/api/farm-device/alerts`<br>**`crudApi.list('log_dispatch')`** ⚠️ | ⚠️ 部分 | ✅（配送区块） | ⚠️ 部分 |
docs/mobile-runtime-architecture-audit.md:27:| 4 | `/mobile/feed` | 饲料台账 | 饲料出入库登记，库存预警 | `/api/farm/feed/ledger`<br>`/api/farm/feed/houses` | ✅ | ✗ | ✅（农场模块在用） |
docs/mobile-runtime-architecture-audit.md:28:| 5 | `/mobile/mortality` | 死淘快录 | 各栋死淘数量快速录入 | `/api/crud/brd_daily_logs` | ✅ | ✗ | ✅ |
docs/mobile-runtime-architecture-audit.md:29:| 6 | `/mobile/egglog` | 产蛋录入 | 各栋产蛋数量班次录入 | `/api/v3/farm/daily-logs`<br>`/api/crud/brd_flocks` | ✅ | ✗ | ✅（v3 API） |
docs/mobile-runtime-architecture-audit.md:30:| 7 | `/mobile/henreport` | 存栏日报 | 母鸡存栏/产蛋率/死淘日报 | `/api/v3/farm/daily-hen-report` | ✅ | ✗ | ✅（v3 API） |
docs/mobile-runtime-architecture-audit.md:32:| 9 | `/mobile/packaging` | 包装统计 | 班次产出、等级分布、7日趋势 | `/api/packaging/daily-report`<br>`/api/packaging/daily-report-range` | ✅ | ✗ | ✅ |
docs/mobile-runtime-architecture-audit.md:61:| `/mobile/feed` | 农场模块，饲料 API 完整 |
docs/mobile-runtime-architecture-audit.md:62:| `/mobile/mortality` | 死淘快录，brd_daily_logs 正常 |
docs/mobile-runtime-architecture-audit.md:128:| 农场日报 | `/api/v3/farm/daily-logs`<br>`/api/v3/farm/daily-hen-report`<br>`/api/v3/farm/trend` | `farm/` 模块（V3 路由） | ✅ 有效 |
docs/mobile-runtime-architecture-audit.md:129:| 农场基础 | `/api/farm/feed/*`<br>`/api/farm/egg/*`<br>`/api/farm/medicine/*`<br>`/api/farm/sales/*` | `farm/` 模块 | ✅ 有效 |
docs/mobile-runtime-architecture-audit.md:130:| 通用 CRUD | `/api/crud/brd_daily_logs`<br>`/api/crud/brd_flocks` | generic-crud 自动路由 | ✅ 有效 |
docs/mobile-runtime-architecture-audit.md:131:| 包装 | `/api/packaging/daily-report*` | `packaging/` 模块 | ✅ 有效 |
docs/mobile-runtime-architecture-audit.md:157:  dashboard, feed, mortality, egglog, henreport, analytics,
apps/api/src/modules/finance-v2/controllers/financial-reports.controller.ts:121:   * GET /api/v2/finance/reports/cash-daily-flow
apps/api/src/modules/finance-v2/controllers/financial-reports.controller.ts:125:  @Get('cash-daily-flow')
apps/web/src/components/design-system/index.ts:87:// feedback
apps/web/src/components/design-system/index.ts:88:export { EmptyState } from './feedback/EmptyState';
apps/web/src/components/design-system/index.ts:89:export type { EmptyStateProps } from './feedback/EmptyState';
apps/web/src/components/design-system/index.ts:90:export { LoadingSkeleton } from './feedback/LoadingSkeleton';
apps/web/src/components/design-system/index.ts:91:export type { LoadingSkeletonProps } from './feedback/LoadingSkeleton';
apps/web/src/components/design-system/index.ts:92:export { ErrorState } from './feedback/ErrorState';
apps/web/src/components/design-system/index.ts:93:export type { ErrorStateProps } from './feedback/ErrorState';
apps/web/src/components/design-system/index.ts:94:export { PermissionDeniedState, NoDataState } from './feedback/States';
scripts/gen-api-docs.sh:120:| 门店日结 (V2 fidelity) | \`POST /api/v3/store/daily-close-v2/submit\` |
docs/mdm-1-unified-model-design.md:40:业务表（brd_daily_logs / wms_inbound / pkg_tasks ...）
docs/mdm-1-unified-model-design.md:46:  - brd_daily_logs.farm_code / store_code 留存（标记 @deprecated）
docs/mdm-1-unified-model-design.md:155:ALTER TABLE brd_daily_logs
docs/mdm-1-unified-model-design.md:160:CREATE INDEX IF NOT EXISTS idx_brd_daily_company ON brd_daily_logs (company_code);
docs/mdm-1-unified-model-design.md:161:CREATE INDEX IF NOT EXISTS idx_brd_daily_project ON brd_daily_logs (project_code);
docs/mdm-1-unified-model-design.md:162:CREATE INDEX IF NOT EXISTS idx_brd_daily_site    ON brd_daily_logs (site_code);
docs/mdm-1-unified-model-design.md:169:| brd_daily_logs | ❌ | ❌ | ✅ |
scripts/uat-runner.sh:259:  # 清今日 daily_close (test_cashier 的 ST-VTE-001) + 关联 acc_ledger / fin_transactions
scripts/uat-runner.sh:263:  $PSQL "$DB" -q -c "DELETE FROM daily_close WHERE close_no LIKE 'DCL-${TODAY_LOCAL}-ST-VTE-001%';" >/dev/null 2>&1
scripts/uat-runner.sh:275:  R=$(curl -s -o /tmp/p2.json -w '%{http_code}' -X POST "$API/api/crud/brd_daily_logs" \
scripts/uat-runner.sh:277:    -d "{\"flock_no\":\"UAT-FK-2025-001\",\"log_date\":\"$TODAY\",\"shift\":\"MORNING\",\"eggs_produced\":2400,\"mortality_qty\":5,\"feed_qty\":380,\"operator\":\"test_farm_mgr\"}")
scripts/uat-runner.sh:357:  # 节点 13：日结 (test_cashier → 1 单 POS + daily-close)
scripts/uat-runner.sh:363:  R=$(curl -s -o /tmp/p2.json -w '%{http_code}' -X POST "$API/api/v3/store/daily-close-v2/submit" \
scripts/uat-runner.sh:365:    -d '{"cash_actual":12,"note":"UAT P2 daily close"}')
scripts/seed-uat-fixture.sh:49:  PSQLQ -c "DELETE FROM daily_close         WHERE close_no LIKE 'DCL-%-UAT-%';"
scripts/seed-uat-fixture.sh:58:  PSQLQ -c "DELETE FROM brd_daily_logs      WHERE flock_no LIKE 'UAT-%';"
docs/master-data-phase3-audit.md:264:| UAT 反馈号 | `FB-` | PG sequence `seq_uat_feedback_no` | FB-20260530-00001 | ✅ 安全 |
scripts/g5c-rbac-audit.sh:94:check "$admin_token" GET '/api/v3/farm/daily-logs/eggs-breakdown?date=2026-06-04&houseCode=HOUSE_MS_02' 200 'admin · /eggs-breakdown'
scripts/g5c-rbac-audit.sh:143:    check "$song_token" GET '/api/v3/farm/daily-logs/eggs-breakdown?date=2026-06-04&houseCode=HOUSE_MS_02' 200 'song · /eggs-breakdown'
docs/pilot-run-1-launch-report.md:173:系统每天 **01:00（亚洲/万象时区）** 自动生成 `pilot_daily_reports` 记录，涵盖：
docs/pilot-run-1-launch-report.md:183:| 异常数 | uat_feedbacks（当日 severity=HIGH/CRITICAL）|
docs/pilot-run-1-launch-report.md:184:| 未解决问题 | uat_feedbacks（status=OPEN/IN_PROGRESS）|
docs/pilot-run-1-launch-report.md:203:- 历史日报：`GET /api/uat/pilot-run/daily-reports?pilot_run_id=1`
docs/pilot-run-1-launch-report.md:213:| ✅ 系统录入 | 所有问题必须通过 `/uat` 页面提交 uat_feedbacks |
scripts/glp1a3_etl_mengsai_initial.py:51:# Sheet 1: 生产、死淘日报表 → brd_daily_logs (20 行：5 鸡群 × 4 天)
scripts/glp1a3_etl_mengsai_initial.py:57:inserted_daily = 0
scripts/glp1a3_etl_mengsai_initial.py:80:        SQL.append(f"""INSERT INTO brd_daily_logs (
scripts/glp1a3_etl_mengsai_initial.py:89:        inserted_daily += 1
scripts/glp1a3_etl_mengsai_initial.py:90:SQL.append(f'-- 生产日报合计 {inserted_daily} 行')
scripts/glp1a3_etl_mengsai_initial.py:242:SQL.append("SELECT '生产日报' tbl, count(*) FROM brd_daily_logs WHERE business_date BETWEEN '2026-06-01' AND '2026-06-04' AND site_code='SITE-MENGSAI-LAYER'")
docs/production-runtime-rebuild-phase-r5-traceability-runtime.md:26:brd_houses → brd_flocks → brd_daily_logs           （生产域：场站/鸡舍/鸡群/日产蛋）
docs/production-runtime-rebuild-phase-r5-traceability-runtime.md:50:- **production**：site / line / houses / flocks / dailyLogs / source / productionDate
docs/final-hardening-phase-f3-product-polish.md:64:| breeding/daily-inbound subtitle | `统一进入 Sales V2 FIFO` | `统一进入 FIFO 库存体系` |
docs/production-inventory-integration-audit.md:131:  └─ 日产蛋(brd_daily_logs.eggs_produced)         ← 生产事实，与库存无外键
docs/production-inventory-integration-audit.md:185:brd_daily_logs(生产事实) → 集蛋批次(待包装池,不可售)
scripts/f5-prod-diagnostic.sql:10:\echo '=== A. brd_daily_logs 生产派生列是否存在 ==='
scripts/f5-prod-diagnostic.sql:13: WHERE table_name='brd_daily_logs'
docs/uat2-real-operation-acceptance-test.md:158:`brd_daily_logs.UAT2-LOG-001` log_date=2026-06-04 house=HOUSE-A1 eggs_produced=5000 good=4850 broken=50 ✅
docs/ERP_BUSINESS_AGENT_AUDIT.md:21:| store / store-pos | 4 | `sal_store_*` / `daily_close` / `acc_ledger` | `MENU_STORE_POS` | 🔴 POS 客户主数据缺、FIFO 双路径 |
docs/ERP_BUSINESS_AGENT_AUDIT.md:152:- `daily_close` / `acc_ledger`(`SALES_REVENUE` / `CASH_OVERAGE`)/ `fin_cash_transactions`(`source_type=STORE_SALE`)/ `fin_ar_invoices`(`source_type=STORE_SALE`)
docs/ERP_BUSINESS_AGENT_AUDIT.md:160:- **日结二重性** WMS 日结借 `wms_stocktake(DC-)`;门店日结独立流程写 `daily_close` + `acc_ledger` + `fin_transactions`
docs/M1_ORGANIZATION_MODEL.md:373:| FARM | 蛋鸡养殖场 | 下挂 `brd_houses`（鸡舍）+ `brd_flocks`（鸡群）+ `brd_daily_logs`（日报） |
docs/M1_ORGANIZATION_MODEL.md:537:| `biz_store_daily_close` | 门店日结业务表 | site_code 维度 |
docs/M1_ORGANIZATION_MODEL.md:1083:- IoT 上行数据自动生成 brd_daily_logs 草稿（人工审核 ACTIVE）
docs/g5-c-rbac-audit-ci.md:18:  - `/api/v3/farm/daily-logs/eggs-breakdown`（验 G3-B 新 endpoint）
docs/navigation-final.md:34:| 日生产日报 | `/breeding/daily` | `MENU_FARM_DATA` |
docs/navigation-final.md:43:| 包装日报 | `/packaging/daily-report` | `MENU_PKG_MGR` |
docs/navigation-final.md:72:| 日结对账 | `/warehouse/daily-close` | `MENU_WMS_INOUT` |
docs/navigation-final.md:119:| 门店日结 | `/store/daily` | `MENU_STORE_MGR` |
scripts/compare_v2_v3.py:26:    "farm_device_property_daily_agg":"mon_device_property_daily_agg",
docs/glp1a2-production-extension.md:15:| `migrations/20260605_glp1a2_production_extension.sql` | brd_daily_logs +4 / wms_outbound +3 / wms_inbound +1 + 3 类字典 seed 13 项 | 113 | ✅ |
docs/glp1a2-production-extension.md:25:### 2.1 `brd_daily_logs` +4 字段
docs/glp1a2-production-extension.md:230:| 1 | DDL 新增了多少字段？ | **8 个**（brd_daily_logs ×4 + wms_outbound ×3 + wms_inbound ×1） |
docs/glp1a2-production-extension.md:239:**复核来源**：`scripts/.prod-schema.sql` 实际生产 DDL（`brd_daily_logs / brd_farms / brd_houses / brd_flocks / mst_products / prc2_suppliers / sal_customers / fin_cash_accounts / sys_dict / wms_inbound / wms_outbound`）
docs/mdm-1-implementation-report.md:25:| `migrations/mdm1_05_brd_daily_logs_extend.sql` | 加 company_code/project_code/site_code/business_date 4 字段 + 自动回填 + 审计 | ✅ |
docs/mdm-1-implementation-report.md:83:## ⑧ brd_daily_logs 统一字段回填逻辑（migration `mdm1_05`）
docs/mdm-1-implementation-report.md:108:| brd_daily_logs 6/1-6/4 数据是否存在 | ❓ 未实际录入（Excel 7 个 sheet 数据 GLP-1A-3 阶段才 ETL）|
docs/mdm-1-implementation-report.md:113:**根因明确**：当前不可见的根因不是查询逻辑问题，而是**字段层尚未具备（brd_daily_logs 缺 3 字段）+ 数据层尚未导入**。两步完成后即可按 site_code 过滤可见。
docs/mdm-1-implementation-report.md:144:| 6 | 历史 brd_daily_logs 数据回填 site_code 是否会冲突业务方既有逻辑 | 等 ETL 阶段（GLP-1A-3）确认 |
docs/g26-usecrud-migration-sop.md:10:| 当前使用 | 5 个业务页（daily/flock/immune/medicine/henhouse）|
docs/g26-usecrud-migration-sop.md:101:| daily | 低 | 825 行复杂业务页，G19-A 刚重构过 |
docs/pilot-run-1-execution-plan.md:128:| 未解决问题数 | uat_feedbacks（OPEN+IN_PROGRESS） |
docs/pilot-run-1-execution-plan.md:129:| 今日已解决 | uat_feedbacks（RESOLVED/CLOSED 当日） |
docs/pilot-run-1-execution-plan.md:140:POST /api/uat/pilot-runs/:id/daily-report   — 生成日报（权限：MENU_UAT C）
docs/pilot-run-1-execution-plan.md:141:GET  /api/uat/pilot-runs/:id/daily-reports  — 日报列表（权限：MENU_UAT V）
docs/pilot-run-1-execution-plan.md:172:| pilot_daily_reports | 每日日报（6 维评分 + 业务指标） |
docs/pilot-run-1-execution-plan.md:173:| uat_feedbacks | 问题反馈（含 pilot_run_id 关联） |
docs/non-v2-functional-audit.md:90:**前端**: 14个子页面（henhouse、flock、daily、immune、medicine、device、device-alerts、device-ops、egg-ledger、feed、henreport、med-stock）  
docs/non-v2-functional-audit.md:100:**前端**: 6个子页面（inbound、batch、daily-report、exceptions、print-logs）+ 包装作业台快捷入口  
docs/non-v2-functional-audit.md:110:**前端**: 13个子页面（inbound、outbound、transfer、stocktake、ledger、query、warehouses、zones、locations、expiry、daily-close、loss-report）  
docs/non-v2-functional-audit.md:120:**前端**: 6个子页面（receiving、inventory、replenish、losses、daily）  
docs/non-v2-functional-audit.md:204:**前端**: 5个子页面（price-review、production、inventory、feed）  
docs/g55b-g6-recovery-plan.md:26:| **A 集团**       | ✅ `group-analytics.service.ts` (5972B) | ✅ `/api/v2/analytics/group` | ❌ 不存在 | mv_daily_sales | **B 半完成** |
docs/g55b-g6-recovery-plan.md:28:| **C 销售**       | ✅ `sales-analytics-aggregator.service.ts` (3041B) | ✅ `/api/v2/analytics/sales` | ⚠️ 旧 `analytics/page.tsx` 部分覆盖 | mv_daily_sales | **B 半完成** |
docs/g55b-g6-recovery-plan.md:30:| **E 生产**       | ✅ `production-analytics.service.ts` (3742B) | ✅ `/api/v2/analytics/production` | ✅ `analytics/production/page.tsx` (263 行) | mv_daily_egg | **B 半完成**（同上） |
docs/g55b-g6-recovery-plan.md:70:| **E 生产** | brd_daily_logs / brd_flocks | **场站 / 鸡舍 / 鸡群** | BRD_FLOCK_STATUS / PKG_EGG_GRADE |
docs/g55b-g6-recovery-plan.md:73:| **H 预测** | sales_orders / brd_daily_logs / fin_ar_receipts / prc_payments / inv_batches / generate_series | 全部业务表的源主数据 | — |
docs/g55b-g6-recovery-plan.md:85:10. **场站**（0 处 Selector 但生产分析直接 grep brd_daily_logs） ← 未独立菜单
docs/legacy-dependency-audit.md:96:| 路由数 | 22 个端点（egg, feed, sales, medicine, daily-logs） |
docs/legacy-dependency-audit.md:100:| 前端使用 | 是，桌面端 `/breeding/egg-ledger`, `/breeding/feed`, `/breeding/med-stock`；移动端 `mobile-api.ts` 大量使用 |
docs/legacy-dependency-audit.md:149:| 前端使用 | 是，`/warehouse/transfer`, `/warehouse/daily-close` 活跃 |
docs/legacy-dependency-audit.md:396:**是否被移动端使用：** 是，`apps/web/src/lib/mobile-api.ts` 包含大量对 `/api/farm/egg/*`、`/api/farm/feed/*`、`/api/farm/medicine/*`、`/api/farm/sales/*` 的调用，对应移动端页面：`/mobile/egg`、`/mobile/feed`、`/mobile/medicine`、`/mobile/sales`
docs/legacy-dependency-audit.md:402:**是否属于未来 Farming Runtime 基础：** 是。`/api/v3/farm/*`（daily-logs、hen-report、trend）是未来 Farming V2 的候选范围
docs/g14-daily-redesign.md:1:# G14 · daily 日生产日报页面整改
docs/g14-daily-redesign.md:11:5. 与 daily-inbound 关系不明
docs/g14-daily-redesign.md:50:| 合计饲料 | sum(rows.feedKg) | text-primary |
docs/g14-daily-redesign.md:104:- 写入 `brd_daily_logs.eggs_by_grade` 列（G9 加的 + GIN 索引）
docs/g14-daily-redesign.md:108:- 现成 endpoint `GET /api/v3/farm/daily-logs/eggs-breakdown?date=&houseCode=` 聚合返回（G9 已加）
docs/g14-daily-redesign.md:109:- daily-inbound 页面已有「从日报预填」按钮（G9 已加）调用该 endpoint
docs/g14-daily-redesign.md:117:进 /breeding/daily
docs/g14-daily-redesign.md:129:brd_daily_logs 写入 + eggs_by_grade JSONB
docs/g14-daily-redesign.md:134:## 4. 与 daily-inbound 关系
docs/g14-daily-redesign.md:136:| 维度 | daily (本次整改后) | daily-inbound |
docs/g14-daily-redesign.md:139:| 写入表 | `brd_daily_logs` (含 eggs_by_grade) | `inv_batches` 销售批次 |
docs/g14-daily-redesign.md:144:**两页职责清晰**：daily 是统计 + 分级登记，daily-inbound 是成品入库。
docs/g14-daily-redesign.md:145:**数据互通**：daily 的 eggs_by_grade → daily-inbound 一键导入。
docs/g14-daily-redesign.md:151:| `apps/web/src/app/(admin)/breeding/daily/page.tsx` | 班次 fallback + 双行表 + 5 badge + 9 档 modal + 底部按钮 + 自动校验 |
docs/g14-daily-redesign.md:165:**Tag**：`v3-g14-daily-redesign`
docs/W5_READINESS_REVIEW.md:177:| **门店日结 daily_close 流程稳定** | ✅ G83 已落地 | 5 | 5 |
docs/W5_READINESS_REVIEW.md:424:| GM-5 | brd_daily_logs 日报路径稳定（多 shift 支持）| ✅（A1 修复）| ERP | 已就位 |
docs/W5_READINESS_REVIEW.md:478:| LS-7 | POS daily_close 流程稳定（store-pos.service 单事务）| ✅ G83 已落 | ERP | 已就位 |
docs/schema-snapshot.sql:411:-- Name: brd_daily_logs; Type: TABLE; Schema: public; Owner: -
docs/schema-snapshot.sql:414:CREATE TABLE public.brd_daily_logs (
docs/schema-snapshot.sql:425:    feed_qty numeric(18,2) DEFAULT 0,
docs/schema-snapshot.sql:426:    water_qty numeric(18,2) DEFAULT 0,
docs/schema-snapshot.sql:439:    feed_consumed numeric(10,2) DEFAULT 0,
docs/schema-snapshot.sql:441:    water_consumed numeric(10,2) DEFAULT 0,
docs/schema-snapshot.sql:452:-- Name: COLUMN brd_daily_logs.opening_qty; Type: COMMENT; Schema: public; Owner: -
docs/schema-snapshot.sql:455:COMMENT ON COLUMN public.brd_daily_logs.opening_qty IS '期初存栏（开盘数量，源自 Excel 生产日报"期初存栏"列）';
docs/schema-snapshot.sql:459:-- Name: COLUMN brd_daily_logs.closing_qty; Type: COMMENT; Schema: public; Owner: -
docs/schema-snapshot.sql:462:COMMENT ON COLUMN public.brd_daily_logs.closing_qty IS '期末存栏（收盘数量；= opening_qty − mortality_qty − elimination_qty − self_use_qty）';
docs/schema-snapshot.sql:466:-- Name: COLUMN brd_daily_logs.self_use_qty; Type: COMMENT; Schema: public; Owner: -
docs/sch
```
