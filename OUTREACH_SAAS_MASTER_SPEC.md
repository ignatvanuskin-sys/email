# ClipReach MVP Specification

## Purpose
ClipReach is a single-user-per-account outreach workflow for freelancers who qualify creator leads, draft personalized outreach with AI, require human approval, send through a configured provider, and manage replies, suppression, and follow-ups.

## MVP workflow
1. Register and log in.
2. Create, edit, view, delete, search, and filter leads.
3. Import comma- or semicolon-delimited UTF-8 CSV with mapping, preview, validation, duplicate detection, and imported/skipped/invalid counts.
4. Analyze a lead with a configured AI provider and calculate a deterministic 0–100 lead score.
5. Generate and edit a personalized email using the lead, analysis, and account business description.
6. Preview and explicitly approve the exact subject/body. Editing invalidates approval.
7. Immediately before sending, enforce global pause, approval, lead status, and suppression checks.
8. Send through configured SMTP or an explicitly enabled development/test mock. Store status, provider message ID, errors, and activity.
9. Prevent duplicate sends and schedule a follow-up after a successful initial send.
10. Record replies; any reply cancels pending follow-ups. Opt-out also suppresses the address and marks the lead unsubscribed.
11. Manual suppression immediately blocks sending and cancels pending follow-ups.
12. Dashboard and follow-up views show account-scoped operational data.

## Data and isolation
All leads, messages, providers, suppressions, replies, activities, templates, and follow-ups are scoped by authenticated user ID. ID-based API access must return not found for another user's records. Provider credentials are encrypted at rest and never returned by API responses.

## AI providers
The server supports OpenAI and Anthropic-compatible calls. Requests have a finite timeout, non-success responses are surfaced, and malformed output is handled without exposing credentials. Mock AI is allowed only when explicitly configured for development/test; production must configure a real provider.

## Email providers
SMTP credentials remain server-side and encrypted. Sending records success/failure and provider message ID. Mock email is allowed only when explicitly configured for development/test. The MVP does not bypass provider security, consent, suppression, or anti-spam controls.

## Safety and security
- Passwords are bcrypt-hashed; sessions use HTTP-only SameSite cookies.
- API input is schema validated and Prisma parameterization is used for database access.
- React rendering escapes user content by default.
- CSV rows with spreadsheet-formula prefixes are rejected.
- Secrets belong in ignored environment files; production requires strong session and credential-encryption keys.
- Human approval, suppression, blocked lead statuses, and global pause are hard send gates.

## Out of scope
Automated inbox synchronization, campaign automation, bulk unattended sending, scraping, deliverability circumvention, and post-MVP/V1/V2 features are not part of this MVP.
