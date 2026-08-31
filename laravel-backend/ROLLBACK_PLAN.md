# CAFÉ CUE & BREW — EMERGENCY ROLLBACK PLAN (PHASE 4)

This document defines the immediate emergency rollback strategy to preserve 100% uptime for **Café Cue & Brew** if any issues arise during deployment.

---

## 1. ZERO DATABASE IMPACT GUARANTEE

The Laravel 11 migration performs **ZERO schema changes** and **ZERO data migrations**.
- No database rollback or SQL restore is required.
- The existing MySQL/MariaDB database remains 100% compatible with both NestJS and Laravel backends.

---

## 2. ROLLBACK PROCEDURE

If any issue occurs on Hostinger:
1. **Revert Subdomain Document Root**:
   In Hostinger hPanel, point `api.cafecuebrew.com` back to the existing NestJS application directory (`/home/u123456789/backend/dist/main.js` via PM2 / Node.js manager).
2. **Verify NestJS Fallback Health**:
   Execute `GET https://api.cafecuebrew.com/api/health`.
3. **Verify Next.js Frontend**:
   Refresh `https://cafecuebrew.com` to confirm seamless POS and ordering functionality.

---

## 3. ROLLBACK TIME

- **Estimated Time to Revert**: **< 2 minutes** (DNS/routing toggle only).
