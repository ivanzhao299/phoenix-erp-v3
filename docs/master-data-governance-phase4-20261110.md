# 主数据治理阶段 4：产品关联 SKU 管理（2026-11-10）

基线：阶段 3 最终提交 `8cdf64808fef93c2a7381cbb123ad9ab4835c9c9`；分支 `codex/master-data-governance-20261110`。仅在指定隔离工作树实施。未改协调记录、共享依赖、版本声明、schema/entity/dict、冻结迁移或生产数据。没有 push、部署或 tag；包装库存身份、托/箱数量换算留给阶段 5。

## 1. 问题与本阶段范围

产品详情原来请求 `/product-master/skus?product_code=:code&limit=10`，实际走业务 ACTIVE/有效期/父档可用性查询，再把返回数组 length 当总数。它不能表示全状态关联量，且与前十条展示含义混淆。独立 SKU 中心只有状态过滤，不能按父产品连续管理；SKU 前端权限也未完整镜像阶段 2 的旧菜单映射。

本阶段将产品列表、产品详情、独立 SKU 中心和共用新建表单连通：

- 产品列表每行按 SKU V 显示“SKU/销售规格”入口；点击产品编码仍打开既有产品详情。
- 产品详情的“SKU/销售规格”关联区域独立加载管理数据，显示准确总数、非零状态数量、前十条及每条历史状态。进入管理可查看全部，单条链接用 `sku_code` 打开原 SKU 详情抽屉；列表原有编辑、冻结、恢复、归档继续使用同一个 RuntimePanel。
- 新建入口单独按 C 显示，仅 ACTIVE 父产品显示上下文创建；产品未启用时明确显示状态及不能新建的原因。
- SKU 中心保留全局入口，增加共享 ProductSelector 过滤和清除按钮，支持 URL `product_code`；产品过滤变化、状态变化回到第一页，分页继续读取当前过滤条件。URL 查询改变重新建立页面状态，保存回列表保留产品过滤和既有刷新标记。
- SKU 中心显示同源的全状态数量和筛选后总量，不再依赖与当前产品过滤无关的全局 operations 卡片。页面文案区分“产品主档”“SKU/销售规格”“采购物料”，不展示内部实现说明。

核心文件：`apps/web/src/components/master-data/{ProductSkuAssociation,SkuManagementPage,SkuCreatePage}.tsx`；原产品/SKU page 负责接入；`detail-configs.tsx:productConfig` 移除旧样本 KPI 和 ACTIVE extraApi。

## 2. 管理读取与权限

新增 `GET /api/master-data/runtime/sku/management`，在通用 `/:type/:code` 前注册，由既有 MasterDataTypeGuard 按 GET→V 守卫；service 对非 sku 类型拒绝。业务 `/product-master/skus?status=ACTIVE` 与阶段 3 交易可用性查询保持原语义，未用于新管理列表。

管理查询只接受 `product_code/status/page/pageSize`：参数绑定，不接受 `where`、SQL 片段或任意列过滤；未知参数、非法状态、空/空白产品编码、重复分页参数及非正整数分页拒绝。每页默认 20，上限 100；页码上限 1,000,000。

一个 SQL statement 内计算：

| 响应 | 含义 |
| --- | --- |
| items | 当前产品及状态筛选后的分页；按更新时间和 SKU 编码排序，JSON 聚合内部也显式排序 |
| total | 当前产品及状态筛选后的准确数量，不取 items.length |
| relatedTotal | 当前产品过滤下的全部状态数量 |
| statusCounts | 当前产品过滤下的各状态数量，包含历史 FROZEN/ARCHIVED 等，不套交易可用性过滤 |

同一 SQL 快照使分页、总数和状态数量保持一致。空结果、超出末页都保留准确总量；查询异常直接失败，不伪装为零。

前端 `useSkuPermission` 镜像阶段 2 的显式兼容规则：

| 操作 | 新菜单 | 旧菜单 |
| --- | --- | --- |
| 管理读取/详情 | MENU_MD_SKU:V | MENU_MASTER_SKU:V |
| 新建 | MENU_MD_SKU:C | MENU_MASTER_SKU:E |
| 编辑/状态 | MENU_MD_SKU:E | MENU_MASTER_SKU:E |

不从 V 推导 C，也不从 C/E 推导 V。ROLE_ADMIN/通配沿用 usePermission 和服务端既有语义。只有产品权限时，产品详情不请求管理 SKU 数据、不渲染 SKU 明细；关联区提示无查看权限，不让整个产品抽屉失败。SKU C-only 用户可进入共用新建页，管理列表与 SKU 详情仍不可见。

SKU 仍为全局共享主数据，无新增公司/仓库维度。相关 HTTP 测试证明产品权限、销售权限、SKU C/E、旧 SKU E 都不能获得管理读取权，只有新/旧显式 V 允许。

## 3. 上下文新建与历史兼容

新路由 `/master-data/product-skus/new?product_code=...` 复用阶段 3 `skuFields(t)` 和现有 MasterDataFormPage；没有新建第二套 SKU 写入、编辑或状态规则。

- 有产品 V：读取产品 Runtime 详情，以便明确显示 FROZEN/ARCHIVED/DRAFT 等状态。没有产品 V、但有 SKU C：使用已开放的最小 ACTIVE 产品 lookup 核验并带出权威名，避免额外要求产品管理权限；找不到时明确提示不存在/未启用/信息不完整，不尝试读取未授权的历史详情。
- 精确核对返回父编码；权威名称与 SkuWriter 一致，优先 product_name_zh，再用 product_name。上下文中的 product_code、product_name 均 readonly；等级/规格继续使用共享选择器，默认 SKU 名称沿用阶段 3 规则。
- 父档不存在、未启用、查询失败、返回编码不匹配或显式空 `product_code=` 均阻止表单出现；不会清空父产品后落入另一产品。普通全局 `/new` 才提供产品选择器。
- 旧 `?create=1` 对 SKU 统一跳转新建页，保留父参数（含显式空串）交新页核验；关闭旧空白新增抽屉绕道。其他主数据保留原快速抽屉行为。
- 保存仍 POST 既有 Runtime，进入阶段 2 SkuWriter 的事务锁与权威引用校验；页面核验后父档再冻结，也不能绕过保存校验。已有 SKU 的历史编码、产品名称、等级/规格仍由原编辑/详情展示；没有把管理列表换成 ACTIVE lookup。
- 共用表单分组 memo 改为依赖实际 allFields，确保追加的多语言字段按现有配置分组；initialRow 保持稳定，不在选择等级/规格后重置表单。

## 4. 行为、字段与引用审计

新增真实 React DOM/jsdom 测试 `product-sku-management.test.tsx`（**22 项**），使用真实 ProductRuntimePage、SKU Next page、RuntimePanel、详情抽屉、共用表单/字段/选择器；只替换 API、认证状态、导航及语言上下文。覆盖：

- 27 条关联记录、十条预览、准确总数、冻结/归档数量及链接；产品列表进入关联管理与详情。
- URL 产品过滤/清除、翻页、产品/状态改变回第一页、直接单条 SKU query，以及慢旧列表返回不能覆盖新产品。
- 新/旧权限映射、只有产品 V、只有 SKU C、只有 SKU V、旧 SKU E/V；未授权 SKU list/detail 不发请求。
- 既有编辑抽屉和 restore transition 请求；新建权威名称/编码只读、默认名、保存 payload 和保留过滤后的返回刷新。
- SKU C 无产品 V 仍可通过最小 lookup 新建；冻结/归档/草稿父档、缺失或错配父档、显式空参数、旧 create=1 正常及空参数绕道、接口失败；全局新建保留共享产品选择器。

新增 HTTP/服务行为测试 `sku-management.spec.ts`（**20 项**）：真实 Nest/Passport JWT/Runtime guard/controller/service，数据库接口替身；覆盖新旧 V、C/E/其他菜单拒绝、未认证、分页及全状态响应、参数化注入字符串、清除过滤、非法参数、查询异常及非 SKU 类型拒绝。SQL 执行语义另由下面的真实 PostgreSQL 检查补足。

真实字段审计扫描 8 文件：产品 page、SKU page/new page、sku-fields、SkuCreatePage、SkuManagementPage、ProductSkuAssociation、RuntimePanel。窄正则 `<input[^>]*(product_code|grade_code|spec_code)` 每文件 **0**；`onChange[^\n]*e\.target\.value[^\n]*(product_code|grade_code|spec_code)` 每文件 **0**。另实际核对配置：三种 product/grade/spec 选择器、product_name readonly、新上下文 product_code readonly、两个页面共用 skuFields、共用表单/管理面板；不是只用正则空结果宣称完成。

引用/写入口核对：新查询仅 SELECT；`productConfig` 不再请求 ACTIVE SKU 样本；本阶段无直接 SKU 写 SQL。对本阶段关联的 Runtime service 和 SkuWriter 扫描，SKU 字面 INSERT/UPDATE 仍为阶段 2 SkuWriter 的 **3** 处；其他既有写入口未改变。业务 ACTIVE lookup、服务器保存权威校验及历史字段行为由已有 sku-fields/lookup/SkuWriter 回归同跑验证。

## 5. 实际验证

环境 Node **20.20.2**，使用已存在的 CLI/隔离依赖；未安装或修改共享依赖。

| 检查 | 实际结果 |
| --- | --- |
| API Jest | **8 suites，161/161 通过**，退出 0；包含新管理 HTTP、SKU/类型权限、Runtime 投影、引用、SkuWriter、模块及 lookup；`tmp/phase4-jest.json` |
| Web Vitest | **5 files，50/50 通过**，退出 0；22 新 DOM + 6 sku-fields + 18 选择器 + 3 list-refresh + 1 selector-pick；`tmp/phase4-vitest.json` |
| API tsc | **退出 0，0 errors**，`node apps/api/node_modules/typescript/bin/tsc --project apps/api/tsconfig.json --noEmit --incremental false` |
| Web tsc | **退出 0，0 errors**，同样使用 Web project CLI；最后空父参数兼容收口后再跑通过 |
| API 修改文件 ESLint | **3 files，0 errors / 45 warnings，退出 0**；既有 any 与测试替身等告警；`tmp/phase4-api-lint.json` |
| Web changed / 相关 lint | **PASS**，相对阶段 3 修改 12 个 TS/TSX 文件，现有 **40 errors / 3 warnings**，无债务增长；新增文件 zero-error；`tmp/phase4-web-changed.log` |
| Web ratchet | **PASS，823 errors / 472 warnings / 197 error files**；未更新 baseline、降规则或加 suppression；`tmp/phase4-web-ratchet.log` |
| PostgreSQL 18 | **6/6 真实 SQL 检查通过**：P1 23 条（13 ACTIVE/7 FROZEN/3 ARCHIVED）及 P2 1 条；十条页仍总量 23、第三页三条、状态筛选 7/关联总量 23、未知产品零、清除全局 24、超页空 items 仍总量 23。临时本地容器无生产连接，已停止移除 |
| PostgreSQL 证据一致性 | 从当前 listSkuManagement 提取原 SQL，SHA256 `057cfeea6c511abc38591ed176ea855eb05ec538d842fc01ae7107bcc9bd799e` 与 `tmp/sku-management-pg-result.json` 一致；本执行会话再次运行协调者留存的临时检查脚本通过，不把 SQL 层验证写成整个 HTTP/数据库集成 |
| scope / 字段 / diff | 上述真实 HTTP 权限隔离与 8 文件配置/输入审计均通过；`git diff --check` 通过 |
| 独立只读审查 | 多轮 reviewer 检查权限、全状态总量、SQL 参数化、父档、慢请求、旧 create 参数。已修复其发现的额外产品 V 依赖、聚合排序和旧新增绕道（含空父参数）；未派写者 |

未执行：全量 API/Web 单测、构建、浏览器截图/人工 UAT、整个 HTTP→真实 PostgreSQL 的端到端服务验证、需要运行 API 与测试账号的完整 `scope-audit.sh`、生产数据/性能/部署验证。SKU 全局主档没有新增公司 scope，不将权限测试误称为全业务 scope-audit。

## 6. 八题答复及阶段交接

1. **十条预览能代表总量吗？** 不能。总数与状态数量由服务端独立计算；22 个 DOM 测试包含 27 条记录，真实 PG 另用 23 条核验。
2. **能管理停用和历史 SKU 吗？** 能。管理读取无 ACTIVE/日期/父档过滤，状态筛选和全状态摘要含冻结/归档；业务选择器仍按阶段 3 规则。
3. **能按产品管理并回到全局吗？** 能。产品列表/详情连续进入，URL/共享选择器过滤、清除、分页、刷新均实际测试；独立 SKU 中心保留。
4. **只有产品权限会失败或看见 SKU 详情吗？** 产品基础信息继续展示，不请求 SKU 管理接口、不渲染明细；C/V 分别控制创建/管理链接，旧权限按显式映射兼容。
5. **上下文是否可能丢掉父产品？** 已核验父编码/权威名并只读；无效父档和空参数明确阻断，旧 create=1 同样转入校验；保存由原服务器事务重检。
6. **是否另建 CRUD 或可手写编码？** 没有。新建共用 skuFields/MasterDataFormPage，编辑/状态共用 RuntimePanel/Runtime/SkuWriter，产品关联编码来自选择器或只读上下文。
7. **是否影响历史身份和包装库存？** 未改写历史、未改包装库存身份/数量；旧描述字段仍展示。托/箱及库存单位问题交阶段 5。
8. **是否可直接视为生产发布通过？** 不能。当前为本地实现和上述验证完成；性能、整服务 UAT、生产发布门禁仍由协调与受控发布流程负责。

## 7. 提交范围

本阶段 **15 个 TS/TSX 文件 + 本报告，共 16 文件**，仅显式 stage：API Runtime controller/service、新管理测试；产品与 SKU page、新 SKU new page；共用 RuntimePanel/详情抽屉/表单、产品 detail config；ProductSkuAssociation/SkuManagementPage/SkuCreatePage、新 DOM 测试和 useSkuPermission。提交 `fix: connect products with sku management`。不提交依赖链接、tmp、协调报告或其他阶段文件；不 push、不 tag。
