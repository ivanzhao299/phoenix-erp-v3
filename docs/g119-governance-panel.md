# G119 治理面板（治理③）2026-06-15

> 补齐角色治理的"看得见、查得到、管得住"。基于现有矩阵全景 + SoD 检测扩展。

## 现状盘点
- 角色页**已有**：权限矩阵全景（角色×菜单，只读）、编辑单角色权限时的实时 SoD 冲突检测。
- 缺口：① 反查"谁能干 X" ② 给用户配**多角色组合**时的 SoD 授权前拦截（原仅在编辑单角色时查）。

## 本阶段交付

**后端**（`permissions.service` + `permissions.controller`）
- `GET /api/permissions/who-can?menu=&perm=` 反查：有该菜单该操作权的 角色（直绑/权限集）+ 在岗用户。
  （近似口径：含权限集来源，未扣除 deny 覆盖，用于治理可视。）
- `POST /api/permissions/check-role-combo` { role_codes } 角色组合 SoD 校验：
  取各角色"写权限菜单(C/E/D/A)"并集，命中岗位分离红线则返回冲突 + 各侧贡献角色。

**前端**
- 角色页：新增「谁能干X」反查模态（选菜单+操作 → 列出有权角色与用户）。
- 用户编辑器（`settings/users/[id]`）：保存角色前调 check-role-combo —
  BLOCK 级冲突**硬阻止**保存；WARN 级**二次确认**。补上"给用户配多角色"这一授权入口的红线。

## 验证
- API tsc 0 error；Web tsc 0 error。
- 本地冒烟：who-can(MENU_PRC2_PAYMENT, A) 反查到王乐金（经采购审批权限集）。

## 治理三件套（G117-G119）至此完成
- G117 角色生命周期（status 软停用/隐藏）
- G118 权限集 PBAC 两层模型（能力集组合 + 管理 UI）
- G119 治理面板（反查 + 组合 SoD 拦截 + 既有矩阵全景）
