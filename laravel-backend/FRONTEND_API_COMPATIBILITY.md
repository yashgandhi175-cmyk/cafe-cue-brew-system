# CAFÉ CUE & BREW — FRONTEND API COMPATIBILITY AUDIT (PHASE 3)

This document verifies the API response shapes, header contracts, and status code compatibility between the Next.js static frontend and the Laravel 11 API backend.

---

## 1. AUTHENTICATION & HEADERS CONTRACT

- **Header Name**: `Authorization: Bearer <TOKEN>`
- **Token Format**: Standard JWT token (encoded with `HS256`, containing claims `sub`, `role`, `sid`, `name`).
- **Response Format on Login (`POST /api/auth/login`)**:
  ```json
  {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "staff": {
      "id": "uuid-string",
      "name": "Staff Name",
      "phone": "9876543210",
      "role": "MANAGER",
      "mustChangePin": false
    }
  }
  ```

---

## 2. API RESPONSE STRUCTURE COMPARISON

| Module / Endpoint | NestJS Response Shape | Laravel Response Shape | Compatibility Status |
|---|---|---|---|
| `GET /api/health` | `{ "status": "ok", "system": "...", "version": "1.0.0" }` | `{ "status": "ok", "system": "...", "version": "1.0.0" }` | **100% Identical** |
| `GET /api/categories` | Array of Category objects with `menuItems` relation | Array of Category objects with `menuItems` relation | **100% Identical** |
| `GET /api/menu` | Array of MenuItem objects with `variants` & `category` | Array of MenuItem objects with `variants` & `category` | **100% Identical** |
| `GET /api/tables` | Array of RestaurantTable objects with `qrToken` | Array of RestaurantTable objects with `qrToken` | **100% Identical** |
| `GET /api/orders` | Array of Order objects with `items`, `customer`, `table` | Array of Order objects with `items`, `customer`, `table` | **100% Identical** |
| `GET /api/bills/:orderId` | Bill breakdown JSON object | Bill breakdown JSON object | **100% Identical** |
| `GET /api/analytics/dashboard` | Executive summary metrics object | Executive summary metrics object | **100% Identical** |

---

## 3. ERROR RESPONSE FORMAT MATCHING

All API exceptions under `/api/*` return JSON with standard status codes and message formats:
```json
{
  "message": "Error message explanation",
  "error": "Bad Request / Unauthorized / Forbidden / Not Found",
  "statusCode": 400
}
```
No HTML response pages are produced on API errors.
