# Production Deployment

## Required infrastructure

- PostgreSQL for multi-instance production. SQLite is supported for development only.
- Redis is included in the production compose stack as a coordination/cache dependency. The current worker persists jobs in PostgreSQL/SQLite-compatible tables; Redis is reserved for the next BullMQ/Temporal migration.
- A scheduler calling `POST /api/internal/worker` every minute.
- A process-safe worker deployment or one dedicated worker instance.
- HTTPS public `APP_URL`.
- `PRISMA_MIGRATE_DEPLOY=true` on every production release. The image refuses to start without this flag and never runs destructive `db push`.

## Required secrets

```env
DATABASE_URL=postgresql://...
SESSION_SECRET=<32+ random characters>
CREDENTIALS_KEY=<base64 encoded 32-byte key>
WEBHOOK_SECRET=<32+ random characters>
BOUNCE_WEBHOOK_SECRET=<32+ random characters>
UNSUBSCRIBE_SECRET=<32+ random characters>
CRON_SECRET=<32+ random characters>
APP_URL=https://app.example.com
PRISMA_MIGRATE_DEPLOY=true
```

Feature-specific integrations are fail-closed when enabled:

```env
ENABLE_BILLING=true
STRIPE_WEBHOOK_SECRET=<Stripe signing secret>
STRIPE_PRICE_PRO=<Stripe price id>
STRIPE_PRICE_AGENCY=<Stripe price id>
ENABLE_TELEGRAM=true
TELEGRAM_WEBHOOK_SECRET=<Telegram secret token>
```

Shopify credentials remain optional when Shopify is disabled.

```env
SHOPIFY_CLIENT_ID=
SHOPIFY_CLIENT_SECRET=
STRIPE_CHECKOUT_URL_TEMPLATE=
```

## Release sequence

1. Configure the Railway PostgreSQL service and set every required secret from the list above; do not commit `.env` files.
2. Validate the production schema with `DATABASE_URL=postgresql://... npx prisma validate --schema prisma/schema.postgres.prisma`.
3. For a new database, set `PRISMA_MIGRATE_DEPLOY=true`; the committed baseline migration at `prisma/migrations/00000000000000_baseline` creates the schema during startup.
4. For an existing database previously created by `db push`, take a verified backup, confirm the schema matches `schema.postgres.prisma`, and mark the baseline as applied once: `npx prisma migrate resolve --applied 00000000000000_baseline --schema prisma/schema.postgres.prisma`. Do not run this command on a new database.
5. Apply later migrations with `npm run db:migrate:postgres`; every release then uses `prisma migrate deploy` automatically.
6. Start the Railway service or `docker compose -f docker-compose.production.yml up -d`.
7. Verify `GET /api/health` returns HTTP 200.
8. Verify the worker logs show successful iterations every 15 seconds.
9. Verify deliverability DNS before real sending.
10. Send a test email and validate text/html, unsubscribe, click and open tracking.
11. Start with a small campaign and monitor bounce/complaint/failure rates.

## Safety gates

- Never enable `MOCK_EMAIL=true` in production.
- Never use development fallback secrets.
- Keep `ENABLE_*` flags disabled until the corresponding credentials and webhook URLs are configured; the startup gate rejects enabled billing/Telegram without their webhook secrets.
- Do not expose raw provider credentials or API secrets in logs.
