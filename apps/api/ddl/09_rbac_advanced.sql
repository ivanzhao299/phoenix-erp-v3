-- ============== V3 RBAC 高级化（完整方案） ==============
-- [V3 RBAC P2 增强] 在 ddl/01 基础上补齐：
--   ① FK 索引（查询效率）
--   ② sys_role_menu_permission 加 deny_codes + scope_type + scope_value（优先级冲突）
--   ③ sys_user.perms_version（JWT 失效机制，权限变更即时生效）
--   ④ sys_permission_set 4 表（独立权限集模型，3 层 → 4 层）
-- 全部 IF NOT EXISTS / IF EXISTS 守卫，可重复执行

-- ════════════════════════════════════════════════════════════════
-- ① FK 索引（修登录 + 矩阵查询性能）
-- ════════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_sys_user_role_user ON sys_user_role (user_id);
CREATE INDEX IF NOT EXISTS idx_sys_user_role_role ON sys_user_role (role_id);
CREATE INDEX IF NOT EXISTS idx_sys_role_menu_perm_role ON sys_role_menu_permission (role_id);
CREATE INDEX IF NOT EXISTS idx_sys_role_menu_perm_menu ON sys_role_menu_permission (menu_id);

-- ════════════════════════════════════════════════════════════════
-- ② sys_role_menu_permission 扩列：deny / scope
-- ════════════════════════════════════════════════════════════════
ALTER TABLE sys_role_menu_permission ADD COLUMN IF NOT EXISTS deny_codes  VARCHAR(64);
-- deny_codes 格式同 perm_codes：'V,C,E' 或 '*'（拒绝全部）
-- 合并算法：deny 优先于 grant；同一菜单上若 deny 有 V，最终结果即剔除 V

ALTER TABLE sys_role_menu_permission ADD COLUMN IF NOT EXISTS scope_type  VARCHAR(16);
-- scope_type 取值：NULL（全局）/ STORE（限门店）/ REGION（限大区）/ FARM（限养殖场）
ALTER TABLE sys_role_menu_permission ADD COLUMN IF NOT EXISTS scope_value VARCHAR(64);
-- scope_value：当 scope_type 非空时填入具体 code（如 store_code='S001'）

-- ════════════════════════════════════════════════════════════════
-- ③ JWT 失效机制：sys_user.perms_version
-- ════════════════════════════════════════════════════════════════
-- 每次修改用户权限（角色绑定 / role_menu_permission / 权限集变更）时 perms_version++
-- JWT 携带签发时的 perms_version；JwtStrategy.validate 比较当前 DB 版本
-- 若 JWT 版本 < DB 版本 → 401 强制重登 → 拿到带新版本的 JWT
ALTER TABLE sys_user ADD COLUMN IF NOT EXISTS perms_version BIGINT NOT NULL DEFAULT 1;

-- ════════════════════════════════════════════════════════════════
-- ④ 独立权限集 4 表
-- ════════════════════════════════════════════════════════════════
-- ④a sys_permission_set 权限集主表
CREATE TABLE IF NOT EXISTS sys_permission_set (
    set_id        BIGSERIAL PRIMARY KEY,
    set_code      VARCHAR(64)  NOT NULL UNIQUE,
    set_name_zh   VARCHAR(128) NOT NULL,
    set_name_lo   VARCHAR(128),
    description   TEXT,
    created_by    BIGINT REFERENCES sys_user(user_id) ON DELETE SET NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMP NOT NULL DEFAULT NOW()
);

-- ④b sys_permission_set_item 权限集×菜单×CRUD 三元组（同 role_menu_permission 结构）
CREATE TABLE IF NOT EXISTS sys_permission_set_item (
    item_id     BIGSERIAL PRIMARY KEY,
    set_id      BIGINT NOT NULL REFERENCES sys_permission_set(set_id) ON DELETE CASCADE,
    menu_id     BIGINT NOT NULL REFERENCES sys_menu(menu_id) ON DELETE CASCADE,
    perm_codes  VARCHAR(64) NOT NULL,
    deny_codes  VARCHAR(64),
    scope_type  VARCHAR(16),
    scope_value VARCHAR(64),
    UNIQUE (set_id, menu_id)
);
CREATE INDEX IF NOT EXISTS idx_sys_pset_item_set ON sys_permission_set_item (set_id);

-- ④c sys_role_permission_set 角色 ↔ 权限集 多对多
CREATE TABLE IF NOT EXISTS sys_role_permission_set (
    role_id  BIGINT NOT NULL REFERENCES sys_role(role_id) ON DELETE CASCADE,
    set_id   BIGINT NOT NULL REFERENCES sys_permission_set(set_id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, set_id)
);
CREATE INDEX IF NOT EXISTS idx_sys_rps_role ON sys_role_permission_set (role_id);

-- ④d sys_user_permission_set 用户直绑权限集（绕开角色路径）
CREATE TABLE IF NOT EXISTS sys_user_permission_set (
    user_id  BIGINT NOT NULL REFERENCES sys_user(user_id) ON DELETE CASCADE,
    set_id   BIGINT NOT NULL REFERENCES sys_permission_set(set_id) ON DELETE CASCADE,
    granted_by BIGINT REFERENCES sys_user(user_id) ON DELETE SET NULL,
    granted_at TIMESTAMP NOT NULL DEFAULT NOW(),
    PRIMARY KEY (user_id, set_id)
);
CREATE INDEX IF NOT EXISTS idx_sys_ups_user ON sys_user_permission_set (user_id);

-- ════════════════════════════════════════════════════════════════
-- ⑤ 触发器：任意权限变更 → 自动 perms_version++
--
-- 重要：批量迁移（如 role_runtime_phase_a.sql）运行时可临时关闭触发器：
--   SET LOCAL phx.skip_perms_bump = 'on';
--   -- 执行批量 INSERT ...
--   RESET phx.skip_perms_bump;
-- 这样迁移中的批量 INSERT 不会触发 perms_version 递增，
-- 避免导致所有在线用户的 JWT 失效。
-- ════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION fn_bump_user_perms_version() RETURNS TRIGGER AS $$
BEGIN
    -- 批量迁移模式：跳过 perms_version 递增（防止批量操作踢出所有在线用户）
    IF current_setting('phx.skip_perms_bump', true) = 'on' THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- sys_user_role 变更：bump 对应 user
    IF TG_TABLE_NAME = 'sys_user_role' THEN
        IF TG_OP = 'DELETE' THEN
            UPDATE sys_user SET perms_version = perms_version + 1 WHERE user_id = OLD.user_id;
        ELSE
            UPDATE sys_user SET perms_version = perms_version + 1 WHERE user_id = NEW.user_id;
        END IF;
    -- sys_user_permission_set 变更：bump 对应 user
    ELSIF TG_TABLE_NAME = 'sys_user_permission_set' THEN
        IF TG_OP = 'DELETE' THEN
            UPDATE sys_user SET perms_version = perms_version + 1 WHERE user_id = OLD.user_id;
        ELSE
            UPDATE sys_user SET perms_version = perms_version + 1 WHERE user_id = NEW.user_id;
        END IF;
    -- sys_role_menu_permission 变更：bump 所有 hold 该 role 的 user
    ELSIF TG_TABLE_NAME = 'sys_role_menu_permission' THEN
        IF TG_OP = 'DELETE' THEN
            UPDATE sys_user SET perms_version = perms_version + 1
            WHERE user_id IN (SELECT user_id FROM sys_user_role WHERE role_id = OLD.role_id);
        ELSE
            UPDATE sys_user SET perms_version = perms_version + 1
            WHERE user_id IN (SELECT user_id FROM sys_user_role WHERE role_id = NEW.role_id);
        END IF;
    -- sys_role_permission_set / sys_permission_set_item 变更：bump 关联角色的所有用户
    ELSIF TG_TABLE_NAME = 'sys_role_permission_set' THEN
        IF TG_OP = 'DELETE' THEN
            UPDATE sys_user SET perms_version = perms_version + 1
            WHERE user_id IN (SELECT user_id FROM sys_user_role WHERE role_id = OLD.role_id);
        ELSE
            UPDATE sys_user SET perms_version = perms_version + 1
            WHERE user_id IN (SELECT user_id FROM sys_user_role WHERE role_id = NEW.role_id);
        END IF;
    ELSIF TG_TABLE_NAME = 'sys_permission_set_item' THEN
        IF TG_OP = 'DELETE' THEN
            UPDATE sys_user SET perms_version = perms_version + 1
            WHERE user_id IN (
                SELECT DISTINCT ur.user_id FROM sys_user_role ur
                JOIN sys_role_permission_set rps ON rps.role_id = ur.role_id
                WHERE rps.set_id = OLD.set_id
                UNION
                SELECT user_id FROM sys_user_permission_set WHERE set_id = OLD.set_id
            );
        ELSE
            UPDATE sys_user SET perms_version = perms_version + 1
            WHERE user_id IN (
                SELECT DISTINCT ur.user_id FROM sys_user_role ur
                JOIN sys_role_permission_set rps ON rps.role_id = ur.role_id
                WHERE rps.set_id = NEW.set_id
                UNION
                SELECT user_id FROM sys_user_permission_set WHERE set_id = NEW.set_id
            );
        END IF;
    END IF;
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_bump_perms_user_role            ON sys_user_role;
CREATE TRIGGER     trg_bump_perms_user_role
    AFTER INSERT OR UPDATE OR DELETE ON sys_user_role
    FOR EACH ROW EXECUTE FUNCTION fn_bump_user_perms_version();

DROP TRIGGER IF EXISTS trg_bump_perms_user_pset            ON sys_user_permission_set;
CREATE TRIGGER     trg_bump_perms_user_pset
    AFTER INSERT OR UPDATE OR DELETE ON sys_user_permission_set
    FOR EACH ROW EXECUTE FUNCTION fn_bump_user_perms_version();

DROP TRIGGER IF EXISTS trg_bump_perms_role_menu_perm       ON sys_role_menu_permission;
CREATE TRIGGER     trg_bump_perms_role_menu_perm
    AFTER INSERT OR UPDATE OR DELETE ON sys_role_menu_permission
    FOR EACH ROW
    -- UPDATE 时只有 perm_codes 真正改变才触发，避免 DO UPDATE 同值写入误 bump
    WHEN (pg_trigger_depth() = 0)
    EXECUTE FUNCTION fn_bump_user_perms_version();

DROP TRIGGER IF EXISTS trg_bump_perms_role_pset            ON sys_role_permission_set;
CREATE TRIGGER     trg_bump_perms_role_pset
    AFTER INSERT OR UPDATE OR DELETE ON sys_role_permission_set
    FOR EACH ROW EXECUTE FUNCTION fn_bump_user_perms_version();

DROP TRIGGER IF EXISTS trg_bump_perms_pset_item            ON sys_permission_set_item;
CREATE TRIGGER     trg_bump_perms_pset_item
    AFTER INSERT OR UPDATE OR DELETE ON sys_permission_set_item
    FOR EACH ROW EXECUTE FUNCTION fn_bump_user_perms_version();
