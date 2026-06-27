import { Injectable } from '@nestjs/common';

/**
 * G171：在线用户在线状态（基于 SSE 长连接）。
 * 每个用户可能有多条连接（多标签页/多设备）——用连接计数，归零才算离线。
 * 进程内内存（当前生产单 API 容器）；多实例需换 Redis。
 */
@Injectable()
export class PresenceService {
  private readonly users = new Map<string, { connections: number; lastSeen: number; since: number }>();

  connect(userId: string): void {
    const uid = String(userId);
    const e = this.users.get(uid);
    if (e) {
      e.connections += 1;
      e.lastSeen = Date.now();
    } else {
      this.users.set(uid, { connections: 1, lastSeen: Date.now(), since: Date.now() });
    }
  }

  disconnect(userId: string): void {
    const uid = String(userId);
    const e = this.users.get(uid);
    if (!e) return;
    e.connections -= 1;
    e.lastSeen = Date.now();
    if (e.connections <= 0) this.users.delete(uid);
  }

  onlineUserIds(): string[] {
    return [...this.users.keys()];
  }

  onlineCount(): number {
    return this.users.size;
  }

  snapshot(): { userId: string; connections: number; lastSeen: number; since: number }[] {
    return [...this.users.entries()].map(([userId, e]) => ({ userId, ...e }));
  }
}
