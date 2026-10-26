# Issue #402 — 九档分级数量输入控件修复

- Issue: https://github.com/ivanzhao299/phoenix-erp-v3/issues/402 (MANUAL-123 / P3)
- Branch: `codex/manual-123-grade-input-ux`
- BASE_MAIN_SHA: `5f51ec2bba6cbeaad96bd038af7244afcc22c0b3`
- 开发日期: 2026-10-17（Asia/Singapore）

## 根因与范围

冻结 main 的 `apps/web/src/app/(admin)/breeding/daily/page.tsx:867` 直接渲染 `type="number" min={0} step={1}`，未拦截原生 ArrowUp/ArrowDown，也没有该控件专用的 spinner 隐藏规则。共享 `.inp` 的 appearance 不能防止键盘原生步进。

在隔离 worktree 启动原始 main 页面后，真实 Chromium 输入 12 并按 ArrowUp，值变为 13，验收期望 12，明确复现失败。此复现不依赖生产账号、生产数据或真实 API：所有 API 请求被测试固定数据拦截；非 GET 请求会导致测试报错；Web 的 API_TARGET 明确设为 `http://127.0.0.1:1`。

## 修改

1. 提取 `GradeQuantityInput`：仅取消 ArrowUp/ArrowDown 的默认行为；保留原 `type=number`、`min=0`、`step=1`、聚焦全选、空值/负数处理，并增加 numeric 移动输入提示和包含档名的无障碍标签。
2. 独立 CSS module：局部 `appearance: textfield` / Firefox 前缀和 WebKit spinner 规则。`input.quantity` 优先于共享 `.inp`，不会影响其他数字框。
3. 日报页面只新增 import，并替换九档 modal 内单个循环 input。BASE 共享修改位置为 import 区与 867–875 行；新文件位置为 import 38 与 868–872 行。
4. 增加 DOM 事件测试、真实页面 Chromium 键盘/鼠标/手动编辑测试。

不修改日报保存、筛选、导出、接口、权限、DataScope、数据库或 migration。九档数量容差、总数校验、库存写入路径保持原逻辑。

## 验收与实际执行

| 检查 | 结果 | 证据/范围 |
| --- | --- | --- |
| ROOT_CAUSE | VERIFIED | 原生 number 默认步进，修复前 Chromium 12 → ArrowUp → 13 |
| REPRODUCTION_BEFORE | FAIL_AS_EXPECTED | 原始 main 运行同一 E2E：1 failed（期望 12，实际 13），编辑回归 1 passed |
| REPRODUCTION_AFTER | PASS | Chromium E2E 2/2 |
| TARGETED_TESTS | PASS | GradeQuantityInput DOM 3/3 + breeding-daily helper 4/4 |
| RELEVANT_REGRESSION | PASS | 九档均不可方向键步进；spinner 上下鼠标位置不步进；其他数字框仍 12→13→12 |
| 编辑及数量校验 | PASS | 手动输入、Backspace、Delete、全选清空、Tab 到下一档、0、负数→0、原 stepMismatch 保留、清空按钮 |
| 无障碍基本操作 | PASS | 九档包含档名的 accessible name，Tab 与左右/Home/End 不被拦截；保留 native number 语义 |
| 新增 TS/TSX lint | PASS | 组件、DOM 测试、E2E 三文件 ESLint 0 errors |
| API typecheck | PASS | `tsc --noEmit --incremental false` exit 0 |
| Web typecheck | PASS | `tsc --noEmit --incremental false` exit 0 |
| scope-audit（本次改动） | PASS | daily 页面七类主数据裸 input 窄正则计数均为 0；HouseSelector=1，GradeQuantityInput=1 |
| SECURITY_REVIEW | PASS | 本修复不涉及请求、认证、授权或数据读写；独立只读审查未发现阻断项，最终审查由 Orchestrator 汇总 |
| Required CI | PENDING | Draft PR 创建后由 Orchestrator 读取，不将本地验证冒称远端 CI |

浏览器实测范围是 Playwright Chromium 1.62.1。Firefox / WebKit 的局部 CSS 规则已静态检查，但没有声明在这些浏览器执行过测试。Blink 不可靠地通过 getComputedStyle 暴露原生 spin-button 伪元素；E2E 验证实际 input 的 textfield 外观和鼠标 spinner 所在位置的真实点击行为。

## 重跑

在 `apps/web`：

```bash
./node_modules/.bin/vitest run src/components/breeding/GradeQuantityInput.test.tsx src/lib/breeding-daily.test.ts
./node_modules/.bin/eslint src/components/breeding/GradeQuantityInput.tsx src/components/breeding/GradeQuantityInput.test.tsx e2e/daily-grade-input.spec.ts
API_TARGET=http://127.0.0.1:1 NEXT_PUBLIC_API_BASE= NEXT_TELEMETRY_DISABLED=1 ./node_modules/.bin/next dev --webpack --hostname 127.0.0.1 --port 3402
PLAYWRIGHT_BASE_URL=http://127.0.0.1:3402 ./node_modules/.bin/playwright test e2e/daily-grade-input.spec.ts --workers=1 --reporter=line
./node_modules/.bin/tsc --noEmit --incremental false
```

本机 Node 固定 20.20.2；缓存 pnpm 9.12.0 离线安装，lockfile 无变动。浏览器启动最初缺 libnspr4 等系统库，随后仅在本 worktree 的忽略目录 `tmp/issue402/browser-libs` 提取测试依赖，并设置 `LD_LIBRARY_PATH`；没有改共享依赖或系统安装。失败的启动和最初 modal selector 调试不计为业务修复前复现，以上复现仅指实际运行到 ArrowUp 后的明确断言失败。

## 兼容与冻结边界

- PR #384 HEAD `4e3948dafeaf72499a25d3e88f42feae147d0bc2`：同一 daily 页面，但仅修改入库响应判断和不确定结果提示（387–412 行），不与此九档输入控件补丁重叠；不改变其入库契约。组合运行由 Orchestrator 集成分支执行。
- PR #385 HEAD `c62721f10e3474c2d63826c1f72f4574b02a3698`：dashboard 文件无交集。
- PR #386 HEAD `42c9683b62a5f9d95a32899f1c2867d062ec3148`：warehouse outbound 和 locales 无交集。本修复不修改 locales。
- #401 / #403 也修改 daily 页面，需要集成时逐块审查；本修复只占九档输入控件。
- main 前进到 `f3650ab1c52cc6b69d390e8a5a7e21f7f946aee1`（#404），Orchestrator 已确认仅运维/工作流/contract 文件，无此业务文件重叠。保持冻结 BASE，不自行 rebase。
- 未触碰好业财恢复 worktree、API、配置 floor、部署脚本、事务或受控恢复记录。

## 数据库与生产影响

数据库变更=无；migration=无；生产账号写入=无；生产部署=无；好业财同步/恢复操作=无；外部写入=由 Orchestrator 统一执行分支 push 与 Draft PR，本代理未执行。

独立 PR 保持 Draft 和 `reviewed-frozen-boundary` 审批要求。未启用 Auto Merge，未合并 main，未删除审批标签。合并/部署等待单独审批。
