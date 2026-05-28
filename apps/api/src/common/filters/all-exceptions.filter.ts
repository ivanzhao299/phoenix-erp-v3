import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
  Optional,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ThrottlerException } from '@nestjs/throttler';
import { SysErrorLogsService } from '../../modules/system-monitor/services/sys-error-logs.service';

// PostgreSQL 错误码 → 用户友好消息（不暴露表名/约束名）
const PG_ERROR_MAP: Record<string, string> = {
  '23505': '数据已存在，请勿重复提交',
  '23503': '关联数据不存在，操作被拒绝',
  '23502': '必填字段不能为空',
  '22001': '输入内容超过字段长度限制',
  '22P02': '数据格式不正确',
  '42703': '字段不存在，请联系管理员',
};

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  constructor(
    @Optional() private readonly errorLogService?: SysErrorLogsService,
  ) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx  = host.switchToHttp();
    const req  = ctx.getRequest<Request>();
    const res  = ctx.getResponse<Response>();

    // 速率限制
    if (exception instanceof ThrottlerException) {
      return res.status(429).json({ code: 429, msg: '请求过于频繁，请稍后再试' });
    }

    // NestJS HTTP 异常（ForbiddenException、NotFoundException 等）— 直接透传
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body   = exception.getResponse();
      // 4xx 不写错误日志，避免噪音
      return res.status(status).json(
        typeof body === 'string'
          ? { code: status, msg: body }
          : { code: status, ...(body as object) },
      );
    }

    // PostgreSQL 数据库错误 — 映射友好消息，隐藏内部细节
    const err = exception as any;
    const pgCode: string | undefined = err?.code;
    if (pgCode && PG_ERROR_MAP[pgCode]) {
      const msg = PG_ERROR_MAP[pgCode];
      this.logger.warn(`[DB] PG${pgCode} on ${req.method} ${req.url} — ${err?.message} col:${err?.column}`);
      // 写错误日志（异步，不阻塞响应）
      this.writeErrorLog({
        errorType:     'PG_ERROR',
        httpStatus:    400,
        errorMessage:  msg,
        pgErrorCode:   pgCode,
        req,
        stackTrace:    err?.stack,
      });
      return res.status(400).json({ code: 400, msg });
    }

    // 未知错误 — 只记录到日志，不暴露堆栈给客户端
    this.logger.error(
      `[Unhandled] ${req.method} ${req.url} — ${err?.message}`,
      err?.stack,
    );
    // 写错误日志（异步）
    this.writeErrorLog({
      errorType:    'UNHANDLED',
      httpStatus:   500,
      errorMessage: err?.message ?? 'Unknown error',
      stackTrace:   err?.stack,
      req,
    });
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 500,
      msg: '服务器内部错误，请联系管理员',
    });
  }

  /** 异步写入 sys_error_logs（失败时静默忽略，避免死循环） */
  private writeErrorLog(params: {
    errorType:    string;
    httpStatus:   number;
    errorMessage: string;
    stackTrace?:  string;
    pgErrorCode?: string;
    req:          Request;
  }) {
    if (!this.errorLogService) return;

    const user      = (params.req as any).user;
    const userId    = user?.userId ?? user?.id ?? null;
    const username  = user?.name ?? user?.username ?? null;
    const ip        = (params.req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim()
                      ?? params.req.ip
                      ?? null;
    const userAgent = (params.req.headers['user-agent'] as string) ?? null;

    // 安全地提取请求体摘要（最多 2KB）
    let requestBody: Record<string, any> | null = null;
    try {
      const body = (params.req as any).body;
      if (body && typeof body === 'object') {
        const str = JSON.stringify(body);
        requestBody = str.length <= 2048 ? body : { _truncated: true };
      }
    } catch { /* ignore */ }

    this.errorLogService.writeLog({
      errorType:     params.errorType,
      httpStatus:    params.httpStatus,
      errorMessage:  params.errorMessage,
      stackTrace:    process.env.NODE_ENV !== 'production' ? params.stackTrace : undefined,
      pgErrorCode:   params.pgErrorCode,
      requestMethod: params.req.method,
      requestPath:   params.req.url,
      requestBody,
      userId:        userId != null ? Number(userId) : null,
      username:      username ?? undefined,
      ipAddress:     ip ?? undefined,
      userAgent:     userAgent ?? undefined,
    }).catch(e => this.logger.error('[AllExceptionsFilter] writeLog failed:', e?.message));
  }
}
