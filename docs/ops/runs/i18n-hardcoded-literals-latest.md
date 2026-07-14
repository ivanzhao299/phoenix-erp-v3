# i18n Hardcoded Literals Audit

Generated: 2026-07-14T12:23:20.714Z

Total findings: 3240
Auto-translatable by runtime bridge: 3240
Still requiring componentization or dictionary modeling: 0
Locale quality issues: 0
Affected files: 176

This report is intentionally stricter than `scripts/check-i18n-keys.js`: key parity can pass while pages still render hardcoded Chinese.

## Top Files

| File | Count | Samples |
|---|---:|---|
| `apps/web/src/app/(admin)/finance2/chanjet-integration/page.tsx` | 422 | 685:[{"summary":"示例摘要","debitSubject":"","creditSubject":"","amount":0}]<br>716:总览加载失败<br>749:账套缓存<br>750:字段目录<br>750:脱敏字段样本<br>751:映射候选<br>752:凭证草稿<br>753:镜像实体 |
| `apps/web/src/components/master-data/detail-configs.tsx` | 199 | 88:客户中心<br>92:订单<br>93:应收<br>97:订单数<br>98:单 (近期)<br>101:近期销售额<br>105:应收余额<br>112:逾期单据 |
| `apps/web/src/components/layout/Sidebar.tsx` | 158 | 72:运营工作台<br>74:每日工作台<br>81:经营仪表盘<br>84:生产管理<br>86:养殖总览<br>87:鸡舍管理<br>88:鸡群档案<br>89:日生产日报 |
| `apps/web/src/lib/workflow-templates.ts` | 124 | 35:费用报销审批<br>36:财务<br>40:费用报销单<br>43:申请金额<br>44:费用类型<br>44:差旅费<br>44:招待费<br>44:办公费 |
| `apps/web/src/app/(admin)/workflow/designer/[id]/page.tsx` | 97 | 67:发起申请<br>73:一级审批<br>83:流程完成<br>95:财务会计<br>98:财务负责人<br>101:采购员<br>104:仓储负责人<br>107:品控负责人 |
| `apps/web/src/lib/dict-type-labels.ts` | 88 | 9:审批模块类型<br>10:品种<br>10:品种类型<br>10:淘汰原因<br>11:鸡群状态<br>11:鸡舍类型<br>11:死亡原因<br>12:养殖班次 |
| `apps/web/src/app/(admin)/traceability/page.tsx` | 73 | 19:库存批次<br>24:包装批次<br>29:标签码<br>30:标签号 label_no<br>34:销售单<br>35:SO / 订单号<br>39:客户<br>40:客户编码 |
| `apps/web/src/app/(admin)/finance2/reports/page.tsx` | 71 | 303:好业财口径<br>304:ERP回退<br>313:待同步好业财镜像<br>319:已对齐<br>320:小差异<br>321:需对账<br>322:待字段锁定<br>323:ERP回退 |
| `apps/web/src/lib/workflow-data-catalog.ts` | 56 | 23:系统用户<br>24:用户<br>35:用户ID<br>35:作为提交值<br>36:用户姓名<br>36:作为页面显示<br>41:系统角色<br>42:角色 |
| `apps/web/src/lib/shareholder-api.ts` | 48 | 56:蛋鸡养殖场<br>56:肉鸡养殖场<br>56:屠宰加工厂<br>57:食品厂<br>57:有机肥生产厂<br>57:孵化场<br>58:饲料厂<br>58:其他 |
| `apps/web/src/app/(admin)/system/alerts/page.tsx` | 47 | 74:API 500 / PG 错误<br>75:定时任务失败<br>75:Cron 失败写入 CRON_FAILURE 告警<br>76:IoT 同步异常<br>77:数据质量风险<br>222:手动处理<br>315:当前值班待办<br>322:严重告警 |
| `apps/web/src/app/(admin)/finance2/page.tsx` | 41 | 162:来源待确认<br>163:好业财应收汇总<br>164:好业财应付汇总<br>165:好业财资金账户<br>166:好业财收款镜像<br>167:好业财付款镜像<br>168:好业财科目余额<br>169:好业财资产负债表 |
| `apps/web/src/lib/design-tokens.ts` | 39 | 204:成功<br>205:警告<br>206:危险<br>207:信息<br>208:禁用<br>209:正常<br>210:待处理<br>211:运行中 |
| `apps/web/src/app/(admin)/master-data/bank-accounts/_fields.ts` | 38 | 5:开户行(中文)<br>5:基本信息<br>6:基本信息<br>7:支行<br>7:基本信息<br>8:所属公司编码<br>8:基本信息<br>9:账号 |
| `apps/web/src/app/(admin)/settings/approval-rules/page.tsx` | 38 | 68:采购申请<br>71:采购订单<br>74:付款申请<br>77:股东资金<br>80:费用申请<br>83:报销付款<br>86:销售订单<br>89:销售退货 |
| `apps/web/src/app/(mobile)/mobile/home/page.tsx` | 35 | 31:每日看板<br>34:生产·包装·品质·销售<br>42:饲料台账<br>45:出入库登记·库存预警<br>53:死淘快录<br>56:各栋死淘数量快速录入<br>64:包装统计<br>67:班次产出、等级分布 |
| `apps/web/src/app/login/page.tsx` | 35 | 16:集团管理层<br>25:🔑 系统超管<br>30:👑 集团总裁<br>35:🕵 审计专员<br>40:🖥 运维管理员<br>44:养殖品控线<br>53:🏡 养殖场长<br>58:💉 驻场兽医 |
| `apps/web/src/app/(admin)/finance2/ar/page.tsx` | 34 | 149:未到期<br>153:逾期≤30天<br>157:逾期31-60<br>161:逾期61-90<br>165:逾期>90天<br>174:手工<br>178:销售订单<br>182:合同 |
| `apps/web/src/app/(admin)/master-data/products/_fields.ts` | 33 | 5:产品名称<br>5:基本信息<br>6:产品名称(中文)<br>6:基本信息<br>7:产品名称(老挝语)<br>7:基本信息<br>8:品类<br>8:基本信息 |
| `apps/web/src/app/(admin)/master-data/organizations/page.tsx` | 32 | 97:集团<br>98:事业群<br>99:公司<br>100:场区<br>101:工厂<br>102:项目<br>103:仓库<br>104:门店 |
| `apps/web/src/app/(admin)/master-data/suppliers/_fields.ts` | 31 | 5:供应商名称<br>5:基本信息<br>6:英文名称<br>6:基本信息<br>7:供应商类型<br>7:基本信息<br>9:本地<br>9:海外 |
| `apps/web/src/app/(admin)/workflow/builder/page.tsx` | 31 | 24:财务会计<br>27:财务负责人<br>30:采购员<br>33:仓储负责人<br>36:品控负责人<br>43:负责人审批<br>49:申请金额<br>54:申请原因 |
| `apps/web/src/hooks/usePackagingDicts.ts` | 31 | 14:1号蛋<br>15:2号蛋<br>16:3号蛋<br>17:4号蛋<br>18:5号蛋<br>22:脏蛋<br>23:裂缝蛋<br>24:破蛋 |
| `apps/web/src/app/(admin)/daily-work/page.tsx` | 30 | 43:生产日报录入<br>43:存栏 / 死亡 / 淘汰 / 产蛋 / 产蛋率<br>45:鸡群档案<br>47:死淘快速登记<br>47:紧急死亡 / 淘汰登记 · 含原因<br>49:饲料消耗登记<br>51:兽药使用记录<br>51:日常用药 / 治疗记录 |
| `apps/web/src/app/(admin)/master-data/cash-accounts/_fields.ts` | 29 | 5:账户名称<br>5:基本信息<br>6:所属公司<br>6:基本信息<br>7:所属公司名称(自动带出)<br>7:基本信息<br>8:币种<br>8:基本信息 |
| `apps/web/src/app/(admin)/settings/roles/page.tsx` | 28 | 97:查看<br>99:查看（View）<br>102:新增<br>104:新增（Create）<br>107:编辑<br>109:编辑（Edit）<br>112:删除<br>114:删除（Delete） |
| `apps/web/src/app/trace/[batchNo]/page.tsx` | 28 | 52:加载中…<br>65:未找到该批次<br>68:未找到批次「<br>80:🥚 凤凰鲜鸡蛋 · 追溯<br>81:📦 批次信息<br>82:批次号<br>83:产品<br>84:规格 / 等级 |
| `apps/web/src/app/(admin)/data-quality/page.tsx` | 27 | 45:优秀<br>46:良好<br>47:及格<br>48:需整改<br>62:主数据<br>63:主数据<br>64:主数据<br>65:主数据 |
| `apps/web/src/app/(admin)/master-data/page.tsx` | 27 | 80:组织中心<br>81:集团 / 公司 / 项目 / 用户授权<br>86:组织架构<br>91:公司档案<br>96:项目档案<br>102:商业主体中心<br>103:客户 / 供应商 / 门店<br>108:客户档案 |
| `apps/web/src/app/(admin)/workflow/definitions/page.tsx` | 26 | 14:财务<br>14:采购<br>14:合同<br>14:人事<br>14:仓储<br>14:品控<br>14:门店<br>14:养殖 |
| `apps/web/src/app/(admin)/sales2/customers/page.tsx` | 25 | 17:直营店<br>20:经销商<br>23:代理商<br>26:大客户<br>29:散客零售<br>33:正常<br>36:观察<br>39:黑名单 |
| `apps/web/src/app/(admin)/workflow/start/page.tsx` | 25 | 49:全部<br>63:全部<br>68:全部<br>75:无必填项<br>397:财务<br>398:采购<br>399:合同<br>400:人事 |
| `apps/web/src/components/settings/UserOrgBindingPanel.tsx` | 25 | 43:个人<br>43:仅本人数据<br>44:项目<br>44:所属项目数据<br>45:公司<br>45:所属公司数据<br>46:区域<br>46:区域汇总数据 |
| `apps/web/src/components/workflow/WorkflowDataView.tsx` | 25 | 63:数据源匹配中或暂无名称<br>76:金额<br>77:费用类型<br>78:门店<br>79:申请原因<br>80:物料/商品<br>81:数量<br>82:预算金额 |
| `apps/web/src/app/(admin)/master-data/customers/_fields.ts` | 24 | 5:客户名称<br>5:基本信息<br>6:客户类型<br>6:基本信息<br>7:所属公司<br>7:基本信息<br>8:联系人<br>8:联系方式 |
| `apps/web/src/app/(admin)/shareholders/capital/import/page.tsx` | 24 | 93:项目<br>93:项目名称<br>94:股东<br>94:股东姓名<br>95:金额<br>95:出资金额<br>96:日期<br>96:出资日期 |
| `apps/web/src/app/(admin)/workflow/instances/[id]/page.tsx` | 24 | 131:待分配<br>139:暂无待处理节点<br>140:无待处理人<br>141:流程当前无需人工处理<br>143:从发起到当前的运行时长<br>149:等待审批处理<br>150:等待系统流转<br>151:流程已完成 |
| `apps/web/src/app/(admin)/sales2/pricing/page.tsx` | 23 | 23:草稿<br>27:审批中<br>31:已批准<br>35:生效中<br>39:已失效<br>43:已取消<br>50:0号蛋<br>51:1号蛋 |
| `apps/web/src/app/(admin)/workflow/forms/page.tsx` | 23 | 21:财务<br>21:采购<br>21:合同<br>21:人事<br>21:仓储<br>21:品控<br>21:门店<br>21:养殖 |
| `apps/web/src/app/(admin)/uat/page.tsx` | 22 | 62:未命名维度<br>76:未命名验收项<br>108:采购管理<br>109:财务管理<br>110:销售管理<br>111:配送管理<br>112:库存管理<br>113:审批流程 |
| `apps/web/src/app/(admin)/workflow/page.tsx` | 22 | 13:采购申请<br>13:采购<br>14:费用报销<br>14:财务<br>15:库存调整<br>15:仓储<br>16:门店折扣<br>16:门店 |
| `apps/web/src/app/(admin)/breeding/med-stock/page.tsx` | 20 | 55:2号舍<br>55:3号舍<br>55:4号舍<br>55:5号舍<br>55:6号舍<br>55:全场<br>261:药品名称<br>261:规格 |
| `apps/web/src/app/(admin)/bug-reports/page.tsx` | 20 | 197:已批准待执行<br>198:Agent 执行中<br>199:HOLD 待处理<br>200:待批准入队<br>201:待生成计划<br>280:刷新结果<br>291:已通过<br>291:未通过 |
| `apps/web/src/app/(admin)/finance2/shareholder-funds/page.tsx` | 20 | 103:股权投资<br>104:借款<br>105:垫资<br>106:担保金<br>107:代付<br>117:草稿<br>118:待确认<br>119:已确认 |
| `apps/web/src/app/(admin)/store-payment/page.tsx` | 20 | 24:万象直营店<br>162:附件预览待安全授权开通。<br>163:当前文件不可预览或下载。<br>164:权限不足，无法访问附件。<br>166:安全策略禁止裸链接访问。<br>168:当前仅显示受控附件状态。<br>214:文件元数据未配置<br>225:安全策略禁止裸链接访问 |
| `apps/web/src/components/uat/FeedbackWidget.tsx` | 20 | 23:🐞 功能异常<br>24:💡 改进建议<br>25:❓ 操作疑问<br>26:📊 数据问题<br>29:低 · 不影响使用<br>30:中 · 有点别扭<br>31:高 · 影响干活<br>32:紧急 · 干不下去了 |
| `apps/web/src/app/(admin)/breeding/device-alerts/page.tsx` | 19 | 73:实时<br>77:延迟<br>81:陈旧<br>85:无数据<br>101:环境<br>106:控制<br>111:饲喂<br>116:饮水 |
| `apps/web/src/app/(admin)/finance2/ap/page.tsx` | 19 | 143:未到期<br>147:逾期 ≤30天<br>151:逾期 31-60天<br>155:逾期 61-90天<br>159:逾期 >90天<br>168:手工<br>172:采购订单<br>176:费用 |
| `apps/web/src/app/(admin)/sales2/returns/page.tsx` | 18 | 94:草稿<br>98:已提交<br>102:待审批<br>106:质检中<br>110:回库中<br>114:已完成<br>118:已拒绝<br>122:已取消 |
| `apps/web/src/app/(admin)/procurement2/suppliers/page.tsx` | 17 | 52:集团共享<br>58:公司专用<br>64:项目专用<br>72:老挝 LA<br>75:中国 CN<br>78:泰国 TH<br>81:越南 VN<br>84:美国 US |
