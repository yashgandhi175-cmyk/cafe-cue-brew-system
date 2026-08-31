# PRODUCTION ENVIRONMENT CHECKLIST — CAFE CUE & BREW

---

## 1. Executive Overview

This document defines the complete environment variable taxonomy for the **Cafe Cue & Brew Restaurant Management System**, classifying every variable by scope, requirement level, purpose, and security classification.

> [!IMPORTANT]
> **Zero-Leakage Security Requirement**: Production secrets, database credentials, and JWT keys MUST NOT be committed to git repositories or exposed in client-side bundles.

---

## 2. Comprehensive Environment Variable Classification Matrix

| Environment Variable | Classification | Component | Description / Purpose | Default / Fallback | Secret Masked Example |
| :--- | :---: | :---: | :--- | :--- | :--- |
| `DATABASE_URL` | **REQUIRED (PRODUCTION ONLY)** | Backend & Prisma | Production MySQL connection string | None (App fails startup if missing) | `mysql://user:****@host:3306/dbname` |
| `TEST_DATABASE_URL` | **TEST / DEVELOPMENT ONLY** | Backend & Integration Test | Isolated disposable MySQL test database URL | None | `mysql://cafe_test:****@127.0.0.1:3306/cafe_cue_brew_test` |
| `JWT_SECRET` | **REQUIRED (PRODUCTION ONLY)** | Backend Auth | Cryptographically secure secret key for signing staff JWTs | None in production (App fails startup if missing/default) | `****` (Min 64-char random hex) |
| `JWT_EXPIRES_IN` | **OPTIONAL (PRODUCTION)** | Backend Auth | Token validity duration | `12h` | `12h` |
| `NODE_ENV` | **REQUIRED (PRODUCTION ONLY)** | Backend & Frontend | Execution environment flag | `development` | `production` |
| `PORT` | **OPTIONAL (PRODUCTION)** | Backend | HTTP server listening port | `3000` or `3001` | `3000` |
| `FRONTEND_URL` | **REQUIRED (PRODUCTION ONLY)** | Backend CORS | Official frontend web application origin for CORS checks | `http://localhost:3000` | `https://cafecuebrew.com` |
| `UPLOAD_DIR` | **OPTIONAL (PRODUCTION)** | Backend Storage | Local directory path for menu/logo/banner images | `./uploads` | `./uploads` |
| `NEXT_PUBLIC_API_URL` | **OPTIONAL (FRONTEND)** | Frontend | Public API base path for Next.js browser client | `/api` | `/api` |
| `WHATSAPP_API_URL` | **OPTIONAL (MARKETING)** | Backend Marketing | Meta WhatsApp Cloud API endpoint | `https://graph.facebook.com/v18.0` | `https://graph.facebook.com/v18.0` |
| `WHATSAPP_ACCESS_TOKEN` | **OPTIONAL (MARKETING)** | Backend Marketing | System User Permanent Access Token for Meta WhatsApp API | None | `EAAG****` |
| `WHATSAPP_PHONE_NUMBER_ID` | **OPTIONAL (MARKETING)** | Backend Marketing | Meta Phone Number ID for WhatsApp Sender Account | None | `105****` |
| `WHATSAPP_BUSINESS_ACCOUNT_ID` | **OPTIONAL (MARKETING)** | Backend Marketing | Meta Business Account ID | None | `102****` |
| `WHATSAPP_VERIFY_TOKEN` | **OPTIONAL (MARKETING)** | Backend Marketing | Webhook Verification Token for incoming WhatsApp webhooks | None | `****` |
| `WHATSAPP_APP_SECRET` | **OPTIONAL (MARKETING)** | Backend Marketing | Meta App Secret for SHA256 webhook signature validation | None | `****` |
| `MARKETING_QUEUE_SECRET` | **OPTIONAL (MARKETING)** | Backend Marketing | Secret key for triggering background marketing queue processing | None | `****` |

---

## 3. Deployment Pre-Flight Checklist

- [ ] `DATABASE_URL` configured on Hostinger pointing to Hostinger production MySQL instance.
- [ ] `JWT_SECRET` configured on Hostinger with a randomly generated 64+ character string (`openssl rand -hex 32`).
- [ ] `NODE_ENV=production` set on backend server process.
- [ ] `FRONTEND_URL=https://cafecuebrew.com` configured for CORS verification.
- [ ] `TEST_DATABASE_URL` is NOT present in production environment settings.
- [ ] `NEXT_PUBLIC_API_URL` in frontend build relies on relative `/api` route or official production API domain.
- [ ] `UPLOAD_DIR` path has write permissions (`755`) on production host filesystem.
