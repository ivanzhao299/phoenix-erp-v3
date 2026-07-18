# Base Agent Prompt

# Bug Intake A3 Backend Repair Prompt

## Identity

You are `A3-Backend-Critical-Path` running on the dedicated Bug Intake repair branch.

Worktree: `/Users/mac/phoenix-erp-worktrees/bug-intake-a3`

Branch: `codex/bug-intake-a3`

## Mission

Implement the backend portion of exactly one approved bug report. Read the attached task contract first, reproduce from local source/evidence, identify the root cause, make the smallest production-quality fix, add focused tests, and write a task-specific report under `docs/ops/**`.

## Allowed Scope

- `apps/api/**`
- task-specific `docs/ops/**`

## Forbidden Scope

- `apps/web/**`
- migrations, schema, entity, table, or column changes without a separate schema gate
- database writes, seeds, deploys, pushes, force operations, or production commands
- unrelated refactors

## Required Evidence

1. owned backend file diff;
2. focused regression test or a documented, reproducible static verification when a test is impossible;
3. API typecheck;
4. task-specific report naming the source bug, root cause, changed files, validation results, and explicit `PASS WITH CONDITIONS`, `HOLD`, or `FAIL`;
5. no claim that the bug is resolved before CI/CD, production smoke, and business acceptance.

If the issue has no backend-owned fix, return `NOT APPLICABLE` with concrete evidence and do not edit files.

---

# Agent Task Contract

# Bug Repair Agent Contract

Source bug: BUG-20260717-0002
Source repair task: BUGTASK-20260717-0002
Assigned agent: A3-Backend-Critical-Path

## Issue

每日工作台-饲料消耗登记，当前页面加载失败

## Route

/daily-work

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "bugNo": "BUG-20260717-0002",
  "taskNo": "BUGTASK-20260717-0002",
  "title": "每日工作台-饲料消耗登记，当前页面加载失败",
  "description": "",
  "route": "/daily-work",
  "url": "https://erp.eggslao.com/daily-work",
  "priority": "P2",
  "severity": "MEDIUM",
  "moduleCode": "_____-______",
  "acceptanceCriteria": "点击“饲料消耗登记”后跳转饲料台账页面后不到一秒马上黑屏并弹窗“当前页面加载失败”，要求不要出现页面异常，可以正常访问饲料台账",
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
        "sha256": "5c40b5620d9ad9165734a2981a5fec94ee2c3ce4aeee01fb4993a539e410158e",
        "fileName": "01-1784277798848-93b3e7c3.png",
        "mimeType": "image/png",
        "sizeBytes": 531171,
        "originalName": "pasted-screenshot-1784277770127-1.png",
        "relativePath": "storage/bug-reports/2026/07/17/BUG-20260717-0002/01-1784277798848-93b3e7c3.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260717-0002/attachments/01-1784277798848-93b3e7c3.png"
      }
    ],
    "consoleErrors": [
      {
        "type": "console.error",
        "message": "[AppError] Failed to execute 'removeChild' on 'Node': The node to be removed is not a child of this node.",
        "timestamp": "2026-07-17T08:39:33.052Z"
      }
    ],
    "failedRequests": [],
    "clientContext": {
      "language": "zh-CN",
      "timezone": "Asia/Shanghai",
      "viewport": {
        "width": 2000,
        "height": 1081
      },
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      "capturedAt": "2026-07-17T08:43:18.850Z",
      "pageSnapshot": {
        "route": "/daily-work",
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
          "pasted-screenshot-1784277770127-1.png",
          "退出",
          "·7月17日星期五 · 一站式录入 · 17 项可用功能",
          "·"
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
            "path": ".sidebar-module__C8A-ya__groupHeader.sidebar-module__C8A-ya__groupActive",
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
              "x": 964,
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
            "path": "",
            "rect": {
              "h": 82,
              "w": 335,
              "x": 244,
              "y": 175
            },
            "label": "生产日报录入 存栏 / 死亡 / 淘汰 / 产蛋 / 产蛋率",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 82,
              "w": 335,
              "x": 593,
              "y": 175
            },
            "label": "鸡群档案 入栏批次 / 当前存栏 / 强制换羽",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 82,
              "w": 335,
              "x": 942,
              "y": 175
            },
            "label": "死淘快速登记 紧急死亡 / 淘汰登记 · 含原因",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 82,
              "w": 335,
              "x": 1292,
              "y": 175
            },
            "label": "饲料消耗登记 玉米 / 豆粕 / 预混料 · 按鸡舍分配",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 82,
              "w": 335,
              "x": 1641,
              "y": 175
            },
            "label": "兽药使用记录 日常用药 / 治疗记录",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 82,
              "w": 335,
              "x": 244,
              "y": 270
            },
            "label": "免疫疫苗记录 免疫计划 / 接种记录",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 82,
              "w": 335,
              "x": 593,
              "y": 270
            },
            "label": "药品库存 入库 / 出库 / 库存查询",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 82,
              "w": 335,
              "x": 942,
              "y": 270
            },
            "label": "日产蛋入库 7 等级分级入库",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 82,
              "w": 335,
              "x": 1292,
              "y": 270
            },
            "label": "原料入库 饲料 / 兽药 / 包材手工入库",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 82,
              "w": 335,
              "x": 1641,
              "y": 270
            },
            "label": "出库管理 原料出库 / 调拨出库",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 82,
              "w": 335,
              "x": 244,
              "y": 366
            },
            "label": "库存查询 批次 / 临期 / 流水",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 82,
              "w": 335,
              "x": 593,
              "y": 366
            },
            "label": "现金收款 直营店 / 客户收款 · 老币+人民币",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 82,
              "w": 335,
              "x": 942,
              "y": 366
            },
            "label": "现金付款 采购 / 工资 / 运费",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 82,
              "w": 335,
              "x": 1292,
              "y": 366
            },
            "label": "销售出库 客户订单 / 散户零售",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 82,
              "w": 335,
              "x": 1641,
              "y": 366
            },
            "label": "应收收款 客户回款登记",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 82,
              "w": 335,
              "x": 244,
              "y": 462
            },
            "label": "我的待办 待处理审批任务",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 82,
              "w": 335,
              "x": 593,
              "y": 462
            },
            "label": "我的提交 本人发起的所有单据 · 审批进度",
            "disabled": false
          }
        ]
      },
      "devicePixelRatio": 1.600000023841858
    },
    "localEvidence": {
      "localAttachmentPaths": [
        "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260718-192908/BUG-20260717-0002/attachments/01-1784277798848-93b3e7c3.png"
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
    "approvedAt": "2026-07-17T08:44:02.162Z",
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

- /Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260718-192908/BUG-20260717-0002/attachments/01-1784277798848-93b3e7c3.png

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
