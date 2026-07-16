import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { Response } from 'express';

type ErrorResponse = {
  data: null;
  meta: {
    timestamp: string;
    path: string;
  };
  errors: Array<{
    code: string;
    message: string;
    details?: unknown;
  }>;
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<{ url: string }>();
    const status =
      exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR;

    const exceptionResponse =
      exception instanceof HttpException ? exception.getResponse() : 'Internal server error';

    const body: ErrorResponse = {
      data: null,
      meta: {
        timestamp: new Date().toISOString(),
        path: request.url,
      },
      errors: [
        {
          code: this.resolveErrorCode(status, exceptionResponse),
          message: this.resolveErrorMessage(exceptionResponse),
          details: this.resolveErrorDetails(exceptionResponse),
        },
      ],
    };

    response.status(status).json(body);
  }

  private resolveErrorCode(status: number, exceptionResponse: unknown): string {
    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'code' in exceptionResponse
    ) {
      return String(exceptionResponse.code);
    }

    return HttpStatus[status] ?? 'INTERNAL_SERVER_ERROR';
  }

  private resolveErrorMessage(exceptionResponse: unknown): string {
    if (typeof exceptionResponse === 'string') {
      return exceptionResponse;
    }

    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'message' in exceptionResponse
    ) {
      const message = exceptionResponse.message;
      return Array.isArray(message) ? message.join(', ') : String(message);
    }

    return 'Internal server error';
  }

  private resolveErrorDetails(exceptionResponse: unknown): unknown {
    if (
      typeof exceptionResponse === 'object' &&
      exceptionResponse !== null &&
      'details' in exceptionResponse
    ) {
      return exceptionResponse.details;
    }

    return undefined;
  }
}
