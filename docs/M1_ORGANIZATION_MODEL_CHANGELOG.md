# M1 组织模型 · 变更日志

> Architect / MasterData Agent（feature/agent-architect-masterdata）
> 文件目标：记录 `docs/M1_ORGANIZATION_MODEL.md`（Architecture Freeze 基线）
> 每一次"合入决策 / 修订口径"的具体差异。架构冻结后，主文档的任何变更
> 都必须在本日志体现，便于后续 wave 追溯。

---

## v2.0 — C-1 ~ C-7 决策合入（2026-06-20）

### 触发

- 输入文档：
  - `docs/M1_ORGANIZATION_MODEL_REVIEW.md`（Audit §6.2 提出 C-1 ~ C-7）
  - `docs/M1_ORGANIZATION_MODEL_DECISIONS.md`（Architect 拍板建议，含 §8.4 章节映射）
  - `docs/M1_DECISIONS_AUDIT.md`（Audit 复审 §9.2 给出 5 项合入条件 C-cond-1 ~ C-cond-5）
- 决议：7 项决策 + 1 项 DECISIONS §1.3 勘误 + 1 项 brd_houses FK 收口（拍板 #3）+ 1 项 C-7 占位行 UPDATE 白名单细化，全部合入 M1 主文档。

### 章节变更明细

| 章节 | 修订类型 | 摘要 |
|---|---|---|
| §0.2 | 扩写 | 显式列出 W4 seed DEPARTMENT 行 `allowed_parent_types` 缺 `'DEPARTMENT'` 自嵌套的勘误，指向 §8.2 C-1 决策 |
| §0.2.1 | **新增** | 7 项决策合入索引表（C-1 ~ C-7 + 对应主文档章节） |
| §0.3 | 微调 | 拍板 #3 落点行补"FK 约束 DDL 与回填脚本由 M3 子文档单独定稿" |
| §3.2 | 扩写 | 增"与 PROJECT 的对偶约束（C-5 决策）" —— biz_projects.company_code 单一、永禁多法人合资 project |
| §4.1 | 扩写 | 删除"跨公司 / 跨 site 成本归集"原句中"跨公司"措辞；新增 C-4 决策状态机表（DRAFT/PENDING_APPROVAL/ACTIVE/FROZEN/ARCHIVED/REJECTED × 是否可改）+ 业务重组 SOP；新增 C-5 多 project 并存 + BU 横切的明文承诺 |
| §4.2 | 扩写 | 改写"少数历史行可保留可拆出"为"详 C-7 占位行决议见下"；新增 C-7 占位行 UPDATE 白名单表（status / org_name / org_name_cn / org_short_name / manager_user_id / manager_name / remark / sort_order）+ 黑名单表（org_code / parent_id / company_code / org_type / level / path） |
| §5.2 | 扩写 | 子类清单表后新增 `brd_houses.site_code` FK 收口段落（拍板 #3）：FK 约束 + 历史回填路径 + house_code 不可重命名承诺 + 明文 "C-1~C-7 不直接覆盖拍板 #3，但本节承诺 W5+ M3 子文档完成 FK 落地" |
| §5.5 | 扩写 | 末段新增 "与 C-5 决策一致" 段：明文"site × project 跨多公司是允许的桥表组合；project × company 跨多公司是禁止的写入" |
| §6.2 | 扩写 | 改写"M3 子文档评估是否退役"为"详 C-7 占位行决议见下"；新增 C-7 占位行 UPDATE 白名单 + 黑名单（与 §4.2 完全同口径），强化 user 拍板 #1 "库存 100% 走 canonical" |
| §7.5 | 扩写 | 删除"W5+ service 或 trigger 保证；本 wave 仅冻结规则"原句；新增 C-6 决策 6 点细化：主写入点 / mst_stores 直写 status 禁 / 非 status 字段独立 CRUD / 不用 DB trigger / 责任分配（Architect 主、ERP 协；W6 落地）/ W5 期间扫描差异行 |
| §8.2 | 扩写 | 末段新增 C-1 决策 6 点：最大嵌套深度 5 / 应用层 ancestor 环检测 / DB 层自环 trigger / 实施波次 / W4 seed 勘误（DEPARTMENT 自嵌套缺，W6 接入前 UPDATE）/ path 物化列延后 |
| §9.7 | **新增** | scope 继承策略（C-3 决策）—— 严格只看显式绑定；3 列对照表 + 4 段说明（核心规则 / 理由 / UI 引导 / 实施波次） |
| §11.5 | 扩写 | 末段新增 "DataScope 合并算法承诺（C-2 决策，W7 实施）" —— 完整 5 步算法伪代码 + CLS 6 字段输出契约 + 严禁 service 私造算法 + 实施波次 |

### 行数差异

- 总插入：约 +180 行
- 总删除：约 -8 行（被 C-6 / C-7 改写的原句）
- 净增：约 +172 行
- M1 主文档总行数：v1 947 → v2 ~1120

### 与既有内容的关系

- ✅ **不破坏现有章节结构**：未重排任何 §x.y 编号；C-3 落点采用新增 §9.7（非插入 §9.5 之前的方案，避免后续章节连锁重排）
- ✅ **与 user 拍板 4 条全面一致**：
  - 拍板 #1（仓库 ≠ site）→ §6.2 C-7 白名单段强化"库存 100% 走 canonical"
  - 拍板 #2（门店 = SITE-*-STORE）→ §7.5 C-6 主写入点为 SITE 完全对齐
  - 拍板 #3（brd_houses FK）→ §5.2 新段落 + §0.3 落点行补充
  - 拍板 #4（shareholder scope 不并入 sys_user_scopes）→ §11.5 C-2 算法 Step 5 明文 "shareholder 独立计算"
- ✅ **与 W4 落地一致**：§0.2 + §8.2 C-1 第 5 点显式承诺 DEPARTMENT 自嵌套 seed 在 W6 接入前 UPDATE
- ✅ **与 ERP E3/E5/E6 + Finance F1-F5 一致**：C-2 算法 Step 1 短路与 E6 isAdmin / Finance F1 直读 CLS 完全兼容；C-4 + C-5 为 F2 项目过滤未来策略升级铺路

### 已知非阻塞跟进项（Audit 决策书 §9.3）

| 编号 | 跟进项 | 处置 |
|---|---|---|
| F-1 | 拍板 #3 brd_houses FK 不在 C-1~C-7 内 | ✅ 已在本次 §5.2 + §0.3 收口 |
| F-2 | C-5 "多法人合资 project 永禁" + BI 视角注释 | 暂入 M2 子文档（BU 横切汇总段落） |
| F-3 | C-7 占位行 UPDATE 白名单（含 manager_user_id 是否允许）| ✅ 已在本次 §4.2 + §6.2 列明 manager_user_id 在白名单 |

---

## v1.0 — 架构冻结首版（2026-06-20）

### 触发

用户在 W4 + W1 PASS WITH CONDITIONS 之后宣布 "Architecture Freeze" 阶段，
要求一次性冻结：
- 10 类实体（集团 / 公司 / 项目 / 站点 / 仓库 / 门店 / 部门 / 用户 / 角色 / 股东）
- 实体关系图（Mermaid）
- 父子层级
- 唯一编码规则
- 删除策略
- 归档策略
- 未来 5 年扩展策略

### 关键冻结决议

| 决议 | 章节 | 说明 |
|---|---|---|
| `sys_organizations.org_type` 收敛到 **6 类** | §0.2 / §5.1 | GROUP / BU / COMPANY / SITE / DEPARTMENT / PROJECT；STORE / FACTORY / WAREHOUSE 是 site_business_type 子类 |
| user 拍板 #1 仓库 ≠ site | §6 全节 | warehouse_code 独立 canonical（wms_warehouses） |
| user 拍板 #2 门店 = SITE-*-STORE | §7 全节 | mst_stores 退化为业务档案 sidecar |
| user 拍板 #3 brd_houses 必属 site | §5.2 | 1 site : N houses（v1 未细化 FK 收口；v2 补） |
| user 拍板 #4 shareholder scope 不并入 sys_user_scopes | §11.5 | 底层 shr_shareholder_scope 独立；DataScope 输出层可统一暴露 allowedShareholderCodes |

### 文档内容（v1 行数 947）

- 16 个顶级章节
- 4 张 Mermaid 图（erDiagram / flowchart / 状态机 / 删除阻断 flowchart）
- 5 年扩展时间轴
- 扩展评审流程

详见 v1 主文档（git commit `d0a1244`，2026-06-20）。

---

## 变更治理规则

### 修订流程

1. **触发**：Audit 评审 / 用户拍板 / 后续 wave 需求
2. **草稿**：Architect 出 PR 修订 M1 主文档 + 同步更新本 changelog
3. **评审**：Audit 复审（必经）+ 涉及业务 Agent 签字（如 C-6 触 ERP）
4. **用户拍板**：合入 main 前必须用户确认
5. **合入 + tag**：tag 命名 `v3-m1-org-model-v<X.Y>-YYYYMMDD`

### 版本号约定

- **主版本（X）**：架构冻结基线本身的整体迭代（新增 / 删除实体；改 org_type 真值集；改父子层级根本拓扑）
- **次版本（Y）**：决策合入、子节段落细化、文字修正（不动顶层语义）
- 当前：v2.0（C-1 ~ C-7 合入算大版本：补全了 7 项条件下的精确语义）

### 严格只追加

- ❌ **永禁覆盖式重写**已有章节；任何修订都通过 Edit 增量
- ❌ **永禁删除**已有决策（如发现要废止，必须新决策覆盖 + 在本日志明文）
- ✅ 章节顺序与编号尽量稳定，避免外部引用断裂

---

## 后续 wave 引用承诺核验（v2.0 完成后状态）

| Wave / 子文档 | 引用 M1 章节 | v2.0 是否充分 |
|---|---|---|
| M2 project consolidation | §4 + §5 + §11 | ✅（C-4 + C-5 已合入） |
| M3 SITE 子类化迁移 | §5 + §6 + §7 | ✅（C-6 + C-7 + brd_houses FK 已合入） |
| M5 master 模块退役 | §7 + §15.3 | ✅（C-6 service 责任分配明文化） |
| W5 biz_projects 扩列 | §4.2 + §5.5 + §11.2 | ✅ |
| W5 service ancestor 检测 + 自环 trigger | §8.2 | ✅（C-1） |
| W5 sys_user_orgs "漏绑 COMPANY" 扫描 | §9.7 | ✅（C-3） |
| W5 mst_stores ↔ SITE 差异行扫描 | §7.5 | ✅（C-6 第 6 点）|
| W6 inv_batches 改造 | §6.4 | ✅（warehouse_code 不变） |
| W6 type_rules service 接入 + DEPARTMENT seed UPDATE | §0.2 + §8.2 第 5 点 | ✅ |
| W6 占位行 INSERT 路径硬阻 | §4.2 + §6.2 | ✅（C-7 白/黑名单清晰）|
| W6 mst_stores ↔ SITE status 同步落地 | §7.5 | ✅（C-6）|
| W7 sys_user_scopes 合表 | §9.7 + §11.5 | ✅（C-2 + C-3 算法定型；shareholder 独立 Step 5）|
| W8 workflow.byProjectManager 切表 | §4.1 | ✅ |

---

**v2.0 生效日期：2026-06-20。**
**本日志与 M1 主文档同步维护；任何后续修订必须先回到本日志评审。**
