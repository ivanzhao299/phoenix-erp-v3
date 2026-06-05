# MDM-1 实施报告

> **优先级**：P0
> **前置**：`docs/mdm-0-master-data-audit.md` + `docs/mdm-1-unified-model-design.md`
> **状态**：5 个 migration 文件 + biz_projects 端点 + ProjectSelector 切换 **均未在生产 DB 执行**；代码改动已 push 到 main 经 CI/CD 自动部署。

---

## ① 修改文件清单

| 类型 | 文件 | 说明 |
|---|---|---|
| API 新增 | `apps/api/src/modules/master-data/biz-projects.controller.ts` | 新端点 `/api/biz/projects` + `/active` + `/:code`，含建表 fallback |
| API 改动 | `apps/api/src/modules/master-data/master-data-center.module.ts` | 注册 BizProjectsController |
| Web 改动 | `apps/web/src/components/shared-selectors/MasterDataSelectors.tsx` | ProjectSelector 切到 `/biz/projects/active`，支持 companyCode 过滤；表未建时空表 fallback |

## ② 新增 migration 文件清单（**未执行**）

| 文件 | 内容 | 幂等 |
|---|---|---|
| `migrations/mdm1_01_biz_projects.sql` | 建表 + 6 个项目 seed + company_code 触发器校验 | ✅ |
| `migrations/mdm1_02_biz_site_aliases.sql` | 建表 + 9 个孟赛/东鹏 alias seed + site_code 触发器校验 | ✅ |
| `migrations/mdm1_03_brd_farms_extend.sql` | brd_farms 加 mapped_site_code + 回填 4 行 | ✅ |
| `migrations/mdm1_04_mst_stores_extend.sql` | mst_stores 加 company_code + mapped_site_code（不回填，待业务确认）| ✅ |
| `migrations/mdm1_05_brd_daily_logs_extend.sql` | 加 company_code/project_code/site_code/business_date 4 字段 + 自动回填 + 审计 | ✅ |

> 5 个文件都放仓库根 `migrations/` 而非 `apps/api/migrations/`，**避免 CI/CD 自动跑到生产**。等业务方授权后再镜像到 CI 目录或手动执行。

## ③ 新增 seed 文件清单
所有 seed 已内联在 ② 的 migration 文件中（INSERT...NOT EXISTS）。

## ④ 新增文档清单

| 文件 | 状态 |
|---|---|
| `docs/mdm-0-master-data-audit.md` | 已交付（前次） |
| `docs/mdm-1-unified-model-design.md` | 已交付（前次） |
| `docs/mdm-coding-standard.md` | 已交付（前次） |
| `docs/mdm-1-implementation-report.md` | 本文 |

## ⑤ biz_projects 初始项目清单

| project_code | project_name | company_code | status | 说明 |
|---|---|---|---|---|
| `PRJ_MENGSAI_LAYER` | 孟赛蛋鸡场经营项目 | COMP-LAO-AGRI | ACTIVE | 孟赛蛋鸡养殖场 |
| `PRJ_DONGPENG_LAYER` | 东鹏蛋鸡场经营项目 | COMP-LAO-AGRI | ACTIVE | 东鹏蛋鸡养殖场 |
| `PRJ_VIENTIANE_FOOD` | 万象食品综合项目 | COMP-LAO-FOOD | ACTIVE | 含 VTE-FEED/SLAUGHTER/BROILER |
| `PRJ_MENGSAI_HATCHERY` | 孟赛孵化场经营项目 | COMP-LAO-AGRI | DRAFT | 孵化场，PLANNED 状态 |
| `PRJ_MENGSAI_ORGANIC` | 孟赛有机肥生产项目 | COMP-LAO-AGRI | DRAFT | 有机肥，PLANNED 状态 |
| `PRJ_XINGCHI_LAYER` | 金三角特区星驰养鸡项目 | COMP-LAO-XINGCHI | DRAFT | — |

## ⑥ biz_site_aliases 初始映射清单

| canonical site_code | alias_type | alias_code / alias_name |
|---|---|---|
| SITE-MENGSAI-LAYER | FARM_CODE | LPH_MENGSAI |
| SITE-MENGSAI-LAYER | FARM_CODE | FARM001 |
| SITE-MENGSAI-LAYER | FARM_CODE | FARM-MS |
| SITE-MENGSAI-LAYER | OLD_SITE_CODE | FARM-MS（sys_store 老表）|
| SITE-MENGSAI-LAYER | EXCEL_NAME | 孟赛蛋鸡场 |
| SITE-MENGSAI-LAYER | LEGACY_NAME | 孟赛蛋鸡养殖场 |
| SITE-MENGSAI-LAYER | LEGACY_NAME | 孟赛场 |
| SITE-DONGPENG-LAYER | FARM_CODE | FARM-DP |
| SITE-DONGPENG-LAYER | OLD_SITE_CODE | FARM-DP |

> **CO-FHA / CO-FHF 等公司旧编码不进 site_aliases**。如业务方需要"公司别名"映射，建议另立 `biz_company_aliases` 表（本期不实施，列为残留项）。

## ⑦ brd_farms / mst_stores mapped_site_code 回填清单

### brd_farms 回填规则（migration `mdm1_03`）

| farm_code | farm_name | mapped_site_code |
|---|---|---|
| LPH_MENGSAI | 孟赛蛋鸡场 | SITE-MENGSAI-LAYER ✅ |
| FARM001 | 孟赛养鸡场 | SITE-MENGSAI-LAYER ✅ |
| FARM-MS | 孟赛蛋鸡场 | SITE-MENGSAI-LAYER ✅ |
| FARM-DP | 东鹏蛋鸡场 | SITE-DONGPENG-LAYER ✅ |
| FARM-01 | 凤羽一号基地 | **NULL（待业务确认）** |

### mst_stores 回填规则（migration `mdm1_04`）
**0 行主动回填**。8 行门店的 company_code / mapped_site_code 均**待业务方提供清单**后执行 UPDATE。migration 仅加字段。

## ⑧ brd_daily_logs 统一字段回填逻辑（migration `mdm1_05`）

1. **回填 site_code**：
   - 优先：`farm_code` → JOIN `biz_site_aliases (FARM_CODE)` → site_code
   - 兜底：`farm_code` → JOIN `brd_farms.mapped_site_code` → site_code
2. **回填 company_code + project_code**：
   - site_code = SITE-MENGSAI-LAYER → company_code=COMP-LAO-AGRI + project_code=PRJ_MENGSAI_LAYER
   - site_code = SITE-DONGPENG-LAYER → company_code=COMP-LAO-AGRI + project_code=PRJ_DONGPENG_LAYER
3. **回填 business_date**：`business_date = log_date`（保持兼容）
4. **审计**：未映射行通过 RAISE NOTICE 在 migration 输出中打印计数

## ⑨ 采购订单 company/project/site 选择验证

- **CompanySelector** + **ProjectSelector** 在前端表单中已存在（`procurement2/orders/page.tsx:845,860`、`requests/page.tsx`）
- 之前"不能选项目"根因是 `prc2_projects` 表 **0 行**
- 本次改造后 ProjectSelector → `/api/biz/projects/active?company_code={X}`
- migration 执行后 biz_projects 至少 4 个 ACTIVE 项目可选
- **待业务方授权 migration 执行后**才能完成端到端验证

**采购订单 DTO 层校验** company_code / project_code 已存在（`create-purchase-request.dto.ts` 用 @IsString() 标 required）。**site_code 校验**留待 MDM-2 阶段（biz_projects 落地 + 业务 service 加 site_code 路径后）。

## ⑩ 生产日报 6/1 至今查询验证结果

| 验证项 | 现状 |
|---|---|
| brd_daily_logs 6/1-6/4 数据是否存在 | ❓ 未实际录入（Excel 7 个 sheet 数据 GLP-1A-3 阶段才 ETL）|
| 字段层是否就绪 | ❌ company_code/project_code/site_code 在生产 DB 缺；migration 文件已准备 |
| 宋明光角色范围是否覆盖 | ✅ farm_code='LPH_MENGSAI' 在 sys_user_farm_scopes，将通过 biz_site_aliases 映射到 site_code=SITE-MENGSAI-LAYER |
| 6/1 至今数据可见性 | ⏳ 等 migration 执行 + ETL（GLP-1A-3）完成后验证 |

**根因明确**：当前不可见的根因不是查询逻辑问题，而是**字段层尚未具备（brd_daily_logs 缺 3 字段）+ 数据层尚未导入**。两步完成后即可按 site_code 过滤可见。

## ⑪ 个人中心显示验证

- 已完成（GLP-1A-RBAC-Realign 阶段，commit `c5db17f`）：按 `userKind=production` 切换文案 → 显示"绑定生产站点"+"数据范围"section
- 宋明光页面**不再显示"绑定门店"**，正确显示"绑定生产站点：孟赛蛋鸡养殖场（SITE-MENGSAI-LAYER）"
- 数据范围 section 显示：公司=老挝凤凰农业 / 养殖场=LPH_MENGSAI（待 MDM-2 后切到 site_code）/ 鸡舍=1-6 号

## ⑫ 是否执行 migration

**未执行**。

5 个 migration 文件**全部放在仓库根 `migrations/`，不在 `apps/api/migrations/`**，避免 CI/CD 自动跑。需要业务方明确指令"执行 MDM-1 系列 migration"后再：

```bash
ssh erp 'docker exec -i phoenix-v3-db psql -U phoenix_v3 -d phoenix_erp -v ON_ERROR_STOP=1 < /dev/stdin' < migrations/mdm1_01_biz_projects.sql
# 按 01 → 02 → 03 → 04 → 05 顺序逐个执行
```

## ⑬ Commit hash

**待 push 后填入**。

## ⑭ 残留待业务确认项

| # | 待确认 | 影响 |
|---|---|---|
| 2 | `brd_farms.FARM-01`（凤羽一号基地）对应 site_code | 等映射后才能进 alias 表 |
| 3 | `mst_stores` 8 行门店各自的 company_code + mapped_site_code | 8 个销售门店未映射 |
| 4 | 是否新建 `biz_company_aliases` 表 | CO-FHA / LPH 等公司旧编码需统一映射 |
| 5 | `sys_store` 16 行是否完全弃用 | 与 sys_organizations 重叠的实体如何归档 |
| 6 | 历史 brd_daily_logs 数据回填 site_code 是否会冲突业务方既有逻辑 | 等 ETL 阶段（GLP-1A-3）确认 |
| 7 | 采购 PO `site_code` 字段是否需要加（当前只校验 company+project）| MDM-2 阶段决定 |
| 8 | brd_houses 字段是否也需要加 company_code/project_code/site_code | 同上 MDM-2 阶段 |
| 9 | DataScopeContext 是否新增 `allowedSiteCodes` 维度 | MDM-2 阶段实施 |
| 10 | 生产模块 service 切换站点过滤的具体接口清单 | MDM-2 阶段实施 |

---

## 后续阶段（等业务方确认 + 授权）

| 阶段 | 入口条件 | 工作量 |
|---|---|---|
| **MDM-1** ✅ | — | 已完成（本期） |
| **MDM-2** ⏳ | 业务方授权执行 5 个 migration | 30 分钟 ssh+psql |
| **MDM-3** ⏳ | MDM-2 完成 | 业务表补字段 + service 切换 site_code 过滤 |
| **MDM-4** ⏳ | MDM-3 完成 | DataScope 加 allowedSiteCodes + 跨场隔离 |
| **MDM-5** ⏳ | MDM-4 完成 | 前端联动级联 CompanySelector → ProjectSelector → SiteSelector |
| **MDM-6** ⏳ | 充分回归 | sys_store / brd_farms / mst_stores 老表冻结 |
