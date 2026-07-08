# Bug Repair Agent Contract

Source bug: BUG-20260708-0003
Source repair task: BUGTASK-20260708-0003
Assigned agent: A3-Backend-Critical-Path

## Issue

物流运单没法关联采购订单

## Route

/procurement2/orders

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "url": "https://erp.eggslao.com/procurement2/orders",
  "bugNo": "BUG-20260708-0003",
  "route": "/procurement2/orders",
  "title": "物流运单没法关联采购订单",
  "taskNo": "BUGTASK-20260708-0003",
  "context": {
    "attachments": [
      {
        "sha256": "900cccc31b880c4a3b6d70e71f8d02a005933c4900c2b0a059af70fb39194413",
        "fileName": "01-1783491225443-748bc8ba.png",
        "mimeType": "image/png",
        "sizeBytes": 730004,
        "originalName": "pasted-screenshot-1783491218739-1.png",
        "relativePath": "storage/bug-reports/2026/07/08/BUG-20260708-0003/01-1783491225443-748bc8ba.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260708-0003/attachments/01-1783491225443-748bc8ba.png"
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
      "capturedAt": "2026-07-08T06:13:45.445Z",
      "pageSnapshot": {
        "route": "/procurement2/orders",
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
          "问题反馈",
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
          "pasted-screenshot-1783491218739-1.png",
          "退出",
          "采购管理",
          "/采购订单",
          "/",
          "采购订单",
          "·管理所有采购订单 · 共 0 行",
          "·",
          "期望到货：",
          "~",
          "采购订单号",
          "主题",
          "公司",
          "供应商",
          "类型",
          "跨境",
          "合同金额",
          "行数",
          "期望到货",
          "付款截止",
          "状态",
          "操作",
          "PO2-20260707-00002",
          "采购测试3",
          "老挝凤凰农业发展有限公司",
          "河南艾特米",
          "原料/物料",
          "本地",
          "CNY 60.00",
          "1",
          "2026-07-08",
          "2026-08-08",
          "已批准",
          "查看",
          "PO2-20260707-00001",
          "采购测试",
          "CNY 35.00",
          "2026-07-09",
          "已取消",
          "PO2-20260625-00004",
          "凤凰农业建设工程款",
          "罗成松",
          "装修/工程",
          "CNY 150,000.00",
          "2026-06-25",
          "2026-06-26",
          "PO2-20260625-00003",
          "凤凰农业采购药品",
          "CNY 37,250.00",
          "4",
          "PO2-20260625-00002",
          "装修工程服务采购申请测试",
          "张鹏（装修工程）",
          "服务/外包",
          "CNY 72,108.00",
          "—",
          "PO2-20260625-00001",
          "凤凰农业药品采购",
          "PO2-20260620-00001",
          "凤凰农业拉邦直营店二楼酒店装修改造",
          "CNY 174,154.80",
          "2026-06-20",
          "2026-06-21",
          "PO2-20260615-00003",
          "万象总部办公室装修首期款（凤凰食品公司承担）",
          "老挝凤凰食品集团有限公司",
          "CNY 36,054.00",
          "2026-06-15",
          "PO2-20260615-00002",
          "DIAG2-装修拆单验证(可删)",
          "CNY 1.00",
          "PO2-20260615-00001",
          "万象总部办公室装修首期款（凤凰农业承担）",
          "PO-ETL-20260605-05",
          "玉米 采购 - 2026-06-05",
          "胥总",
          "LAK 408,435,000.00",
          "2026-06-05",
          "已完成",
          "PO-ETL-20260604-04",
          "玉米 采购 - 2026-06-04",
          "LAK 407,705,000.00",
          "2026-06-04",
          "PO-ETL-20260603-03",
          "蛋托 采购 - 2026-06-03",
          "万象蛋托厂",
          "LAK 106,400,000.00",
          "2026-06-03",
          "PO-ETL-20260602-02",
          "玉米 采购 - 2026-06-02",
          "LAK 787,086,000.00",
          "2026-06-02",
          "PO-ETL-20260601-01",
          "豆粕 采购 - 2026-06-01",
          "中粮鞠德清",
          "CNY 251,600.00",
          "2026-06-01"
        ],
        "interactiveElements": [
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
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 40,
              "w": 149,
              "x": 1188,
              "y": 84
            },
            "label": "从采购申请转单",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 40,
              "w": 84,
              "x": 1345,
              "y": 84
            },
            "label": "刷新",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".admin-ui-module__B-1PDG__btnPrimary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 40,
              "w": 134,
              "x": 1437,
              "y": 84
            },
            "label": "新建采购订单",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 38,
              "w": 805,
              "x": 80,
              "y": 145
            },
            "label": "关键字（采购订单号/主题/供应商）",
            "disabled": false
          },
          {
            "tag": "select",
            "path": "",
            "rect": {
              "h": 36,
              "w": 98,
              "x": 893,
              "y": 146
            },
            "label": "全部状态 草稿 待审批 待审批 已批准 已拒绝 已取消 部分付款 已付款 运输中 部分收货 已收货 已关闭 已完成",
            "disabled": false
          },
          {
            "tag": "select",
            "path": "",
            "rect": {
              "h": 36,
              "w": 103,
              "x": 999,
              "y": 146
            },
            "label": "全部类型 原料/物料 设备/机械 服务/外包 装修/工程 固定资产 其他",
            "disabled": false
          },
          {
            "tag": "select",
            "path": "",
            "rect": {
              "h": 36,
              "w": 98,
              "x": 1110,
              "y": 146
            },
            "label": "全部来源 本地采购 跨境采购",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 27,
              "w": 46,
              "x": 1468,
              "y": 265
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 27,
              "w": 46,
              "x": 1468,
              "y": 333
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 27,
              "w": 46,
              "x": 1468,
              "y": 401
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 27,
              "w": 46,
              "x": 1468,
              "y": 469
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 27,
              "w": 46,
              "x": 1468,
              "y": 537
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 27,
              "w": 46,
              "x": 1468,
              "y": 605
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 27,
              "w": 46,
              "x": 1468,
              "y": 673
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 27,
              "w": 46,
              "x": 1468,
              "y": 741
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 27,
              "w": 46,
              "x": 1468,
              "y": 809
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 27,
              "w": 46,
              "x": 1468,
              "y": 877
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 27,
              "w": 46,
              "x": 1468,
              "y": 945
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 27,
              "w": 46,
              "x": 1468,
              "y": 1013
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 27,
              "w": 46,
              "x": 1468,
              "y": 1081
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 27,
              "w": 46,
              "x": 1468,
              "y": 1149
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 27,
              "w": 46,
              "x": 1468,
              "y": 1217
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".rightDrawer-module__jI_Bsa__closeBtn",
            "rect": {
              "h": 32,
              "w": 32,
              "x": 2248,
              "y": 16
            },
            "label": "关闭抽屉",
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
          "fileName": "01-1783491225443-748bc8ba.png",
          "originalName": "pasted-screenshot-1783491218739-1.png",
          "mimeType": "image/png",
          "sourceEndpoint": "/api/bug-intake/reports/BUG-20260708-0003/attachments/01-1783491225443-748bc8ba.png",
          "localPath": "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260708-145347/BUG-20260708-0003/attachments/01-1783491225443-748bc8ba.png",
          "sizeBytes": 730004
        }
      ],
      "localAttachmentPaths": [
        "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260708-145347/BUG-20260708-0003/attachments/01-1783491225443-748bc8ba.png"
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
    "source_bug_no": "BUG-20260708-0003",
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
    "failure_category": null,
    "hard_constraints": [
      "no automatic production deploy",
      "no automatic DB write",
      "no automatic migration",
      "human approval required before code repair execution"
    ],
    "route_confidence": null,
    "source_repair_task_no": "BUGTASK-20260708-0003"
  },
  "createdAt": "2026-07-08T06:15:17.332Z",
  "createdBy": "admin",
  "moduleCode": "______",
  "suggestedOwner": "_____",
  "repairGuardrails": {
    "autoRepairExecuted": false,
    "noProductionDeploy": true,
    "noDbWriteWithoutGate": true,
    "requiresHumanApproval": true
  },
  "acceptanceCriteria": "物流运单可以关联采购订单",
  "agentPlanGeneratedAt": "2026-07-08T06:15:19.690Z",
  "agentPlanGeneratedBy": "admin",
  "agentExecutionApproval": {
    "approved": true,
    "approvedAt": "2026-07-08T06:15:21.063Z",
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

- /Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260708-145347/BUG-20260708-0003/attachments/01-1783491225443-748bc8ba.png
