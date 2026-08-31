# CAFÉ CUE & BREW — RELEASE CHECKLIST & GOVERNANCE
## Pre-Release, Deployment & Post-Release Decision Protocol

---

### 1. PRE-RELEASE GATES (MANDATORY)
- [ ] **Git Working Tree**: Run `git status` -> Confirm working directory is clean and mapped.
- [ ] **PHPUnit Regression Suite**: Run `vendor/bin/phpunit` -> Must pass 100% (17 tests, 42 assertions).
- [ ] **Route Inventory Audit**: Run `php artisan route:list` -> Confirm 72 routes registered cleanly.
- [ ] **Config Sanity**: Confirm `APP_DEBUG=false`, `APP_ENV=production`, `LOG_STACK=daily`, `LOG_DAILY_DAYS=14`.
- [ ] **Zero Database Migrations**: Confirm no migration commands (`migrate`, `migrate:fresh`, etc.) will be executed on production.

---

### 2. DEPLOYMENT STEPS (SAFE EXECUTION)
- [ ] **Code Upload**: Synchronize `laravel-backend/` files to Hostinger server via SFTP or Git pull.
- [ ] **Autoloader Optimization**: Run `composer install --no-dev --optimize-autoloader`.
- [ ] **Safe Cache Rebuild**: Run `php artisan config:cache`, `php artisan route:cache`, `php artisan view:cache`.

---

### 3. POST-RELEASE DECISION GATES
- **`GO`**: Health check `GET /api/health` returns HTTP 200, PIN login works, menu API succeeds, 0 errors in logs.
- **`GO WITH CONDITIONS`**: Non-critical warnings present (e.g. minor log formatting issue), no data risk.
- **`NO-GO (ROLLBACK)`**: HTTP 500 errors, broken authentication, or financial calculation failures. Revert document root pointer back to `backend/dist` immediately.
