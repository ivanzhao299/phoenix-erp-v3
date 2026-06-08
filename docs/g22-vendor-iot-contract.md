# G22-3 · Vendor IoT API 契约文档

> **立账日**：2026-06-08
> **欠债 ID**：F1（vendor history API 真返回结构靠 dump 才知，缺接口契约）
> **背景**：G16-3 折线图 0 数据点排查耗 3 个 fix（query 参数名/写入 SQL TODO/parser 取错字段名/类型推断）+ 临时加 dump endpoint 才发现 vendor 真返回 `[{ propertyCode, datas: [{ data, time }] }]` 而非预期的 `[{ value }]`。

## Vendor 基本信息

- **平台**：第三方 IoT 平台
- **认证**：OAuth2 Bearer Token
- **基础 URL**：从 env `IOT_API_BASE` 注入
- **限流**：**同 vendorHouseId 调用间隔 ≥ 10s**（vendor 端约束）

## Endpoint 契约

### 1. POST `/auth/token` — 获取访问令牌

**Request body**：（vendor 文档规定，敏感信息走 env）

**Response**：
```json
{
  "success": true,
  "data": {
    "accessToken": "Bearer xxx",
    "expireTime": 1717000000     // epoch seconds, 含 5min 过期缓冲
  }
}
```

实现位置：`apps/api/src/modules/iot/iot-sync.service.ts:69-94`

---

### 2. POST `/open/api/house/list` — 获取鸡舍列表

**Request body**：`{}`

**Response**：
```json
[
  { "id": 1471, "name": "A002 名称" },
  { "id": 1472, "name": "A001 名称" },
  ...
]
```

---

### 3. POST `/open/api/house/device/propertys` — 实时数据快照

**Request body**：
```json
{ "houseId": 1471 }
```

**Response**：嵌套结构（设备 → property）
```json
[{
  "deviceId": "xxx",
  "propertys": [
    { "code": "2001", "value": 24.5, "lastUpdateTime": 1717000000000, "name": "温度" },
    { "code": "2083", "value": 65.2, "lastUpdateTime": 1717000000000, "name": "湿度" },
    ...
  ]
}]
```

**注意**：
- `code` 是 string（不是 int）
- `value` 是数字字符串或数字
- `lastUpdateTime` 是 epoch ms（**bigint，可能为空字符串 → 用 Date.now() 兜底**）
- property_code 字段名：`code`（不是 propertyCode）

---

### 4. POST `/open/api/house/device/property/date/data/history` — 历史数据 ⚠️

**Request body**：
```json
{
  "houseId": 1471,
  "date": "2026-06-07",
  "propertyCodes": ["2001", "2083", "2002", "2003"]
}
```

**Response**：⚠️ **与实时 API 结构完全不同**
```json
[{
  "id": 3912,
  "imei": "001a00123033470e35373334",
  "propertyCode": "2001",                  // ← 注意：propertyCode 不是 code
  "datas": [                                // ← datas 不是 propertys
    { "data": "24.30", "time": 1780761502000 },   // ← data 不是 value！
    { "data": "24.40", "time": 1780761202000 },
    ...
  ]
}]
```

**字段命名陷阱**：
- 实时 API：`code` / `value` / `lastUpdateTime`
- 历史 API：`propertyCode` / `data` / `time`（**全不同**）

**前端 parser 必须 tolerant 取**：`p.data ?? p.value` 和 `p.time ?? p.collectTime ?? p.lastUpdateTime`

**限流**：同 houseId 11s 间隔（10s 是 vendor 阈值，加 1s buffer）。

**当某天/某舍真无采集数据**：`[]` 空数组（不报错）。例如 A001 在 2026-06-06 无数据。

---

### 5. Property Code 映射（业务方核心 6 项）

| code | 名称 | 类型 | 单位 | 累计/瞬时 |
|---|---|---|---|---|
| 2001 | 温度 | 瞬时 | ℃ | 算均值 |
| 2083 | 湿度 | 瞬时 | % | 算均值 |
| 2484 | 水表 | **累计读数** | t / m³ | 日用量 = 今日 max − 昨日 max |
| 2488 | 饲料过磅 | **累计读数** | kg | 日用量 = 今日 max − 昨日 max |
| 2532 | 饲料过磅 (alt) | 累计读数 | kg | 同 2488 fallback |
| 2002 | CO₂ | 瞬时 | ppm | 算均值 |
| 2003 | 氨气 | 瞬时 | ppm | 算均值 |
| 2090 | CO₂ (alt) | 瞬时 | ppm | 仅 all-summary 用 |
| 2096 | 氨气 (alt) | 瞬时 | ppm | 仅 all-summary 用 |

业务规则（用户原话）：
- **当日饮水量** = 该鸡舍水表 24h 变化量（今日累计 − 昨日累计）
- **当日饲料消耗** = 24h 饲料过磅差额
- **温度/湿度** = 当日均值

实现位置：`mon-device.service.ts:165-265 generateDailyReportFromIoT`

---

## 数据存储链路

```
vendor API
  ↓ fetchRealtimeProxy (5min cron)
mon_device_realtime_snapshot  (当前快照，ON CONFLICT UPDATE 770 行)
  ↓ 同步双写（G16-3）
mon_device_property_history   (历史时序，按小时桶去重，2098+ 行)
  ↓ 聚合（pgsql cron）
mon_device_property_daily_agg (日聚合，avg_val/max_val，G16 backfill 时按天写)
```

前端 trends 折线优先查 history，无则 fallback daily_agg。

## 已知坑

1. **限流**：同 houseId 调用不足 10s → vendor 返 `"栏舍id：xxx 请求频率过快，请间隔 10s 调用"`。所有历史回填必须并行（按 houseId 分散），同 houseId 内部串行 + 11s sleep。
2. **lastUpdateTime 空字符串**：vendor 偶尔返 `lastUpdateTime: ""` → `Number("")` = 0 → 时间戳为 0。必须 `(x && !isNaN(Number(x))) ? Number(x) : Date.now()` 兜底。
3. **A001 无数据**：vendor 端真没采集，dump endpoint 返 `[]`。不是 bug，不影响其他舍。
4. **历史 API 结构变更**：vendor 未通知就改字段名（`data` vs `value` 等），写 parser 时**永远 tolerant 取**：`p.data ?? p.value ?? p.val`。

## 调试 endpoint

- `POST /api/v3/iot/devices/history/dump` (admin only)
  body: `{ houseCode, date?, propertyCodes? }`
  返回 vendor 原始响应 + type/keys/length/sample（生产 debug 用）

- `POST /api/v3/iot/devices/history/backfill` (admin only)
  body: `{ days?: 7, houseCode?, propertyCodes? }`
  全量回填 N 天历史（限流自处理）

## 维护约定

- vendor API 字段变化 → **立即更新本文档**
- 加新 endpoint → 同步加入本文档对应章节
- 任何"凭印象"调用 vendor API 都要先 dump 验证真返回
