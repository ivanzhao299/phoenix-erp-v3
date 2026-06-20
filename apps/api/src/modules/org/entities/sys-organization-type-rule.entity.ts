import { Entity, PrimaryColumn, Column } from 'typeorm';

/**
 * W4 — sys_organizations.org_type 不变量配置
 * ════════════════════════════════════════════════════════════════════════
 * 每行声明一种 org_type 的命名前缀、必填列、上下级允许类型。
 * service 接入推迟到 W5+(create/update 软警告) → W6+(硬校验)。
 *
 * 本 wave 仅做 entity 声明 + DB 表存在,无 service 消费(等 W5+)。
 * DB ↔ entity 对齐:由同 PR 的 migration W4MasterDataFoundation1782000000000 保证。
 *
 * 参考:
 *   - docs/MASTER_DATA_W4_EXECUTION_PLAN.md §2
 *   - docs/MASTER_DATA_PHASE2_DESIGN.md §1.2 不变量 I-1 ~ I-9
 */
@Entity('sys_organization_type_rules')
export class SysOrganizationTypeRuleEntity {
  @PrimaryColumn({ name: 'org_type', type: 'varchar', length: 32 })
  orgType!: string;

  @Column({ name: 'label_zh', type: 'varchar', length: 64 })
  labelZh!: string;

  @Column({ name: 'code_prefix_regex', type: 'varchar', length: 128 })
  codePrefixRegex!: string;

  @Column({
    name: 'required_fields',
    type: 'text',
    array: true,
    default: () => "ARRAY[]::TEXT[]",
  })
  requiredFields!: string[];

  @Column({
    name: 'allowed_parent_types',
    type: 'text',
    array: true,
    default: () => "ARRAY[]::TEXT[]",
  })
  allowedParentTypes!: string[];

  @Column({
    name: 'allowed_child_types',
    type: 'text',
    array: true,
    default: () => "ARRAY[]::TEXT[]",
  })
  allowedChildTypes!: string[];

  @Column({ name: 'notes', type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'status', type: 'varchar', length: 16, default: 'ACTIVE' })
  status!: string;

  @Column({ name: 'created_at', type: 'timestamptz', default: () => 'now()' })
  createdAt!: Date;

  @Column({ name: 'updated_at', type: 'timestamptz', default: () => 'now()' })
  updatedAt!: Date;
}
