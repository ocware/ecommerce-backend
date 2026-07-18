# Operations Guide

Examples use the shop project name `acme`. Replace it and the deployment path for each isolated shop.

## Backups

Back up PostgreSQL and media as one recovery point. Redis contains retryable queue state and is
persistent in the example, but PostgreSQL remains the business system of record.

Create a compressed logical database backup without exposing PostgreSQL on the host:

```bash
mkdir -p backups
docker compose --env-file .env.production -p acme -f docker-compose.production.yml exec -T postgres \
  pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom --no-owner --no-acl \
  > backups/acme-$(date -u +%Y%m%dT%H%M%SZ).dump
```

The quoted variables in that example must be exported in the operator shell or replaced with the
shop's non-secret database name and user. The password remains inside the PostgreSQL container.

For local media, archive the named volume through a short-lived container while uploads are paused:

```bash
docker run --rm \
  -v acme_media-data:/source:ro \
  -v "$PWD/backups:/backup" \
  alpine tar -czf /backup/acme-media-$(date -u +%Y%m%dT%H%M%SZ).tar.gz -C /source .
```

For S3-compatible storage, enable bucket versioning and use the provider's cross-region replication
or scheduled export. Database and media backups must use compatible timestamps so restored database
records do not point at missing objects.

Automate backups, encrypt them, copy them off-host, set a tested retention policy, monitor their age
and size, and perform a restore drill at least quarterly. A successful backup command is not proof
that the backup can be restored.

## Restore drill

Restore into a new Compose project, never over the only production copy:

1. Create a new directory and `.env.production` with new database, Redis, JWT, and webhook secrets.
2. Start only PostgreSQL: `docker compose ... up -d postgres`.
3. Restore the custom dump with `pg_restore --clean --if-exists --no-owner --no-acl`.
4. Restore the matching media archive or point at a cloned object-storage bucket.
5. Run the migration service to bring the restored database to the deployed application version.
6. Start API and worker, then verify owner login, catalog reads, an order snapshot, media URLs, and
   queue processing.

Example restore stream:

```bash
docker compose --env-file .env.production -p acme-restore -f docker-compose.production.yml exec -T postgres \
  pg_restore -U ecommerce -d ecommerce --clean --if-exists --no-owner --no-acl \
  < backups/acme-20260719T000000Z.dump
```

## Monitoring

The API liveness endpoint is `/<API_PREFIX>/health`; with defaults it is `/api/health`. The image
health check calls it every 30 seconds. Monitor it externally through the TLS endpoint as well as
inside the host. This endpoint proves the HTTP process is responsive; it is not a full PostgreSQL,
Redis, provider, or queue readiness check.

Collect and alert on:

- Container restarts, health state, CPU, memory, disk, and inode utilization.
- HTTP 5xx rate, latency, authentication failures, and payment callback failures.
- PostgreSQL connections, long transactions, lock waits, replication or backup status, database
  size, and volume free space.
- Redis availability, memory, evictions, persistence errors, and BullMQ waiting/failed job counts.
- Worker restarts and repeated job failures from structured container logs.
- Payment, shipping, email, SMS, and object-storage provider error rates.
- TLS certificate expiry and the timestamp, duration, and size of the latest successful backup.

Container logs rotate at 10 MB with five files in the production Compose example. Forward them to a
central log system before local rotation removes evidence. Logs can be inspected during an incident:

```bash
docker compose --env-file .env.production -p acme -f docker-compose.production.yml ps
docker compose --env-file .env.production -p acme -f docker-compose.production.yml logs --since 30m api worker migrate
docker compose --env-file .env.production -p acme -f docker-compose.production.yml exec redis \
  redis-cli -a "$REDIS_PASSWORD" --no-auth-warning info persistence
```

## Incident and maintenance checks

When checkout side effects stall, first verify API health, worker presence, Redis persistence, failed
jobs, and PostgreSQL connectivity. Do not delete failed jobs until their idempotency behavior and
business outcome have been checked. Payment callbacks, refunds, and inventory operations are designed
for retries, but external provider state remains authoritative.

Before host maintenance, confirm a fresh backup, stop API writes, allow active jobs to finish, and
then stop the project with `docker compose ... down`. Do not add `--volumes`; that deletes the shop's
local PostgreSQL, Redis, and media volumes.
