# Production Deployment

## Required infrastructure

- PostgreSQL for multi-instance production. SQLite is supported for development only.
- Redis is included in the production compose stack as a coordination/cache dependency. The current worker persists jobs in PostgreSQL/SQLite-compatible tables; Redis is reserved for the next BullMQ/Temporal migration.
- A scheduler calling `POST /api/internal/worker` every minute.
- A process-safe worker deployment or one dedicated worker instance.
- HTTPS public `APP_URL`.

## Required secrets

```env
DATABASE_URL=postgresql://...
SESSION_SECRET=<32+ random characters>
CREDENTIALS_KEY=<base64 encoded 32-byte key>
WEBHOOK_SECRET=<32+ random characters>
CRON_SECRET=<32+ random characters>
APP_URL=https://app.example.com
```

Optional integrations:

```env
SHOPIFY_CLIENT_ID=
SHOPIFY_CLIENT_SECRET=
STRIPE_WEBHOOK_SECRET=
STRIPE_CHECKOUT_URL_TEMPLATE=
TELEGRAM_WEBHOOK_SECRET=
```

## Release sequence

1. Set `POSTGRES_PASSWORD` and create `.env.production` from the required secret list.
2. Validate the production schema with `DATABASE_URL=postgresql://... npx prisma validate --schema prisma/schema.postgres.prisma`.
3. Generate or apply PostgreSQL migrations with `npm run db:migrate:postgres`.
4. Start `docker compose -f docker-compose.production.yml up -d`.
5. Verify `GET /api/health` returns HTTP 200.
6. Verify the worker logs show successful iterations every 15 seconds.
7. Verify deliverability DNS before real sending.
8. Send a test email and validate text/html, unsubscribe, click and open tracking.
9. Start with a small campaign and monitor bounce/complaint/failure rates.

## Safety gates

- Never enable `MOCK_EMAIL=true` in production.
- Never use development fallback secrets.
- Keep `ENABLE_*` flags disabled until the corresponding credentials and webhook URLs are configured.
- Do not expose raw provider credentials or API secrets in logs.
