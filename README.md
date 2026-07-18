# E-commerce Backend

A reusable NestJS modular monolith for isolated e-commerce deployments. The API, background
worker, PostgreSQL, and Redis run as one deployment unit while business modules retain explicit
internal boundaries.

## Local development

```bash
cp .env.example .env
docker compose up --build
```

The API is available at `http://localhost:3000/api/v1`, Swagger at
`http://localhost:3000/api/docs`, and the health endpoint at
`http://localhost:3000/api/health`.

Without Docker, install dependencies and provide PostgreSQL and Redis URLs before running:

```bash
npm install
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

## Production

Use [the deployment guide](docs/deployment.md) for isolated per-shop provisioning, configuration,
migrations, seed data, upgrades, and provider selection. [The operations guide](docs/operations.md)
covers backups, restores, monitoring, and incident checks.

The production stack is defined in `docker-compose.production.yml`; `.env.production.example` is
the complete non-secret configuration template.

## Quality commands

```bash
npm run format:check
npm run lint
npm test
npm run test:e2e
npm run build
```
