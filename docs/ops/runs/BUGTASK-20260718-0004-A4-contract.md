# Bug Repair Agent Contract

Source bug: BUG-20260718-0004
Source repair task: BUGTASK-20260718-0004
Assigned agent: A4-Frontend-UAT-Smoke

## Issue

mobile端-鸡舍管理，新建鸡舍提示“集团/管理员请在PC端「鸡舍管理」创建并指定农场;手机端仅供场长建本场鸡舍。”

## Route

/settings/users

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "bugNo": "BUG-20260718-0004",
  "taskNo": "BUGTASK-20260718-0004",
  "title": "mobile端-鸡舍管理，新建鸡舍提示“集团/管理员请在PC端「鸡舍管理」创建并指定农场;手机端仅供场长建本场鸡舍。”",
  "description": "",
  "route": "/settings/users",
  "url": "https://erp.eggslao.com/settings/users",
  "priority": "P2",
  "severity": "MEDIUM",
  "moduleCode": "mobile_____",
  "acceptanceCriteria": "地址：https://erp.eggslao.com/mobile/henhouse，在mobile端鸡舍管理新建鸡舍，提示“集团/管理员请在PC端「鸡舍管理」创建并指定农场;手机端仅供场长建本场鸡舍。”，但是linhong这个账号就是养殖场长",
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
        "sha256": "33153f421a495e2488490b3b1d7c0d1011e2bf10614514e880c894893490264e",
        "fileName": "01-1784344473306-143ce004.png",
        "mimeType": "image/png",
        "sizeBytes": 665405,
        "originalName": "pasted-screenshot-1784344443760-1.png",
        "relativePath": "storage/bug-reports/2026/07/18/BUG-20260718-0004/01-1784344473306-143ce004.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260718-0004/attachments/01-1784344473306-143ce004.png"
      }
    ],
    "consoleErrors": [],
    "failedRequests": [
      {
        "url": "/api/v2/finance/expenses/1/submit",
        "method": "POST",
        "status": 400,
        "requestId": "",
        "timestamp": "2026-07-18T01:42:40.737Z",
        "responseExcerpt": "{\"code\":\"APPROVER_NOT_FOUND\",\"approverType\":\"ORG_MANAGER\",\"companyCode\":\"COMP-LAO-AGRI\",\"stepNo\":1}"
      },
      {
        "url": "/api/v2/finance/expenses/1/submit",
        "method": "POST",
        "status": 400,
        "requestId": "",
        "timestamp": "2026-07-18T01:43:06.796Z",
        "responseExcerpt": "{\"code\":\"APPROVER_NOT_FOUND\",\"approverType\":\"ORG_MANAGER\",\"companyCode\":\"COMP-LAO-AGRI\",\"stepNo\":1}"
      },
      {
        "url": "/api/v2/finance/expenses/1/submit",
        "method": "POST",
        "status": 400,
        "requestId": "",
        "timestamp": "2026-07-18T01:43:47.729Z",
        "responseExcerpt": "{\"code\":\"APPROVER_NOT_FOUND\",\"approverType\":\"ORG_MANAGER\",\"companyCode\":\"COMP-LAO-AGRI\",\"stepNo\":1}"
      },
      {
        "url": "/api/v2/finance/expenses/1/submit",
        "method": "POST",
        "status": 400,
        "requestId": "",
        "timestamp": "2026-07-18T01:44:58.325Z",
        "responseExcerpt": "{\"code\":\"APPROVER_NOT_FOUND\",\"approverType\":\"ORG_MANAGER\",\"companyCode\":\"COMP-LAO-AGRI\",\"stepNo\":1}"
      },
      {
        "url": "/api/v2/finance/expenses/1/submit",
        "method": "POST",
        "status": 400,
        "requestId": "",
        "timestamp": "2026-07-18T01:46:23.754Z",
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
      "capturedAt": "2026-07-18T03:14:33.307Z",
      "pageSnapshot": {
        "route": "/settings/users",
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
          "用户管理",
          "角色与权限",
          "权限集",
          "数据范围",
          "系统参数",
          "安全策略",
          "审计日志",
          "品牌配置",
          "PDA终端",
          "POS配置",
          "分账库存配置",
          "通知设置",
          "在线用户",
          "验收试运行",
          "系统运维",
          "个人中心 / 修改密码",
          "日生产日报",
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
          "pasted-screenshot-1784344443760-1.png",
          "退出",
          "/用户权限",
          "/",
          "用户权限",
          "用户与权限",
          "·用户账号角色分配组织绑定数据范围一站式",
          "·",
          "正常 33",
          "冻结 10",
          "归档 0",
          "· 筛选结果 1 条",
          "分组视图",
          "列表视图",
          "(43)",
          "(41)",
          "(0)",
          "🐔",
          "养殖生产",
          "1 人",
          "linhong 正式 ID: 7",
          "linhong",
          "正式",
          "林宏",
          "养殖场长 驻场兽医",
          "养殖场长",
          "驻场兽医",
          "正常",
          "冻结 归档",
          "合计 1 人 · 1 个分组"
        ],
        "interactiveElements": [
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 14
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
              "y": 52
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
              "y": 90
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
              "y": 128
            },
            "label": "生产管理",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 166
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
              "y": 204
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
              "y": 242
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
              "y": 280
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
              "y": 318
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
              "y": 356
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
              "y": 394
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
              "y": 432
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
              "y": 470
            },
            "label": "主数据中心",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.sidebar-module__C8A-ya__groupActive",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 508
            },
            "label": "系统设置",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.sidebar-module__C8A-ya__subActive",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 546
            },
            "label": "用户管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 578
            },
            "label": "角色与权限",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 610
            },
            "label": "权限集",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 642
            },
            "label": "数据范围",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 674
            },
            "label": "系统参数",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 706
            },
            "label": "安全策略",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 738
            },
            "label": "审计日志",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 770
            },
            "label": "品牌配置",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 802
            },
            "label": "PDA终端",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 834
            },
            "label": "POS配置",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 866
            },
            "label": "分账库存配置",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 898
            },
            "label": "通知设置",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 930
            },
            "label": "在线用户",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 962
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
              "y": 1000
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
              "x": 970,
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
            "path": ".admin-ui-module__B-1PDG__btnPrimaryGrad",
            "rect": {
              "h": 37,
              "w": 113,
              "x": 1863,
              "y": 86
            },
            "label": "新建用户",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 35,
              "w": 82,
              "x": 1873,
              "y": 164
            },
            "label": "刷新",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 28,
              "w": 86,
              "x": 248,
              "y": 235
            },
            "label": "分组视图",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 28,
              "w": 86,
              "x": 336,
              "y": 235
            },
            "label": "列表视图",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__tabPill.admin-ui-module__B-1PDG__tabPillActive",
            "rect": {
              "h": 29,
              "w": 81,
              "x": 435,
              "y": 234
            },
            "label": "全部(43)",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__tabPill.",
            "rect": {
              "h": 29,
              "w": 122,
              "x": 522,
              "y": 234
            },
            "label": "✅ 正式员工(41)",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__tabPill.",
            "rect": {
              "h": 29,
              "w": 117,
              "x": 650,
              "y": 234
            },
            "label": "🧪 测试账号(0)",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 19,
              "w": 218,
              "x": 808,
              "y": 239
            },
            "label": "搜索姓名、账号、角色…",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 14,
              "w": 11,
              "x": 1033,
              "y": 242
            },
            "label": "✕",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 35,
              "w": 113,
              "x": 1067,
              "y": 231
            },
            "label": "在管账号 全部（含归档） ✅ 正常 🔒 已冻结 🗄 已归档",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 35,
              "w": 164,
              "x": 1189,
              "y": 231
            },
            "label": "全部角色 集团超级管理员 孟赛/东鹏蛋鸡场 出纳 农业事业群总经理 食品事业群总经理 集团总裁 场区经理 财务审核经理 财务总监 总部财务审计 试运行负责人 区域督导 大客总监 养殖场长 财务会计 应收专员 成本会计 人力资源经理 物流调度 主数据审批人 车间主任 品控总监 销售经理 直营店店长 资金经理 驻场兽医 仓",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 31,
              "w": 69,
              "x": 1364,
              "y": 233
            },
            "label": "清除筛选",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSm.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 26,
              "w": 61,
              "x": 1826,
              "y": 341
            },
            "label": "冻结",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSm.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 27,
              "w": 62,
              "x": 1895,
              "y": 341
            },
            "label": "归档",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 27,
              "w": 69,
              "x": 1828,
              "y": 410
            },
            "label": "全部展开",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 27,
              "w": 69,
              "x": 1903,
              "y": 410
            },
            "label": "全部折叠",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".rightDrawer-module__jI_Bsa__closeBtn",
            "rect": {
              "h": 32,
              "w": 32,
              "x": 2468,
              "y": 16
            },
            "label": "关闭抽屉",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 37,
              "w": 467,
              "x": 2021,
              "y": 159
            },
            "label": "字母+数字，如 store_mgr2",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 37,
              "w": 467,
              "x": 2021,
              "y": 230
            },
            "label": "如 张三",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 13,
              "w": 13,
              "x": 2034,
              "y": 343
            },
            "label": "REAL",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 13,
              "w": 13,
              "x": 2272,
              "y": 343
            },
            "label": "TEST",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 18,
              "w": 428,
              "x": 2049,
              "y": 465
            },
            "label": "搜索角色...",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 28,
              "w": 138,
              "x": 2031,
              "y": 527
            },
            "label": "集团超级管理员L99",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 28,
              "w": 180,
              "x": 2173,
              "y": 527
            },
            "label": "问题反馈本地修复机器人L0",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 28,
              "w": 167,
              "x": 2031,
              "y": 602
            },
            "label": "孟赛/东鹏蛋鸡场 出纳L10",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 28,
              "w": 120,
              "x": 2203,
              "y": 602
            },
            "label": "财务审核经理L3",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 28,
              "w": 96,
              "x": 2326,
              "y": 602
            },
            "label": "财务总监L3",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 28,
              "w": 120,
              "x": 2031,
              "y": 634
            },
            "label": "总部财务审计L3",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 28,
              "w": 95,
              "x": 2155,
              "y": 634
            },
            "label": "财务会计L2",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 28,
              "w": 95,
              "x": 2254,
              "y": 634
            },
            "label": "应收专员L2",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 28,
              "w": 95,
              "x": 2354,
              "y": 634
            },
            "label": "成本会计L2",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 28,
              "w": 95,
              "x": 2031,
              "y": 667
            },
            "label": "资金经理L2",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 28,
              "w": 69,
              "x": 2131,
              "y": 667
            },
            "label": "出纳L1",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 28,
              "w": 117,
              "x": 2204,
              "y": 667
            },
            "label": "成本核算经理L1",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 28,
              "w": 117,
              "x": 2325,
              "y": 667
            },
            "label": "财务分析经理L1",
            "disabled": false
          }
        ]
      },
      "devicePixelRatio": 1.600000023841858
    },
    "localEvidence": {
      "localAttachmentPaths": [
        "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260718-192908/BUG-20260718-0004/attachments/01-1784344473306-143ce004.png"
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
    "approvedAt": "2026-07-18T03:15:05.136Z",
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

- /Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260718-192908/BUG-20260718-0004/attachments/01-1784344473306-143ce004.png
