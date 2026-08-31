# CAFÉ CUE & BREW — HOSTINGER CRON JOB SPECIFICATION (PHASE 4)

This document specifies the exact Hostinger hPanel Cron Job setup for background marketing queue processing without persistent daemon processes or Redis.

---

## 1. CRON SPECIFICATION & SCHEDULE

- **Execution Method**: HTTP POST / CLI Artisan command
- **Frequency**: Every 5 Minutes (`*/5 * * * *`)
- **Target Endpoint**: `POST https://api.cafecuebrew.com/api/marketing/queue/process`
- **Alternative hPanel Command**:
  ```bash
  /usr/bin/php /home/u123456789/laravel-backend/artisan schedule:run >> /dev/null 2>&1
  ```

---

## 2. RECOVERY CRON SPECIFICATION

- **Frequency**: Once Daily at 03:00 AM (`0 3 * * *`)
- **Target Endpoint**: `POST https://api.cafecuebrew.com/api/marketing/queue/recover`
- **Purpose**: Clears locked marketing queue jobs that stalled due to network timeouts.

---

## 3. SAFETY & CONCURRENCY CONTROLS

- **Idempotency**: Marketing queue jobs maintain atomic `status` and `lockedAt` timestamps to prevent duplicate sending.
- **Daemon-Free Architecture**: Zero persistent background workers required on Hostinger.
