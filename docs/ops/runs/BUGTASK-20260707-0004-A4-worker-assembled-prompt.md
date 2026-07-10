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

Source bug: BUG-20260707-0004
Source repair task: BUGTASK-20260707-0004
Assigned agent: A4-Frontend-UAT-Smoke

## Issue

用tangzhiwen账号库存查询无数据

## Route

/warehouse/query

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "bugNo": "BUG-20260707-0004",
  "taskNo": "BUGTASK-20260707-0004",
  "title": "用tangzhiwen账号库存查询无数据",
  "description": "",
  "route": "/warehouse/query",
  "url": "https://erp.eggslao.com/warehouse/query",
  "priority": "P2",
  "severity": "MEDIUM",
  "moduleCode": "",
  "acceptanceCriteria": "用tangzhiwen账号库存查询、库存台账能查出数据",
  "reporter": {
    "name": "唐治文",
    "roles": [
      "ROLE_FARM_CASHIER",
      "ROLE_WMS_OP",
      "ROLE_WAREHOUSE_MASTER_MGR",
      "ROLE_FARM_QC_INSPECTOR"
    ],
    "username": "tangzhiwen",
    "companyCode": "",
    "projectCode": ""
  },
  "context": {
    "attachments": [
      {
        "sha256": "c339e6b8ae1d8922998b1c28391a2f2270b6f7496be6d3a7c1977b86939c4999",
        "fileName": "01-1783384655247-989a8cd3.png",
        "mimeType": "image/png",
        "sizeBytes": 288398,
        "originalName": "pasted-screenshot-1783384649126-1.png",
        "relativePath": "storage/bug-reports/2026/07/07/BUG-20260707-0004/01-1783384655247-989a8cd3.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260707-0004/attachments/01-1783384655247-989a8cd3.png"
      }
    ],
    "consoleErrors": [],
    "failedRequests": [
      {
        "url": "/api/notifications/unread-count",
        "method": "GET",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-07T00:31:06.581Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"MENU_PERMISSION_DENIED\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/notifications/unread-count",
        "method": "GET",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-07T00:31:16.657Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"MENU_PERMISSION_DENIED\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/notifications/unread-count",
        "method": "GET",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-07T00:32:06.937Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"MENU_PERMISSION_DENIED\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/notifications/unread-count",
        "method": "GET",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-07T00:33:06.923Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"MENU_PERMISSION_DENIED\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/notifications/unread-count",
        "method": "GET",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-07T00:34:06.934Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"MENU_PERMISSION_DENIED\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/notifications/unread-count",
        "method": "GET",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-07T00:34:45.853Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"MENU_PERMISSION_DENIED\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/notifications/unread-count",
        "method": "GET",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-07T00:34:54.899Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"MENU_PERMISSION_DENIED\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/notifications/unread-count",
        "method": "GET",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-07T00:35:04.222Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"MENU_PERMISSION_DENIED\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/notifications/unread-count",
        "method": "GET",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-07T00:35:06.578Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"MENU_PERMISSION_DENIED\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/notifications/unread-count",
        "method": "GET",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-07T00:35:42.386Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"MENU_PERMISSION_DENIED\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/notifications/unread-count",
        "method": "GET",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-07T00:36:06.570Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"MENU_PERMISSION_DENIED\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/notifications/unread-count",
        "method": "GET",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-07T00:36:28.318Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"MENU_PERMISSION_DENIED\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/notifications/unread-count",
        "method": "GET",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-07T00:37:01.204Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"MENU_PERMISSION_DENIED\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/notifications/unread-count",
        "method": "GET",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-07T00:37:06.565Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"MENU_PERMISSION_DENIED\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/notifications/unread-count",
        "method": "GET",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-07T00:37:26.713Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"MENU_PERMISSION_DENIED\",\"error\":\"Forbidden\",\"statusCode\":403}"
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
      "capturedAt": "2026-07-07T00:37:35.248Z",
      "pageSnapshot": {
        "route": "/warehouse/query",
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
          "入库管理",
          "出库管理",
          "调拨管理",
          "盘点管理",
          "库存台账",
          "库存查询",
          "临期预警",
          "日结对账",
          "报损管理",
          "财务结算中心",
          "经营分析",
          "主数据中心",
          "个人中心 / 修改密码",
          "⚠️",
          "影子模式：正在以 唐治文 身份查看（由 admin 发起）— 仅用于测试/排障，操作会以该用户身份执行",
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
          "pasted-screenshot-1783384649126-1.png",
          "退出",
          "·实时查询库存批次余量和状态",
          "·",
          "共 0 条记录",
          "批次号",
          "产品编码",
          "仓库",
          "库位",
          "保质期至",
          "库存数量",
          "归属门店",
          "暂无库存数据"
        ],
        "interactiveElements": [
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 220,
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
              "w": 220,
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
              "w": 220,
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
              "w": 220,
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
              "w": 220,
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
              "w": 220,
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
              "w": 220,
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
              "w": 220,
              "x": 0,
              "y": 373
            },
            "label": "入库管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 220,
              "x": 0,
              "y": 405
            },
            "label": "出库管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 220,
              "x": 0,
              "y": 437
            },
            "label": "调拨管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 220,
              "x": 0,
              "y": 469
            },
            "label": "盘点管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 220,
              "x": 0,
              "y": 501
            },
            "label": "库存台账",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.sidebar-module__C8A-ya__subActive",
            "rect": {
              "h": 32,
              "w": 220,
              "x": 0,
              "y": 533
            },
            "label": "库存查询",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 220,
              "x": 0,
              "y": 565
            },
            "label": "临期预警",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 220,
              "x": 0,
              "y": 597
            },
            "label": "日结对账",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 220,
              "x": 0,
              "y": 629
            },
            "label": "报损管理",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 220,
              "x": 0,
              "y": 661
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
              "y": 699
            },
            "label": "经营分析",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 220,
              "x": 0,
              "y": 737
            },
            "label": "主数据中心",
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
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 100,
              "x": 1482,
              "y": 7
            },
            "label": "退出影子模式",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".admin-module__uYgI-a__headerSelect",
            "rect": {
              "h": 30,
              "w": 96,
              "x": 1067,
              "y": 53
            },
            "label": "🇨🇳 中文 🇱🇦 ລາວ 🇬🇧 English",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".bug-intake-module__OBjRZW__feedbackButton",
            "rect": {
              "h": 40,
              "w": 122,
              "x": 1272,
              "y": 48
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
              "y": -8
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
              "w": 90,
              "x": 1408,
              "y": 52
            },
            "label": "唐 唐治文 养殖场出纳",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-module__uYgI-a__logoutBtn",
            "rect": {
              "h": 30,
              "w": 68,
              "x": 1512,
              "y": 53
            },
            "label": "退出",
            "disabled": false
          }
        ]
      },
      "devicePixelRatio": 2
    },
    "localEvidence": {
      "localAttachmentPaths": []
    }
  },
  "failureClassification": {
    "category": "PG_SQL",
    "evidence": [
      "数据库/PG/SQL 信号"
    ],
    "priority": "P1",
    "severity": "HIGH",
    "confidence": 0.92,
    "suggestedFix": "定位 SQL/ORM 查询并补充类型、别名、字段或迁移门禁验证。",
    "autoFixEligible": true,
    "recommendedAgents": [
      "A3-Backend-Critical-Path",
      "A1-CI-Runtime-Gate"
    ],
    "requiresHumanGate": true,
    "ownerRecommendation": "A3-Backend-Critical-Path"
  },
  "agentExecutionApproval": {
    "approved": true,
    "approvedAt": "2026-07-10T04:38:18.820Z",
    "approvedBy": "bug_intake_runner",
    "redispatch": true,
    "approvalScope": "User approved strict-evidence repair of reconciled false completions. Business code only within generated Agent contract; no migration, DB write, force push, or direct deploy outside CI/CD.",
    "redispatchCount": 1,
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
