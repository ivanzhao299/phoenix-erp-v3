# 翻译水合器全站收口报告（2026-08-22）

## 结论

`HardcodedChineseHydrator` 的中文模式修复已正确，但非中文语言仍保留同一家族缺陷：React 在原 Text/Element 上写入新的中文动态值时，旧实现只在缓存不存在时记录，随后会用首次缓存的中文源值重新翻译并覆盖新值。文本节点和 `placeholder/title/aria-label` 属性均受影响。

本轮统一为“最新业务中文即源值”：无论当前语言为何，只要观察到来自 React/业务的中文值，就替换该节点或属性的源值，再按当前语言输出。另加一次性 hydrator 写入标记，避免目标译文本身含汉字时被误判为新的业务源值。

## 残余路径审计

### characterData（确认有缺陷，已修）

- 原实现的中文快速分支只在 `ctx.lang === 'zh'` 更新 `textOriginals`；非中文下仅在 WeakMap 尚无记录时写入。
- 因此 `zh: 150羽 → lo → React 写 300羽` 时，WeakMap 仍为 `150羽`，旧逻辑以旧源重新翻译并覆盖 React DOM。
- 新实现见 `apps/web/src/contexts/LanguageContext.tsx:154-174`：读取并消费 hydrator 自写标记，调用纯决策函数；业务写入的任何中文都会成为最新 source。
- 纯决策函数见 `apps/web/src/lib/i18n-hydrator.ts:15-30`：非中文以最新 source 翻译，中文直接恢复最新 source。

### 语言切换（修复后正确）

- `zh → lo`：effect 因 context 变化重建并 `walk(document.body)`，使用缓存中文源值输出老挝语。
- `lo` 期间 React 写新中文：刷新 source 后立即以新 source 输出老挝语。
- `lo → zh`：再次全量 walk，从 WeakMap 恢复的已是最新中文源值，不是首次值。
- Playwright 实证为 `150ຂົນ → 300ຂົນ →（切回中文）300羽`。

### childList 新增节点（原路径正确，保留）

- observer 对每个 `addedNode` 调用 `walk(node)`，而 `walk` 同时处理根节点及所有 Text/Element 后代（`LanguageContext.tsx:211-225`）。
- 新行、卡片、toast 或 portal 首次插入时无旧缓存；其中文值当场成为 source，并按当前语言翻译。纯逻辑用例另覆盖首次新增的 `共 2 条`。

### attributes（确认有同型缺陷，已修）

- `placeholder/title/aria-label` 原来同样只在中文模式或首次见中文时更新缓存，因此非中文模式下 React 动态更新属性会被旧译文覆盖。
- 新实现逐属性套用同一决策函数（`LanguageContext.tsx:181-208`），并通过 `mutation.attributeName` 精确消费该属性的自写标记（`:226`），不会误消费同一元素其他属性的待处理标记。
- 通知铃铛 `title` 从动态未读标题归零到“消息中心”的浏览器用例覆盖了属性更新路径。

### hydrator 自写译文与生命周期

- `textOriginals` / `attrOriginals` 继续使用 WeakMap，DOM 节点不可达后不会被缓存强引用；effect 清理会 disconnect observer。
- 新增 `textWrites` / `attrWrites` 也为 WeakMap，只保存 observer 自己刚写入的预期值，并在对应 mutation 到达时消费。
- 这是必要保护：目标语言译文可能仍含中文字符；若一律把“观察到的中文”当业务源而不区分来源，会丢失真正中文 source，切回中文错误。

### SKIP_TAGS / data-i18n-skip

- `SCRIPT/STYLE/TEXTAREA/CODE/PRE/NOSCRIPT` 与 `[data-i18n-skip="true"]` 在 Text 和 Element 两条路径均于任何写入前返回（`LanguageContext.tsx:157-158,178-179`）。
- 被跳过内容不翻译，但 hydrator 也不记录、不恢复、不改写，不会与 React 争用；这是预期的显式跳过语义，不构成本缺陷的另一方向。

### 第二只同型机制

`apps/web/src` 全仓检索 `MutationObserver` 及 `textContent/innerText/innerHTML/nodeValue/setAttribute` 写入：

- 唯一 MutationObserver 和唯一文本/目标属性改写者就是 `HardcodedChineseHydrator`。
- `ThemeContext.tsx` 与 `ThemeSwitcher.tsx` 只设置 `<html>/<body>` 的 `data-theme`，不在 hydrator 的 attributeFilter 内。
- `bug-intake-telemetry.ts` 只读取 `innerText/textContent`。
- 未发现第二只同型 React DOM 争用机制。

## 动态中文影响面清单

全仓按“加载后变化且含中文/中文单位”检索得到的主要高价值组：

- 养殖：鸡群 selector 的 `${currentQty}羽`；设备总览“共 N 个监测点/N 台/N 栋在线/N 个告警”；鸡舍详情动态存栏、告警、传感器、KPI；用药记录“共 N 条”。
- 包装/销售：首页 Dashboard 的可用批次/POS 笔数；包装分级枚数与等级数；POS 销售/班次分页“共 N 条”；移动销售动态枚数。
- 仓储：仓库批次/库区/库存量；库位“共 N 个”“共显示 N/M 条”；库存查询数量；入库、出库、调拨状态徽章。
- 质量/工作流/通知：质量总览“共 N 条质检记录”；工作流瓶颈/逾期/催办数量；通知未读数、分页总数；铃铛动态 `title`；告警横幅项数。
- 财务/采购：AR/AP/资金调拨分页与核销条数、多币种数、账户/发票/付款 KPI；采购申请、付款、收货及供应商分页总数。
- 系统/主数据/通用表格：系统告警与错误日志总数；主数据引用/搜索结果数；两套通用 DataTable 的总记录数和页码。

测试选点优先覆盖了三种不同更新机制：异步加载后 `0 → N`、用户动作后 `N → 0`（含属性）、非中文下 PUT/GET 后数值变化并切回中文。

## 修复与测试

- `apps/web/src/lib/i18n-hydrator.ts`：抽出无 DOM 的统一决策逻辑。
- `apps/web/src/contexts/LanguageContext.tsx`：文本与属性共用最新源值规则；增加 hydrator 自写识别。
- `apps/web/src/lib/i18n-hydrator.test.ts`：5 个用例覆盖非中文新源、切回中文、自写混合中文译文、新增节点、未知非中文值。
- `apps/web/e2e/sitewide-i18n-hydrator.spec.ts`：
  1. 质量总览：异步接口返回 3 条后，断言不保留首次的 0 条。
  2. 通知中心：2 条未读及 25 条分页，全部已读后不刷新页面即移除旧未读副标题，同时覆盖动态 title/文本更新。
  3. 鸡群档案：老挝语下保存 `150 → 300`，断言 `300ຂົນ`；切回中文断言 `300羽`。
- 设置-用户编辑未选：真实编辑会创建/修改共享账号与角色，清理成本和污染风险高。
- 通知 SSE 未选：依赖 EventSource 自动重连、Web Audio 与 9 秒定时横幅，首批稳定回归使用 REST 状态更新覆盖核心 DOM 路径。

## 验证

- Web TypeScript：0 errors。
- Vitest：72 files / 407 tests passed（含新增 5 tests）。
- Web production build：成功，231 个页面生成完成；仅有既有 Cache-Control 与 middleware 弃用警告。
- Playwright：宿主首次尝试因缺少 `libnspr4.so` 在浏览器启动前失败；按既有基建使用 `mcr.microsoft.com/playwright:v1.62.1-noble`，production server + Chromium 最终实跑，3/3 passed（3.3s）。
- API 未改，未运行 API tsc；未触碰数据库。

## CI 与部署验证

待本提交 push、CI、web-only 显式部署与部署后 revision 只读核实完成后补录。
