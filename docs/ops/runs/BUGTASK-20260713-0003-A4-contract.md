# Bug Repair Agent Contract

Source bug: BUG-20260713-0003
Source repair task: BUGTASK-20260713-0003
Assigned agent: A4-Frontend-UAT-Smoke

## Issue

采购管理-付款管理,点击确认付款报错“AP 台账 ID=11不存在”

## Route

/procurement2/payments

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "bugNo": "BUG-20260713-0003",
  "taskNo": "BUGTASK-20260713-0003",
  "title": "采购管理-付款管理,点击确认付款报错“AP 台账 ID=11不存在”",
  "description": "",
  "route": "/procurement2/payments",
  "url": "https://erp.eggslao.com/procurement2/payments",
  "priority": "P2",
  "severity": "MEDIUM",
  "moduleCode": "____",
  "acceptanceCriteria": "采购管理-付款管理,点击确认付款报错“AP 台账 ID=11不存在”",
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
        "sha256": "6b607edca750edc4b3d46e18f042da037ae0bc49e2c442e2c568c108c66bcce8",
        "fileName": "01-1783924647182-525fea5b.png",
        "mimeType": "image/png",
        "sizeBytes": 604886,
        "originalName": "pasted-screenshot-1783924635702-1.png",
        "relativePath": "storage/bug-reports/2026/07/13/BUG-20260713-0003/01-1783924647182-525fea5b.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260713-0003/attachments/01-1783924647182-525fea5b.png"
      }
    ],
    "consoleErrors": [],
    "failedRequests": [
      {
        "url": "/api/v2/procurement/payments/16/pay",
        "method": "POST",
        "status": 404,
        "requestId": "",
        "timestamp": "2026-07-13T06:32:03.413Z",
        "responseExcerpt": "{\"code\":404,\"message\":\"AP 台账 ID=11 不存在\",\"error\":\"Not Found\",\"statusCode\":404}"
      },
      {
        "url": "/api/v2/procurement/payments/16/pay",
        "method": "POST",
        "status": 404,
        "requestId": "",
        "timestamp": "2026-07-13T06:34:09.558Z",
        "responseExcerpt": "{\"code\":404,\"message\":\"AP 台账 ID=11 不存在\",\"error\":\"Not Found\",\"statusCode\":404}"
      },
      {
        "url": "/api/v2/procurement/payments/16/pay",
        "method": "POST",
        "status": 404,
        "requestId": "",
        "timestamp": "2026-07-13T06:36:55.918Z",
        "responseExcerpt": "{\"code\":404,\"message\":\"AP 台账 ID=11 不存在\",\"error\":\"Not Found\",\"statusCode\":404}"
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
      "capturedAt": "2026-07-13T06:37:27.184Z",
      "pageSnapshot": {
        "route": "/procurement2/payments",
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
          "pasted-screenshot-1783924635702-1.png",
          "退出",
          "/付款管理",
          "/",
          "·采购资金付款台账 · 共 0 条",
          "·",
          "付款日：",
          "~",
          "付款单号",
          "付款日期",
          "公司",
          "付款方",
          "付款人",
          "付款金额",
          "汇率",
          "方式",
          "状态",
          "操作",
          "PAY2-20260713-00004",
          "2026-07-13",
          "老挝凤凰农业发展有限公司",
          "CNY 20.00",
          "1.00000000",
          "银行转账",
          "已取消",
          "查看",
          "PAY2-20260713-00003",
          "已审批",
          "查看 确认付款 取消",
          "PAY2-20260713-00002",
          "CNY 10.00",
          "PAY2-20260713-00001",
          "PAY2-20260626-00001",
          "2026-06-24",
          "股东代付",
          "股东",
          "代付",
          "赵永伟",
          "CNY 37,250.00",
          "PAY2-20260622-00001",
          "2026-06-21",
          "CNY 174,154.80",
          "已付款",
          "PAY2-20260615-00010",
          "2026-06-15",
          "COMP-LAO-AGRI",
          "G151验证-临时单",
          "CNY 100.00",
          "PAY2-20260615-00009",
          "老挝凤凰食品集团有限公司",
          "CNY 36,054.00",
          "PAY2-20260615-00008",
          "PAY2-20260615-00007",
          "PAY2-20260615-00006",
          "PAY2-20260615-00005",
          "—",
          "PAY2-20260615-00004",
          "PAY2-20260615-00003",
          "刘汉涛",
          "PAY2-20260615-00002",
          "DIAG",
          "CNY 1.00",
          "PAY2-20260615-00001"
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
            "path": ".sidebar-module__C8A-ya__subItem.",
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
            "path": ".sidebar-module__C8A-ya__subItem.sidebar-module__C8A-ya__subActive",
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
              "x": 1342,
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
              "w": 94,
              "x": 1497,
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
              "x": 968,
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
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 39,
              "w": 83,
              "x": 1759,
              "y": 85
            },
            "label": "刷新",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".admin-ui-module__B-1PDG__btnPrimary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 39,
              "w": 121,
              "x": 1850,
              "y": 85
            },
            "label": "新建付款单",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 37,
              "w": 1038,
              "x": 244,
              "y": 145
            },
            "label": "付款单号 / 付款人 / 备注",
            "disabled": false
          },
          {
            "tag": "select",
            "path": "",
            "rect": {
              "h": 34,
              "w": 101,
              "x": 1290,
              "y": 147
            },
            "label": "全部状态 草稿 待审批 待审批 已审批 已付款 已驳回 已取消",
            "disabled": false
          },
          {
            "tag": "select",
            "path": "",
            "rect": {
              "h": 34,
              "w": 113,
              "x": 1399,
              "y": 147
            },
            "label": "全部付款方 公司 股东 借款 内部",
            "disabled": false
          },
          {
            "tag": "select",
            "path": "",
            "rect": {
              "h": 34,
              "w": 101,
              "x": 1520,
              "y": 147
            },
            "label": "全部币种 CNY LAK THB USD",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1820,
              "y": 257
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1820,
              "y": 312
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 69,
              "x": 1872,
              "y": 312
            },
            "label": "确认付款",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1820,
              "y": 345
            },
            "label": "取消",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1820,
              "y": 400
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1820,
              "y": 455
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1820,
              "y": 510
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 69,
              "x": 1872,
              "y": 510
            },
            "label": "确认付款",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1820,
              "y": 542
            },
            "label": "取消",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1820,
              "y": 597
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1820,
              "y": 652
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1820,
              "y": 708
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1820,
              "y": 763
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1820,
              "y": 818
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1820,
              "y": 873
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1820,
              "y": 928
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1820,
              "y": 983
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1820,
              "y": 1038
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1820,
              "y": 1093
            },
            "label": "查看",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 26,
              "w": 45,
              "x": 1820,
              "y": 1148
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
              "x": 2628,
              "y": 16
            },
            "label": "关闭抽屉",
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
    "approvedAt": "2026-07-16T01:04:37.678Z",
    "approvedBy": "admin",
    "redispatch": true,
    "approvalScope": "仅允许按当前 Agent 修复计划写入本地任务队列；不自动部署、不写数据库、不执行 migration。",
    "redispatchCount": 4,
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
