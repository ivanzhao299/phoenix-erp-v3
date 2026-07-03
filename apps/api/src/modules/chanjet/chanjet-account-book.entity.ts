import {
  Entity, Column, PrimaryColumn, CreateDateColumn, UpdateDateColumn, Index,
} from 'typeorm';

/**
 * chanjet_account_books — 好业财账套缓存。
 *
 * 来源: 只读调用好业财账套列表接口后落 ERP 中间层，供映射、探针和审计使用。
 * 不作为 ERP 公司主数据真实源；公司真实源仍是 sys_organizations / chanjet_book_company_map。
 */
@Entity('chanjet_account_books')
@Index('idx_chanjet_account_books_company', ['companyCode'])
@Index('idx_chanjet_account_books_enabled', ['enabled'])
export class ChanjetAccountBookEntity {
  @PrimaryColumn({ name: 'book_id', type: 'varchar', length: 64 })
  bookId: string;

  @Column({ name: 'book_name', type: 'varchar', length: 256 })
  bookName: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64, nullable: true })
  companyCode: string | null;

  @Column({ name: 'company_name', type: 'varchar', length: 256, nullable: true })
  companyName: string | null;

  @Column({ name: 'enabled', type: 'boolean', default: false })
  enabled: boolean;

  @Column({ name: 'raw_data', type: 'jsonb', nullable: true })
  rawData: Record<string, unknown> | null;

  @Column({ name: 'last_probe_at', type: 'timestamptz', nullable: true })
  lastProbeAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
