# G202 只读运行审计材料传输修复

## 事实与因果边界

运行43147612287及重试在审计 SSH action 步骤失败，日志没有远程 `AUDIT_STAGE`、没有数据库执行证据，GitHub仅给出通用exit1。不能据此断言已证明SSH握手之前的某个具体runner错误。

先前将拼接内容误称为单项 `INPUT_ENVS` 超限，现予纠正：[ssh-action v1](https://github.com/appleboy/ssh-action/blob/v1/action.yml) 将 inputs.envs 原样传为变量名列表；本项目输入的是名单，不是145KB内容。真正需要限制的是导出各变量值后拼成的远程命令。完整旧公开材料加脚本超过Linux单项命令参数131072字节；按相同export序列化的本地执行真实返回E2BIG。把旧值分别放入环境、INPUT_ENVS只放变量名，则可执行成功。这个复现证明了具体尺寸边界风险，与生产审计未进入远程脚本的现象一致，但不是缺少GHA细节情况下的伪造精确根因结论。

## 最小改造

不再把整个恢复tgz通过audit action环境传输。runner生成带精确target SHA的固定import-closure清单、各文件SHA256与清单哈希；传输小型、单独hash校验的内置依赖暂存器。生产端保留root/trusted-path/FD9入口，精确fetch已审SHA但不移动checkout，暂存器只以safe.directory Git读取对象，逐个核对类型/哈希，输出到新的root-only审计stage。

固定闭包由一个只依赖Node内置模块的常量共享；缺失/额外/重复成员、未知JSON字段、错误target或closure哈希、非commit、Git symlink/submodule、路径逃逸、符号链接目录/清单、已有输出均拒绝。写入用wx、0600；先验证所有成员再写入任何成员。不得写入生产checkout。原审计程序与SQL的SHA校验、installed guard、OCI/runtime、floor、policy和正式证据语义不变；不启用sync、不写业务数据、不创建API令牌。

## 真正执行过的验证

Node20运行65项审计/SSH/模式/bundle相关测试全部通过，无跳过。新增测试不是仅正则匹配或直接调用一个手写替代算法：

- 提取实际workflow中的Bind shell，在临时Git仓库内执行，得到真实B64与hash。
- 提取实际远程stage shell，用本地origin的同一精确commit执行，真正运行ESM CLI，并核对整个固定闭包的文件字节/hash和0600模式；原checkout HEAD/工作区保持不变。
- 编码字符串与解码字节哈希口径错误会使实际shell失败，helper哈希漂移同样失败；测试覆盖此前review发现但旧静态测试漏过的问题。
- 缺成员/重复/path/target/hash/source mode等拒绝；任何成员写入前完成验证。
- 真实旧命令E2BIG、新完整材料+脚本小于100KB，保留头部空间；单独环境变量的反证防止再次误称INPUT_ENVS超限。

进一步执行与发布CI相同的完整floor/environment/recovery契约：342通过、0失败，9项按原环境gate跳过。CI发现的两个旧测试仍查找已移除的audit tar字符串，已改为读取实际recovery精确SHA Git暂存清单，保留完整闭包/隔离导入断言。另在本机0077 umask下实证Nginx fixture目录0700/marker0600对非root worker不可见；同容器/端口显式设置公开非秘密控制投影0755/0644后，43个POST全部503、白名单GET仍204。仅修fixture权限/可见性预检和路径诊断，未改生产Nginx或放宽断言。

该真实暂存/边界测试加入Node20静态CI门禁；本地成功不替代新提交的CI与后续真实生产只读审计。修复合并前不得宣称当前OCI/floor已通过审计，更不得以HTTP200代替正式运行证据。
