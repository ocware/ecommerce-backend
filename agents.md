# Agent Instructions

This project is a NestJS modular monolith for reusable e-commerce backends. Build one deployable backend application with clean internal module boundaries, provider interfaces, domain events, background jobs, PostgreSQL, Redis, and Docker-based deployment.

## Core Direction

- Use NestJS as the backend framework.
- Prefer a modular monolith over microservices.
- Keep each business module independent and internally organized.
- Use PostgreSQL as the primary relational database.
- Use Redis for queues, caching where appropriate, and retryable background work.
- Use Docker for local and production deployment.
- Keep each customer deployment isolated with its own database and credentials.
- Reuse the same codebase across shops through configuration, adapters, and optional modules.

## Expected Source Layout

Use this structure unless the project has already established a better local convention:

```text
src/
  app/
  config/
  infrastructure/
  modules/
    auth/
    users/
    customers/
    catalog/
    inventory/
    cart/
    orders/
    payments/
    shipping/
    discounts/
    notifications/
    media/
    settings/
    reports/
  shared/
```

Each module should own its controllers, services, repositories, DTOs, validators, entities/models, tests, and infrastructure adapters. For more complex modules, prefer:

```text
module/
  domain/
  application/
  infrastructure/
  presentation/
```

For simpler modules, this is acceptable:

```text
module/
  controllers/
  services/
  repositories/
  models/
  dto/
  validators/
  tests/
```

## Module Boundary Rules

- Modules must communicate through clear interfaces, application services, events, or exported module APIs.
- Do not reach directly into another module's database logic.
- Avoid circular dependencies.
- Put business logic in the owning module, not in shared utilities.
- Keep `shared/` limited to genuinely reusable code: errors, validation, pagination, database helpers, logging, security, events, utilities, and response formatting.
- Do not turn `shared/` into a dumping ground for business behavior.

Preferred dependency direction examples:

- Cart may depend on Catalog, Inventory, and Discounts.
- Orders may depend on Cart and Customers.
- Payments should integrate with Orders through interfaces and events.
- Shipping should integrate with Orders through interfaces and events.
- Notifications should listen to domain events.
- Reports may read data from other modules, but normally should not mutate it.

## Key Domain Rules

- Keep admin/staff users separate from customer accounts.
- Authentication answers "who are you?"
- Customer module owns customer profile, addresses, order history, status, notes, and marketing consent.
- Catalog describes products, variants, categories, brands, attributes, images, SKU, pricing, SEO, and product status.
- Inventory describes stock availability and stock movement. Inventory belongs to product variants.
- Available stock is `current_stock - reserved_stock`.
- Reserve inventory during checkout, confirm deduction after successful payment, and release reservations after failure or expiration.
- Cart totals should be recalculated when important data changes. Do not treat stored cart totals as the source of truth.
- Orders must store a purchase snapshot: product name, variant name, SKU, unit price, quantity, discount, tax, customer details, and addresses.
- Keep order status, payment status, fulfillment status, and refund status separate.
- Never put gateway-specific payment code inside the order module.
- Always verify payments directly with the gateway or signed webhook. Do not trust only browser redirects.
- Use idempotency for payment callbacks, refunds, and duplicate external events.

## Provider Interfaces

Use provider interfaces for replaceable integrations:

- `PaymentGateway`: create payment, verify payment, refund payment, handle webhook.
- `ShippingProvider`: calculate rate, create shipment, cancel shipment, track shipment.
- `FileStorage`: upload, delete, get URL.
- `EmailProvider`: send email.
- `SmsProvider`: send SMS.

Adapters may include Stripe, Zarinpal, IDPay, manual bank transfer, cash on delivery, S3, Cloudflare R2, MinIO, Kavenegar, or local development implementations.

## Events And Jobs

Use internal domain events for side effects. Events may run in-process at first, but should be designed so they can move to a queue later.

Useful event names:

- `CartCheckedOut`
- `OrderCreated`
- `OrderCancelled`
- `PaymentStarted`
- `PaymentSucceeded`
- `PaymentFailed`
- `RefundCompleted`
- `ShipmentCreated`
- `ShipmentDelivered`
- `InventoryLow`
- `CustomerRegistered`
- `PasswordResetRequested`

Use background jobs for slow or retryable work:

- Emails
- SMS
- Image processing
- Invoice generation
- Payment callback handling
- Expired inventory reservation release
- Shipment tracking updates
- Reports

## API Rules

- Use versioned routes under `/api/v1`.
- Separate store/customer routes from admin routes.
- Prefer route groups such as `/api/v1/store/...` and `/api/v1/admin/...`.
- Keep pagination, filtering, sorting, validation errors, auth rules, and response envelopes consistent.
- Use a consistent response shape:

```json
{
  "data": {},
  "meta": {},
  "errors": []
}
```

- Use structured error codes and details:

```json
{
  "code": "INSUFFICIENT_STOCK",
  "message": "The requested quantity is unavailable.",
  "details": {
    "variantId": 42,
    "available": 2
  }
}
```

## Configuration

- Technical secrets belong in environment variables.
- Editable shop behavior belongs in database-backed settings.
- Do not hardcode shop-specific behavior in source code.
- Do not add checks like `if shop_name == "Shop A"`.

Environment variables should cover secrets and infrastructure:

- `DATABASE_URL`
- `JWT_SECRET`
- `REDIS_URL`
- `PAYMENT_API_KEY`
- `SMS_API_KEY`
- `STORAGE_SECRET`

Database settings should cover shop configuration:

- `shop_name`
- `currency`
- `tax_enabled`
- `default_shipping_method`
- `order_prefix`
- `low_stock_threshold`
- `guest_checkout_enabled`

## Testing Expectations

Add tests according to risk and scope. Important coverage includes:

- Pricing and discount unit tests.
- Inventory calculation unit tests.
- Checkout integration tests.
- Payment verification integration tests.
- Authentication and permission API tests.
- Database transaction tests.
- Duplicate callback tests.
- Concurrent purchase tests.
- End-to-end order flow tests.

The most important flow is:

```text
add product
create cart
apply discount
reserve inventory
create order
start payment
verify payment
confirm inventory
send notification
```

Also test failure paths:

- Payment failure.
- Duplicate payment callback.
- Product becomes unavailable.
- Coupon expires.
- Order cancellation.
- Refund.
- Inventory restoration.

## Agent Workflow

Before changing code:

- Read the relevant files and existing conventions.
- Check `tasks.md` for current priorities and acceptance criteria.
- Keep edits scoped to the requested task.
- Prefer existing project patterns over new abstractions.

While changing code:

- Update or add tests when behavior changes.
- Keep module boundaries clean.
- Avoid unrelated refactors.
- Do not silently introduce shop-specific assumptions.
- Keep API responses and errors consistent.

After finishing any task:

- Run the relevant formatter, linter, tests, or build command when available.
- Re-open `tasks.md` and check whether the completed task has follow-up checklist items.
- Mark completed task items in `tasks.md` when appropriate.
- Add any newly discovered follow-up work to `tasks.md` instead of leaving it only in chat.
- Report what changed, what was verified, and anything that could not be verified.

