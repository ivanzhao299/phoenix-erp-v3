# Bug Repair Agent Contract

Source bug: BUG-20260713-0002
Source repair task: BUGTASK-20260713-0002
Assigned agent: A3-Backend-Critical-Path

## Issue

价格册启用

## Route

/bug-reports

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "bugNo": "BUG-20260713-0002",
  "taskNo": "BUGTASK-20260713-0002",
  "title": "价格册启用",
  "description": "",
  "route": "/bug-reports",
  "url": "https://erp.eggslao.com/bug-reports",
  "priority": "P2",
  "severity": "MEDIUM",
  "moduleCode": "____",
  "acceptanceCriteria": "将价格册名称为“孟赛标准价格册（试运行版）”恢复启用状态，将价格册名称为”孟赛标准价格册（试运行版）重建“删除掉",
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
        "sha256": "068dc9ebd1928e9cfcbad3584a3f0dfbf68dcfd9b8e2e8d28441499edb77b254",
        "fileName": "01-1783923903083-246be9eb.png",
        "mimeType": "image/png",
        "sizeBytes": 318225,
        "originalName": "pasted-screenshot-1783923856447-1.png",
        "relativePath": "storage/bug-reports/2026/07/13/BUG-20260713-0002/01-1783923903083-246be9eb.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260713-0002/attachments/01-1783923903083-246be9eb.png"
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
      "capturedAt": "2026-07-13T06:25:03.084Z",
      "pageSnapshot": {
        "route": "/bug-reports",
        "title": "金凤凰数字运营管理平台",
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
          "系统健康",
          "告警中心",
          "错误日志",
          "问题反馈",
          "配置治理",
          "备份策略",
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
          "pasted-screenshot-1783923856447-1.png",
          "退出",
          "·Bug Intake 台账 · 用户页面提报 + 自动上下文采集 · 共 0 条",
          "·",
          "AI 修复流水线运行面板",
          "失败自动分类、超时自恢复、HOLD 分派候选、告警通知统一看这里。",
          "队列可见项：16",
          "执行中：1 · 待 Runner 领取：0",
          "已有修复产物：16",
          "可自动恢复：3 · 健康分：89",
          "只读验证：0 · 代码修复：16",
          "发布 Gate：0 · 路由复核：0",
          "最近 Runner 结论：—",
          "最近提交：fdecce30c974f95c7dd50f17541674d2fb3fa10d",
          "HOLD",
          "当前筛选 16/16",
          "显示卡点、重试、Agent 产物和 runner 最近回写",
          "编号",
          "阶段",
          "处理分道",
          "分类：",
          "重试",
          "Agent",
          "Runner",
          "产物",
          "阻塞原因",
          "下一动作",
          "操作",
          "BUG-20260709-0004 审批中心-我的待办，审批待办中有一条未审批的记录，但是上方显示共0条",
          "HOLD 0 分钟前更新",
          "代码修复 需 Gate 后重派",
          "API_5XX 88%",
          "3 失败尝试 3 重派 8",
          "A1-CI-Runtime-Gate A2-Security-Regression-Gate / A3-Backend-Critical-Path / A4-Frontend-UAT-Smoke / A5-Data-Readiness / A1-CI-Runtime-Gate",
          "HOLD —",
          "已回写 3 个文件",
          "常规处理 Agent/Runner 最近失败 3 次",
          "人工复核后重算 Agent 计划再派发 Keep bug report in HOLD until the failed local Agent task is reviewed.",
          "重新派发原任务 重算计划并重新派发",
          "BUG-20260710-0001 运营工作台页面按钮跳转错误",
          "2 失败尝试 2 重派 10",
          "A1-CI-Runtime-Gate A4-Frontend-UAT-Smoke / A1-CI-Runtime-Gate",
          "HOLD fdecce30c974f95c7dd50f17541674d2fb3fa10d",
          "已回写 2 个文件",
          "可自动恢复 Agent/Runner 最近失败 2 次",
          "点击“重算后派发”或“重新派发”进入本地 runner Keep bug report in HOLD until the failed local Agent task is reviewed.",
          "BUG-20260711-0002 生产管理-养殖场总览-药品库存，今日入库点击提交后报错“HTTP 500”",
          "2 失败尝试 2 重派 7",
          "BUG-20260713-0001 财务结算中心-应付账款-选中新建的应收发票，没有可以付款的地方",
          "AGENT_RUNNING 0 分钟前更新",
          "未分类 —",
          "20 失败尝试 20 重派 0",
          "HOLD 754f9964737adae477d4fa8afb7be95bbf22d447",
          "已回写 4 个文件",
          "可自动恢复 本地 runner 正在执行，若超时会自动 HOLD",
          "等待 runner 回写；超时后由自动分类转 HOLD Execution evidence recorded; release and production smoke must pass before business validation.",
          "BUG-20260708-0005 销售管理-客户管理，",
          "FIX_READY_FOR_UAT 697 分钟前更新",
          "1 失败尝试 1 重派 6",
          "BugIntakeLocalRunner A4-Frontend-UAT-Smoke / A1-CI-Runtime-Gate",
          "PASS_WITH_CONDITIONS ab929741f10b1473c90f938614d015a6802be242",
          "常规处理 未发现阻塞",
          "无阻塞，等待下一轮处理 Administrator performs role-specific business UAT before RESOLVED/CLOSED.",
          "BUG-20260708-0004 库存管理-库存台账，事务类型不显示中文",
          "2 失败尝试 2 重派 4",
          "BUG-20260708-0003 物流运单没法关联采购订单",
          "PG_SQL 92%",
          "BugIntakeLocalRunner A3-Backend-Critical-Path / A4-Frontend-UAT-Smoke / A1-CI-Runtime-Gate",
          "已回写 5 个文件",
          "BUG-20260708-0001 新建入库单的界面字段跟库存查询的字段不一致",
          "3 失败尝试 3 重派 5",
          "BUG-20260707-0010 我的待办中有审批任务，但是上方显示0条",
          "RBAC_403 90%",
          "2 失败尝试 2 重派 5",
          "BUG-20260709-0002 库存业务链路没有闭环",
          "FIX_READY_FOR_UAT 700 分钟前更新",
          "0 失败尝试 0 重派 5",
          "BUG-20260708-0007 在销售订单页面右上角点击“新建订单”，填完信息后点击“保存草稿”报错“HTTP 400”",
          "BUG-20260708-0006 价格册恢复",
          "1 失败尝试 1 重派 7",
          "BugIntakeLocalRunner A3-Backend-Critical-Path / A2-Security-Regression-Gate / A1-CI-Runtime-Gate",
          "BUG-20260707-0009 养殖场总览-药品库存，今日入库提交后，库存总览还是0",
          "0 失败尝试 0 重派 6",
          "BugIntakeLocalRunner A3-Backend-Critical-Path / A1-CI-Runtime-Gate"
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
            "path": ".sidebar-module__C8A-ya__groupHeader.sidebar-module__C8A-ya__groupActive",
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
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 220,
              "x": 0,
              "y": 726
            },
            "label": "系统健康",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 220,
              "x": 0,
              "y": 758
            },
            "label": "告警中心",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 220,
              "x": 0,
              "y": 790
            },
            "label": "错误日志",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.sidebar-module__C8A-ya__subActive",
            "rect": {
              "h": 32,
              "w": 220,
              "x": 0,
              "y": 822
            },
            "label": "问题反馈",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 220,
              "x": 0,
              "y": 854
            },
            "label": "配置治理",
            "disabled": false
          },
          {
            "tag": "a",
            "path": ".sidebar-module__C8A-ya__subItem.",
            "rect": {
              "h": 32,
              "w": 220,
              "x": 0,
              "y": 886
            },
            "label": "备份策略",
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
            "tag": "select",
            "path": "",
            "rect": {
              "h": 36,
              "w": 158,
              "x": 1482,
              "y": -3254
            },
            "label": "全部状态 OPEN TRIAGED IN_PROGRESS RESOLVED CLOSED REJECTED",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 39,
              "w": 240,
              "x": 1648,
              "y": -3256
            },
            "label": "搜索编号 / 标题 / 页面 / 用户",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 36,
              "w": 75,
              "x": 1896,
              "y": -3254
            },
            "label": "刷新",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 38,
              "w": 103,
              "x": 1658,
              "y": -3172
            },
            "label": "刷新面板",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 38,
              "w": 185,
              "x": 1769,
              "y": -3172
            },
            "label": "自动分类 / 恢复 / 分派",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 70,
              "w": 1694,
              "x": 261,
              "y": -2756
            },
            "label": "BUG-20260709-0004 · 审批中心-我的待办，审批待办中有一条未审批的记录，但是上方显示共0条 HOLD 分类：API_5XX · 建议 Agent：—",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 70,
              "w": 1694,
              "x": 261,
              "y": -2675
            },
            "label": "BUG-20260710-0001 · 运营工作台页面按钮跳转错误 HOLD 分类：API_5XX · 建议 Agent：—",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 70,
              "w": 1694,
              "x": 261,
              "y": -2595
            },
            "label": "BUG-20260711-0002 · 生产管理-养殖场总览-药品库存，今日入库点击提交后报错“HTTP 500” HOLD 分类：API_5XX · 建议 Agent：—",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 68,
              "x": 542,
              "y": -2453
            },
            "label": "全部 · 16",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 87,
              "x": 618,
              "y": -2453
            },
            "label": "只读验证 · 0",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 92,
              "x": 713,
              "y": -2453
            },
            "label": "代码修复 · 16",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 93,
              "x": 813,
              "y": -2453
            },
            "label": "发布 Gate · 0",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 87,
              "x": 915,
              "y": -2453
            },
            "label": "路由复核 · 0",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 87,
              "x": 1010,
              "y": -2453
            },
            "label": "可自恢复 · 3",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 72,
              "x": 1104,
              "y": -2453
            },
            "label": "HOLD · 3",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 103,
              "x": 1828,
              "y": -2336
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 108,
              "x": 1828,
              "y": -2300
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 103,
              "x": 1828,
              "y": -2186
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 108,
              "x": 1828,
              "y": -2151
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 103,
              "x": 1828,
              "y": -2027
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 108,
              "x": 1828,
              "y": -1992
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 103,
              "x": 1828,
              "y": -1869
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 108,
              "x": 1828,
              "y": -1834
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 103,
              "x": 1828,
              "y": -1719
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 108,
              "x": 1828,
              "y": -1684
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 103,
              "x": 1828,
              "y": -1579
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 108,
              "x": 1828,
              "y": -1543
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 103,
              "x": 1828,
              "y": -1438
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 108,
              "x": 1828,
              "y": -1403
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 103,
              "x": 1828,
              "y": -1297
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 108,
              "x": 1828,
              "y": -1262
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 103,
              "x": 1828,
              "y": -1157
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 108,
              "x": 1828,
              "y": -1122
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 103,
              "x": 1828,
              "y": -1016
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 108,
              "x": 1828,
              "y": -981
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 103,
              "x": 1828,
              "y": -876
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 108,
              "x": 1828,
              "y": -840
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 103,
              "x": 1828,
              "y": -735
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 108,
              "x": 1828,
              "y": -700
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 103,
              "x": 1828,
              "y": -594
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 108,
              "x": 1828,
              "y": -559
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 103,
              "x": 1828,
              "y": -454
            },
            "label": "重新派发原任务",
            "disabled": true
          }
        ]
      },
      "devicePixelRatio": 1.600000023841858
    },
    "localEvidence": {
      "localAttachmentPaths": [
        "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260713-142906/BUG-20260713-0002/attachments/01-1783923903083-246be9eb.png"
      ]
    }
  },
  "failureClassification": null,
  "agentExecutionApproval": {
    "approved": true,
    "approvedAt": "2026-07-13T06:25:34.616Z",
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

- /Users/mac/.phoenix-erp/runs/bug-intake-inbox/20260713-142906/BUG-20260713-0002/attachments/01-1783923903083-246be9eb.png
