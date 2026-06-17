import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * 把审批引擎在本次请求中暂存到 CLS 的「下一审批人」摘要(approvalHint)注入响应体。
 *
 * 业务 service 调 ApprovalEngineService.startApproval() 时，引擎会把第一步审批人
 * （角色中文名 + 持有该角色的人姓名）写入 CLS；本拦截器在响应阶段统一读取并挂到
 * 响应体的 __approvalHint 字段。前端 api-client 检测到该字段后弹「已提交给 X 审批」。
 *
 * 这样 14+ 个走审批的业务接口都自动带出提示，无需逐个改造。
 */
@Injectable()
export class ApprovalHintInterceptor implements NestInterceptor {
  constructor(private readonly cls: ClsService) {}

  intercept(_ctx: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      map((body) => {
        const hint = this.cls.get('approvalHint') as
          | { roleZh: string | null; names: string[]; stepNo: number }
          | undefined;
        if (hint && body && typeof body === 'object' && !Array.isArray(body)) {
          return { ...(body as Record<string, unknown>), __approvalHint: hint };
        }
        return body;
      }),
    );
  }
}
