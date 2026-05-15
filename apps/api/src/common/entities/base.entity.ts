import {
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

/**
 * 业务表通用基础实体
 * 严格落实 §11.2 规范，包含隔离字典、币种、状态机、审计等字段。
 */
export abstract class BaseBizEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: number;

  @Column({ type: 'varchar', length: 64, comment: '数据隔离字段（必填）' })
  store_code: string;

  @Column({ type: 'varchar', length: 64, comment: '创建机构（不可变，由 ORM 拦截器自动写入）' })
  created_store_code: string;

  @Column({ type: 'varchar', length: 32, default: 'DRAFT', comment: '单据状态（用于状态机锁）' })
  status: string;

  @Column({ type: 'bigint', nullable: true, comment: '创建人ID' })
  created_by: number;

  @Column({ type: 'bigint', nullable: true, comment: '最后修改人ID' })
  updated_by: number;

  @CreateDateColumn({ type: 'timestamp', comment: '创建时间' })
  created_at: Date;

  @UpdateDateColumn({ type: 'timestamp', comment: '更新时间' })
  updated_at: Date;

  @DeleteDateColumn({ type: 'timestamp', nullable: true, comment: '软删除时间戳（NULL 表示未删除）' })
  deleted_at: Date;
}
