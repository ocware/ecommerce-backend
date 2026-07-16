import { CallHandler, ExecutionContext, Injectable, Logger, NestInterceptor } from '@nestjs/common';
import { Observable, tap } from 'rxjs';

@Injectable()
export class RequestLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestLoggingInterceptor.name);

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<{
      method: string;
      originalUrl?: string;
      url: string;
    }>();
    const startedAt = Date.now();

    return next.handle().pipe(
      tap(() => {
        const url = request.originalUrl ?? request.url;
        this.logger.log(`${request.method} ${url} ${Date.now() - startedAt}ms`);
      }),
    );
  }
}
