# Issue #400–#403 隔离集成交付报告

日期：2026-10-17（Asia/Singapore）。本报告区分已验证的修复、现场未证实的根因、审批门禁和仅存在于集成分支的兼容补丁。

## 基线、分支与冻结边界

- `BASE_MAIN_SHA=5f51ec2bba6cbeaad96bd038af7244afcc22c0b3`，启动时重新 fetch origin/main 后冻结，四个独立 worktree 均从该提交创建。
- 集成分支：`codex/issues-400-403-isolated-integration`。不作为第五个 PR，不自动合并。
- 本轮观察并纳入隔离集成分支的新 main：`f3650ab1c52cc6b69d390e8a5a7e21f7f946aee1`（#404）、`d4d5d0ccaf0f560f75529caa3639e3b67500bf8c`（#406）、`66164c30a614bca181a419a540b26ceac1b87f8f`（#409/#410）。增量仅为运维工作流/脚本/contract，没有四项修复业务文件的重叠；四个 Issue 分支未 rebase 或改写历史。
- 结束前另读到 `LATEST_MAIN_OBSERVED=226878864f184d26f41a890e666ebed52547db14`（#412），相对66164c30仅修改 `scripts/ops/chanjet-admission-schema-operation.mjs`，无业务重叠。已完成的 Issue PR 不追改，集成测试版本仍固定在上述66164c30及本轮补丁；412仅做静态重叠核对。
- 恢复任务 `zcode 接手@恢复好业财` 的最近记录表示生产 M16 HOLD；这是另一个会话的记录，不是本轮生产核验。本轮仅读取该记录、main 和 PR 元数据，不继承其生产授权。
- 主工作区原有的 9 个 tracked 修改保持原样；未修改其他任务的 worktree。
- PR #384、#385、#386 保持原 Draft/head/审批标签。本轮仅将其净业务增量组合到隔离分支测试。
- 未修改已合并运维代码；集成分支包含的恢复代码来自 main。未执行 workflow_dispatch、生产 SSH、部署、迁移、floor/事务操作或好业财请求。

## 四份独立交付

| Issue | Draft PR | 最终 Issue head | 状态 |
|---|---|---|---|
| #400 / P1 | [#407](https://github.com/ivanzhao299/phoenix-erp-v3/pull/407) | `654b9141049bb74f6b67b3dfdad45dd61806485f` | 条件查询修复；原现场根因未证实 |
| #401 / P1 | [#411](https://github.com/ivanzhao299/phoenix-erp-v3/pull/411) | `3a6a3b504a28a7668f92832839c6ff250b8a2fc8` | 隔离复现及修复通过，待治理审批 |
| #403 / P2 | [#408](https://github.com/ivanzhao299/phoenix-erp-v3/pull/408) | `4c707fac1ee316c29119b0a07fc0462278d30c5c` | 九档展示、日期与完整导出通过，待治理审批 |
| #402 / P3 | [#405](https://github.com/ivanzhao299/phoenix-erp-v3/pull/405) | `0b33d62a5b9f8ef4e475f34fbbe3ad01c269f2a3` | 输入控件通过，待治理审批 |

独立报告：[400](issue-400-fix-report.md)、[401](issue-401-fix-report.md)、[402](issue-402-fix-report.md)、[403](issue-403-fix-report.md)。它们保留各自开发时的检查记录；最终 CI 快照及组合结果以本报告为准。

## 根因与验收边界

### #400

冻结 main 的正常九档 POST → inv_batches → inv_ledger → GET → UI 在隔离 PG 上本就通过，合计 495。另一个明确的数据形态（流水仍记录九档、批次当前等级全为 BROKEN）会让旧 GET/UI 全显示 BROKEN。修复保留可识别的流水事件等级，兼容 NULL/空串/未知/DEPRECATED 旧别名，并补全 TEMP 鸡舍只读追溯及名称归属。

该条件反例修复前失败、修复后通过，不能证明原现场数据必然如此。如果流水本身已经错误，本 PR 无法还原九档。没有读取或修复生产库存。原查询对缺少 log_date 的后续动作沿用产蛋日筛选、事件日显示，作为既有日期语义单列保留。

### #401

保存按权威鸡舍/农场/公司归属，旧 GET 按遗留 storeCode 筛 site_code；此外默认录入舍隐式过滤历史，且先取 100 条再筛选。修复按 house→ACTIVE farm 读取，区分 SITE 父公司投影与显式公司授权，缺身份/scope 时 fail closed；保留 MENU_FARM_DATA:V，不增 admin 或移除权限。历史日期/鸡舍先于分页查询，保存后定位，URL 保留筛选，迟到响应不覆盖新选择。

真实 PG fixture 覆盖本人、admin、同公司、跨公司、同公司跨 SITE、混合 SITE/显式公司、额外 farm、空组织、历史稀疏快照和伪造归属。生产原账号未执行写入或登录验收。物理删除鸡舍或农场非 ACTIVE 时历史读取仍拒绝，报告不将这一边界隐藏。

### #403 / #402

#403 原投影丢弃 eggs_by_grade，导出读取未提交表单。修复显示真实九档，缺失留空/—、显式 0 保留、未知历史码保留；导出弹窗选择业务日，单 SQL 快照完整读取最多 20,000 条，超限明确拒绝，普通列表仍 cap 1000。保留原 X+V/DataScope，CSV 防公式注入，并修复非 UTC PostgreSQL DATE 被转换为前一天。三语新增文案齐全。

#402 只在九档使用局部组件/CSS，禁 spinner 和 ArrowUp/Down；手动输入、编辑键、Tab、非负和原 step 校验保留，普通数字框仍正常步进。实测浏览器是 Chromium，Firefox/WebKit 只做 CSS 静态复核。

## 共享文件与组合处理

| 文件/区域 | 组合结果 |
|---|---|
| daily/page.tsx | #401 历史查询/保存定位、#403 原值投影/导出/明细、#402 modal 控件、#384 响应检查均保留，独立语义复核通过 |
| generic-crud.controller/service | #401 canonical scope/enrich 与 #403 私有 Symbol/单 SQL cap/DATE helper 均保留 |
| 三语 locales | #384 入库结果未知和 #386 专用出库流程两个相邻新增键产生冲突；逐项保留双方，未使用 ours/theirs |
| #403 DOM 夹具 | 原 mock 每次渲染创建新 fetch 回调，与 #401 正确依赖组合后无限 effect；改为稳定 mock 引用，未修改产品依赖、超时或跳过断言 |
| #400 旧静态测试 | 旧测试硬编码 l.house_code 文本；改为执行真实 service 的投影/绑定参数契约检查，PG/UI 输出继续实测 |

## 两个只在集成分支的必要兼容补丁

`36f002f6abc6b50e340bd3d1f26a105192780de9` 包含以下修正和独立回归。它们没有混入四个 Issue PR，也没有写入旧 PR #384；合入前必须决定其交付位置。

1. **#384 多班次同档位重试返回重复 batchNo**：真实 PG 首次创建两批，完全相同重试返回首批号两次。原 JSON 完整校验后改为逐条返回 existing 行，批次/流水数量均仍为 2，未改库存持久化逻辑。修复前 1 FAIL，修复后 PASS。原有不同数量的同档位条目颠倒顺序可能被原比较拒绝，本补丁未扩大该幂等契约。
2. **部分日报保存失败仍将失败班次数量入库**：真实 Chromium 拦截隔离请求，首班保存201、次班400，旧入库明细仍含 11 和失败班的 22。改为按 Promise.allSettled 对应索引仅取 fulfilled 行，入库只含 11；全部成功行为、#401 定位和 #384 响应检查不变。修复前 FAIL，修复后 PASS。

两项均经独立只读 reviewer 复核。包含补丁的组合测试通过，不等于旧 #384 原 head 已完整兼容。

另有 **#386 lint 组合适配**：changed-file gate 实测发现原 #386 的权限对象传值使 React Compiler 报2项新增 preserve-manual-memoization errors。仅集成提交 `f3ed1fcb` 将两个已有 boolean 值显式按 Boolean 传入，权限值及 helper 判断不变，独立只读核验通过；changed-file gate 由 FAIL 恢复 PASS，未更新 baseline。该适配也未进入旧 #386 或本轮四个 PR。

## 实际执行的统一验证

所有数据库测试位于本轮自建 PostgreSQL18 容器 `phoenix-issues400403-integration-pg18`，仅 `127.0.0.1:51667`，使用 `issue400`、`issue401_fixture`、`issue403_fixture` 三个专用 fixture DB。没有读取应用 .env/生产凭据，没有运行应用 migration 或 synchronize。fixture DDL/DML 仅用于隔离测试数据。

验证完成后，本轮四个 PG 容器及两个 Next 开发服务均停止；其他项目/恢复任务的容器和进程未操作。集成 PG 使用 tmpfs，重启后需重新创建 fixture role/DB，表与数据由测试重建。容器内初始化为：`psql -U postgres -d phoenix_issues400403_integration -c 'CREATE ROLE issue400 LOGIN' -c 'CREATE DATABASE issue400 OWNER issue400' -c 'CREATE DATABASE issue401_fixture' -c 'CREATE DATABASE issue403_fixture'`，仅用于本轮命名容器。

| 检查 | 实际结果 |
|---|---|
| 冻结基线 API | 116 suites / 1022 tests PASS；13 suites / 281 tests 显式 skipped |
| 冻结基线 Web | 122 files / 719 tests PASS |
| 完整组合 API（含四修复、#384–#386及兼容补丁） | 121 suites / 1051 tests PASS；13 suites / 281 tests 显式 skipped |
| 完整组合 Web | 128 files / 745 tests PASS；live API DOM 4 cases 在 PG 子进程执行，普通无地址运行明确 skipped |
| +08 实际 PG/HTTP 可见性及导出定向回归 | 4 suites / 21 tests PASS |
| 九档真实批次/流水/API/UI + #384 | 首轮 4 suites / 47 tests PASS；最终完整 API 另包含多班次重试回归；live API 三语 DOM 4 PASS |
| Chromium 组合 | 3/3 PASS：九档/普通输入隔离、编辑校验、部分保存失败不入库 |
| API / Web typecheck | 最终两端 tsc --noEmit --incremental false 均 exit 0，无错误 |
| i18n | 三语各14577键，7828个引用键均命中 |
| scope-audit | PG 正反向权限矩阵通过；独立 PR 报告保留七类裸主数据 input 计数、Selector 和 lint debt 检查 |
| 最终组合 scope 静态窄检查 | 七类裸主数据 input 均0，HouseSelector=2、GradeQuantityInput=1、DictSelect=2 |
| 最终 changed-file lint | PASS，10项既有 errors/13 warnings，未增长；无 suppression / baseline 接受 |
| #385/#386 定向回归 | 2 files / 12 tests PASS；#386 另需上述仅集成 lint 适配 |

组合 Web 初次有 users-pagination 的并发资源超时，以及 #403 夹具的真实无限 effect；保留失败记录，稳定夹具后以 maxWorkers=4 完整复跑通过，没有延长 timeout 或改业务预期。

日志位于集成 worktree 的 `tmp-issues400403-*.log`（不提交生成日志）。可复跑命令：

```bash
# 在 apps/api，显式指定本轮隔离 fixture
ISSUE400_PG_PORT=51667 \
ISSUE401_PG_URL=postgresql://postgres@127.0.0.1:51667/issue401_fixture \
ISSUE403_FIXTURE_URL=postgresql://postgres@127.0.0.1:51667/issue403_fixture \
node node_modules/jest/bin/jest.js --runInBand
# 在 apps/web
NODE_ENV=test node node_modules/vitest/vitest.mjs run --maxWorkers=4
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3404 node node_modules/@playwright/test/cli.js test e2e/daily-grade-input.spec.ts --workers=1
```

Node 固定20.20.2，pnpm9，各 worktree 独立依赖和生成目录。浏览器需要本轮局部 LD_LIBRARY_PATH，主机未安装或修改共享库。

## 独立审查与 CI 审批

- #400 / #384：`compatibility_review`，确认 SQL 等级别名/公司名称归属/无行倍增，及仅集成的逐批重试修正；原现场未证实的限制保留。
- #401：`security_401_review`，确认 SITE/显式公司/REGION/GROUP/额外 farm/缺身份等边界；未解决高危代码发现为0。
- #402：`input_402_review`，局部控件和编辑语义通过，浏览器覆盖限制保留。
- #403 与组合：`export_403_review`，单 SQL/权限/日期/CSV复核通过，发现部分失败入库并复核最小修复。

最终远端检查快照保存在 `issue-400-403-ci-status.json`。不能填写 REQUIRED_CI=PASS：冻结边界 gate 仍要求 `reviewed-frozen-boundary`；#400/#401/#403 的安全 gate 也要求 `reviewed-security-touch`。静态安全扫描将 fixture 的 timestamptz 和 generic-crud 中既有 Chanjet 注释也计为触及敏感内容；独立审查不等同自行赋予审批标签。

最终四个精确 head 均无 pending 检查，各有9项技术检查 SUCCESS，唯一 FAILURE 均为 `Static Security And Freeze Gates`。构建、Web单测、PG16浏览器、回归、fixture、smoke等技术检查通过；镜像推送与部署 job SKIPPED。#400 早期的旧文本契约测试失败已修复并在最终 head 重跑通过，不把旧成功或旧失败混作最终 head 的结论。

没有降低规则、更新 lint baseline、删除或自行添加审批标签，也没有使用 ALLOW_* 环境变量冒充 CI 通过。PR 原有安全/冻结门禁保持有效。main 分支保护接口返回404、rulesets列表为空，未据此推断可以免除用户要求的 Required CI。

## 交付决定与停止边界

本轮不具备无条件主线合入结论：#400 原现场待另行授权的只读证据；两个仅集成业务兼容补丁及 #386 lint 适配尚未进入可合并 PR；四个 PR 的审批门禁仍需治理方签字及重新运行检查。#401/#402/#403 的独立修复可以单独审查，不需为 P3 等待。

```ini
MAIN_MERGE_EXECUTED=NO
PRODUCTION_DEPLOY_EXECUTED=NO
PRODUCTION_DATABASE_MUTATION=NO
CHANJET_RECOVERY_MUTATION=NO
AUTO_MERGE=NO
AUTO_DEPLOY=NO
NEXT_ACTION=REQUEST_MAIN_INTEGRATION_APPROVAL
```

审批应明确：四个 Draft PR 各自范围、#400 补证、两个集成补丁的承载位置和恢复治理方的冻结边界。生产部署、生产迁移、生产恢复及好业财同步仍需本轮之外的独立授权。
