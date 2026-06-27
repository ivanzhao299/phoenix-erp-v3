import { Injectable, MessageEvent } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ClsService } from 'nestjs-cls';
import { Subject, Observable } from 'rxjs';
import { filter, map } from 'rxjs/operators';
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

  // G167-SSE：进程内实时事件流——create() 落库后向该用户推一条，SSE 控制器按 userId 过滤下发。
  //   单实例内存广播（当前生产单 API 容器）；将来多实例需换 Redis pub/sub。
  private readonly stream$ = new Subject<{ userId: string; data: Record<string, unknown> }>();

  /** 指定用户的 SSE 事件流（NotificationStreamController 用） */
  userStream(userId: string): Observable<MessageEvent> {
    const uid = String(userId);
    return this.stream$.asObservable().pipe(
      filter((m) => m.userId === uid),
      map((m) => ({ data: m.data }) as MessageEvent),
    );
  }

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
    const saved = await this.repo.save(entity);
    // 实时推送（同步触发，不影响落库结果）
    try {
      this.stream$.next({
        userId: String(saved.userId),
        data: {
          type: 'notification',
          id: saved.id,
          notificationType: saved.notificationType,
          title: saved.title,
          content: saved.content,
          bizType: saved.bizType,
          bizNo: saved.bizNo,
          linkType: saved.linkType,
          linkId: saved.linkId,
          createdAt: saved.createdAt,
        },
      });
    } catch { /* 推送失败不影响主流程 */ }
    return saved;
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
