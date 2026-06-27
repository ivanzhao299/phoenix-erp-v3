# Phoenix ERP Multi-Agent Command Center

## 总原则
1. 本项目采用一个 Git 仓库、多个 Git worktree、多 Agent 并行开发。
2. 所有 Agent 必须先读取本文件和自己的 agents/*.md 文件。
3. 未经明确授权，不得修改其他 Agent 的责任目录。
4. 不得直接修改 main 分支。
5. 数据库结构、主数据模型、组织模型、权限模型属于高风险变更，必须先形成文档方案，再执行代码修改。
6. 每次任务完成必须输出：修改文件、变更原因、影响范围、数据库变化、测试结果、风险点。
7. .env、密钥、Token、真实账号密码不得提交 Git。
8. 生产数据、截图、Excel 原始资料默认不得提交，除非明确要求。

## 当前 Agent 分工
- Architect / MasterData Agent：主数据、组织、公司、项目、养殖场、物料、客户供应商、数据库迁移方案。
- ERP Business Agent：采购、销售、库存、门店、POS、工作流、业务前端页面。
- Finance Agent：应收、应付、现金、费用、股东资金、财务页面。
- Audit / Integration Agent：权限、登录、审计、测试、畅捷通/用友、通知、CI、脚本。

## 合并规则
1. 各 Agent 在自己的 feature/agent-* 分支工作。
2. 先由 Audit Agent 审查 diff。
3. 审查通过后再合并回 main 或 develop。
4. 如涉及 migrations，必须先由 Architect Agent 确认。
