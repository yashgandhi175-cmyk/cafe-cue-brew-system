# CAFÉ CUE & BREW — HOSTINGER DEPLOYMENT MANUAL (PHASE 4)

This document provides the step-by-step procedure for deploying the **Laravel 11.56.1** application to Hostinger shared hosting.

---

## 1. PRE-DEPLOYMENT BUILD (LOCAL STAGING)

Run local production build commands in `laravel-backend/`:
```bash
# 1. Install production dependencies (no dev dependencies)
composer install --no-dev --optimize-autoloader

# 2. Verify PHP syntax & test suite
vendor/bin/phpunit
```

---

## 2. FILE PLACEMENT ON HOSTINGER SERVER

1. Upload the `laravel-backend/` folder to the home directory outside `public_html`:
   `/home/u123456789/laravel-backend/`
2. Configure the document root for `api.cafecuebrew.com` in Hostinger hPanel to point to:
   `/home/u123456789/laravel-backend/public/`

---

## 3. PRODUCTION CONFIGURATION & CACHING (ON HOSTINGER SSH/TERMINAL)

```bash
cd /home/u123456789/laravel-backend/

# Copy environment template & generate APP_KEY
cp .env.example .env
php artisan key:generate

# Edit .env with Hostinger DB credentials and JWT secret
nano .env

# Cache configuration, routes, and views for maximum performance
php artisan config:cache
php artisan route:cache
php artisan view:cache
```

---

## 4. STAGING VERIFICATION

- Verify API health endpoint: `GET https://api.cafecuebrew.com/api/health`
- Expected JSON output:
  ```json
  {
    "status": "ok",
    "system": "Café Cue & Brew Laravel Backend Foundation",
    "version": "1.0.0"
  }
  ```
