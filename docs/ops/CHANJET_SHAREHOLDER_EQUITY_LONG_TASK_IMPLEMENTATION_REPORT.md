# 好业财股东权益长任务实施报告

## 结论

- 技术实现：`GO WITH CONDITIONS`
- 当前业务对账/月结：`HOLD`
- 好业财写入：关闭
- ERP/好业财数据修改：未执行
- migration：已生成，未执行
- deploy / push：未执行

## 完成范围

1. 固化 ERP 法定股权、股东资金往来和好业财会计事实的权威边界。
2. 新增公司账套、股东 4001 子科目、逐笔出资凭证行三层对账模型。
3. 新增只读对账总览、逐笔凭证候选、月结就绪和凭证草稿预览接口。
4. 新增带显式令牌的映射确认、凭证勾稽、ERP 内部凭证草稿和月结接口。
5. 新增 `/shareholders/reconciliation` 管理页面，展示 ERP、好业财、差异、映射覆盖率和借款/垫资隔离结果。
6. 新增月结证据和逐笔凭证勾稽表迁移；本轮未运行迁移。
7. 扩展 `SHAREHOLDER` 主数据映射类型和股东权益对账结果类型。

## 关键文件

- `apps/api/src/modules/shareholder/services/shareholder-accounting-reconciliation.service.ts`
- `apps/api/src/modules/shareholder/services/shareholder-accounting-reconciliation.ts`
- `apps/api/src/modules/shareholder/controllers/shareholder.controller.ts`
- `apps/api/src/modules/chanjet/chanjet-shareholder-voucher-link.entity.ts`
- `apps/api/src/modules/chanjet/chanjet-shareholder-close-period.entity.ts`
- `apps/api/src/database/migrations/1784660000000-AddChanjetShareholderEquityReconciliation.ts`
- `apps/web/src/app/(admin)/shareholders/reconciliation/page.tsx`
- `docs/ops/CHANJET_SHAREHOLDER_EQUITY_RECONCILIATION_SPEC.md`

## 接口清单

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| GET | `/api/shareholders/accounting/overview` | 公司/股东/出资分类和差异总览 |
| GET | `/api/shareholders/accounting/contributions/:id/voucher-candidates` | 服务端计算逐笔凭证候选 |
| GET | `/api/shareholders/accounting/contributions/:id/voucher-draft-preview` | ERP 凭证草稿预览 |
| GET | `/api/shareholders/accounting/month-close-readiness` | 月结条件预检 |
| POST | `/api/shareholders/accounting/mappings/confirm` | 确认股东与 4001 子科目映射 |
| POST | `/api/shareholders/accounting/voucher-links/confirm` | 确认出资与凭证行勾稽 |
| POST | `/api/shareholders/accounting/contributions/:id/voucher-drafts` | 创建 ERP 内部凭证草稿 |
| POST | `/api/shareholders/accounting/month-close` | 保存 ERP 月结证据 |

## 安全结果

- 所有查询和确认按 DataScope 限制公司。
- 写操作要求 `MENU_SHAREHOLDER_CAPITAL:A` 和专用确认令牌。
- 凭证候选在确认时重新计算，置信度低于 85 不允许确认。
- 借款、垫资、代付和待复核来源 fail-closed，不允许进入 4001。
- 页面只提供只读总览，不提供批量自动确认或外部写入按钮。
- 好业财外部写入、删除、修改和凭证推送仍为 `false`。

## 当前数据证据

| 项目 | ERP 法定实缴 | 好业财 4001 | 结果 |
| --- | ---: | ---: | --- |
| 全部公司 | 91,588,736.12 | 98,443,307.79 | 差异 +6,854,571.67，HOLD |

已识别条件项：

- 农业公司差异约 `+4,587,097.31`。
- 食品公司差异约 `+2,267,474.36`。
- 星驰公司总额一致，但股东内部归属不一致。
- ERP 股权表与逐笔确认出资存在 `0.31` 内部差异。
- 部分好业财 4001 余额属于“直营店投资”或币种拆分，不能直接猜测股东。
- ERP 历史逐笔记录尚未完成凭证行勾稽。

## 验收与后续 Gate

实际验证结果：

| 验证 | 结果 |
| --- | --- |
| API typecheck / Nest production build | PASS |
| Web typecheck / Next Webpack production build | PASS，新增路由 `/shareholders/reconciliation` 已生成 |
| API 全量 Jest | PASS，35 suites / 266 tests |
| Web 全量 Vitest | PASS，36 files / 174 tests |
| 股权会计专项 Jest | PASS，3/3 |
| TS migration down() | PASS，49/49 |
| TS migration no-data-DML | PASS |
| nullable unique | PASS，0 违规 |
| entity drift | PASS，0 漂移 |
| W5 closeout | PASS；财务/好业财/迁移变更按门禁使用 `ALLOW_FREEZE_TOUCH=true`、`ALLOW_SECURITY_TOUCH=true` 记录显式复核 |
| `git diff --check` | PASS |

Next Turbopack 在 worktree 的外部 `node_modules` 符号链接上会 panic；使用 Next 官方 Webpack 构建路径完成了等价生产构建。该限制不影响源代码、类型检查或生产 Webpack 构建结果。

下一 Gate 必须独立审批：

1. 执行 ERP 新迁移。
2. 在只读生产证据下生成映射和凭证候选。
3. 逐项确认唯一映射与逐笔勾稽，不改好业财。
4. 差异归零并满足月结条件后，才允许关闭 ERP 对账期间。
5. 好业财最小写入仍沿用 Wave 7 独立审批，不因本任务自动放开。
