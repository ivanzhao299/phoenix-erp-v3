# Bug Repair Agent Contract

Source bug: BUG-20260707-0005
Source repair task: BUGTASK-20260707-0005
Assigned agent: A1-CI-Runtime-Gate

## Issue

日生产日报不选择鸡舍也能提交成功

## Route

/breeding/daily

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "url": "https://erp.eggslao.com/breeding/daily?action=create&date=today",
  "bugNo": "BUG-20260707-0005",
  "route": "/breeding/daily",
  "title": "日生产日报不选择鸡舍也能提交成功",
  "taskNo": "BUGTASK-20260707-0005",
  "context": {
    "attachments": [
      {
        "sha256": "f961c9036b46e2752abecf44d62b5ab3833fd389fac552159dceda6e5f880f77",
        "fileName": "01-1783385890768-eec55765.png",
        "mimeType": "image/png",
        "sizeBytes": 841957,
        "originalName": "pasted-screenshot-1783385734893-1.png",
        "relativePath": "storage/bug-reports/2026/07/07/BUG-20260707-0005/01-1783385890768-eec55765.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260707-0005/attachments/01-1783385890768-eec55765.png"
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
      "capturedAt": "2026-07-07T00:58:10.770Z",
      "pageSnapshot": {
        "route": "/breeding/daily",
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
          "🖥️ 进入包装作业台",
          "养殖总览",
          "鸡舍管理",
          "鸡群档案",
          "日生产日报",
          "免疫计划",
          "用药记录",
          "设备监控",
          "环境预警",
          "设备运维",
          "日产蛋入库",
          "包装作业",
          "包装批次",
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
          "pasted-screenshot-1783385734893-1.png",
          "退出",
          "养殖管理",
          "/日生产日报",
          "/",
          "日生产日报录入",
          "·按班次录入当日生产数据",
          "·",
          "日期",
          "鸡舍",
          "羽",
          "枚",
          "%",
          "kg",
          "班次数据录入",
          "早班",
          "产蛋数(枚)",
          "🟡 脏蛋(枚)",
          "🔴 破损蛋(枚)",
          "自用蛋(枚)",
          "死亡(羽)",
          "死亡原因",
          "淘汰(羽)",
          "淘汰原因",
          "饲料(kg)",
          "用水(L)",
          "温度(℃)",
          "湿度(%)",
          "备注",
          "晚班",
          "近期日报记录",
          "产蛋数",
          "脏蛋",
          "破损蛋",
          "死亡",
          "淘汰",
          "温度",
          "湿度",
          "2026-07-07T00:00:00.000Z",
          "未知",
          "210",
          "1",
          "INJURY",
          "10.00",
          "30.00℃",
          "28.00%",
          "晚班测试",
          "10",
          "SICKNESS",
          "白班测试",
          "2026-07-06T00:00:00.000Z",
          "测试鸡舍2",
          "5",
          "LOW_PRODUCTION",
          "36.00℃",
          "30.00%",
          "鸡舍2晚班测试",
          "AGE",
          "鸡舍2早班测试",
          "测试鸡舍",
          "11",
          "1.00",
          "37.00℃",
          "31.00%",
          "早班测试",
          "9",
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
            "path": ".sidebar-module__C8A-ya__groupHeader.sidebar-module__C8A-ya__groupActive",
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
            "tag": "a",
            "path": "",
            "rect": {
              "h": 38,
              "w": 199,
              "x": 8,
              "y": 277
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
              "y": 317
            },
            "label": "养殖总览",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 349
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
              "y": 381
            },
            "label": "鸡群档案",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.sidebar-module__C8A-ya__subActive",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 413
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
              "y": 445
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
              "y": 477
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
              "y": 509
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
              "y": 541
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
              "y": 573
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
              "y": 605
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
              "y": 637
            },
            "label": "包装作业",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 669
            },
            "label": "包装批次",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 215,
              "x": 0,
              "y": 701
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
              "y": 733
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
              "y": 765
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
              "y": 797
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
              "y": 829
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
              "y": 861
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
              "y": 893
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
              "y": 925
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
              "y": 957
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
              "y": 989
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
              "y": 1021
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
              "y": 1059
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
              "y": 1097
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
              "y": 1135
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
              "y": 1173
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
              "y": 1211
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
              "y": 1249
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
              "y": 1287
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
              "y": 1325
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
              "y": 1363
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
              "y": 1401
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
              "y": 1439
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
              "x": 769,
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
              "h": 36,
              "w": 90,
              "x": 1054,
              "y": -512
            },
            "label": "历史记录",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 36,
              "w": 110,
              "x": 1154,
              "y": -512
            },
            "label": "导出报表",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 36,
              "w": 178,
              "x": 1274,
              "y": -512
            },
            "label": "⚡ 设备数据一键填入",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 36,
              "w": 109,
              "x": 1462,
              "y": -512
            },
            "label": "提交日报",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 38,
              "w": 160,
              "x": 265,
              "y": -415
            },
            "label": "2026-07-07",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".phx-select",
            "rect": {
              "h": 38,
              "w": 200,
              "x": 445,
              "y": -415
            },
            "label": "加载中… X 测试鸡舍 · 蛋鸡舍 测试鸡舍2 · 蛋鸡舍 2号鸡舍 · 蛋鸡舍 3号鸡舍 · 蛋鸡舍 4号鸡舍 · 蛋鸡舍 5号鸡舍 · 蛋鸡舍 6号鸡舍 · 蛋鸡舍",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 34,
              "w": 92,
              "x": 1447,
              "y": -261
            },
            "label": "按 9 档分级",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 291,
              "y": -159
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 602,
              "y": -159
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 914,
              "y": -159
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 1225,
              "y": -159
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 291,
              "y": -44
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".phx-select",
            "rect": {
              "h": 38,
              "w": 301,
              "x": 602,
              "y": -44
            },
            "label": "请选择 疾病 外伤 热应激 自然 不明",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 914,
              "y": -44
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".phx-select",
            "rect": {
              "h": 38,
              "w": 301,
              "x": 1225,
              "y": -44
            },
            "label": "请选择 产蛋率低 患病 老龄 严重外伤 其它",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 291,
              "y": 73
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 540,
              "y": 73
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 789,
              "y": 73
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 1038,
              "y": 73
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 160,
              "x": 1287,
              "y": 73
            },
            "label": "备注...",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 34,
              "w": 92,
              "x": 1447,
              "y": 164
            },
            "label": "按 9 档分级",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 291,
              "y": 266
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 602,
              "y": 266
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 914,
              "y": 266
            },
            "label": "0",
            "disabled": false
          },
          {
            "tag": "input",
            "path": ".admin-ui-module__B-1PDG__inp",
            "rect": {
              "h": 36,
              "w": 130,
              "x": 1225,
              "y": 266
            },
            "label": "0",
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
          "fileName": "01-1783385890768-eec55765.png",
          "originalName": "pasted-screenshot-1783385734893-1.png",
          "mimeType": "image/png",
          "sourceEndpoint": "/api/bug-intake/reports/BUG-20260707-0005/attachments/01-1783385890768-eec55765.png",
          "localPath": "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260707-090724/BUG-20260707-0005/attachments/01-1783385890768-eec55765.png",
          "sizeBytes": 841957
        }
      ],
      "localAttachmentPaths": [
        "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260707-090724/BUG-20260707-0005/attachments/01-1783385890768-eec55765.png"
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
    "source_bug_no": "BUG-20260707-0005",
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
      },
      {
        "agent": "A6-Staging-Deploy-Runbook",
        "reasons": [
          "deploy/runbook signal matched"
        ],
        "execution_mode": "dry-run-first",
        "approval_required": true
      },
      {
        "agent": "A7-Final-QA-Gate",
        "reasons": [
          "release gate signal matched"
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
      "A1-CI-Runtime-Gate",
      "A6-Staging-Deploy-Runbook",
      "A7-Final-QA-Gate"
    ],
    "hard_constraints": [
      "no automatic production deploy",
      "no automatic DB write",
      "no automatic migration",
      "human approval required before code repair execution"
    ],
    "source_repair_task_no": "BUGTASK-20260707-0005"
  },
  "createdAt": "2026-07-07T00:58:52.243Z",
  "createdBy": "admin",
  "moduleCode": "__________",
  "suggestedOwner": "_____",
  "repairGuardrails": {
    "autoRepairExecuted": false,
    "noProductionDeploy": true,
    "noDbWriteWithoutGate": true,
    "requiresHumanApproval": true
  },
  "acceptanceCriteria": "日生产日报点击”提交日报“时检查是否选择鸡舍，鸡舍显示“加载中...”就是没选择，若没选择鸡舍给一个提示“请先选择鸡舍后再提交”",
  "agentPlanGeneratedAt": "2026-07-07T00:58:53.452Z",
  "agentPlanGeneratedBy": "admin",
  "agentExecutionApproval": {
    "approved": true,
    "approvedAt": "2026-07-07T00:58:54.580Z",
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

- /Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260707-090724/BUG-20260707-0005/attachments/01-1783385890768-eec55765.png
