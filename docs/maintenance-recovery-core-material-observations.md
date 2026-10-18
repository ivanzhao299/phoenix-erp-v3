# 维护恢复核心材料的实际只读观察

`validateRecoveryMaterial` 原先只验证 JSON 计划结构与摘要引用，不能证明文件实际存在、权限可信、helper 内容完整或本地镜像身份正确。新增 `observeRecoveryCoreMaterials` 读取固定受保护目录 `CONTRACT.stateDirectory/maintenance-materials-<owner>`，不接受调用者传入的材料路径或内容。

目录内只有固定命名 PRE、恢复规程、helper manifest 与固定 helper 副本被读取。PRE 绑定 owner、目标/旧 floor SHA 和完整 runtime；规程按实际字节核摘要；manifest 绑定目标 SHA，其 canonical digest 等于 context sourceHelperSha256，且必须包含独立盘点的七个维护核心入口的23项本地文件闭包。每一项副本均核实际字节。此范围不声称覆盖未来尚未安装的 producer registry 或实际旧版本 installed guard。

文件读取复用 root/trusted paths/FD9 和 NOFOLLOW、0600、单硬链接、UID、inode、读取前后身份检查，增加1MiB单文件上限，并在全段末次重读后再核原始身份。同字节新 inode 替换同样拒绝。context、plan 和 signal 引用在操作间被改变时拒绝结果。

镜像只使用固定本地 Docker socket、完整 image ID 的 `image inspect`，无 pull、tag fallback 或容器启动。材料 `CANDIDATE_IMAGE.sha256` 在本观察契约中明确表示 `DOCKER_IMAGE_CONFIG_ID`，必须与 context/实际 image ID 的64位 hex一致；OCI revision 必须精确匹配目标。这不是 manifest digest、镜像层校验或可恢复性证明。

输出始终是 `CORE_MATERIALS_OBSERVED`，`recoveryReady=false`、`admissionOrApprovalGranted=false`、`registryInstalled=false`；保留旧guard闭包、未来producer闭包、独立operator授权、schema/floor兼容性、镜像层可恢复性、源码来源与外部进程监督为UNVERIFIED。本模块没有CLI、文件写入、生产执行或registry接线。

10秒窗口检查是合作式期限。同步文件系统/ACL/Docker调用可能阻塞当前线程；signal和Docker单命令超时不能替代外部进程监督与确认退出。未来正式producer必须由已有受控会话注册、监督和join子进程，不能将本观察函数直接当作已满足强制取消和恢复准入。

## 实际验证

Node20，本地12项全PASS/0SKIP，覆盖实际0600文件读取、缺项/篡改、symlink/hardlink/权限、helper遗漏/重复/额外/遍历、错误PRE、镜像ID/revision、不存在镜像、context/plan/signal变更、abort/超时、大文件和同字节原子替换。

真实自有scratch镜像实验无网络、无容器启动；绑定唯一owner与OCI标签，核准确ID后删除本实验镜像，确认owner镜像清单为空，生成0600收据。与transition/session/public control组合85PASS/0SKIP。独立代理复跑纯检查11PASS/1真实image可选SKIP，并确认文件身份竞态及signal建议已修复。官方CI新增串行真实材料实验与固定allowlist收据上传；其结果在PR精确HEAD另记，不继承本地PASS。

初版测试的固定时钟/错误分类断言失败分别保留；修正测试时间与物理size预检后重跑通过。测试只使用自有临时目录和镜像，没有生产连接或mutation。
