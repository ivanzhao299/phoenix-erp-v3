import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
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
    // 实际项目中解除注释以注入日志存储库
    // @InjectRepository(SysAuditLog)
    // private auditLogRepo: Repository<SysAuditLog>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();
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

        const afterValue = responseBody; // 或基于 body 构建
        
        const logEntry = {
          user_id: user.userId,
          user_name: user.realName || user.username,
          action: action,
          entity_type: this.guessEntityType(path),
          entity_id: this.guessEntityId(request.params, responseBody),
          before_value: beforeValue,
          after_value: afterValue,
          ip_addr: ip,
          user_agent: userAgent,
        };

        // 异步写入数据库 (不要 await 以免阻塞响应)
        try {
          // await this.auditLogRepo.save(logEntry);
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
