# g199 好业财接口权限体检报告

> **探测时间**: 2026-06-19T08:25:34.231Z
> **探测 bookid**: 3533914511118750(凤凰农业 — 权限是 app 级,任一家结果代表全部)
> **样本**: 141 个 GET-only 接口(纯读无副作用;含业务 ID 占位符的接口已跳过)
> **重跑**: `PHOENIX_ADMIN_TOKEN=<JWT> node scripts/g199-probe-chanjet-permissions.mjs`

## 总览

| 状态 | 数量 | 含义 | 行动 |
|---|---|---|---|
| ✅ OK | 27 | 接口已开通且可调 | 无 |
| ⚠️ NO_PERM(50111) | 107 | **接口未开通** | 去控制台勾选 |
| 🔧 BIZ_ERR_OPEN | 6 | 已开通,但 GET 参数不全(实为 list/query 类需 body) | 无(误报) |
| ❌ NOT_FOUND(50000) | 1 | 路径错或接口下架 | 字典需修正 |
| ⚠️ TOKEN_INVALID(50107) | 0 | openToken 失效 | 后端 cron 已自动 refresh |
| 💥 PROXY_FAIL | 0 | ERP 代理层失败 | 看 API 容器日志 |
| 💥 EXCEPTION | 0 | 网络/超时 | 重跑 |

## ⚠️ 待开通清单(去控制台勾选)

**操作**: 登录 https://open.chanjet.com/console/1242385451899027/selfApp/24959/apiPermission → 找下表接口勾选 → 保存

| ID | 方法 | 路径 | 名称 | 官方文档 |
|---|---|---|---|---|
| 31174 | `GET` | `/accounting/acctgplt/CashJournal/list/{bookid}` | 日记账查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzrjzgl?id=31174) |
| 32255 | `GET` | `/accounting/asr/CashFlow/{bookid}` | 现金流量表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=32255) |
| 32261 | `GET` | `/accounting/asr/Statistics/stateOfOperation/{bookid}` | 经营状况表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=32261) |
| 32272 | `GET` | `/accounting/asr/TaxFluctuate/query/{bookid}` | 纳税波动表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=32272) |
| 32275 | `GET` | `/accounting/asr/TaxFluctuate/queryTaxFluctuate/{bookid}` | 查询纳税波动表（参数为period） | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=32275) |
| 32256 | `GET` | `/accounting/asr/TaxStatistics/getTaxStatistics/{bookid}` | 纳税统计表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=32256) |
| 32646 | `GET` | `/accounting/document/Employee/me/{bookid}` | 按用户查询当前员工基础档案 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/employee?id=32646) |
| 31890 | `GET` | `/accounting/fin/getAllReport/{bookid}` | 获得报表定义 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=31890) |
| 31887 | `GET` | `/accounting/fin/getOldBalanceSheet/{bookid}` | 新版资产负债表接口 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=31887) |
| 31888 | `GET` | `/accounting/fin/getOldIncomeStatement/{bookid}` | 新版利润表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=31888) |
| 31891 | `GET` | `/accounting/fin/query/{bookid}` | 自定义报表接口 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=31891) |
| 31788 | `GET` | `/accounting/gl/AcctgTrans/acctgTransExactSearch/{bookid}` | （外部接口）凭证列表精确搜索 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=31788) |
| 31413 | `GET` | `/accounting/gl/AcctgTrans/acctgTransFuzzySearch/{bookid}` | 凭证列表模糊搜索 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=31413) |
| 31514 | `GET` | `/accounting/gl/AcctgTrans/countByPeriod/{bookid}` | 查询凭证期间汇总数量 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=31514) |
| 31446 | `GET` | `/accounting/gl/AcctgTrans/getAttcList/{bookid}` | 凭证附件列表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=31446) |
| 33438 | `GET` | `/accounting/gl/AcctgTrans/getNewAttcList/{bookid}` | 凭证附单据列表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=33438) |
| 31760 | `GET` | `/accounting/gl/acctgTransCategory/{bookid}` | 查询凭证类别 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=31760) |
| 32306 | `GET` | `/accounting/gl/BalanceSheet/check/{bookid}` | 资产负债表状态检查 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=32306) |
| 31810 | `GET` | `/accounting/gl/BalanceSheet/trialBalance/{bookid}` | （外部接口）试算平衡 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzkmjqcgl?id=31810) |
| 30246 | `GET` | `/accounting/gl/CashFlow/{bookid}` | 按期间查询现金流量表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=30246) |
| 32016 | `GET` | `/accounting/gl/ChronologicBook/query/{bookid}` | 序时账分页查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzzbgl?id=32016) |
| 30311 | `GET` | `/accounting/gl/glaccount/getInitBalanceList/{bookid}` | 获取所有科目及期初数据 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzkmjqcgl?id=30311) |
| 31806 | `GET` | `/accounting/gl/glaccount/getInitBalanceLists/{bookid}` | （外部接口）科目查询接口（支持单个和全部） | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzkmjqcgl?id=31806) |
| 19545 | `GET` | `/accounting/gl/IncomeStatement/{bookid}` | 获取损益表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=19545) |
| 31247 | `GET` | `/accounting/gl/statistics/pay/{bookid}` | 应付统计表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=31247) |
| 31863 | `GET` | `/accounting/gl/subaccountbalance/getInitBalanceLists/{bookid}` | （外部接口）科目期初辅助余额查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzkmjqcgl?id=31863) |
| 30453 | `GET` | `/accounting/gl/SubsidiaryLedge/queryPaging/{bookid}` | 明细账分页查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzzbgl?id=30453) |
| 31354 | `GET` | `/accounting/gl/TotalLedge/query/{bookid}` | 总账查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzzbgl?id=31354) |
| 32929 | `POST` | `/accounting/internal/cc/requiregoods/list/{bookid}` | 要货单列表查询（内部） | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=32929) |
| 32929 | `POST` | `/accounting/internal/cc/requiregoods/list/{bookid}` | 要货单列表查询（内部） | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=32929) |
| 32650 | `POST` | `/accounting/openapi/cc/contract/list/{bookid}` | 收入合同列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_xmht?id=32650) |
| 32650 | `POST` | `/accounting/openapi/cc/contract/list/{bookid}` | 收入合同列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_xmht?id=32650) |
| 32651 | `POST` | `/accounting/openapi/cc/contract/list/expenditureContract/{bookid}` | 支出合同列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/zcht?id=32651) |
| 32651 | `POST` | `/accounting/openapi/cc/contract/list/expenditureContract/{bookid}` | 支出合同列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/zcht?id=32651) |
| 32532 | `POST` | `/accounting/openapi/cc/contractCategory/list/{bookid}` | 合同分类列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/htfl?id=32532) |
| 32534 | `GET` | `/accounting/openapi/cc/contractCategory/remove/{bookid}` | 删除合同分类 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/htfl?id=32534) |
| 32489 | `POST` | `/accounting/openapi/cc/employee/list/{bookid}` | 查询员工列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/employee?id=32489) |
| 33167 | `POST` | `/accounting/openapi/cc/engineeringacceptance/list/{bookid}` | 工程验收单列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/sggl/gcysd?id=33167) |
| 32904 | `POST` | `/accounting/openapi/cc/expenditureconfirm/list/{bookid}` | 支出确认单列表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_xmht?id=32904) |
| 32904 | `POST` | `/accounting/openapi/cc/expenditureconfirm/list/{bookid}` | 支出确认单列表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_xmht?id=32904) |
| 33435 | `POST` | `/accounting/openapi/cc/expenditurecontract/list/expenditureContract/{bookid}` | 支出合同列表查询v2 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/zcht?id=33435) |
| 32633 | `POST` | `/accounting/openapi/cc/expenseType/list/{bookid}` | 查询费用类型列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/fylx?id=32633) |
| 32948 | `POST` | `/accounting/openapi/cc/expensetypecategory/list/{bookid}` | 费用类型分类列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/fylx?id=32948) |
| 32631 | `POST` | `/accounting/openapi/cc/finaccount/list/{bookid}` | 查询账号列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/zh?id=32631) |
| 33072 | `POST` | `/accounting/openapi/cc/fintransfer/list/{bookid}` | 银行存取款单查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/yhcqkd?id=33072) |
| 31636 | `POST` | `/accounting/openapi/cc/goodsissue/list/{bookid}` | 销货单列表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/xhd?id=31636) |
| 32867 | `POST` | `/accounting/openapi/cc/goodsissueinfo/list/{bookid}` | 销售渠道分析查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/30610?id=32867) |
| 31933 | `POST` | `/accounting/openapi/cc/goodsreceipt/list/{bookid}` | 进货单列表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/jhd?id=31933) |
| 32432 | `POST` | `/accounting/openapi/cc/inv/assembly/list/{bookid}` | 组装拆卸单列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=32432) |
| 32432 | `POST` | `/accounting/openapi/cc/inv/assembly/list/{bookid}` | 组装拆卸单列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=32432) |
| 32433 | `POST` | `/accounting/openapi/cc/inv/bom/list/{bookid}` | 物料清单列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/wlqd?id=32433) |
| 32394 | `POST` | `/accounting/openapi/cc/inv/finishedgoodsstock/list/{bookid}` | 产成品入库单列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/ccprkd?id=32394) |
| 33177 | `POST` | `/accounting/openapi/cc/inv/inventorycostadj/list/{bookid}` | 成本调整单列表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/cbtzd?id=33177) |
| 32386 | `POST` | `/accounting/openapi/cc/inv/materialstock/list/{bookid}` | 材料出库单列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/clckd?id=32386) |
| 32437 | `POST` | `/accounting/openapi/cc/inv/purchaseapply/list/{bookid}` | 采购申请单列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_cggl?id=32437) |
| 32437 | `POST` | `/accounting/openapi/cc/inv/purchaseapply/list/{bookid}` | 采购申请单列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_cggl?id=32437) |
| 32858 | `POST` | `/accounting/openapi/cc/inv/stockcount/list/{bookid}` | 盘点单列表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/pdd?id=32858) |
| 32398 | `POST` | `/accounting/openapi/cc/inv/stockin/list/{bookid}` | 其他入库单列表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/qtrkd?id=32398) |
| 32407 | `POST` | `/accounting/openapi/cc/inv/stockout/list/{bookid}` | 其他出库单列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/qtckd?id=32407) |
| 32390 | `POST` | `/accounting/openapi/cc/inv/stocktransfer/list/{bookid}` | 调拨单列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/dbd?id=32390) |
| 32356 | `POST` | `/accounting/openapi/cc/invoiceIssueList/list/{bookid}` | 销售发票列表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_xsgl?id=32356) |
| 32356 | `POST` | `/accounting/openapi/cc/invoiceIssueList/list/{bookid}` | 销售发票列表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_xsgl?id=32356) |
| 32632 | `POST` | `/accounting/openapi/cc/paymentmethodtype/list/{bookid}` | 查询结算方式列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/jsfs?id=32632) |
| 32950 | `POST` | `/accounting/openapi/cc/price/custpricescheme/list/{bookid}` | 客户价格查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_gjgl?id=32950) |
| 32767 | `GET` | `/accounting/openapi/cc/productFeatureType/queryAllProductFeatureType/{bookid}` | 商品属性查询接口 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/spsx?id=32767) |
| 32484 | `POST` | `/accounting/openapi/cc/project/list/{bookid}` | 项目列表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/project?id=32484) |
| 32951 | `POST` | `/accounting/openapi/cc/projectcategory/list/{bookid}` | 项目分类列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/project?id=32951) |
| 33043 | `POST` | `/accounting/openapi/cc/projectphaseexec/list/{bookid}` | 项目执行单列表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/xmzxd?id=33043) |
| 32520 | `POST` | `/accounting/openapi/cc/purchaseorder/list/{bookid}` | 采购订单列表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_cggl?id=32520) |
| 32520 | `POST` | `/accounting/openapi/cc/purchaseorder/list/{bookid}` | 采购订单列表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_cggl?id=32520) |
| 32792 | `POST` | `/accounting/openapi/cc/purchasestockin/list` | 采购入库单列表查询(过期) | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=32792) |
| 32792 | `POST` | `/accounting/openapi/cc/purchasestockin/list` | 采购入库单列表查询(过期) | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=32792) |
| 33283 | `POST` | `/accounting/openapi/cc/purchasestockin/list/{bookid}` | 采购入库单列表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/30644?id=33283) |
| 33339 | `POST` | `/accounting/openapi/cc/retailstock/list/{bookid}` | 查询零售出库单列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/lsgl/hyc_retailstock?id=33339) |
| 32992 | `POST` | `/accounting/openapi/cc/revenueCategory/list/{bookid}` | 收入类型分类列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/srlx?id=32992) |
| 32594 | `POST` | `/accounting/openapi/cc/revenueconfirm/list/{bookid}` | 收入确认单列表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/srqrd?id=32594) |
| 32996 | `POST` | `/accounting/openapi/cc/revenueType/list/{bookid}` | 查询收入类型列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/srlx?id=32996) |
| 32051 | `POST` | `/accounting/openapi/cc/salesorder/list/{bookid}` | 销售订单列表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/xsd?id=32051) |
| 32011 | `POST` | `/accounting/openapi/cc/salesorder/query/{bookid}` | 销售订单按外部编号查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/xsd?id=32011) |
| 32791 | `POST` | `/accounting/openapi/cc/salesstockout/list/{bookid}` | 销售出库单列表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=32791) |
| 32791 | `POST` | `/accounting/openapi/cc/salesstockout/list/{bookid}` | 销售出库单列表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=32791) |
| 33343 | `POST` | `/accounting/openapi/cc/v2/MpManufactureOrder/list` | 生产加工单查询列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/scjgd?id=33343) |
| 33342 | `POST` | `/accounting/openapi/cc/v2/MpManufactureOrder/query` | 生产加工单查看详情 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/scjgd?id=33342) |
| 33382 | `POST` | `/accounting/openapi/cc/v2/OmManufactureOrder/list` | 委外加工单查询列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/wwjgd?id=33382) |
| 33383 | `POST` | `/accounting/openapi/cc/v2/OmManufactureOrder/query` | 委外加工单查看详情 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/wwjgd?id=33383) |
| 33404 | `POST` | `/accounting/openapi/cc/v2/OtherAp/list` | 其他应付单查询列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/hyc_otherap?id=33404) |
| 33406 | `POST` | `/accounting/openapi/cc/v2/OtherAp/query` | 其他应付单查看详情 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/hyc_otherap?id=33406) |
| 33444 | `POST` | `/accounting/openapi/cc/v2/OutsourceIssue/list` | 委外发料单查询列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/wwf?id=33444) |
| 33443 | `POST` | `/accounting/openapi/cc/v2/OutsourceStockin/list` | 委外入库单查询列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/wwr?id=33443) |
| 33394 | `POST` | `/accounting/openapi/cc/v2/PaymentApplication/query` | 付款申请单查看详情 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/hyc_fksqd?id=33394) |
| 33447 | `POST` | `/accounting/openapi/cc/v2/PurchaseInvoiceIssue/list` | 采购发票查询列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/PurchaseInvoiceIssue?id=33447) |
| 33448 | `POST` | `/accounting/openapi/cc/v2/PurchaseInvoiceIssue/query` | 采购发票查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/PurchaseInvoiceIssue?id=33448) |
| 32541 | `POST` | `/accounting/openapi/cc/warehouse/list/{bookid}` | 查询仓库列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/ck?id=32541) |
| 32542 | `POST` | `/accounting/openapi/cc/warehouseCategory/list/{bookid}` | 查询仓库分类 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/ck?id=32542) |
| 32864 | `GET` | `/accounting/openapi/tenant/AcctgPeriod/bizDate/{bookid}` | 获取最新业务开始日期 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjzt/ztgl?id=32864) |
| 31812 | `GET` | `/accounting/payroll/payrollEmployee/outside/getPayrollList/{bookid}` | （外部接口） 精确查询工资 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzgzgl?id=31812) |
| 33332 | `POST` | `/cc/marketingtool/MtDistributor/List/{bookid}` | 分页查询分销员信息 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=33332) |
| 32321 | `GET` | `/cc/member/memberProfile/getMemberInfoById` | 根据会员ID查询会员详情 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=32321) |
| 32322 | `GET` | `/cc/member/memberProfile/getMeMemberIntegralDetailInfo` | 根据会员积分明细ID查询积分明细详情 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=32322) |
| 33367 | `GET` | `/cc/member/MeMemberType/findMemberTypeListForOpen` | 查询会员等级列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=33367) |
| 33264 | `POST` | `/cc/member/MeStorageCard/List/{bookid}` | 分页查询会员储值卡明细 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=33264) |
| 33069 | `GET` | `/cc/openapi/freevoucher/metalist/{bookid}` | 自定义表单元数据列表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/ggjk/zdybd?id=33069) |
| 33022 | `POST` | `/cc/openapi/freevoucher/query/{bookid}` | 自定义表单单行查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/ggjk/zdybd?id=33022) |
| 32180 | `GET` | `/cc/retail/mshop/list/{bookid}` | 根据会员ID查询会员消费明细 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=32180) |
| 31049 | `POST` | `/tplus/api/v2/DocType/Query` | 凭证类别查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=31049) |
| 31988 | `GET` | `/zplus/accounting/accountBook/{bookid}` | 获取账套信息 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjzt/ztgl?id=31988) |
| 31846 | `GET` | `/zplus/setup/openAccess/app/status` | 查询开通状态（触发初始化账套） | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjzt/ztgl?id=31846) |

## ❌ 路径错或下架

| ID | 路径 | 名称 |
|---|---|---|
| 32779 | `/accounting/openapi/cc/price/storeprice/v2/list/{bookid}` | 门店价格查询 |

