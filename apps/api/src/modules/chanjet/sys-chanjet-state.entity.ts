import { Entity, PrimaryColumn, Column, UpdateDateColumn } from 'typeorm';

/**
 * sys_chanjet_state — 畅捷通鉴权链状态持久化(单行表)
 *
 * 解决:容器重启时 chanjet appTicket/cert/token 内存丢失,对接断 ~10 min。
 * 设计:固定 key='singleton',永远只有一行;启动 load,变更 save。
 */
@Entity('sys_chanjet_state')
export class SysChanjetStateEntity {
  @PrimaryColumn({ type: 'varchar', length: 16, default: 'singleton' })
  key: string;

  /** 平台推送的应用票据(每 ~10 min 刷新) */
  @Column({ name: 'app_ticket', type: 'text', nullable: true })
  appTicket: string | null;

  /** 控制台"更新授权"复制的软证书(长期有效) */
  @Column({ name: 'certificate', type: 'text', nullable: true })
  certificate: string | null;

  /** openToken 缓存,按 orgId 分账:{ orgId: { openToken, expiresAt } } */
  @Column({ name: 'tokens', type: 'jsonb', nullable: true })
  tokens: Record<string, { openToken: string; expiresAt: number }> | null;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
