# OGHUB Payment System — Design Specification

**Date:** 2026-04-06
**Status:** Approved
**Scope:** Deposit & withdrawal system with Stripe (cards) + NOWPayments (crypto)

---

## 1. Overview

OGHUB is a global real-money competitive gaming platform. Users deposit funds, enter rooms/challenges with entry fees (5%/10% platform rake), win prizes, and withdraw earnings. This spec defines the complete payment infrastructure.

### Providers

| Provider | Use Case | Fee (Deposit) | Fee (Payout) |
|----------|----------|---------------|--------------|
| **Stripe** | Credit/debit cards globally | 2.9% + $0.30 (platform absorbs) | $0.25 ACH / 0.25%+$0.25 card |
| **NOWPayments** | Crypto (USDT, USDC, BTC, ETH, 200+) | 0.5% (platform absorbs) | 0.5% (platform absorbs) |

### Fee Policy (Hybrid)

- **Deposits:** Platform absorbs all processor fees. User deposits $50, gets $50.
- **Withdrawals (card):** $0.50 flat fee deducted from withdrawal amount.
- **Withdrawals (crypto):** 0% user fee (platform absorbs 0.5%). User pays gas fees on-chain.
- **Incentive:** Crypto is 4x more profitable — promoted as "0% fees" to encourage adoption.

---

## 2. Financial Model

### Profitability Analysis

**Card user — deposits $50, plays 5 rooms at $10, withdraws $30:**

```
Deposit fee:     -$1.75 (2.9% + $0.30, absorbed)
Rake:            +$2.50 (5 rooms × $10 × 5%)
Withdrawal fee:  -$0.25 (ACH cost)
User pays:       -$0.50 flat fee
Net profit:      +$1.00
```

**Crypto user — same scenario:**

```
Deposit fee:     -$0.25 (0.5%, absorbed)
Rake:            +$2.50
Withdrawal fee:  -$0.15 (0.5% of $30, absorbed)
Net profit:      +$2.10
```

### Limits Table

| Parameter | Credit Card | Crypto |
|-----------|-------------|--------|
| Min deposit | $10 | $5 |
| Max deposit/day | $2,000 | $10,000 |
| Min withdrawal | $20 | $10 |
| Max withdrawal/day | $5,000 | $10,000 |
| Max monthly (all) | $25,000 | $50,000 |
| Deposit fee | 0% (absorbed) | 0% (gas on user) |
| Withdrawal fee | $0.50 flat | 0% (absorbed) |
| Auto-approve threshold | $200 | $500 |

---

## 3. Architecture

### File Structure

```
apps/api/src/payments/
├── payment.service.ts        # Unified orchestrator
├── payment.router.ts         # API endpoints
├── providers/
│   ├── provider.interface.ts # Contract for all providers
│   ├── stripe.provider.ts    # Stripe Checkout + Payouts
│   └── nowpay.provider.ts    # NOWPayments invoices + payouts
├── limits.service.ts         # Daily/monthly limits, KYC checks
└── payout.service.ts         # Withdrawal processing + auto-approve
```

### Provider Interface

```typescript
interface PaymentProvider {
  createCheckout(userId: string, amount: number, currency: string): Promise<{
    sessionId: string;
    redirectUrl: string;
  }>;

  verifyWebhook(headers: any, body: any): Promise<{
    sessionId: string;
    status: 'completed' | 'failed' | 'expired';
    providerPaymentId: string;
    amount: number;
  }>;

  createPayout(amount: number, recipient: RecipientDetails): Promise<{
    providerPayoutId: string;
    status: 'pending' | 'completed' | 'failed';
  }>;
}
```

### RecipientDetails

```typescript
type RecipientDetails =
  | { type: 'card_refund' }  // Stripe: returns to original card
  | { type: 'bank'; holderName: string; routingNumber: string; accountNumber: string }
  | { type: 'crypto'; address: string; network: 'ERC20' | 'TRC20' | 'SOL' | 'BTC' }
```

---

## 4. API Endpoints

### Deposit Flow

**POST /api/payments/checkout**

```typescript
// Request
{ amount: number; provider: 'STRIPE' | 'COINBASE'; currency?: string; coin?: string }

// Response
{ sessionId: string; redirectUrl: string }
```

Flow:
1. LimitsService.checkDepositAllowed(userId, amount, provider)
2. CheckoutSession.create({ status: PENDING, idempotencyKey: `dep_${userId}_${timestamp}`, expiresAt: +1h })
3. provider.createCheckout(userId, amount, currency)
4. Return redirectUrl — user pays on Stripe Checkout or NOWPayments invoice page

**GET /api/payments/checkout/:id/status**

```typescript
// Response
{ status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED'; amount?: string }
```

Frontend polls this after return from payment page (every 2s, max 60s).

### Webhook Handlers

**POST /api/payments/webhooks/stripe**
- Stripe signature verification via `stripe.webhooks.constructEvent()`
- On `checkout.session.completed`: credit wallet, update CheckoutSession
- Idempotent: skip if CheckoutSession already COMPLETED

**POST /api/payments/webhooks/nowpayments**
- HMAC-SHA512 verification with IPN secret
- On payment confirmed: credit wallet, update CheckoutSession
- On payout confirmed: update PayoutRequest status

### Withdrawal Flow

**POST /api/payments/payout**

```typescript
// Request
{
  amount: number;
  provider: 'STRIPE' | 'COINBASE';
  recipient: RecipientDetails;
}

// Response
{ payoutId: string; status: 'PENDING_REVIEW' | 'PROCESSING'; estimatedTime: string }
```

Flow:
1. LimitsService.checkWithdrawalAllowed(userId, amount, provider)
2. Debit wallet: `balance -= amount`, `frozenBalance += amount` (Serializable transaction)
3. WalletTransaction.create({ type: WITHDRAWAL, amount: -amount })
4. PayoutRequest.create({ status: PENDING_REVIEW })
5. Auto-approve check:
   - Card: amount <= $200 AND no cross-method flag → auto-approve
   - Crypto: amount <= $500 AND no cross-method flag → auto-approve
   - Else: stays PENDING_REVIEW for admin
6. If auto-approved: immediately call provider.createPayout()

**GET /api/payments/payouts**

Returns user's payout history with statuses.

### Admin Endpoints (for payout review)

**GET /api/admin/payouts?status=PENDING_REVIEW**
**POST /api/admin/payouts/:id/approve**
**POST /api/admin/payouts/:id/reject** — refunds to wallet

---

## 5. frozenBalance Usage

Currently unused. This design activates it:

| Event | balance | frozenBalance |
|-------|---------|---------------|
| Withdrawal requested | -amount | +amount |
| Payout completed | (unchanged) | -amount |
| Payout failed | +amount (refund) | -amount |

Frontend displays frozenBalance as "pending withdrawal" under the main balance when > 0.

---

## 6. KYC Tiers

### Tier Definitions

| Tier | Requirement | Deposit/day | Withdrawal/day | Cumulative |
|------|-------------|-------------|----------------|------------|
| **UNVERIFIED** | Default | $500 | $200 | $2,000 total |
| **BASIC** | Email + phone verified | $2,000 | $5,000 | Unlimited |
| **FULL** | Government ID (Stripe Identity) | Full limits | Full limits | Unlimited |

### Trigger Rules

- Cumulative deposits + withdrawals exceed $2,000 → require BASIC
- Single withdrawal > $1,000 → require FULL
- Any limit exceeded → block with `{ requiresKyc: true, requiredTier: 'BASIC' | 'FULL' }`

### Phase 1 Implementation

- Add `kycTier` field to User model: `UNVERIFIED | BASIC | FULL` (default UNVERIFIED)
- LimitsService checks tier and enforces corresponding limits
- When KYC required → API returns error with `requiresKyc: true`
- Frontend shows "Verify your identity to continue" banner
- Admin manually upgrades tier (no automated ID verification in Phase 1)

---

## 7. Anti-Fraud Rules

| Rule | Trigger | Action |
|------|---------|--------|
| Instant cashout | Deposit + withdrawal within 5 minutes | Block withdrawal, flag account |
| Failed checkouts | 3+ failed checkouts in a row | 1-hour cooldown |
| New crypto address | Withdrawal > $200 to unseen address | Require admin review |
| Cross-method | Card deposit → crypto withdrawal | Admin review if > $100; block if < 7 days since card deposit |
| Velocity | 5+ deposits in one day | Require BASIC KYC |

### Cross-Method Rule (Critical)

If a user deposited via card, they can only withdraw to the same card (as refund) for 7 days. After 7 days, cross-method withdrawal is allowed but flagged for admin review above $100. This prevents credit card fraud → crypto laundering.

---

## 8. Rate Limiting

| Endpoint | Limit | Window |
|----------|-------|--------|
| POST /payments/checkout | 5 | 1 minute |
| POST /payments/payout | 3 | 1 minute |
| POST /payments/webhooks/* | 100 | 1 minute |
| GET /payments/checkout/:id/status | 30 | 1 minute |

Implementation: `express-rate-limit` (already in project).

---

## 9. Frontend UX

### Wallet Page Changes

- Balance card shows frozenBalance as "($X pending withdrawal)" when > 0
- Deposit button opens DepositModal (bottom sheet)
- Withdraw button opens WithdrawModal (bottom sheet)
- Pending withdrawals section shows active PayoutRequests with status

### DepositModal

- Two tabs: Card | Crypto
- Card tab: quick amounts ($10/$25/$50/$100), custom input, min $10
- Crypto tab: quick amounts ($5/$25/$50/$100), custom input, min $5, coin selector (USDT/USDC/BTC/ETH)
- Submit → redirect to external payment page
- Return URL: `/wallet?checkout=success&session=xxx` or `/wallet?checkout=cancelled`

### WithdrawModal

- Two tabs: Card | Crypto
- Card tab: amount input, min $20, shows "$0.50 fee", shows last deposit card
- Crypto tab: amount input, min $10, network selector (ERC-20/TRC-20/SOL), wallet address input
- Shows "Estimated: 24-48 hours" and auto-approve threshold info
- Submit → immediate balance deduction, toast confirmation

### Post-Payment Return

When returning from Stripe/NOWPayments:
- `?checkout=success` → poll checkout status every 2s for 60s → show "Confirmed!" toast
- `?checkout=cancelled` → show "Deposit cancelled" toast, cleanup session

---

## 10. Database Changes

### User Model Addition

```prisma
model User {
  // ... existing fields
  kycTier         KycTier    @default(UNVERIFIED)
}

enum KycTier {
  UNVERIFIED
  BASIC
  FULL
}
```

### Existing Models Used (No Changes Needed)

- `CheckoutSession` — already defined with all required fields
- `PayoutRequest` — already defined with approval workflow fields
- `PaymentProviderType` enum — STRIPE, PAYPAL, COINBASE already defined
- `WalletTransaction.providerPaymentId` — already exists for reconciliation

---

## 11. Environment Variables

```env
# Stripe
STRIPE_SECRET_KEY=sk_...
STRIPE_PUBLISHABLE_KEY=pk_...
STRIPE_WEBHOOK_SECRET=whsec_...

# NOWPayments
NOWPAYMENTS_API_KEY=...
NOWPAYMENTS_IPN_SECRET=...

# Limits (defaults, overridable)
DEPOSIT_MIN_CARD=10
DEPOSIT_MIN_CRYPTO=5
WITHDRAWAL_MIN_CARD=20
WITHDRAWAL_MIN_CRYPTO=10
KYC_THRESHOLD=2000
```

---

## 12. NPM Packages Required

```
# API
stripe                  # Stripe SDK for checkout + payouts + webhooks
@nowpayments/api-client # NOWPayments SDK (if available, else raw HTTP)

# Web
@stripe/stripe-js       # Stripe.js for redirect-to-checkout
```

---

## 13. Out of Scope (Future)

- Automated KYC via Stripe Identity (Phase 2)
- PayPal integration (schema supports it, not built now)
- Multi-currency wallets (EUR, GBP)
- Recurring deposits / subscriptions
- Developer revenue share payouts
- Chargeback handling automation
