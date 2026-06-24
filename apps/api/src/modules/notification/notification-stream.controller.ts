import { Controller, Sse, Query, MessageEvent, UnauthorizedException } from '@nestjs/common';
import { Observable, merge, interval, of } from 'rxjs';
import { map } from 'rxjs/operators';
import * as jwt from 'jsonwebtoken';
import { Public } from '../../common/guards/menu.guard';
import { NotificationService } from './notification.service';
import { PresenceService } from './presence.service';

// 与 jwt.strategy 一致的开发回退密钥（生产必配 JWT_SECRET）
const FALLBACK = 'DEV_ONLY_INSECURE_FALLBACK_KEY_DO_NOT_USE_IN_PROD';

function verifyUserId(token?: string): string | null {
  if (!token) return null;
  const secrets = [process.env.JWT_SECRET || FALLBACK, process.env.JWT_SECRET_PREV || ''].filter(Boolean);
  for (const sec of secrets) {
    try {
      const p = jwt.verify(token, sec) as Record<string, unknown>;
      const uid = p?.userId ?? p?.sub ?? p?.user_id;
      if (uid != null) return String(uid);
    } catch { /* 换下一个密钥 */ }
  }
  return null;
}

/**
 * G167-SSE：通知/审批实时事件流。
 * EventSource 不能携带 Authorization 头 → 用 @Public 绕全局 MenuGuard，改用 ?token= 自验签。
 * 心跳 25s 保活（穿透反代）；事件由 NotificationService.create() 在落库后推送。
 * 生产 nginx 将 /api/notifications/stream 直连 API:3100 + proxy_buffering off + 长超时。
 */
@Controller()
export class NotificationStreamController {
  constructor(
    private readonly svc: NotificationService,
    private readonly presence: PresenceService,
  ) {}

  @Public()
  @Sse('api/notifications/stream')
  stream(@Query('token') token?: string): Observable<MessageEvent> {
    const userId = verifyUserId(token);
    if (!userId) {
      throw new UnauthorizedException('Token 无效或已过期');
    }
    const connected$ = of({ data: { type: 'connected' } } as MessageEvent);
    const heartbeat$ = interval(25000).pipe(map(() => ({ data: { type: 'ping' } }) as MessageEvent));
    const merged$ = merge(connected$, this.svc.userStream(userId), heartbeat$);
    // G171：订阅=上线、退订(关连接)=下线 —— 在线用户基于此统计
    return new Observable<MessageEvent>((subscriber) => {
      this.presence.connect(userId);
      const sub = merged$.subscribe(subscriber);
      return () => { sub.unsubscribe(); this.presence.disconnect(userId); };
    });
  }
}
