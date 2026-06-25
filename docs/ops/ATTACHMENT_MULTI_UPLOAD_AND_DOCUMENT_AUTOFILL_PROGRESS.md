# 多附件上传复用与合同识别填表进展

## 本轮目标

1. 将采购申请/采购单据中已验证的多附件上传能力抽成标准能力，并复用到类似上传位置。
2. 启动合同/图片识别填表能力，先完成标准化入口和安全边界，再逐步接入 OCR/AI 引擎。

## 已完成

### 标准多附件上传

- 新增 `apps/web/src/lib/attachments.ts`
  - `parseAttachmentRefs`：兼容历史单字符串、JSON 数组字符串、真实数组。
  - `serializeAttachmentRefs`：支持 `array` / `json-string` / `single-string` 三种存储模式。
  - `isUnsafeAttachmentRef`：统一识别 `/uploads`、`http(s)` 裸链接。
  - `isProtectedFileRef`：统一识别 `FILE-*` 受控附件引用。

- 新增 `apps/web/src/components/design-system/forms/ManagedAttachmentUploader.tsx`
  - 包装现有 `AttachmentUploader`。
  - 页面无需再手写 “取最后一个附件” 逻辑。
  - 支持多附件上传、历史单附件显示、JSON 字符串存储。

- 已复用到以下位置：
  - 采购付款单：付款凭证支持多附件。
  - 股东资金模块：出资凭证支持多附件。
  - 通用 `CrudForm` 的 `upload` 字段：由旧单文件 `FileUploadInput` 升级为统一多附件上传。

### 保留原功能但不盲目替换的范围

- 品牌 Logo、Excel 导入、CSV/XLS 初始化导入不属于业务凭证/合同/图片附件，不纳入多附件上传。
- 移动端配送拍照属于拍照业务流程，后续单独评估，不直接替换为合同/凭证上传。
- Shareholder Capital 已使用多附件数组模型，本轮不做重复改造。

## 合同/图片识别填表 V1

### 后端标准入口

新增：

- `apps/api/src/modules/document-intelligence/document-intelligence.module.ts`
- `apps/api/src/modules/document-intelligence/document-intelligence.controller.ts`
- `apps/api/src/modules/document-intelligence/document-intelligence.service.ts`

接口：

- `POST /api/document-intelligence/extract`

当前能力：

- 只接受受控 `FILE-*` 附件引用。
- 只读 `file_metadata`。
- 不返回 `rawUrl`。
- 不返回 `storage_path`。
- 不暴露 `/uploads`。
- 对本人上传的 `PENDING` 附件和已归属 `ACTIVE` 附件做受控识别。
- 采购合同场景支持文件名/元数据启发式建议：
  - `contractNo`
  - `contractNote`

当前限制：

- 尚未接入 OCR/AI 引擎。
- PDF/图片正文内容不会被伪造识别。
- 若只能从元数据得到低置信建议，前端会显示置信度和警告。

### 前端标准组件

新增：

- `apps/web/src/components/design-system/forms/DocumentAutofillPanel.tsx`

当前接入：

- 采购订单表单合同附件区域。
- 支持点击“识别合同并回填”。
- 支持应用建议到表单。
- 当前可回填：
  - 合同号
  - 合同摘要

## 后续计划

1. 接入 OCR/AI Provider 配置，支持 PDF 文字层和图片 OCR。
2. 增加字段模板：
   - 采购合同：供应商、金额、币种、交付日期、账期、合同号。
   - 付款申请：付款人、收款方、金额、币种、付款方式、摘要。
   - 股东资金凭证：股东、金额、币种、出资时间、资金类型。
3. 增加用户确认面板，不自动覆盖已有人工输入。
4. 增加识别审计日志：谁、何时、识别了哪些附件、回填了哪些字段。
5. 只在合同/凭证/图片信息录入场景开放，不用于 Logo、批量导入、配送拍照等非表单回填场景。

## 安全结论

- 是否返回裸 URL：否。
- 是否拼接 `/uploads`：否。
- 是否写 DB：否。
- 是否执行 migration：否。
- 是否部署：待验证通过后按现有 CI/CD 流程执行。
- 当前结论：GO WITH CONDITIONS。
