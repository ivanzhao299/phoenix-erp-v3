# Base Agent Prompt

# Bug Intake A4 Frontend Repair Prompt

## Identity

You are `A4-Frontend-UIUX-UAT` running on the dedicated Bug Intake repair branch.

Worktree: `/Users/mac/phoenix-erp-worktrees/bug-intake-a4`

Branch: `codex/bug-intake-a4`

## Mission

Implement the frontend portion of exactly one approved bug report. Read the attached task contract first, inspect the existing page and design system, reproduce the issue, make a production-quality responsive fix, add focused regression coverage where available, and write a task-specific report under `docs/ops/**`.

## Allowed Scope

- `apps/web/**`
- task-specific `docs/ops/**`

## Forbidden Scope

- `apps/api/**`
- migrations, schema, entity, table, or column changes
- database writes, deploys, pushes, force operations, or production commands
- unrelated global restyling

## Required Evidence

1. owned frontend file diff;
2. desktop and mobile behavior checked for the affected page;
3. Web typecheck and focused route/component verification;
4. permission visibility and error/empty/loading states preserved;
5. task-specific report naming the source bug, root cause, changed files, verification results, and explicit `PASS WITH CONDITIONS`, `HOLD`, or `FAIL`;
6. no claim that the bug is resolved before CI/CD, production smoke, and business acceptance.

If the issue has no frontend-owned fix, return `NOT APPLICABLE` with concrete evidence and do not edit files.

---

# Agent Task Contract

# Bug Repair Agent Contract

Source bug: BUG-20260723-0001
Source repair task: BUGTASK-20260723-0001
Assigned agent: A4-Frontend-UAT-Smoke

## Issue

运营工作台右上角的待办、超时、高危告警目前只是展示，不能点击，要求可点击跳转到对应页面

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
  "bugNo": "BUG-20260723-0001",
  "taskNo": "BUGTASK-20260723-0001",
  "title": "运营工作台右上角的待办、超时、高危告警目前只是展示，不能点击，要求可点击跳转到对应页面",
  "description": "",
  "route": "/home",
  "url": "https://erp.eggslao.com/home",
  "priority": "P2",
  "severity": "MEDIUM",
  "moduleCode": "_____",
  "acceptanceCriteria": "运营工作台右上角的待办、超时、高危告警目前只是展示，不能点击，要求可点击跳转到对应页面",
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
  "context": {
    "attachments": [
      {
        "sha256": "eed99418a1ed2fecd28d53bbecb47977f8d01cc0ecc6f89eb9aa5eb2e2162b1f",
        "fileName": "01-1784769391292-9ada96f5.png",
        "mimeType": "image/png",
        "sizeBytes": 1143086,
        "originalName": "pasted-screenshot-1784769384318-1.png",
        "relativePath": "storage/bug-reports/2026/07/23/BUG-20260723-0001/01-1784769391292-9ada96f5.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260723-0001/attachments/01-1784769391292-9ada96f5.png"
      }
    ],
    "consoleErrors": [],
    "failedRequests": [],
    "clientContext": {
      "language": "zh-CN",
      "timezone": "Asia/Shanghai",
      "viewport": {
        "width": 2000,
        "height": 1081
      },
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      "capturedAt": "2026-07-23T01:16:31.297Z",
      "pageSnapshot": {
        "route": "/home",
        "title": "金凤凰 ERP — Phoenix ERP V3",
        "scroll": {
          "x": 0,
          "y": 0
        },
        "viewport": {
          "width": 2000,
          "height": 1081
        },
        "visibleText": [
          "运营工作台",
          "每日工作台",
          "经营仪表盘",
          "生产管理",
          "库存管理",
          "全链追溯",
          "采购供应中心",
          "销售管理",
          "财务结算中心",
          "股东权益中心",
          "审批中心",
          "经营分析中心",
          "主数据中心",
          "系统设置中心",
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
          "pasted-screenshot-1784769384318-1.png",
          "退出",
          "·",
          "2026年7月23日星期四",
          "早上好，金凤凰总控",
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
          "主数据健康 97/100",
          "主数据健康度",
          "/ 100",
          "在管 802 条",
          "风险 3 条",
          "业务中心",
          "· 一键直达（8）"
        ],
        "interactiveElements": [
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__groupHeader.sidebar-module__C8A-ya__groupActive",
            "rect": {
              "h": 38,
              "w": 220,
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
              "w": 220,
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
              "w": 220,
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
              "w": 220,
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
              "w": 220,
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
              "w": 220,
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
              "w": 220,
              "x": 0,
              "y": 346
            },
            "label": "采购供应中心",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 220,
              "x": 0,
              "y": 384
            },
            "label": "销售管理",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 220,
              "x": 0,
              "y": 422
            },
            "label": "财务结算中心",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 220,
              "x": 0,
              "y": 460
            },
            "label": "股东权益中心",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 220,
              "x": 0,
              "y": 498
            },
            "label": "审批中心",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 220,
              "x": 0,
              "y": 536
            },
            "label": "经营分析中心",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 220,
              "x": 0,
              "y": 574
            },
            "label": "主数据中心",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 220,
              "x": 0,
              "y": 612
            },
            "label": "系统设置中心",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 220,
              "x": 0,
              "y": 650
            },
            "label": "验收试运行",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 220,
              "x": 0,
              "y": 688
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
              "y": 1043
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
              "x": 1341,
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
              "x": 1497,
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
              "x": 1606,
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
              "x": 1654,
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
              "x": 1261,
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
              "w": 575,
              "x": 713,
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
              "w": 575,
              "x": 713,
              "y": 420
            },
            "label": "低：样式/文案问题 中：影响局部流程 高：阻断业务操作 紧急：系统不可用/数据风险",
            "disabled": false
          },
          {
            "tag": "textarea",
            "path": "",
            "rect": {
              "h": 99,
              "w": 575,
              "x": 713,
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
              "x": 713,
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
              "x": 823,
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
              "x": 966,
              "y": 816
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
              "x": 1127,
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
              "x": 1198,
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
              "x": 1789,
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
              "x": 1913,
              "y": 13
            },
            "label": "退出",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 35,
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
              "h": 35,
              "w": 116,
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
              "x": 1244,
              "y": 385
            },
            "label": "全部",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 73,
              "w": 242,
              "x": 283,
              "y": 629
            },
            "label": "销售 订单 · 收款",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 73,
              "w": 242,
              "x": 535,
              "y": 629
            },
            "label": "现金 账户 · 流水",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 73,
              "w": 242,
              "x": 787,
              "y": 629
            },
            "label": "应收 发票 · 账龄",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 73,
              "w": 242,
              "x": 1040,
              "y": 629
            },
            "label": "应付 账期 · 付款",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 161,
              "w": 643,
              "x": 1309,
              "y": 365
            },
            "label": "数据质量驾驶舱 80 / 100 综合评分 需整改 · 7 维加权 主数据健康 97/100",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 157,
              "w": 643,
              "x": 1309,
              "y": 538
            },
            "label": "需立即关注 2 项高危告警 · 共 5 条",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 146,
              "w": 643,
              "x": 1309,
              "y": 707
            },
            "label": "主数据健康度 93 / 100 在管 802 条 风险 3 条",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 57,
              "w": 200,
              "x": 283,
              "y": 917
            },
            "label": "客户中心",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 57,
              "w": 200,
              "x": 490,
              "y": 917
            },
            "label": "供应商中心",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 57,
              "w": 200,
              "x": 698,
              "y": 917
            },
            "label": "采购中心",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 57,
              "w": 200,
              "x": 906,
              "y": 917
            },
            "label": "销售中心",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 57,
              "w": 200,
              "x": 1114,
              "y": 917
            },
            "label": "财务中心",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 57,
              "w": 200,
              "x": 1322,
              "y": 917
            },
            "label": "库存中心",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 57,
              "w": 200,
              "x": 1530,
              "y": 917
            },
            "label": "审批工作台",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 57,
              "w": 200,
              "x": 1738,
              "y": 917
            },
            "label": "数据质量",
            "disabled": false
          }
        ]
      },
      "devicePixelRatio": 1.600000023841858
    },
    "localEvidence": {
      "localAttachmentPaths": [
        "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/attachments/BUG-20260723-0001/attachments/01-1784769391292-9ada96f5.png"
      ]
    }
  },
  "failureClassification": {
    "category": "RBAC_403",
    "evidence": [
      "权限/RBAC/DataScope 信号"
    ],
    "priority": "P1",
    "severity": "HIGH",
    "confidence": 0.9,
    "suggestedFix": "对齐菜单码、角色权限和 DataScope，避免前端透传无权限入口。",
    "autoFixEligible": true,
    "recommendedAgents": [
      "A2-Security-Regression-Gate",
      "A3-Backend-Critical-Path",
      "A1-CI-Runtime-Gate"
    ],
    "requiresHumanGate": true,
    "ownerRecommendation": "A2-Security-Regression-Gate"
  },
  "agentExecutionApproval": {
    "approved": true,
    "approvedAt": "2026-07-23T01:16:57.185Z",
    "approvedBy": "admin",
    "approvalScope": "仅允许按当前 Agent 修复计划写入本地任务队列；不自动部署、不写数据库、不执行 migration。",
    "forbiddenActions": [
      "database write without separate gate",
      "migration execution without separate gate",
      "force push"
    ]
  }
}
```

## Local Evidence

- /Users/mac/.phoenix-erp/runs/bug-intake-inbox/attachments/BUG-20260723-0001/attachments/01-1784769391292-9ada96f5.png

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
