# Issue #381 / PR #384 最小安全修复

日期：2026-10-17。main 基线 `4930b6178efe94325945610191f1234f898afb20`；修改前 PR HEAD `d0029358a0b686442fa9c95329ba1f040b68b3b7`。用户明确授权“最小安全修复并更新 #384 HEAD”；此授权不包含合并 main、生产发布、生产数据修改或治理审批。

## 已复现问题与修改

旧 HEAD 的隔离 PostgreSQL 反例表明，同一自定义幂等键能跨日期、鸡舍、仓库重放旧批次；不同键同日并发可能违反批号唯一约束。原失败证据保存在协调工作区 `artifacts/batch2-admission-closure-20261017/384-security-counterexamples.log`，不修改或覆盖旧证据。

1. `production-inbound.service.ts` 重放前逐行核对真实公司查询范围内的日期、鸡舍或 SITE 追溯引用、仓库与库位，并保留 SKU、档位、规格、数量比较。上下文不符或历史追溯字段缺失时拒绝；错误不返回旧批号，不另建库存。规范鸡舍空白，拒绝超长自定义 key，保留默认来源键历史格式。
2. `egg-inventory.service.ts` 无外部 manager 时自行开启事务，有 manager 时复用。所有自动生产批号使用全公司共享的日期事务锁，批号、批次与流水写入在同一事务中。日期锁使用 two-int advisory 键空间，与自定义来源键的 one-bigint 锁分隔。以纯数字后缀最大值加一替换 COUNT，排除终端自定义批号并处理序号空洞、64 字符容量边界。日期必须为真实 YYYY-MM-DD。
3. 保留 `issue-381-compatibility-backport.md` 两项补丁：同档多批次返回各自原身份与数量；只有成功保存的班次进入入库。未改 Web 代码、翻译、ESLint 规则、审批标签、CI 规则、迁移或好业财功能。

## 当前代码实际验证

- 入库及库存定向单测：27 PASS；包装集成服务单测：9 PASS。
- 真实隔离 PostgreSQL 18：16 PASS，包括同源重试、同源并发、异键同日并发、日期/鸡舍/仓库/库位越界重放拒绝、历史 NULL 追溯拒绝、跨公司及包装式外部事务与无 manager 调用共用编号、流水失败回滚、数字后缀空洞和容量限制。
- API / Web 类型检查：PASS。
- Chromium 部分保存回归：4 PASS（201/400、400/201、201/201、400/400）；所有 API 请求均由测试拦截，真实后端目标固定为回环拒绝端口。
- 三语键门禁：14556 键平齐，7823 引用命中，PASS。
- 修改的五个 API 文件 ESLint：0 errors / 14 warnings；未放宽规则或更新基线。
- 独立只读技术复核未发现本次补丁新增的确定性阻断项；此结论不构成正式人工 Review 或 security-touch 批准。
- 本分支全量 API：1025 PASS / 297 SKIPPED（116 suites PASS / 14 SKIPPED）；隔离 PG 的 16 PASS 单独执行。最终组合验证与官方 CI 结果写入协调工作区精确 SHA 收据，不继承旧 HEAD 的通过结果。

## 审批与残余边界

新 HEAD 必须重新确认冻结边界和 security-touch 审批覆盖，并取得正式 GitHub Review。现有 reviewed-frozen-boundary 标签不是新 SHA 自动获批的证据。静态安全扫描仍命中 PG fixture 第45行的 timestamptz：这是明确 owner marker 保护的本地合成表定义，词法匹配 timestamp；不修改 Chanjet callback/signature。该分类需由有权审批人决定，不删除扫描内容或自行设置 ALLOW 参数。

默认来源键仍保留历史 64 字符截断契约；极长来源可能碰撞，但跨上下文重放会被拒绝，未实施历史库存重编码。直接库存入口原有鉴权不在本次修改范围。PR #411 已发现的角色生命周期问题独立 HOLD，不能因本补丁通过而声明 Batch 2 安全验收完成。

保持 Draft。无 main 合并、部署、生产数据库写入、floor 变更或好业财操作。
