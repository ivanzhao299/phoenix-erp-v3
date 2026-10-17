# Issue #381 / PR #384 兼容补丁回填

日期：2026-10-17（Asia/Singapore）。基线 PR HEAD：`4e3948dafeaf72499a25d3e88f42feae147d0bc2`；协调 main：`226878864f184d26f41a890e666ebed52547db14`。

两项业务补丁来自隔离集成提交 `36f002f6abc6b50e340bd3d1f26a105192780de9`，按日报同步入库归属回填本 PR：

1. `production-inbound.service.ts` 在完整幂等内容校验后按既有批次原行返回批号，避免同档位多班次重复返回首批号。未修改事务、锁、创建批次/流水或权限。扩展现有 service 单测覆盖单批及同档 11/22 两批的原始批号、数量与无重复创建。
2. `daily/page.tsx` 按 `Promise.allSettled` 对应索引，仅将保存 fulfilled 的班次放进入库明细与合计。新增独立 `daily-inbound-partial-save.spec.ts`，仅承载集成分支中首班201/次班400的浏览器回归。未复制 #400 PG/台账夹具、#402控件测试或临时配置。

## 本轮实际验证

- 服务补丁前：新增多批次断言明确失败，第二个批号错误重复首批号；9 pass / 1 fail。补丁后：入库、库存、farm 三套定向单测 43/43 PASS。
- 前端补丁前：真实 Chromium 观测入库 items 包含成功11与失败22，断言失败；补丁后：1/1 PASS，仅提交成功11。所有 API 请求由测试拦截，API_TARGET固定回环端口1，不访问真实后端。
- API / Web TypeScript：两端 `tsc --noEmit --incremental false` exit 0。
- changed-file lint：PASS，原有8 errors / 13 warnings未增长；新增 E2E 单独 ESLint 0 errors。未改规则、baseline、suppression。
- 独立只读复核：补丁归属、既有锁/写入/权限不变及测试区分能力已确认；本地复核不等同 GitHub 正式 Review。
- 真实 PG、全量单测、最终 main 组合验收：本回填提交未运行，不继承上一轮 PASS。

已知契约限制：同 SKU/grade 不同数量的条目换序仍可能被旧比较拒绝；本补丁仅修正原始相同请求的批次响应，不扩大该契约。

新 HEAD 需重新取得冻结边界覆盖确认与正式 Review；旧标签/旧 CI 不代表新 HEAD 已批准。保持 Draft，不合并 main，不部署，不修改生产、floor或好业财恢复状态。
