# Phoenix ERP — 项目版本目录标识

## ⚠️ 重要：两套项目不可混淆

---

## ✅ V3（当前开发版本）
- **前端 Web**：`/Users/mac/Antigravity/ABC/apps/web/`（Next.js 15 App Router, 端口 3000）
- **后端 API**：`/Users/mac/Antigravity/ABC/apps/api/`（NestJS, 端口 3100）
- **启动方式**：`cd /Users/mac/Antigravity/ABC && bash start-v3.sh`
- **CSS 规范**：`admin-ui.module.css`，按钮使用 `s.btnPrimaryGrad`

## ❌ V2（旧版本，仅供参照，禁止修改）
- **前端**：`/Users/mac/phoenix ERP/phoenix-frontend/`（Vite, 端口 5180）
- **后端**：`/Users/mac/phoenix ERP/_archive/phoenix-backend-v2-sqlite/`（Express, 端口 3001）
- **禁止**：不得在此目录做任何修改，仅可读取参照

## V2 包装模块核心功能（迁移参照清单）

### 后端接口（V2）→ V3 需对应实现
| V2 接口 | 功能 | V3 状态 |
|---|---|---|
| GET /packaging/grade-config | 从 sys_dict 读取等级配置（AAA/AA/A/B/C/X）| ✅ 前端内置+计划后端动态 |
| GET /packaging/pack-spec-config | 从 sys_dict 读取包装规格 | ✅ 前端内置+计划后端动态 |
| GET /packaging/tasks | 包装任务列表（PKG-前缀）| ✅ |
| GET /packaging/tasks/:no/label-info | 标签打印专用（含批次、零售价、生产日期）| ✅ 已建页面 |
| POST /packaging/tasks | 创建包装任务（检查库存） | ✅ |
| POST /packaging/tasks/:no/complete | 任务完成（扣减批次库存+写流水）| ⚠️ 前端有按钮，后端未接 |
| POST /packaging/tasks/:no/grade | 分级提交（事务：建批次+GRADED_IN流水+核减原料）| ⚠️ 需建专用分级提交接口 |
| POST /packaging/tasks/:no/pack-complete | 包装结单（生成wms_inbound+处理尾数）| ⚠️ 需建 |
| POST /packaging/tasks/merge-remainder | 合拼尾数 | ⚠️ 需建 |
| POST /packaging/shifts/:id/complete | 班次完成（三步联动：日报+批次+分级任务）| ⚠️ 需建 |
| POST /packaging/shifts/:id/reopen | 班次重开（撤销+审计）| ⚠️ 需建 |
| POST /packaging/tasks/:no/anomaly-reason | 补填异常原因 | ⚠️ 需建 |
| GET /packaging/daily-report | 包装日报 | ⚠️ 已建页面，接口未接 |
| GET /packaging/operators | 操作员下拉 | ⚠️ 需接 |
| GET /packaging/grading-dashboard | 分级看板统计 | ⚠️ 分级页面需接 |

### V2 业务规则（必须迁移）
1. **任务前缀区分**：GRADE- 分级任务，PKG- 包装任务，不可混用
2. **分级等级**：AAA/AA/A/B/C/X（破损）+ XL（特大）+ 脏蛋，从 sys_dict.PKG_EGG_GRADE 动态加载
3. **包装规格**：从 sys_dict.PKG_PACK_SPEC 动态加载
4. **班次完成三步联动**：① 更新班次状态 ② 写日报 ③ 建批次+分级任务
5. **分级提交联动**：① 各等级建批次 ② GRADED_IN 流水 ③ 核减原料 ④ 自动建 PKG 包装任务
6. **包装结单联动**：① 扣库存 ② 建 wms_inbound ③ 处理尾数
7. **尾数处理**：合拼接口（merge-remainder）按等级聚合
8. **标签信息**：批次号+品级+包装规格+数量+生产日期+零售价+图片
