import {
  Injectable, NotFoundException, ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { DataScopeHelper } from '../../org/helpers/data-scope.helper';

import { Prc2ProjectEntity } from '../entities/prc2-project.entity';
import { CreateProjectDto } from '../dto/create-project.dto';
import { UpdateProjectDto } from '../dto/update-project.dto';
import { QueryProjectDto } from '../dto/query-project.dto';
import { UpdateProjectStatusDto } from '../dto/update-project-status.dto';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectRepository(Prc2ProjectEntity)
    private readonly repo: Repository<Prc2ProjectEntity>,
    private readonly cls: ClsService,
    private readonly scopeHelper: DataScopeHelper,
  ) {}

  /** 分页列表 */
  async list(query: QueryProjectDto) {
    const page     = Math.max(1, query.page     ?? 1);
    const pageSize = Math.min(100, Math.max(1, query.pageSize ?? 20));
    const skip     = (page - 1) * pageSize;

    const qb = this.repo.createQueryBuilder('p');

    if (query.companyCode) qb.andWhere('p.companyCode = :cc',  { cc: query.companyCode });
    if (query.projectCode) qb.andWhere('p.projectCode = :pc',  { pc: query.projectCode });
    if (query.projectType) qb.andWhere('p.projectType = :pt',  { pt: query.projectType });
    if (query.status)      qb.andWhere('p.status = :st',       { st: query.status });
    if (query.projectName) qb.andWhere('p.projectName ILIKE :pn', { pn: `%${query.projectName}%` });
    if (query.keyword) {
      qb.andWhere(
        '(p.projectName ILIKE :kw OR p.projectCode ILIKE :kw OR p.companyName ILIKE :kw OR p.companyCode ILIKE :kw)',
        { kw: `%${query.keyword}%` },
      );
    }

    // ── RBAC-2 数据范围过滤 ──────────────────────────────────────────────────
    this.scopeHelper.applyToQb(qb, { alias: 'p' });
    // ────────────────────────────────────────────────────────────────────────

    const [items, total] = await qb
      .orderBy('p.createdAt', 'DESC')
      .skip(skip)
      .take(pageSize)
      .getManyAndCount();

    return { items, total, page, pageSize };
  }

  /** 详情 */
  async findById(id: string): Promise<Prc2ProjectEntity> {
    const item = await this.repo.findOne({ where: { id } });
    if (!item) throw new NotFoundException(`项目 ID=${id} 不存在`);

    // ── RBAC-2.5 详情归属校验 ────────────────────────────────────────────────
    this.scopeHelper.assertOwnership(
      { companyCode: item.companyCode, projectCode: item.projectCode },
      'Project',
    );
    // ─────────────────────────────────────────────────────────────────────────

    return item;
  }

  /** 新建 */
  async create(dto: CreateProjectDto): Promise<Prc2ProjectEntity> {
    // 同一公司下 project_code 唯一
    const exists = await this.repo.findOne({
      where: { companyCode: dto.companyCode, projectCode: dto.projectCode },
    });
    if (exists) {
      throw new ConflictException(
        `公司 [${dto.companyCode}] 下项目编号 [${dto.projectCode}] 已存在`,
      );
    }

    const user = this.cls.get('user') as Record<string, unknown> | undefined;
    const userId = user?.userId ?? user?.id;

    const entity = this.repo.create({
      companyId:   dto.companyId,
      companyCode: dto.companyCode,
      companyName: dto.companyName,
      projectCode: dto.projectCode,
      projectName: dto.projectName,
      projectType: dto.projectType,
      startDate:   dto.startDate,
      endDate:     dto.endDate,
      remark:      dto.remark,
      status:      'ACTIVE',
      createdBy:   userId ? String(userId) : undefined,
    });
    return this.repo.save(entity);
  }

  /** 更新（禁止改 company_code / project_code） */
  async update(id: string, dto: UpdateProjectDto): Promise<Prc2ProjectEntity> {
    const item = await this.findById(id);
    if (dto.projectName !== undefined) item.projectName = dto.projectName;
    if (dto.projectType !== undefined) item.projectType = dto.projectType;
    if (dto.status      !== undefined) item.status      = dto.status;
    if (dto.startDate   !== undefined) item.startDate   = dto.startDate;
    if (dto.endDate     !== undefined) item.endDate     = dto.endDate;
    if (dto.remark      !== undefined) item.remark      = dto.remark;
    return this.repo.save(item);
  }

  /** 更新状态 */
  async updateStatus(id: string, dto: UpdateProjectStatusDto): Promise<Prc2ProjectEntity> {
    const item = await this.findById(id);
    item.status = dto.status;
    return this.repo.save(item);
  }
}
