# Base Agent Prompt

# Bug Intake A3 Backend Repair Prompt

## Identity

You are `A3-Backend-Critical-Path` running on the dedicated Bug Intake repair branch.

Worktree: `/Users/mac/phoenix-erp-worktrees/bug-intake-a3`

Branch: `codex/bug-intake-a3`

## Mission

Implement the backend portion of exactly one approved bug report. Read the attached task contract first, reproduce from local source/evidence, identify the root cause, make the smallest production-quality fix, add focused tests, and write a task-specific report under `docs/ops/**`.

## Allowed Scope

- `apps/api/**`
- task-specific `docs/ops/**`

## Forbidden Scope

- `apps/web/**`
- migrations, schema, entity, table, or column changes without a separate schema gate
- database writes, seeds, deploys, pushes, force operations, or production commands
- unrelated refactors

## Required Evidence

1. owned backend file diff;
2. focused regression test or a documented, reproducible static verification when a test is impossible;
3. API typecheck;
4. task-specific report naming the source bug, root cause, changed files, validation results, and explicit `PASS WITH CONDITIONS`, `HOLD`, or `FAIL`;
5. no claim that the bug is resolved before CI/CD, production smoke, and business acceptance.

Return exactly one canonical conclusion. Never combine conclusions such as
`NOT APPLICABLE / HOLD`, `PASS / HOLD`, or similar ambiguous wording.

- If the current baseline already contains the correct backend-owned repair,
  verify it with focused tests and return exactly `PASS WITH CONDITIONS`,
  stating which existing files and behavior were verified.
- If the issue genuinely has no backend ownership, return exactly
  `NOT APPLICABLE` with concrete evidence and do not edit files.
- If required verification cannot be completed, return exactly `HOLD`.

---

# Agent Task Contract

# Bug Repair Agent Contract

Source bug: BUG-20260721-0001
Source repair task: BUGTASK-20260721-0001
Assigned agent: A3-Backend-Critical-Path

## Issue

作业台-分级，采集数量和剩余数量有问题

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
  "bugNo": "BUG-20260721-0001",
  "taskNo": "BUGTASK-20260721-0001",
  "title": "作业台-分级，采集数量和剩余数量有问题",
  "description": "",
  "route": "/bug-reports",
  "url": "https://erp.eggslao.com/bug-reports",
  "priority": "P2",
  "severity": "MEDIUM",
  "moduleCode": "___-__",
  "acceptanceCriteria": "作业台-集蛋作业录入总采集数800，脏蛋数10，裂纹蛋数10，到了分级采集数变成780了，剩余760，少了20个蛋",
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
        "sha256": "d9b6676efc033f69f43c712486736a87fb8d7cd9d927191da39327a53ec72342",
        "fileName": "01-1784621240368-7ab4dc83.png",
        "mimeType": "image/png",
        "sizeBytes": 116785,
        "originalName": "pasted-screenshot-1784621235426-1.png",
        "relativePath": "storage/bug-reports/2026/07/21/BUG-20260721-0001/01-1784621240368-7ab4dc83.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260721-0001/attachments/01-1784621240368-7ab4dc83.png"
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
      "capturedAt": "2026-07-21T08:07:20.368Z",
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
          "pasted-screenshot-1784621235426-1.png",
          "退出",
          "·Bug Intake 台账 · 用户页面提报 + 自动上下文采集 · 共 0 条",
          "·",
          "AI 修复流水线运行面板",
          "失败自动分类、超时自恢复、HOLD 分派候选、告警通知统一看这里。",
          "队列可见项：18",
          "执行中：0 · 待 Runner 领取：0",
          "已有修复产物：18",
          "可自动恢复：15 · 健康分：0",
          "只读验证：0 · 代码修复：18",
          "发布 Gate：0 · 路由复核：0",
          "最近 Runner 结论：HOLD",
          "最近提交：f03bd1b809b5e56974be64f0327f7343e36b0970",
          "HOLD",
          "当前筛选 18/18",
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
          "BUG-20260707-0010 我的待办中有审批任务，但是上方显示0条",
          "HOLD 3 分钟前更新",
          "代码修复 需 Gate 后重派",
          "PG_SQL 92%",
          "1 失败尝试 1 重派 10",
          "BugIntakeLocalRunner A2-Security-Regression-Gate / A3-Backend-Critical-Path / A4-Frontend-UAT-Smoke / A5-Data-Readiness / A1-CI-Runtime-Gate",
          "HOLD f03bd1b809b5e56974be64f0327f7343e36b0970",
          "已回写 4 个文件",
          "可自动恢复 Agent/Runner 最近失败 1 次",
          "点击“重算后派发”或“重新派发”进入本地 runner Keep the report in HOLD until implementation, CI/CD, and production route evidence all pass.",
          "重新派发原任务 重算计划并重新派发",
          "BUG-20260709-0004 审批中心-我的待办，审批待办中有一条未审批的记录，但是上方显示共0条",
          "1 失败尝试 1 重派 12",
          "BUG-20260713-0004 库存管理-库存查询的仓库显示代码，要求显示对应的中文名字",
          "1 失败尝试 1 重派 4",
          "BUG-20260713-0006 库位管理，报错“[400] 「wms_locations」存在重复值，请检查后重试”",
          "已回写 3 个文件",
          "BUG-20260715-0001 运营工作台的当前总存栏与养殖场总览的存栏总数不一致",
          "BUG-20260715-0002 入库-库存查询、出库链路闭环问题",
          "1 失败尝试 1 重派 3",
          "BUG-20260716-0001 生产管理-鸡群档案，编辑信息后页面不自动刷新",
          "1 失败尝试 1 重派 2",
          "BUG-20260716-0002 生产管理-养殖场总览-药品库存，今日入库点击保存后报错“HTTP 500”，要求点击保存不报错",
          "BUG-20260716-0004 生产管理，“日产蛋入库”点击从日报预填报错“2026-07-16 暂无日报或未按 9 档录入”",
          "BUG-20260717-0001 采购管理-采购订单上方显示的数量不对",
          "1 失败尝试 1 重派 1",
          "BUG-20260718-0002 财务结算中心-费用管理-新建申请后提交审批报错“HTTP 400”",
          "BUG-20260718-0004 mobile端-鸡舍管理，新建鸡舍提示“集团/管理员请在PC端「鸡舍管理」创建并指定农场;手机端仅供场长建本场鸡舍。”",
          "BUG-20260718-0005 作业台-集蛋作业录入鸡蛋数量后，点击“确认录入”报错“服务器内部错误，请联系管理员”",
          "BUG-20260720-0003 每日工作台-饲料消耗登记，下方的数据与上边的菜单标题没有对齐，要求调整布局，菜单标题与下面的内容对齐",
          "RBAC_403 90%",
          "BUG-20260720-0001 销售管理-销售订单，提交、发货等按钮点击后无反应",
          "HOLD 4 分钟前更新",
          "2 失败尝试 2 重派 1",
          "A1-CI-Runtime-Gate A2-Security-Regression-Gate / A3-Backend-Critical-Path / A4-Frontend-UAT-Smoke / A5-Data-Readiness / A1-CI-Runtime-Gate",
          "HOLD ca7c342a2533efb2e6ad95010824c258155a6484",
          "已回写 2 个文件",
          "可自动恢复 Agent/Runner 最近失败 2 次",
          "点击“重算后派发”或“重新派发”进入本地 runner Keep bug report in HOLD until the failed local Agent task is reviewed.",
          "BUG-20260720-0002 每日工作台-饲料消耗登记，今日入库录入数量后点击“保存”后无反应，刷新后数量也没增加",
          "3 失败尝试 3 重派 1",
          "HOLD 940dccd589f8e476df65541c97c9e5329fddd1f3",
          "常规处理 Agent/Runner 最近失败 3 次",
          "人工复核后重算 Agent 计划再派发 Keep bug report in HOLD until the failed local Agent task is reviewed.",
          "BUG-20260705-0001 验收试运行里面试运行项目页面奇丑无比",
          "FIX_READY_FOR_UAT 8275 分钟前更新",
          "0 失败尝试 0 重派 3",
          "BugIntakeLocalRunner A4-Frontend-UAT-Smoke / A1-CI-Runtime-Gate",
          "PASS_WITH_CONDITIONS eb3ed5f1eb9b40129db5009e77d16045edb75050",
          "常规处理 未发现阻塞",
          "无阻塞，等待下一轮处理 Technical release evidence passed; administrator performs business acceptance before resolving.",
          "BUG-20260705-0003 驾驶舱卡片问题",
          "FRONTEND_RENDER 82%",
          "0 失败尝试 0 重派 2",
          "BugIntakeLocalRunner A3-Backend-Critical-Path / A4-Frontend-UAT-Smoke / A1-CI-Runtime-Gate",
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
              "x": 966,
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
              "y": -3297
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
              "y": -3299
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
              "y": -3298
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
              "y": -3216
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
              "y": -3216
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
              "y": -2690
            },
            "label": "BUG-20260707-0010 · 我的待办中有审批任务，但是上方显示0条 HOLD 分类：PG_SQL · 建议 Agent：—",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 70,
              "w": 1694,
              "x": 261,
              "y": -2610
            },
            "label": "BUG-20260709-0004 · 审批中心-我的待办，审批待办中有一条未审批的记录，但是上方显示共0条 HOLD 分类：PG_SQL · 建议 Agent：—",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 70,
              "w": 1694,
              "x": 261,
              "y": -2529
            },
            "label": "BUG-20260713-0004 · 库存管理-库存查询的仓库显示代码，要求显示对应的中文名字 HOLD 分类：PG_SQL · 建议 Agent：—",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 70,
              "w": 1694,
              "x": 261,
              "y": -2449
            },
            "label": "BUG-20260713-0006 · 库位管理，报错“[400] 「wms_locations」存在重复值，请检查后重试” HOLD 分类：PG_SQL · 建议 Agent：—",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 70,
              "w": 1694,
              "x": 261,
              "y": -2369
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
              "y": -2226
            },
            "label": "全部 · 18",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 87,
              "x": 618,
              "y": -2226
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
              "y": -2226
            },
            "label": "代码修复 · 18",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 93,
              "x": 813,
              "y": -2226
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
              "y": -2226
            },
            "label": "路由复核 · 0",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 92,
              "x": 1010,
              "y": -2226
            },
            "label": "可自恢复 · 15",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 78,
              "x": 1110,
              "y": -2226
            },
            "label": "HOLD · 16",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 29,
              "w": 103,
              "x": 1818,
              "y": -2109
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 117,
              "x": 1818,
              "y": -2074
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
              "x": 1818,
              "y": -1969
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 117,
              "x": 1818,
              "y": -1933
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
              "x": 1818,
              "y": -1828
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 117,
              "x": 1818,
              "y": -1793
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
              "x": 1818,
              "y": -1687
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 117,
              "x": 1818,
              "y": -1652
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
              "x": 1818,
              "y": -1547
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 117,
              "x": 1818,
              "y": -1512
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
              "x": 1818,
              "y": -1406
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 117,
              "x": 1818,
              "y": -1371
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
              "x": 1818,
              "y": -1266
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 117,
              "x": 1818,
              "y": -1230
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
              "x": 1818,
              "y": -1125
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 117,
              "x": 1818,
              "y": -1090
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
              "x": 1818,
              "y": -984
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 117,
              "x": 1818,
              "y": -949
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
              "x": 1818,
              "y": -844
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 117,
              "x": 1818,
              "y": -809
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
              "x": 1818,
              "y": -703
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 117,
              "x": 1818,
              "y": -668
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
              "x": 1818,
              "y": -563
            },
            "label": "重新派发原任务",
            "disabled": true
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 47,
              "w": 117,
              "x": 1818,
              "y": -527
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
              "x": 1818,
              "y": -422
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
    "approvedAt": "2026-07-24T07:58:23.435Z",
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

---

# Execution Guardrails

1. Do not merge.
2. Do not push.
3. Do not deploy.
4. Do not execute migrations.
5. Do not write to any database.
6. Do not modify the task board from inside the Agent task.
7. Stop immediately if the task requires files outside the allowed contract.
8. Stop immediately if migration/schema/entity/table/column changes are needed but not explicitly approved.
9. Report PASS / FAIL / PASS WITH CONDITIONS with exact evidence.
