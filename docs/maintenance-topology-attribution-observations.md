# 只读执行器归因观测补强

原快照将未知 Docker 项目/服务归为 OTHER，未输出可关联的名称摘要；进程与 systemd unit 也缺少同一启动身份的关联字段。这些缺失不能靠“当前没有任务”推定无关。

本补强只输出 Docker name/project/service 的 SHA256、进程 cwd/cgroup 路径的 SHA256，以及 systemd ControlGroup/WorkingDirectory/InvocationID 的 SHA256。Docker 完整投影前后复核；进程 PID/startTicks/UID/cgroup 与 cwd 复核；systemd MainPID/startTicks/UID 及两次固定属性投影复核。变化、退出、不可读、预算截断仍为 UNVERIFIED。名称与路径摘要属于可字典匹配的归因线索，不是匿名化保证；不采集 ExecStart/cmdline/environ/完整标签/密钥。

原 root/trusted paths/FD9、60 秒总预算、384KiB 输出预算、固定命令和闭词表继续有效。该代码没有准入判定或服务操作；completeSafetyProof、continuousDrainProof、admissionOrApprovalGranted 始终 false。它不安装任何生产 producer registry，也不证明外部编排器或旁路任务已被约束。

2026-10-18，Node 20：三套检查（topology/native SSH output/native SSH transport）共55 PASS/0 SKIP，包含明确 opt-in 的自有真实 Docker 投影，容器未启动且已按身份清理。独立代理另跑纯检查44 PASS/1 Docker opt-in SKIP。最初新增 fixture 缺少 projection 新字段、边界 false 标记的失败保留，补齐测试输入后重跑通过。git diff --check PASS。

真实生产观察必须由本 runner 的新完整 SHA 与两个 helper hash 绑定、经过受保护只读工作流取得；本地 PASS 不代表已经取得生产证据。远端固定只读 body 未修改，不更新生产 checkout，不写 floor/active/事务，不切容器，不迁移或同步。
