# Deployment Guide

This application is deployed as one API, one or more workers, PostgreSQL, and Redis. Every shop
must have an isolated Compose project, database, Redis instance or namespace, media storage, and
credentials. Do not put multiple shops in the same application database.

## Prerequisites

- A Linux host with Docker Engine and the Docker Compose plugin.
- A reverse proxy or load balancer providing TLS.
- A DNS name for the shop API.
- A backup destination outside the application host.
- S3-compatible object storage for media when local-volume backups are not suitable.

## Create an isolated shop deployment

Keep each shop in a separate directory and use a stable, unique Compose project name. Compose
prefixes networks and volumes with that project name, preventing accidental sharing.

```bash
mkdir -p /srv/shops/acme
cd /srv/shops/acme
cp /path/to/ecommerce-backend/.env.production.example .env.production
chmod 600 .env.production
```

Edit every `CHANGE_ME` value. `POSTGRES_PASSWORD` and the password embedded in `DATABASE_URL` must
match. `REDIS_PASSWORD` and the password embedded in `REDIS_URL` must also match. Generate unique
JWT, webhook, database, Redis, and owner secrets for every shop. Never copy a production environment
file between shops.

Validate the resolved deployment before starting it:

```bash
docker compose --env-file .env.production -p acme -f docker-compose.production.yml config --quiet
docker compose --env-file .env.production -p acme -f docker-compose.production.yml build
docker compose --env-file .env.production -p acme -f docker-compose.production.yml up -d
```

The migration service must complete successfully before the API and worker start. Inspect it with:

```bash
docker compose --env-file .env.production -p acme -f docker-compose.production.yml logs migrate
```

Seed a new empty shop once. The seed is idempotent: it creates the owner only when the configured
email does not exist, and it does not overwrite existing shop or shipping settings.

```bash
docker compose --env-file .env.production -p acme -f docker-compose.production.yml run --rm seed
```

Sign in as the seeded owner and rotate the bootstrap password after verifying access. Remove
`SEED_OWNER_PASSWORD` from `.env.production` after the initial seed; add it temporarily only if a new
empty database must be bootstrapped.

## Reverse proxy and networking

The example binds the API to `127.0.0.1:3000` by default. Terminate TLS at a reverse proxy on the
same host and proxy to that address. Change `APP_BIND_ADDRESS` only when a trusted external load
balancer must reach the container port. PostgreSQL and Redis have no host ports in the production
file.

Forward the original client address and scheme from the proxy. Limit request body size consistently
with `MEDIA_MAX_UPLOAD_BYTES`, set reasonable upstream timeouts, and rate-limit authentication and
payment callback routes at the edge.

## Configuration and optional features

Technical secrets and provider selection stay in environment variables. Editable store behavior
belongs in the database-backed settings API.

The following optional modules are enabled by default and can be disabled independently:

| Variable                        | Disabled behavior                                                                 |
| ------------------------------- | --------------------------------------------------------------------------------- |
| `FEATURE_MEDIA_ENABLED`         | Media APIs return `FEATURE_DISABLED`; queued image jobs are skipped.              |
| `FEATURE_NOTIFICATIONS_ENABLED` | Notification APIs and event subscriptions stop; queued delivery jobs are skipped. |
| `FEATURE_REPORTS_ENABLED`       | Report APIs and report jobs stop; the daily report schedule is removed.           |

Restart both API and worker after changing a feature flag. Disabling a feature does not delete its
database records or media.

Provider adapters are selected through allowlists:

- `PAYMENT_GATEWAYS` accepts `DEVELOPMENT`, `MANUAL_BANK_TRANSFER`, and `CASH_ON_DELIVERY`.
- `SHIPPING_PROVIDERS` currently accepts `LOCAL`.
- `MEDIA_STORAGE_DRIVER` accepts `local` or `s3`.
- `EMAIL_PROVIDER` and `SMS_PROVIDER` currently accept `development`.

Do not enable `DEVELOPMENT` payment or notification providers for customer-facing payment or
messaging. They are deterministic local adapters, not external delivery integrations. Add a new
adapter inside its owning module, register it in the module factory or registry, extend environment
validation, and then enable it per deployment. Orders never import gateway-specific implementations.

## Database migrations and releases

Create migrations in development with `npm run prisma:migrate`. Commit both the Prisma schema and
generated migration SQL. Never use `prisma db push` against production.

For a release:

1. Back up PostgreSQL and media.
2. Build an immutable image tag, such as a Git commit SHA.
3. Set `IMAGE_TAG` to that immutable tag.
4. Review pending migration SQL, locks, and expected runtime.
5. Run `docker compose ... up -d`; the one-shot migration service runs `prisma migrate deploy`.
6. Verify migration logs, API health, worker logs, and a read-only storefront request.

Prisma records applied migrations in `_prisma_migrations`. Do not edit an applied migration. Fix a
failed migration with a new migration or the documented `prisma migrate resolve` workflow after
confirming the actual database state. Take the API and worker offline for migrations that are not
backward-compatible with the currently running version.

To inspect migration state manually:

```bash
docker compose --env-file .env.production -p acme -f docker-compose.production.yml run --rm migrate npm exec prisma migrate status
```

## Scaling and media

Scale workers when queue latency rises:

```bash
docker compose --env-file .env.production -p acme -f docker-compose.production.yml up -d --scale worker=3
```

Local media uses one Docker volume and is suitable only when all API and worker containers share
that host volume. Use the S3 adapter for multiple hosts or external container orchestration. Set all
`MEDIA_S3_*` variables and back up bucket configuration, lifecycle rules, and access policies.

## Production checklist

- Secrets are unique, randomly generated, stored with mode `0600`, and absent from source control.
- The API is reachable only through TLS and PostgreSQL/Redis are not publicly exposed.
- Development payment, email, and SMS adapters are disabled or replaced as appropriate.
- Database and media backups are automated, encrypted, copied off-host, and restore-tested.
- The immutable image tag and deployed migration version are recorded.
- Health, logs, resource use, queue failures, database capacity, certificate expiry, and backup age
  are monitored.
