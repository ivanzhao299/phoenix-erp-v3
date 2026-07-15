# Bug Repair Agent Contract

Source bug: BUG-20260715-0003
Source repair task: BUGTASK-20260715-0003
Assigned agent: A4-Frontend-UAT-Smoke

## Issue

采购订单界面加“采购订单ID”字段

## Route

/procurement2/orders/new

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "bugNo": "BUG-20260715-0003",
  "taskNo": "BUGTASK-20260715-0003",
  "title": "采购订单界面加“采购订单ID”字段",
  "description": "",
  "route": "/procurement2/orders/new",
  "url": "https://erp.eggslao.com/procurement2/orders/new",
  "priority": "P2",
  "severity": "MEDIUM",
  "moduleCode": "",
  "acceptanceCriteria": "在采购订单界面，在采购订单号前边加一列“采购订单ID”，在采购订单就可以查询到采购订单ID了",
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
        "sha256": "cfa16faf16ccc68943eff9f672db989c96b780b62a1e1065e99cb1d90af3e8d5",
        "fileName": "01-1784098989114-b9bff01c.png",
        "mimeType": "image/png",
        "sizeBytes": 459621,
        "originalName": "pasted-screenshot-1784098961382-1.png",
        "relativePath": "storage/bug-reports/2026/07/15/BUG-20260715-0003/01-1784098989114-b9bff01c.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260715-0003/attachments/01-1784098989114-b9bff01c.png"
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
      "capturedAt": "2026-07-15T07:03:09.115Z",
      "pageSnapshot": {
        "route": "/procurement2/orders/new",
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
          "采购看板",
          "供应商档案",
          "采购项目",
          "采购申请",
          "采购订单",
          "物流管理",
          "收货管理",
          "付款管理",
          "股东资金",
          "历史初始化",
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
          "备份策略",
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
          "pasted-screenshot-1784098961382-1.png",
          "退出",
          "/采购订单",
          "/",
          "/新建",
          "新建",
          "新建采购订单",
          "·采购订单 · 填写后保存为草稿，再提交审批",
          "·",
          "采购主题 *",
          "公司 *",
          "项目",
          "供应商 *",
          "采购类型",
          "货币",
          "期望到货日",
          "付款截止日",
          "跨境采购",
          "合同号",
          "合同附件",
          "流程：上传 → 识别 → 勾选审核 → 回填原字段 → 人工保存。",
          "合同摘要",
          "备注",
          "采购明细（3 行）",
          "物料名称支持快速搜索；未找到可直接新建，并自动带回规格、单位。",
          "物料名称 *",
          "规格",
          "数量 *",
          "单位",
          "单价 *",
          "小计",
          "仓库",
          "—",
          "加载中… 孟赛农场鸡蛋暂存仓（LPH_MS_EGG_FARM） 孟赛鸡蛋销售成品仓（LPH_MS_EGG_SALES） 孟赛饲料仓（LPH_MS_FEED） 孟赛包装成品仓（LPH_MS_FINISHED） 孟赛药品/疫苗仓（LPH_MS_MEDICINE） 孟赛采购到货仓（LPH_MS_PURCHASE） 孟赛原料/",
          "合计（LAK）",
          "0"
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
            "path": ".sidebar-module__C8A-ya__groupHeader.",
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
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
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
              "w": 215,
              "x": 0,
              "y": 308
            },
            "label": "全链追溯",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.sidebar-module__C8A-ya__groupActive",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 346
            },
            "label": "采购管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 384
            },
            "label": "采购看板",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 416
            },
            "label": "供应商档案",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 448
            },
            "label": "采购项目",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 480
            },
            "label": "采购申请",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.sidebar-module__C8A-ya__subActive",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 512
            },
            "label": "采购订单",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 544
            },
            "label": "物流管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 576
            },
            "label": "收货管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 608
            },
            "label": "付款管理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 640
            },
            "label": "股东资金",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 672
            },
            "label": "历史初始化",
            "disabled": false
          },
          {
            "tag": "div",
            "path": ".sidebar-module__C8A-ya__groupHeader.",
            "rect": {
              "h": 38,
              "w": 215,
              "x": 0,
              "y": 704
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
              "y": 742
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
              "y": 780
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
              "y": 818
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
              "y": 856
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
              "y": 894
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
              "y": 932
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
              "y": 970
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
              "y": 1008
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
              "x": 967,
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
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 37,
              "w": 1180,
              "x": 518,
              "y": 206
            },
            "label": "采购主题",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".phx-select",
            "rect": {
              "h": 38,
              "w": 582,
              "x": 518,
              "y": 286
            },
            "label": "加载中… 老挝凤凰农业发展有限公司 老挝凤凰食品集团有限公司 老挝东鹏县星驰农业发展有限公司",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".phx-select",
            "rect": {
              "h": 38,
              "w": 582,
              "x": 1115,
              "y": 286
            },
            "label": "加载中… 测试项目（PRJ-001） 东鹏蛋鸡场经营项目（PRJ_DONGPENG_LAYER） 孟赛蛋鸡场经营项目（PRJ_MENGSAI_LAYER） 万象食品综合项目（PRJ_VIENTIANE_FOOD）",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".phx-select",
            "rect": {
              "h": 38,
              "w": 582,
              "x": 518,
              "y": 405
            },
            "label": "加载中… 鞠德清（中粮）（LJ-S-006） 张鹏（装修工程）（SUP-00002） 罗成松（SUP-00003） 202600708测试（SUP-00005） 中粮（鞠德清）（SUP-COFCO-001） 高远（SUP-GAOY-001） 海总（SUP-HAIZ-001） 湖北艾格多饲料有限公司（SUP-HBAGD-",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".phx-select",
            "rect": {
              "h": 38,
              "w": 582,
              "x": 1115,
              "y": 405
            },
            "label": "原料 设备 服务 固定资产 装修/工程 其他",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".phx-select",
            "rect": {
              "h": 38,
              "w": 582,
              "x": 518,
              "y": 486
            },
            "label": "人民币 老挝基普 泰铢 美元 越南盾",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 13,
              "w": 13,
              "x": 518,
              "y": 665
            },
            "label": "on",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 37,
              "w": 582,
              "x": 518,
              "y": 752
            },
            "label": "CT2-...",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 35,
              "w": 343,
              "x": 1115,
              "y": 752
            },
            "label": "上传合同/报价/图片（可多个，PDF/图片 ≤15MB）",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 32,
              "w": 88,
              "x": 1467,
              "y": 754
            },
            "label": "即时拍照",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 32,
              "w": 64,
              "x": 1563,
              "y": 754
            },
            "label": "设备",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 34,
              "w": 77,
              "x": 1612,
              "y": 803
            },
            "label": "开始识别",
            "disabled": true
          },
          {
            "tag": "textarea",
            "path": ".admin-ui-module__B-1PDG__textarea.admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 80,
              "w": 582,
              "x": 518,
              "y": 914
            },
            "label": "选填：合同关键条款摘要（金额/账期/交付等）",
            "disabled": false
          },
          {
            "tag": "textarea",
            "path": ".admin-ui-module__B-1PDG__textarea.admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 80,
              "w": 582,
              "x": 1115,
              "y": 914
            },
            "label": "选填：补充说明",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 25,
              "w": 84,
              "x": 1613,
              "y": 1021
            },
            "label": "+ 添加行",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 25,
              "w": 263,
              "x": 524,
              "y": 1128
            },
            "label": "搜索或新建物料",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 30,
              "w": 80,
              "x": 799,
              "y": 1126
            },
            "label": "由物料自动带出",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 30,
              "w": 50,
              "x": 1025,
              "y": 1126
            },
            "label": "单位",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".phx-select",
            "rect": {
              "h": 38,
              "w": 381,
              "x": 1282,
              "y": 1122
            },
            "label": "加载中… 孟赛农场鸡蛋暂存仓（LPH_MS_EGG_FARM） 孟赛鸡蛋销售成品仓（LPH_MS_EGG_SALES） 孟赛饲料仓（LPH_MS_FEED） 孟赛包装成品仓（LPH_MS_FINISHED） 孟赛药品/疫苗仓（LPH_MS_MEDICINE） 孟赛采购到货仓（LPH_MS_PURCHASE） 孟赛原料/",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 25,
              "w": 263,
              "x": 524,
              "y": 1175
            },
            "label": "搜索或新建物料",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 30,
              "w": 80,
              "x": 799,
              "y": 1172
            },
            "label": "由物料自动带出",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 30,
              "w": 50,
              "x": 1025,
              "y": 1172
            },
            "label": "单位",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".phx-select",
            "rect": {
              "h": 38,
              "w": 381,
              "x": 1282,
              "y": 1168
            },
            "label": "加载中… 孟赛农场鸡蛋暂存仓（LPH_MS_EGG_FARM） 孟赛鸡蛋销售成品仓（LPH_MS_EGG_SALES） 孟赛饲料仓（LPH_MS_FEED） 孟赛包装成品仓（LPH_MS_FINISHED） 孟赛药品/疫苗仓（LPH_MS_MEDICINE） 孟赛采购到货仓（LPH_MS_PURCHASE） 孟赛原料/",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 25,
              "w": 263,
              "x": 524,
              "y": 1221
            },
            "label": "搜索或新建物料",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 30,
              "w": 80,
              "x": 799,
              "y": 1219
            },
            "label": "由物料自动带出",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 30,
              "w": 50,
              "x": 1025,
              "y": 1219
            },
            "label": "单位",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".phx-select",
            "rect": {
              "h": 38,
              "w": 381,
              "x": 1282,
              "y": 1215
            },
            "label": "加载中… 孟赛农场鸡蛋暂存仓（LPH_MS_EGG_FARM） 孟赛鸡蛋销售成品仓（LPH_MS_EGG_SALES） 孟赛饲料仓（LPH_MS_FEED） 孟赛包装成品仓（LPH_MS_FINISHED） 孟赛药品/疫苗仓（LPH_MS_MEDICINE） 孟赛采购到货仓（LPH_MS_PURCHASE） 孟赛原料/",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 39,
              "w": 83,
              "x": 1496,
              "y": 1009
            },
            "label": "返回",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnPrimary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 39,
              "w": 108,
              "x": 1590,
              "y": 1009
            },
            "label": "保存草稿",
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
    "approvedAt": "2026-07-15T07:03:32.012Z",
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

- No local attachment downloaded. If screenshot evidence is required, HOLD and request evidence sync.
