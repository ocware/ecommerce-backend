import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Observable, map } from 'rxjs';

export type ResponseEnvelope<T> = {
  data: T;
  meta: Record<string, unknown>;
  errors: [];
};

@Injectable()
export class ResponseEnvelopeInterceptor<T> implements NestInterceptor<T, ResponseEnvelope<T>> {
  intercept(_context: ExecutionContext, next: CallHandler<T>): Observable<ResponseEnvelope<T>> {
    return next.handle().pipe(
      map((data) => ({
        data,
        meta: {},
        errors: [],
      })),
    );
  }
}
