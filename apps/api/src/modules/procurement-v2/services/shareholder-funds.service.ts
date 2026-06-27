import {
  Injectable, NotFoundException, ConflictException, BadRequestException, ForbiddenException,
} from '@nestjs/common';
import { InjectRepository, InjectDataSource } from '@nestjs/typeorm';
import { Repository, DataSource, EntityManager } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { format } from 'date-fns';
import { IsString, IsNumber, IsOptional } from 'class-validator';
import { Type } from 'class-transformer';
import { ApprovalEngineService } from '../../approval-engine/approval-engine.service';
import { Prc2ShareholderFundEntity } from '../entities/prc2-shareholder-fund.entity';
import { DataScopeHelper } from '../../org/helpers/data-scope.helper';

// 并发安全编号生成
async function genNo(mgr: EntityManager, prefix: string, repo: any, alias: string, field: string): Promise<string> {
  await mgr.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [prefix]);
  const row = await mgr.createQueryBuilder(repo, alias)
    .select(`MAX(${alias}.${field})`, 'max')
    .where(`${alias}.${field} LIKE :p`, { p: `${prefix}%` })
    .getRawOne<{ max: string | null }>();
  let seq = 1;
  if (row?.max) { const last = parseInt(row.max.slice(prefix.length), 10); if (!isNaN(last)) seq = last + 1; }
  return `${prefix}${String(seq).padStart(5, '0')}`;
}

export class CreateShareholderFundDto {
  @IsString()
  shareholderName: string;

  @IsOptional() @IsString()
  shareholderId?: string;

  @IsString()
  fundNature: string;

  @IsString()
  currencyCode: string;

  @IsNumber()
  @Type(() => Number)
  amountOriginal: number;

  @IsOptional() @IsNumber() @Type(() => Number)
  exchangeRate?: number;

  @IsOptional() @IsString()
  baseCurrency?: string;

  @IsOptional() @IsString()
  companyCode?: string;

  @IsOptional() @IsString()
  companyName?: string;

  @IsOptional() @IsString()
  projectCode?: string;

  @IsOptional() @IsString()
  projectName?: string;

  @IsOptional() @IsString()
  occurredDate?: string;

  @IsOptional() @IsString()
  remark?: string;
}

export class QueryShareholderFundDto {
  @IsOptional() @IsNumber() @Type(() => Number)
  page?: number;

  @IsOptional() @IsNumber() @Type(() => Number)
  pageSize?: number;

  @IsOptional() @IsString()
  status?: string;

  @IsOptional() @IsString()
  companyCode?: string;

  @IsOptional() @IsString()
  projectCode?: string;

  @IsOptional() @IsString()
  fundNature?: string;

  @IsOptional() @IsString()
  shareholderId?: string;
}

@Injectable()
export class ShareholderFundsService {
  constructor(
    @InjectRepository(Prc2ShareholderFundEntity)
    private readonly fundRepo: Repository<Prc2ShareholderFundEntity>,
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
    private readonly scopeHelper: DataScopeHelper,
    private readonly approvalEngine: ApprovalEngineService,
  ) {}

  private userId(): string {
    const u = this.cls.get('user') as any;
    return String(u?.userId ?? u?.id ?? '0');
  }

  private async generateFundNo(mgr: EntityManager): Promise<string> {
    const prefix = `SHF-${format(new Date(), 'yyyyMMdd')}-`;
    return genNo(mgr, prefix, Prc2ShareholderFundEntity as any, 'f', 'fundNo');
  }

  // ── 列表 ─────────────────────────────────────────────────────────────────

  async list(q: QueryShareholderFundDto) {
    const page     = q.page     ?? 1;
    const pageSize = q.pageSize ?? 20;

    const qb = this.fundRepo.createQueryBuilder('f')
      .orderBy('f.id', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (q.status)        qb.andWhere('f.status = :s',          { s: q.status });
    if (q.companyCode)   qb.andWhere('f.companyCode = :cc',    { cc: q.companyCode });
    if (q.projectCode)   qb.andWhere('f.projectCode = :pc',    { pc: q.projectCode });
    if (q.fundNature)    qb.andWhere('f.fundNature = :fn',      { fn: q.fundNature });
    if (q.shareholderId) qb.andWhere('f.shareholderId = :si',  { si: q.shareholderId });

    // 数据范围过滤（DataScope）
    // G156：SELF 级（ROLE_SHAREHOLDER_VIEW）只能看本人名下——applyToQb 无 SELF 分支，
    //   原仅按公司/项目过滤，股东只读角色可能看到他人资金。补 SELF 隔离（镜像 payments.listShareholderFunds）。
    const scope = this.cls.get('dataScope') as { isGlobal?: boolean; scopeLevel?: string; userId?: string } | undefined;
    if (scope && !scope.isGlobal && scope.scopeLevel === 'SELF') {
      qb.andWhere('f.shareholderId = :selfUserId', { selfUserId: scope.userId });
    } else {
      this.scopeHelper.applyToQb(qb, { alias: 'f' });
    }

    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, pageSize };
  }

  // ── 单条详情 ──────────────────────────────────────────────────────────────

  async findOne(id: string): Promise<Prc2ShareholderFundEntity> {
    const fund = await this.fundRepo.findOne({ where: { id } });
    if (!fund) throw new NotFoundException(`股东资金 ID=${id} 不存在`);
    // G156 安全：补归属校验——原 findOne 无任何 scope 校验，持 MENU_PRC2_FUND V 权者凭 id 可读
    //   任意公司/股东的资金详情（越权读金融数据）。其余单据 findById 都有 assertOwnership，唯独此处漏。
    this.scopeHelper.assertOwnership({ companyCode: fund.companyCode, projectCode: fund.projectCode }, '股东资金');
    // SELF 级（股东只读）还须本人名下
    const scope = this.cls.get('dataScope') as { isGlobal?: boolean; scopeLevel?: string; userId?: string } | undefined;
    if (scope && !scope.isGlobal && scope.scopeLevel === 'SELF'
        && String(fund.shareholderId ?? '') !== String(scope.userId ?? '')) {
      throw new ForbiddenException('无权访问该股东资金（仅可查看本人名下）');
    }
    return fund;
  }

  // ── 手工创建（仅限 DRAFT，必须走审批） ────────────────────────────────────

  async create(dto: CreateShareholderFundDto): Promise<Prc2ShareholderFundEntity> {
    return this.ds.transaction(async mgr => {
      this.scopeHelper.assertWritableOwnership(
        { companyCode: dto.companyCode, projectCode: dto.projectCode },
        '股东资金',
      );
      const fundNo = await this.generateFundNo(mgr);
      const rate   = Number(dto.exchangeRate ?? 1);
      const amtBase = Number(dto.amountOriginal) * rate;

      await mgr.query(
        `INSERT INTO prc2_shareholder_funds
          (fund_no, shareholder_id, shareholder_name,
           company_code, company_name, project_code, project_name,
           source_type, fund_nature, currency_code,
           amount_original, exchange_rate, amount_base, base_currency,
           occurred_date, status, remark, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [
          fundNo,
          dto.shareholderId ?? null,
          dto.shareholderName,
          dto.companyCode ?? null,
          dto.companyName ?? null,
          dto.projectCode ?? null,
          dto.projectName ?? null,
          'MANUAL',
          dto.fundNature,
          dto.currencyCode,
          Number(dto.amountOriginal),
          rate,
          amtBase,
          dto.baseCurrency ?? 'LAK',
          dto.occurredDate ?? null,
          'DRAFT',
          dto.remark ?? null,
          this.userId() || null,
        ],
      );

      // 返回新建记录
      const fund = await mgr.findOne(Prc2ShareholderFundEntity, { where: { fundNo } });
      return fund!;
    });
  }

  // ── 提交审批 ──────────────────────────────────────────────────────────────

  async submit(id: string): Promise<Prc2ShareholderFundEntity> {
    return this.ds.transaction(async mgr => {
      const fund = await mgr.findOne(Prc2ShareholderFundEntity, { where: { id } });
      if (!fund) throw new NotFoundException(`股东资金 ID=${id} 不存在`);
      this.scopeHelper.assertWritableOwnership(
        { companyCode: fund.companyCode, projectCode: fund.projectCode },
        '股东资金',
      );
      if (fund.status !== 'DRAFT') {
        throw new ConflictException(`只有草稿状态才可提交（当前状态：${fund.status}）`);
      }
      if (!fund.shareholderName) {
        throw new BadRequestException('股东名称不能为空');
      }

      fund.status = 'PENDING_APPROVAL';
      await mgr.save(Prc2ShareholderFundEntity, fund);

      // 启动审批引擎
      await this.approvalEngine.startApproval({
        moduleCode:   'MENU_PRC2_FUND',
        bizType:      'FUND',
        bizId:        id,
        bizNo:        fund.fundNo,
        amount:       Number(fund.amountBase ?? fund.amountOriginal ?? 0),
        currencyCode: fund.currencyCode,
        companyCode:  fund.companyCode ?? undefined,
        companyName:  fund.companyName ?? undefined,
        projectCode:  fund.projectCode ?? undefined,
        projectName:  fund.projectName ?? undefined,
        subject:      `${fund.shareholderName}${fund.fundNature ? ' · ' + fund.fundNature : ''}`,
      }, mgr);

      return fund;
    });
  }

  // ── 取消（DRAFT 可取消） ───────────────────────────────────────────────────

  async cancel(id: string): Promise<void> {
    return this.ds.transaction(async mgr => {
      const fund = await mgr.findOne(Prc2ShareholderFundEntity, { where: { id } });
      if (!fund) throw new NotFoundException(`股东资金 ID=${id} 不存在`);
      this.scopeHelper.assertWritableOwnership(
        { companyCode: fund.companyCode, projectCode: fund.projectCode },
        '股东资金',
      );
      if (!['DRAFT', 'PENDING_APPROVAL'].includes(fund.status)) {
        throw new ConflictException(`当前状态 ${fund.status} 不允许取消`);
      }
      fund.status = 'CANCELLED';
      await mgr.save(Prc2ShareholderFundEntity, fund);
    });
  }
}
