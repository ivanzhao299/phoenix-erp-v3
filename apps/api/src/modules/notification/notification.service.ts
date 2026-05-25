import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { SysNotificationEntity } from './entities/sys-notification.entity';

export interface CreateNotificationParams {
  userId: string;
  notificationType?: string;
  title: string;
  content: string;
  linkType?: string;
  linkId?: string;
  bizType?: string;
  bizId?: string;
  bizNo?: string;
}

@Injectable()
export class NotificationService {
  constructor(
    @InjectRepository(SysNotificationEntity)
    private readonly repo: Repository<SysNotificationEntity>,
    private readonly cls: ClsService,
  ) {}

  private currentUserId(): string {
    const u = this.cls.get('user') as any;
    return String(u?.userId ?? u?.id ?? '0');
  }

  async create(params: CreateNotificationParams): Promise<SysNotificationEntity> {
    const entity = this.repo.create({
      userId:           params.userId,
      notificationType: params.notificationType ?? 'WORKFLOW_TASK',
      title:            params.title,
      content:          params.content,
      linkType:         params.linkType ?? null,
      linkId:           params.linkId ?? null,
      bizType:          params.bizType ?? null,
      bizId:            params.bizId ?? null,
      bizNo:            params.bizNo ?? null,
      status:           'UNREAD',
    });
    return this.repo.save(entity);
  }

  async list(q: {
    status?: string;
    notificationType?: string;
    keyword?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ items: SysNotificationEntity[]; total: number }> {
    const userId   = this.currentUserId();
    const page     = Math.max(1, q.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, q.pageSize ?? 20));

    const qb = this.repo.createQueryBuilder('n')
      .where('n.userId = :uid', { uid: userId })
      .orderBy('n.createdAt', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (q.status) qb.andWhere('n.status = :s', { s: q.status });
    if (q.notificationType) qb.andWhere('n.notificationType = :t', { t: q.notificationType });
    if (q.keyword) qb.andWhere('(n.title ILIKE :kw OR n.content ILIKE :kw)', { kw: `%${q.keyword}%` });

    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  async getUnreadCount(): Promise<number> {
    const userId = this.currentUserId();
    return this.repo.count({ where: { userId, status: 'UNREAD' } });
  }

  async markRead(id: string): Promise<void> {
    const userId = this.currentUserId();
    const n = await this.repo.findOne({ where: { id, userId } });
    if (!n || n.status !== 'UNREAD') return;
    n.status = 'READ';
    n.readAt = new Date();
    await this.repo.save(n);
  }

  async markAllRead(): Promise<void> {
    const userId = this.currentUserId();
    await this.repo
      .createQueryBuilder()
      .update(SysNotificationEntity)
      .set({ status: 'READ', readAt: new Date() })
      .where('userId = :uid AND status = :s', { uid: userId, s: 'UNREAD' })
      .execute();
  }

  async archive(id: string): Promise<void> {
    const userId = this.currentUserId();
    const n = await this.repo.findOne({ where: { id, userId } });
    if (!n) return;
    n.status = 'ARCHIVED';
    await this.repo.save(n);
  }
}
