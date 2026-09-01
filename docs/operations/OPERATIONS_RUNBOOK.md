# CAFÃ‰ CUE & BREW â€” OPERATIONAL RUNBOOK
## Laravel 11.56.1 Production Operations Guide

---

### 1. OVERVIEW & HOSTINGER ARCHITECTURE
- **API Endpoint**: `https://api.cafecuebrew.com`
- **Frontend App**: `https://cafecuebrew.com` (Next.js static export in `frontend/out/`)
- **Hosting Environment**: Hostinger Business Shared Hosting (PHP FastCGI / LiteSpeed)
- **Database Engine**: MySQL / MariaDB (`cafe_cue_brew`, 53 tables)
- **Rollback Fallback**: NestJS + Prisma intact in `backend/`

---

### 2. DAILY OPERATIONAL CHECKS
1. **API Health Check**: Perform GET request to `https://api.cafecuebrew.com/api/health` -> Verify HTTP 200 OK.
2. **Log Review**: Inspect `storage/logs/laravel-YYYY-MM-DD.log` for unhandled exceptions or 500 errors.
3. **Cron Execution**: Verify HTTP Cron execution log for `POST /api/marketing/queue/process` scheduled every 5 minutes (`*/5 * * * *`).
4. **Disk Storage**: Monitor log directory size (`LOG_DAILY_DAYS=14` keeps files bounded).

---

### 3. WEEKLY OPERATIONAL CHECKS
1. **Automated Regression Suite**: Execute `C:\Users\mites\.php83\php.exe vendor/bin/phpunit` in `laravel-backend/`. Verify 100% pass rate.
2. **Failed Auth Audit**: Check `staff_sessions` table for suspicious failed PIN login patterns.
3. **Storage Review**: Inspect `storage/app/public/` uploads folder size and permissions.

---

### 4. MONTHLY OPERATIONAL CHECKS
1. **Hostinger Backup Verification**: Confirm Hostinger hPanel daily MySQL database backups are generated and downloadable.
2. **Rollback Pointer Check**: Verify the document root pointer (`/public`) and NestJS fallback directory (`backend/dist/main.js`).
3. **Performance Baseline**: Run local PHPUnit benchmarks to verify peak execution memory remains < 35 MB.

---

### 5. EMERGENCY RECOVERY & ROLLBACK
- **Trigger Condition**: Unresolvable production API error or critical database layer incompatibility.
- **Rollback Execution**:
  1. Log into Hostinger hPanel.
  2. Navigate to Domain Management -> `api.cafecuebrew.com` -> Document Root.
  3. Change Document Root from `/public_html/laravel-backend/public` back to `/public_html/backend/dist`.
  4. Verify NestJS backend responds at `https://api.cafecuebrew.com/api/health`.
- **RTO / RPO**: Rollback Time Objective < 2 minutes; Recovery Point Objective 0 (database unchanged).

---

### 6. EXTERNAL UPTIME MONITORING & ALERTING PROTOCOL
- **Target Endpoint**: `https://api.cafecuebrew.com/api/health`
- **HTTP Method**: `GET`
- **Expected Response**: `HTTP 200 OK` (`{ "status": "ok", "system": "CafÃ© Cue & Brew Laravel Backend Foundation", "version": "1.0.0" }`)
- **Monitoring Frequency**: Every 5 minutes (`*/5 * * * *`)
- **Alert Failure Threshold**: 2 consecutive failed HTTP checks
- **Incident Escalation Response**:
  1. Receive external downtime alert via Email / Webhook.
  2. Manually test `https://api.cafecuebrew.com/api/health`.
  3. Verify Hostinger server status & MySQL database connectivity.
  4. Inspect `storage/logs/laravel-*.log` for HTTP 500 exceptions.
  5. If API is down due to a failed code release, execute SEV-1 Rollback (< 2 minutes).
