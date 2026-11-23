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

## 三项扩展的集成结果

在集成 `37e290d7b` 上重新执行冷装与升级。旧、新 API 以独立非所有者身份读取成功，原来源与历史行摘要保持一致。旧 20 项格式回执全部通过，账本 294 → 297，重跑新增 0 项。冷装的迁移名称与升级相同。观察到以下新增记录。

| 迁移类 | 本次演练的 Git blob |
|---|---|
| `ProductionDocumentContinuations1795400100000` | `4dbf4aa3d1ae76a3622db747e5d646bb2c959e86` |
| `ProductionFinanceReview1795400200000` | `da9f342fb7b7740ffc1a7a34239793e5ff17ecfe` |
| `CutoverStateReceipts1795400300000` | `f6a5380be0c5ccfce5e0671c40e2d143e17ff34b` |

同一集成 API 与已发布 Web 的桌面／390px 实际浏览器 6/6 通过，包括断开过账响应后按原交接号找回回执。独立 PG18 的日报粒度／切换测试 18/18 通过，涵盖待切换时旧日写入、过期快照、归档后修改及正式来源身份约束。

旧只读角色的真实输出是 `MISSING_BUSINESS_ACCESS`，三张新表和一张视图均缺少 SELECT。其对三个控制表的写入和三个执行器函数的调用均受限。事务内定向授权的另一个检查验证了三张表的 SELECT/INSERT 和视图 SELECT 这组权限的可用性。该事务随后回滚，现场权限仍待独立实测。从数据库容器以 POSTGRES_USER 打开的维护读取连接不能证明实际 API 权限。

生产运行身份可从受控 API 连接核实 session_user、角色 OID、原镜像身份与物理库，再查其对原单及相关签认表的有效权限。当前有效登记中的 API 主体和未登记运行主体分别绑定到已批准的候选、角色及库，定向交付确需的新表权限。历史只读方沿用原查询。复制 PUBLIC 或全部角色 ACL 会扩大授权范围。

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

在受控只读连接上，以实际 API 登录执行 `scripts/ops/readonly-audits/production-remediation-runtime-acl.sql`。返回的 JSON 区分结构尚未安装、必要权限缺失、角色特权越界、会话身份不匹配和可用。在升级前保留原结果，验收时用同一实例、真实运行主体与刚执行的迁移逐项复查。SQL 不采集密码和连接串，不写现场数据。`businessAccess` 回答当前 API 能否使用新增业务对象，`pilotIsolation` 回答其与控制面的权限是否分离。完整 `result` 适用于两者均要求的场景。

软件默认 OFF 时，由受保护读通道独立核实控制登记、舍域／实物域、有效准入、执行结果、期初回执／流水，以及升级前后原有业务数据摘要。未登记、无运营域、无期初、无准入、无执行结果且旧事实不变时，历史运行身份兼任表所有者记入试点阻断；软件验收仍看实际新旧读写及 OFF 围栏。出现现有可写试点、有效登记却越权、事实摘要或 60 枚保管证据变动时保持 HOLD。已登记环境应使用原生 `assert_cutover_control_environment` 核对当前代际及角色 OID，配合实际 API 登录检查新增表。首次实账启用须补齐专用 API、issuer、executor 和 NOLOGIN 控制所有者的隔离、许可及签认。

- 普通 API 需要续制表、财务附件绑定表、暂停/恢复回执表的 SELECT 和 INSERT，以及准入来源投影的 SELECT。财务提交 8764cd22a 改为在原单锁下读取绑定，绑定表不需要 UPDATE。只读 SQL 同时检查实际有效权限及可切换成员角色的越界能力。
- 原协议将签发权给独立 issuer，经受保护准入表的 INSERT 及数据库守卫签发。普通 API 不得直接修改准入、执行结果或控制环境，也不得消费准入、记录执行结果或获取执行器授权锁。后续新增的 broker 专用函数必须随同其签名进入该审查。
- 显式授予的合成角色用例在可回滚事务中独立验证三张表的必需访问与财务绑定无 UPDATE 特权。维护记录须区分夹具的定向授权和现场实权。真实试点签发、实盘、一次性准入、外层围栏均由受控宿主核验。

## 发布结论的边界

协调方在已发布 `6bb885442` 上取得只读 inspect [45116698259](https://github.com/ivanzhao299/phoenix-erp-v3/actions/runs/45116698259)，运行版一致、pending 为空、原始全库结论为 HOLD。该记录属于候选合并前。新候选必须按实际运行版、物理库和最新账本重新 inspect。旧版普通 apply 对 pending 加原始 HOLD 停止；旧版现代流程在 preparation 和 supervisor 均固定首发运行 SHA 和 20 项清单。

本候选需要单独审查新发布路径、精确清单、候选镜像、历史 60 枚的原因和追溯、独立技术核验，以及实际受托协调人经已认证通道登记的本次维护窗口。窗口须覆盖已测执行和恢复预留。先核对旧 20 项，再仅执行新 pending 并对账，随后验证 API 和同 SHA Web。生产部署回执、启用与期初回执各自保留。

## 控制路径独立复核

集成 `7463c116c00fb317f52062b49d7e8d1a47973895` 的完整建库、扩展及重跑再次通过。历史只读账号通过已发布和候选的实际追溯服务查到两笔原批次、各 30 枚的流水，另一公司查询未返回批次。跨库对比按冻结 SQL 名称多重集和实际加载 TypeORM 类的时间戳／名称／次序核对；同库保留原记录的 ID、时间戳和名称。此轮三项 Git blob 为 `4dbf4aa3d1ae76a3622db747e5d646bb2c959e86`, `d135f8b988d2db6163b9bb54f422cf7fb5924e19`, `31dbb08ac8979b5c9aadcd70e8f7d1f8b1b2879a`。

使用正式 Dockerfile 构建的集成镜像 `807f9a9d8bb917daaf6a0fa9fbef2cf2a725c0f6`，本机镜像 ID 为 `sha256:a947b150526ca876910af1600ba18ae2eea71b962d4296242f4fa1eba5b9df52`。在无网络、只读、非 root 容器内实际加载了三项迁移、引导契约及 `MENU_PROD_FIN_REVIEW:V` 的控制器元数据。它是本地演练镜像，生产镜像仍由 CI 和现场 OCI 绑定核实。

在含发布实现的独立检出 `938a66b9b` 上，现代结构发布的 11 份针对性测试共 161 项通过，0 跳过。核对既有 20 项和 60 枚保管依据、候选 blob、完整 CI 步骤和 GitHub 登记、实测演练时长与恢复预留，以及同 SHA Web 的 API 成功回执和镜像钉住。控制路径采用实际受托协调人的经认证 dispatch。

在独立 Docker 网络命名空间执行试点宿主测试，WSL 内核的 inet 层实测阻断／放行、提交确认丢失与按原意图恢复 7/7 通过；完整 bridge family 在该内核返回 Not supported，其测试不计本机通过，Linux CI 运行完整双层检查。所有本地演练使用合成数据。生产开窗、执行、API/Web 版本及试点状态以现场受控回执为准。
