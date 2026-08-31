# CAFÉ CUE & BREW — MAINTENANCE POLICY & PROHIBITED COMMANDS

---

### 1. SAFE PRODUCTION MAINTENANCE COMMANDS
The following Artisan commands are safe for production optimization and cache management:
- `php artisan config:cache`
- `php artisan route:cache`
- `php artisan view:cache`
- `php artisan cache:clear`
- `php artisan optimize`

---

### 2. PROHIBITED PRODUCTION COMMANDS (DO NOT RUN)
The following commands are strictly prohibited in production without explicit database safety authorization:
- ❌ `php artisan migrate`
- ❌ `php artisan migrate:fresh` (DANGEROUS — Wipes production database)
- ❌ `php artisan migrate:refresh` (DANGEROUS — Drops all database tables)
- ❌ `php artisan migrate:reset` (DANGEROUS — Rolls back all migrations)
- ❌ `php artisan db:seed` (DANGEROUS — Overwrites existing production data)
- ❌ `php artisan db:wipe` (DANGEROUS — Drops all database tables)

---

### 3. SECRET ROTATION & DEPENDENCY POLICY
- Production secrets (`APP_KEY`, `JWT_SECRET`, database passwords) must never be committed to Git.
- Dependencies in `composer.json` must remain locked via `composer.lock`. Package upgrades must be tested locally prior to production deployment.
