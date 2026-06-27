# 好业财(zplus)接口对接字典 v1

> **数据源**: open.chanjet.com 官方文档(2026-06-19 抓取)
> **接口总数**: 416(zplus type=api,manifest 全集)
> **本地 markdown**: `scripts/.chanjet-doc-dump/zplus/<id>__<title>.md`(已 gitignore)
> **官方 manifest**: https://open.chanjet.com/md/docs-manifest.json
> **官方 AI 协议**: https://open.chanjet.com/llms.txt(支持 `?inline=true` 一键打包 + `/md/manifest/search` 模糊检索)

---

## 目录

| 分类码 | 中文 | 接口数 |
|---|---|---|
| [`ggjk`](#ggjk) | 公共接口(单据审核/弃审/删除/自定义表单) | 17 |
| [`hyc_pjjk`](#hyc_pjjk) | 凭据查询(销货/销售订单/发票列表内部接口) | 43 |
| [`hycgdzc`](#hycgdzc) | 固定资产(新增 / 删除 / 清理 / 查询) | 4 |
| [`hycjggl`](#hycjggl) | 价格管理(门店 / 客户价格) | 1 |
| [`hyczzgl`](#hyczzgl) | 总账与会计(科目 / 期初 / 凭证 / 工资 / 报表) | 53 |
| [`lsgl`](#lsgl) | 零售管理(门店 / POS / 零售出库) | 8 |
| [`sggl`](#sggl) | 施工管理(工程验收单) | 1 |
| [`sjgl`](#sjgl) | 生产加工(生产单 / BOM 类工单) | 24 |
| [`xmht`](#xmht) | 项目合同(项目主档 / 合同 / 执行单) | 31 |
| [`zjcggl`](#zjcggl) | 采购管理(采购订单 / 入库单 / 申请单 / 退货单 / 发票) | 23 |
| [`zjjcda`](#zjjcda) | 基础档案 / 主数据(部门 / 客户 / 供应商 / 存货 / 仓库 / 计量单位 / 品牌 / 项目类别 等) | 102 |
| [`zjkcgl`](#zjkcgl) | 库存管理(出入库 / 调拨 / 盘点 / 报损 / 材料出库) | 53 |
| [`zjxsgl`](#zjxsgl) | 销售管理(销货单 / 退货单 / 发票 / 渠道分析) | 23 |
| [`zjzjgl`](#zjzjgl) | 资金管理(收款 / 付款 / 现金日记 / 其他收入支出) | 27 |
| [`zjzt`](#zjzt) | 账套管理(账套绑定/初始化/查询) | 6 |

**合计 416 个接口**

---

## `ggjk` — 公共接口(单据审核/弃审/删除/自定义表单)

共 17 个接口。

| 方法 | URL | 接口名 | 描述 | 已用 |
|---|---|---|---|---|
| `POST` | [`/accounting/openapi/cc/attachment/upload/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/ggjk/fjgl?id=33029) | 附件上传 | 上传附件接口，每次只能上传一个文件，上传大小显示10M以内 |  |
| `POST` | [`/accounting/openapi/cc/message/send/direct/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/ggjk/ywxx?id=33173) | 发送应用内业务消息 | 发送应用内业务消息 |  |
| `POST` | [`/accounting/openapi/cc/Setting/getValues/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/ggjk/setting?id=33142) | 选项查询 | 查询好业财选项 |  |
| `POST` | [`/accounting/openapi/cc/voucher/approve/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/ggjk/voucherpub?id=32836) | 单据审核 | 单据审核 |  |
| `POST` | [`/accounting/openapi/cc/voucher/delete/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/ggjk/voucherpub?id=32838) | 单据删除 | 单据删除 |  |
| `POST` | [`/accounting/openapi/cc/voucher/unapprove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/ggjk/voucherpub?id=32837) | 单据弃审 | 单据弃审 |  |
| `POST` | [`/cc/openapi/cc/menu/publish/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/ggjk/cdgl?id=32872) | 菜单发布 | 菜单发布 |  |
| `POST` | [`/cc/openapi/freevoucher/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/ggjk/zdybd?id=33023) | 自定义表单新增 | 自定义表单新增。详情 请在好业财自定义表单中查看个性化的入参描述。 |  |
| `POST` | [`/cc/openapi/freevoucher/approve/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/ggjk/zdybd?id=33026) | 自定义表单审核 | 自定义表单审核（简单审）。详情 请在好业财自定义表单中查看个性化的入参描述。 |  |
| `GET` | [`/cc/openapi/freevoucher/meta/{bookid}/{id}`](https://open.chanjet.com/docs/file/apiFile/zplus/ggjk/zdybd?id=33070) | 自定义表单元数据查询 | 自定义表单元数据查询 |  |
| `GET` | [`/cc/openapi/freevoucher/metalist/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/ggjk/zdybd?id=33069) | 自定义表单元数据列表查询 | 自定义表单元数据列表查询 |  |
| `POST` | [`/cc/openapi/freevoucher/query/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/ggjk/zdybd?id=33022) | 自定义表单单行查询 | 自定义表单单行查询。详情 请在好业财自定义表单中查看个性化的入参描述。 |  |
| `POST` | [`/cc/openapi/freevoucher/querylist/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/ggjk/zdybd?id=33021) | 自定义表单列表查询 | 自定义表单列表查询。详情 请在好业财自定义表单中查看个性化的入参描述。 |  |
| `POST` | [`/cc/openapi/freevoucher/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/ggjk/zdybd?id=33025) | 自定义表单删除 | 自定义表单删除。详情 请在好业财自定义表单中查看个性化的入参描述。 |  |
| `POST` | [`/cc/openapi/freevoucher/unapprove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/ggjk/zdybd?id=33027) | 自定义表单弃审 | 自定义表单弃审（简单审）。详情 请在好业财自定义表单中查看个性化的入参描述。 |  |
| `POST` | [`/cc/openapi/freevoucher/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/ggjk/zdybd?id=33024) | 自定义表单修改 | 自定义表单修改。详情 请在好业财自定义表单中查看个性化的入参描述。 |  |
| `POST` | [`/openapi/cc/menu/modifyName/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/ggjk/cdgl?id=32873) | 菜单名称修改 | 菜单名称修改 |  |

## `hyc_pjjk` — 凭据查询(销货/销售订单/发票列表内部接口)

共 43 个接口。

| 方法 | URL | 接口名 | 描述 | 已用 |
|---|---|---|---|---|
| `POST` | [`/accounting/internal/cc/arapadjust/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_zjgl?id=32926) | 应收应付调整单列表查询（内部） | 应收应付调整单列表查询 |  |
| `POST` | [`/accounting/internal/cc/arapbeginning/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_zjgl?id=32923) | 往来期初列表查询（内部） | 往来期初列表查询 |  |
| `POST` | [`/accounting/internal/cc/arapreverse/ar/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_zjgl?id=32927) | 预收冲应收单列表查询（内部） | 预收冲应收单列表查询 |  |
| `POST` | [`/accounting/internal/cc/budgetproject/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_xmht?id=32590) | 项目预算单列表查询（内部） | 项目预算单列表查询 |  |
| `POST` | [`/accounting/internal/cc/expenseallocation/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_zjgl?id=32925) | 采购费用分摊单列表查询（内部） | 采购费用分摊单列表查询 |  |
| `POST` | [`/accounting/internal/cc/finaccountbeginning/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_zjgl?id=32924) | 现金银行期初列表查询（内部） | 现金银行期初列表查询 |  |
| `POST` | [`/accounting/internal/cc/goodsissue/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_xsgl?id=31155) | 销货单列表查询（内部） | 销货单列表查询 |  |
| `POST` | [`/accounting/internal/cc/inv/assembly/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=31140) | 拆装单列表查询（内部） | 拆装库单列表查询 |  |
| `POST` | [`/accounting/internal/cc/inv/finishedgoodsstock/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=31141) | 产成品入库单列表查询（内部） | 产成品入库列表查询 |  |
| `POST` | [`/accounting/internal/cc/inv/inventorycostadj/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=31145) | 成本调整单列表查询（内部） | 成本调整单列表查询 |  |
| `POST` | [`/accounting/internal/cc/inv/materialstock/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=31142) | 材料出库单列表查询（内部） | 材料出库单列表查询 |  |
| `POST` | [`/accounting/internal/cc/inv/stockbeginning/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=31153) | 库存期初列表查询（内部） | 库存期初列表查询 |  |
| `POST` | [`/accounting/internal/cc/inv/stockcount/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=31144) | 盘点单列表查询（内部） | 盘点单列表查询 |  |
| `POST` | [`/accounting/internal/cc/inv/stockin/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=31137) | 入库单列表查询（内部） | 入库单列表查询 |  |
| `POST` | [`/accounting/internal/cc/inv/stockout/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=31138) | 出库单列表查询（内部） | 出库单列表查询 |  |
| `POST` | [`/accounting/internal/cc/inv/stocktransfer/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=31139) | 调拨单列表查询（内部） | 调拨单列表查询 |  |
| `POST` | [`/accounting/internal/cc/project/category/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_xmht?id=31168) | 查询项目分类（内部） | 查询项目分类接口 |  |
| `POST` | [`/accounting/internal/cc/project/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_xmht?id=31167) | 查询项目（内部） | 查询项目接口 |  |
| `POST` | [`/accounting/internal/cc/projectphaseexec/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_xmht?id=32596) | 项目执行单列表查询（内部） | 项目执行单列表查询 |  |
| `POST` | [`/accounting/internal/cc/projectphaseexec/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_xmht?id=32596) | 项目执行单列表查询（内部） | 项目执行单列表查询 |  |
| `POST` | [`/accounting/internal/cc/purchaseorder/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_cggl?id=31156) | 采购订单列表查询（内部） | 采购订单列表查询 |  |
| `POST` | [`/accounting/internal/cc/requiregoods/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=32929) | 要货单列表查询（内部） | 要货单列表查询 |  |
| `POST` | [`/accounting/internal/cc/requiregoods/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=32929) | 要货单列表查询（内部） | 要货单列表查询 |  |
| `POST` | [`/accounting/internal/cc/salesorder/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_xsgl?id=31154) | 销售订单列表查询（内部） | 销售订单列表查询 |  |
| `POST` | [`/accounting/openapi/cc/contract/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_xmht?id=32650) | 收入合同列表 | 收入合同列表 |  |
| `POST` | [`/accounting/openapi/cc/contract/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_xmht?id=32650) | 收入合同列表 | 收入合同列表 |  |
| `POST` | [`/accounting/openapi/cc/expenditureconfirm/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_xmht?id=32904) | 支出确认单列表查询 | 支出确认单列表查询 |  |
| `POST` | [`/accounting/openapi/cc/expenditureconfirm/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_xmht?id=32904) | 支出确认单列表查询 | 支出确认单列表查询 |  |
| `POST` | [`/accounting/openapi/cc/inv/assembly/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=32432) | 组装拆卸单列表 | ISV组装拆卸单列表接口 |  |
| `POST` | [`/accounting/openapi/cc/inv/assembly/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=32432) | 组装拆卸单列表 | ISV组装拆卸单列表接口 |  |
| `POST` | [`/accounting/openapi/cc/inv/purchaseapply/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_cggl?id=32437) | 采购申请单列表 | ISV采购申请单列表 |  |
| `POST` | [`/accounting/openapi/cc/inv/purchaseapply/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_cggl?id=32437) | 采购申请单列表 | ISV采购申请单列表 |  |
| `POST` | [`/accounting/openapi/cc/invoiceIssueList/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_xsgl?id=32356) | 销售发票列表查询 | 销售发票列表查询 |  |
| `POST` | [`/accounting/openapi/cc/invoiceIssueList/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_xsgl?id=32356) | 销售发票列表查询 | 销售发票列表查询 |  |
| `POST` | [`/accounting/openapi/cc/payment/{arapflag}/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_zjgl?id=31687) | 收付款单列表查询 | {arapflag}往uri里传，ap或者ar ap是付款单 ar是收款单，不要传进请求体 |  |
| `POST` | [`/accounting/openapi/cc/payment/{arapflag}/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_zjgl?id=31687) | 收付款单列表查询 | {arapflag}往uri里传，ap或者ar ap是付款单 ar是收款单，不要传进请求体 |  |
| `POST` | [`/accounting/openapi/cc/price/custpricescheme/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_gjgl?id=32950) | 客户价格查询 | 客户价格查询 |  |
| `POST` | [`/accounting/openapi/cc/purchaseorder/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_cggl?id=32520) | 采购订单列表查询 | 采购订单列表查询 |  |
| `POST` | [`/accounting/openapi/cc/purchaseorder/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_cggl?id=32520) | 采购订单列表查询 | 采购订单列表查询 |  |
| `POST` | [`/accounting/openapi/cc/purchasestockin/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=32792) | 采购入库单列表查询(过期) | 采购入库单列表查询 |  |
| `POST` | [`/accounting/openapi/cc/purchasestockin/list`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=32792) | 采购入库单列表查询(过期) | 采购入库单列表查询 |  |
| `POST` | [`/accounting/openapi/cc/salesstockout/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=32791) | 销售出库单列表查询 | 销售出库单列表查询 |  |
| `POST` | [`/accounting/openapi/cc/salesstockout/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyc_pjjk/hyc_pjjk_kcgl?id=32791) | 销售出库单列表查询 | 销售出库单列表查询 |  |

## `hycgdzc` — 固定资产(新增 / 删除 / 清理 / 查询)

共 4 个接口。

| 方法 | URL | 接口名 | 描述 | 已用 |
|---|---|---|---|---|
| `POST` | [`/accounting/asset/fixedAssetRestructure/addFixedAsset/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hycgdzc/xzgdzc?id=32814) | (外部接口-新版资产)  新增资产 | 新增资产 |  |
| `POST` | [`/accounting/asset/fixedAssetRestructure/deleteFixedAsset/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hycgdzc/xzgdzc?id=32815) | （外部接口-新版资产）删除固定资产 | （外部接口）删除固定资产 |  |
| `POST` | [`/accounting/asset/fixedAssetRestructure/fixedAssetCleanForOpenAip/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hycgdzc/xzgdzc?id=33279) | (外部接口-新版资产)  资产清理 | 资产清理 |  |
| `POST` | [`/accounting/asset/fixedAssetRestructure/queryFixedAsset/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hycgdzc/xzgdzc?id=32816) | （外部接口-新版资产）查询资产列表 | （外部接口-新版资产）查询资产列表 |  |

## `hycjggl` — 价格管理(门店 / 客户价格)

共 1 个接口。

| 方法 | URL | 接口名 | 描述 | 已用 |
|---|---|---|---|---|
| `POST` | [`/accounting/openapi/cc/price/storeprice/v2/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hycjggl/hycmdjg?id=32779) | 门店价格查询 | 门店价格查询 |  |

## `hyczzgl` — 总账与会计(科目 / 期初 / 凭证 / 工资 / 报表)

共 53 个接口。

| 方法 | URL | 接口名 | 描述 | 已用 |
|---|---|---|---|---|
| `POST` | [`/accounting/acctgplt/CashJournal/batchAdd/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzrjzgl?id=31151) | 批量新增日记账(项目定制化接口，非标准) | 该接口为针对某项目提供的定制化接口，非标准接口。项目以外的人员及组织不要使用。 |  |
| `POST` | [`/accounting/acctgplt/CashJournal/checking/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzrjzgl?id=31152) | 对账接口 | 对账接口 |  |
| `GET` | [`/accounting/acctgplt/CashJournal/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzrjzgl?id=31174) | 日记账查询 | 日记账列表 |  |
| `POST` | [`/accounting/acctgplt/CashJournal/outside/addCashJournal/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzrjzgl?id=31791) | (外部接口) 新增日记账 | 新增日记账 |  |
| `POST` | [`/accounting/acctgplt/CashJournal/outside/preciseQueryCashJournal/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzrjzgl?id=31814) | (外部接口) 精确查询日记账 | - |  |
| `GET` | [`/accounting/asr/CashFlow/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=32255) | 现金流量表查询 | 现金流量表查询 |  |
| `GET` | [`/accounting/asr/Statistics/stateOfOperation/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=32261) | 经营状况表查询 | 经营状况表查询 |  |
| `GET` | [`/accounting/asr/TaxFluctuate/query/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=32272) | 纳税波动表 | - |  |
| `GET` | [`/accounting/asr/TaxFluctuate/queryTaxFluctuate/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=32275) | 查询纳税波动表（参数为period） | - |  |
| `GET` | [`/accounting/asr/TaxStatistics/getTaxStatistics/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=32256) | 纳税统计表 | 查询纳税统计表 |  |
| `GET` | [`/accounting/fin/getAllReport/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=31890) | 获得报表定义 | 获取系统自定义报表的定义 |  |
| `GET` | [`/accounting/fin/getOldBalanceSheet/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=31887) | 新版资产负债表接口 | 新版资产负债表获取数据 |  |
| `GET` | [`/accounting/fin/getOldIncomeStatement/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=31888) | 新版利润表 | 新版报表接口获取 |  |
| `GET` | [`/accounting/fin/query/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=31891) | 自定义报表接口 | 获取自定义报表数据 |  |
| `DELETE` | [`/accounting/gl/AcctgTrans/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=31777) | 凭证删除 | 凭证删除接口 |  |
| `POST` | [`/accounting/gl/AcctgTrans/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=31799) | （外部接口）期末结转生凭证 | 新增凭证中加入期末结转的标志 |  |
| `POST` | [`/accounting/gl/AcctgTrans/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=31809) | （对外接口）凭证业务对照关系 | 凭证新增的来源，如日记账来源，发票来源 |  |
| `PUT` | [`/accounting/gl/AcctgTrans/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=31726) | 修改凭证 | 凭证修改接口 [视频教程](https://www.bilibili.com/video/BV1bL411A7ew/) |  |
| `GET` | [`/accounting/gl/AcctgTrans/acctgTransExactSearch/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=31788) | （外部接口）凭证列表精确搜索 | 凭证列表-精确搜索 [视频教程](https://www.bilibili.com/video/BV1q34y147se |  |
| `GET` | [`/accounting/gl/AcctgTrans/acctgTransFuzzySearch/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=31413) | 凭证列表模糊搜索 | 凭证列表-模糊搜索 |  |
| `GET` | [`/accounting/gl/AcctgTrans/countByPeriod/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=31514) | 查询凭证期间汇总数量 | 获取凭证期间数量信息 |  |
| `POST` | [`/accounting/gl/AcctgTrans/externalFileUploadAcctgTransAttachment/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=32868) | 外部文件上传凭证附件 | 说明：此接口采用可覆盖方式， |  |
| `GET` | [`/accounting/gl/AcctgTrans/getAttcList/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=31446) | 凭证附件列表查询 | 获取凭证下的附件列表 |  |
| `GET` | [`/accounting/gl/AcctgTrans/getNewAttcList/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=33438) | 凭证附单据列表查询 | 获取凭证下的附单据列表（包括业务生凭证的附单据） |  |
| `POST` | [`/accounting/gl/AcctgTrans/printAcctgTrans/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=31215) | 凭证打印 | 凭证列表-凭证打印 |  |
| `POST` | [`/accounting/gl/AcctgTrans1/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=32083) | 新增凭证（期末结转生凭证业务场景) | 期末结转生成的凭证 [视频演示](https://www.bilibili.com/video/BV1hT4y1i7tt |  |
| `POST` | [`/accounting/gl/AcctgTrans2/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=19689) | 新增凭证 | 新增凭证如有数字可以忽略，后端会自动指向accounting/gl/AcctgTrans地址 |  |
| `POST` | [`/accounting/gl/AcctgTrans4/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=32082) | (外部接口) 新增凭证--关联发票、日记账、固定资产等既有业务数据 | 该凭证新增可以关联已有的业务数据。如：发票、日记账、固定资产、工资等生成凭证业务场景 [视频演示](https://ww |  |
| `POST` | [`/accounting/gl/AcctgTrans5/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=32079) | (外部接口) 新增凭证--有辅助核算 | 新增凭证（辅助核算场景），科目存在辅助核算的情况下新增凭证接口 [视频演示](https://www.bilibili. |  |
| `GET` | [`/accounting/gl/acctgTransCategory/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=31760) | 查询凭证类别 | 凭证类别查询接口 |  |
| `POST` | [`/accounting/gl/acctgTransCategory/disableCategory/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=31440) | 禁用凭证类别 | 禁用凭证类别 |  |
| `POST` | [`/accounting/gl/acctgTransCategory/enableCategory/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=31443) | 启用凭证类别 | 启用凭证类别 |  |
| `POST` | [`/accounting/gl/balance/rpt/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzzbgl?id=19902) | 查询科目余额表 | 余额表查询接口 |  |
| `POST` | [`/accounting/gl/balance/updateBalanceDuiaWang/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzkmjqcgl?id=31902) | （外部接口）新增科目余额 | 通过【（外部接口）科目查询接口（支持单个和全部）】接口查询出的数据可以用来进行科目余额的新增和修改 |  |
| `GET` | [`/accounting/gl/BalanceSheet/check/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=32306) | 资产负债表状态检查 | 资产负债表状态检查 |  |
| `GET` | [`/accounting/gl/BalanceSheet/trialBalance/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzkmjqcgl?id=31810) | （外部接口）试算平衡 | - |  |
| `GET` | [`/accounting/gl/CashFlow/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=30246) | 按期间查询现金流量表 | 按期间查询现金流量表 |  |
| `GET` | [`/accounting/gl/ChronologicBook/query/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzzbgl?id=32016) | 序时账分页查询 | - |  |
| `POST` | [`/accounting/gl/glaccount/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzkmjqcgl?id=31804) | （外部接口）新增科目 | 科目新增目前新增的场景有：1、一级科目新增2、子级科目新增3、辅助核算（子级/一级）科目新增4、数量核算（子级/一级）科 |  |
| `GET` | [`/accounting/gl/glaccount/getInitBalanceList/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzkmjqcgl?id=30311) | 获取所有科目及期初数据 | 获取所有期初数据 |  |
| `GET` | [`/accounting/gl/glaccount/getInitBalanceLists/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzkmjqcgl?id=31806) | （外部接口）科目查询接口（支持单个和全部） | - |  |
| `POST` | [`/accounting/gl/glaccount/updateAccountDuia/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzkmjqcgl?id=31927) | （外部接口）修改科目 | 科目新增的几种场景的修改以及1002银行信息的修改 [视频教程](https://www.bilibili.com/vi |  |
| `GET` | [`/accounting/gl/IncomeStatement/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=19545) | 获取损益表 | 获取损益表（包括：利润表，业务活动表，收入支出表） |  |
| `GET` | [`/accounting/gl/statistics/pay/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=31247) | 应付统计表 | 应付统计表 |  |
| `GET` | [`/accounting/gl/statistics/receive/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzbbgl?id=31248) | 应收统计表 | 应收统计表 | **g199 ✅ 应收总账(chanjet_ar_snapshot 数据源)** |
| `POST` | [`/accounting/gl/subaccountbalance/addAssistaccounting/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzkmjqcgl?id=31864) | （外部接口）更新科目辅助余额 | 更新辅助科目期初数据 [视频教程](https://www.bilibili.com/video/BV1bL4y177a |  |
| `GET` | [`/accounting/gl/subaccountbalance/getInitBalanceLists/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzkmjqcgl?id=31863) | （外部接口）科目期初辅助余额查询 | - |  |
| `GET` | [`/accounting/gl/SubsidiaryLedge/queryPaging/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzzbgl?id=30453) | 明细账分页查询 | 明细账分页查询 |  |
| `GET` | [`/accounting/gl/TotalLedge/query/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzzbgl?id=31354) | 总账查询 | author:wenqian 总账查询1 |  |
| `POST` | [`/accounting/payroll/payrollEmployee/outside/addEmployee/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzgzgl?id=31801) | （外部接口）新增/修改 工资 | （外部接口）新增工资 |  |
| `POST` | [`/accounting/payroll/payrollEmployee/outside/deletePayrollList/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzgzgl?id=31803) | （外部接口）删除工资 | （外部接口）删除工资 |  |
| `GET` | [`/accounting/payroll/payrollEmployee/outside/getPayrollList/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzgzgl?id=31812) | （外部接口） 精确查询工资 | （外部接口） 精确查询工资 |  |
| `POST` | [`/tplus/api/v2/DocType/Query`](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzpz?id=31049) | 凭证类别查询 | 凭证类别查询 |  |

## `lsgl` — 零售管理(门店 / POS / 零售出库)

共 8 个接口。

| 方法 | URL | 接口名 | 描述 | 已用 |
|---|---|---|---|---|
| `POST` | [`/accounting/openapi/cc/retailstock/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/lsgl/hyc_retailstock?id=33339) | 查询零售出库单列表 | 查询零售出库单列表 |  |
| `POST` | [`/cc/newpos/offline/onShift/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/lsgl/lsmd?id=33128) | POS当班 | 好业财POS当班接口 |  |
| `POST` | [`/cc/retail/open/createRetail/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/lsgl/scdd?id=32640) | 创建零售单 | 好业财创建零售单接口 |  |
| `POST` | [`/cc/retail/open/queryRetailInfo/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/lsgl/scdd?id=32554) | 查询零售单详情 | 好业财零售单详情查询接口 |  |
| `POST` | [`/cc/retail/open/searchRetail/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/lsgl/scdd?id=32025) | 查询零售单 | 好业财零售单查询接口 |  |
| `POST` | [`/cc/retail/open/updateScanInvoiceResult/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/lsgl/invoice?id=32834) | 新零售扫码开票结果更新 | 新零售2.0扫码开票成功后，将开票的结果回传给新零售 |  |
| `GET` | [`/cc/retailbase/Open/poslist/{bookId}`](https://open.chanjet.com/docs/file/apiFile/zplus/lsgl/lsmd?id=32097) | 查询所有POS | - |  |
| `GET` | [`/cc/retailbase/Store/searchStores/{bookId}`](https://open.chanjet.com/docs/file/apiFile/zplus/lsgl/lsmd?id=32193) | 查询门店 | - |  |

## `sggl` — 施工管理(工程验收单)

共 1 个接口。

| 方法 | URL | 接口名 | 描述 | 已用 |
|---|---|---|---|---|
| `POST` | [`/accounting/openapi/cc/engineeringacceptance/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/sggl/gcysd?id=33167) | 工程验收单列表 | 工程验收单列表 |  |

## `sjgl` — 生产加工(生产单 / BOM 类工单)

共 24 个接口。

| 方法 | URL | 接口名 | 描述 | 已用 |
|---|---|---|---|---|
| `POST` | [`/accounting/openapi/cc/v2/MpManufactureOrder/add`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/scjgd?id=33340) | 生产加工单新增 | 生产加工单新增 （目前接口处于内测部分开放阶段，访问权限需人工审核，对接请协调联系好业财研发 suozhiq@chanj |  |
| `POST` | [`/accounting/openapi/cc/v2/MpManufactureOrder/approve`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/scjgd?id=33345) | 生产加工单审批 | 生产加工单审批（目前接口处于内测部分开放阶段，访问权限需人工审核，对接请协调联系好业财研发 suozhiq@chanje |  |
| `POST` | [`/accounting/openapi/cc/v2/MpManufactureOrder/list`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/scjgd?id=33343) | 生产加工单查询列表 | 生产加工单查询列表 |  |
| `POST` | [`/accounting/openapi/cc/v2/MpManufactureOrder/manualEnd`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/scjgd?id=33349) | 生产加工单行完工 | 生产加工单行完工（目前接口处于内测部分开放阶段，访问权限需人工审核，对接请协调联系好业财研发 suozhiq@chanj |  |
| `POST` | [`/accounting/openapi/cc/v2/MpManufactureOrder/productClose`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/scjgd?id=33350) | 生产加工单行中止 | 生产加工单行中止（目前接口处于内测部分开放阶段，访问权限需人工审核，对接请协调联系好业财研发 suozhiq@chanj |  |
| `POST` | [`/accounting/openapi/cc/v2/MpManufactureOrder/productUnClose`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/scjgd?id=33351) | 生产加工单行取消中止 | 生产加工单行取消中止（目前接口处于内测部分开放阶段，访问权限需人工审核，对接请协调联系好业财研发 suozhiq@cha |  |
| `POST` | [`/accounting/openapi/cc/v2/MpManufactureOrder/query`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/scjgd?id=33342) | 生产加工单查看详情 | 生产加工单查看详情 |  |
| `POST` | [`/accounting/openapi/cc/v2/MpManufactureOrder/remove`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/scjgd?id=33344) | 生产加工单删除 | 生产加工单删除（目前接口处于内测部分开放阶段，访问权限需人工审核，对接请协调联系好业财研发 suozhiq@chanje |  |
| `POST` | [`/accounting/openapi/cc/v2/MpManufactureOrder/singleclose`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/scjgd?id=33347) | 生产加工单整单中止 | 生产加工单整单中止（目前接口处于内测部分开放阶段，访问权限需人工审核，对接请协调联系好业财研发 suozhiq@chan |  |
| `POST` | [`/accounting/openapi/cc/v2/MpManufactureOrder/singleUnclose`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/scjgd?id=33348) | 生产加工单取消中止 | 生产加工单取消中止（目前接口处于内测部分开放阶段，访问权限需人工审核，对接请协调联系好业财研发 suozhiq@chan |  |
| `POST` | [`/accounting/openapi/cc/v2/MpManufactureOrder/unapprove`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/scjgd?id=33346) | 生产加工单弃审 | 生产加工单弃审（目前接口处于内测部分开放阶段，访问权限需人工审核，对接请协调联系好业财研发 suozhiq@chanje |  |
| `POST` | [`/accounting/openapi/cc/v2/MpManufactureOrder/update`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/scjgd?id=33341) | 生产加工单修改 | 生产加工单修改（目前接口处于内测部分开放阶段，访问权限需人工审核，对接请协调联系好业财研发 suozhiq@chanje |  |
| `POST` | [`/accounting/openapi/cc/v2/OmManufactureOrder/add`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/wwjgd?id=33379) | 委外加工单新增 | 委外加工单新增（目前接口部分开放，权限需人工审核，对接请联系研发 suozhiq@chanjet.com） |  |
| `POST` | [`/accounting/openapi/cc/v2/OmManufactureOrder/approve`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/wwjgd?id=33386) | 委外加工单审批 | 委外加工单审批（目前接口部分开放，权限需人工审核，对接请联系研发 suozhiq@chanjet.com） |  |
| `POST` | [`/accounting/openapi/cc/v2/OmManufactureOrder/list`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/wwjgd?id=33382) | 委外加工单查询列表 | 委外加工单查询列表 |  |
| `POST` | [`/accounting/openapi/cc/v2/OmManufactureOrder/manualEnd`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/wwjgd?id=33390) | 委外加工单行完工 | 委外加工单行完工（目前接口部分开放，权限需人工审核，对接请联系研发 suozhiq@chanjet.com） |  |
| `POST` | [`/accounting/openapi/cc/v2/OmManufactureOrder/productClose`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/wwjgd?id=33388) | 委外加工单行中止 | 委外加工单行中止（目前接口部分开放，权限需人工审核，对接请联系研发 suozhiq@chanjet.com） |  |
| `POST` | [`/accounting/openapi/cc/v2/OmManufactureOrder/productUnClose`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/wwjgd?id=33389) | 委外加工单行取消中止 | 委外加工单行取消中止（目前接口部分开放，权限需人工审核，对接请联系研发 suozhiq@chanjet.com） |  |
| `POST` | [`/accounting/openapi/cc/v2/OmManufactureOrder/query`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/wwjgd?id=33383) | 委外加工单查看详情 | 委外加工单查看详情 |  |
| `POST` | [`/accounting/openapi/cc/v2/OmManufactureOrder/remove`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/wwjgd?id=33381) | 委外加工单删除 | 委外加工单删除（目前接口部分开放，权限需人工审核，对接请协调联系研发 suozhiq@chanjet.com） |  |
| `POST` | [`/accounting/openapi/cc/v2/OmManufactureOrder/singleclose`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/wwjgd?id=33385) | 委外加工单中止（整单） | 委外加工单整单中止（目前接口部分开放，权限需人工审核，对接请联系研发 suozhiq@chanjet.com） |  |
| `POST` | [`/accounting/openapi/cc/v2/OmManufactureOrder/singleUnclose`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/wwjgd?id=33384) | 委外加工单取消中止（整单） | 委外加工单取消中止（目前接口部分开放，权限需人工审核，对接请协调联系研发 suozhiq@chanjet.com） |  |
| `POST` | [`/accounting/openapi/cc/v2/OmManufactureOrder/unapprove`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/wwjgd?id=33387) | 委外加工单弃审 | 委外加工单弃审（目前接口部分开放，权限需人工审核，对接请联系研发 suozhiq@chanjet.com） |  |
| `POST` | [`/accounting/openapi/cc/v2/OmManufactureOrder/update`](https://open.chanjet.com/docs/file/apiFile/zplus/sjgl/wwjgd?id=33380) | 委外加工单修改 | 委外加工单修改（目前接口部分开放，权限需人工审核，对接请联系研发 suozhiq@chanjet.com） |  |

## `xmht` — 项目合同(项目主档 / 合同 / 执行单)

共 31 个接口。

| 方法 | URL | 接口名 | 描述 | 已用 |
|---|---|---|---|---|
| `POST` | [`/accounting/openapi/cc/contract/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/ht?id=32524) | 新增收入合同 | 新增 收入合同 |  |
| `POST` | [`/accounting/openapi/cc/contract/change/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/ht?id=33362) | 销售合同变更 | 销售合同变更 |  |
| `POST` | [`/accounting/openapi/cc/contract/list/expenditureContract/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/zcht?id=32651) | 支出合同列表 | 支出合同列表 |  |
| `POST` | [`/accounting/openapi/cc/contract/list/expenditureContract/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/zcht?id=32651) | 支出合同列表 | 支出合同列表 |  |
| `GET` | [`/accounting/openapi/cc/contract/query/{code}/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/zcht?id=32528) | 查询收入/支出合同 | 查询 收入/支出合同 |  |
| `GET` | [`/accounting/openapi/cc/contract/query/{code}/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/zcht?id=32528) | 查询收入/支出合同 | 查询 收入/支出合同 |  |
| `POST` | [`/accounting/openapi/cc/contract/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/ht?id=32526) | 删除收入合同 | 删除 收入合同 |  |
| `POST` | [`/accounting/openapi/cc/contract/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/ht?id=32525) | 修改收入合同 | 修改 收入合同 |  |
| `POST` | [`/accounting/openapi/cc/contractCategory/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/htfl?id=32530) | 新增合同分类 | 新增 合同分类 |  |
| `POST` | [`/accounting/openapi/cc/contractCategory/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/htfl?id=32532) | 合同分类列表 | 合同分类列表 |  |
| `GET` | [`/accounting/openapi/cc/contractCategory/query/{code}/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/htfl?id=32533) | 查询合同分类 | 查询 合同分类 |  |
| `GET` | [`/accounting/openapi/cc/contractCategory/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/htfl?id=32534) | 删除合同分类 | 删除 合同分类 |  |
| `POST` | [`/accounting/openapi/cc/contractCategory/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/htfl?id=32531) | 修改合同分类 | 修改合同分类 |  |
| `POST` | [`/accounting/openapi/cc/expenditureconfirm/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/zcqrd?id=32895) | 新增支出确认单 | 新增 支出确认单 |  |
| `PUT` | [`/accounting/openapi/cc/expenditureconfirm/invoice/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/zcqrd?id=32968) | 支出确认单开票 | 支出确认单开票 |  |
| `POST` | [`/accounting/openapi/cc/expenditureconfirm/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/zcqrd?id=32941) | 删除支出确认单 | 删除 支出确认单 |  |
| `POST` | [`/accounting/openapi/cc/expenditureconfirm/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/zcqrd?id=32942) | 修改支出确认单 | 修改 支出确认单 |  |
| `POST` | [`/accounting/openapi/cc/expenditurecontract/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/zcht?id=32905) | 新增支出合同 | 新增 支出合同 |  |
| `POST` | [`/accounting/openapi/cc/expenditurecontract/change/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/zcht?id=33309) | 采购合同变更 | 采购合同变更 |  |
| `POST` | [`/accounting/openapi/cc/expenditurecontract/list/expenditureContract/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/zcht?id=33435) | 支出合同列表查询v2 | 支出合同列表查询v2（含自定义项，支持传返回字段查询条件） |  |
| `POST` | [`/accounting/openapi/cc/expenditurecontract/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/zcht?id=32907) | 删除支出合同 | 删除 支出合同 |  |
| `POST` | [`/accounting/openapi/cc/expenditurecontract/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/zcht?id=32906) | 修改支出合同 | 修改 支出合同 |  |
| `POST` | [`/accounting/openapi/cc/projectphaseexec/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/xmzxd?id=33040) | 项目执行单新增 | 项目执行单新增 |  |
| `POST` | [`/accounting/openapi/cc/projectphaseexec/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/xmzxd?id=33043) | 项目执行单列表查询 | 项目执行单列表查询 |  |
| `POST` | [`/accounting/openapi/cc/projectphaseexec/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/xmzxd?id=33042) | 项目执行单删除 | 项目执行单删除 |  |
| `POST` | [`/accounting/openapi/cc/projectphaseexec/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/xmzxd?id=33041) | 项目执行单修改 | 项目执行单修改 |  |
| `POST` | [`/accounting/openapi/cc/revenueconfirm/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/srqrd?id=32939) | 新增收入确认单 | 新增 收入确认单 |  |
| `PUT` | [`/accounting/openapi/cc/revenueconfirm/invoice/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/srqrd?id=32967) | 收入确认单开票 | 收入确认单开票 |  |
| `POST` | [`/accounting/openapi/cc/revenueconfirm/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/srqrd?id=32594) | 收入确认单列表查询 | 收入确认单列表查询 |  |
| `POST` | [`/accounting/openapi/cc/revenueconfirm/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/srqrd?id=32944) | 删除收入确认单 | 删除 收入确认单 |  |
| `POST` | [`/accounting/openapi/cc/revenueconfirm/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/srqrd?id=32943) | 修改收入确认单 | 修改收入确认单 |  |

## `zjcggl` — 采购管理(采购订单 / 入库单 / 申请单 / 退货单 / 发票)

共 23 个接口。

| 方法 | URL | 接口名 | 描述 | 已用 |
|---|---|---|---|---|
| `POST` | [`/accounting/openapi/cc/goodsreceipt/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/jhd?id=31855) | 进货单新增 | 新增进货单，以code作为外部单据唯一标识，不能重复。 （删除、审核、弃审参照单据公共接口部分） |  |
| `POST` | [`/accounting/openapi/cc/goodsreceipt/addDraft/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/jhd?id=33216) | 进货单新增草稿 | 新增进货单草稿，以code作为外部单据唯一标识，不能重复。 |  |
| `POST` | [`/accounting/openapi/cc/goodsreceipt/change/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/jhd?id=32861) | 进货单变更 | 进货单变更，根据好业财内部id作为唯一标识进行处理 |  |
| `PUT` | [`/accounting/openapi/cc/goodsreceipt/invoice/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/jhd?id=32969) | 进货单开票 | 进货单开票 |  |
| `POST` | [`/accounting/openapi/cc/goodsreceipt/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/jhd?id=31933) | 进货单列表查询 | 查询进货单列表 |  |
| `GET` | [`/accounting/openapi/cc/goodsreceipt/query/{id}/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/jhd?id=31986) | 进货单查询 | 根据进货单[id]查询进货单详情 |  |
| `POST` | [`/accounting/openapi/cc/goodsreceipt/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/jhd?id=31938) | 进货单删除 | 进货单删除 |  |
| `POST` | [`/accounting/openapi/cc/goodsreceipt/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/jhd?id=31932) | 进货单修改 | 进货单修改，根据好业财内部id作为唯一标识进行处理 |  |
| `POST` | [`/accounting/openapi/cc/purchaseapply/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/cgsqd?id=32440) | 采购申请单新增 | ISV采购申请单新增 |  |
| `POST` | [`/accounting/openapi/cc/purchaseapply/change/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/cgsqd?id=33307) | 采购申请单变更 | - |  |
| `POST` | [`/accounting/openapi/cc/purchaseapply/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/cgsqd?id=32439) | 删除采购申请清单 | ISV删除采购申请清单 |  |
| `POST` | [`/accounting/openapi/cc/purchaseapply/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/cgsqd?id=32438) | 采购申请单修改 | ISV采购申请单修改 |  |
| `POST` | [`/accounting/openapi/cc/purchaseorder/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/cgdd?id=23737) | 采购订单新增 | - |  |
| `POST` | [`/accounting/openapi/cc/purchaseorder/change/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/cgdd?id=32862) | 采购订单变更 | - |  |
| `POST` | [`/accounting/openapi/cc/purchaseorder/close/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/cgdd?id=23739) | 采购订单中止 | - |  |
| `POST` | [`/accounting/openapi/cc/purchaseorder/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/cgdd?id=23738) | 采购订单修改 | - |  |
| `POST` | [`/accounting/openapi/cc/v2/PurchaseInvoiceIssue/add`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/PurchaseInvoiceIssue?id=33490) | 采购发票新增 | 采购发票新增 |  |
| `POST` | [`/accounting/openapi/cc/v2/PurchaseInvoiceIssue/approve`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/PurchaseInvoiceIssue?id=33493) | 采购发票审批 | 采购发票审批 |  |
| `POST` | [`/accounting/openapi/cc/v2/PurchaseInvoiceIssue/list`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/PurchaseInvoiceIssue?id=33447) | 采购发票查询列表 | 采购发票查询列表 |  |
| `POST` | [`/accounting/openapi/cc/v2/PurchaseInvoiceIssue/query`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/PurchaseInvoiceIssue?id=33448) | 采购发票查询 | 采购发票查询 |  |
| `POST` | [`/accounting/openapi/cc/v2/PurchaseInvoiceIssue/remove`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/PurchaseInvoiceIssue?id=33492) | 采购发票删除 | 采购发票删除 |  |
| `POST` | [`/accounting/openapi/cc/v2/PurchaseInvoiceIssue/unapprove`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/PurchaseInvoiceIssue?id=33494) | 采购发票弃审 | 采购发票弃审 |  |
| `POST` | [`/accounting/openapi/cc/v2/PurchaseInvoiceIssue/update`](https://open.chanjet.com/docs/file/apiFile/zplus/zjcggl/PurchaseInvoiceIssue?id=33491) | 采购发票修改 | 采购发票修改 |  |

## `zjjcda` — 基础档案 / 主数据(部门 / 客户 / 供应商 / 存货 / 仓库 / 计量单位 / 品牌 / 项目类别 等)

共 102 个接口。

| 方法 | URL | 接口名 | 描述 | 已用 |
|---|---|---|---|---|
| `GET` | [`/accounting/document/Employee/me/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/employee?id=32646) | 按用户查询当前员工基础档案 | 查询项目列表-权限测试 |  |
| `POST` | [`/accounting/document/integration/project/batchUpsert/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/project?id=19943) | 项目同步接口 | 好业财、好会计、易代账等接受第三方往来资金基础档案同步信息 [视频教程](https://www.bilibili.co |  |
| `POST` | [`/accounting/openapi/cc/bom/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/wlqd?id=32434) | 新增物料清单 | ISV物料清单新增接口 |  |
| `POST` | [`/accounting/openapi/cc/bom/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/wlqd?id=32435) | 删除物料清单 | ISV物料清单删除接口 |  |
| `POST` | [`/accounting/openapi/cc/bom/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/wlqd?id=32436) | 修改物料清单 | ISV物料清单修改接口 |  |
| `POST` | [`/accounting/openapi/cc/cooperationinfo/updateBackCooperationStatus/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/xtgx?id=33214) | 回写单据协同状态 | 回传单据协同状态 |  |
| `POST` | [`/accounting/openapi/cc/cooperativechannel/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/qd?id=32804) | 新增渠道档案 | 新增渠道档案 |  |
| `PUT` | [`/accounting/openapi/cc/cooperativechannel/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/qd?id=32811) | 修改渠道档案 | 修改渠道档案 |  |
| `POST` | [`/accounting/openapi/cc/department/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/department?id=32461) | 部门新增 | ISV项目部门 |  |
| `POST` | [`/accounting/openapi/cc/department/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/department?id=32487) | 查询部门列表 | 查询部门接口，返回所有部门 | **g199 ✅ 部门列表(部门对账用)** |
| `GET` | [`/accounting/openapi/cc/department/query/{id}/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/department?id=32463) | 部门详情 | ISV部门详情 |  |
| `POST` | [`/accounting/openapi/cc/department/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/department?id=32464) | 部门删除 | ISV部门删除 |  |
| `POST` | [`/accounting/openapi/cc/department/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/department?id=32462) | 部门修改 | ISV部门修改 |  |
| `POST` | [`/accounting/openapi/cc/employee/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/employee?id=32465) | 员工新增 | ISV员工新增 |  |
| `POST` | [`/accounting/openapi/cc/employee/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/employee?id=32489) | 查询员工列表 | 查询员工接口，返回所有员工 |  |
| `GET` | [`/accounting/openapi/cc/employee/query/{id}/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/employee?id=32468) | 员工详情 | ISV员工详情 |  |
| `POST` | [`/accounting/openapi/cc/employee/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/employee?id=32467) | 员工删除 | ISV员工删除 |  |
| `POST` | [`/accounting/openapi/cc/employee/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/employee?id=32466) | 员工修改 | ISV员工修改 |  |
| `POST` | [`/accounting/openapi/cc/expensetype/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/fylx?id=32705) | 新增费用类型 | 新增费用类型 |  |
| `POST` | [`/accounting/openapi/cc/expenseType/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/fylx?id=32633) | 查询费用类型列表 | 查询费用类型接口，返回所有费用类型 |  |
| `GET` | [`/accounting/openapi/cc/expensetype/query/{code}/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/fylx?id=32707) | 查询费用类型 | 查询费用类型 |  |
| `POST` | [`/accounting/openapi/cc/expensetype/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/fylx?id=32708) | 费用类型删除 | 费用类型删除 |  |
| `POST` | [`/accounting/openapi/cc/expensetype/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/fylx?id=32706) | 修改费用类型 | 修改费用类型 |  |
| `POST` | [`/accounting/openapi/cc/expensetypecategory/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/fylx?id=32986) | 新增费用类型分类 | 新增费用类型分类 |  |
| `POST` | [`/accounting/openapi/cc/expensetypecategory/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/fylx?id=32948) | 费用类型分类列表 | 费用类型分类列表 |  |
| `DELETE` | [`/accounting/openapi/cc/expensetypecategory/remove/{id}/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/fylx?id=32988) | 费用类型分类删除 | 费用类型分类删除 |  |
| `POST` | [`/accounting/openapi/cc/expensetypecategory/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/fylx?id=32987) | 修改费用类型分类 | 修改费用类型分类 |  |
| `POST` | [`/accounting/openapi/cc/finaccount/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/zh?id=31620) | 新增账号 | author:panxuanc ISV账号新增接口 |  |
| `POST` | [`/accounting/openapi/cc/finaccount/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/zh?id=32631) | 查询账号列表 | 查询账号接口，返回所有账号 |  |
| `GET` | [`/accounting/openapi/cc/finaccount/query/{code}/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/zh?id=31623) | 查询账号 | author:panxuanc 账号详情 |  |
| `POST` | [`/accounting/openapi/cc/finaccount/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/zh?id=31621) | 删除账号 | author:panxuanc 账号删除 |  |
| `POST` | [`/accounting/openapi/cc/finaccount/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/zh?id=31622) | 修改账号 | author:panxuanc ISV账号修改接口 |  |
| `POST` | [`/accounting/openapi/cc/inv/bom/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/wlqd?id=32433) | 物料清单列表 | ISV物料清单列表接口 |  |
| `POST` | [`/accounting/openapi/cc/party/custCategory/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/wldw?id=30799) | 查询往来单位分类 | 查询往来单位分类 |  |
| `POST` | [`/accounting/openapi/cc/party/custvendor/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/wldw?id=30800) | 新增往来单位 | 新增往来单位；注意：这个接口是批量新增接口，参数应以数组形式上传。 |  |
| `POST` | [`/accounting/openapi/cc/party/custvendor/query/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/wldw?id=30802) | 查询往来单位 | 查询往来单位接口 | **g199-A 待探(客户主数据)** |
| `POST` | [`/accounting/openapi/cc/party/custvendor/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/wldw?id=30803) | 删除往来单位 | 删除往来单位接口 |  |
| `PUT` | [`/accounting/openapi/cc/party/custvendor/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/wldw?id=30801) | 修改往来单位 | 修改往来单位 |  |
| `POST` | [`/accounting/openapi/cc/paymentmethodtype/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/jsfs?id=31617) | 新增结算方式 | author:panxuanc ISV结算方式新增接口 |  |
| `POST` | [`/accounting/openapi/cc/paymentmethodtype/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/jsfs?id=32632) | 查询结算方式列表 | 查询结算方式接口，返回所有结算方式 |  |
| `GET` | [`/accounting/openapi/cc/paymentmethodtype/query/{code}/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/jsfs?id=31619) | 查询结算方式 | author:panxuanc 结算方式详情 |  |
| `POST` | [`/accounting/openapi/cc/paymentmethodtype/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/jsfs?id=31624) | 删除结算方式 | author:panxuanc 结算方式删除 |  |
| `POST` | [`/accounting/openapi/cc/paymentmethodtype/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/jsfs?id=31618) | 修改结算方式 | author:panxuanc ISV结算方式修改接口 |  |
| `POST` | [`/accounting/openapi/cc/product/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/sp?id=30795) | 商品新增 | 商品新增；注意：这个接口是批量新增接口，参数应以数组形式上传。 |  |
| `POST` | [`/accounting/openapi/cc/product/bindOrUnbind/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/sp?id=23741) | 商品绑定/解绑 | 外部商品与本系统商品对照关系变更 |  |
| `POST` | [`/accounting/openapi/cc/product/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/sp?id=30796) | 查询商品列表 | 查询商品列表 |  |
| `POST` | [`/accounting/openapi/cc/product/productMapList/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/sp?id=23740) | 商品匹配关系查询 | 外部商品与本系统商品的对照关系 |  |
| `POST` | [`/accounting/openapi/cc/product/removeBrandProduct/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/sp?id=32085) | 删除品牌商品 | 删除品牌商品 |  |
| `POST` | [`/accounting/openapi/cc/product/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/sp?id=31059) | 商品修改 | 商品修改，支持商品批量修改，以商品编码为唯一标识更新 |  |
| `POST` | [`/accounting/openapi/cc/productBrand/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/hyc_pp?id=33086) | 品牌新增 | 新增品牌 |  |
| `POST` | [`/accounting/openapi/cc/productCategory/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/sp?id=32677) | 商品分类新增 | 新增商品分类,支持商品分类间层级关系,一次新增一个,不支持批量新增 |  |
| `POST` | [`/accounting/openapi/cc/productCategory/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/sp?id=30794) | 查询商品分类 | 查询商品分类 |  |
| `POST` | [`/accounting/openapi/cc/productFeature/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/spsx?id=32768) | 商品属性值新增接口 | 新增商品属性值,支持绑定商品属性值分组,前提是属性值分组已存在(需要传入属性值分组id) |  |
| `GET` | [`/accounting/openapi/cc/productFeature/queryAllProductFeatureByProductFeatureTypeId/{id}/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/spsx?id=32771) | 商品属性值查询接口 | 查询指定商品属性下的全部商品属性值,需要传入属性id |  |
| `POST` | [`/accounting/openapi/cc/productFeature/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/spsx?id=32770) | 商品属性值删除接口 | 删除商品属性值,支持多属性值批量删除 |  |
| `POST` | [`/accounting/openapi/cc/productFeature/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/spsx?id=32769) | 商品属性值更新 | 修改商品属性值,支持修改商品属性值所属属性值分组,属性值分组需要已存在. |  |
| `POST` | [`/accounting/openapi/cc/productFeatureGroup/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/spsx?id=32772) | 商品属性值分组新增接口 | 新增商品属性值分组,并支持绑定商品属性值,商品属性值需要事先创建好 |  |
| `GET` | [`/accounting/openapi/cc/productFeatureGroup/queryAllProductFeatureByProductFeatureGroupId/{id}/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/spsx?id=32776) | 商品属性值分组下的全部商品属性值查询接口 | 查询指定商品属性值分组下的全部商品属性值 |  |
| `GET` | [`/accounting/openapi/cc/productFeatureGroup/queryAllProductFeatureGroupByProductFeatureTypeId/{id}/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/spsx?id=32775) | 商品属性下的全部商品属性分组查询接口 | 查询指定商品属性下的全部商品属性值分组 |  |
| `POST` | [`/accounting/openapi/cc/productFeatureGroup/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/spsx?id=32774) | 商品属性值分组删除接口 | 删除商品属性值分组,单个删除 |  |
| `POST` | [`/accounting/openapi/cc/productFeatureGroup/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/spsx?id=32773) | 商品属性值分组更新接口 | 更新商品属性值分组,并支持修改绑定的商品属性值,商品属性值需要事先创建好 |  |
| `POST` | [`/accounting/openapi/cc/productFeatureType/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/spsx?id=32764) | 商品属性新增 | 新增商品属性,一次新增一个,不支持批量新增 |  |
| `GET` | [`/accounting/openapi/cc/productFeatureType/queryAllProductFeatureType/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/spsx?id=32767) | 商品属性查询接口 | 查询当前账套下的全部商品属性(每个账套最大支持20个商品属性), 及商品属性下的商品属性值(若单个属性下属性值数量超过2 |  |
| `POST` | [`/accounting/openapi/cc/productFeatureType/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/spsx?id=32766) | 商品属性删除 | 删除商品属性,一次删除一个 |  |
| `POST` | [`/accounting/openapi/cc/productFeatureType/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/spsx?id=32765) | 商品属性更新 | 修改商品属性 |  |
| `POST` | [`/accounting/openapi/cc/project/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/project?id=32457) | 项目新增 | 项目新增 |  |
| `POST` | [`/accounting/openapi/cc/project/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/project?id=32484) | 项目列表查询 | 查询项目列表接口 |  |
| `GET` | [`/accounting/openapi/cc/project/query/{id}/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/project?id=32460) | 项目详情 | 项目详情 |  |
| `POST` | [`/accounting/openapi/cc/project/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/project?id=32459) | 项目删除 | 项目删除 |  |
| `POST` | [`/accounting/openapi/cc/project/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/project?id=32458) | 项目修改 | 项目修改 |  |
| `POST` | [`/accounting/openapi/cc/projectcategory/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/project?id=32951) | 项目分类列表 | 项目分类列表 |  |
| `POST` | [`/accounting/openapi/cc/revenueCategory/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/srlx?id=32989) | 新增收入类型分类 | 新增收入类型分类 |  |
| `POST` | [`/accounting/openapi/cc/revenueCategory/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/srlx?id=32992) | 收入类型分类列表 | 收入类型分类列表 |  |
| `DELETE` | [`/accounting/openapi/cc/revenueCategory/remove/{id}/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/srlx?id=32991) | 收入类型分类删除 | 收入类型分类删除 |  |
| `POST` | [`/accounting/openapi/cc/revenueCategory/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/srlx?id=32990) | 修改收入类型分类 | 修改收入类型分类 |  |
| `POST` | [`/accounting/openapi/cc/revenuetype/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/srlx?id=32993) | 新增收入类型 | 新增收入类型 |  |
| `POST` | [`/accounting/openapi/cc/revenueType/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/srlx?id=32996) | 查询收入类型列表 | 查询收入类型接口，返回所有收入类型 |  |
| `POST` | [`/accounting/openapi/cc/revenuetype/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/srlx?id=32995) | 收入类型删除 | 收入类型删除 |  |
| `POST` | [`/accounting/openapi/cc/revenuetype/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/srlx?id=32994) | 修改收入类型 | 修改收入类型 |  |
| `POST` | [`/accounting/openapi/cc/warehouse/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/ck?id=32537) | 仓库新增 | 仓库新增 |  |
| `POST` | [`/accounting/openapi/cc/warehouse/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/ck?id=32541) | 查询仓库列表 | 查询仓库接口，返回所有仓库 |  |
| `GET` | [`/accounting/openapi/cc/warehouse/query/{id}/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/ck?id=32540) | 仓库详情 | 仓库详情 |  |
| `POST` | [`/accounting/openapi/cc/warehouse/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/ck?id=32539) | 仓库删除 | 仓库删除 |  |
| `POST` | [`/accounting/openapi/cc/warehouse/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/ck?id=32538) | 仓库修改 | 仓库修改 |  |
| `POST` | [`/accounting/openapi/cc/warehouseCategory/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/ck?id=32542) | 查询仓库分类 | 查询仓库分类 |  |
| `POST` | [`/cc/hsy/v1/member/memberProfile/findMemberList/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=32350) | 会员档案分页查询 | 好生意 好业财 适用此接口 |  |
| `GET` | [`/cc/marketingtool/MeStorageCard/getAllStorageCard/{meMemberId}/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=32040) | 根据指定会员id查询该会员所有储值卡 | - |  |
| `POST` | [`/cc/marketingtool/MtDistributor/List/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=33332) | 分页查询分销员信息 | 根据条件查询分销员信息 |  |
| `POST` | [`/cc/marketingtool/Storage/storagechange/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=32034) | 储值变动 | 储值发生变动，修改储值如：储值 |  |
| `POST` | [`/cc/member/DynamicCode/generate/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=32747) | 会员动态码 | 自动生成会员动态码，根据动态码可以在POS直接扫码识别会员进行消费，无需出示手机号等敏感信息，动态码有效期内可以正常使用 |  |
| `POST` | [`/cc/member/memberProfile/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=32046) | 新增会员 | 新增会员 |  |
| `POST` | [`/cc/member/memberProfile/findMemberList/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=32036) | (废弃)会员档案分页查询 | 尽限已成功对接此接口的应用可用 |  |
| `POST` | [`/cc/member/memberProfile/findWalletDetailList/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=32035) | 分页查询会员钱包明细 | 会员储值发生变更的明细 |  |
| `GET` | [`/cc/member/memberProfile/getMemberInfoById`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=32321) | 根据会员ID查询会员详情 | 本接口通过会员ID查询详情，返回会员基本信息、会员地址、会员钱包、等信息 |  |
| `GET` | [`/cc/member/memberProfile/getMeMemberIntegralDetailInfo`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=32322) | 根据会员积分明细ID查询积分明细详情 | 根据会员积分明细ID查询积分明细详情 |  |
| `POST` | [`/cc/member/memberProfile/updateForOpen/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=33334) | 会员档案更新 | 根据会员ID，更新会员档案信息 |  |
| `POST` | [`/cc/member/MeMemberType/changeMemberTypeForOpen{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=33372) | 会员等级变更 | 会员等级变更 |  |
| `GET` | [`/cc/member/MeMemberType/findMemberTypeListForOpen`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=33367) | 查询会员等级列表 | 根据会员等级类型，查询普通会员等级列表或付费会员等级列表 |  |
| `POST` | [`/cc/member/MeStorageCard/List/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=33264) | 分页查询会员储值卡明细 | 根据储值卡号查询储值卡信息 |  |
| `POST` | [`/cc/openapi/member/memberProfile/manuallyIntegral/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=32310) | 调整会员积分 | 调整会员积分 |  |
| `POST` | [`/cc/promotion/openapi/findPageCoupon/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=32179) | 根据会员id查询优惠券列表 | 根据会员id查询优惠券列表 |  |
| `GET` | [`/cc/retail/mshop/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=32180) | 根据会员ID查询会员消费明细 | 根据会员ID查询会员消费明细 |  |

## `zjkcgl` — 库存管理(出入库 / 调拨 / 盘点 / 报损 / 材料出库)

共 53 个接口。

| 方法 | URL | 接口名 | 描述 | 已用 |
|---|---|---|---|---|
| `POST` | [`/accounting/openapi/cc/assembly/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/zzcxd?id=32431) | 新增组装拆卸单 | ISV组装拆卸单新增接口 |  |
| `POST` | [`/accounting/openapi/cc/assembly/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/zzcxd?id=32430) | 删除组装拆卸单 | ISV组装拆卸单删除接口 |  |
| `POST` | [`/accounting/openapi/cc/assembly/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/zzcxd?id=32429) | 修改组装拆卸单 | ISV组装拆卸单修改接口 |  |
| `POST` | [`/accounting/openapi/cc/finishedgoodsstock/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/ccprkd?id=32396) | 新增产成品入库单 | ISV产成品入库单新增接口 |  |
| `POST` | [`/accounting/openapi/cc/finishedgoodsstock/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/ccprkd?id=32395) | 删除产成品入库单 | ISV产成品入库单删除接口 |  |
| `POST` | [`/accounting/openapi/cc/finishedgoodsstock/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/ccprkd?id=32397) | 修改产成品入库单 | ISV产成品入库单修改接口 |  |
| `POST` | [`/accounting/openapi/cc/inv/finishedgoodsstock/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/ccprkd?id=32394) | 产成品入库单列表 | ISV产成品入库单列表接口 |  |
| `POST` | [`/accounting/openapi/cc/inv/inventorycostadj/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/cbtzd?id=33177) | 成本调整单列表查询 | 成本调整单列表查询 |  |
| `POST` | [`/accounting/openapi/cc/inv/materialstock/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/clckd?id=32386) | 材料出库单列表 | ISV材料出库单列表接口 |  |
| `POST` | [`/accounting/openapi/cc/inv/onhandqty/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/kc?id=30797) | 查询现存量 | 现存量查询 |  |
| `POST` | [`/accounting/openapi/cc/inv/onhandqty/increment/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/kc?id=30798) | 查询增量现存量 | 现存量查询 |  |
| `POST` | [`/accounting/openapi/cc/inv/onhandqty/incrementqty/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/kc?id=32384) | 查询增量现存量(新版) | 增量现存量查询，查询条件需要精确到时分秒最多查询1000条，不支持分页。若希望超过1000条，建议用现存量查询接口 |  |
| `POST` | [`/accounting/openapi/cc/inv/onhandqtylot/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/kc?id=32477) | 查询现存量（批次、有效期） | 现存量查询，返回批次有效期，每次最多返回100条 |  |
| `POST` | [`/accounting/openapi/cc/inv/stockcount/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/pdd?id=32858) | 盘点单列表查询 | 盘点单列表查询 |  |
| `POST` | [`/accounting/openapi/cc/inv/stockin/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/qtrkd?id=32398) | 其他入库单列表查询 | 其他入库单列表分页查询接口 |  |
| `POST` | [`/accounting/openapi/cc/inv/stockout/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/qtckd?id=32407) | 其他出库单列表 | ISV其他出库单列表接口 |  |
| `POST` | [`/accounting/openapi/cc/inv/stocktransfer/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/dbd?id=32390) | 调拨单列表 | ISV调拨单列表接口 |  |
| `POST` | [`/accounting/openapi/cc/inv/wareLocationOnhandqty/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/kc?id=33375) | 货位结存账查询 | 查询货位结存账 |  |
| `POST` | [`/accounting/openapi/cc/materialstock/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/clckd?id=32388) | 新增材料出库单 | ISV材料出库单新增接口 |  |
| `POST` | [`/accounting/openapi/cc/materialstock/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/clckd?id=32385) | 删除材料出库单 | ISV材料出库单删除接口 |  |
| `POST` | [`/accounting/openapi/cc/materialstock/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/clckd?id=32387) | 修改材料出库单 | ISV材料出库单修改接口 |  |
| `POST` | [`/accounting/openapi/cc/purchasestockin/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/30644?id=32738) | 采购入库单新增 | - |  |
| `POST` | [`/accounting/openapi/cc/purchasestockin/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/30644?id=33283) | 采购入库单列表查询 | 采购入库单列表查询 |  |
| `POST` | [`/accounting/openapi/cc/purchasestockin/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/30644?id=32850) | 采购入库单删除 | 采购入库单删除 |  |
| `POST` | [`/accounting/openapi/cc/purchasestockin/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/30644?id=32844) | 采购入库单修改 | - |  |
| `POST` | [`/accounting/openapi/cc/requiregoods/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/inv1408?id=32998) | 要货单新增 | 新增要货单，以code作为外部单据唯一标识，不能重复。 （删除、审核、弃审参照单据公共接口部分） |  |
| `POST` | [`/accounting/openapi/cc/requiregoods/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/inv1408?id=33000) | 要货单删除 | 要货单删除 |  |
| `POST` | [`/accounting/openapi/cc/requiregoods/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/inv1408?id=32999) | 要货单变更 | 要货单变更，根据好业财内部id作为唯一标识进行处理 |  |
| `POST` | [`/accounting/openapi/cc/salesstockout/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/30645?id=32739) | 销售出库单新增 | - |  |
| `POST` | [`/accounting/openapi/cc/salesstockout/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/30645?id=32849) | 销售出库单删除 | 销售出库单删除 |  |
| `POST` | [`/accounting/openapi/cc/salesstockout/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/30645?id=32845) | 销售出库单修改 | - |  |
| `POST` | [`/accounting/openapi/cc/stock/{inoutFlag}/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/qtckd?id=32856) | 新增其他出入库单V2 | ISV其他出入库单新增接口V2（（删除、审核、弃审参照单据公共接口部分）） |  |
| `POST` | [`/accounting/openapi/cc/stock/{inoutFlag}/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/qtckd?id=32856) | 新增其他出入库单V2 | ISV其他出入库单新增接口V2（（删除、审核、弃审参照单据公共接口部分）） |  |
| `POST` | [`/accounting/openapi/cc/stock/{inoutFlag}/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/qtckd?id=32856) | 新增其他出入库单V2 | ISV其他出入库单新增接口V2（（删除、审核、弃审参照单据公共接口部分）） |  |
| `POST` | [`/accounting/openapi/cc/stock/{inoutFlag}/change/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/qtckd?id=32863) | 其他出入库单变更 | ISV其他出入库单变更接口 |  |
| `POST` | [`/accounting/openapi/cc/stock/{inoutFlag}/change/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/qtckd?id=32863) | 其他出入库单变更 | ISV其他出入库单变更接口 |  |
| `POST` | [`/accounting/openapi/cc/stock/{inoutFlag}/change/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/qtckd?id=32863) | 其他出入库单变更 | ISV其他出入库单变更接口 |  |
| `POST` | [`/accounting/openapi/cc/stock/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/qtrkd?id=32404) | 其他入库单新增 | 其他入库单新增接口，以code作为外部单据唯一标识，不能重复。 （删除、审核、弃审参照单据公共接口部分） |  |
| `POST` | [`/accounting/openapi/cc/stock/add/{bookid}/`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/qtckd?id=32408) | 新增其他出库单 | ISV其他出库单新增接口 |  |
| `POST` | [`/accounting/openapi/cc/stock/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/qtckd?id=32406) | 删除其他出库单 | ISV其他出库单删除接口 |  |
| `POST` | [`/accounting/openapi/cc/stock/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/qtrkd?id=32400) | 其他入库单修改 | 其他入库单修改接口 |  |
| `POST` | [`/accounting/openapi/cc/stock/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/qtckd?id=32409) | 其他出库单修改 | 其他出库单修改接口 |  |
| `POST` | [`/accounting/openapi/cc/stocktransfer/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/dbd?id=32391) | 新增调拨单 | ISV调拨单新增接口 |  |
| `POST` | [`/accounting/openapi/cc/stocktransfer/change/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/dbd?id=32874) | 调拨单变更 | - |  |
| `GET` | [`/accounting/openapi/cc/stocktransfer/query/{code}/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/dbd?id=32393) | 查询调拨单 | ISV根据ID查询调拨单详情 |  |
| `POST` | [`/accounting/openapi/cc/stocktransfer/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/dbd?id=32389) | 删除调拨单 | ISV调拨单删除接口 |  |
| `POST` | [`/accounting/openapi/cc/stocktransfer/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/dbd?id=32392) | 修改调拨单 | ISV调拨单修改接口 |  |
| `POST` | [`/accounting/openapi/cc/v2/OutsourceIssue/add`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/wwf?id=33446) | 委外发料单新增 | 委外发料单新增 |  |
| `POST` | [`/accounting/openapi/cc/v2/OutsourceIssue/list`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/wwf?id=33444) | 委外发料单查询列表 | 委外发料单查询列表 |  |
| `POST` | [`/accounting/openapi/cc/v2/OutsourceIssue/remove`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/wwf?id=33445) | 委外发料单删除 | 委外发料单删除 |  |
| `POST` | [`/accounting/openapi/cc/v2/OutsourceStockin/add`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/wwr?id=33441) | 委外入库单新增 | 委外入库单新增 |  |
| `POST` | [`/accounting/openapi/cc/v2/OutsourceStockin/list`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/wwr?id=33443) | 委外入库单查询列表 | 委外入库单查询列表 |  |
| `POST` | [`/accounting/openapi/cc/v2/OutsourceStockin/remove`](https://open.chanjet.com/docs/file/apiFile/zplus/zjkcgl/wwr?id=33442) | 委外入库单删除 | 委外入库单删除 |  |

## `zjxsgl` — 销售管理(销货单 / 退货单 / 发票 / 渠道分析)

共 23 个接口。

| 方法 | URL | 接口名 | 描述 | 已用 |
|---|---|---|---|---|
| `POST` | [`/accounting/openapi/cc/goodsissue/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/xhd?id=31041) | 销货单新增 | 新增销货单，以code作为外部单据唯一标识，不能重复。 （删除、审核、弃审参照单据公共接口部分） |  |
| `POST` | [`/accounting/openapi/cc/goodsissue/change/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/xhd?id=32859) | 销货单变更 | 变更销货单，根据id作为唯一标识进行处理 |  |
| `PUT` | [`/accounting/openapi/cc/goodsissue/invoice/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/xhd?id=32545) | 销货单开票 | 销货单开票 |  |
| `POST` | [`/accounting/openapi/cc/goodsissue/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/xhd?id=31636) | 销货单列表查询 | 销货单列表查询 |  |
| `GET` | [`/accounting/openapi/cc/goodsissue/query/{id}/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/xhd?id=31042) | 销货单详情查询（已废弃） | 根据销货单id查询销货单详情（已废弃，建议使用销货单列表进行查询） |  |
| `POST` | [`/accounting/openapi/cc/goodsissue/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/xhd?id=31043) | 销货单删除 | 根据单据号删除销货单 |  |
| `POST` | [`/accounting/openapi/cc/goodsissue/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/xhd?id=31705) | 销货单修改 | 修改销货单，根据id作为唯一标识进行处理 |  |
| `POST` | [`/accounting/openapi/cc/goodsissueinfo/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/30610?id=32867) | 销售渠道分析查询 | 销售渠道分析查询 |  |
| `GET` | [`/accounting/openapi/cc/invoiceIssueList/query/{id}/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/30096?id=32354) | 查询销售发票 | 根据销售发票[id]查询销售发票详情 |  |
| `POST` | [`/accounting/openapi/cc/invoiceIssueList/updateInvoiceIssueStatus/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/30096?id=32812) | 销售发票开票中接口 | 销售发票开票中 |  |
| `POST` | [`/accounting/openapi/cc/salesorder/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/xsd?id=30804) | 销售订单新增 | ISV销售订单新增接口 |  |
| `POST` | [`/accounting/openapi/cc/salesorder/change/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/xsd?id=32860) | 销售订单变更 | - |  |
| `POST` | [`/accounting/openapi/cc/salesorder/close/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/xsd?id=23844) | 销售订单终止 | - |  |
| `POST` | [`/accounting/openapi/cc/salesorder/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/xsd?id=32051) | 销售订单列表查询 | 销售订单列表查询 |  |
| `POST` | [`/accounting/openapi/cc/salesorder/query/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/xsd?id=32011) | 销售订单按外部编号查询 | 销售订单按外部编号查询 |  |
| `GET` | [`/accounting/openapi/cc/salesorder/query/{id}/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/xsd?id=30805) | 销售订单详情查询 | 根据【销售订单编号】查询销售订单 |  |
| `POST` | [`/accounting/openapi/cc/salesorder/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/xsd?id=31706) | 销售订单修改 | - |  |
| `POST` | [`/accounting/openapi/cc/v2/InvoiceIssueList/add`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/30096?id=33495) | 销售发票新增 | 销售发票新增 |  |
| `POST` | [`/accounting/openapi/cc/v2/InvoiceIssueList/approve`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/30096?id=33498) | 销售发票审批 | 销售发票审批 |  |
| `POST` | [`/accounting/openapi/cc/v2/InvoiceIssueList/remove`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/30096?id=33497) | 销售发票删除 | 销售发票删除 |  |
| `POST` | [`/accounting/openapi/cc/v2/InvoiceIssueList/unapprove`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/30096?id=33499) | 销售发票弃审 | 销售发票弃审 |  |
| `POST` | [`/accounting/openapi/cc/v2/InvoiceIssueList/update`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/30096?id=33496) | 销售发票修改 | 销售发票修改 |  |
| `POST` | [`/accounting/sales/openapi/v2/SalesOrder/update`](https://open.chanjet.com/docs/file/apiFile/zplus/zjxsgl/xsd?id=33457) | 销售订单修改V2.0 | - |  |

## `zjzjgl` — 资金管理(收款 / 付款 / 现金日记 / 其他收入支出)

共 27 个接口。

| 方法 | URL | 接口名 | 描述 | 已用 |
|---|---|---|---|---|
| `POST` | [`/accounting/openapi/cc/expense/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/fyd?id=31693) | 新增费用支出单 | - |  |
| `POST` | [`/accounting/openapi/cc/expense/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/fyd?id=31695) | 费用支出单列表查询 | - |  |
| `POST` | [`/accounting/openapi/cc/expense/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/fyd?id=31694) | 费用支出单删除 | - |  |
| `POST` | [`/accounting/openapi/cc/fintransfer/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/yhcqkd?id=33075) | 银行存取款单新增 | 银行存取款单新增 |  |
| `POST` | [`/accounting/openapi/cc/fintransfer/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/yhcqkd?id=33072) | 银行存取款单查询 | 银行存取款单列表查询 |  |
| `POST` | [`/accounting/openapi/cc/fintransfer/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/yhcqkd?id=33077) | 银行存取款单删除 | 银行存取款单删除 |  |
| `POST` | [`/accounting/openapi/cc/fintransfer/update/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/yhcqkd?id=33076) | 银行存取款单修改 | 银行存取款单修改 |  |
| `POST` | [`/accounting/openapi/cc/payment/{arapflag}/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/skd?id=31686) | 收付款单新增 | 收款单: https://openapi.chanjet.com/accounting/openapi/cc/payme |  |
| `POST` | [`/accounting/openapi/cc/payment/{arapflag}/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/skd?id=31688) | 收付款单删除 | - |  |
| `POST` | [`/accounting/openapi/cc/revenue/add/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/srd?id=31696) | 其他收入单新增 | - |  |
| `POST` | [`/accounting/openapi/cc/revenue/list/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/srd?id=31698) | 其他收入单列表查询 | 其他收入单列表分页查询 |  |
| `POST` | [`/accounting/openapi/cc/revenue/remove/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/srd?id=31697) | 其他收入单删除 | - |  |
| `POST` | [`/accounting/openapi/cc/v2/OtherAp/add`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/hyc_otherap?id=33407) | 其他应付单新增 | 其他应付单新增 |  |
| `POST` | [`/accounting/openapi/cc/v2/OtherAp/approve`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/hyc_otherap?id=33403) | 其他应付单审批 | 其他应付单审批 |  |
| `POST` | [`/accounting/openapi/cc/v2/OtherAp/list`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/hyc_otherap?id=33404) | 其他应付单查询列表 | 其他应付单查询列表 |  |
| `POST` | [`/accounting/openapi/cc/v2/OtherAp/query`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/hyc_otherap?id=33406) | 其他应付单查看详情 | 其他应付单查看详情 |  |
| `POST` | [`/accounting/openapi/cc/v2/OtherAp/remove`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/hyc_otherap?id=33402) | 其他应付单删除 | 其他应付单删除 |  |
| `POST` | [`/accounting/openapi/cc/v2/OtherAp/unapprove`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/hyc_otherap?id=33405) | 其他应付单弃审 | 其他应付单弃审 |  |
| `POST` | [`/accounting/openapi/cc/v2/OtherAr/add`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/hyc_otherar?id=33410) | 其他应收单新增 | 其他应收单新增 |  |
| `POST` | [`/accounting/openapi/cc/v2/OtherAr/approve`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/hyc_otherar?id=33411) | 其他应收单审批 | 其他应收单审批 |  |
| `POST` | [`/accounting/openapi/cc/v2/OtherAr/list`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/hyc_otherar?id=33413) | 其他应收单查询列表 | 其他应收单查询列表 |  |
| `POST` | [`/accounting/openapi/cc/v2/OtherAr/query`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/hyc_otherar?id=33412) | 其他应收单查看详情 | 其他应收单查看详情 |  |
| `POST` | [`/accounting/openapi/cc/v2/OtherAr/remove`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/hyc_otherar?id=33408) | 其他应收单删除 | 其他应收单删除 |  |
| `POST` | [`/accounting/openapi/cc/v2/OtherAr/unapprove`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/hyc_otherar?id=33409) | 其他应收单弃审 | 其他应收单弃审 |  |
| `POST` | [`/accounting/openapi/cc/v2/PaymentApplication/approve`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/hyc_fksqd?id=33395) | 付款申请单审批 | 付款申请单审批 |  |
| `POST` | [`/accounting/openapi/cc/v2/PaymentApplication/query`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/hyc_fksqd?id=33394) | 付款申请单查看详情 | 付款申请单查看详情 |  |
| `POST` | [`/accounting/openapi/cc/v2/PaymentApplication/unapprove`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzjgl/hyc_fksqd?id=33396) | 付款申请单弃审 | 付款申请单弃审 |  |

## `zjzt` — 账套管理(账套绑定/初始化/查询)

共 6 个接口。

| 方法 | URL | 接口名 | 描述 | 已用 |
|---|---|---|---|---|
| `GET` | [`/accounting/openapi/cc/book/findByEnterpriseId`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzt/ztgl?id=31069) | 查询账套列表 | 返回当前企业下的账套列表 | **g199 ✅ 账套列表(bookid 来源)** |
| `POST` | [`/accounting/openapi/cc/setup/accountBook/setDefault/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzt/ztgl?id=32648) | 设置默认账套 | 特殊接口，需要特约服务商才能使用 |  |
| `POST` | [`/accounting/openapi/document/cooperation/save/externalCustvendor/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzt/ztgl?id=23735) | 外部系统账套绑定 | - |  |
| `GET` | [`/accounting/openapi/tenant/AcctgPeriod/bizDate/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzt/ztgl?id=32864) | 获取最新业务开始日期 | 获取最新业务开始日期，如果业务未结账，返回业务开账日期，如果有结账，返回结账后一天。 |  |
| `GET` | [`/zplus/accounting/accountBook/{bookid}`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzt/ztgl?id=31988) | 获取账套信息 | 智+核算部分获取账套信息 |  |
| `GET` | [`/zplus/setup/openAccess/app/status`](https://open.chanjet.com/docs/file/apiFile/zplus/zjzt/ztgl?id=31846) | 查询开通状态（触发初始化账套） | 查询开通状态（触发初始化账套），需要轮询调用，直到返回200 |  |

---

## 附录 A:Phoenix ERP 已对接接口(g199)

| URL | 用途 | ERP 落地 |
|---|---|---|
| `GET /accounting/openapi/cc/book/findByEnterpriseId` | 账套列表 | `chanjet_book_company_map`(3 家公司种子) |
| `GET /accounting/gl/statistics/receive/{bookid}?period=YYYYMM` | 应收总账 | `chanjet_ar_snapshot` + `fin_ar_ledger`(审核入账) |
| `GET /accounting/openapi/cc/department/list/{bookid}` | 部门列表 | 部门对账(只读) |

详见 [g199-chanjet-api-field-mapping.md](g199-chanjet-api-field-mapping.md)。

## 附录 B:接口 markdown 文件路径

本地 markdown(已 gitignore):
```
scripts/.chanjet-doc-dump/zplus/<id>__<title>.md
```

查单接口:
```bash
# 按 id 查
ls scripts/.chanjet-doc-dump/zplus/ | grep "^<ID>__"

# 按关键词查
ls scripts/.chanjet-doc-dump/zplus/ | grep -i "应收\|销售\|库存"

# 重抓最新(增量,已存在的跳过)
node scripts/fetch-chanjet-zplus-docs.mjs
```

## 附录 C:在线查找(无需本地 dump)

- 模糊检索: `https://open.chanjet.com/md/manifest/search?q=应收&format=md&limit=20`
- 单接口 md: `https://open.chanjet.com/md/docs/file/apiFile/zplus/.../<path>?id=<ID>`
- 一键打包某模块: `https://open.chanjet.com/md/docs/file/apiFile/zplus/<category>?inline=true`
- 全站 manifest: `https://open.chanjet.com/md/docs-manifest.json`
