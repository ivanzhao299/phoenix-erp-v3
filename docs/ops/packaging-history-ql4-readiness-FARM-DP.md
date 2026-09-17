# Q/L4 就绪包 — FARM-DP（COMP-LAO-XINGCHI）

状态：**准备材料。该站 Q/L4 现场物理验收尚未发生**，无任何现场事实被记录或虚构。
当前策略：R/B/P/V=true，Q/H=false。

## 站点上下文（既有只读证据）

| 项 | 值 | 来源 |
|---|---|---|
| 公司:场 | COMP-LAO-XINGCHI:FARM-DP | rollout 枚举 run 35043818784 |
| 班次数 | 2（非测试） | 同上 |
| 最近班次日期 | 2026-08-26 | 同上 |
| 策略行 | flags=truetruetruetruefalsefalse，SITE_ROLLOUT_VERIFIED | run 35044194199 |
| 仓库/库位编码 | **待采集**（Actions 计费恢复后经 ops 通道只读列出 DISTINCT 编码） | — |

注意：该站班次少（2 次）且最近班次较早（2026-08-26），建议现场验收安排在
下一个活跃班次期间进行，或先由运营确认该站包装业务是否持续。

## 现场验收清单

与 CS-0001 就绪包相同的六项清单（依据 packaging-history-q-l4-acceptance-plan.md）：
设备出纸 / 标签实贴与扫码 / 箱数与数量核对 / 接收人事实 / 仓库库位事实 / 交付与签收。
证据字段要求同模板（evidenceRef、capturedAt、operator、sourceDocument、脱敏摘要）。

## 建议验收操作序列

- 该站历史班次少，建议在新开班次产生首张真实包装单后，以其为样张走完整链
  （箱注册 → 扫码 → 打印 → 盘点 → 接收确认门禁验证）；
- 若现场无活跃业务，可暂缓本站 Q/L4，保持 R/B/P/V 观察期。

## evidenceRef 命名建议

`QL4-FARM-DP-<YYYYMMDD>`

## 通过后升级路径

```bash
gh workflow run packaging-history-site-rollout.yml --ref main \
  -f approve_production=APPROVE-PKG-HISTORY-SITE-ROLLOUT \
  -f action=enable-full -f company_code=COMP-LAO-XINGCHI -f site_code=FARM-DP \
  -f evidence_ref=QL4-FARM-DP-<date> -f device_profile=<实际设备型号>
```

前置校验与读回断言同 CS-0001（`SITE_FULLY_ENABLED_VERIFIED`）。
