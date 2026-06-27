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
- 优先尝试服务器本地文本抽取：
  - PDF：`pdftotext -layout <file> -`
  - 图片：`tesseract <file> stdout -l chi_sim+eng`
  - 如果工具未安装或正文不可抽取，安全降级，不伪造正文识别结果。
- 采购合同场景支持文件名、元数据、可抽取正文的启发式建议：
  - `subject`
  - `supplierName`
  - `contractNo`
  - `currencyCode`
  - `totalAmount`
  - `expectedDate`
  - `payDeadline`
  - `contractNote`

当前限制：

- 尚未接入云端 OCR/AI Provider。
- 当前依赖服务器本地 `pdftotext` / `tesseract`，生产镜像若未安装会降级为元数据建议。
- PDF 扫描件和图片合同需要 OCR 工具或后续 AI Provider 才能识别正文。
- 若只能得到低置信建议，前端会显示置信度和警告。

### 前端标准组件

新增：

- `apps/web/src/components/design-system/forms/DocumentAutofillPanel.tsx`

当前交互：

1. 用户先上传合同 / 图片 / PDF 附件。
2. 用户手动点击“开始识别”，不会在上传后自动识别或自动回填。
3. 识别结果进入“待人工审核”区域。
4. 用户逐项勾选确认需要回填的字段。
5. 用户点击“确认无误并回填选中字段”后，组件才调用页面的 `onApply`。
6. 回填后仍需人工核对表单，再点击页面保存按钮。

这个流程用于避免 OCR / AI 误识别直接写入业务表单。组件本身是标准化能力，后续付款申请、股东资金凭证、合同类信息录入页都应复用同一套“识别 -> 审核 -> 勾选 -> 回填 -> 保存”链路。

当前采购订单接入：

- 采购订单表单合同附件区域。
- 支持点击“识别合同信息”。
- 支持人工审核后应用建议到表单。
- 当前可自动回填：
  - 采购主题
  - 合同号
  - 币种
  - 期望到货日
  - 付款截止日
  - 合同摘要
  - 采购明细行：物料名称、规格、数量、单位、单价、小计（仅在合同正文能抽取出明细时生成建议）
- 当前仅展示建议、不自动覆盖：
  - 供应商：必须经 `SupplierSelector` 选中主数据，避免名称误匹配。
  - 合同金额：采购订单金额来自明细行合计，不直接覆盖明细。

### 人工审核边界

- 上传附件不会自动写入任何表单字段。
- OCR / 文本抽取结果不会越过人工确认。
- 未勾选字段不会回填。
- 供应商、金额等高风险字段即使识别出来，也只能作为人工参考，不直接覆盖主数据选择器和订单明细合计。
- 采购明细建议会回填到原有采购明细表，不新增无关文本框；缺失的必填字段仍由页面保存校验拦截并要求人工补齐。
- 保存业务单据仍以页面主保存按钮为准，识别组件不直接保存业务数据。

### 采购明细与物料主数据体验

- 采购明细“物料名称”列继续复用 `MaterialPicker`。
- 输入关键词即可快速查询已有物料主数据。
- 找不到完全匹配项时，下拉直接出现“新建物料”入口。
- 新建成功后自动带回物料名称、物料编码、规格、单位，并回填当前明细行。
- OCR 识别出的明细行如果还没有物料编码，先回填名称/规格/数量等文本信息；用户可在该行继续通过 `MaterialPicker` 搜索匹配或就地新建物料主数据。

## 后续计划

1. 在生产镜像安装并验证 `pdftotext` / `tesseract`，或接入受控 OCR/AI Provider。
2. 增加字段模板：
   - 付款申请：付款人、收款方、金额、币种、付款方式、摘要。
   - 股东资金凭证：股东、金额、币种、出资时间、资金类型。
3. 增加识别审计日志：谁、何时、识别了哪些附件、回填了哪些字段。
4. 只在合同/凭证/图片信息录入场景开放，不用于 Logo、批量导入、配送拍照等非表单回填场景。
5. 为更多模块建立字段模板和应用白名单，避免在不该使用识别填表的上传场景误开放。

## 安全结论

- 是否返回裸 URL：否。
- 是否拼接 `/uploads`：否。
- 是否写 DB：否。
- 是否执行 migration：否。
- 是否部署：待验证通过后按现有 CI/CD 流程执行。
- 当前结论：GO WITH CONDITIONS。
