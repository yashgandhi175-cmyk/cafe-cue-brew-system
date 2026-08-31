# CAFÉ CUE & BREW — LARAVEL ARCHITECTURE DECISION (PHASE 0.5)

---

## 1. TARGET SYSTEM ARCHITECTURE

```text
Browser / POS Terminal / Digital QR Menu
            ↓ HTTP / HTTPS
Hostinger Apache / LiteSpeed Web Server
            ↓ FastCGI
PHP 8.2 / 8.3 (Laravel 11.x)
            ↓ PDO / Eloquent ORM
MySQL 8.0 / MariaDB Database
```

---

## 2. KEY ARCHITECTURAL PRINCIPLES

1. **Single-Café Focus**: Dedicated exclusively to **Café Cue & Brew**. No multi-tenancy, no `tenant_id`, no organization switching.
2. **Zero Persistent Production Node.js Processes**: The application executes cleanly as a standard PHP request-response web application. Node.js is only used for local asset compilation at build time (`npm run build`).
3. **Database Schema Compatibility**: Existing MySQL table names (`Staff`, `Order`, `MenuItem`, `Ingredient`, `Bill`, etc.), column names, data types, indexes, and primary keys are preserved 100%. No destructive DB migrations or `migrate:fresh` against production.
4. **Session & API Auth Options**:
   - **Static Frontend Mode**: The existing static Next.js frontend calls Laravel `/api/*` endpoints authenticated via Bearer Tokens matching the existing JWT/Session validation behavior.
   - **Hostinger Shared Hosting Compatibility**: Optimized for Hostinger Business shared hosting limits (memory, execution timeout, connections capped at `connection_limit=5`).
5. **Background Tasks**: Hostinger Cron invokes `php artisan schedule:run` or specific Artisan commands (`php artisan marketing:process-queue`) via CLI or HTTP trigger, avoiding persistent daemon threads or Redis dependencies.
