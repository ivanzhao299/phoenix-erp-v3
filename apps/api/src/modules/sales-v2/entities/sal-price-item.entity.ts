import {
  Entity, Column, Index, ManyToOne, JoinColumn, PrimaryGeneratedColumn, CreateDateColumn,
} from 'typeorm';
import { SalPriceBookEntity } from './sal-price-book.entity';

/**
 * 价格明细  sal_price_items
 *
 * Sales V2 Phase 2 — Price Runtime
 *
 * grade_code:     0/1/2/3/4/5/DIRTY/BROKEN（NULL=不限品级）
 * packaging_spec: LOOSE/30_PCS_TRAY/360_PCS_CASE（NULL=不限规格）
 * floor_price:    底价（低于此须走 Workflow 价格审批）
 * status:         ACTIVE / DISABLED
 */
@Entity('sal_price_items')
@Index('idx_sal_price_items_book', ['priceBookId'])
@Index('idx_sal_price_items_book_prod', ['priceBookId', 'productCode'])
@Index('idx_sal_price_items_grade', ['gradeCode', 'packagingSpec'])
// idx_sal_price_items_sku_code / grade_code_std / spec_code 跳过:
// entity 缺 sku_code/grade_code_std/spec_code 列(g197 真业务漂移)
export class SalPriceItemEntity {
  @PrimaryGeneratedColumn('increment', { type: 'bigint' })
  id: string;

  @Column({ name: 'price_book_id', type: 'bigint' })
  priceBookId: string;

  @ManyToOne(() => SalPriceBookEntity)
  @JoinColumn({ name: 'price_book_id', referencedColumnName: 'id', foreignKeyConstraintName: 'sal_price_items_price_book_id_fkey' })
  priceBook?: SalPriceBookEntity;

  @Column({ name: 'product_code', type: 'varchar', length: 64 })
  productCode: string;

  @Column({ name: 'grade_code', type: 'varchar', length: 16, nullable: true })
  gradeCode: string | null;

  @Column({ name: 'packaging_spec', type: 'varchar', length: 64, nullable: true })
  packagingSpec: string | null;

  @Column({ name: 'unit_price', type: 'numeric', precision: 18, scale: 2 })
  unitPrice: number;

  @Column({ name: 'floor_price', type: 'numeric', precision: 18, scale: 2, nullable: true })
  floorPrice: number | null;

  @Column({ name: 'ceiling_price', type: 'numeric', precision: 18, scale: 2, nullable: true })
  ceilingPrice: number | null;

  @Column({ name: 'min_qty', type: 'numeric', precision: 18, scale: 2, nullable: true })
  minQty: number | null;

  @Column({ name: 'max_qty', type: 'numeric', precision: 18, scale: 2, nullable: true })
  maxQty: number | null;

  @Column({ name: 'currency_code', type: 'varchar', length: 8, default: 'LAK' })
  currencyCode: string;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'ACTIVE' })
  status: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
