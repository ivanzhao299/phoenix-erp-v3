# g199 好业财接口权限体检报告

> **探测时间**: 2026-06-19T07:53:26.142Z
> **探测 bookid**: 3533914511118750(凤凰农业 — 权限是 app 级,任一家结果代表全部)
> **样本**: 41 个 GET-only 接口(纯读无副作用;含业务 ID 占位符的接口已跳过)
> **重跑**: `PHOENIX_ADMIN_TOKEN=<JWT> node scripts/g199-probe-chanjet-permissions.mjs`

## 总览

| 状态 | 数量 | 含义 | 行动 |
|---|---|---|---|
| ✅ OK | 0 | 接口已开通且可调 | 无 |
| ⚠️ NO_PERM(50111) | 39 | **接口未开通** | 去控制台勾选 |
| 🔧 BIZ_ERR_OPEN | 2 | 已开通,但 GET 参数不全(实为 list/query 类需 body) | 无(误报) |
| ❌ NOT_FOUND(50000) | 0 | 路径错或接口下架 | 字典需修正 |
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
| 32534 | `GET` | `/accounting/openapi/cc/contractCategory/remove/{bookid}` | 删除合同分类 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/xmht/htfl?id=32534) |
| 32767 | `GET` | `/accounting/openapi/cc/productFeatureType/queryAllProductFeatureType/{bookid}` | 商品属性查询接口 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/spsx?id=32767) |
| 32864 | `GET` | `/accounting/openapi/tenant/AcctgPeriod/bizDate/{bookid}` | 获取最新业务开始日期 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjzt/ztgl?id=32864) |
| 31812 | `GET` | `/accounting/payroll/payrollEmployee/outside/getPayrollList/{bookid}` | （外部接口） 精确查询工资 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/hyczzgl/zzgzgl?id=31812) |
| 32321 | `GET` | `/cc/member/memberProfile/getMemberInfoById` | 根据会员ID查询会员详情 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=32321) |
| 32322 | `GET` | `/cc/member/memberProfile/getMeMemberIntegralDetailInfo` | 根据会员积分明细ID查询积分明细详情 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=32322) |
| 33367 | `GET` | `/cc/member/MeMemberType/findMemberTypeListForOpen` | 查询会员等级列表 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=33367) |
| 33069 | `GET` | `/cc/openapi/freevoucher/metalist/{bookid}` | 自定义表单元数据列表查询 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/ggjk/zdybd?id=33069) |
| 32180 | `GET` | `/cc/retail/mshop/list/{bookid}` | 根据会员ID查询会员消费明细 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjjcda/member?id=32180) |
| 31988 | `GET` | `/zplus/accounting/accountBook/{bookid}` | 获取账套信息 | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjzt/ztgl?id=31988) |
| 31846 | `GET` | `/zplus/setup/openAccess/app/status` | 查询开通状态（触发初始化账套） | [文档](https://open.chanjet.com/docs/file/apiFile/zplus/zjzt/ztgl?id=31846) |

