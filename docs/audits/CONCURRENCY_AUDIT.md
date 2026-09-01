# CAFÉ CUE & BREW — CONCURRENCY & TRANSACTION AUDIT (PHASE 3)

This document maps all database transactions and pessimistic locking mechanisms migrated from Prisma to Laravel 11.

---

## 1. TRANSACTIONALLY ISOLATED OPERATIONS

| Operation | NestJS Prisma Primitive | Laravel Eloquent Primitive | Concurrency Protections | Risk Mitigated |
|---|---|---|---|---|
| **POS Order Creation** | `prisma.$transaction()` | `DB::transaction()` | Atomic write for Order + OrderItems + OrderItemAddons | Prevents orphaned order items on partial failures |
| **Bill Finalization** | `prisma.$transaction()` | `DB::transaction()` | `InvoiceSequence` sequence counter update with row lock | Prevents duplicate invoice numbers during simultaneous checkout |
| **Payment Recording** | `prisma.$transaction()` | `DB::transaction()` | Syncs Payment + Bill status + Order paymentStatus | Prevents partial payments or un-tracked cash receipts |
| **Stock Consumption** | `prisma.$transaction()` | `DB::transaction()` | StockTransaction ledger write + Ingredient `currentStock` update | Prevents negative or inconsistent inventory ledger states |
| **Purchase Finalization** | `prisma.$transaction()` | `DB::transaction()` | StockTransaction ledger write + Average cost update + Purchase status | Prevents double-stock addition on double-click |
| **Loyalty Earn & Redeem** | `prisma.$transaction()` | `DB::transaction()` | Customer `loyaltyPoints` balance check & decrement with idempotency key | Prevents double redemption and race-condition balance overdraft |
| **Credit Payment** | `prisma.$transaction()` | `DB::transaction()` | CreditLedger `outstandingAmount` decrement + CreditPayment record | Prevents credit over-payment or negative outstanding balances |

---

## 2. PESSIMISTIC LOCKING MECHANISMS (`lockForUpdate`)

1. **Invoice Sequence Generator**:
   ```php
   $seq = InvoiceSequence::where('year', $year)->where('prefix', $prefix)->lockForUpdate()->first();
   ```
2. **Loyalty Point Deductions**:
   ```php
   $customer = Customer::where('id', $customerId)->lockForUpdate()->first();
   ```
3. **Stock Deductions**:
   ```php
   $ingredient = Ingredient::where('id', $ingredientId)->lockForUpdate()->first();
   ```
