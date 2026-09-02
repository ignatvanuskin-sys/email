# ClipReach disaster recovery runbook

## Backup prerequisites

Production backups require a PostgreSQL `DATABASE_URL`, `pg_dump`, and `BACKUP_ENCRYPTION_KEY`. The key must be base64-encoded and decode to exactly 32 bytes. Keep it in a secret manager, separate from the backup directory, and rotate it only with an explicit re-encryption plan. The backup command never places the database password in the `pg_dump` argument list; it supplies it through `PGPASSWORD`.

Run:

```bash
BACKUP_ENCRYPTION_KEY='<base64-32-byte-key>' \
DATABASE_URL='postgresql://user:password@host:5432/clipreach?sslmode=require' \
BACKUP_DIR='/secure/backup/path' \
BACKUP_RETENTION_DAYS=30 \
npm run db:backup
```

The result is an AES-256-GCM encrypted `.dump.enc` artifact with a SHA-256 sidecar and JSON manifest. Temporary plaintext dumps are removed after encryption, and old encrypted artifacts plus companions are removed according to `BACKUP_RETENTION_DAYS`. Copy encrypted artifacts and their sidecars to independent storage; do not copy the encryption key with them.

## Restore safeguards

Restores are destructive and require all of the following independent signals: `ALLOW_DESTRUCTIVE_RESTORE=true`, `CONFIRM_RESTORE=yes`, and `CONFIRM_RESTORE_TARGET=production`. The input must be an encrypted `.dump.enc` file produced by the backup command, with a valid checksum sidecar and the matching backup key. The encrypted envelope is authenticated before `pg_restore` is invoked, and the temporary decrypted dump is deleted in a `finally` block.

Run only after validating the target database and taking a fresh backup:

```bash
ALLOW_DESTRUCTIVE_RESTORE=true \
CONFIRM_RESTORE=yes \
CONFIRM_RESTORE_TARGET=production \
BACKUP_ENCRYPTION_KEY='<base64-32-byte-key>' \
DATABASE_URL='postgresql://user:password@host:5432/clipreach?sslmode=require' \
BACKUP_FILE='/secure/backup/path/clipreach-<timestamp>.dump.enc' \
npm run db:restore
```

After a restore, verify `/api/health`, login, tenant isolation, campaign state, provider configuration, and the latest backup manifest. A restore has not been considered tested until a non-production restore drill has completed successfully; this task did not execute one because no production database credentials or disposable restore target were supplied.
