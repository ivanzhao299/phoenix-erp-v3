# Bug Repair Agent Contract

Source bug: BUG-20260724-0004
Source repair task: BUGTASK-20260724-0004
Assigned agent: A3-Backend-Critical-Path

## Issue

库存管理-库存与出入库无法联动

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
  "bugNo": "BUG-20260724-0004",
  "taskNo": "BUGTASK-20260724-0004",
  "title": "库存管理-库存与出入库无法联动",
  "description": "",
  "route": "/bug-reports",
  "url": "https://erp.eggslao.com/bug-reports",
  "priority": "P2",
  "severity": "MEDIUM",
  "moduleCode": "____",
  "acceptanceCriteria": "要求入库后可在库存查询查询到，并且库存中的产品可以通过出库管理出库，并且库存数量对应减少",
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
    "attachments": [],
    "consoleErrors": [],
    "failedRequests": [
      {
        "url": "/api/bug-intake/reports/BUG-20260718-0002",
        "method": "GET",
        "status": 500,
        "requestId": "",
        "timestamp": "2026-07-24T07:39:43.282Z",
        "responseExcerpt": "Internal Server Error"
      },
      {
        "url": "/api/system/online-count",
        "method": "GET",
        "status": 500,
        "requestId": "",
        "timestamp": "2026-07-24T08:04:58.295Z",
        "responseExcerpt": "Internal Server Error"
      },
      {
        "url": "/api/system/online-count",
        "method": "GET",
        "status": 500,
        "requestId": "",
        "timestamp": "2026-07-24T08:04:59.273Z",
        "responseExcerpt": "Internal Server Error"
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
      "capturedAt": "2026-07-24T08:09:24.453Z",
      "pageSnapshot": {
        "route": "/bug-reports",
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
          "退出",
          "·Bug Intake 台账 · 用户页面提报 + 自动上下文采集 · 共 0 条",
          "·",
          "AI 修复流水线运行面板",
          "失败自动分类、超时自恢复、HOLD 分派候选、告警通知统一看这里。",
          "队列可见项：15",
          "执行中：0 · 待 Runner 领取：4",
          "已有修复产物：11",
          "可自动恢复：5 · 健康分：81",
          "只读验证：0 · 代码修复：13",
          "发布 Gate：2 · 路由复核：0",
          "最近 Runner 结论：PASS_WITH_CONDITIONS",
          "最近提交：3509abbfe8a3ef8e4b42c052a486535534078960",
          "HOLD",
          "当前筛选 15/15",
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
          "BUG-20260717-0001 采购管理-采购订单上方显示的数量不对",
          "HOLD 15 分钟前更新",
          "代码修复 需 Gate 后重派",
          "PG_SQL 92%",
          "3 失败尝试 3 重派 4",
          "A1-CI-Runtime-Gate A2-Security-Regression-Gate / A3-Backend-Critical-Path / A4-Frontend-UAT-Smoke / A5-Data-Readiness / A1-CI-Runtime-Gate",
          "HOLD —",
          "已回写 3 个文件",
          "常规处理 Agent/Runner 最近失败 3 次",
          "人工复核后重算 Agent 计划再派发 Keep bug report in HOLD until the failed local Agent task is reviewed.",
          "重新派发原任务 重算计划并重新派发",
          "BUG-20260723-0005 生产管理-包装管理，进入作业台跳转错误",
          "2 失败尝试 2 重派 4",
          "已回写 2 个文件",
          "可自动恢复 Agent/Runner 最近失败 2 次",
          "点击“重算后派发”或“重新派发”进入本地 runner Keep bug report in HOLD until the failed local Agent task is reviewed.",
          "BUG-20260713-0004 库存管理-库存查询的仓库显示代码，要求显示对应的中文名字",
          "AGENT_EXECUTION_FINISHED 15 分钟前更新",
          "API_5XX 88%",
          "0 失败尝试 0 重派 8",
          "PASS_WITH_CONDITIONS —",
          "已回写 4 个文件",
          "常规处理 未发现阻塞",
          "无阻塞，等待下一轮处理 Execution evidence recorded; release and production smoke must pass before business validation.",
          "BUG-20260715-0001 运营工作台的当前总存栏与养殖场总览的存栏总数不一致",
          "FIX_READY_FOR_UAT 25 分钟前更新",
          "RBAC_403 90%",
          "BugIntakeLocalRunner A2-Security-Regression-Gate / A3-Backend-Critical-Path / A4-Frontend-UAT-Smoke / A5-Data-Readiness / A1-CI-Runtime-Gate",
          "PASS_WITH_CONDITIONS 3509abbfe8a3ef8e4b42c052a486535534078960",
          "无阻塞，等待下一轮处理 Technical release evidence passed; administrator performs business acceptance before resolving.",
          "BUG-20260716-0004 生产管理，“日产蛋入库”点击从日报预填报错“2026-07-16 暂无日报或未按 9 档录入”",
          "FIX_READY_FOR_UAT 28 分钟前更新",
          "0 失败尝试 0 重派 4",
          "BUG-20260716-0001 生产管理-鸡群档案，编辑信息后页面不自动刷新",
          "FIX_READY_FOR_UAT 40 分钟前更新",
          "0 失败尝试 0 重派 5",
          "PASS_WITH_CONDITIONS 5445c329ad71c845d8eb663efe660813c2955744",
          "无阻塞，等待下一轮处理 等待管理员按原问题路径复验；通过后再标记已解决。",
          "BUG-20260716-0002 生产管理-养殖场总览-药品库存，今日入库点击保存后报错“HTTP 500”，要求点击保存不报错",
          "0 失败尝试 0 重派 6",
          "BUG-20260722-0003 作业台-入库，入库显示成功但实际并未入库",
          "FIX_READY_FOR_UAT 1614 分钟前更新",
          "0 失败尝试 0 重派 0",
          "PASS_WITH_CONDITIONS 8c06fdeacdae80bce2d5694e4e904f6b8e133bbc",
          "BUG-20260722-0004 作业台-交班，集蛋作业、分级、包装、标签、入库都做了，交班的时候全显示0",
          "FIX_READY_FOR_UAT 1672 分钟前更新",
          "发布 Gate 需 Gate 后重派",
          "BugIntakeLocalRunner A2-Security-Regression-Gate / A3-Backend-Critical-Path / A4-Frontend-UAT-Smoke / A5-Data-Readiness / A1-CI-Runtime-Gate / A6-Staging-Deploy",
          "PASS_WITH_CONDITIONS 5424779dfa6b0a92630ac420a10220ae570b1997",
          "BUG-20260705-0001 验收试运行里面试运行项目页面奇丑无比",
          "FIX_READY_FOR_UAT 12606 分钟前更新",
          "0 失败尝试 0 重派 3",
          "BugIntakeLocalRunner A4-Frontend-UAT-Smoke / A1-CI-Runtime-Gate",
          "PASS_WITH_CONDITIONS eb3ed5f1eb9b40129db5009e77d16045edb75050",
          "BUG-20260705-0003 驾驶舱卡片问题",
          "FRONTEND_RENDER 82%",
          "0 失败尝试 0 重派 2"
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
              "x": 1341,
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
              "x": 1497,
              "y": 11
            },
            "label": "在线 0",
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
            "path": ".bug-intake-module__OBjRZW__secondaryButton",
            "rect": {
              "h": 42,
              "w": 61,
              "x": 1127,
              "y": 832
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
              "y": 832
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
              "y": -3000
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
              "y": -3002
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
              "y": -3000
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
              "y": -2918
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
              "y": -2918
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
              "y": -2501
            },
            "label": "BUG-20260717-0001 · 采购管理-采购订单上方显示的数量不对 HOLD 分类：PG_SQL · 建议 Agent：—",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 70,
              "w": 1694,
              "x": 261,
              "y": -2421
            },
            "label": "BUG-20260723-0005 · 生产管理-包装管理，进入作业台跳转错误 HOLD 分类：PG_SQL · 建议 Agent：—",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 68,
              "x": 542,
              "y": -2279
            },
            "label": "全部 · 15",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 87,
              "x": 618,
              "y": -2279
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
              "y": -2279
            },
            "label": "代码修复 · 13",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 93,
              "x": 813,
              "y": -2279
            },
            "label": "发布 Gate · 2",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 87,
              "x": 914,
              "y": -2279
            },
            "label": "路由复核 · 0",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 86,
              "x": 1009,
              "y": -2279
            },
            "label": "可自恢复 · 5",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 72,
              "x": 1103,
              "y": -2279
            },
            "label": "HOLD · 2",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -2170
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -2117
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -2021
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -1968
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -1853
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -1800
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -1677
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -1623
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -1500
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -1447
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -1347
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -1294
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -1218
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -1165
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -1065
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -1012
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -889
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -835
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -712
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -659
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -535
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -482
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -383
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -329
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -253
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -200
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -124
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": -71
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 94,
              "x": 1842,
              "y": 5
            },
            "label": "重新派发原任务",
            "disabled": true
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
    "approvedAt": "2026-07-24T08:39:51.664Z",
    "approvedBy": "admin",
    "redispatch": true,
    "approvalScope": "仅允许按当前 Agent 修复计划写入本地任务队列；不自动部署、不写数据库、不执行 migration。",
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

- No local attachment downloaded. If screenshot evidence is required, HOLD and request evidence sync.
