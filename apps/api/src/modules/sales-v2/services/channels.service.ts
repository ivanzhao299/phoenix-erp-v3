import { Injectable, NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { CreateChannelDto, UpdateChannelDto, QueryChannelDto } from '../dto/channel.dto';

@Injectable()
export class ChannelsService {
  constructor(
    @InjectDataSource() private readonly ds: DataSource,
    private readonly cls: ClsService,
  ) {}

  private currentUser() {
    const u = this.cls.get('user') as any;
    return {
      userId: String(u?.userId ?? u?.id ?? '0'),
      roles: (u?.roles ?? (u?.role ? [u.role] : [])) as string[],
      companyCodes: (u?.companyCodes ?? []) as string[],
      scopeAll: !!(u?.scopeAll),
    };
  }

  private async assertOwnership(id: string): Promise<any> {
    const row = await this.ds.query(
      `SELECT id, channel_code, channel_name, company_code, status FROM sal_channels WHERE id = $1`,
      [id],
    );
    if (!row?.length) throw new NotFoundException(`渠道 ${id} 不存在`);
    const rec = row[0];
    const user = this.currentUser();
    if (!user.scopeAll && user.companyCodes.length > 0 && !user.companyCodes.includes(rec.company_code)) {
      throw new ForbiddenException(`无权访问公司 ${rec.company_code} 的渠道数据`);
    }
    return rec;
  }

  async list(q: QueryChannelDto) {
    const user = this.currentUser();
    const page  = Math.max(1, q.page  ?? 1);
    const limit = Math.min(200, Math.max(1, q.limit ?? 50));
    const offset = (page - 1) * limit;

    const params: any[] = [];
    const where: string[] = ['1=1'];

    if (!user.scopeAll && user.companyCodes.length > 0) {
      params.push(user.companyCodes);
      where.push(`company_code = ANY($${params.length})`);
    }
    if (q.companyCode) { params.push(q.companyCode); where.push(`company_code = $${params.length}`); }
    if (q.keyword) {
      params.push(`%${q.keyword}%`);
      const i = params.length;
      where.push(`(channel_name ILIKE $${i} OR channel_code ILIKE $${i})`);
    }
    if (q.channelType) { params.push(q.channelType); where.push(`channel_type = $${params.length}`); }
    if (q.status)      { params.push(q.status);      where.push(`status = $${params.length}`); }

    const whereClause = where.join(' AND ');

    const [countRow, rows] = await Promise.all([
      this.ds.query(`SELECT COUNT(*) AS total FROM sal_channels WHERE ${whereClause}`, params),
      this.ds.query(
        `SELECT * FROM sal_channels WHERE ${whereClause} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      ),
    ]);

    return {
      data: rows,
      total: Number(countRow[0].total),
      page,
      limit,
    };
  }

  async findById(id: string) {
    return this.assertOwnership(id);
  }

  async create(dto: CreateChannelDto) {
    const user = this.currentUser();
    if (!user.scopeAll && user.companyCodes.length > 0 && !user.companyCodes.includes(dto.companyCode)) {
      throw new ForbiddenException(`无权在公司 ${dto.companyCode} 下创建渠道`);
    }

    const existing = await this.ds.query(
      `SELECT id FROM sal_channels WHERE channel_code = $1`,
      [dto.channelCode],
    );
    if (existing?.length) throw new ConflictException(`渠道编码 ${dto.channelCode} 已存在`);

    const result = await this.ds.query(
      `INSERT INTO sal_channels (channel_code, channel_name, channel_type, company_code, company_name, status, remark)
       VALUES ($1,$2,$3,$4,$5,'ACTIVE',$6)
       RETURNING *`,
      [
        dto.channelCode, dto.channelName, dto.channelType,
        dto.companyCode, dto.companyName ?? null, dto.remark ?? null,
      ],
    );
    return result[0];
  }

  async update(id: string, dto: UpdateChannelDto) {
    await this.assertOwnership(id);

    const sets: string[] = [];
    const params: any[] = [];

    const addSet = (col: string, val: any) => {
      if (val !== undefined) { params.push(val); sets.push(`${col} = $${params.length}`); }
    };

    addSet('channel_name',  dto.channelName);
    addSet('channel_type',  dto.channelType);
    addSet('company_name',  dto.companyName);
    addSet('remark',        dto.remark);

    if (!sets.length) {
      return this.assertOwnership(id);
    }

    params.push(id);
    const result = await this.ds.query(
      `UPDATE sal_channels SET ${sets.join(', ')} WHERE id = $${params.length} RETURNING *`,
      params,
    );
    return result[0];
  }

  async activate(id: string) {
    const rec = await this.assertOwnership(id);
    if (rec.status === 'ACTIVE') return rec;

    const result = await this.ds.query(
      `UPDATE sal_channels SET status = 'ACTIVE' WHERE id = $1 RETURNING *`,
      [id],
    );
    return result[0];
  }

  async deactivate(id: string) {
    const rec = await this.assertOwnership(id);
    if (rec.status === 'INACTIVE') return rec;

    const result = await this.ds.query(
      `UPDATE sal_channels SET status = 'INACTIVE' WHERE id = $1 RETURNING *`,
      [id],
    );
    return result[0];
  }
}
