# Bug Repair Agent Contract

Source bug: BUG-20260708-0005
Source repair task: BUGTASK-20260708-0005
Assigned agent: A1-CI-Runtime-Gate

## Issue

销售管理-客户管理，

## Route

/sales2/customers

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "url": "https://erp.eggslao.com/sales2/customers",
  "bugNo": "BUG-20260708-0005",
  "route": "/sales2/customers",
  "title": "销售管理-客户管理，",
  "taskNo": "BUGTASK-20260708-0005",
  "context": {
    "attachments": [
      {
        "sha256": "71760ecd2c873c3943c3fccdd5bf9385529aac0e40b261bcd2a49c01c31cc8ed",
        "fileName": "01-1783495029417-1f3996f4.png",
        "mimeType": "image/png",
        "sizeBytes": 591332,
        "originalName": "pasted-screenshot-1783495023020-1.png",
        "relativePath": "storage/bug-reports/2026/07/08/BUG-20260708-0005/01-1783495029417-1f3996f4.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260708-0005/attachments/01-1783495029417-1f3996f4.png"
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
      "capturedAt": "2026-07-08T07:17:09.418Z",
      "pageSnapshot": {
        "route": "/sales2/customers",
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
          "全链追溯",
          "采购管理",
          "销售管理",
          "销售总览",
          "客户管理",
          "渠道管理",
          "价格管理",
          "销售订单",
          "配送管理",
          "退货管理",
          "信用管理",
          "直营店收银",
          "统一收款",
          "门店工作台",
          "收货验收",
          "门店库存",
          "补货申请",
          "损耗记录",
          "门店日结",
          "鸡蛋库存",
          "销售分析",
          "财务结算中心",
          "股东权益中心",
          "审批中心",
          "经营分析",
          "主数据中心",
          "系统设置",
          "验收试运行",
          "系统运维",
          "个人中心 / 修改密码",
          "供应商档案",
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
          "pasted-screenshot-1783495023020-1.png",
          "退出",
          "销售系统",
          "/客户档案",
          "/",
          "客户档案",
          "·统一客户主档 · 渠道管理 · 按公司隔离数据",
          "·",
          "客户编号",
          "客户名称",
          "类型",
          "渠道",
          "信用额度",
          "已用额度",
          "账期",
          "风险",
          "状态",
          "操作",
          "CUS-00002",
          "测试客户2",
          "经销商",
          "0",
          "0天",
          "正常",
          "编辑 冻结 黑名单",
          "CUS-00001",
          "测试客户1",
          "直营店",
          "—",
          "黑名单",
          "编辑",
          "LJ-C-106",
          "丰沙里小青",
          "散客零售",
          "LJ-C-013",
          "磨丁",
          "LJ-C-130",
          "波利坎赛直营店",
          "LJ-C-006",
          "东鹏直营店",
          "LJ-C-122",
          "东鹏(凤凰客户)",
          "LJ-C-001",
          "特区直营店",
          "LJ-C-014",
          "南塔",
          "LJ-C-012",
          "沙耶武里直营店",
          "LJ-C-007",
          "会晒直营店",
          "CUS_VTE_LB",
          "万象刘彬",
          "WHOLESALE",
          "CUS_DP_HX",
          "东鹏（会晒）",
          "CUS_FSL",
          "风沙里文代",
          "CUS_SY",
          "沙耶武里",
          "CUS_MS_STORE",
          "孟赛直营店",
          "STORE",
          "CUS_MH_AF",
          "蒙混阿峰",
          "CUS_LB_STORE",
          "拉邦直营店",
          "CUS_BLK_STORE",
          "波利坎赛合营店",
          "CUS_MH_PP",
          "蒙混胖胖",
          "共 87 条"
        ],
        "interactiveElements": [
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
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
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 271
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
              "y": 309
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
              "y": 347
            },
            "label": "采购管理",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.sidebar-module__C8A-ya__groupActive",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 385
            },
            "label": "销售管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.sidebar-module__C8A-ya__subActive",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 423
            },
            "label": "销售总览",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.sidebar-module__C8A-ya__subActive",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 455
            },
            "label": "客户管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 487
            },
            "label": "渠道管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 519
            },
            "label": "价格管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 551
            },
            "label": "销售订单",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 583
            },
            "label": "配送管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 615
            },
            "label": "退货管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 647
            },
            "label": "信用管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 679
            },
            "label": "直营店收银",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 711
            },
            "label": "统一收款",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 743
            },
            "label": "门店工作台",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 775
            },
            "label": "收货验收",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 807
            },
            "label": "门店库存",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 839
            },
            "label": "补货申请",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 871
            },
            "label": "损耗记录",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 903
            },
            "label": "门店日结",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 935
            },
            "label": "鸡蛋库存",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 967
            },
            "label": "销售分析",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 999
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
              "y": 1037
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
              "y": 1075
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
              "y": 1113
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
              "y": 1151
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
              "y": 1189
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
              "y": 1227
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
              "y": 1265
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
            "label": "在线 2",
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
              "x": 770,
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
            "path": "",
            "rect": {
              "h": 38,
              "w": 104,
              "x": 244,
              "y": 145
            },
            "label": "客户主档",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 38,
              "w": 104,
              "x": 352,
              "y": 145
            },
            "label": "渠道管理",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 38,
              "w": 104,
              "x": 460,
              "y": 145
            },
            "label": "信用概览",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 34,
              "w": 844,
              "x": 244,
              "y": 203
            },
            "label": "搜索客户名称 / 编号 / 联系人…",
            "disabled": false
          },
          {
            "tag": "select",
            "path": "",
            "rect": {
              "h": 34,
              "w": 94,
              "x": 1098,
              "y": 203
            },
            "label": "全部类型 直营店 经销商 代理商 大客户 散客零售",
            "disabled": false
          },
          {
            "tag": "select",
            "path": "",
            "rect": {
              "h": 34,
              "w": 94,
              "x": 1202,
              "y": 203
            },
            "label": "全部状态 正常 冻结 黑名单",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 34,
              "w": 83,
              "x": 1306,
              "y": 203
            },
            "label": "刷新",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".admin-ui-module__B-1PDG__btnPrimary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 34,
              "w": 172,
              "x": 1399,
              "y": 203
            },
            "label": "前往主数据中心新增",
            "disabled": false
          },
          {
            "tag": "a",
            "path": "",
            "rect": {
              "h": 15,
              "w": 63,
              "x": 438,
              "y": 263
            },
            "label": "主数据中心",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 23,
              "w": 40,
              "x": 1352,
              "y": 361
            },
            "label": "编辑",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 23,
              "w": 40,
              "x": 1396,
              "y": 361
            },
            "label": "冻结",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 23,
              "w": 51,
              "x": 1440,
              "y": 361
            },
            "label": "黑名单",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 23,
              "w": 40,
              "x": 1352,
              "y": 402
            },
            "label": "编辑",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 23,
              "w": 40,
              "x": 1352,
              "y": 444
            },
            "label": "编辑",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 23,
              "w": 40,
              "x": 1396,
              "y": 444
            },
            "label": "冻结",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 23,
              "w": 51,
              "x": 1440,
              "y": 444
            },
            "label": "黑名单",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 23,
              "w": 40,
              "x": 1352,
              "y": 485
            },
            "label": "编辑",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 23,
              "w": 40,
              "x": 1396,
              "y": 485
            },
            "label": "冻结",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 23,
              "w": 51,
              "x": 1440,
              "y": 485
            },
            "label": "黑名单",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 23,
              "w": 40,
              "x": 1352,
              "y": 527
            },
            "label": "编辑",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 23,
              "w": 40,
              "x": 1396,
              "y": 527
            },
            "label": "冻结",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 23,
              "w": 51,
              "x": 1440,
              "y": 527
            },
            "label": "黑名单",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 23,
              "w": 40,
              "x": 1352,
              "y": 568
            },
            "label": "编辑",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 23,
              "w": 40,
              "x": 1396,
              "y": 568
            },
            "label": "冻结",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 23,
              "w": 51,
              "x": 1440,
              "y": 568
            },
            "label": "黑名单",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 23,
              "w": 40,
              "x": 1352,
              "y": 610
            },
            "label": "编辑",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 23,
              "w": 40,
              "x": 1396,
              "y": 610
            },
            "label": "冻结",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 23,
              "w": 51,
              "x": 1440,
              "y": 610
            },
            "label": "黑名单",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 23,
              "w": 40,
              "x": 1352,
              "y": 651
            },
            "label": "编辑",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 23,
              "w": 40,
              "x": 1396,
              "y": 651
            },
            "label": "冻结",
            "disabled": false
          }
        ]
      },
      "devicePixelRatio": 2
    },
    "consoleErrors": [
      {
        "type": "unhandledrejection",
        "stack": "Error: 黑名单客户不可编辑，请先解除黑名单\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929",
        "message": "黑名单客户不可编辑，请先解除黑名单",
        "timestamp": "2026-07-08T07:07:23.854Z"
      },
      {
        "type": "unhandledrejection",
        "stack": "Error: 黑名单客户不可编辑，请先解除黑名单\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929",
        "message": "黑名单客户不可编辑，请先解除黑名单",
        "timestamp": "2026-07-08T07:07:26.257Z"
      },
      {
        "type": "unhandledrejection",
        "stack": "Error: 黑名单客户不可编辑，请先解除黑名单\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929",
        "message": "黑名单客户不可编辑，请先解除黑名单",
        "timestamp": "2026-07-08T07:07:28.459Z"
      },
      {
        "type": "unhandledrejection",
        "stack": "Error: 黑名单客户不可编辑，请先解除黑名单\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929",
        "message": "黑名单客户不可编辑，请先解除黑名单",
        "timestamp": "2026-07-08T07:07:39.445Z"
      },
      {
        "type": "unhandledrejection",
        "stack": "Error: 黑名单客户不可编辑，请先解除黑名单\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929",
        "message": "黑名单客户不可编辑，请先解除黑名单",
        "timestamp": "2026-07-08T07:07:44.870Z"
      },
      {
        "type": "unhandledrejection",
        "stack": "Error: 黑名单客户不可编辑，请先解除黑名单\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929",
        "message": "黑名单客户不可编辑，请先解除黑名单",
        "timestamp": "2026-07-08T07:07:48.284Z"
      },
      {
        "type": "unhandledrejection",
        "stack": "Error: 黑名单客户不可编辑，请先解除黑名单\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929",
        "message": "黑名单客户不可编辑，请先解除黑名单",
        "timestamp": "2026-07-08T07:07:52.967Z"
      },
      {
        "type": "unhandledrejection",
        "stack": "Error: 黑名单客户不可编辑，请先解除黑名单\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929",
        "message": "黑名单客户不可编辑，请先解除黑名单",
        "timestamp": "2026-07-08T07:08:03.390Z"
      },
      {
        "type": "unhandledrejection",
        "stack": "Error: 黑名单客户不可编辑，请先解除黑名单\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929",
        "message": "黑名单客户不可编辑，请先解除黑名单",
        "timestamp": "2026-07-08T07:08:22.689Z"
      },
      {
        "type": "unhandledrejection",
        "stack": "Error: 黑名单客户不可编辑，请先解除黑名单\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929",
        "message": "黑名单客户不可编辑，请先解除黑名单",
        "timestamp": "2026-07-08T07:08:23.770Z"
      },
      {
        "type": "unhandledrejection",
        "stack": "Error: 黑名单客户不可编辑，请先解除黑名单\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929",
        "message": "黑名单客户不可编辑，请先解除黑名单",
        "timestamp": "2026-07-08T07:08:24.378Z"
      },
      {
        "type": "unhandledrejection",
        "stack": "Error: 黑名单客户不可编辑，请先解除黑名单\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929",
        "message": "黑名单客户不可编辑，请先解除黑名单",
        "timestamp": "2026-07-08T07:08:25.141Z"
      },
      {
        "type": "unhandledrejection",
        "stack": "Error: 黑名单客户不可编辑，请先解除黑名单\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929",
        "message": "黑名单客户不可编辑，请先解除黑名单",
        "timestamp": "2026-07-08T07:10:32.408Z"
      },
      {
        "type": "unhandledrejection",
        "stack": "Error: 黑名单客户不可编辑，请先解除黑名单\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929",
        "message": "黑名单客户不可编辑，请先解除黑名单",
        "timestamp": "2026-07-08T07:11:36.402Z"
      },
      {
        "type": "unhandledrejection",
        "stack": "Error: 黑名单客户不可编辑，请先解除黑名单\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929",
        "message": "黑名单客户不可编辑，请先解除黑名单",
        "timestamp": "2026-07-08T07:11:44.765Z"
      },
      {
        "type": "unhandledrejection",
        "stack": "Error: 黑名单客户不可编辑，请先解除黑名单\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929",
        "message": "黑名单客户不可编辑，请先解除黑名单",
        "timestamp": "2026-07-08T07:12:06.662Z"
      },
      {
        "type": "unhandledrejection",
        "stack": "Error: 黑名单客户不可编辑，请先解除黑名单\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929",
        "message": "黑名单客户不可编辑，请先解除黑名单",
        "timestamp": "2026-07-08T07:12:07.571Z"
      },
      {
        "type": "unhandledrejection",
        "stack": "Error: 黑名单客户不可编辑，请先解除黑名单\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929",
        "message": "黑名单客户不可编辑，请先解除黑名单",
        "timestamp": "2026-07-08T07:12:11.059Z"
      }
    ],
    "failedRequests": [
      {
        "url": "/api/v2/sales/customers/10951",
        "method": "PATCH",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-08T07:07:23.852Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/v2/sales/customers/10951",
        "method": "PATCH",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-08T07:07:26.254Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/v2/sales/customers/10951",
        "method": "PATCH",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-08T07:07:28.457Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/v2/sales/customers/10951",
        "method": "PATCH",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-08T07:07:39.444Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/v2/sales/customers/10951",
        "method": "PATCH",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-08T07:07:44.869Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/v2/sales/customers/10951",
        "method": "PATCH",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-08T07:07:48.282Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/v2/sales/customers/10951",
        "method": "PATCH",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-08T07:07:52.965Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/v2/sales/customers/10951",
        "method": "PATCH",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-08T07:08:03.387Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/v2/sales/customers/10951",
        "method": "PATCH",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-08T07:08:22.687Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/v2/sales/customers/10951",
        "method": "PATCH",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-08T07:08:23.769Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/v2/sales/customers/10951",
        "method": "PATCH",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-08T07:08:24.376Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/v2/sales/customers/10951",
        "method": "PATCH",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-08T07:08:25.140Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/v2/sales/customers/10951",
        "method": "PATCH",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-08T07:10:32.406Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/v2/sales/customers/10951",
        "method": "PATCH",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-08T07:11:36.400Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/v2/sales/customers/10951",
        "method": "PATCH",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-08T07:11:44.764Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/v2/sales/customers/10951",
        "method": "PATCH",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-08T07:12:06.660Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/v2/sales/customers/10951",
        "method": "PATCH",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-08T07:12:07.569Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/v2/sales/customers/10951",
        "method": "PATCH",
        "status": 403,
        "requestId": "",
        "timestamp": "2026-07-08T07:12:11.058Z",
        "responseExcerpt": "{\"code\":403,\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"error\":\"Forbidden\",\"statusCode\":403}"
      },
      {
        "url": "/api/system/online-count",
        "method": "GET",
        "status": 502,
        "requestId": "",
        "timestamp": "2026-07-08T07:13:55.183Z",
        "responseExcerpt": "<html>\r\n<head><title>502 Bad Gateway</title></head>\r\n<body>\r\n<center><h1>502 Bad Gateway</h1></center>\r\n<hr><center>nginx</center>\r\n</body>\r\n</html>\r\n<!-- a padding to disable MSIE and Chrome friendly error page -->\r\n<!-- a padding to disable MSIE and Chrome friendly error page -->\r\n<!-- a padding to disable MSIE and Chrome friendly error page -->\r\n<!-- a padding to disable MSIE and Chrome friendly error page -->\r\n<!-- a padding to disable MSIE and Chrome friendly error page -->\r\n<!-- a padding to disable MSIE and Chrome friendly error page -->\r\n"
      },
      {
        "url": "/api/notifications/unread-count",
        "method": "GET",
        "status": 502,
        "requestId": "",
        "timestamp": "2026-07-08T07:13:55.183Z",
        "responseExcerpt": "<html>\r\n<head><title>502 Bad Gateway</title></head>\r\n<body>\r\n<center><h1>502 Bad Gateway</h1></center>\r\n<hr><center>nginx</center>\r\n</body>\r\n</html>\r\n<!-- a padding to disable MSIE and Chrome friendly error page -->\r\n<!-- a padding to disable MSIE and Chrome friendly error page -->\r\n<!-- a padding to disable MSIE and Chrome friendly error page -->\r\n<!-- a padding to disable MSIE and Chrome friendly error page -->\r\n<!-- a padding to disable MSIE and Chrome friendly error page -->\r\n<!-- a padding to disable MSIE and Chrome friendly error page -->\r\n"
      }
    ],
    "localEvidence": {
      "localAttachments": [
        {
          "fileName": "01-1783495029417-1f3996f4.png",
          "originalName": "pasted-screenshot-1783495023020-1.png",
          "mimeType": "image/png",
          "sourceEndpoint": "/api/bug-intake/reports/BUG-20260708-0005/attachments/01-1783495029417-1f3996f4.png",
          "localPath": "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260708-152519/BUG-20260708-0005/attachments/01-1783495029417-1f3996f4.png",
          "sizeBytes": 591332
        }
      ],
      "localAttachmentPaths": [
        "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260708-152519/BUG-20260708-0005/attachments/01-1783495029417-1f3996f4.png"
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
    "source_bug_no": "BUG-20260708-0005",
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
    "source_repair_task_no": "BUGTASK-20260708-0005"
  },
  "createdAt": "2026-07-08T07:18:02.505Z",
  "createdBy": "admin",
  "moduleCode": "____",
  "suggestedOwner": "_____",
  "repairGuardrails": {
    "autoRepairExecuted": false,
    "noProductionDeploy": true,
    "noDbWriteWithoutGate": true,
    "requiresHumanApproval": true
  },
  "acceptanceCriteria": "要求在编辑页面添加状态下拉框，状态和风险等级保存时都可成功",
  "agentPlanGeneratedAt": "2026-07-08T07:18:03.581Z",
  "agentPlanGeneratedBy": "admin",
  "agentExecutionApproval": {
    "approved": true,
    "approvedAt": "2026-07-08T07:18:05.609Z",
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

- /Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260708-152519/BUG-20260708-0005/attachments/01-1783495029417-1f3996f4.png
