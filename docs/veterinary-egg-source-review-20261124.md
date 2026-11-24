# 产蛋来源、疫苗扣库与休药承接核查

核查对象为生产部署提交 `44b3e692c18952d7be755114368f15fbcd1d8fba`。本报告中的“基线”均指这个提交。正式发布记录区分主干构建与生产容器切换。[部署回执](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/45345433995/job/138286463080) · [原方案](flock-lifecycle-optimization-review-20261117.md)

## 选舍、商业分类与分级

| 已确认鸡舍配置 | 商业分类 | 分级依据 |
| --- | --- | --- |
| 孟赛 01–06 舍 | 普通商品，`STANDARD`，商业品种为空 | 生产日期对应鸡群的分级日报 |
| 东鹏 01、03、05 舍 | 粉壳，`VARIANT / EGG_PINK` | 同上 |
| 东鹏 02、04 舍 | 红壳，`VARIANT / EGG_RED` | 同上 |

生产在 11 月 12 日应用了 11 条商业来源档案，适用日期从 11 月 10 日起；11 月 13 日只读复核仍有 11 条。东鹏 06 公鸡舍未列入。生物品种保留在鸡群档案，商业来源按公司、鸡舍和产蛋日解析，已入库蛋批保留当时的来源。0–5 号、脏蛋和破损蛋是八个质量等级。同一群鸡可以产出多个等级，入库量要分别与当日已报额度核对。[来源应用回执](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/43169154114/job/131020392086) · [配置复核](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/43365732428/job/131689580227) · [等级定义](egg-grade-defect-fix-runbook.md)

基线能按舍解析产品，但页面遇重叠档案会取第一条，入库服务却拒绝该舍日。正式入库页面也会列出没有剩余额度的等级。核验须包含换舍、换日、换群、迟到的旧请求、历史回执重放和按原来源冲销。

## 免疫、用药及相关入口

| 基线行为 | 对业务的影响 |
| --- | --- |
| 疫苗下拉由 API 读取 `brd_medications` 的有效疫苗。WMS 的兽药疫苗来自 `mst_materials`。 | 下拉可见的临床药品与仓库物料缺少显式映射。 |
| 免疫的批次选择和锁定扣库使用 `b.product_code = medication_code`。本地真实 WMS 确认生成的物料批次为 `item_type=MATERIAL`、`material_code=MAT-VET-NDV`、`product_code=NULL`。 | 同公司合法批次可见于 WMS，免疫仍会报库存不足。 |
| 计划没有完整保存多批分配，执行时用实际羽数乘剂量作为库存数量。 | 瓶与羽份的关系可能错误；执行时需核实群、羽数、ERP 批次、每批实际耗量和库存单位。 |
| 用药选批引用了缺少关联的仓库别名。移动药品台账仍向已退役的治疗出库接口提交。 | 用药记录无法选中实际批次，移动端旧按钮固定失败。 |
| 已有转舍承接视图和入库守卫。补录用药晚于收蛋时，部分下游动作不会重查该产蛋日。 | 只看首次入库能否成功，遗漏在库或待转换蛋品的隔离风险。 |

原反馈所举的孟赛 `LPH_MS_F04 / HOUSE_MS_04` 属于 `COMP-LAO-AGRI`，东鹏药仓 `LPH_DP_MEDICINE` 属于 `COMP-LAO-XINGCHI`。即使药品与物料关联正确，前者也不能直接使用后者库存。本链路的正例应使用本公司、相应场站、有权仓库里的可用批次；跨公司使用须按业务办理库存转移。厂商批号与 ERP 库存批次分别记录。[反馈 #572](https://github.com/ivanzhao299/phoenix-erp-v3/issues/572) · [反馈 #573](https://github.com/ivanzhao299/phoenix-erp-v3/issues/573) · [仓库归属取证](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/42985302335/job/130404954641)

## MED 编码的历史和生产实况

提交 `b264fcac3` 的 GenericCrudService 在启动时将 MED-001 等全局模板写入药品目录。`a2f4edba4` 移除了启动写入。孟赛的 `LPH-MED-*` 是另一次场站导入；历史上两个来源还曾发生过编码重名，不能按数字尾码配对。

11 月 24 日对生产做了只读核验。MED-001 为全局有效模板「新城疫疫苗」，在 sys_dict 中匹配 0 条，被 2 条免疫单引用。MAT-VET-NDV 为有效兽药疫苗物料「新城疫疫苗」，规格 LaSota 株，单位瓶，有 2 个物料库存批次。批次数不等于任何指定鸡群可以领用的瓶数。新单的数据契约以真实物料为准，旧账保留临床编码。LPH-MED-045 为站点目录记录，不能归入全局模板清理。[原启动种子](https://github.com/ivanzhao299/phoenix-erp-v3/blob/b264fcac3/apps/api/src/modules/generic-crud/generic-crud.service.ts#L912-L959) · [生产目录和引用取证](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/45354570466/job/138309153146)

## 发布核验口径

11 月 24 日逐行预检发现两个历史测试组，均为 11 月 17 日孟赛一舍。四级、五级各 30 枚，批次 ID 分别为 413、415，流水 ID 分别为 649、651。其他五项异常计数均为零。用户授权本次发布单独核实这两笔，保留原日报、库存和流水。限定核验同时绑定两笔原始身份、数量、本次候选和待迁移集合，继续要求 CI、备份、迁移回执、API/Web 运行版本和上线只读验收。[通用审计原始 HOLD](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/45351436581) · [逐行预检](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/45352175233)
