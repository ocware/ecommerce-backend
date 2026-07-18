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

- [x] Create `inventory` module.
- [x] Track inventory by product variant.
- [x] Implement current stock.
- [x] Implement reserved stock.
- [x] Implement available stock calculation.
- [x] Implement inventory adjustments.
- [x] Implement low-stock thresholds.
- [x] Implement stock movement history.
- [x] Implement stock reservations during checkout.
- [x] Implement reservation expiration.
- [x] Implement stock restoration after cancellation.
- [x] Add tests for inventory calculations.
- [x] Add tests for concurrent purchases.

## Phase 6: Cart

- [x] Create `cart` module.
- [x] Implement guest carts.
- [x] Implement customer carts.
- [x] Add product to cart.
- [x] Remove product from cart.
- [x] Change cart item quantity.
- [x] Validate stock during cart operations.
- [x] Recalculate cart totals from current data.
- [x] Apply discounts through the discount evaluator.
- [x] Merge guest cart after login.
- [x] Implement cart expiration.
- [x] Return subtotal, discount total, shipping total, tax total, and grand total.

## Phase 7: Discounts

- [x] Create `discounts` module.
- [x] Implement coupon codes.
- [x] Implement automatic discounts.
- [x] Implement percentage discounts.
- [x] Implement fixed discounts.
- [x] Implement free shipping discounts.
- [x] Implement start and end dates.
- [x] Implement usage limits.
- [x] Implement minimum cart amount.
- [x] Implement product and category restrictions.
- [x] Implement customer restrictions.
- [x] Create `DiscountEvaluator`.
- [x] Add unit tests for pricing and discount rules.

## Phase 8: Checkout And Orders

- [x] Create `orders` module.
- [x] Implement checkout orchestration.
- [x] Create orders from cart.
- [x] Store immutable order item snapshots.
- [x] Store customer details snapshot.
- [x] Store billing address snapshot.
- [x] Store shipping address snapshot.
- [x] Store pricing snapshot.
- [x] Keep order status separate from payment, fulfillment, and refund statuses.
- [x] Implement internal notes.
- [x] Implement customer notes.
- [x] Implement cancellation.
- [x] Implement order history.
- [x] Implement invoice information.
- [x] Publish `OrderCreated`.
- [x] Publish `OrderCancelled`.
- [x] Add checkout integration tests.

## Phase 9: Payments

- [x] Create `payments` module.
- [x] Define `PaymentGateway` interface.
- [x] Implement payment attempts.
- [x] Implement transactions.
- [x] Store gateway references.
- [x] Implement payment verification.
- [x] Implement webhook processing.
- [x] Implement failed payments.
- [x] Implement refunds.
- [x] Implement partial refunds.
- [x] Implement idempotency for callbacks and refunds.
- [x] Add first payment gateway adapter.
- [x] Add manual bank transfer adapter.
- [x] Add cash on delivery adapter.
- [x] Publish `PaymentStarted`.
- [x] Publish `PaymentSucceeded`.
- [x] Publish `PaymentFailed`.
- [x] Add payment verification integration tests.
- [x] Add duplicate callback tests.

## Phase 10: Shipping

- [x] Create `shipping` module.
- [x] Define `ShippingProvider` interface.
- [x] Implement shipping methods.
- [x] Implement shipping zones.
- [x] Implement shipping prices.
- [x] Implement free-shipping conditions.
- [x] Implement shipment records.
- [x] Implement tracking codes.
- [x] Implement shipment status.
- [x] Implement estimated delivery.
- [x] Implement local pickup.
- [x] Publish `ShipmentCreated`.
- [x] Publish `ShipmentDelivered`.

## Phase 11: Media

- [x] Create `media` module.
- [x] Define `FileStorage` interface.
- [x] Implement product images.
- [x] Implement category images.
- [x] Implement shop logo.
- [x] Implement banners.
- [x] Add upload validation.
- [x] Add image resizing job.
- [x] Add image deletion.
- [x] Add local storage adapter.
- [x] Add object storage adapter.

## Phase 12: Notifications

- [x] Create `notifications` module.
- [x] Define `EmailProvider` interface.
- [x] Define `SmsProvider` interface.
- [x] Listen for order, payment, shipment, password reset, low stock, and customer events.
- [x] Send email notifications.
- [x] Send SMS notifications.
- [x] Send admin notifications.
- [x] Ensure other modules publish events instead of sending messages directly.

## Phase 13: Settings

- [x] Create `settings` module.
- [x] Store editable shop settings in the database.
- [x] Add settings for shop name, currency, tax, default shipping method, order prefix, low-stock threshold, and guest checkout.
- [x] Keep technical secrets in environment variables.
- [x] Add settings APIs for admin users.
- [x] Prevent shop-specific source-code conditionals.

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
- [x] Orders store immutable purchase snapshots.
- [x] Payment redirects are never trusted without gateway or webhook verification.
- [x] Payment callbacks are idempotent.
- [x] Stock reservations prevent overselling.
- [x] Failed or expired checkouts release reserved stock.
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

- [x] Payment failure.
- [x] Duplicate payment callback.
- [ ] Product becomes unavailable.
- [ ] Coupon expires.
- [x] Order cancellation.
- [x] Refund.
- [ ] Inventory restoration.
