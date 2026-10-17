import { CallHandler, ExecutionContext, Injectable, NestInterceptor, ServiceUnavailableException } from '@nestjs/common';
import { defer, lastValueFrom, Observable } from 'rxjs';
import { BackgroundTaskService } from './background-task.service';
import { BackgroundAdmissionDeniedError } from './background-control.types';

@Injectable()
export class BackgroundHttpInterceptor implements NestInterceptor {
  constructor(private readonly tasks: BackgroundTaskService) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const request = context.switchToHttp().getRequest<{ method: string }>();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method.toUpperCase())) return next.handle();
    return defer(async () => {
      try { return await this.tasks.run('http.mutation', 'LOCAL', () => lastValueFrom(next.handle())); }
      catch (error) {
        if (error instanceof BackgroundAdmissionDeniedError) throw new ServiceUnavailableException('BACKGROUND_CONTROL_HOLD');
        throw error;
      }
    });
  }
}
