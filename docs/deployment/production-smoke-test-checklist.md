# GO-LIVE SMOKE TEST CHECKLIST — CAFE CUE & BREW

---

## 1. Executive Instructions

This checklist details the 30 mandatory functional and security smoke test scenarios that must be executed immediately following production deployment to validate system stability.

---

## 2. 30 Go-Live Verification Test Scenarios

### Customer Order Flow (1 - 7)
- [ ] **1. Scan Table QR**: Access URL `/menu?tableId=<VALID_TABLE_ID>` via mobile browser. Verify table session initializes.
- [ ] **2. Open Menu**: Verify categories and menu items load with images, variants, and addons.
- [ ] **3. Select Item**: Select item with variant (e.g. Medium Coffee) and addon (e.g. Extra Shot).
- [ ] **4. Add to Cart**: Verify cart total updates dynamically in bottom drawer.
- [ ] **5. Enter Customer Details**: Enter customer name and valid phone number.
- [ ] **6. Place Order**: Submit public order. Verify HTTP 201 response and receipt of `publicTrackingToken`.
- [ ] **7. Track Order**: Redirect to `/menu/track?token=<TRACKING_TOKEN>`. Verify order status displays `RECEIVED`.

### Staff POS & Order Lifecycle (8 - 12)
- [ ] **8. Staff Login**: Open `/login`. Login with valid PIN (e.g., Owner/Manager). Verify JWT issued and redirect to `/dashboard`.
- [ ] **9. Verify Role Permissions**: Confirm navigation menu displays role-appropriate options (`POS`, `Orders`, `Billing`, `Inventory`, `Staff`).
- [ ] **10. View Order**: Open `/dashboard/orders`. Confirm customer QR order `ORD-xxx` appears in real-time.
- [ ] **11. Accept & Process Order**: Click `Accept` -> `Preparing` -> `Ready` -> `Served`. Verify status updates cleanly.
- [ ] **12. Complete Order**: Mark order `COMPLETED`.

### Billing & Financial Accuracy (13 - 18)
- [ ] **13. Create Bill**: Open `/dashboard/bills` or click `Generate Bill` on table.
- [ ] **14. Apply Discount / Coupon**: Test applying valid coupon code (e.g. `WELCOME10`). Verify subtotal discount calculation.
- [ ] **15. Calculate GST**: Confirm CGST (2.5%) and SGST (2.5%) match tax settings.
- [ ] **16. Accept Payment**: Record payment (Cash / UPI). Verify amount tendered and change due calculation.
- [ ] **17. Finalize Bill**: Click `Finalize & Print`. Verify bill status transitions to `PAID`.
- [ ] **18. Verify Settlement**: Confirm financial reports reflect revenue under settled payment methods.

### Inventory Lifecycle (19 - 21)
- [ ] **19. Verify Stock Deduction**: Open `/dashboard/inventory`. Verify recipe ingredients were auto-deducted upon order completion.
- [ ] **20. Verify Stock Ledger**: Inspect `StockLog` for ingredient. Confirm transaction type is `SALE` linked to order ID.
- [ ] **21. Verify Cancellation Reversal**: Cancel an order prior to settlement. Confirm stock is automatically returned to inventory with `REVERSAL` log.

### CRM & Loyalty (22 - 25)
- [ ] **22. Customer Record Created/Linked**: Open `/dashboard/customers`. Confirm customer phone number is indexed.
- [ ] **23. Phone Normalization**: Verify phone number formatted to E.164 (`+91...`).
- [ ] **24. Loyalty Points**: Verify customer account credited with calculated loyalty points from finalized bill.
- [ ] **25. Coupon Usage Counter**: Verify `CustomerCouponUsageCounter` incremented for customer.

### System Security & Resilience (26 - 30)
- [ ] **26. Unauthorized Route Rejected**: Attempt accessing `/dashboard` without Authorization header. Verify HTTP 401 Unauthorized.
- [ ] **27. Unauthorized Role Rejected**: Attempt accessing `/dashboard/staff` as Waiter role. Verify HTTP 403 Forbidden.
- [ ] **28. Invalid JWT Rejected**: Send request with tampered JWT string. Verify HTTP 401 response.
- [ ] **29. CORS Unauthorized Origin Rejected**: Send request with `Origin: https://evil-hacker.com`. Verify CORS header `Access-Control-Allow-Origin` is omitted/rejected.
- [ ] **30. Rate Limiting Works**: Send 35 rapid requests to `/api/public/orders`. Verify HTTP 429 Too Many Requests response.
