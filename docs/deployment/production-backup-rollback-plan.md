# PRODUCTION BACKUP & ROLLBACK PLAN — CAFE CUE & BREW

---

## 1. Pre-Deployment Phase

### A. Database Backup Protocol
Before applying any production migration or code release to Hostinger:

1. **Create MySQL Full Dump**:
   ```bash
   mysqldump -u <HOSTINGER_DB_USER> -p<HOSTINGER_DB_PASS> -h <HOSTINGER_DB_HOST> \
     --single-transaction --quick --lock-tables=false \
     --routines --triggers --events \
     cafe_cue_brew > backup_cafe_cue_brew_$(date +%Y%m%d_%H%M%S).sql
   ```
2. **Compress Backup Archive**:
   ```bash
   gzip backup_cafe_cue_brew_$(date +%Y%m%d_%H%M%S).sql
   ```
3. **Verify Backup Integrity**:
   - Confirm backup file size > 0 bytes.
   - Inspect archive header: `zcat backup_*.sql.gz | head -n 25`.
   - Verify presence of table definitions (`CREATE TABLE`) and essential data inserts.

### B. Version & Migration Baseline Recording
- Record current git commit hash: `git rev-parse HEAD`
- Record applied migration status:
  ```bash
  npx prisma migrate status
  ```

---

## 2. Deployment Phase

1. **Deploy Backend Build**: Upload `dist/` directory and `node_modules` to Hostinger backend Node environment.
2. **Deploy Frontend Static Build**: Upload `frontend/out` or static assets to Web root.
3. **Apply Prisma Schema Migrations**:
   > [!IMPORTANT]
   > Run migration deployment ONLY AFTER backup verification is complete.
   ```bash
   npx prisma migrate deploy
   ```
4. **Execute Immediate Health Check**:
   - `GET /api/app` (Returns `200 OK`)
   - `GET /api/public/categories-with-items` (Returns HTTP 200 with menu JSON)

---

## 3. Post-Deployment Functional Verification (11 Control Points)

- [ ] **1. Staff Login**: Verify Owner/Manager/Cashier PIN login (`/api/auth/login`).
- [ ] **2. Customer Menu**: Open `/menu?tableId=<TABLE_ID>` on mobile device.
- [ ] **3. QR Ordering**: Add items to cart and submit order (`POST /api/public/orders`).
- [ ] **4. Order Processing**: Open `/dashboard/orders` on POS, accept order, update status to `PREPARING` -> `SERVED`.
- [ ] **5. Billing Creation**: Generate bill for order (`POST /api/billing/generate`).
- [ ] **6. Tax & Discount Calculation**: Verify GST (CGST/SGST), rounding, and coupon discounts on bill preview.
- [ ] **7. Payment Settlement**: Record cash/UPI payment (`POST /api/payments`), verify bill status updates to `PAID`.
- [ ] **8. Inventory Deduction**: Verify ingredient stock updated in `/dashboard/inventory`.
- [ ] **9. CRM Update**: Check customer profile visit count and total spending in `/dashboard/customers`.
- [ ] **10. Loyalty Points**: Verify customer earned loyalty points from completed bill.
- [ ] **11. Coupon Usage Counter**: Verify per-customer coupon counter updated.

---

## 4. Rollback & Emergency Recovery Protocol

If critical failure occurs post-deployment:

### A. Application Code Rollback
1. Revert web server symlink or code directory to previous commit hash.
2. Restart Node backend process: `pm2 restart cafe-backend` or Hostinger Passenger process restart.
3. Revert static frontend files to previous build.

### B. Database Rollback Procedure (If Schema Migration Caused Failures)
1. Stop backend service to prevent ongoing write operations.
2. Restore database from pre-deployment backup:
   ```bash
   zcat backup_cafe_cue_brew_YYYYMMDD_HHMMSS.sql.gz | mysql -u <HOSTINGER_DB_USER> -p<HOSTINGER_DB_PASS> -h <HOSTINGER_DB_HOST> cafe_cue_brew
   ```
3. Verify restored table row counts.
4. Restart backend service and verify system health.
