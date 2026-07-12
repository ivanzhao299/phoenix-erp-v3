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

Source bug: BUG-20260711-0001
Source repair task: BUGTASK-20260711-0001
Assigned agent: A4-Frontend-UAT-Smoke

## Issue

经营仪表盘菜单被修改

## Route

/dashboard

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "bugNo": "BUG-20260711-0001",
  "taskNo": "BUGTASK-20260711-0001",
  "title": "经营仪表盘菜单被修改",
  "description": "",
  "route": "/dashboard",
  "url": "https://erp.eggslao.com/dashboard",
  "priority": "P2",
  "severity": "MEDIUM",
  "moduleCode": "",
  "acceptanceCriteria": "将菜单名称改回“经营仪表盘”",
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
        "sha256": "760c240bc2ba0ff7a0daa3fe2c12e412e171ba39eed402b4a1dbf29a43a36905",
        "fileName": "01-1783730877011-e16bcfc9.png",
        "mimeType": "image/png",
        "sizeBytes": 143154,
        "originalName": "pasted-screenshot-1783730825261-1.png",
        "relativePath": "storage/bug-reports/2026/07/11/BUG-20260711-0001/01-1783730877011-e16bcfc9.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260711-0001/attachments/01-1783730877011-e16bcfc9.png"
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
      "capturedAt": "2026-07-11T00:47:57.011Z",
      "pageSnapshot": {
        "route": "/dashboard",
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
          "仪表盘",
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
          "经营仪表盘",
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
          "pasted-screenshot-1783730825261-1.png",
          "退出",
          "系统仪表盘",
          "·Phoenix ERP 核心运营指标概览",
          "·",
          "集团总部经营驾驶舱",
          "实时数据 · 最近更新：08:47:03",
          "· 最近更新：08:47:03",
          "当日产蛋量",
          "20",
          "枚",
          "库存总量",
          "806,275.95",
          "今日POS收银",
          "0",
          "POS 收银",
          "今日农场直销",
          "农场直销",
          "待处理预警",
          "条",
          "总分",
          "83",
          "B级",
          "20/20",
          "3/20",
          "近7日经营走势",
          "产蛋(千枚)",
          "POS收银(LAK)",
          "农场直销(LAK)",
          "100%",
          "75%",
          "50%",
          "25%",
          "0%",
          "周日",
          "周一",
          "周二",
          "周三",
          "周四",
          "周五",
          "周六",
          "业务实时预警",
          "快速导航"
        ],
        "interactiveElements": [
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
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
            "path": ".sidebar-module__C8A-ya__groupHeader.sidebar-module__C8A-ya__groupActive",
            "rect": {
              "h": 38,
              "w": 220,
              "x": 0,
              "y": 194
            },
            "label": "仪表盘",
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
              "x": 1344,
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
              "x": 1500,
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
              "x": 965,
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
            "tag": "button",
            "path": ".dashboard-module__KOjgoW__refreshButton",
            "rect": {
              "h": 37,
              "w": 106,
              "x": 1865,
              "y": 135
            },
            "label": "刷新数据",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".dashboard-module__Bujhza__quickLink",
            "rect": {
              "h": 80,
              "w": 205,
              "x": 244,
              "y": 1034
            },
            "label": "养殖管理 鸡舍 / 鸡群 / 日报",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".dashboard-module__Bujhza__quickLink",
            "rect": {
              "h": 80,
              "w": 205,
              "x": 461,
              "y": 1034
            },
            "label": "分级包装 集蛋 / 分级 / 包装",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".dashboard-module__Bujhza__quickLink",
            "rect": {
              "h": 80,
              "w": 205,
              "x": 679,
              "y": 1034
            },
            "label": "仓储库存 入库 / 出库 / 盘点",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".dashboard-module__Bujhza__quickLink",
            "rect": {
              "h": 80,
              "w": 205,
              "x": 896,
              "y": 1034
            },
            "label": "销售订单 订单 / 审批 / 配送",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".dashboard-module__Bujhza__quickLink",
            "rect": {
              "h": 80,
              "w": 205,
              "x": 1113,
              "y": 1034
            },
            "label": "配送运输 波次 / 跟踪 / 签收",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".dashboard-module__Bujhza__quickLink",
            "rect": {
              "h": 80,
              "w": 205,
              "x": 1331,
              "y": 1034
            },
            "label": "财务&结算 应收 / 应付 / 流水",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".dashboard-module__Bujhza__quickLink",
            "rect": {
              "h": 80,
              "w": 205,
              "x": 1548,
              "y": 1034
            },
            "label": "品质追溯 质检 / 追溯 / 报表",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".dashboard-module__Bujhza__quickLink",
            "rect": {
              "h": 80,
              "w": 205,
              "x": 1766,
              "y": 1034
            },
            "label": "采购管理 采购单 / 供应商",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".dashboard-module__Bujhza__quickLink",
            "rect": {
              "h": 80,
              "w": 205,
              "x": 244,
              "y": 1126
            },
            "label": "数据分析 BI 驾驶舱 / 报表",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".dashboard-module__Bujhza__quickLink",
            "rect": {
              "h": 80,
              "w": 205,
              "x": 461,
              "y": 1126
            },
            "label": "系统设置 用户 / 权限 / 字典",
            "disabled": false
          }
        ]
      },
      "devicePixelRatio": 1.600000023841858
    },
    "localEvidence": {
      "localAttachmentPaths": []
    }
  },
  "failureClassification": null,
  "agentExecutionApproval": {
    "approved": true,
    "approvedAt": "2026-07-12T14:27:20.008Z",
    "approvedBy": "bug_intake_runner",
    "redispatch": true,
    "approvalScope": "Bulk controlled recovery of runner-owned false HOLDs after runtime/evolution lifecycle repair. Original business scope and safety gates remain unchanged.",
    "redispatchCount": 2,
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
