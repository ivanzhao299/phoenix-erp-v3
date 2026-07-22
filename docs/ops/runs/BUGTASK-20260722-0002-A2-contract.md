# Bug Repair Agent Contract

Source bug: BUG-20260722-0002
Source repair task: BUGTASK-20260722-0002
Assigned agent: A2-Security-Regression-Gate

## Issue

作业台-集蛋作业点击“确认交班”报错“HTTP 403”

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
  "bugNo": "BUG-20260722-0002",
  "taskNo": "BUGTASK-20260722-0002",
  "title": "作业台-集蛋作业点击“确认交班”报错“HTTP 403”",
  "description": "",
  "route": "/bug-reports",
  "url": "https://erp.eggslao.com/bug-reports",
  "priority": "P2",
  "severity": "MEDIUM",
  "moduleCode": "___-____",
  "acceptanceCriteria": "作业台-集蛋作业点击“确认交班”报错“HTTP 403”",
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
        "sha256": "2619c5f0276a766ef595ec595accbf70436a628459d7244a328484ae825d452a",
        "fileName": "01-1784684181183-684b1558.png",
        "mimeType": "image/png",
        "sizeBytes": 260663,
        "originalName": "pasted-screenshot-1784684143271-1.png",
        "relativePath": "storage/bug-reports/2026/07/22/BUG-20260722-0002/01-1784684181183-684b1558.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260722-0002/attachments/01-1784684181183-684b1558.png"
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
      "capturedAt": "2026-07-22T01:36:21.184Z",
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
          "pasted-screenshot-1784684143271-1.png",
          "退出",
          "·Bug Intake 台账 · 用户页面提报 + 自动上下文采集 · 共 0 条",
          "·",
          "AI 修复流水线运行面板",
          "失败自动分类、超时自恢复、HOLD 分派候选、告警通知统一看这里。",
          "队列可见项：19",
          "执行中：0 · 待 Runner 领取：6",
          "已有修复产物：13",
          "可自动恢复：9 · 健康分：25",
          "只读验证：0 · 代码修复：18",
          "发布 Gate：1 · 路由复核：0",
          "最近 Runner 结论：—",
          "最近提交：ca7c342a2533efb2e6ad95010824c258155a6484",
          "HOLD",
          "当前筛选 19/19",
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
          "BUG-20260720-0001 销售管理-销售订单，提交、发货等按钮点击后无反应",
          "HOLD 0 分钟前更新",
          "代码修复 需 Gate 后重派",
          "RBAC_403 90%",
          "2 失败尝试 2 重派 1",
          "A1-CI-Runtime-Gate A2-Security-Regression-Gate / A3-Backend-Critical-Path / A4-Frontend-UAT-Smoke / A5-Data-Readiness / A1-CI-Runtime-Gate",
          "HOLD ca7c342a2533efb2e6ad95010824c258155a6484",
          "已回写 2 个文件",
          "可自动恢复 Agent/Runner 最近失败 2 次",
          "点击“重算后派发”或“重新派发”进入本地 runner Keep bug report in HOLD until the failed local Agent task is reviewed.",
          "重新派发原任务 重算计划并重新派发",
          "BUG-20260720-0002 每日工作台-饲料消耗登记，今日入库录入数量后点击“保存”后无反应，刷新后数量也没增加",
          "3 失败尝试 3 重派 1",
          "HOLD 940dccd589f8e476df65541c97c9e5329fddd1f3",
          "已回写 3 个文件",
          "常规处理 Agent/Runner 最近失败 3 次",
          "人工复核后重算 Agent 计划再派发 Keep bug report in HOLD until the failed local Agent task is reviewed.",
          "BUG-20260721-0001 作业台-分级，采集数量和剩余数量有问题",
          "HOLD 1 分钟前更新",
          "发布 Gate 需 Gate 后重派",
          "PG_SQL 92%",
          "3 失败尝试 3 重派 0",
          "A1-CI-Runtime-Gate A2-Security-Regression-Gate / A3-Backend-Critical-Path / A4-Frontend-UAT-Smoke / A5-Data-Readiness / A1-CI-Runtime-Gate / A6-Staging-Deploy-R",
          "HOLD b1fc9d7e67ab1258299fb07f416c40d3fda30c81",
          "BUG-20260722-0001 销售管理-价格管理，价格册不显示ID",
          "2 失败尝试 2 重派 0",
          "HOLD ec476f61358bc6c010670436bf5bdb39a098b254",
          "BUG-20260715-0001 运营工作台的当前总存栏与养殖场总览的存栏总数不一致",
          "HOLD 2 分钟前更新",
          "1 失败尝试 1 重派 5",
          "BugIntakeLocalRunner A2-Security-Regression-Gate / A3-Backend-Critical-Path / A4-Frontend-UAT-Smoke / A5-Data-Readiness / A1-CI-Runtime-Gate",
          "HOLD 76f0902a3efdb1977bb7858b245e821abcb617cb",
          "已回写 4 个文件",
          "可自动恢复 Agent/Runner 最近失败 1 次",
          "点击“重算后派发”或“重新派发”进入本地 runner Keep the report in HOLD until implementation, CI/CD, and production route evidence all pass.",
          "BUG-20260716-0002 生产管理-养殖场总览-药品库存，今日入库点击保存后报错“HTTP 500”，要求点击保存不报错",
          "AGENT_EXECUTION_FINISHED 0 分钟前更新",
          "A5-Data-Readiness A2-Security-Regression-Gate / A3-Backend-Critical-Path / A4-Frontend-UAT-Smoke / A5-Data-Readiness / A1-CI-Runtime-Gate",
          "常规处理 未发现阻塞",
          "无阻塞，等待下一轮处理 等待本地 runner 领取任务",
          "BUG-20260716-0004 生产管理，“日产蛋入库”点击从日报预填报错“2026-07-16 暂无日报或未按 9 档录入”",
          "1 失败尝试 1 重派 3",
          "HOLD b826e3df57cd0697a9ebab8b47322b66ef69e246",
          "BUG-20260717-0001 采购管理-采购订单上方显示的数量不对",
          "1 失败尝试 1 重派 2",
          "HOLD fb6fb77500e53b2b219092a4b92f11db3cfaf8d6",
          "BUG-20260718-0002 财务结算中心-费用管理-新建申请后提交审批报错“HTTP 400”",
          "BUG-20260718-0004 mobile端-鸡舍管理，新建鸡舍提示“集团/管理员请在PC端「鸡舍管理」创建并指定农场;手机端仅供场长建本场鸡舍。”",
          "BUG-20260720-0003 每日工作台-饲料消耗登记，下方的数据与上边的菜单标题没有对齐，要求调整布局，菜单标题与下面的内容对齐",
          "点击“重算后派发”或“重新派发”进入本地 runner Execution evidence recorded; release and production smoke must pass before business validation.",
          "BUG-20260705-0001 验收试运行里面试运行项目页面奇丑无比",
          "FIX_READY_FOR_UAT 9307 分钟前更新",
          "0 失败尝试 0 重派 3",
          "BugIntakeLocalRunner A4-Frontend-UAT-Smoke / A1-CI-Runtime-Gate",
          "PASS_WITH_CONDITIONS eb3ed5f1eb9b40129db5009e77d16045edb75050",
          "无阻塞，等待下一轮处理 Technical release evidence passed; administrator performs business acceptance before resolving."
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
              "x": 964,
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
              "y": -3476
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
              "y": -3478
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
              "y": -3476
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
              "y": -3394
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
              "y": -3394
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
              "y": -2978
            },
            "label": "BUG-20260720-0001 · 销售管理-销售订单，提交、发货等按钮点击后无反应 HOLD 分类：RBAC_403 · 建议 Agent：—",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 70,
              "w": 1694,
              "x": 261,
              "y": -2897
            },
            "label": "BUG-20260720-0002 · 每日工作台-饲料消耗登记，今日入库录入数量后点击“保存”后无反应，刷新后数量也没增加 HOLD 分类：RBAC_403 · 建议 Agent：—",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 70,
              "w": 1694,
              "x": 261,
              "y": -2817
            },
            "label": "BUG-20260721-0001 · 作业台-分级，采集数量和剩余数量有问题 HOLD 分类：PG_SQL · 建议 Agent：—",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 70,
              "w": 1694,
              "x": 261,
              "y": -2737
            },
            "label": "BUG-20260722-0001 · 销售管理-价格管理，价格册不显示ID HOLD 分类：PG_SQL · 建议 Agent：—",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 70,
              "w": 1694,
              "x": 261,
              "y": -2657
            },
            "label": "BUG-20260715-0001 · 运营工作台的当前总存栏与养殖场总览的存栏总数不一致 HOLD 分类：PG_SQL · 建议 Agent：—",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 68,
              "x": 542,
              "y": -2514
            },
            "label": "全部 · 19",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 87,
              "x": 618,
              "y": -2514
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
              "y": -2514
            },
            "label": "代码修复 · 18",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 90,
              "x": 813,
              "y": -2514
            },
            "label": "发布 Gate · 1",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 87,
              "x": 912,
              "y": -2514
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
              "x": 1007,
              "y": -2514
            },
            "label": "可自恢复 · 9",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 72,
              "x": 1102,
              "y": -2514
            },
            "label": "HOLD · 5",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -2397
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -2344
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -2247
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -2194
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -2107
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -2054
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -1957
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -1904
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -1781
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -1727
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -1619
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -1565
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -1490
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -1436
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -1361
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -1307
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -1231
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -1178
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -1102
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -1049
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -940
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -887
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -755
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -702
            },
            "label": "重算计划并重新派发",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 97,
              "x": 1838,
              "y": -578
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
        "/Users/mac/.phoenix-erp/runs/bug-intake-inbox/attachments/BUG-20260722-0002/attachments/01-1784684181183-684b1558.png"
      ]
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
    "approvedAt": "2026-07-22T01:36:38.823Z",
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

- /Users/mac/.phoenix-erp/runs/bug-intake-inbox/attachments/BUG-20260722-0002/attachments/01-1784684181183-684b1558.png
