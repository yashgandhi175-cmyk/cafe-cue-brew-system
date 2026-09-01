# PRODUCTION DATABASE SAFETY AUDIT — CAFE CUE & BREW

---

## 1. Overview & Isolation Architecture

This document details the database isolation controls, migration safety guards, and execution rules designed to protect the Hostinger production MySQL database (`cafe_cue_brew`) from accidental modification, truncation, or test script interference.

---

## 2. Structural Isolation Rules

```
┌───────────────────────────────────────────────────────────┐
│                      ISOLATION BOUNDARY                   │
├──────────────────────────────┬────────────────────────────┤
│   PRODUCTION ENVIRONMENT     │    TEST / INTEGRATION ENV   │
├──────────────────────────────┼────────────────────────────┤
│ DB Target: cafe_cue_brew     │ DB Target: cafe_cue_brew_test
│ Env Variable: DATABASE_URL   │ Env Variable: TEST_DATABASE_URL
│ Access: Hostinger MySQL TCP  │ Access: 127.0.0.1:3306 TCP │
│ User: Hostinger DB User      │ User: cafe_test           │
│ Policy: STRICTLY READ-ONLY   │ Policy: Disposable, reset  │
│         for test scripts     │         between runs       │
└──────────────────────────────┴────────────────────────────┘
```

1. **`DATABASE_URL` Protection**:
   - Points exclusively to production MySQL (`cafe_cue_brew`).
   - Destructive integration tests, test reset routines, and test table cleanup scripts are **hard-coded to reject `DATABASE_URL`**.

2. **`TEST_DATABASE_URL` Scope**:
   - Points exclusively to `cafe_cue_brew_test`.
   - Used for `npx prisma migrate deploy` in integration testing and E2E test execution.

---

## 3. Automated Safety Guard Verification

In [`backend/test/order-flow-integration.e2e-spec.ts`](file:///e:/cafe-cue-brew-system/backend/test/order-flow-integration.e2e-spec.ts#L14-L40), an explicit safety guard evaluates every execution:

```typescript
const testDbUrl = process.env.TEST_DATABASE_URL;
const prodDbUrl = process.env.DATABASE_URL || '';

if (
  !testDbUrl ||
  !testDbUrl.includes('cafe_cue_brew_test') ||
  testDbUrl === prodDbUrl ||
  prodDbUrl.includes('hostinger') ||
  testDbUrl.includes('hostinger') ||
  testDbUrl.includes('cue-brew-prod')
) {
  throw new Error(
    '❌ [SAFETY GUARD VIOLATION] Refusing to execute destructive tests: TEST_DATABASE_URL matches production database or contains restricted production keywords.',
  );
}
```

---

## 4. Verification Checklist

- [x] `DATABASE_URL` and `TEST_DATABASE_URL` are strictly separated.
- [x] Test runner refuses execution if `TEST_DATABASE_URL` is omitted or points to production.
- [x] Prisma seed scripts do NOT drop or truncate tables.
- [x] No `prisma db push --force-reset` or `prisma migrate reset` commands exist in production scripts.
- [x] Production database credentials are not committed to source code or accessible to client bundles.
