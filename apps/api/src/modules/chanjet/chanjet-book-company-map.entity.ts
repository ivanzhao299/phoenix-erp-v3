import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';

/**
 * chanjet_book_company_map — 好业财账套 ↔ ERP 公司一一对应映射(单一真实源)
 *
 * 用户铁律:三家公司各对应一个账套,**禁止按名称自动匹配**。
 * 同步只允许 sync_enabled=true 的映射;DataScope 通过 company_code 起作用。
 */
@Entity('chanjet_book_company_map')
export class ChanjetBookCompanyMapEntity {
  @PrimaryColumn({ name: 'bookid', type: 'varchar', length: 64 })
  bookid: string;

  @Column({ name: 'book_name', type: 'varchar', length: 256 })
  bookName: string;

  @Column({ name: 'company_code', type: 'varchar', length: 64, unique: true })
  companyCode: string;

  @Column({ name: 'company_name', type: 'varchar', length: 256 })
  companyName: string;

  @Column({ name: 'sync_enabled', type: 'boolean', default: true })
  syncEnabled: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
