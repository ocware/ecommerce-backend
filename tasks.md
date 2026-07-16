# Tasks

This roadmap tracks the NestJS modular monolith implementation for the e-commerce backend. Keep this file updated as work is completed or new follow-up tasks are discovered.

## Phase 1: Foundation

- [x] Initialize NestJS project structure.
- [x] Add base module layout under `src/modules`, `src/shared`, `src/infrastructure`, `src/config`, and `src/app`.
- [x] Configure TypeScript, formatting, linting, and test commands.
- [x] Add environment configuration loading and validation.
- [x] Configure PostgreSQL connection.
- [x] Choose and configure the database toolkit or ORM.
- [x] Add Redis connection configuration.
- [x] Add Docker setup for API, PostgreSQL, Redis, and worker.
- [x] Add global validation pipe.
- [x] Add global exception handling with structured error responses.
- [x] Add response envelope conventions.
- [x] Add request logging.
- [x] Add health check endpoint.
- [x] Add API versioning under `/api/v1`.
- [x] Add OpenAPI documentation.
- [x] Add base test setup for unit and integration tests.

## Phase 2: Auth And Administration

- [x] Create `auth` module.
- [x] Create staff/admin user model.
- [x] Keep staff/admin accounts separate from customer accounts.
- [x] Implement login.
- [x] Implement logout.
- [x] Implement refresh tokens.
- [x] Implement password reset.
- [x] Implement session management.
- [x] Implement roles and permissions.
- [x] Add roles: Owner, Admin, Product Manager, Order Manager, Support, Warehouse Staff.
- [x] Add audit logs for administrative actions.
- [x] Add API tests for authentication and permissions.

## Phase 3: Customers

- [x] Create `customers` module.
- [x] Implement customer registration.
- [x] Implement customer login integration without mixing customer business logic into `auth`.
- [x] Implement guest checkout support.
- [x] Implement customer profile.
- [x] Implement saved addresses.
- [x] Implement order history access.
- [x] Implement customer status.
- [x] Implement customer notes.
- [x] Implement marketing consent.

## Phase 4: Catalog

- [x] Create `catalog` module.
- [x] Implement products.
- [x] Implement product variants.
- [x] Implement categories.
- [x] Implement brands.
- [x] Implement product attributes.
- [x] Implement product images.
- [x] Implement SKU handling.
- [x] Implement pricing.
- [x] Implement product status.
- [x] Implement SEO fields.
- [x] Implement product collections.
- [x] Implement related products.
- [x] Add product search.
- [x] Add admin catalog APIs.
- [x] Add store catalog APIs.

## Phase 5: Inventory

- [ ] Create `inventory` module.
- [ ] Track inventory by product variant.
- [ ] Implement current stock.
- [ ] Implement reserved stock.
- [ ] Implement available stock calculation.
- [ ] Implement inventory adjustments.
- [ ] Implement low-stock thresholds.
- [ ] Implement stock movement history.
- [ ] Implement stock reservations during checkout.
- [ ] Implement reservation expiration.
- [ ] Implement stock restoration after cancellation.
- [ ] Add tests for inventory calculations.
- [ ] Add tests for concurrent purchases.

## Phase 6: Cart

- [ ] Create `cart` module.
- [ ] Implement guest carts.
- [ ] Implement customer carts.
- [ ] Add product to cart.
- [ ] Remove product from cart.
- [ ] Change cart item quantity.
- [ ] Validate stock during cart operations.
- [ ] Recalculate cart totals from current data.
- [ ] Apply discounts through the discount evaluator.
- [ ] Merge guest cart after login.
- [ ] Implement cart expiration.
- [ ] Return subtotal, discount total, shipping total, tax total, and grand total.

## Phase 7: Discounts

- [ ] Create `discounts` module.
- [ ] Implement coupon codes.
- [ ] Implement automatic discounts.
- [ ] Implement percentage discounts.
- [ ] Implement fixed discounts.
- [ ] Implement free shipping discounts.
- [ ] Implement start and end dates.
- [ ] Implement usage limits.
- [ ] Implement minimum cart amount.
- [ ] Implement product and category restrictions.
- [ ] Implement customer restrictions.
- [ ] Create `DiscountEvaluator`.
- [ ] Add unit tests for pricing and discount rules.

## Phase 8: Checkout And Orders

- [ ] Create `orders` module.
- [ ] Implement checkout orchestration.
- [ ] Create orders from cart.
- [ ] Store immutable order item snapshots.
- [ ] Store customer details snapshot.
- [ ] Store billing address snapshot.
- [ ] Store shipping address snapshot.
- [ ] Store pricing snapshot.
- [ ] Keep order status separate from payment, fulfillment, and refund statuses.
- [ ] Implement internal notes.
- [ ] Implement customer notes.
- [ ] Implement cancellation.
- [ ] Implement order history.
- [ ] Implement invoice information.
- [ ] Publish `OrderCreated`.
- [ ] Publish `OrderCancelled`.
- [ ] Add checkout integration tests.

## Phase 9: Payments

- [ ] Create `payments` module.
- [ ] Define `PaymentGateway` interface.
- [ ] Implement payment attempts.
- [ ] Implement transactions.
- [ ] Store gateway references.
- [ ] Implement payment verification.
- [ ] Implement webhook processing.
- [ ] Implement failed payments.
- [ ] Implement refunds.
- [ ] Implement partial refunds.
- [ ] Implement idempotency for callbacks and refunds.
- [ ] Add first payment gateway adapter.
- [ ] Add manual bank transfer adapter.
- [ ] Add cash on delivery adapter.
- [ ] Publish `PaymentStarted`.
- [ ] Publish `PaymentSucceeded`.
- [ ] Publish `PaymentFailed`.
- [ ] Add payment verification integration tests.
- [ ] Add duplicate callback tests.

## Phase 10: Shipping

- [ ] Create `shipping` module.
- [ ] Define `ShippingProvider` interface.
- [ ] Implement shipping methods.
- [ ] Implement shipping zones.
- [ ] Implement shipping prices.
- [ ] Implement free-shipping conditions.
- [ ] Implement shipment records.
- [ ] Implement tracking codes.
- [ ] Implement shipment status.
- [ ] Implement estimated delivery.
- [ ] Implement local pickup.
- [ ] Publish `ShipmentCreated`.
- [ ] Publish `ShipmentDelivered`.

## Phase 11: Media

- [ ] Create `media` module.
- [ ] Define `FileStorage` interface.
- [ ] Implement product images.
- [ ] Implement category images.
- [ ] Implement shop logo.
- [ ] Implement banners.
- [ ] Add upload validation.
- [ ] Add image resizing job.
- [ ] Add image deletion.
- [ ] Add local storage adapter.
- [ ] Add object storage adapter.

## Phase 12: Notifications

- [ ] Create `notifications` module.
- [ ] Define `EmailProvider` interface.
- [ ] Define `SmsProvider` interface.
- [ ] Listen for order, payment, shipment, password reset, low stock, and customer events.
- [ ] Send email notifications.
- [ ] Send SMS notifications.
- [ ] Send admin notifications.
- [ ] Ensure other modules publish events instead of sending messages directly.

## Phase 13: Settings

- [ ] Create `settings` module.
- [ ] Store editable shop settings in the database.
- [ ] Add settings for shop name, currency, tax, default shipping method, order prefix, low-stock threshold, and guest checkout.
- [ ] Keep technical secrets in environment variables.
- [ ] Add settings APIs for admin users.
- [ ] Prevent shop-specific source-code conditionals.

## Phase 14: Reports

- [ ] Create `reports` module.
- [ ] Implement sales by date.
- [ ] Implement order count.
- [ ] Implement average order value.
- [ ] Implement best-selling products.
- [ ] Implement low-stock products.
- [ ] Implement payment status summary.
- [ ] Implement refund summary.
- [ ] Keep reports read-oriented unless explicitly required otherwise.

## Phase 15: Background Jobs And Events

- [ ] Add internal event bus.
- [ ] Add Redis-backed queue.
- [ ] Add worker process.
- [ ] Add jobs for email.
- [ ] Add jobs for SMS.
- [ ] Add jobs for image processing.
- [ ] Add jobs for invoice generation.
- [ ] Add jobs for payment callback processing.
- [ ] Add jobs for expired reservation release.
- [ ] Add jobs for shipment tracking updates.
- [ ] Add jobs for report generation.

## Phase 16: Deployment And Reusability

- [ ] Finalize Docker image.
- [ ] Add production Docker Compose example.
- [ ] Add environment example file.
- [ ] Document per-shop isolated deployment.
- [ ] Add backup guidance.
- [ ] Add migration guidance.
- [ ] Add monitoring guidance.
- [ ] Add feature toggles for optional modules.
- [ ] Extract provider adapters behind configuration.
- [ ] Add reusable seed data.
- [ ] Write deployment documentation.

## Cross-Cutting Acceptance Criteria

- [ ] Module boundaries are clean and there are no accidental circular dependencies.
- [ ] Admin and customer accounts are separated.
- [x] Catalog and inventory are separated.
- [ ] Orders store immutable purchase snapshots.
- [ ] Payment redirects are never trusted without gateway or webhook verification.
- [ ] Payment callbacks are idempotent.
- [ ] Stock reservations prevent overselling.
- [ ] Failed or expired checkouts release reserved stock.
- [ ] API routes are versioned.
- [ ] Store and admin APIs are separated.
- [ ] Errors use structured codes and details.
- [ ] Tests cover the core happy path and key failure paths.

## Primary End-To-End Flow To Protect

- [ ] Add product.
- [ ] Create cart.
- [ ] Apply discount.
- [ ] Reserve inventory.
- [ ] Create order.
- [ ] Start payment.
- [ ] Verify payment.
- [ ] Confirm inventory.
- [ ] Send notification.

## Failure Paths To Protect

- [ ] Payment failure.
- [ ] Duplicate payment callback.
- [ ] Product becomes unavailable.
- [ ] Coupon expires.
- [ ] Order cancellation.
- [ ] Refund.
- [ ] Inventory restoration.
