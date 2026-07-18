import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import {
  OpenAPIObject,
  OperationObject,
  ParameterObject,
  PathItemObject,
  ReferenceObject,
  RequestBodyObject,
  ResponseObject,
  SchemaObject,
} from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';

const HTTP_METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;

type HttpMethod = (typeof HTTP_METHODS)[number];

type OperationContext = {
  method: HttpMethod;
  path: string;
  operation: OperationObject;
};

const TAG_DESCRIPTIONS: Record<string, string> = {
  health: 'Liveness and service health checks for deployment probes and operators.',
  'admin auth': 'Staff authentication, sessions, token refresh, and password recovery.',
  'admin staff': 'Staff accounts, roles, permissions, sessions, and administrative audit data.',
  'admin catalog':
    'Administrative product, variant, category, brand, attribute, and collection management.',
  'store catalog':
    'Public storefront catalog browsing, search, product details, and merchandising data.',
  'admin customers':
    'Customer account administration, status, notes, addresses, and consent records.',
  'store customers':
    'Customer registration, authentication, profile, addresses, and account history.',
  'store customer cart': 'Authenticated customer cart operations and guest-cart merging.',
  'store guest carts': 'Guest cart lifecycle secured by an opaque cart token.',
  'admin discounts': 'Coupon and automatic discount configuration, restrictions, and usage rules.',
  'admin inventory':
    'Stock levels, adjustments, reservations, movements, and restoration operations.',
  'store inventory': 'Storefront stock availability for purchasable product variants.',
  'admin media': 'Product images, category images, banners, and shop branding asset management.',
  'store media': 'Public shop logo and active storefront banners.',
  'admin notifications':
    'Notification delivery records, templates, retries, and operational status.',
  'admin orders': 'Order administration, status transitions, cancellation, and purchase snapshots.',
  'store checkout':
    'Checkout orchestration: validation, stock reservation, and immutable order creation.',
  'store orders': 'Authenticated and guest order lookup, history, and cancellation.',
  'admin payments': 'Administrative payment inspection and idempotent refund operations.',
  'payment webhooks':
    'Gateway callbacks verified and processed idempotently by the selected payment adapter.',
  'store guest payments':
    'Guest checkout payment start and verification secured by the cart token.',
  'store payments': 'Authenticated customer payment start and verification.',
  'admin reports':
    'Read-only operational, sales, customer, product, inventory, and discount reporting.',
  'admin settings': 'Database-backed shop behavior and feature-toggle administration.',
  'store settings': 'Public shop settings and enabled storefront capabilities.',
  'admin shipments': 'Shipment creation, cancellation, tracking, and fulfillment administration.',
  'admin shipping configuration': 'Shipping methods, zones, rates, and provider configuration.',
  'store shipping': 'Storefront shipping-rate calculation and available delivery methods.',
};

const PARAMETER_DESCRIPTIONS: Record<string, string> = {
  id: 'Unique resource identifier.',
  productId: 'Product identifier.',
  variantId: 'Product variant identifier.',
  categoryId: 'Category identifier.',
  customerId: 'Customer identifier.',
  orderId: 'Order identifier.',
  paymentId: 'Payment identifier.',
  shipmentId: 'Shipment identifier.',
  reservationId: 'Inventory reservation identifier.',
  code: 'Human-readable code used to identify the resource.',
  page: 'One-based results page.',
  limit: 'Maximum number of results to return.',
  sort: 'Field and direction used to sort the results.',
  search: 'Free-text search term.',
  status: 'Filter results by status.',
};

const OPERATION_DETAILS: Record<string, { summary: string; description: string }> = {
  'AdminAuthController.login': {
    summary: 'Sign in a staff member',
    description: 'Authenticates a staff account and issues staff access and refresh credentials.',
  },
  'AdminAuthController.refresh': {
    summary: 'Refresh staff credentials',
    description: 'Rotates a valid staff refresh token and returns a new credential pair.',
  },
  'StoreCustomersController.register': {
    summary: 'Register a customer',
    description: 'Creates a customer account independently from staff administration accounts.',
  },
  'StoreCustomersController.login': {
    summary: 'Sign in a customer',
    description: 'Authenticates a customer account and issues customer-scoped credentials.',
  },
  'StoreCheckoutController.checkout': {
    summary: 'Create an order from a customer cart',
    description:
      'Revalidates prices and discounts, reserves inventory, stores immutable purchase snapshots, and creates the order atomically.',
  },
  'StoreCheckoutController.checkoutGuest': {
    summary: 'Create an order from a guest cart',
    description:
      'Uses the guest cart token to revalidate totals, reserve inventory, snapshot purchased items and customer details, and create the order atomically.',
  },
  'StorePaymentsController.start': {
    summary: 'Start a customer payment',
    description:
      'Creates an idempotent payment attempt for the authenticated customer order and returns gateway continuation data.',
  },
  'StorePaymentsController.verify': {
    summary: 'Verify a customer payment',
    description:
      'Verifies payment with the configured gateway; successful verification confirms reserved inventory and emits downstream events.',
  },
  'StoreGuestPaymentsController.start': {
    summary: 'Start a guest payment',
    description:
      'Creates an idempotent payment attempt after validating ownership through the opaque guest cart token.',
  },
  'StoreGuestPaymentsController.verify': {
    summary: 'Verify a guest payment',
    description:
      'Verifies the guest payment directly with the configured gateway before confirming the order and its inventory.',
  },
  'PaymentWebhooksController.handle': {
    summary: 'Process a payment gateway webhook',
    description:
      'Passes the raw gateway callback to the selected adapter for signature verification and idempotent state processing.',
  },
  'AdminPaymentsController.refund': {
    summary: 'Refund a payment',
    description:
      'Requests an idempotent refund through the configured gateway and records the resulting refund state separately from payment and order status.',
  },
};

const ERROR_RESPONSES: Record<string, { description: string; code: string; message: string }> = {
  '400': {
    description: 'The request is malformed or failed validation.',
    code: 'VALIDATION_ERROR',
    message: 'The request could not be validated.',
  },
  '401': {
    description: 'Authentication credentials are missing, expired, or invalid.',
    code: 'UNAUTHORIZED',
    message: 'Authentication is required.',
  },
  '403': {
    description: 'The authenticated account does not have the required permission.',
    code: 'FORBIDDEN',
    message: 'You do not have permission to perform this action.',
  },
  '404': {
    description: 'The requested resource was not found or is not visible to this account.',
    code: 'RESOURCE_NOT_FOUND',
    message: 'The requested resource was not found.',
  },
  '409': {
    description: 'The request conflicts with current resource or business state.',
    code: 'RESOURCE_CONFLICT',
    message: 'The operation conflicts with the current resource state.',
  },
  '429': {
    description: 'The request was rejected by an applicable rate limit.',
    code: 'TOO_MANY_REQUESTS',
    message: 'Too many requests. Try again later.',
  },
  '500': {
    description: 'An unexpected internal error occurred.',
    code: 'INTERNAL_SERVER_ERROR',
    message: 'Internal server error.',
  },
};

export function createOpenApiDocument(app: INestApplication, apiVersion: string): OpenAPIObject {
  let builder = new DocumentBuilder()
    .setTitle('E-commerce Backend API')
    .setDescription(
      [
        'Reusable modular-monolith commerce API for isolated shop deployments.',
        '',
        'All business routes are versioned under `/api/v1`. Store and admin APIs are separated. Staff and customer bearer tokens are not interchangeable.',
        '',
        'Successful JSON responses use `{ data, meta, errors: [] }`. Errors use `{ data: null, meta, errors: [{ code, message, details }] }`.',
        '',
        'Guest cart and guest checkout routes use `x-cart-token`. Payment creation, callbacks, and refunds use idempotency so safe retries do not duplicate external effects.',
      ].join('\n'),
    )
    .setVersion(apiVersion)
    .addServer('/', 'Current deployment')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description:
          'Use the staff or customer access token appropriate for the route group. Tokens are not interchangeable.',
      },
      'bearer',
    );

  for (const [name, description] of Object.entries(TAG_DESCRIPTIONS)) {
    builder = builder.addTag(name, description);
  }

  const document = SwaggerModule.createDocument(app, builder.build(), {
    operationIdFactory: (controllerKey, methodKey) => `${controllerKey}.${methodKey}`,
  });

  enrichDocument(document);
  return document;
}

export function setupOpenApi(
  app: INestApplication,
  apiPrefix: string,
  apiVersion: string,
): OpenAPIObject {
  const document = createOpenApiDocument(app, apiVersion);

  SwaggerModule.setup(`${apiPrefix}/docs`, app, document, {
    customSiteTitle: 'E-commerce Backend API Reference',
    jsonDocumentUrl: `${apiPrefix}/openapi.json`,
    yamlDocumentUrl: `${apiPrefix}/openapi.yaml`,
    swaggerOptions: {
      displayRequestDuration: true,
      filter: true,
      persistAuthorization: true,
      tagsSorter: 'alpha',
      operationsSorter: 'alpha',
    },
  });

  return document;
}

function enrichDocument(document: OpenAPIObject): void {
  document.components ??= {};
  document.components.schemas ??= {};
  Object.assign(document.components.schemas, createSharedSchemas());

  for (const [schemaName, schema] of Object.entries(document.components.schemas)) {
    if (!isReference(schema)) {
      enrichSchema(schema, `Schema for ${humanize(schemaName)}.`);
    }
  }

  for (const [path, pathItem] of Object.entries(document.paths)) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) {
        continue;
      }

      enrichOperation({ method, path, operation });
    }
  }
}

function enrichSchema(schema: SchemaObject, fallbackDescription: string): void {
  schema.description ??= fallbackDescription;

  for (const [propertyName, propertySchema] of Object.entries(schema.properties ?? {})) {
    if (isReference(propertySchema)) {
      continue;
    }
    enrichSchema(propertySchema, `${humanize(propertyName)} value.`);
  }

  if (schema.items && !isReference(schema.items)) {
    enrichSchema(schema.items, 'One item in this collection.');
  }

  for (const composition of [schema.allOf, schema.oneOf, schema.anyOf]) {
    for (const nestedSchema of composition ?? []) {
      if (!isReference(nestedSchema)) {
        enrichSchema(nestedSchema, 'Composed schema value.');
      }
    }
  }
}

function enrichOperation(context: OperationContext): void {
  const { method, operation, path } = context;
  const operationId = operation.operationId ?? `${method}.${path}`;
  const details = OPERATION_DETAILS[operationId];

  operation.summary = details?.summary ?? buildSummary(operationId);
  operation.description = buildDescription(context, details?.description);
  operation.tags = operation.tags?.length ? operation.tags : ['unclassified'];

  enrichParameters(operation);
  enrichRequestBody(operation);
  enrichMultipartBody(operation);
  enrichResponses(context);
}

function buildSummary(operationId: string): string {
  const methodName = operationId.split('.').at(-1) ?? operationId;
  return humanize(methodName).replace(/^./, (character) => character.toUpperCase());
}

function buildDescription(context: OperationContext, specificDescription?: string): string {
  const accessDescription = describeAccess(context);
  const retryDescription = hasParameter(context.operation, 'Idempotency-Key')
    ? 'Supply a stable `Idempotency-Key` when retrying the same logical request.'
    : undefined;
  const parts = [
    specificDescription ?? describeMethod(context),
    accessDescription,
    retryDescription,
  ];
  return `${parts.filter(Boolean).join(' ')} Responses use the standard API envelope.`;
}

function describeMethod({ method, path, operation }: OperationContext): string {
  const tag = humanize(operation.tags?.[0] ?? 'API');
  const action: Record<HttpMethod, string> = {
    get: 'Reads',
    post: 'Creates or executes',
    put: 'Replaces or applies',
    patch: 'Partially updates',
    delete: 'Removes or deactivates',
  };
  return `${action[method]} the requested ${tag} resource at \`${path}\`.`;
}

function describeAccess({ path, operation }: OperationContext): string {
  if (path.includes('/payment/webhooks/')) {
    return 'This public integration endpoint verifies the gateway payload before changing state.';
  }
  if (hasParameter(operation, 'x-cart-token')) {
    return 'Requires the opaque guest cart token issued with the guest cart.';
  }
  if (operation.security?.length) {
    return path.includes('/admin/')
      ? 'Requires a staff bearer token and the permission declared by the endpoint.'
      : 'Requires a customer bearer token.';
  }
  return path.includes('/store/')
    ? 'This is a public storefront operation.'
    : 'This operation does not require bearer authentication.';
}

function enrichParameters(operation: OperationObject): void {
  for (const parameter of operation.parameters ?? []) {
    if (isReference(parameter)) {
      continue;
    }

    const canonicalName = parameter.name.toLowerCase();
    const configuredDescription = Object.entries(PARAMETER_DESCRIPTIONS).find(
      ([name]) => name.toLowerCase() === canonicalName,
    )?.[1];
    parameter.description ??=
      configuredDescription ??
      (parameter.in === 'query'
        ? `Optional query value for ${humanize(parameter.name)}.`
        : `${humanize(parameter.name)} value.`);

    if (canonicalName === 'x-cart-token') {
      parameter.description =
        'Opaque token returned when the guest cart was created. Treat it as a credential and do not expose it in URLs.';
      parameter.example = 'cart_01J4M7Y2A8QF6ZP3K9W5N1R0TX';
    }

    if (canonicalName === 'idempotency-key') {
      parameter.description =
        'Unique key for one logical operation. Reuse the same key only when safely retrying that operation.';
      parameter.example = '01J4M8D8QZ4P7CY9B2W6F0TNKS';
    }
  }
}

function enrichRequestBody(operation: OperationObject): void {
  const requestBody = operation.requestBody;
  if (!requestBody || isReference(requestBody)) {
    return;
  }
  requestBody.description ??= 'Validated request payload for this operation.';
}

function enrichMultipartBody(operation: OperationObject): void {
  const requestBody = operation.requestBody;
  if (!requestBody || isReference(requestBody)) {
    return;
  }
  const multipart = requestBody.content['multipart/form-data'];
  if (!multipart) {
    return;
  }

  multipart.schema = {
    allOf: [
      multipart.schema ?? { type: 'object' },
      {
        type: 'object',
        required: ['file'],
        properties: {
          file: {
            type: 'string',
            format: 'binary',
            description: 'Image file uploaded as multipart form data.',
          },
        },
      },
    ],
  };
  requestBody.description =
    'Multipart image upload. The `file` field is required; the remaining fields provide asset metadata.';
}

function enrichResponses(context: OperationContext): void {
  const { operation } = context;
  const successStatuses = Object.keys(operation.responses).filter((status) =>
    /^2\d\d$/.test(status),
  );
  if (successStatuses.length === 0) {
    const status = context.method === 'post' ? '201' : '200';
    operation.responses[status] = { description: successDescription(status, context.method) };
    successStatuses.push(status);
  }

  for (const status of successStatuses) {
    const response = operation.responses[status];
    if (!response || isReference(response)) {
      continue;
    }
    response.description ||= successDescription(status, context.method);
    if (status !== '204') {
      wrapSuccessResponse(response);
    }
  }

  const errorStatuses = new Set(['400', '429', '500']);
  if (operation.security?.length) {
    errorStatuses.add('401');
  }
  if (operation.security?.length && context.path.includes('/admin/')) {
    errorStatuses.add('403');
  }
  if (context.path.includes('{')) {
    errorStatuses.add('404');
  }
  if (context.method !== 'get') {
    errorStatuses.add('409');
  }

  for (const status of errorStatuses) {
    operation.responses[status] ??= createErrorResponse(status, context.path);
  }
}

function wrapSuccessResponse(response: ResponseObject): void {
  response.content ??= {};
  const mediaType = response.content['application/json'] ?? {};
  const originalSchema = mediaType.schema ?? {};
  const configuredExample = mediaType.example as unknown;
  const originalExample: unknown = configuredExample ?? extractSchemaExample(originalSchema);

  mediaType.schema = {
    allOf: [
      { $ref: '#/components/schemas/ApiSuccessResponse' },
      {
        type: 'object',
        properties: {
          data: originalSchema,
        },
      },
    ],
  };
  if (originalExample !== undefined) {
    mediaType.example = { data: originalExample, meta: {}, errors: [] };
  }
  response.content['application/json'] = mediaType;
}

function extractSchemaExample(schema: SchemaObject | ReferenceObject): unknown {
  return isReference(schema) ? undefined : schema.example;
}

function successDescription(status: string, method: HttpMethod): string {
  if (status === '201') {
    return 'The operation completed and created a resource or processing attempt.';
  }
  if (status === '204') {
    return 'The operation completed successfully with no response body.';
  }
  return method === 'get'
    ? 'The requested data was returned successfully.'
    : 'The operation completed successfully.';
}

function createErrorResponse(status: string, path: string): ResponseObject {
  const error = ERROR_RESPONSES[status] ?? ERROR_RESPONSES['500'];
  return {
    description: error.description,
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ApiErrorResponse' },
        example: {
          data: null,
          meta: {
            timestamp: '2026-01-15T12:00:00.000Z',
            path: path.replace(/\{([^}]+)\}/g, ':$1'),
          },
          errors: [
            {
              code: error.code,
              message: error.message,
              details: {},
            },
          ],
        },
      },
    },
  };
}

function createSharedSchemas(): Record<string, SchemaObject> {
  return {
    ApiError: {
      type: 'object',
      description: 'One machine-readable API error.',
      required: ['code', 'message'],
      properties: {
        code: {
          type: 'string',
          description: 'Stable machine-readable error code.',
          example: 'INSUFFICIENT_STOCK',
        },
        message: {
          type: 'string',
          description: 'Human-readable error summary.',
          example: 'The requested quantity is unavailable.',
        },
        details: {
          type: 'object',
          description: 'Structured context specific to the error code.',
          additionalProperties: true,
          example: { variantId: '4ef61ef5-c3a9-4bd6-9506-e2be8d5bb02f', available: 2 },
        },
      },
    },
    ApiErrorResponse: {
      type: 'object',
      description: 'Standard error envelope returned by the global exception filter.',
      required: ['data', 'meta', 'errors'],
      properties: {
        data: { nullable: true, example: null },
        meta: {
          type: 'object',
          required: ['timestamp', 'path'],
          properties: {
            timestamp: { type: 'string', format: 'date-time' },
            path: { type: 'string', example: '/api/v1/store/catalog/products' },
          },
        },
        errors: {
          type: 'array',
          minItems: 1,
          items: { $ref: '#/components/schemas/ApiError' },
        },
      },
    },
    ApiSuccessResponse: {
      type: 'object',
      description: 'Standard successful response envelope returned by the global interceptor.',
      required: ['data', 'meta', 'errors'],
      properties: {
        data: { description: 'Operation-specific response data.' },
        meta: {
          type: 'object',
          description: 'Pagination or other response metadata when applicable.',
          additionalProperties: true,
          example: {},
        },
        errors: {
          type: 'array',
          description: 'Always empty for successful responses.',
          maxItems: 0,
          items: { $ref: '#/components/schemas/ApiError' },
          example: [],
        },
      },
    },
  };
}

function hasParameter(operation: OperationObject, expectedName: string): boolean {
  return (operation.parameters ?? []).some(
    (parameter) =>
      !isReference(parameter) && parameter.name.toLowerCase() === expectedName.toLowerCase(),
  );
}

function isReference(
  value: ParameterObject | RequestBodyObject | ResponseObject | SchemaObject | ReferenceObject,
): value is ReferenceObject {
  return '$ref' in value;
}

function humanize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\bid\b/gi, 'ID')
    .trim();
}

export type { OpenAPIObject, OperationObject, ParameterObject, PathItemObject };
