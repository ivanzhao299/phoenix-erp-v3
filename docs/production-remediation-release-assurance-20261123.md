# 生产管理候选独立验收

## 隔离环境及结果

| 项目 | 固定版本与输入 | 观察结果 |
|---|---|---|
| T13 冷装与升级基线 | 已发布 API `6bb88544275dfef591cb96c0078f73e88496433b`，早期集成 API `3562a2291ad0c36294c2a0dbdf4672db777807b7`。分别编译，两条路径使用新建 PostgreSQL 18 库。冻结 SQL 和 TypeORM 按仓库 CI 入口执行。 | 运行版有 294 行迁移账本。该早期集成版新增 0 项。升级与冷装的迁移名称一致，再执行增加 0 行。 |
| T13 历史库存 | 在运行版结构及原有库存触发器下登记四级与五级各 30 枚的合成批次和对应流水。用预先建立的独立、非所有者 API 账号读取升级结果。 | 旧、新编译服务均正常读取。原有批次与流水全行摘要相同，流水合计 60，正式来源分配 0，正式批次资格 0，已启用范围 0。 |
| T13 的 20 项历史回执 | 从原 20 项的真实 Git 路径、源码 blob 和已建库的 TypeORM 账本生成历史格式 v1 夹具。使用生产兼容读取器核对祖先提交和候选。 | 20 项通过。每项分别去除对应账本行或改写源码 blob 后均被拒绝。夹具不进入生产登记。 |
| 混合版本 HTTP 和浏览器 | 旧 Web `6bb885442`，早期集成 API `3562a2291`，独立 PostgreSQL 18，Node 20.20.2。Nest HTTP 使用已签名的测试身份、原守卫、真实上传及 PG，Chromium 连接实际 Next.js。 | 6 个桌面／390px 用例通过。覆盖刷新后草稿、接收人签收、已提交响应丢失后找回、查看权限，以及同日两次 100、900 枚入库。单独选取的 OFF HTTP 用例 1 通过，未选 49 项。 |
| T14 执行与恢复 | activation `d8f4a25b0`，第二个独立 PG18 数据库，分设 API、issuer、executor、控制所有者。 | PG 套件 24/24。真实 INIT 中断可回滚并以原准入重试，ATTACH 保留期初，同仓两舍暂停后按原签认恢复。只有真实宿主、专用角色和完整授权齐备时可执行现场试点。 |
| 发布工具回归基线 | `production-modern-schema-{authority,unit-receipts,operator-workflow,registration}.test.mjs` | 56 通过，0 失败，0 跳过。 |

上述早期 SHA 用于校准。最终候选的三项迁移、镜像 ID、回执及受保护生产动作应写入同版本 CI／发布记录。其他领域 T01–T12 及业务现场效果使用各自的验收结果。

## 在本候选复验

使用仓库的 Node 20、pnpm 9 锁文件安装的依赖、Python 3、Git 及本机 Docker。以下命令在仓库根目录执行。冷装与升级脚本新建仅绑定回环的 PG18 容器，并在结束时释放。其参数取已发布和候选的 Git 提交。程序输出新增迁移的名称、时间戳及源码 blob，逐项核对升级前后的账本，并回读合成历史记录。

```sh
python3 scripts/test/production-remediation-release-compat.py "$RELEASED_SHA" "$CANDIDATE_SHA"
node scripts/test/production-remediation-image-compat.mjs "$CANDIDATE_SHA" "$LOCAL_API_IMAGE_ID"
node --test scripts/ops/production-modern-schema-{authority,unit-receipts,operator-workflow,registration}.test.mjs
```

镜像测试接受已在本机加载的 `sha256:…` API 镜像 ID，核对 OCI 版本、引导契约、编译后的迁移及窄财务权限元数据，在断网、只读容器中以 `phoenix` 用户执行。菜单目录的安装与实际角色授予仍须从发布后的 API／数据库分别核对。

## 数据库身份与放行证据

Compose 的 API 与结构 CLI 读取同一组配置身份，见 `docker-compose.yml` 与 `scripts/deploy-schema-first.sh`。其实际角色成员关系、对象所有者和默认 ACL 取决于部署实例。原现代发布副本通过 `pg_restore --no-owner --no-acl` 恢复，并用初始化用户执行，不能据此判定生产普通 API 的权限。

在受控只读连接上，以实际 API 登录执行 `scripts/ops/readonly-audits/production-remediation-runtime-acl.sql`。返回的 JSON 区分结构尚未安装、必要权限缺失、角色特权越界、会话身份不匹配和可用。在升级前保留原结果，验收时用同一实例、真实运行主体与刚执行的迁移逐项复查。SQL 不采集密码和连接串，不写现场数据。

- 普通 API 需要续制表、财务附件绑定表、暂停/恢复回执表的 SELECT 和 INSERT，以及准入来源投影的 SELECT。财务绑定当前使用 SELECT FOR SHARE，另需至少一列具备 UPDATE。只读 SQL 同时检查实际有效权限及可切换成员角色的越界能力。
- 原协议将签发权给独立 issuer，经受保护准入表的 INSERT 及数据库守卫签发。普通 API 不得直接修改准入、执行结果或控制环境，也不得消费准入、记录执行结果或获取执行器授权锁。后续新增的 broker 专用函数必须随同其签名进入该审查。
- 显式授予的合成角色用例在可回滚事务中独立验证三张表的访问与财务行锁条件。维护记录须区分夹具的定向授权和现场实权。真实试点签发、实盘、一次性准入、外层围栏均由受控宿主核验。

## 发布结论的边界

协调方在已发布 `6bb885442` 上取得只读 inspect [45116698259](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/45116698259)，运行版一致、pending 为空、原始全库结论为 HOLD。该记录属于候选合并前。新候选必须按实际运行版、物理库和最新账本重新 inspect。旧版普通 apply 对 pending 加原始 HOLD 停止；旧版现代流程在 preparation 和 supervisor 均固定首发运行 SHA 和 20 项清单。

本候选需要单独审查新发布路径、精确清单、候选镜像、历史 60 枚的原因和追溯、独立技术核验，以及实际受托协调人经已认证通道登记的本次维护窗口。窗口须覆盖已测执行和恢复预留。先核对旧 20 项，再仅执行新 pending 并对账，随后验证 API 和同 SHA Web。生产部署回执、启用与期初回执各自保留。
