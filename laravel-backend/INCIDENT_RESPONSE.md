# CAFÉ CUE & BREW — INCIDENT RESPONSE PROCEDURES

---

### 1. INCIDENT SEVERITY CLASSIFICATION
- **SEV-1 (CRITICAL)**: API completely unreachable, login failing for all staff, or billing calculation errors. Action: Instant Rollback to NestJS fallback.
- **SEV-2 (HIGH)**: Single non-financial module impaired (e.g., public banners endpoint failing). Action: Investigate `storage/logs/` and apply targeted hotfix.
- **SEV-3 (LOW)**: Non-blocking warning or cosmetic display issue. Action: Resolve during scheduled maintenance.

---

### 2. SEV-1 EMERGENCY ROLLBACK PROCEDURE
1. Log into Hostinger hPanel dashboard.
2. Navigate to Domain Management -> `api.cafecuebrew.com`.
3. Switch Document Root pointer from `/public_html/laravel-backend/public` back to `/public_html/backend/dist`.
4. Test `GET https://api.cafecuebrew.com/api/health` -> Confirm NestJS fallback active.
5. Notify system administrator and preserve `laravel-backend/storage/logs/` for root-cause analysis.
