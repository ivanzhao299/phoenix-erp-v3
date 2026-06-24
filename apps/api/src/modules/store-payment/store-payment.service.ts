import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { ClsService } from 'nestjs-cls';
import { DataSource, EntityManager, Repository, SelectQueryBuilder } from 'typeorm';
import { SysOperationLogEntity } from '../../common/entities/sys-operation-log.entity';
import { FileAccessService, ProtectedFileMode } from '../file/file-access.service';
import { DataScopeContext } from '../org/services/data-scope.service';
import {
  ConfirmStorePaymentRecordDto,
  CreateStorePaymentAccountDto,
  CreateStorePaymentRecordDto,
  QueryStorePaymentAccountDto,
  QueryStorePaymentRecordDto,
  RejectStorePaymentRecordDto,
  UpdateStorePaymentAccountDto,
  VoidStorePaymentRecordDto,
} from './dto/store-payment.dto';
import { StorePaymentAccountEntity } from './entities/store-payment-account.entity';
import { StorePaymentRecordEntity } from './entities/store-payment-record.entity';

type StorePaymentRecordStatus = 'PENDING' | 'CONFIRMED' | 'REJECTED' | 'VOIDED';
interface RequestUser {
  userId?: string | number;
  id?: string | number;
  username?: string;
  name?: string;
  realNameZh?: string;
  role?: string;
  roles?: string[];
  permissions?: string[];
  storeCode?: string;
}

const FINANCE_ROLES = new Set(['ROLE_FIN_ACCT', 'ROLE_FIN_CFO', 'ROLE_GROUP_FINANCE', 'ROLE_HQ_FINANCE']);
const MANAGER_ROLES = new Set(['ROLE_STORE_MGR']);
const CLERK_ROLES = new Set(['ROLE_CASHIER']);
const STORE_CODE_ALIASES: Record<string, string[]> = {
  'STORE-VTE-001': ['ST-VTE-001'],
};
const STORE_CODE_CANONICAL: Record<string, string> = Object.fromEntries(
  Object.entries(STORE_CODE_ALIASES).flatMap(([canonical, aliases]) => [
    [canonical, canonical],
    ...aliases.map((alias) => [alias, canonical] as const),
  ]),
);

@Injectable()
export class StorePaymentService {
  constructor(
    @InjectRepository(StorePaymentAccountEntity)
    private readonly accountRepo: Repository<StorePaymentAccountEntity>,
    @InjectRepository(StorePaymentRecordEntity)
    private readonly recordRepo: Repository<StorePaymentRecordEntity>,
    @InjectRepository(SysOperationLogEntity)
    private readonly operationLogRepo: Repository<SysOperationLogEntity>,
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly cls: ClsService,
    private readonly fileAccessService: FileAccessService,
  ) {}

  async listAccounts(query: QueryStorePaymentAccountDto) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const qb = this.accountRepo.createQueryBuilder('a').orderBy('a.id', 'DESC');

    qb.andWhere('a.deletedAt IS NULL');
    if (query.companyCode) qb.andWhere('a.companyCode = :companyCode', { companyCode: query.companyCode });
    if (query.storeCode) {
      qb.andWhere('a.storeCode IN (:...queryStoreCodes)', {
        queryStoreCodes: this.expandStoreCodeAliases(query.storeCode),
      });
    }
    if (query.currency) qb.andWhere('a.currency = :currency', { currency: query.currency });
    if (query.paymentMethod) qb.andWhere('a.paymentMethod = :paymentMethod', { paymentMethod: query.paymentMethod });
    if (query.status) qb.andWhere('a.status = :status', { status: query.status });
    if (query.keyword) {
      qb.andWhere('(a.accountCode ILIKE :kw OR a.accountName ILIKE :kw)', { kw: `%${query.keyword}%` });
    }

    this.applyAccountScope(qb);
    const [items, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();

    return {
      items: items.map((item) => this.toAccountResponse(item)),
      total,
      page,
      pageSize,
    };
  }

  async createAccount(dto: CreateStorePaymentAccountDto) {
    this.assertAccountMaintainer();
    this.assertProtectedAttachmentRef(dto.qrAttachmentId, 'STORE_PAYMENT_QR_ATTACHMENT_INVALID', false);
    const storeCode = this.canonicalStoreCode(dto.storeCode);

    return this.dataSource.transaction(async (manager) => {
      const exists = await manager.findOne(StorePaymentAccountEntity, {
        where: {
          companyCode: dto.companyCode,
          storeCode,
          accountCode: dto.accountCode,
        },
      });
      if (exists) throw new ConflictException('STORE_PAYMENT_ACCOUNT_DUPLICATED');

      const account = manager.create(StorePaymentAccountEntity, {
        accountCode: dto.accountCode,
        accountName: dto.accountName,
        companyCode: dto.companyCode,
        storeCode,
        finCashAccountId: this.blankToNull(dto.finCashAccountId),
        currency: dto.currency,
        paymentMethod: dto.paymentMethod,
        qrAttachmentId: this.blankToNull(dto.qrAttachmentId),
        status: dto.status ?? 'ACTIVE',
        isActive: dto.isActive ?? true,
        remark: this.blankToNull(dto.remark),
        createdBy: this.username(),
        updatedBy: this.username(),
      });

      const saved = await manager.save(StorePaymentAccountEntity, account);
      await this.writeAudit(manager, {
        moduleCode: 'MENU_STORE_PAYMENT_ACCOUNT',
        actionCode: 'CREATE',
        bizType: 'STORE_PAYMENT_ACCOUNT',
        bizId: saved.id,
        bizNo: saved.accountCode,
        requestPath: '/store-payment/accounts',
        afterData: this.redactAccountForAudit(saved),
      });
      return this.toAccountResponse(saved);
    });
  }

  async updateAccount(id: string, dto: UpdateStorePaymentAccountDto) {
    this.assertAccountMaintainer();
    this.assertProtectedAttachmentRef(dto.qrAttachmentId, 'STORE_PAYMENT_QR_ATTACHMENT_INVALID', false);

    return this.dataSource.transaction(async (manager) => {
      const account = await manager.findOne(StorePaymentAccountEntity, { where: { id } });
      if (!account) throw new NotFoundException('STORE_PAYMENT_ACCOUNT_NOT_FOUND');
      const before = this.redactAccountForAudit(account);

      if (dto.accountName !== undefined) account.accountName = dto.accountName;
      if (dto.finCashAccountId !== undefined) account.finCashAccountId = this.blankToNull(dto.finCashAccountId);
      if (dto.currency !== undefined) account.currency = dto.currency;
      if (dto.paymentMethod !== undefined) account.paymentMethod = dto.paymentMethod;
      if (dto.qrAttachmentId !== undefined) account.qrAttachmentId = this.blankToNull(dto.qrAttachmentId);
      if (dto.status !== undefined) account.status = dto.status;
      if (dto.isActive !== undefined) account.isActive = dto.isActive;
      if (dto.remark !== undefined) account.remark = this.blankToNull(dto.remark);
      account.updatedBy = this.username();

      const saved = await manager.save(StorePaymentAccountEntity, account);
      const actionCode = saved.status === 'DISABLED' || !saved.isActive ? 'DISABLE' : 'MODIFY';
      await this.writeAudit(manager, {
        moduleCode: 'MENU_STORE_PAYMENT_ACCOUNT',
        actionCode,
        bizType: 'STORE_PAYMENT_ACCOUNT',
        bizId: saved.id,
        bizNo: saved.accountCode,
        requestPath: `/store-payment/accounts/${id}`,
        beforeData: before,
        afterData: this.redactAccountForAudit(saved),
      });
      return this.toAccountResponse(saved);
    });
  }

  async listRecords(query: QueryStorePaymentRecordDto) {
    const page = Math.max(1, Number(query.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize ?? 20)));
    const qb = this.recordRepo.createQueryBuilder('r').orderBy('r.id', 'DESC');

    qb.andWhere('r.deletedAt IS NULL');
    if (query.companyCode) qb.andWhere('r.companyCode = :companyCode', { companyCode: query.companyCode });
    if (query.storeCode) {
      qb.andWhere('r.storeCode IN (:...queryStoreCodes)', {
        queryStoreCodes: this.expandStoreCodeAliases(query.storeCode),
      });
    }
    if (query.status) qb.andWhere('r.status = :status', { status: query.status });
    if (query.submittedBy) qb.andWhere('r.submittedBy = :submittedBy', { submittedBy: query.submittedBy });
    if (query.dateFrom) qb.andWhere('r.paidAt >= :dateFrom', { dateFrom: query.dateFrom });
    if (query.dateTo) qb.andWhere('r.paidAt <= :dateTo', { dateTo: query.dateTo });

    this.applyRecordScope(qb);
    const [items, total] = await qb.skip((page - 1) * pageSize).take(pageSize).getManyAndCount();

    return {
      items: items.map((item) => this.toRecordResponse(item)),
      total,
      page,
      pageSize,
    };
  }

  async createRecord(dto: CreateStorePaymentRecordDto) {
    this.assertProtectedAttachmentRef(dto.proofAttachmentId, 'STORE_PAYMENT_PROOF_REQUIRED', true);
    if (Number(dto.amount) <= 0) throw new BadRequestException('STORE_PAYMENT_AMOUNT_INVALID');

    const storeCode = this.resolveCreateStoreCode(dto.storeCode);

    return this.dataSource.transaction(async (manager) => {
      const account = await manager.findOne(StorePaymentAccountEntity, {
        where: { id: dto.paymentAccountId },
      });
      if (!account || account.deletedAt) throw new NotFoundException('STORE_PAYMENT_ACCOUNT_NOT_FOUND');
      if (account.status !== 'ACTIVE' || !account.isActive) {
        throw new BadRequestException('STORE_PAYMENT_ACCOUNT_DISABLED');
      }
      if (account.companyCode !== dto.companyCode || !this.storeCodeMatchesAny(account.storeCode, [storeCode])) {
        throw new ForbiddenException('STORE_PAYMENT_ACCOUNT_SCOPE_MISMATCH');
      }
      if (account.currency !== dto.currency || account.paymentMethod !== dto.paymentMethod) {
        throw new BadRequestException('STORE_PAYMENT_ACCOUNT_METHOD_MISMATCH');
      }

      const paymentNo = dto.paymentNo || await this.generatePaymentNo(manager);
      const duplicated = await manager.findOne(StorePaymentRecordEntity, { where: { paymentNo } });
      if (duplicated) throw new ConflictException('STORE_PAYMENT_RECORD_DUPLICATED');

      const record = manager.create(StorePaymentRecordEntity, {
        paymentNo,
        companyCode: dto.companyCode,
        storeCode,
        paymentAccountId: account.id,
        amount: dto.amount,
        currency: dto.currency,
        paymentMethod: dto.paymentMethod,
        paidAt: new Date(dto.paidAt),
        proofAttachmentId: dto.proofAttachmentId,
        orderNo: this.blankToNull(dto.orderNo),
        saleNo: this.blankToNull(dto.saleNo),
        status: 'PENDING',
        submittedBy: this.username(),
        remark: this.blankToNull(dto.remark),
        createdBy: this.username(),
        updatedBy: this.username(),
      });

      const saved = await manager.save(StorePaymentRecordEntity, record);
      await this.writeAudit(manager, {
        moduleCode: 'MENU_STORE_PAYMENT',
        actionCode: 'CREATE',
        bizType: 'STORE_PAYMENT_RECORD',
        bizId: saved.id,
        bizNo: saved.paymentNo,
        requestPath: '/store-payment/records',
        afterData: this.redactRecordForAudit(saved),
      });
      return this.toRecordResponse(saved);
    });
  }

  async getRecord(id: string) {
    const record = await this.findRecordOrThrow(id);
    this.assertRecordScope(record);
    return this.toRecordResponse(record);
  }

  async getAccountQrAttachmentAccess(id: string) {
    const account = await this.accountRepo.findOne({ where: { id } });
    if (!account || account.deletedAt) throw new NotFoundException('STORE_PAYMENT_ACCOUNT_NOT_FOUND');
    this.assertAccountScope(account);
    if (account.qrAttachmentId) {
      return this.fileAccessService.getProtectedFileStatus(account.qrAttachmentId, this.toFileAccessPolicy({
        objectType: 'STORE_PAYMENT_ACCOUNT_QR',
        objectId: account.id,
        companyCode: account.companyCode,
        storeCode: account.storeCode,
      })).catch(() => this.toAttachmentAccessPendingResponse({
        objectType: 'STORE_PAYMENT_ACCOUNT_QR',
        objectId: account.id,
        attachmentBound: true,
        reason: 'STORE_PAYMENT_QR_FILE_METADATA_PENDING',
      }));
    }
    return this.toAttachmentAccessPendingResponse({
      objectType: 'STORE_PAYMENT_ACCOUNT_QR',
      objectId: account.id,
      attachmentBound: !!account.qrAttachmentId,
      reason: 'STORE_PAYMENT_PROTECTED_QR_PREVIEW_PENDING_A3',
    });
  }

  async getRecordProofAttachmentAccess(id: string) {
    const record = await this.findRecordOrThrow(id);
    this.assertRecordScope(record);
    if (record.proofAttachmentId) {
      return this.fileAccessService.getProtectedFileStatus(record.proofAttachmentId, this.toFileAccessPolicy({
        objectType: 'STORE_PAYMENT_RECORD_PROOF',
        objectId: record.id,
        companyCode: record.companyCode,
        storeCode: record.storeCode,
      })).catch(() => this.toAttachmentAccessPendingResponse({
        objectType: 'STORE_PAYMENT_RECORD_PROOF',
        objectId: record.id,
        attachmentBound: true,
        reason: 'STORE_PAYMENT_PROOF_FILE_METADATA_PENDING',
      }));
    }
    return this.toAttachmentAccessPendingResponse({
      objectType: 'STORE_PAYMENT_RECORD_PROOF',
      objectId: record.id,
      attachmentBound: !!record.proofAttachmentId,
      reason: 'STORE_PAYMENT_PROTECTED_PROOF_PREVIEW_PENDING_A3',
    });
  }

  async getStorePaymentAttachmentStatus(attachmentId: string) {
    const owner = await this.findStorePaymentAttachmentOwnerOrThrow(attachmentId);
    this.assertAttachmentOwnerScope(owner);
    return this.fileAccessService.getProtectedFileStatus(attachmentId, this.toFileAccessPolicy(owner));
  }

  async openStorePaymentAttachment(attachmentId: string, mode: ProtectedFileMode) {
    const owner = await this.findStorePaymentAttachmentOwnerOrThrow(attachmentId);
    this.assertAttachmentOwnerScope(owner);
    return this.fileAccessService.openProtectedFile(attachmentId, this.toFileAccessPolicy(owner), mode);
  }

  async confirmRecord(id: string, dto: ConfirmStorePaymentRecordDto) {
    return this.transitionRecord(id, 'CONFIRMED', dto.comment);
  }

  async rejectRecord(id: string, dto: RejectStorePaymentRecordDto) {
    if (!dto.reason?.trim()) throw new BadRequestException('STORE_PAYMENT_REASON_REQUIRED');
    return this.transitionRecord(id, 'REJECTED', dto.reason);
  }

  async voidRecord(id: string, dto: VoidStorePaymentRecordDto) {
    if (!dto.reason?.trim()) throw new BadRequestException('STORE_PAYMENT_REASON_REQUIRED');
    return this.transitionRecord(id, 'VOIDED', dto.reason);
  }

  private async transitionRecord(id: string, targetStatus: StorePaymentRecordStatus, reason?: string) {
    return this.dataSource.transaction(async (manager) => {
      const record = await manager.findOne(StorePaymentRecordEntity, { where: { id } });
      if (!record) throw new NotFoundException('STORE_PAYMENT_RECORD_NOT_FOUND');
      this.assertRecordScope(record);
      this.assertTransition(record.status as StorePaymentRecordStatus, targetStatus);

      const before = this.redactRecordForAudit(record);
      const now = new Date();
      const actor = this.username();
      record.status = targetStatus;
      record.updatedBy = actor;
      record.reason = this.blankToNull(reason);

      if (targetStatus === 'CONFIRMED') {
        record.confirmedBy = actor;
        record.confirmedAt = now;
      } else if (targetStatus === 'REJECTED') {
        record.rejectedBy = actor;
        record.rejectedAt = now;
      } else if (targetStatus === 'VOIDED') {
        record.voidedBy = actor;
        record.voidedAt = now;
      }

      const saved = await manager.save(StorePaymentRecordEntity, record);
      await this.writeAudit(manager, {
        moduleCode: targetStatus === 'VOIDED' ? 'MENU_STORE_PAYMENT_VOID' : 'MENU_STORE_PAYMENT_CONFIRM',
        actionCode: targetStatus === 'CONFIRMED' ? 'CONFIRM' : targetStatus === 'REJECTED' ? 'REJECT' : 'VOID',
        bizType: 'STORE_PAYMENT_RECORD',
        bizId: saved.id,
        bizNo: saved.paymentNo,
        requestPath: `/store-payment/records/${id}/${targetStatus.toLowerCase()}`,
        beforeData: before,
        afterData: this.redactRecordForAudit(saved),
      });
      return this.toRecordResponse(saved);
    });
  }

  private applyAccountScope(qb: SelectQueryBuilder<StorePaymentAccountEntity>) {
    if (this.isAdmin() || this.isFinance()) return;
    const storeCodes = this.allowedStoreCodes();
    if (storeCodes.length > 0) {
      qb.andWhere('a.storeCode IN (:...accountStoreCodes)', { accountStoreCodes: storeCodes });
    } else {
      qb.andWhere('1 = 0');
    }
    qb.andWhere("a.status = 'ACTIVE'");
    qb.andWhere('a.isActive = true');
  }

  private applyRecordScope(qb: SelectQueryBuilder<StorePaymentRecordEntity>) {
    if (this.isAdmin() || this.isFinance()) return;

    const storeCodes = this.allowedStoreCodes();
    if (this.isManager()) {
      if (storeCodes.length === 0) {
        qb.andWhere('1 = 0');
        return;
      }
      qb.andWhere('r.storeCode IN (:...recordStoreCodes)', { recordStoreCodes: storeCodes });
      return;
    }

    if (this.isClerk()) {
      if (storeCodes.length > 0) {
        qb.andWhere('(r.submittedBy = :currentUsername OR r.storeCode IN (:...recordStoreCodes))', {
          currentUsername: this.username(),
          recordStoreCodes: storeCodes,
        });
      } else {
        qb.andWhere('r.submittedBy = :currentUsername', { currentUsername: this.username() });
      }
      return;
    }

    qb.andWhere('1 = 0');
  }

  private assertRecordScope(record: StorePaymentRecordEntity) {
    if (this.isAdmin() || this.isFinance()) return;

    const storeCodes = this.allowedStoreCodes();
    if (this.isManager()) {
      if (this.storeCodeMatchesAny(record.storeCode, storeCodes)) return;
      throw new ForbiddenException('STORE_PAYMENT_FORBIDDEN');
    }

    if (this.isClerk()) {
      if (record.submittedBy === this.username() || this.storeCodeMatchesAny(record.storeCode, storeCodes)) return;
      throw new ForbiddenException('STORE_PAYMENT_FORBIDDEN');
    }

    throw new ForbiddenException('STORE_PAYMENT_FORBIDDEN');
  }

  private assertAccountScope(account: StorePaymentAccountEntity) {
    if (this.isAdmin() || this.isFinance()) return;
    if (!account.isActive || account.status !== 'ACTIVE') throw new ForbiddenException('STORE_PAYMENT_ACCOUNT_FORBIDDEN');

    const storeCodes = this.allowedStoreCodes();
    if (this.storeCodeMatchesAny(account.storeCode, storeCodes)) return;

    throw new ForbiddenException('STORE_PAYMENT_ACCOUNT_FORBIDDEN');
  }

  private resolveCreateStoreCode(bodyStoreCode: string): string {
    const canonicalBodyStoreCode = this.canonicalStoreCode(bodyStoreCode);
    if (this.isAdmin() || this.isFinance()) return canonicalBodyStoreCode;

    const storeCodes = this.allowedStoreCodes();
    if (storeCodes.length === 0) throw new ForbiddenException('STORE_PAYMENT_STORE_SCOPE_REQUIRED');
    if (!this.storeCodeMatchesAny(canonicalBodyStoreCode, storeCodes)) throw new ForbiddenException('STORE_PAYMENT_FORBIDDEN');
    return canonicalBodyStoreCode;
  }

  private assertAccountMaintainer() {
    if (this.isAdmin() || this.isFinance()) return;
    throw new ForbiddenException('STORE_PAYMENT_ACCOUNT_FORBIDDEN');
  }

  private assertTransition(current: StorePaymentRecordStatus, target: StorePaymentRecordStatus) {
    if (current === 'VOIDED') throw new BadRequestException('STORE_PAYMENT_INVALID_STATUS');
    if (target === 'CONFIRMED' && current !== 'PENDING') throw new BadRequestException('STORE_PAYMENT_INVALID_STATUS');
    if (target === 'REJECTED' && current !== 'PENDING') throw new BadRequestException('STORE_PAYMENT_INVALID_STATUS');
    if (target === 'VOIDED' && !['PENDING', 'REJECTED', 'CONFIRMED'].includes(current)) {
      throw new BadRequestException('STORE_PAYMENT_INVALID_STATUS');
    }
  }

  private assertProtectedAttachmentRef(value: string | undefined, code: string, required: boolean) {
    if (!value?.trim()) {
      if (!required) return;
      throw new BadRequestException(code);
    }
    const normalized = value.trim().toLowerCase();
    if (
      normalized.startsWith('/uploads/') ||
      normalized.startsWith('uploads/') ||
      normalized.startsWith('http://') ||
      normalized.startsWith('https://')
    ) {
      throw new BadRequestException('STORE_PAYMENT_ATTACHMENT_RAW_URL_FORBIDDEN');
    }
  }

  private validateProtectedAttachmentId(value: string) {
    const normalized = value.trim();
    if (!normalized) throw new BadRequestException('STORE_PAYMENT_ATTACHMENT_ID_REQUIRED');
    const lowered = normalized.toLowerCase();
    if (
      normalized.includes('..') ||
      normalized.includes('/') ||
      normalized.includes('\\') ||
      normalized.includes('\0') ||
      lowered.startsWith('http://') ||
      lowered.startsWith('https://') ||
      lowered.startsWith('uploads') ||
      lowered.startsWith('/uploads')
    ) {
      throw new BadRequestException('STORE_PAYMENT_ATTACHMENT_ID_UNSAFE');
    }
    return normalized;
  }

  private async findStorePaymentAttachmentOwnerOrThrow(attachmentId: string) {
    const safeAttachmentId = this.validateProtectedAttachmentId(attachmentId);
    const record = await this.recordRepo.findOne({ where: { proofAttachmentId: safeAttachmentId } });
    if (record && !record.deletedAt) {
      return {
        objectType: 'STORE_PAYMENT_RECORD_PROOF',
        objectId: record.id,
        objectNo: record.paymentNo,
        storeCode: record.storeCode,
        companyCode: record.companyCode,
        record,
      };
    }

    const account = await this.accountRepo.findOne({ where: { qrAttachmentId: safeAttachmentId } });
    if (account && !account.deletedAt) {
      return {
        objectType: 'STORE_PAYMENT_ACCOUNT_QR',
        objectId: account.id,
        objectNo: account.accountCode,
        storeCode: account.storeCode,
        companyCode: account.companyCode,
        account,
      };
    }

    throw new NotFoundException('STORE_PAYMENT_ATTACHMENT_NOT_FOUND');
  }

  private assertAttachmentOwnerScope(owner: {
    record?: StorePaymentRecordEntity;
    account?: StorePaymentAccountEntity;
  }) {
    if (owner.record) {
      this.assertRecordScope(owner.record);
      return;
    }
    if (owner.account) {
      this.assertAccountScope(owner.account);
      return;
    }
    throw new NotFoundException('STORE_PAYMENT_ATTACHMENT_NOT_FOUND');
  }

  private toFileAccessPolicy(owner: {
    objectType: string;
    objectId: string;
    companyCode: string;
    storeCode: string;
  }) {
    return {
      moduleCode: 'STORE_PAYMENT',
      ownerType: owner.objectType === 'STORE_PAYMENT_ACCOUNT_QR' ? 'STORE_PAYMENT_ACCOUNT' : 'STORE_PAYMENT_RECORD',
      ownerId: owner.objectId,
      companyCode: owner.companyCode,
      storeCode: owner.storeCode,
      requiredMenu: owner.objectType === 'STORE_PAYMENT_ACCOUNT_QR' ? 'MENU_STORE_PAYMENT_ACCOUNT' : 'MENU_STORE_PAYMENT',
    };
  }

  private async findRecordOrThrow(id: string) {
    const record = await this.recordRepo.findOne({ where: { id } });
    if (!record) throw new NotFoundException('STORE_PAYMENT_RECORD_NOT_FOUND');
    return record;
  }

  private async generatePaymentNo(manager: EntityManager): Promise<string> {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const prefix = `SPY-${yyyy}${mm}${dd}-`;
    await manager.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);
    const row = await manager
      .createQueryBuilder(StorePaymentRecordEntity, 'r')
      .select('MAX(r.paymentNo)', 'max')
      .where('r.paymentNo LIKE :prefix', { prefix: `${prefix}%` })
      .getRawOne<{ max: string | null }>();
    const last = row?.max ? parseInt(row.max.slice(prefix.length), 10) : 0;
    return `${prefix}${String(Number.isFinite(last) ? last + 1 : 1).padStart(5, '0')}`;
  }

  private async writeAudit(manager: EntityManager, data: {
    moduleCode: string;
    actionCode: string;
    bizType: string;
    bizId: string;
    bizNo: string;
    requestPath: string;
    beforeData?: Record<string, unknown>;
    afterData?: Record<string, unknown>;
  }) {
    const roles = this.roles();
    await manager.save(SysOperationLogEntity, manager.create(SysOperationLogEntity, {
      userId: this.userId() || null,
      username: this.username(),
      roleCode: roles[0] ?? null,
      moduleCode: data.moduleCode,
      actionCode: data.actionCode,
      bizType: data.bizType,
      bizId: data.bizId,
      bizNo: data.bizNo,
      requestMethod: 'SERVICE',
      requestPath: data.requestPath,
      ipAddress: null,
      userAgent: null,
      beforeData: data.beforeData ?? null,
      afterData: data.afterData ?? null,
      resultStatus: 'SUCCESS',
    }));
  }

  private toAccountResponse(account: StorePaymentAccountEntity) {
    return {
      id: account.id,
      accountCode: account.accountCode,
      accountName: account.accountName,
      companyCode: account.companyCode,
      storeCode: account.storeCode,
      finCashAccountId: account.finCashAccountId,
      currency: account.currency,
      paymentMethod: account.paymentMethod,
      qrAttachmentBound: !!account.qrAttachmentId,
      status: account.status,
      isActive: account.isActive,
      remark: account.remark,
      createdAt: account.createdAt,
      updatedAt: account.updatedAt,
    };
  }

  private toRecordResponse(record: StorePaymentRecordEntity) {
    return {
      id: record.id,
      paymentNo: record.paymentNo,
      companyCode: record.companyCode,
      storeCode: record.storeCode,
      paymentAccountId: record.paymentAccountId,
      amount: record.amount,
      currency: record.currency,
      paymentMethod: record.paymentMethod,
      paidAt: record.paidAt,
      proofAttachmentBound: !!record.proofAttachmentId,
      proofPreviewAllowed: false,
      proofPreviewStatus: 'access_pending',
      proofDownloadAllowed: false,
      proofDownloadStatus: 'access_pending',
      orderNo: record.orderNo,
      saleNo: record.saleNo,
      status: record.status,
      submittedBy: record.submittedBy,
      confirmedBy: record.confirmedBy,
      confirmedAt: record.confirmedAt,
      rejectedBy: record.rejectedBy,
      rejectedAt: record.rejectedAt,
      voidedBy: record.voidedBy,
      voidedAt: record.voidedAt,
      reason: this.shortText(record.reason),
      remark: this.shortText(record.remark),
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
    };
  }

  private redactAccountForAudit(account: StorePaymentAccountEntity): Record<string, unknown> {
    return {
      id: account.id,
      accountCode: account.accountCode,
      accountName: account.accountName,
      companyCode: account.companyCode,
      storeCode: account.storeCode,
      finCashAccountId: account.finCashAccountId,
      currency: account.currency,
      paymentMethod: account.paymentMethod,
      qrAttachmentBound: !!account.qrAttachmentId,
      status: account.status,
      isActive: account.isActive,
      remarkPresent: !!account.remark,
    };
  }

  private redactRecordForAudit(record: StorePaymentRecordEntity): Record<string, unknown> {
    return {
      id: record.id,
      paymentNo: record.paymentNo,
      companyCode: record.companyCode,
      storeCode: record.storeCode,
      paymentAccountId: record.paymentAccountId,
      amount: record.amount,
      currency: record.currency,
      paymentMethod: record.paymentMethod,
      paidAt: record.paidAt,
      proofAttachmentBound: !!record.proofAttachmentId,
      orderNo: record.orderNo,
      saleNo: record.saleNo,
      status: record.status,
      submittedBy: record.submittedBy,
      confirmedBy: record.confirmedBy,
      confirmedAt: record.confirmedAt,
      rejectedBy: record.rejectedBy,
      rejectedAt: record.rejectedAt,
      voidedBy: record.voidedBy,
      voidedAt: record.voidedAt,
      reasonPresent: !!record.reason,
      remarkPresent: !!record.remark,
    };
  }

  private allowedStoreCodes(): string[] {
    const userStoreCodes = this.splitCodes(this.user().storeCode);
    const scope = this.cls.get<DataScopeContext | undefined>('dataScope');
    const scoped = scope?.allowedSiteCodes ?? [];
    return this.expandStoreCodeList([...userStoreCodes, ...scoped].filter(code => code && code !== 'ALL'));
  }

  private isAdmin(): boolean {
    const user = this.user();
    return this.roles().includes('ROLE_ADMIN') || user.permissions?.includes('*') === true;
  }

  private isFinance(): boolean {
    return this.roles().some(role => FINANCE_ROLES.has(role));
  }

  private isManager(): boolean {
    return this.roles().some(role => MANAGER_ROLES.has(role));
  }

  private isClerk(): boolean {
    return this.roles().some(role => CLERK_ROLES.has(role));
  }

  private roles(): string[] {
    const user = this.user();
    return Array.isArray(user.roles) ? user.roles : (user.role ? [user.role] : []);
  }

  private userId(): string {
    const user = this.user();
    return String(user.userId ?? user.id ?? '');
  }

  private username(): string {
    const user = this.user();
    return String(user.username ?? user.name ?? user.realNameZh ?? 'system');
  }

  private user(): RequestUser {
    return this.cls.get<RequestUser>('user') ?? {};
  }

  private splitCodes(value: string | undefined): string[] {
    return String(value ?? '')
      .split(',')
      .map(code => code.trim())
      .filter(Boolean);
  }

  private canonicalStoreCode(code: string): string {
    const normalized = code.trim();
    return STORE_CODE_CANONICAL[normalized] ?? normalized;
  }

  private expandStoreCodeAliases(code: string): string[] {
    const canonical = this.canonicalStoreCode(code);
    return Array.from(new Set([canonical, ...(STORE_CODE_ALIASES[canonical] ?? [])]));
  }

  private expandStoreCodeList(codes: string[]): string[] {
    return Array.from(new Set(codes.flatMap((code) => this.expandStoreCodeAliases(code))));
  }

  private storeCodeMatchesAny(value: string, allowedCodes: string[]): boolean {
    const candidateCodes = this.expandStoreCodeAliases(value);
    const allowed = new Set(this.expandStoreCodeList(allowedCodes));
    return candidateCodes.some((code) => allowed.has(code));
  }

  private blankToNull(value: string | undefined): string | null {
    const normalized = value?.trim();
    return normalized ? normalized : null;
  }

  private shortText(value: string | null): string | null {
    if (!value) return null;
    return value.length > 80 ? `${value.slice(0, 80)}...` : value;
  }

  private toAttachmentAccessPendingResponse(input: {
    objectType: string;
    objectId: string;
    attachmentBound: boolean;
    reason: string;
  }) {
    return {
      objectType: input.objectType,
      objectId: input.objectId,
      attachmentBound: input.attachmentBound,
      previewAllowed: false,
      previewStatus: 'access_pending',
      downloadAllowed: false,
      downloadStatus: 'access_pending',
      rawUrl: null,
      reason: input.reason,
      auditRequired: true,
      auditStatus: 'todo_after_protected_attachment_acl',
    };
  }
}
