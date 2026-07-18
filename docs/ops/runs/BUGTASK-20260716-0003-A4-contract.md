# Bug Repair Agent Contract

Source bug: BUG-20260716-0003
Source repair task: BUGTASK-20260716-0003
Assigned agent: A4-Frontend-UAT-Smoke

## Issue

销售管理-销售订单-新建订单保存草稿之后，销售订单页面暂无订单数据，查不到订单信息

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
  "bugNo": "BUG-20260716-0003",
  "taskNo": "BUGTASK-20260716-0003",
  "title": "销售管理-销售订单-新建订单保存草稿之后，销售订单页面暂无订单数据，查不到订单信息",
  "description": "",
  "route": "/bug-reports",
  "url": "https://erp.eggslao.com/bug-reports",
  "priority": "P2",
  "severity": "MEDIUM",
  "moduleCode": "____-____",
  "acceptanceCriteria": "销售管理-销售订单-新建订单保存草稿之后，销售订单页面暂无订单数据，查不到订单信息",
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
        "sha256": "ee2079d44ef940a94549d3314697583898f839591ee6d216d33bab16de3b3d3f",
        "fileName": "01-1784164517613-25311848.png",
        "mimeType": "image/png",
        "sizeBytes": 362762,
        "originalName": "pasted-screenshot-1784164504940-1.png",
        "relativePath": "storage/bug-reports/2026/07/16/BUG-20260716-0003/01-1784164517613-25311848.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260716-0003/attachments/01-1784164517613-25311848.png"
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
      "capturedAt": "2026-07-16T01:15:17.614Z",
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
          "采购供应中心",
          "销售管理",
          "财务结算中心",
          "股东权益中心",
          "审批中心",
          "经营分析中心",
          "主数据中心",
          "系统设置中心",
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
          "pasted-screenshot-1784164504940-1.png",
          "退出",
          "·Bug Intake 台账 · 用户页面提报 + 自动上下文采集 · 共 0 条",
          "·",
          "AI 修复流水线运行面板",
          "失败自动分类、超时自恢复、HOLD 分派候选、告警通知统一看这里。",
          "队列可见项：15",
          "执行中：0 · 待 Runner 领取：7",
          "已有修复产物：8",
          "可自动恢复：7 · 健康分：96",
          "只读验证：0 · 代码修复：15",
          "发布 Gate：0 · 路由复核：0",
          "最近 Runner 结论：PASS_WITH_CONDITIONS",
          "最近提交：eb3ed5f1eb9b40129db5009e77d16045edb75050",
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
          "BUG-20260705-0001 验收试运行里面试运行项目页面奇丑无比",
          "FIX_READY_FOR_UAT 673 分钟前更新",
          "代码修复 需 Gate 后重派",
          "PG_SQL 92%",
          "0 失败尝试 0 重派 3",
          "BugIntakeLocalRunner A4-Frontend-UAT-Smoke / A1-CI-Runtime-Gate",
          "PASS_WITH_CONDITIONS eb3ed5f1eb9b40129db5009e77d16045edb75050",
          "已回写 3 个文件",
          "常规处理 未发现阻塞",
          "无阻塞，等待下一轮处理 Technical release evidence passed; administrator performs business acceptance before resolving.",
          "重新派发原任务 重算计划并重新派发",
          "BUG-20260705-0003 驾驶舱卡片问题",
          "FRONTEND_RENDER 82%",
          "0 失败尝试 0 重派 2",
          "BugIntakeLocalRunner A3-Backend-Critical-Path / A4-Frontend-UAT-Smoke / A1-CI-Runtime-Gate",
          "BUG-20260707-0001 财务结算中心/资金账户，没有账户建档权限的账号也可以新建账户",
          "BugIntakeLocalRunner A2-Security-Regression-Gate / A3-Backend-Critical-Path / A4-Frontend-UAT-Smoke / A1-CI-Runtime-Gate",
          "已回写 5 个文件",
          "BUG-20260707-0009 养殖场总览-药品库存，今日入库提交后，库存总览还是0",
          "RBAC_403 90%",
          "0 失败尝试 0 重派 6",
          "BugIntakeLocalRunner A3-Backend-Critical-Path / A1-CI-Runtime-Gate",
          "BUG-20260707-0010 我的待办中有审批任务，但是上方显示0条",
          "0 失败尝试 0 重派 7",
          "BugIntakeLocalRunner A2-Security-Regression-Gate / A3-Backend-Critical-Path / A4-Frontend-UAT-Smoke / A5-Data-Readiness / A1-CI-Runtime-Gate",
          "已回写 4 个文件",
          "BUG-20260708-0001 新建入库单的界面字段跟库存查询的字段不一致",
          "0 失败尝试 0 重派 5",
          "BUG-20260710-0001 运营工作台页面按钮跳转错误",
          "API_5XX 88%",
          "0 失败尝试 0 重派 11",
          "BUG-20260715-0002 入库-库存查询、出库链路闭环问题",
          "0 失败尝试 0 重派 0",
          "BUG-20260709-0004 审批中心-我的待办，审批待办中有一条未审批的记录，但是上方显示共0条",
          "AGENT_APPROVED 3 分钟前更新",
          "0 失败尝试 0 重派 10",
          "A2-Security-Regression-Gate A2-Security-Regression-Gate / A3-Backend-Critical-Path / A4-Frontend-UAT-Smoke / A5-Data-Readiness / A1-CI-Runtime-Gate",
          "— —",
          "已回写 0 个文件",
          "无阻塞，等待下一轮处理 等待本地 runner 领取任务",
          "BUG-20260716-0002 生产管理-养殖场总览-药品库存，今日入库点击保存后报错“HTTP 500”，要求点击保存不报错",
          "AGENT_APPROVED 6 分钟前更新",
          "待回写 0 个文件",
          "可自动恢复 已批准，等待本地常驻 runner 领取",
          "保持本地 runner 常驻；必要时运行自动分类/恢复 等待本地 runner 领取任务",
          "BUG-20260713-0003 采购管理-付款管理,点击确认付款报错“AP 台账 ID=11不存在”",
          "AGENT_APPROVED 10 分钟前更新",
          "0 失败尝试 0 重派 4",
          "BUG-20260713-0004 库存管理-库存查询的仓库显示代码，要求显示对应的中文名字",
          "AGENT_APPROVED 11 分钟前更新",
          "BUG-20260713-0006 库位管理，报错“[400] 「wms_locations」存在重复值，请检查后重试”",
          "AGENT_APPROVED 12 分钟前更新",
          "BUG-20260715-0001 运营工作台的当前总存栏与养殖场总览的存栏总数不一致",
          "AGENT_APPROVED 13 分钟前更新",
          "BUG-20260716-0001 生产管理-鸡群档案，编辑信息后页面不自动刷新",
          "AGENT_APPROVED 16 分钟前更新",
          "标题"
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
            "label": "采购供应中心",
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
            "label": "经营分析中心",
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
            "label": "系统设置中心",
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
            "tag": "select",
            "path": "",
            "rect": {
              "h": 36,
              "w": 158,
              "x": 1482,
              "y": -2354
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
              "y": -2356
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
              "y": -2354
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
              "y": -2272
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
              "y": -2272
            },
            "label": "自动分类 / 恢复 / 分派",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 68,
              "x": 542,
              "y": -1724
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
              "y": -1724
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
              "y": -1724
            },
            "label": "代码修复 · 15",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 93,
              "x": 813,
              "y": -1724
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
              "x": 914,
              "y": -1724
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
              "y": -1724
            },
            "label": "可自恢复 · 7",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 73,
              "x": 1103,
              "y": -1724
            },
            "label": "HOLD · 0",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 103,
              "x": 1823,
              "y": -1607
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 113,
              "x": 1823,
              "y": -1572
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
              "x": 1823,
              "y": -1467
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 113,
              "x": 1823,
              "y": -1431
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
              "x": 1823,
              "y": -1326
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 113,
              "x": 1823,
              "y": -1291
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
              "x": 1823,
              "y": -1185
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 113,
              "x": 1823,
              "y": -1150
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
              "x": 1823,
              "y": -1045
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 113,
              "x": 1823,
              "y": -1010
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
              "x": 1823,
              "y": -904
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 113,
              "x": 1823,
              "y": -869
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
              "x": 1823,
              "y": -764
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 113,
              "x": 1823,
              "y": -728
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
              "x": 1823,
              "y": -623
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 113,
              "x": 1823,
              "y": -588
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
              "x": 1823,
              "y": -497
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 113,
              "x": 1823,
              "y": -462
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
              "x": 1823,
              "y": -380
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 113,
              "x": 1823,
              "y": -345
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
              "x": 1823,
              "y": -258
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 113,
              "x": 1823,
              "y": -222
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
              "x": 1823,
              "y": -135
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 113,
              "x": 1823,
              "y": -100
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
              "x": 1823,
              "y": -13
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 113,
              "x": 1823,
              "y": 23
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
              "x": 1823,
              "y": 110
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 113,
              "x": 1823,
              "y": 145
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
              "x": 1823,
              "y": 233
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 113,
              "x": 1823,
              "y": 268
            },
            "label": "重算计划并重新派发",
            "disabled": false
          }
        ]
      },
      "devicePixelRatio": 1.600000023841858
    },
    "localEvidence": {
      "localAttachmentPaths": [
        "/Users/mac/.phoenix-erp/runs/bug-intake-inbox-controlled-recovery/20260718-200046/BUG-20260716-0003/attachments/01-1784164517613-25311848.png"
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
    "approvedAt": "2026-07-16T01:15:35.902Z",
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

- /Users/mac/.phoenix-erp/runs/bug-intake-inbox-controlled-recovery/20260718-200046/BUG-20260716-0003/attachments/01-1784164517613-25311848.png
