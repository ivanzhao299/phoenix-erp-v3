import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ThrottlerException } from '@nestjs/throttler';

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
      this.logger.warn(`[DB] PG${pgCode} on ${req.method} ${req.url} — ${err?.message} col:${err?.column}`);
      return res.status(400).json({ code: 400, msg: PG_ERROR_MAP[pgCode] });
    }

    // 未知错误 — 只记录到日志，不暴露堆栈给客户端
    this.logger.error(
      `[Unhandled] ${req.method} ${req.url} — ${err?.message}`,
      err?.stack,
    );
    return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      code: 500,
      msg: '服务器内部错误，请联系管理员',
    });
  }
}
