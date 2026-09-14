import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';
import { WmsStockBalanceEntity } from '../entities/wms-stock-balance.entity';
import { WmsStockLedgerEntity } from '../entities/wms-stock-ledger.entity';
import { ClsService } from 'nestjs-cls';
import { DataScopeContext } from '../../org/services/data-scope.service';

interface InventoryDelta {
  warehouse_code: string;
  location_code: string;
  spec_code: string;
  batch_no: string;
  qty: number;
  bill_no: string;
  biz_type: string;
}

/** Legacy balance provider retained for compatibility; current WmsService uses inv_batches. */
@Injectable()
export class InventoryService {
  constructor(
    @InjectEntityManager() private readonly em: EntityManager,
    private readonly cls: ClsService,
  ) {}

  private qualify(dto: InventoryDelta): { storeCode: string; operator: string } {
    const scope = this.cls.get<DataScopeContext | undefined>('dataScope');
    if (!scope || (!scope.isGlobal && !scope.allowedWarehouseCodes?.includes(dto.warehouse_code))) {
      throw new ForbiddenException('无权写入该库存（仓库范围不匹配）');
    }
    const storeCode = this.cls.get<string | undefined>('user.storeCode');
    if (!storeCode || !storeCode.trim()) throw new ForbiddenException('缺少明确机构归属');
    if (!Number.isSafeInteger(dto.qty) || dto.qty <= 0 || dto.qty > 2147483647) {
      throw new BadRequestException('数量必须是有效的正整数');
    }
    return { storeCode, operator: this.cls.get<string>('user.username') || 'SYSTEM' };
  }

  async atomicDecrement(dto: InventoryDelta, manager: EntityManager = this.em) {
    return this.apply(dto, -1, manager);
  }

  async atomicIncrement(dto: InventoryDelta, manager: EntityManager = this.em) {
    return this.apply(dto, 1, manager);
  }

  private async apply(dto: InventoryDelta, direction: 1 | -1, manager: EntityManager) {
    const { storeCode, operator } = this.qualify(dto);
    const write = async (em: EntityManager) => {
      // One transaction-level lock for this legacy provider also covers an absent
      // balance. It serializes unique-key creation and caller transactions touching
      // several batches in opposite orders. It trades parallel legacy throughput
      // for deterministic lock ordering; current inv_batches flows are unaffected.
      await em.query("SELECT pg_advisory_xact_lock(hashtextextended('WMS_LEGACY_BALANCE_WRITE', 0))");
      let balance = await em.findOne(WmsStockBalanceEntity, {
        where: { warehouse_code: dto.warehouse_code, location_code: dto.location_code,
          spec_code: dto.spec_code, batch_no: dto.batch_no },
        lock: { mode: 'pessimistic_write' },
      });
      if (!balance) {
        if (direction < 0) throw new BadRequestException('库存不存在');
        balance = em.create(WmsStockBalanceEntity, { warehouse_code: dto.warehouse_code,
          location_code: dto.location_code, spec_code: dto.spec_code, batch_no: dto.batch_no,
          qty: 0, locked_qty: 0, store_code: storeCode });
      }
      // NULL ownership is unknown, never an ALL/global match. Do not reinterpret
      // a nullable historical quantity as zero or repair it through a stock action.
      if (balance.store_code === null || balance.store_code !== storeCode) {
        throw new ForbiddenException('库存机构归属不匹配');
      }
      const qty = balance.qty, locked = balance.locked_qty;
      if (qty === null || locked === null || !Number.isSafeInteger(qty) || !Number.isSafeInteger(locked)
        || qty < 0 || locked < 0 || locked > qty) {
        throw new BadRequestException('库存数量未知或无效，禁止自动补值');
      }
      if (direction < 0 && qty - locked < dto.qty) throw new BadRequestException('可用库存不足');
      const next = qty + direction * dto.qty;
      if (!Number.isSafeInteger(next) || next < 0 || next > 2147483647) throw new BadRequestException('库存数量超出有效范围');
      balance.qty = next;
      await em.save(WmsStockBalanceEntity, balance); // VersionColumn increments; row lock supplies concurrency control.
      await em.save(WmsStockLedgerEntity, em.create(WmsStockLedgerEntity, {
        biz_type: dto.biz_type, bill_no: dto.bill_no, warehouse_code: dto.warehouse_code,
        location_code: dto.location_code, spec_code: dto.spec_code, batch_no: dto.batch_no,
        in_qty: direction > 0 ? dto.qty : 0, out_qty: direction < 0 ? dto.qty : 0,
        balance_qty: next, store_code: storeCode, operator,
      }));
      return balance;
    };
    // Caller-owned transaction must retain both balance and ledger until its own
    // commit/rollback. Never open an independent connection or commit it here.
    return manager.queryRunner?.isTransactionActive ? write(manager) : manager.transaction(write);
  }
}
