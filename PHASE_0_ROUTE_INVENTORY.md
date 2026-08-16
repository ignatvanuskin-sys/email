# Phase 0 Route Inventory

## Public application API

- `/api/auth/*`: authentication and sessions
- `/api/v1/*`: API-key based contacts and events
- `/api/unsubscribe`: signed recipient unsubscribe
- `/api/tracking/*`: signed open/click tracking
- `/api/bounces`: HMAC provider delivery webhook
- `/api/integrations/:token/events`: signed commerce event webhook

## Authenticated product API

- Leads, imports, templates, campaigns, sequences, segments, replies and follow-ups
- Deliverability domains and suppression
- Analytics, cohorts, usage and onboarding
- Workspace, roles, invitations and audit logs
- Billing, API keys, outbound webhooks and integrations

## Internal or operational API

- `/api/internal/worker`: cron-protected Journey and webhook worker
- `/api/docs/openapi`: generated public API contract

## Feature flags

Experimental/optional surfaces are controlled by `ENABLE_TELEGRAM`, `ENABLE_SHOPIFY`, `ENABLE_ADVANCED_JOURNEYS`, `ENABLE_BILLING` and `ENABLE_HTML_BUILDER`. Defaults remain enabled for the current development product; production can disable them without code changes.

## Stability baseline

- Legacy tenant isolation remains `userId`-scoped.
- New team permissions protect workspace and campaign approval mutations.
- Error responses include `error`, `code`, `requestId` and `x-request-id`.
