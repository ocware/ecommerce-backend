import { BadRequestException, ValidationError, ValidationPipe } from '@nestjs/common';

import { VALIDATION_ERROR_CODE } from './validation-error-code';

type ValidationFieldError = {
  field: string;
  messages: string[];
};

export function createAppValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    exceptionFactory: (errors) =>
      new BadRequestException({
        code: VALIDATION_ERROR_CODE,
        message: 'Request validation failed.',
        details: { fields: collectFieldErrors(errors) },
      }),
  });
}

function collectFieldErrors(errors: ValidationError[], parentPath = ''): ValidationFieldError[] {
  return errors.flatMap((error) => {
    const field = parentPath ? `${parentPath}.${error.property}` : error.property;
    const current = error.constraints
      ? [{ field, messages: Object.values(error.constraints) }]
      : [];
    return [...current, ...collectFieldErrors(error.children ?? [], field)];
  });
}
