# CAFÉ CUE & BREW — BILLING LOGIC & FINANCIAL CALCULATIONS (PHASE 3)

This document specifies the exact financial calculation formulas, tax rules, discount hierarchies, and monetary precision constraints migrated from the NestJS backend to Laravel 11.

---

## 1. FINANCIAL CALCULATION FORMULAS & ORDER OF OPERATIONS

All monetary calculations in Café Cue & Brew follow a strict 9-step sequential pipeline:

```
[Items Total / Subtotal]
          ↓
 1. Manual Discount (Flat or Percentage limit checked against Staff Role)
          ↓
 2. Coupon Discount (Flat or Percentage capped by maxDiscount)
          ↓
 3. Loyalty Discount (Earn/Redeem blocks capped by maximumRedeemPercent)
          ↓
 4. Total Discount = Manual + Coupon + Loyalty
          ↓
 5. Taxable Base = Subtotal - Total Discount
          ↓
 6. Taxes:
    - GST = Taxable Base * (gstPercentage / 100)  [Default: 5%]
    - CGST = Taxable Base * (cgstPercentage / 100) [Default: 2.5%]
    - SGST = Taxable Base * (sgstPercentage / 100) [Default: 2.5%]
    (Note: If taxInclusivePricing is enabled, baseTaxable = Taxable Base / 1.05)
          ↓
 7. Service Charge = Subtotal * (serviceChargePercentage / 100)
          ↓
 8. Night Charge = Flat value or Percentage (if enabled & order in night window)
          ↓
 9. Pre-Round Total = Taxable Base + CGST + SGST + Service Charge + Night Charge
          ↓
 10. Round-Off & Grand Total:
     - Grand Total = round(Pre-Round Total)
     - Round Off = Grand Total - Pre-Round Total
```

---

## 2. MONETARY PRECISION & ARITHMETIC RULES

1. **Floating Point Prohibition**: Monetary calculations MUST NOT use standard PHP float multiplication or division without rounding.
2. **Rounding Rule**: All intermediate and final monetary amounts are rounded to 2 decimal places using `round($amount, 2, PHP_ROUND_HALF_UP)`.
3. **Database Precision**:
   - Currency & Prices (`subtotal`, `discount`, `taxableAmount`, `cgst`, `sgst`, `serviceCharge`, `nightCharge`, `grandTotal`, `price`): `DECIMAL(10, 2)`
   - Round Off: `DECIMAL(5, 2)`
   - Stock Quantities (`currentStock`, `quantity`): `DECIMAL(12, 3)`
   - Unit Cost Snapshots: `DECIMAL(12, 4)`

---

## 3. DISCOUNT HIERARCHY & AUTHORIZATION LIMITS

- **Cashier Manual Discount Limit**: `settings.cashierMaxDiscountPercent` (Default: **10.0%**)
- **Manager Manual Discount Limit**: `settings.managerMaxDiscountPercent` (Default: **25.0%**)
- **Owner**: Unlimited (up to 100% of subtotal)
- **Waiters**: **Not authorized** to apply manual discounts.

---

## 4. LOYALTY POINTS EARNING & REDEMPTION FORMULAS

- **Earning Points**:
  - `Eligible Amount` = Taxable Amount after discounts.
  - `Earn Blocks` = `floor(Eligible Amount / settings.loyaltySpendAmount)` (Default ₹100 spend).
  - `Points Earned` = `Earn Blocks * settings.loyaltyPointsEarned` (Default 1 point per ₹100).
- **Redeeming Points**:
  - `Redeem Blocks` = `floor(Requested Points / settings.loyaltyRedemptionPoints)` (Default 10 points block).
  - `Discount Value` = `Redeem Blocks * settings.loyaltyRedemptionValue` (Default ₹10 per 10 points).
  - `Max Redeem Cap` = `Taxable Base * (settings.loyaltyMaximumRedeemPercent / 100)`.

---

## 5. INVOICE NUMBER GENERATION & TRANSACTIONAL ISOLATION

Invoice numbers use sequence-safe row-locking on table `InvoiceSequence`:
- Format: `{PREFIX}-{YYYY}-{SEQUENCE_NUMBER_6_DIGITS}` (e.g., `CCB-2026-000001`).
- Atomic sequence increment within `DB::transaction()`.
