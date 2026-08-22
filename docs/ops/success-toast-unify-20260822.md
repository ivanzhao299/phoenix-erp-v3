# 保存刷新复测与成功提示统一（2026-08-22）

## 真因结论

结论：本次生产复测最合理的真因是**部署前已打开的浏览器标签页仍在运行旧客户端 bundle**，不是当前 main 仍有列表刷新竞态，也不是 nginx 向浏览器缓存了旧 HTML/JS。

证据链：

1. 当前 main（`c5bb3e9d` 已合并 `b991c7a9`）的鸡群保存顺序为 mutation 成功 → `await load()` → 关闭抽屉 → 成功提示。`load()` 完成 `setFlocks()` 后 promise 才结束，React 会在事件循环恢复控制后提交渲染；阻塞确认框并不可能让关闭后的列表重新变旧。
2. `useCrud.getRecords()` 使用 `LatestRequestRunner` 和 `cache: 'no-store'`。新列表请求会 abort 旧请求；旧 promise 即使晚完成也只会取得最新 generation 的结果，不能覆盖最新 `setFlocks()`。
3. PUT 在服务端数据库 `UPDATE ... RETURNING` 完成后才响应，保存后的 GET 不会先于写入完成。
4. `public/sw.js` 明确排除 `/_next/`，不会缓存客户端 JS chunk；导航采用 network-first，仅断网时才回退 runtime cache。SW 不会主动替换已打开页面内存中已经加载的旧 bundle。
5. 2026-08-22 生产只读检查：`/login` 由 Next 返回 `x-nextjs-cache: HIT`、`x-nextjs-stale-time: 300`、`cache-control: s-maxage=31536000`；nginx 配置没有 HTML proxy cache，也没有单独缓存 `/_next/`。客户端 chunk 使用内容哈希和 immutable 缓存，新 HTML 引用一批确定的 hash chunk。容器 revision 已由前序部署核实为 `c5bb3e9d`，因此“新容器 + 旧标签页内存 bundle”与现象完全吻合。

用户侧复核：在鸡群档案页执行完整刷新（Windows/Linux `Ctrl+Shift+R`，macOS `Cmd+Shift+R`），或关闭旧标签页后重新打开，再编辑存栏量。部署本报告版本后，还可在浏览器控制台查看 `[Phoenix ERP] build <commit SHA>`，直接确认当前页面运行的 bundle。

## 改造清单

- `useCrud`：创建/更新/删除成功改为 `toast.success`；提交、更新、删除失败改为 `toast.error`；空表单校验和业务阻断改为 `toast.warning`。删除决策继续保留 `showConfirm`。
- 鸡群档案：保存成功、删除失败、不可删除、日期校验全部改为非阻塞 toast；保存顺序固定为 `await load()` → 关抽屉 → `toast.success()`。`submitting` 在 mutation、刷新、关抽屉和 toast 调用完成后才复位；补齐底部“取消”按钮的提交中禁用，抽屉关闭按钮、遮罩、取消和重复提交入口现在均受保护。
- 养殖总览：存在鸡舍、无法验证子记录两个阻断提示改为 warning toast；解散确认保留确认框。
- 设备运维：同步、映射新建/编辑/删除及属性字典的成功/失败/校验提示全部改为对应 toast；删除映射确认保留确认框。
- 全站业务源码已无 `showAlert` 调用；DialogContext 暂保留兼容 API，所有需要用户作决定的危险操作仍使用 `showConfirm`。

## 版本可见性

- Web 镜像构建新增 `GIT_SHA` build arg，并在 Next 构建期注入 `NEXT_PUBLIC_BUILD_SHA`。
- 根 Providers 首次挂载时输出 `[Phoenix ERP] build <SHA>`。
- Next 生产构建的 console 清理规则明确保留 `info`（以及既有的 `warn/error`），避免版本日志被编译器移除。
- Web 镜像增加 `org.opencontainers.image.revision=<SHA>` label，便于部署主机只读核对镜像 revision。
- deploy workflow 将 `${{ github.sha }}` 传入镜像构建。选择 console 标识而非新增“关于”页面，以最小改动覆盖登录页和全部应用页面。

## 验证与部署

- Web Vitest：71 files / 402 tests passed。
- Web TypeScript：0 errors。
- Web production build：成功（231 个静态页面生成完成）。
- `node scripts/check-constraint-drift.js`：0 new drifts（1 条既有 allowlist）。
- API TypeScript：0 errors。
- scope audit：受影响页面的主数据字段裸 input / `onChange(e.target.value)` 特征为 0。
- CI / 生产 Web 部署 / 容器 revision：待合并部署后回填。
