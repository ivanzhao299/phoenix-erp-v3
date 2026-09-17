# Q/L4 就绪包 — CS-0001（COMP-LAO-AGRI）

状态：**准备材料。该站 Q/L4 现场物理验收尚未发生**，无任何现场事实被记录或虚构。
当前策略：R/B/P/V=true，Q/H=false。

## 站点上下文（既有只读证据）

| 项 | 值 | 来源 |
|---|---|---|
| 公司:场 | COMP-LAO-AGRI:CS-0001 | rollout 枚举 run 35043818784 |
| 班次数 | 49（非测试） | 同上 |
| 最近班次日期 | 2026-09-14 | 同上 |
| 策略行 | flags=truetruetruetruefalsefalse，SITE_ROLLOUT_VERIFIED | run 35044079365 |
| 仓库/库位编码 | **待采集**（Actions 计费恢复后经 ops 通道只读列出 DISTINCT 编码） | — |

## 现场验收清单（六项，依据 packaging-history-q-l4-acceptance-plan.md）

1. **设备出纸**：打印请求号、设备编号、纸张/DPI、原始标签照片、时间戳、操作人；
2. **标签实贴与扫码**：标签照片、扫码原文/脱敏摘要、箱码、canonical/legacy namespace、时间戳、操作人；
3. **箱数与数量核对**：原包装单号、原产出/当前数量、箱数盘点表、复核人与时间戳（不自动补余）；
4. **接收人事实**：接收人身份、授权范围、交接单号、签名/确认记录、时间戳；
5. **仓库/库位事实**：warehouse/zone/location 编码、现场照片或系统截图、时间戳、操作人；
6. **交付与签收**：交付/签收单号、双方操作人、时间戳、扫码记录、异常说明（异常不得标记成功）。

每条证据至少含 `evidenceRef`、`capturedAt`（含时区）、`operator`、`sourceDocument`、脱敏摘要；不含密码/token/完整个人敏感信息。

## 建议验收操作序列

- 用本站最近一个 CLOSED 班次下的真实包装单（编码于现场从终端历史列表获取）作样张；
- 走完整链：箱注册 → 扫码验证 → 打印（观察 PBX 编码输出）→ 盘点核对 → 接收人确认演练（H 当前关闭，确认按钮不可用属预期，验证门禁本身即证据之一）；
- 全部六项证据归档后由所有者声明通过。

## evidenceRef 命名建议

`QL4-CS-0001-<YYYYMMDD>`（如 QL4-CS-0001-20260916）

## 通过后升级路径

所有者声明 evidenceRef + deviceProfile 后，一次 dispatch：

```bash
gh workflow run packaging-history-site-rollout.yml --ref main \
  -f approve_production=APPROVE-PKG-HISTORY-SITE-ROLLOUT \
  -f action=enable-full -f company_code=COMP-LAO-AGRI -f site_code=CS-0001 \
  -f evidence_ref=QL4-CS-0001-<date> -f device_profile=<实际设备型号>
```

前置校验：该站必须已存在 `truetruetruetruefalsefalse` 策略行；升级后读回必须为
`flags=truetruetruetruetruetrue` 且资格字段非空 → `SITE_FULLY_ENABLED_VERIFIED`。
