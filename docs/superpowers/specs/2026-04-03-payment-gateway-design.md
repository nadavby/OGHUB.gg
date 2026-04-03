# F1: Payment Gateway Integration — Design Spec

## Goal

Integrate three payment providers (Stripe, PayPal, Coinbase Commerce) behind a unified abstraction layer, enabling users to deposit funds via redirect-based checkout and request withdrawals that admins review and execute through the originating provider.

## Architecture

A **Strategy + Factory** pattern. A `PaymentProvider` interface defines the contract. Three concrete implementations (`StripeProvider`, `PayPalProvider`, `CoinbaseProvider`) handle provider-specific API calls. A `PaymentProviderFactory` resolves the correct implementation by provider name. The `PaymentService` orchestrates business logic (checkout creation, webhook processing, payout execution) by delegating to the resolved provider.

All payment confirmation happens via **webhooks only** — redirect success URLs are purely UX signals. The wallet is never credited until a webhook confirms the payment.

```
DEPOSIT FLOW:
  User → POST /api/payments/checkout { provider, amount }
       → PaymentService → factory.get(provider).createCheckout()
       → Returns redirect URL → User pays on provider's page
       → Provider sends webhook → POST /api/webhooks/:provider
       → PaymentService → provider.handleWebhook() → validates signature
       → Credits wallet via Prisma transaction (idempotent via providerPaymentId)

WITHDRAWAL FLOW:
  User → POST /api/payments/withdraw { amount, provider }
       → Creates PayoutRequest (PENDING_REVIEW)
       → Admin → POST /api/admin/payouts/:id/approve
       → PaymentService → factory.get(provider).executePayout()
       → Provider confirms → PayoutRequest → COMPLETED
```

## Payment Provider Interface

```typescript
interface PaymentProvider {
  name: string; // 'stripe' | 'paypal' | 'coinbase'

  createCheckout(params: {
    userId: string;
    amount: Decimal;
    currency: string;
    successUrl: string;
    cancelUrl: string;
    idempotencyKey: string;
  }): Promise<{ redirectUrl: string; providerSessionId: string }>;

  handleWebhook(params: {
    headers: Record<string, string>;
    rawBody: Buffer;
  }): Promise<WebhookResult>;

  executePayout(params: {
    payoutRequestId: string;
    amount: Decimal;
    currency: string;
    recipientExternalId: string; // provider-specific account ID
  }): Promise<PayoutResult>;

  verifyWebhookSignature(params: {
    headers: Record<string, string>;
    rawBody: Buffer;
  }): boolean;
}

interface WebhookResult {
  event: 'payment.completed' | 'payment.failed' | 'payout.completed' | 'payout.failed';
  providerPaymentId: string;
  amount: Decimal;
  currency: string;
  metadata: Record<string, string>; // must include userId, idempotencyKey
}

interface PayoutResult {
  success: boolean;
  providerPayoutId: string;
  error?: string;
}
```

## Database Changes

### New Models

```prisma
enum PaymentProviderType {
  STRIPE
  PAYPAL
  COINBASE
}

enum CheckoutStatus {
  PENDING
  COMPLETED
  FAILED
  EXPIRED
}

enum PayoutStatus {
  PENDING_REVIEW
  APPROVED
  PROCESSING
  COMPLETED
  FAILED
  REJECTED
}

model CheckoutSession {
  id                  String              @id @default(cuid())
  userId              String
  provider            PaymentProviderType
  providerSessionId   String              @unique
  amount              Decimal             @db.Decimal(12, 2)
  currency            String              @default("USD")
  status              CheckoutStatus      @default(PENDING)
  idempotencyKey      String              @unique
  successUrl          String
  cancelUrl           String
  providerPaymentId   String?             @unique
  completedAt         DateTime?
  expiresAt           DateTime
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt

  user                User                @relation(fields: [userId], references: [id])

  @@index([userId])
  @@index([providerSessionId])
  @@index([status])
}

model PayoutRequest {
  id                  String              @id @default(cuid())
  userId              String
  provider            PaymentProviderType
  amount              Decimal             @db.Decimal(12, 2)
  currency            String              @default("USD")
  status              PayoutStatus        @default(PENDING_REVIEW)
  recipientExternalId String?
  providerPayoutId    String?             @unique
  reviewedBy          String?
  reviewedAt          DateTime?
  reviewNote          String?
  failureReason       String?
  createdAt           DateTime            @default(now())
  updatedAt           DateTime            @updatedAt

  user                User                @relation(fields: [userId], references: [id])
  reviewer            User?               @relation("PayoutReviewer", fields: [reviewedBy], references: [id])

  @@index([userId])
  @@index([status])
}
```

### Model Changes

**User model** — add relations:
```prisma
checkoutSessions  CheckoutSession[]
payoutRequests    PayoutRequest[]
reviewedPayouts   PayoutRequest[]    @relation("PayoutReviewer")
```

**WalletTransaction model** — add field:
```prisma
providerPaymentId String?
@@index([providerPaymentId])
```

## API Routes

### Payment Routes (`/api/payments`)

**POST /api/payments/checkout** — Create a checkout session
- Auth: Required (PLAYER)
- Body: `{ provider: 'stripe' | 'paypal' | 'coinbase', amount: number }`
- Validates amount ($5 min, $10,000 max)
- Generates idempotency key: `checkout:${userId}:${timestamp}`
- Creates `CheckoutSession` record
- Calls `provider.createCheckout()`
- Returns: `{ redirectUrl: string, sessionId: string }`

**GET /api/payments/checkout/:sessionId/status** — Poll checkout status
- Auth: Required (owner only)
- Returns: `{ status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED' }`
- Frontend polls this after redirect back to know when wallet is credited

### Webhook Routes (`/api/webhooks`)

**POST /api/webhooks/stripe** — Stripe webhook
**POST /api/webhooks/paypal** — PayPal webhook  
**POST /api/webhooks/coinbase** — Coinbase webhook

All webhook routes:
- Auth: None (public, signature-verified)
- Must receive **raw body** (not JSON-parsed) for signature verification
- Idempotent: checks `providerPaymentId` uniqueness before crediting
- On `payment.completed`: credits wallet, updates CheckoutSession
- On `payout.completed`: updates PayoutRequest status
- Returns 200 immediately (process async if needed)

### Admin Payout Routes (`/api/admin/payouts`)

**GET /api/admin/payouts** — List payout requests
- Auth: ADMIN
- Query: `?status=PENDING_REVIEW&page=1&limit=20`
- Returns paginated payout requests with user details

**POST /api/admin/payouts/:id/approve** — Approve and execute payout
- Auth: ADMIN
- Validates user has sufficient balance
- Freezes balance during processing
- Calls `provider.executePayout()`
- On success: deducts balance, records transaction
- On failure: unfreezes balance, records failure

**POST /api/admin/payouts/:id/reject** — Reject payout request
- Auth: ADMIN
- Body: `{ reason: string }`
- Unfreezes balance if frozen, updates status

### Withdrawal Route (replaces existing)

**POST /api/payments/withdraw** — Request a withdrawal
- Auth: Required (PLAYER)
- Body: `{ amount: number, provider: 'stripe' | 'paypal' | 'coinbase' }`
- Validates sufficient balance
- Freezes the withdrawal amount (`frozenBalance += amount, balance -= amount`)
- Creates `PayoutRequest` with `PENDING_REVIEW` status
- Returns: `{ requestId: string, status: 'PENDING_REVIEW', message: string }`

## File Structure

```
apps/api/src/payments/
  payment.router.ts          — Express routes for /api/payments/*
  payment.service.ts         — Business logic orchestration
  webhook.router.ts          — Express routes for /api/webhooks/*
  providers/
    provider.interface.ts    — PaymentProvider interface + types
    provider.factory.ts      — Factory that resolves provider by name
    stripe.provider.ts       — Stripe implementation
    paypal.provider.ts       — PayPal implementation
    coinbase.provider.ts     — Coinbase Commerce implementation
apps/api/src/admin/
  payout.router.ts           — Admin payout review routes
apps/web/src/components/
  DepositModal.tsx           — Provider selection + amount input
  PaymentStatus.tsx          — Post-redirect status polling
  WithdrawModal.tsx          — Withdrawal request form
apps/web/src/app/
  payment/
    success/page.tsx         — Redirect landing: "Payment processing..."
    cancel/page.tsx          — Redirect landing: "Payment cancelled"
```

## Provider-Specific Details

### Stripe
- SDK: `stripe` npm package
- Checkout: `stripe.checkout.sessions.create()` with `mode: 'payment'`
- Webhook: `stripe.webhooks.constructEvent()` for signature verification
- Payout: `stripe.transfers.create()` (requires connected account) or `stripe.payouts.create()`
- Env vars: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY`

### PayPal
- SDK: `@paypal/checkout-server-sdk`
- Checkout: Create order → return approval URL
- Webhook: Verify via PayPal webhook signature verification API
- Payout: PayPal Payouts API (`/v1/payments/payouts`)
- Env vars: `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_MODE` (sandbox/live)

### Coinbase Commerce
- SDK: `coinbase-commerce-node`
- Checkout: Create charge → return hosted checkout URL
- Webhook: HMAC-SHA256 signature verification using shared secret
- Payout: Coinbase Commerce does not support automated payouts via API. When an admin approves a crypto payout, the `executePayout()` method returns a `{ success: true, providerPayoutId: 'manual' }` stub and sets status to `PROCESSING`. The admin then manually sends crypto from the Coinbase dashboard and clicks "Mark Completed" in the admin UI to finalize.
- Env vars: `COINBASE_COMMERCE_API_KEY`, `COINBASE_COMMERCE_WEBHOOK_SECRET`

## Webhook Security

1. **Raw body parsing**: Webhook routes must use `express.raw()` middleware, not `express.json()`, because signature verification requires the unmodified request body.
2. **Signature verification**: Each provider verifies its own way (Stripe: `stripe-signature` header, PayPal: API call, Coinbase: `X-CC-Webhook-Signature` HMAC).
3. **Idempotency**: Before crediting a wallet, check if a `WalletTransaction` with the same `providerPaymentId` already exists. Skip if found.
4. **Replay protection**: Stripe and Coinbase include timestamps in signatures. PayPal uses webhook ID verification. All three prevent replay attacks natively.

## Deposit Flow (Detailed)

1. User clicks "Deposit" → selects provider and amount in `DepositModal`
2. Frontend `POST /api/payments/checkout { provider: 'stripe', amount: 50 }`
3. API creates `CheckoutSession` (PENDING), calls `stripe.createCheckout()`
4. API returns `{ redirectUrl: 'https://checkout.stripe.com/...' }`
5. Frontend redirects user to Stripe
6. User pays → Stripe redirects to `/payment/success?session_id=xxx`
7. Success page polls `GET /api/payments/checkout/:sessionId/status`
8. Meanwhile, Stripe fires webhook → `POST /api/webhooks/stripe`
9. Webhook handler verifies signature, extracts payment details
10. Handler credits wallet in Prisma transaction (Serializable isolation):
    - Finds `CheckoutSession` by `providerSessionId`
    - Checks idempotency (no existing transaction with this `providerPaymentId`)
    - Updates wallet balance
    - Creates `WalletTransaction` with type `DEPOSIT`
    - Updates `CheckoutSession` to `COMPLETED`
11. Next poll from success page sees `COMPLETED` → frontend refreshes wallet

## Withdrawal Flow (Detailed)

1. User clicks "Withdraw" → selects provider and amount in `WithdrawModal`
2. Frontend `POST /api/payments/withdraw { provider: 'paypal', amount: 100 }`
3. API validates balance, freezes amount, creates `PayoutRequest` (PENDING_REVIEW)
4. Admin sees pending payout in admin dashboard
5. Admin clicks "Approve" → `POST /api/admin/payouts/:id/approve`
6. API calls `paypal.executePayout()` → PayPal sends money
7. On success: unfreezes amount, deducts from balance, creates `WalletTransaction` (WITHDRAWAL)
8. On failure: unfreezes amount back to available balance, records failure reason

## Error Handling

| Scenario | Handling |
|----------|----------|
| Webhook arrives before checkout session exists | Return 200, log warning, rely on retry |
| Duplicate webhook (same providerPaymentId) | Skip silently, return 200 |
| Checkout session expires (30 min) | Background job marks PENDING sessions as EXPIRED |
| Payout fails after approval | Unfreeze balance, set status FAILED with reason |
| Provider API down during checkout creation | Return 503, user retries |
| Webhook signature invalid | Return 400, do not process |
| Amount mismatch between checkout and webhook | Log alert, do not credit, mark FAILED |

## Environment Variables (New)

```env
# Stripe
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# PayPal
PAYPAL_CLIENT_ID=...
PAYPAL_CLIENT_SECRET=...
PAYPAL_WEBHOOK_ID=...
PAYPAL_MODE=sandbox

# Coinbase Commerce
COINBASE_COMMERCE_API_KEY=...
COINBASE_COMMERCE_WEBHOOK_SECRET=...

# General
PAYMENT_SUCCESS_URL=http://localhost:3000/payment/success
PAYMENT_CANCEL_URL=http://localhost:3000/payment/cancel
```

These should be validated in `common/env.ts` but as **optional** — the platform should boot even if not all providers are configured. Provider availability is checked at runtime when a user selects one.

## Testing Strategy

- **Unit tests**: Each provider implementation with mocked SDK calls
- **Integration tests**: Webhook handler with sample payloads (Stripe provides test webhook payloads)
- **Idempotency tests**: Send same webhook twice, verify wallet credited once
- **Signature tests**: Verify invalid signatures are rejected
- **Balance tests**: Verify freeze/unfreeze arithmetic on withdrawal approval/rejection/failure

## Security Considerations

- Never log full webhook payloads (may contain PII)
- Store provider API keys in env vars only, never in database
- Webhook endpoints must be exempt from CORS (providers call them directly)
- Rate limit checkout creation (prevent abuse: max 10 pending sessions per user)
- Amount validation: min $5, max $10,000 per deposit; max $10,000 per withdrawal
- Webhook endpoints must be exempt from JSON body parsing middleware (need raw body)

## Out of Scope

- Payment method storage/tokenization (users re-enter each time via redirect)
- Subscription/recurring payments
- Multi-currency conversion (all amounts in USD for now)
- Automated payouts without admin review
- Refund initiation from admin UI (handled directly in provider dashboard)
