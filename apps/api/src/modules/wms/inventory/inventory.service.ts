import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager, OptimisticLockVersionMismatchError } from 'typeorm';
import { WmsStockBalanceEntity } from '../entities/wms-stock-balance.entity';
import { WmsStockLedgerEntity } from '../entities/wms-stock-ledger.entity';
import { ClsService } from 'nestjs-cls';

@Injectable()
export class InventoryService {
  constructor(
    @InjectEntityManager() private readonly em: EntityManager,
    private readonly cls: ClsService,
  ) {}

  /**
   * 乐观锁扣减库存
   * @param dto 扣减参数
   */
  async atomicDecrement(dto: {
    warehouse_code: string;
    location_code: string;
    spec_code: string;
    batch_no: string;
    qty: number;
    bill_no: string;
    biz_type: string;
  }) {
    if (dto.qty <= 0) throw new BadRequestException('扣减数量必须大于0');
    const storeCode = this.cls.get('user.storeCode') || 'ALL';
    const operator = this.cls.get('user.username') || 'SYSTEM';

    return await this.em.transaction(async (manager) => {
      // 1. 查询当前库存并带着 version 字段
      const balance = await manager.findOne(WmsStockBalanceEntity, {
        where: {
          warehouse_code: dto.warehouse_code,
          location_code: dto.location_code,
          spec_code: dto.spec_code,
          batch_no: dto.batch_no,
          store_code: storeCode,
        },
      });

      if (!balance) {
        throw new BadRequestException('库存不存在');
      }

      const availableQty = balance.qty - balance.locked_qty;
      if (availableQty < dto.qty) {
        throw new BadRequestException(`可用库存不足。当前可用: ${availableQty}, 需求: ${dto.qty}`);
      }

      const preQty = balance.qty;
      balance.qty -= dto.qty;

      try {
        // 2. 触发带有 Version 的乐观锁保存
        // 如果在此期间被其他事务修改过，TypeORM 会由于版本号不匹配抛出 OptimisticLockVersionMismatchError
        await manager.save(WmsStockBalanceEntity, balance);
      } catch (err) {
        if (err instanceof OptimisticLockVersionMismatchError) {
          throw new BadRequestException('库存数据已被他人修改，请刷新并重试 (乐观锁拦截)');
        }
        throw err;
      }

      // 3. 记录台账 Ledger
      const ledger = new WmsStockLedgerEntity();
      ledger.biz_type = dto.biz_type;
      ledger.bill_no = dto.bill_no;
      ledger.warehouse_code = dto.warehouse_code;
      ledger.location_code = dto.location_code;
      ledger.spec_code = dto.spec_code;
      ledger.batch_no = dto.batch_no;
      ledger.in_qty = 0;
      ledger.out_qty = dto.qty;
      ledger.balance_qty = balance.qty;
      ledger.store_code = storeCode;
      ledger.operator = operator;
      await manager.save(WmsStockLedgerEntity, ledger);

      return balance;
    });
  }

  /**
   * 乐观锁增加库存
   */
  async atomicIncrement(dto: {
    warehouse_code: string;
    location_code: string;
    spec_code: string;
    batch_no: string;
    qty: number;
    bill_no: string;
    biz_type: string;
  }) {
    if (dto.qty <= 0) throw new BadRequestException('入库数量必须大于0');
    const storeCode = this.cls.get('user.storeCode') || 'ALL';
    const operator = this.cls.get('user.username') || 'SYSTEM';

    return await this.em.transaction(async (manager) => {
      let balance = await manager.findOne(WmsStockBalanceEntity, {
        where: {
          warehouse_code: dto.warehouse_code,
          location_code: dto.location_code,
          spec_code: dto.spec_code,
          batch_no: dto.batch_no,
          store_code: storeCode,
        },
      });

      if (!balance) {
        // 第一次入库，新增记录
        balance = new WmsStockBalanceEntity();
        balance.warehouse_code = dto.warehouse_code;
        balance.location_code = dto.location_code;
        balance.spec_code = dto.spec_code;
        balance.batch_no = dto.batch_no;
        balance.qty = dto.qty;
        balance.locked_qty = 0;
        balance.store_code = storeCode;
      } else {
        // 累加
        balance.qty += dto.qty;
      }

      try {
        await manager.save(WmsStockBalanceEntity, balance);
      } catch (err) {
        if (err instanceof OptimisticLockVersionMismatchError) {
          throw new BadRequestException('库存数据已被他人修改，请刷新并重试 (乐观锁拦截)');
        }
        throw err;
      }

      // 记录台账
      const ledger = new WmsStockLedgerEntity();
      ledger.biz_type = dto.biz_type;
      ledger.bill_no = dto.bill_no;
      ledger.warehouse_code = dto.warehouse_code;
      ledger.location_code = dto.location_code;
      ledger.spec_code = dto.spec_code;
      ledger.batch_no = dto.batch_no;
      ledger.in_qty = dto.qty;
      ledger.out_qty = 0;
      ledger.balance_qty = balance.qty;
      ledger.store_code = storeCode;
      ledger.operator = operator;
      await manager.save(WmsStockLedgerEntity, ledger);

      return balance;
    });
  }
}
