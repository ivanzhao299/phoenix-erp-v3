# Bug Repair Agent Contract

Source bug: BUG-20260715-0001
Source repair task: BUGTASK-20260715-0001
Assigned agent: A4-Frontend-UAT-Smoke

## Issue

运营工作台的当前总存栏与养殖场总览的存栏总数不一致

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
  "bugNo": "BUG-20260715-0001",
  "taskNo": "BUGTASK-20260715-0001",
  "title": "运营工作台的当前总存栏与养殖场总览的存栏总数不一致",
  "description": "",
  "route": "/breeding",
  "url": "https://erp.eggslao.com/breeding",
  "priority": "P2",
  "severity": "MEDIUM",
  "moduleCode": "__________",
  "acceptanceCriteria": "营工作台的当前总存栏与养殖场总览的存栏总数不一致，哪一个数据是准确的，把错误的一边改为正确，让两个地方的数据一致",
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
        "sha256": "32da8498386f5606a517cdbca93eb2e0bc94cea122d47074e2edeb28726832a4",
        "fileName": "01-1784076168039-853d55a8.png",
        "mimeType": "image/png",
        "sizeBytes": 1201226,
        "originalName": "pasted-screenshot-1784076147824-1.png",
        "relativePath": "storage/bug-reports/2026/07/15/BUG-20260715-0001/01-1784076168039-853d55a8.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260715-0001/attachments/01-1784076168039-853d55a8.png"
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
      "capturedAt": "2026-07-15T00:42:48.045Z",
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
          "pasted-screenshot-1784076147824-1.png",
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
          "今日预警 & 任务",
          "系统正常",
          "实时",
          "当前无待处理预警事项，各场运营正常",
          "本周汇总",
          "累计产蛋",
          "90 枚",
          "死淘累计",
          "0 羽",
          "料蛋比（均）",
          "911.11",
          "完成免疫",
          "暂无计划"
        ],
        "interactiveElements": [
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
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
              "w": 215,
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
              "w": 215,
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
              "w": 215,
              "x": 0,
              "y": 232
            },
            "label": "生产管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 37,
              "w": 199,
              "x": 8,
              "y": 276
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
              "y": 315
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
              "y": 347
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
              "y": 379
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
              "y": 411
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
              "y": 443
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
              "y": 475
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
              "y": 507
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
              "y": 539
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
              "y": 571
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
              "y": 603
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
              "y": 635
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
              "y": 667
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
              "y": 699
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
              "y": 731
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
              "y": 763
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
              "y": 795
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
              "y": 827
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
              "y": 859
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
              "y": 891
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
              "y": 923
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
              "y": 955
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
              "y": 987
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
              "y": 1019
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
              "y": 1057
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
              "y": 1095
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
              "y": 1133
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
              "y": 1171
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
              "y": 1209
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
              "y": 1247
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
              "y": 1285
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
              "y": 1323
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
              "y": 1361
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
              "y": 1399
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
              "y": 1437
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
    "approvedAt": "2026-07-23T05:54:51.993Z",
    "approvedBy": "admin",
    "redispatch": true,
    "approvalScope": "仅允许按当前 Agent 修复计划写入本地任务队列；不自动部署、不写数据库、不执行 migration。",
    "redispatchCount": 6,
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
