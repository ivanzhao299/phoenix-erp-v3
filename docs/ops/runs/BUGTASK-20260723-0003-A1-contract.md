# Bug Repair Agent Contract

Source bug: BUG-20260723-0003
Source repair task: BUGTASK-20260723-0003
Assigned agent: A1-CI-Runtime-Gate

## Issue

库存管理-出库管理，出入库功能不能联动

## Route

/breeding

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "bugNo": "BUG-20260723-0003",
  "taskNo": "BUGTASK-20260723-0003",
  "title": "库存管理-出库管理，出入库功能不能联动",
  "description": "",
  "route": "/breeding",
  "url": "https://erp.eggslao.com/breeding",
  "priority": "P2",
  "severity": "MEDIUM",
  "moduleCode": "____",
  "acceptanceCriteria": "入库单需录入产品编码并且是输入框，出库单是SKU下拉框，入库和出库逻辑都不一样，入库、库存查询、出库没有形成闭环，无法实现正常的出入库操作，需要重新涉及功能逻辑并将入库管理、库存查询、出库管理功能关联起来",
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
        "sha256": "658d94e9a2b80a61995ac28a06c880ad21953fa26542eb78e6a54b76dc72f894",
        "fileName": "01-1784789145652-b5e16439.png",
        "mimeType": "image/png",
        "sizeBytes": 434405,
        "originalName": "pasted-screenshot-1784789099680-1.png",
        "relativePath": "storage/bug-reports/2026/07/23/BUG-20260723-0003/01-1784789145652-b5e16439.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260723-0003/attachments/01-1784789145652-b5e16439.png"
      }
    ],
    "consoleErrors": [
      {
        "type": "unhandledrejection",
        "stack": "Error: 「wms_locations」存在重复值，请检查后重试\n    at c (https://erp.eggslao.com/_next/static/chunks/0jt_vn8u1q2l2.js:1:12620)\n    at h (https://erp.eggslao.com/_next/static/chunks/0jt_vn8u1q2l2.js:1:13861)\n    at async er (https://erp.eggslao.com/_next/static/chunks/0vmczhbad0jwh.js:1:44929)",
        "message": "「wms_locations」存在重复值，请检查后重试",
        "timestamp": "2026-07-23T05:55:24.734Z"
      }
    ],
    "failedRequests": [
      {
        "url": "/api/crud/wms_locations",
        "method": "POST",
        "status": 400,
        "requestId": "",
        "timestamp": "2026-07-23T05:55:24.732Z",
        "responseExcerpt": "{\"code\":400,\"message\":\"「wms_locations」存在重复值，请检查后重试\",\"error\":\"Bad Request\",\"statusCode\":400}"
      },
      {
        "url": "/api/farm/medicine/inbound",
        "method": "POST",
        "status": 500,
        "requestId": "",
        "timestamp": "2026-07-23T06:04:15.786Z",
        "responseExcerpt": "{\"code\":500,\"msg\":\"服务器内部错误，请联系管理员\"}"
      },
      {
        "url": "/api/v2/finance/expenses/2/submit",
        "method": "POST",
        "status": 400,
        "requestId": "",
        "timestamp": "2026-07-23T06:05:28.790Z",
        "responseExcerpt": "{\"code\":\"APPROVER_NOT_FOUND\",\"approverType\":\"ORG_MANAGER\",\"companyCode\":\"COMP-LAO-AGRI\",\"stepNo\":1}"
      }
    ],
    "clientContext": {
      "language": "zh-CN",
      "timezone": "Asia/Shanghai",
      "viewport": {
        "width": 2000,
        "height": 1081
      },
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      "capturedAt": "2026-07-23T06:45:45.653Z",
      "pageSnapshot": {
        "route": "/breeding",
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
          "系统健康",
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
          "pasted-screenshot-1784789099680-1.png",
          "退出",
          "总部门户",
          "/养殖生产中心",
          "/",
          "养殖生产中心",
          "·实时监控所有养殖场运营状态",
          "·",
          "羽",
          "枚",
          "个",
          "批",
          "项",
          "养殖场一览",
          "东鹏蛋鸡场",
          "正常",
          "孟赛蛋鸡场",
          "需关注",
          "测试养殖场",
          "今日预警 & 任务",
          "系统正常",
          "实时",
          "当前无待处理预警事项，各场运营正常",
          "本周汇总",
          "累计产蛋",
          "649 枚",
          "死淘累计",
          "0 羽",
          "料蛋比（均）",
          "708.78",
          "完成免疫",
          "暂无计划"
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
            "path": ".sidebar-module__C8A-ya__groupHeader.sidebar-module__C8A-ya__groupActive",
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
            "label": "采购管理",
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
            "label": "系统设置",
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
              "x": 969,
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
              "h": 35,
              "w": 115,
              "x": 244,
              "y": 145
            },
            "label": "养殖场总览",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 35,
              "w": 103,
              "x": 365,
              "y": 145
            },
            "label": "鸡舍管理",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 35,
              "w": 103,
              "x": 474,
              "y": 145
            },
            "label": "鸡群档案",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 35,
              "w": 116,
              "x": 583,
              "y": 145
            },
            "label": "日生产日报",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 35,
              "w": 103,
              "x": 706,
              "y": 145
            },
            "label": "免疫计划",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 35,
              "w": 103,
              "x": 815,
              "y": 145
            },
            "label": "用药记录",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 35,
              "w": 103,
              "x": 924,
              "y": 145
            },
            "label": "饲料台账",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 35,
              "w": 103,
              "x": 1033,
              "y": 145
            },
            "label": "存栏日报",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 35,
              "w": 103,
              "x": 1143,
              "y": 145
            },
            "label": "药品库存",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 35,
              "w": 103,
              "x": 1252,
              "y": 145
            },
            "label": "蛋品台账",
            "disabled": false
          }
        ]
      },
      "devicePixelRatio": 1.600000023841858
    },
    "localEvidence": {
      "localAttachmentPaths": [
        "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/attachments/BUG-20260723-0003/attachments/01-1784789145652-b5e16439.png"
      ]
    }
  },
  "failureClassification": {
    "category": "API_5XX",
    "evidence": [
      "API 5xx/异常信号"
    ],
    "priority": "P1",
    "severity": "HIGH",
    "confidence": 0.88,
    "suggestedFix": "复现失败接口，修正后端异常并补充 A1 回归验证。",
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
    "approvedAt": "2026-07-23T07:06:40.652Z",
    "approvedBy": "bug_intake_runner",
    "redispatch": true,
    "approvalScope": "Automatic recovery is limited to runner-created technical HOLD evidence; original business approval and forbidden actions remain unchanged.",
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

- /Users/mac/.phoenix-erp/runs/bug-intake-inbox/attachments/BUG-20260723-0003/attachments/01-1784789145652-b5e16439.png
