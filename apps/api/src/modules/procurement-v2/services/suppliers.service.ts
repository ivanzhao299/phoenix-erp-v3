import { supplierVisibility } from '../../master-data/supplier-visibility';
import { DataScopeContext } from '../../org/services/data-scope.service';
import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { DataScopeHelper } from '../../org/helpers/data-scope.helper';

import { Prc2SupplierEntity } from '../entities/prc2-supplier.entity';
import { CreateSupplierDto } from '../dto/create-supplier.dto';
import { UpdateSupplierDto } from '../dto/update-supplier.dto';
import { QuerySupplierDto } from '../dto/query-supplier.dto';
import { UpdateSupplierStatusDto } from '../dto/update-supplier-status.dto';

@Injectable()
export class SuppliersService {
  constructor(
    @InjectRepository(Prc2SupplierEntity)
    private readonly repo: Repository<Prc2SupplierEntity>,
    private readonly cls: ClsService,
    private readonly scopeHelper: DataScopeHelper,
  ) {}

  private visibleSuppliers() {
    const qb = this.repo.createQueryBuilder('s');
    const scope = this.cls.get<DataScopeContext | undefined>('dataScope');
    if (scope && !scope.isGlobal) {
      qb.andWhere(supplierVisibility('s', ':supplierCompanies', ':supplierProjects'), {
        supplierCompanies: scope.allowedCompanyCodes, supplierProjects: scope.allowedProjectCodes,
      });
    }
    return qb;
  }

  private maskBankFields(item: Prc2SupplierEntity) {
    const user = this.cls.get('user');
    if (user && !(user.roles ?? [user.role]).includes('ROLE_ADMIN')) {
      for (const field of ['bankName', 'bankAccountName', 'bankAccountNo', 'bankSwift'] as const) {
        Reflect.deleteProperty(item, field);
      }
    }
    return item;
  }

  private withCompatibility(item: Prc2SupplierEntity): Prc2SupplierEntity {
    const categoryValues = new Set(['CHICK','FEED','RAW_MATERIAL','PACKAGING','VACCINE','VETERINARY','EQUIPMENT','MEDICINE','SERVICE','OTHER']);
    const sourcingValues = new Set(['LOCAL','OVERSEAS','AGENT']);
    if (!item.supplyCategory && categoryValues.has(item.supplierType)) item.supplyCategory = item.supplierType;
    if (!item.sourcingType) item.sourcingType = sourcingValues.has(item.supplierType) ? item.supplierType : 'UNSPECIFIED';
    return item;
  }

  /** 分页列表
   *  共享范围过滤规则：
   *  - sharedScope=GROUP → 所有公司可见
   *  - sharedScope=COMPANY → 仅归属公司可见（通过 ownerCompanyCode 过滤）
   *  - sharedScope=PROJECT → 仅归属项目可见（通过 ownerProjectCode 过滤）
   */
  async list(query: QuerySupplierDto) {
    const page     = Math.max(1, query.page     ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const skip     = (page - 1) * pageSize;

    const qb = this.visibleSuppliers();

    if (query.sharedScope)      qb.andWhere('s.sharedScope = :scope', { scope: query.sharedScope });
    if (query.supplierCode)     qb.andWhere('s.supplierCode = :sc',   { sc: query.supplierCode });
    if (query.supplierType)     qb.andWhere('s.supplierType = :st',   { st: query.supplierType });
    if (query.supplyCategory)   qb.andWhere('s.supplyCategory = :category', { category: query.supplyCategory });
    if (query.sourcingType)     qb.andWhere('s.sourcingType = :sourcing', { sourcing: query.sourcingType });
    if (query.countryCode)      qb.andWhere('s.countryCode = :coc',   { coc: query.countryCode });
    if (query.defaultCurrency)  qb.andWhere('s.defaultCurrency = :dc',{ dc: query.defaultCurrency });
    if (query.status)           qb.andWhere('s.status = :status',     { status: query.status });
    if (query.ownerCompanyCode) qb.andWhere('s.ownerCompanyCode = :occ', { occ: query.ownerCompanyCode });
    if (query.ownerProjectCode) qb.andWhere('s.ownerProjectCode = :opc', { opc: query.ownerProjectCode });

    if (query.supplierName) {
      qb.andWhere('s.supplierName ILIKE :sn', { sn: `%${query.supplierName}%` });
    }
    if (query.keyword) {
      qb.andWhere(
        '(s.supplierName ILIKE :kw OR s.supplierCode ILIKE :kw OR s.supplierNameEn ILIKE :kw OR s.contactName ILIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }

    const [items, total] = await qb
      .orderBy('s.createdAt', 'DESC')
      .addOrderBy('s.id', 'DESC')
      .skip(skip)
      .take(pageSize)
      .getManyAndCount();

    return { items: items.map((item) => this.maskBankFields(this.withCompatibility(item))), total, page, pageSize };
  }

  /** 详情 */
  async findById(id: string): Promise<Prc2SupplierEntity> {
    const item = await this.visibleSuppliers().andWhere('s.id = :id', { id }).getOne();
    if (!item) throw new NotFoundException(`供应商 ID=${id} 不存在`);
    return this.maskBankFields(this.withCompatibility(item));
  }

  /** 新建 */
  async create(dto: CreateSupplierDto): Promise<Prc2SupplierEntity> {
    if (dto.bankName || dto.bankAccountName || dto.bankAccountNo || dto.bankSwift) {
      throw new BadRequestException('银行信息请在主数据中心完成审核');
    }

    this.scopeHelper.assertWritableOwnership(
      { companyCode: dto.ownerCompanyCode, projectCode: dto.ownerProjectCode },
      '采购供应商',
    );

    // supplier_code 全局唯一
    const exists = await this.repo.findOne({ where: { supplierCode: dto.supplierCode } });
    if (exists) {
      throw new ConflictException(`供应商编码 [${dto.supplierCode}] 已存在`);
    }

    const user   = this.cls.get('user') as Record<string, unknown> | undefined;
    const userId = user?.userId ?? user?.id;

    const entity = this.repo.create({
      supplierCode:     dto.supplierCode,
      supplierName:     dto.supplierName,
      supplierNameEn:   dto.supplierNameEn,
      countryCode:      dto.countryCode,
      supplyCategory:   dto.supplyCategory,
      sourcingType:     dto.sourcingType,
      defaultCurrency:  dto.defaultCurrency,
      sharedScope:      dto.sharedScope,
      ownerCompanyId:   dto.ownerCompanyId,
      ownerCompanyCode: dto.ownerCompanyCode,
      ownerCompanyName: dto.ownerCompanyName,
      ownerProjectId:   dto.ownerProjectId,
      ownerProjectCode: dto.ownerProjectCode,
      ownerProjectName: dto.ownerProjectName,
      contactName:      dto.contactName,
      contactPhone:     dto.contactPhone,
      contactEmail:     dto.contactEmail,
      bankName:         dto.bankName,
      bankAccountName:  dto.bankAccountName,
      bankAccountNo:    dto.bankAccountNo,
      bankSwift:        dto.bankSwift,
      taxNo:            dto.taxNo,
      address:          dto.address,
      creditDays:       dto.creditDays ?? 30,
      paymentTerms:     dto.paymentTerms,
      remark:           dto.remark,
      status:           'ACTIVE',
      isActive:         true,
      createdBy:        userId ? String(userId) : undefined,
    });
    return this.repo.save(entity);
  }

  /** 更新（禁止改 supplier_code） */
  async update(id: string, dto: UpdateSupplierDto): Promise<Prc2SupplierEntity> {
    const item = await this.findById(id);
    this.scopeHelper.assertWritableOwnership(
      { companyCode: item.ownerCompanyCode, projectCode: item.ownerProjectCode }, '采购供应商',
    );
    if (dto.supplierName    !== undefined) item.supplierName    = dto.supplierName;
    if (dto.countryCode     !== undefined) item.countryCode     = dto.countryCode;
    if (dto.supplyCategory  !== undefined) item.supplyCategory  = dto.supplyCategory;
    if (dto.sourcingType    !== undefined) item.sourcingType    = dto.sourcingType;
    if (dto.defaultCurrency !== undefined) item.defaultCurrency = dto.defaultCurrency;
    if (dto.contactName     !== undefined) item.contactName     = dto.contactName;
    if (dto.contactPhone    !== undefined) item.contactPhone    = dto.contactPhone;
    if (dto.contactEmail    !== undefined) item.contactEmail    = dto.contactEmail;
    if ([dto.bankName, dto.bankAccountName, dto.bankAccountNo].some(value => value !== undefined)) {
      throw new BadRequestException('银行信息请在主数据中心完成审核');
    }
    if (dto.taxNo           !== undefined) item.taxNo           = dto.taxNo;
    if (dto.address         !== undefined) item.address         = dto.address;
    if (dto.status !== undefined && dto.status !== item.status) {
      throw new BadRequestException('供应商状态变更请通过主数据生命周期操作');
    }
    if (dto.remark          !== undefined) item.remark          = dto.remark;
    if (dto.creditDays !== undefined && dto.creditDays !== item.creditDays) {
      throw new BadRequestException('账期变更请在主数据中心提交审批');
    }
    return this.repo.save(item);
  }

  /** 更新状态 */
  async updateStatus(id: string, dto: UpdateSupplierStatusDto): Promise<Prc2SupplierEntity> {
    const item = await this.findById(id);
    this.scopeHelper.assertWritableOwnership(
      { companyCode: item.ownerCompanyCode, projectCode: item.ownerProjectCode }, '采购供应商',
    );
    if (!['ACTIVE', 'INACTIVE', 'BLACKLISTED'].includes(item.status)) {
      throw new BadRequestException('当前状态须在主数据中心处理');
    }
    if (item.status === 'BLACKLISTED' && dto.status === 'ACTIVE') {
      throw new BadRequestException('解除黑名单请通过主数据中心审核');
    }
    item.status   = dto.status;
    item.isActive = dto.status === 'ACTIVE';
    return this.repo.save(item);
  }
}
