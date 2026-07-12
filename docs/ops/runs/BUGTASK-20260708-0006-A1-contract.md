# Bug Repair Agent Contract

Source bug: BUG-20260708-0006
Source repair task: BUGTASK-20260708-0006
Assigned agent: A1-CI-Runtime-Gate

## Issue

价格册恢复

## Route

/sales2/pricing

## Guardrails

- Start with dry-run / diagnosis.
- Do not deploy automatically.
- Do not write database or run migration without explicit gate.
- Preserve RBAC, DataScope, audit, and attachment ACL.
- Produce a result report with changed files, validation commands, and GO/HOLD/FAIL.

## Context

```json
{
  "bugNo": "BUG-20260708-0006",
  "taskNo": "BUGTASK-20260708-0006",
  "title": "价格册恢复",
  "description": "",
  "route": "/sales2/pricing",
  "url": "https://erp.eggslao.com/sales2/pricing",
  "priority": "P1",
  "severity": "MEDIUM",
  "moduleCode": "____",
  "acceptanceCriteria": "将价格册名称为“孟赛标准价格册（试运行版）重建”的删除掉，将名称为“孟赛标准价格册（试运行版）”的价格册保留并恢复为正常在用的状态",
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
        "sha256": "4cef4e9479565a5fe952b942f3a493f52c05af300b065823fd283e777c56a595",
        "fileName": "01-1783495418148-a24a371c.png",
        "mimeType": "image/png",
        "sizeBytes": 347794,
        "originalName": "pasted-screenshot-1783495365133-1.png",
        "relativePath": "storage/bug-reports/2026/07/08/BUG-20260708-0006/01-1783495418148-a24a371c.png",
        "previewEndpoint": "/api/bug-intake/reports/BUG-20260708-0006/attachments/01-1783495418148-a24a371c.png"
      }
    ],
    "consoleErrors": "[{\"type\":\"unhandledrejection\",\"stack\":\"Error: 黑名单客户不可编辑，请先解除黑名单\\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929\",\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"timestamp\":\"2026-07-08T07:07:23.854Z\"},{\"type\":\"unhandledrejection\",\"stack\":\"Error: 黑名单客户不可编辑，请先解除黑名单\\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929\",\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"timestamp\":\"2026-07-08T07:07:26.257Z\"},{\"type\":\"unhandledrejection\",\"stack\":\"Error: 黑名单客户不可编辑，请先解除黑名单\\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929\",\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"timestamp\":\"2026-07-08T07:07:28.459Z\"},{\"type\":\"unhandledrejection\",\"stack\":\"Error: 黑名单客户不可编辑，请先解除黑名单\\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929\",\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"timestamp\":\"2026-07-08T07:07:39.445Z\"},{\"type\":\"unhandledrejection\",\"stack\":\"Error: 黑名单客户不可编辑，请先解除黑名单\\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929\",\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"timestamp\":\"2026-07-08T07:07:44.870Z\"},{\"type\":\"unhandledrejection\",\"stack\":\"Error: 黑名单客户不可编辑，请先解除黑名单\\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929\",\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"timestamp\":\"2026-07-08T07:07:48.284Z\"},{\"type\":\"unhandledrejection\",\"stack\":\"Error: 黑名单客户不可编辑，请先解除黑名单\\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929\",\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"timestamp\":\"2026-07-08T07:07:52.967Z\"},{\"type\":\"unhandledrejection\",\"stack\":\"Error: 黑名单客户不可编辑，请先解除黑名单\\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929\",\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"timestamp\":\"2026-07-08T07:08:03.390Z\"},{\"type\":\"unhandledrejection\",\"stack\":\"Error: 黑名单客户不可编辑，请先解除黑名单\\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929\",\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"timestamp\":\"2026-07-08T07:08:22.689Z\"},{\"type\":\"unhandledrejection\",\"stack\":\"Error: 黑名单客户不可编辑，请先解除黑名单\\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929\",\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"timestamp\":\"2026-07-08T07:08:23.770Z\"},{\"type\":\"unhandledrejection\",\"stack\":\"Error: 黑名单客户不可编辑，请先解除黑名单\\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929\",\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"timestamp\":\"2026-07-08T07:08:24.378Z\"},{\"type\":\"unhandledrejection\",\"stack\":\"Error: 黑名单客户不可编辑，请先解除黑名单\\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929\",\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"timestamp\":\"2026-07-08T07:08:25.141Z\"},{\"type\":\"unhandledrejection\",\"stack\":\"Error: 黑名单客户不可编辑，请先解除黑名单\\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929\",\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"timestamp\":\"2026-07-08T07:10:32.408Z\"},{\"type\":\"unhandledrejection\",\"stack\":\"Error: 黑名单客户不可编辑，请先解除黑名单\\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929\",\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"timestamp\":\"2026-07-08T07:11:36.402Z\"},{\"type\":\"unhandledrejection\",\"stack\":\"Error: 黑名单客户不可编辑，请先解除黑名单\\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:44055)\\n    at async https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:35929\",\"message\":\"黑名单客户不可编辑，请先解除黑名单\",\"timestamp\":\"2026-07-08T07:11:44.765Z\"},{\"type\":\"unhandledrejection\",\"stack\":\"Error: 黑名单客户不可编辑，请先解除黑名单\\n    at C (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:43283)\\n    at async V (https://erp.eggslao.com/_next/static/chunks/0yvrca.f9yr9w.js:1:\n...[truncated by bug-intake contract builder]",
    "failedRequests": "[{\"url\":\"/api/v2/sales/customers/10951\",\"method\":\"PATCH\",\"status\":403,\"requestId\":\"\",\"timestamp\":\"2026-07-08T07:07:23.852Z\",\"responseExcerpt\":\"{\\\"code\\\":403,\\\"message\\\":\\\"黑名单客户不可编辑，请先解除黑名单\\\",\\\"error\\\":\\\"Forbidden\\\",\\\"statusCode\\\":403}\"},{\"url\":\"/api/v2/sales/customers/10951\",\"method\":\"PATCH\",\"status\":403,\"requestId\":\"\",\"timestamp\":\"2026-07-08T07:07:26.254Z\",\"responseExcerpt\":\"{\\\"code\\\":403,\\\"message\\\":\\\"黑名单客户不可编辑，请先解除黑名单\\\",\\\"error\\\":\\\"Forbidden\\\",\\\"statusCode\\\":403}\"},{\"url\":\"/api/v2/sales/customers/10951\",\"method\":\"PATCH\",\"status\":403,\"requestId\":\"\",\"timestamp\":\"2026-07-08T07:07:28.457Z\",\"responseExcerpt\":\"{\\\"code\\\":403,\\\"message\\\":\\\"黑名单客户不可编辑，请先解除黑名单\\\",\\\"error\\\":\\\"Forbidden\\\",\\\"statusCode\\\":403}\"},{\"url\":\"/api/v2/sales/customers/10951\",\"method\":\"PATCH\",\"status\":403,\"requestId\":\"\",\"timestamp\":\"2026-07-08T07:07:39.444Z\",\"responseExcerpt\":\"{\\\"code\\\":403,\\\"message\\\":\\\"黑名单客户不可编辑，请先解除黑名单\\\",\\\"error\\\":\\\"Forbidden\\\",\\\"statusCode\\\":403}\"},{\"url\":\"/api/v2/sales/customers/10951\",\"method\":\"PATCH\",\"status\":403,\"requestId\":\"\",\"timestamp\":\"2026-07-08T07:07:44.869Z\",\"responseExcerpt\":\"{\\\"code\\\":403,\\\"message\\\":\\\"黑名单客户不可编辑，请先解除黑名单\\\",\\\"error\\\":\\\"Forbidden\\\",\\\"statusCode\\\":403}\"},{\"url\":\"/api/v2/sales/customers/10951\",\"method\":\"PATCH\",\"status\":403,\"requestId\":\"\",\"timestamp\":\"2026-07-08T07:07:48.282Z\",\"responseExcerpt\":\"{\\\"code\\\":403,\\\"message\\\":\\\"黑名单客户不可编辑，请先解除黑名单\\\",\\\"error\\\":\\\"Forbidden\\\",\\\"statusCode\\\":403}\"},{\"url\":\"/api/v2/sales/customers/10951\",\"method\":\"PATCH\",\"status\":403,\"requestId\":\"\",\"timestamp\":\"2026-07-08T07:07:52.965Z\",\"responseExcerpt\":\"{\\\"code\\\":403,\\\"message\\\":\\\"黑名单客户不可编辑，请先解除黑名单\\\",\\\"error\\\":\\\"Forbidden\\\",\\\"statusCode\\\":403}\"},{\"url\":\"/api/v2/sales/customers/10951\",\"method\":\"PATCH\",\"status\":403,\"requestId\":\"\",\"timestamp\":\"2026-07-08T07:08:03.387Z\",\"responseExcerpt\":\"{\\\"code\\\":403,\\\"message\\\":\\\"黑名单客户不可编辑，请先解除黑名单\\\",\\\"error\\\":\\\"Forbidden\\\",\\\"statusCode\\\":403}\"},{\"url\":\"/api/v2/sales/customers/10951\",\"method\":\"PATCH\",\"status\":403,\"requestId\":\"\",\"timestamp\":\"2026-07-08T07:08:22.687Z\",\"responseExcerpt\":\"{\\\"code\\\":403,\\\"message\\\":\\\"黑名单客户不可编辑，请先解除黑名单\\\",\\\"error\\\":\\\"Forbidden\\\",\\\"statusCode\\\":403}\"},{\"url\":\"/api/v2/sales/customers/10951\",\"method\":\"PATCH\",\"status\":403,\"requestId\":\"\",\"timestamp\":\"2026-07-08T07:08:23.769Z\",\"responseExcerpt\":\"{\\\"code\\\":403,\\\"message\\\":\\\"黑名单客户不可编辑，请先解除黑名单\\\",\\\"error\\\":\\\"Forbidden\\\",\\\"statusCode\\\":403}\"},{\"url\":\"/api/v2/sales/customers/10951\",\"method\":\"PATCH\",\"status\":403,\"requestId\":\"\",\"timestamp\":\"2026-07-08T07:08:24.376Z\",\"responseExcerpt\":\"{\\\"code\\\":403,\\\"message\\\":\\\"黑名单客户不可编辑，请先解除黑名单\\\",\\\"error\\\":\\\"Forbidden\\\",\\\"statusCode\\\":403}\"},{\"url\":\"/api/v2/sales/customers/10951\",\"method\":\"PATCH\",\"status\":403,\"requestId\":\"\",\"timestamp\":\"2026-07-08T07:08:25.140Z\",\"responseExcerpt\":\"{\\\"code\\\":403,\\\"message\\\":\\\"黑名单客户不可编辑，请先解除黑名单\\\",\\\"error\\\":\\\"Forbidden\\\",\\\"statusCode\\\":403}\"},{\"url\":\"/api/v2/sales/customers/10951\",\"method\":\"PATCH\",\"status\":403,\"requestId\":\"\",\"timestamp\":\"2026-07-08T07:10:32.406Z\",\"responseExcerpt\":\"{\\\"code\\\":403,\\\"message\\\":\\\"黑名单客户不可编辑，请先解除黑名单\\\",\\\"error\\\":\\\"Forbidden\\\",\\\"statusCode\\\":403}\"},{\"url\":\"/api/v2/sales/customers/10951\",\"method\":\"PATCH\",\"status\":403,\"requestId\":\"\",\"timestamp\":\"2026-07-08T07:11:36.400Z\",\"responseExcerpt\":\"{\\\"code\\\":403,\\\"message\\\":\\\"黑名单客户不可编辑，请先解除黑名单\\\",\\\"error\\\":\\\"Forbidden\\\",\\\"statusCode\\\":403}\"},{\"url\":\"/api/v2/sales/customers/10951\",\"method\":\"PATCH\",\"status\":403,\"requestId\":\"\",\"timestamp\":\"2026-07-08T07:11:44.764Z\",\"responseExcerpt\":\"{\\\"code\\\":403,\\\"message\\\":\\\"黑名单客户不可编辑，请先解除黑名单\\\",\\\"error\\\":\\\"Forbidden\\\",\\\"statusCode\\\":403}\"},{\"url\":\"/api/v2/sales/customers/10951\",\"method\":\"PATCH\",\"status\":403,\"requestId\":\"\",\"timestamp\":\"2026-07-08T07:12:06.660Z\",\"responseExcerpt\":\"{\\\"code\\\":403,\\\"message\\\":\\\"黑名单客户不可编辑，请先解除黑名单\\\",\\\"error\\\":\\\"Forbidden\\\",\\\"statusCode\\\":403}\"},{\"url\":\"/api/v2/sales/customers/10951\",\"method\":\"PATCH\",\"status\":403,\"requestId\":\"\",\"timestamp\":\"2026-07-08T07:12:07.569Z\",\"responseExcerpt\":\"{\\\"code\\\":403,\\\"message\\\":\\\"黑名单客户不可编辑，请先解除黑名单\\\",\\\"error\\\":\\\"Forbidden\\\",\\\"statusCode\\\":403}\"},{\"url\":\"/api/v2/sales/customers/10951\",\"method\":\"PATCH\",\"status\":403,\"requestId\":\"\",\"timestamp\":\"2026-07-08T07:12:11.058Z\",\"responseExcerpt\":\"{\\\"code\\\":403,\\\"message\\\":\\\"黑名单客户不可编辑，请先解除黑名单\\\",\\\"error\\\":\\\"Forbidden\\\",\\\"statusCode\\\":403}\"},{\"url\":\"/api/system/online-count\",\"method\":\"GET\",\"status\":502,\"requestId\":\"\",\"timestamp\":\"2026-07-08T07:13:55.183Z\",\"responseExcerpt\":\"<html>\\r\\n<head><title>502 Bad Gateway</title></head>\\r\\n<body>\\r\\n<center><h1>502 Bad Gateway</h1></center>\\r\\n<hr><center>nginx</center>\\r\\n</body>\\r\\n</html>\\r\\n<!-- a padding to disable MSIE and Chrome friendly error page -->\\r\\n<!-- a padding to disable MSIE and Chrome friendly error page -->\\r\\n<!-- a padding to disable MSIE and Chrome friendly error page -->\\r\\n<!-- a padding to disable MSIE and Chrome friendly error page -->\\r\\n<!-- a padding to disable MSIE and Chrome friendly error page -->\\r\\n<!-- a padding to disable MSIE and Chrome friendly error page -->\\r\\n\"},{\"url\":\"/api/notifications/unread-count\",\"method\":\"GET\",\"status\":502,\"requestId\":\"\",\"timestamp\":\"2026-07-08T07:13:55.183Z\",\"responseExcerpt\":\"<html>\\r\\n<head><title>502 Bad Gateway</title></head>\\r\\n<body>\\r\\n<center><h1>502 Bad Gateway</h1></center>\\r\\n<hr><center>nginx</center>\\r\\n</body>\\r\\n</html>\\r\\n<!-- a padding to disable MSIE and Chrome friendly error page -->\\r\\n<!-- a padding to disable MSIE and Chrome friendly error page -->\\r\\n<!-- a padding to disable MSIE and Chrome friendly error page -->\\r\\n<!-- a padding to disable MSIE and Chrome friendly error page -->\\r\\n<!-- a padding to disable MSIE and Chrome friendly error page -->\\r\\n<!-- a padding to disable MSIE and Chrome friendly error page -->\\r\\n\"},{\"url\":\"/api/v2/sales/pricing/books/363/submit\",\"method\":\"POST\",\"status\":400,\"requestId\":\"\",\"timestamp\":\"2026-07-08T07:20:30.694Z\",\"responseExcerpt\":\"{\\\"code\\\":400,\\\"message\\\":\\\"价格册无有效明细，不可提交审批\\\",\\\"error\\\":\\\"Bad Request\\\",\\\"statusCode\\\":400}\"},{\"url\":\"/api/v2/sales/pricing/books/363/submit\",\"method\":\"POST\",\"sta\n...[truncated by bug-intake contract builder]",
    "clientContext": {
      "language": "zh-CN",
      "timezone": "Asia/Shanghai",
      "viewport": {
        "width": 1600,
        "height": 865
      },
      "userAgent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Safari/537.36",
      "capturedAt": "2026-07-08T07:23:38.149Z",
      "pageSnapshot": {
        "route": "/sales2/pricing",
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
          "pasted-screenshot-1783495365133-1.png",
          "退出",
          "销售系统",
          "/价格管理",
          "/",
          "·价格册 · 价格明细 · 统一定价引擎 · 按公司隔离数据",
          "·",
          "编号",
          "名称",
          "渠道",
          "客户",
          "优先级",
          "生效日",
          "失效日",
          "状态",
          "操作",
          "PB-20260708-00001",
          "孟赛标准价格册（试运行版）重建",
          "默认 (100)",
          "(100)",
          "2026/5/30",
          "2026/12/31",
          "草稿",
          "编辑 提交审批 取消",
          "PB-MENGSE-2026-STD",
          "孟赛标准价格册（试运行版）",
          "—",
          "已取消"
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
            "path": ".sidebar-module__C8A-ya__subItem.",
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
            "path": ".sidebar-module__C8A-ya__subItem.sidebar-module__C8A-ya__subActive",
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
              "x": 767,
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
              "w": 91,
              "x": 244,
              "y": 145
            },
            "label": "价格册",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 38,
              "w": 104,
              "x": 339,
              "y": 145
            },
            "label": "价格明细",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 38,
              "w": 130,
              "x": 447,
              "y": 145
            },
            "label": "当前生效价格",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 38,
              "w": 104,
              "x": 581,
              "y": 145
            },
            "label": "价格异常",
            "disabled": false
          },
          {
            "tag": "input",
            "path": "",
            "rect": {
              "h": 34,
              "w": 1005,
              "x": 244,
              "y": 203
            },
            "label": "搜索价格册名称 / 编号…",
            "disabled": false
          },
          {
            "tag": "select",
            "path": "",
            "rect": {
              "h": 34,
              "w": 94,
              "x": 1259,
              "y": 203
            },
            "label": "全部状态 草稿 审批中 已批准 生效中 已失效 已取消",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 34,
              "w": 83,
              "x": 1363,
              "y": 203
            },
            "label": "刷新",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnPrimary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 34,
              "w": 120,
              "x": 1456,
              "y": 203
            },
            "label": "新建价格册",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 23,
              "w": 40,
              "x": 1359,
              "y": 315
            },
            "label": "编辑",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".admin-ui-module__B-1PDG__btnSecondary.admin-ui-module__B-1PDG__btn",
            "rect": {
              "h": 23,
              "w": 62,
              "x": 1403,
              "y": 315
            },
            "label": "提交审批",
            "disabled": false
          },
          {
            "tag": "button",
            "path": "",
            "rect": {
              "h": 23,
              "w": 40,
              "x": 1469,
              "y": 315
            },
            "label": "取消",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".rightDrawer-module__jI_Bsa__closeBtn",
            "rect": {
              "h": 32,
              "w": 32,
              "x": 2068,
              "y": 16
            },
            "label": "关闭抽屉",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".phx-select",
            "rect": {
              "h": 38,
              "w": 232,
              "x": 1869,
              "y": 110
            },
            "label": "加载中… 老挝凤凰农业发展有限公司 老挝凤凰食品集团有限公司 老挝东鹏县星驰农业发展有限公司",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".phx-select",
            "rect": {
              "h": 38,
              "w": 232,
              "x": 1869,
              "y": 191
            },
            "label": "加载中… 孟赛直营渠道（CH-MS-DIRECT） 孟赛经销商渠道（CH-MS-DIST）",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".phx-select",
            "rect": {
              "h": 38,
              "w": 232,
              "x": 1621,
              "y": 272
            },
            "label": "加载中… 测试客户2（CUS-00002） 中铁路（CUS-CORP-001） 十八号仓库（CUS-DIST-001） 李潇蔬菜（CUS-DIST-002） 吴晓斌蔬菜（CUS-DIST-003） 阿香内（CUS-DIST-004） 阿慧（CUS-DIST-005） 向老头（CUS-DIST-006） 孟嗯（CUS-D",
            "disabled": false
          },
          {
            "tag": "select",
            "path": ".crudForm-module__v3To_q__input.",
            "rect": {
              "h": 38,
              "w": 232,
              "x": 1869,
              "y": 272
            },
            "label": "请选择 最高优先 - 特批价 / 临时重点客户，最先匹配 优先 - 客户专属价 / 渠道专属价，优先匹配 默认 - 日常价格册，推荐默认使用 备用 - 兜底或待启用价格，最后匹配",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".crudForm-module__v3To_q__btnCancel",
            "rect": {
              "h": 44,
              "w": 158,
              "x": 1621,
              "y": 525
            },
            "label": "取消",
            "disabled": false
          },
          {
            "tag": "button",
            "path": ".crudForm-module__v3To_q__btnSubmit",
            "rect": {
              "h": 44,
              "w": 309,
              "x": 1791,
              "y": 525
            },
            "label": "保存",
            "disabled": false
          }
        ]
      },
      "devicePixelRatio": 2
    },
    "localEvidence": {
      "localAttachmentPaths": []
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
    "approvedAt": "2026-07-12T16:17:38.360Z",
    "approvedBy": "bug_intake_runner",
    "redispatch": true,
    "approvalScope": "Replay already-integrated repair evidence after semantic evidence classifier completion.",
    "redispatchCount": 7,
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
