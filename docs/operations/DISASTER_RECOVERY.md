# CAFÉ CUE & BREW SYSTEM — DISASTER RECOVERY & BACKUP GUIDE
**System Architecture**: NestJS + Prisma ORM + MySQL Database (Hostinger Shared/Cloud Hosting)
**Document Version**: 1.0 (Production Security Audit Phase 6)
**Last Updated**: August 27, 2026

---

## 1. OVERVIEW & BACKUP STRATEGY

Café Cue & Brew operates on a single-tenant MySQL database architecture. Disaster recovery readiness requires both automated hosting backups and manual backup/restore capabilities.

### Backup Schedules & Policies
- **Automated Hostinger Daily Backups**: Automated full database snapshots taken daily by Hostinger hPanel with a 30-day retention window.
- **Manual Pre-Deployment Dumps**: Executed before any database schema migration or major deployment.
- **Export Retention**: Stored offsite in encrypted storage; database passwords are never included in dump files or committed to Git repositories.

---

## 2. HOW TO CREATE A MANUAL DATABASE BACKUP

### Option A: Via MySQL CLI / mysqldump
Run the following command on the server or via SSH terminal:

```bash
mysqldump -u <DB_USER> -p<DB_PASSWORD> -h <DB_HOST> --single-transaction --routines --triggers <DB_NAME> > backup_cafecuebrew_$(date +%Y%m%d_%H%M%S).sql
```

> [!IMPORTANT]
> Always include `--single-transaction` to prevent table locking during POS operations.

### Option B: Via Hostinger hPanel
1. Log in to the Hostinger Control Panel (hPanel).
2. Navigate to **Databases** -> **Management** -> **Backups**.
3. Select the production database (`cafe_cue_brew`).
4. Click **Generate New Backup** and download the resulting `.sql.gz` file.

---

## 3. HOW TO RESTORE A BACKUP (DISASTER RECOVERY PROCEDURE)

> [!CAUTION]
> **NEVER OVERWRITE THE PRODUCTION DATABASE DIRECTLY DURING A RESTORE TEST.**
> Always restore to an isolated test database first to verify data integrity.

### Step 1: Create a Temporary Recovery Database
Create a clean, isolated database (e.g. `cafe_cue_brew_recovery`) in Hostinger MySQL Management.

### Step 2: Restore the Dump File into Recovery DB
```bash
mysql -u <DB_USER> -p<DB_PASSWORD> -h <DB_HOST> cafe_cue_brew_recovery < backup_cafecuebrew_YYYYMMDD_HHMMSS.sql
```

### Step 3: Verify Data Integrity
Connect to the recovery database and inspect key business models:
```sql
-- Verify core tables exist and record counts match
SELECT COUNT(*) FROM staff;
SELECT COUNT(*) FROM `order`;
SELECT COUNT(*) FROM bill;
SELECT COUNT(*) FROM customer;
SELECT COUNT(*) FROM ingredient;
```

### Step 4: Point Application to Recovered Database
If restoring after a primary database failure:
1. Update the environment variable `DATABASE_URL` in Hostinger Environment Configuration:
   ```env
   DATABASE_URL="mysql://<DB_USER>:<ENCODED_PASSWORD>@<DB_HOST>:3306/cafe_cue_brew_recovery?connection_limit=5&connect_timeout=10&pool_timeout=10"
   ```
2. Re-generate Prisma Client:
   ```bash
   npx prisma generate
   ```
3. Restart the NestJS application process:
   ```bash
   npm run start:prod
   ```

---

## 4. POST-RECOVERY VERIFICATION CHECKLIST

- [ ] NestJS application boots cleanly with 0 errors.
- [ ] `GET /api` returns `Hello World!`.
- [ ] `POST /api/auth/login` accepts valid OWNER / staff PIN logins.
- [ ] Active staff sessions (`StaffSession`) operate properly.
- [ ] Menu items, categories, and table QR ordering operate cleanly.
- [ ] POS live order board and billing finalization function properly.

---

## 5. EMERGENCY ROLLBACK PROCEDURE

If a bad deployment or broken migration occurs:
1. Revert Git repository to the last stable release tag:
   ```bash
   git checkout tags/v1.0.0-stable
   ```
2. Run Prisma schema validation:
   ```bash
   npx prisma validate
   ```
3. Re-build and restart:
   ```bash
   npm run build
   npm run start:prod
   ```