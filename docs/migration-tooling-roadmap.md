# 数据库迁移工具标准化方案（明天落地蓝图）

> 目标：把迁移从"裸 SQL + 自写脚本"升级到**产品级、优雅、强壮**，彻底告别"裸奔"。
> 本文是落地蓝图，供下次专注实施时照做。**不在疲劳/超长作业中赶工**（g194 一轮连踩 4 个部署坑的教训）。

---

## 0. 当前状态（g193 / g194 已完成，本方案的起点）

迁移机制已经从"裸奔"前进了一大步，**最危险的债已还清**：

| 能力 | 状态 | 来源 |
|------|------|------|
| 迁移执行记录（schema_migrations 表） | ✅ 生产生效 | g194 |
| 跑过的不再跑、只跑新增 | ✅ 生产实测(169 跳过/0 执行) | g194 |
| 首次 baseline（已初始化库护现状 / 空库全跑初始化） | ✅ | g194 |
| 迁移逻辑收敛成单一共享脚本 `scripts/db-migrate.sh` | ✅ CI+生产共用 | g194-3 |
| 数据 seed 不再被部署重插 | ✅ baseline 锁定 | g193+g194 |

**结论**：`scripts/db-migrate.sh` + `schema_migrations` 已经是一个"迷你迁移框架"。本方案是在此之上换/补成熟工具，属**锦上添花的优雅化**，不是救火。

---

## 1. 仍存在的技术债（本方案要消除的）

| 债 | 说明 | 严重度 |
|----|------|--------|
| **无 rollback** | 裸 SQL 无 down，迁移出错只能手动修 | 中 |
| **幂等靠手写** | 每个迁移自己写 `WHERE NOT EXISTS`/`IF NOT EXISTS`，易漏易错 | 中 |
| **entity 与 SQL 漂移** | TypeORM entity 和迁移 SQL 各写各的，可能不一致（如 `sys_user` 列名 entity 与实际对不上） | 中-高 |
| **无强制 code review 门禁** | 新迁移没有"必须有 down / 必须幂等 / 不得写业务数据"的自动检查 | 低-中 |

---

## 2. 工具选型对比

| 维度 | **node-pg-migrate** | **TypeORM migration** |
|------|---------------------|------------------------|
| 与项目契合 | 独立 Node 工具，需新增依赖 | 项目已有 typeorm 0.3.17，零新依赖 |
| 迁移格式 | JS 或纯 SQL（`*.sql` 友好） | TS 类（`up(queryRunner)/down`），可写 raw SQL |
| 现有 169 裸 SQL 兼容 | 较好（SQL 迁移目录，时间戳命名兼容） | 差（要包成 TS 类） |
| up/down rollback | ✅ | ✅ |
| 记录表 | `pgmigrations` | `migrations` |
| **entity 漂移治理** | ❌ 不管 entity | ✅ `migration:generate` 从 entity diff 生成，根治漂移 |
| 学习/迁移成本 | 低（延续 SQL 风格） | 中（团队需写 TS 迁移） |

**推荐**：**TypeORM migration**。理由——项目已用 TypeORM entity，最大的剩余债是"entity 与 SQL 漂移"，只有 TypeORM 的 `migration:generate` 能从 entity 自动生成迁移、根治漂移；且零新依赖。代价是新迁移要写 TS（可接受，团队已用 TS）。

> 若团队强烈倾向继续写纯 SQL、不想碰 TS 迁移，则退而选 node-pg-migrate。

---

## 3. 169 个旧迁移的处理策略（关键决策）

**强烈推荐：渐进式"锁旧立新"，而非重构历史。**

- **旧 169**：已被 `schema_migrations` baseline 锁定、生产不再跑。它们是**历史记录**，重构成 TS/工具格式**零业务收益、高风险**。→ **原样冻结，不动**。
- **新迁移**：从引入工具那天起，**一律用工具规范**（TypeORM migration 类，带 up/down，CI 门禁校验）。
- **记录表桥接**：把现有 `schema_migrations` 的 169 条，一次性灌入工具的记录表（TypeORM `migrations` 表），让工具认为它们"已执行"，从此只跑新的。

这样：**零重构、零风险、立刻优雅**——旧的锁死、新的标准。一年后旧裸 SQL 自然边缘化。

> ❌ 不推荐"把 169 个全重写成 TS 迁移"——纯粹的考古工作，动一个错一个，得不偿失。

---

## 4. 分步实施计划（每步独立可回滚）

1. **P1 选型定稿** + 在 `apps/api` 配 TypeORM DataSource 的 migrations 配置（migrationsTableName、migrations 目录），`synchronize:false` 确认。
2. **P2 记录表桥接**：写一次性脚本，把 `schema_migrations` 的 169 条灌入 TypeORM `migrations` 表（带正确 timestamp）。在 CI 测试库 + 生产各跑一次验证"工具认为已全部执行"。
3. **P3 部署接管**：`scripts/db-migrate.sh` 末尾改为"先跑历史裸 SQL tracking（兼容期）→ 再 `typeorm migration:run`（跑新 TS 迁移）"。或直接全切到 `migration:run`（取决于 P2 桥接是否覆盖全部）。
4. **P4 新迁移规范**：建 `migrations-ts/` 目录 + 模板；新需求一律 `migration:generate`（schema 变更）或手写 TS（数据），**禁止再加裸 SQL 到 migrations/**。
5. **P5 CI 门禁**：加检查——新增 migrations-ts 必须有 down；entity 改动必须配套 migration（`migration:generate` 跑出空 diff 才算同步）；migrations/ 目录冻结（不许新增裸 SQL）。
6. **P6 文档**：更新 CLAUDE.md 的迁移 SOP（从"写裸 SQL"改为"用 TypeORM migration"）。

---

## 5. 回滚预案

- 每步 commit 独立。P3 部署接管若出问题，`scripts/db-migrate.sh` 回退到当前 g194 版（裸 SQL tracking），生产不受影响（schema_migrations 仍在）。
- P2 记录表桥接是纯 INSERT 到新表，不动现有数据；出错 `TRUNCATE migrations` 重来。
- 全程 `synchronize:false`（绝不让 TypeORM 自动改表），所有 schema 变更只走显式迁移。

---

## 6. 测试清单（落地前必过）

- [ ] CI 空库：`migration:run` 能从零建全 + 跑通新迁移
- [ ] 生产镜像库（dump 一份）：桥接后 `migration:run` 显示"无 pending / 全已执行"
- [ ] 造一个新 TS 迁移：CI 和生产各跑一次，确认只跑它、记录它
- [ ] 造一个 entity 改动：`migration:generate` 能正确生成 diff 迁移
- [ ] rollback：`migration:revert` 能回退最后一个新迁移
- [ ] 门禁：提交无 down 的迁移 / 改 entity 不配迁移 → CI 红灯

---

## 7. 风险与注意

- **这是底层基础设施改造，必须在状态好、专注的时段做**（g194 教训：疲劳连续作业改部署，一轮踩 4 坑）。
- 生产记录表桥接前，先在**生产库 dump 的副本**上全程演练。
- `synchronize` 永远 false。
- 旧 169 裸 SQL **只冻结不重写**。
- 一次只推进 1-2 个 P 步骤，每步部署验证再继续。

---

## 附：今日（g193/g194）已交付清单
- `scripts/db-migrate.sh`（共享迁移脚本 + tracking）
- `.github/workflows/deploy.yml`（CI + 生产都调共享脚本）
- 生产 `schema_migrations` 表已 baseline 169 条
- 数据 seed 冻结（组织/用户/客户/供应商/现金流水不再被重插）
