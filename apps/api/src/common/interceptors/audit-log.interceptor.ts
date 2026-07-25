import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { ClsService } from 'nestjs-cls';
// import { InjectRepository } from '@nestjs/typeorm';
// import { Repository } from 'typeorm';
// import { SysAuditLog } from '../../models/sys-audit-log.entity';

/**
 * 全局审计日志拦截器 (NestJS Interceptor)
 * 作用:
 * 拦截所有会导致状态变更的 HTTP 请求 (POST/PUT/DELETE/PATCH 等)。
 * 在请求成功响应后，异步提取变更前后的核心数据 (Diff) 存入 sys_audit_log 表。
 * 
 * V3.0 规范: 
 * 所有 CREATE/UPDATE/DELETE/APPROVE/REJECT/EXPORT 必须写 sys_audit_log。
 */
@Injectable()
export class AuditLogInterceptor implements NestInterceptor {
  constructor(
    private readonly cls: ClsService,
    // 实际项目中解除注释以注入日志存储库
    // @InjectRepository(SysAuditLog)
    // private auditLogRepo: Repository<SysAuditLog>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();

    // 将 JWT 验证后的用户写入 CLS，让 Service 层通过 cls.get('user.*') 读取审计字段
    if (request.user && !this.cls.get('user')) {
      this.cls.set('user', request.user);
    }
    const method = request.method;

    // 如果是纯读取操作 (GET)，除了导出(通常在Controller特别处理)外，不记录审计
    if (method === 'GET') {
      return next.handle();
    }

    const user = request.user;
    const body = request.body;
    const path = request.route?.path || request.url;
    const ip = request.ip || request.headers['x-forwarded-for'];
    const userAgent = request.headers['user-agent'];

    // 确定动作类型
    let action = 'UNKNOWN';
    if (method === 'POST') {
      if (path.includes('approve')) action = 'APPROVE';
      else if (path.includes('reject')) action = 'REJECT';
      else if (path.includes('export')) action = 'EXPORT';
      else action = 'CREATE';
    } else if (method === 'PUT' || method === 'PATCH') {
      action = 'UPDATE';
    } else if (method === 'DELETE') {
      action = 'DELETE';
    }

    // 假设业务中我们将变更前的值挂载在 req 上的一个特殊属性 (由中间件提前查出)
    const beforeValue = request['beforeValue'] || null;

    // 拦截响应
    return next.handle().pipe(
      tap(async (responseBody) => {
        if (!user) return; // 未登录操作(如登录接口本身)，通常在专门地方记录

        const logEntry = {
          user_id: user.userId,
          user_name: user.realName || user.username,
          action: action,
          entity_type: this.guessEntityType(path),
          entity_id: this.guessEntityId(request.params, responseBody),
          before_value: beforeValue,
          after_value: summarizeAuditValue(responseBody),
          ip_addr: ip,
          user_agent: userAgent,
        };

        // 异步写入数据库 (不要 await 以免阻塞响应)
        try {
          // await this.auditLogRepo.save(logEntry);
          // Never print the full HTTP response. Integration and Agent endpoints
          // can return thousands of rows or large evidence payloads; formatting
          // those objects duplicated them on the Node heap and contributed to
          // production OOM/restart loops.
          console.log('[AuditLogInterceptor] Recorded:', logEntry);
        } catch (error) {
          console.error('[AuditLogInterceptor] Failed to write audit log:', error);
        }
      }),
    );
  }

  /**
   * 简单推测实体类型，实际中建议用自定义装饰器在 Controller 上显式声明 EntityType
   */
  private guessEntityType(path: string): string {
    const segments = path.split('/').filter(Boolean);
    return segments.length > 0 ? segments[0].toUpperCase() : 'UNKNOWN';
  }

  /**
   * 推测实体 ID
   */
  private guessEntityId(params: any, responseBody: any): string | null {
    if (params && params.id) return String(params.id);
    if (responseBody && responseBody.id) return String(responseBody.id);
    return null;
  }
}

function summarizeAuditValue(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) {
    return {
      responseType: 'array',
      count: value.length,
      sampleIds: value.slice(0, 5).map((item) => (
        item && typeof item === 'object'
          ? String((item as Record<string, unknown>).id ?? (item as Record<string, unknown>).bugNo ?? '')
          : ''
      )).filter(Boolean),
    };
  }
  if (typeof value !== 'object') {
    return { responseType: typeof value, value: String(value).slice(0, 256) };
  }
  const row = value as Record<string, unknown>;
  const data = row.data;
  return {
    responseType: 'object',
    success: typeof row.success === 'boolean' ? row.success : undefined,
    decision: typeof row.decision === 'string' ? row.decision.slice(0, 64) : undefined,
    status: typeof row.status === 'string' ? row.status.slice(0, 64) : undefined,
    id: row.id === undefined ? undefined : String(row.id).slice(0, 128),
    bugNo: row.bugNo === undefined ? undefined : String(row.bugNo).slice(0, 128),
    dataType: Array.isArray(data) ? 'array' : typeof data,
    dataCount: Array.isArray(data) ? data.length : undefined,
    keys: Object.keys(row).slice(0, 20),
  };
}
