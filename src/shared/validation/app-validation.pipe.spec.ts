import { IsString, MinLength } from 'class-validator';

import { createAppValidationPipe } from './app-validation.pipe';
import { VALIDATION_ERROR_CODE } from './validation-error-code';

class ValidationFixture {
  @IsString()
  @MinLength(3)
  name!: string;
}

describe('createAppValidationPipe', () => {
  it('returns structured field errors with a stable code', async () => {
    const pipe = createAppValidationPipe();

    await expect(
      pipe.transform(
        { name: 'x', unexpected: true },
        {
          type: 'body',
          metatype: ValidationFixture,
        },
      ),
    ).rejects.toMatchObject({
      response: {
        code: VALIDATION_ERROR_CODE,
        message: 'Request validation failed.',
        details: {
          fields: expect.arrayContaining([
            expect.objectContaining({ field: 'name' }),
            expect.objectContaining({ field: 'unexpected' }),
          ]) as unknown[],
        },
      },
    });
  });
});
