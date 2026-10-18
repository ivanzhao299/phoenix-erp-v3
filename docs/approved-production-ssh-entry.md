# 生产 SSH 直连入口与静态门禁修复

## 问题与结果

用户已明确批准将 GitHub 生产 SSH 入口修正为已核验的直连入口。正式部署工作流原有三处 Appleboy SSH/SCP 调用仍引用旧 host/port/proxy secrets，且未绑定已批准主机指纹。本变更将这三处调用固定为公开入口 `47.236.122.224:22`，固定主机指纹 `SHA256:Y4WEXMJ24a4r1KxOw0det4qcCFNxj65mZeIG9oQOJcI`，并移除 proxy 参数；既有用户与私钥 secret 引用保留。

本变更基于 main `846a770c4b0e8f8aa2f49c8e67eeb335e08571ad`。它不修改 GitHub secrets、生产文件、容器、floor、数据库或好业财策略，不触发发布。发布仍需真实准入和最终双 SHA 授权。

## 实现与审查

- `scripts/ci/check-production-ssh-entry.mjs` 使用已在 lockfile 中存在的固定 `js-yaml@4.1.1`，读取真实 YAML jobs/steps；拒绝重复键、未知 tag、多文档、merge keys、错误 action ref、错误 host/port/fingerprint 和 proxy 参数。别名解析后计数，必须保持三处入口且仅一处 SCP。
- 解析输入限制 512 KiB、64 jobs、2048 steps；失败输出固定分类，不回显原始配置。只读源检查不连接任何服务器，也不产生发布权限。
- root devDependency 与 pnpm importer 显式声明 `js-yaml@4.1.1`，复用现有 snapshot；没有升级 transitive 或 API/Web runtime 依赖。
- 官方 Security CI 安装固定 parser 并执行测试和检查；原冻结及安全门禁继续独立运行，其授权逻辑不变。没有添加治理标签或设置 ALLOW 参数。
- 已有密钥传输测试改为真实 YAML 精确定位正式部署 SSH，检查每项 env/envs、禁止脚本内 secrets 插值，并核对仅显式 credential rotation 才调用现有受控 writer。writer 本身未修改。
- writer 的真实 Docker fixture 使用 `network_mode: none`，只创建、不启动容器，保留环境字节、准确 image ID 和 Running=false 断言。
- 独立只读技术复核由同会话审查子代理完成；这不是第三方 GitHub APPROVE，也不冒充正式生产审批。

## 实际验证

2026-10-18，Node 20.20.2：

| 项目 | 实际结果 |
| --- | --- |
| 入口单测（含别名、重复键、非法配置反例） | 17 PASS |
| 组合契约（入口、Git trust、密钥传输、生产证据/配置、writer） | 44 PASS / 0 SKIP |
| 实际 Docker writer fixture | PASS；未启动服务，清理本测试容器 |
| pnpm 9 frozen/offline lockfile 校验 | PASS |
| 默认冻结门禁 | PASS，0 frozen/content hits |
| 默认安全扫描 | PASS，0 findings |
| git diff --check | PASS |
| 新 HEAD 官方 CI / 正式连接 | 提交后另记；本地结果不能替代 |
| 生产 UID0 / FD9 / 实际发布 | NOT_RUN（本变更不执行） |

失败记录保留：初版正则检查器漏检一种合法 YAML extra step，首次 shell 序列又被后续成功命令遮蔽；改为 set -e 后明确记录，最终替换为真实 YAML parser，未提交旧实现。旧传输测试还要求已迁出 workflow 的内联 writer 文本，已更新为当前实际路径；writer 行为由独立测试覆盖。初次组合 writer Docker 测试因本机默认地址池耗尽失败，随后仅将测试 fixture 限定为无网络，重跑全部 44 项通过。没有删除失败记录或降低门禁。

## 尚未证明的边界

Appleboy v1 的已核实输入支持 fingerprint，不提供 OpenSSH HostKeyAlgorithms/KexAlgorithms 参数；因此不能宣称此源码修复强制了 curve25519 KEX。指纹不匹配必须拒绝，无 fallback。真实 GitHub runner 网络、密钥身份、root/trusted paths/FD9 和生产任务排空必须在各自正式检查中取得证据。静态 PASS 不等同于生产准入、连续 drain 或恢复材料齐备。
