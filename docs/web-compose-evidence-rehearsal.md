# Web-only evidence: real Compose rehearsal

2026-10-18，本地隔离验证阶段。此变更不接入生产发布、不授权 Web 发布，
也不宣称 API-only 重锚、旧 Cron 排空或业务 UAT 已完成。

此前真实 Next fixture 通过修改测试 ID map 选择另一个容器，且保留全部容器，
没有证明普通 Compose 的服务替换。本轮新增独立 fixture，复用正式 evidence
validator，不修改生产校验规则或旧格式兼容契约。

## 构建来源

`web-compose-images.fixture.mjs` 分别从精确的 `9155dcc…` 和当前测试目标 Git
对象导出三个根清单及 `apps/web`。不导出 API 源码，不复制工作区环境文件。
使用 Node20、pnpm9、冻结锁文件和独立目录重新构建 Next standalone；使用当前
受审的 fixture helper 包装。安装忽略生命周期脚本；Web build 显式执行原有
stamp/build 脚本，并以来源 SHA 设置 GITHUB_SHA。

每份 provenance 记录 source SHA、Web tree、lock/archive/helper/Dockerfile/
生成 SW 摘要、真实 image ID 与 OCI revision。两份源的 Web tree 相同、根锁文件
不同，不能描述成 Web 业务代码发生变化。该记录证明本次选定输入和构建来源，
不承诺字节级可复现，也不是生产镜像收据。

过滤安装后的 Next trace 含一个内部未解析 semver 链接；路径逃逸仍拒绝，内部
未解析链接有界记录，必须继续通过实际启动验证。构建 PASS 只表示构建步骤成功，
不能代替真实 Compose E2E，更不代表全部业务路由或生产依赖完整性。

## 实际切换与取证

- 唯一 owner/project 的内部网络，PG18 tmpfs，无宿主端口或生产入口。
- 本机默认 Docker 地址池耗尽时，从预留 benchmark 范围选择与已知 Docker 子网及
  宿主 IPv4 路由无重叠的 /24；并发占用导致创建失败，不删除其他网络。
- API health mock 已运行目标 fixture 镜像；旧 Web 运行旧源 fixture 镜像。
- 采 PRE 后只执行 `compose up --no-deps --no-build --pull never web`。
- 每次从真实 Compose labels 发现服务，确认旧 Web 消失；通过未替换 API peer
  请求固定内部 DNS `http://web:3000` 验证新 Web HTTP，不使用手工 ID-map 路由。
- 正例检查 API/DB 完整身份不变，实际 Web OCI/image、PRE/POST、Next stdout/stderr、
  正式 evidence reader 和 live re-inspect。
- 负例拒绝旧健康 Web、真实 503、错误 OCI，以及实际 API/DB restart、Web 同镜像
  recreate 和进程自动 restart。

正例后故意注入自有运行态故障，随后销毁全部测试容器和网络。因此身份不变声明
只覆盖正例替换阶段，不是最终现场仍在运行的部署声明。API 是 mock health peer，
Web 是实际 ERP Next standalone，数据库是实际隔离 PG；不证明 ERP 全业务连通性。

## 失败、期限与清理

创建前保存 owner/project 意图。清理逐资源检查 owner/project，独立执行停止、
删除和两次空清单检查；创建命令完成状态未知时仍写 FAIL。借用镜像不删除；
builder 生成的镜像与 capsule 有意保留为隔离构建资料，不声称全局 Docker 清理。

测试框架取消和绝对期限都会使晚到收据保持 FAIL；最终收据非 PASS 必须使 harness
失败。真实 Node 子进程负例分别复现框架先超时，以及清理越过绝对期限但框架尚未
超时。相同保护用于 root-control PG fixture；纯清理不因取消跳过。

## 实测范围

本地：两个源输入重新构建成功；新镜像实际 Compose E2E 8 场景通过；期限/IPAM
纯测试 5 项通过；更新后的 root-control PG16.14/PG18 测试 22 项通过、无跳过。
早期网络创建失败、外部端口探测失败和 builder 的内部链接拒绝均保留失败记录，
没有继承为 PASS。源码最终 HEAD 的官方 hosted 结果以新 workflow 收据为准；
本报告撰写时 hosted 尚未执行。

后续仍需：官方实际构建与 E2E、源码治理门禁；真实生产 API-only HOLD 成功后，
再取得独立 Web 发布许可及实际旧/新运行版本准入。生产 Web 仍为 `23c7af86…`，
本 fixture 旧源 `9155dcc…` 不能代替该生产版本的兼容性或 UAT 证明。
