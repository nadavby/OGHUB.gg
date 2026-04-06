# Payment System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a unified payment system with Stripe (credit cards) and NOWPayments (crypto) for deposits and withdrawals, including limits, KYC tiers, anti-fraud rules, and admin payout review.

**Architecture:** A provider-agnostic `PaymentService` layer sits between API endpoints and payment processors. Each provider implements a shared interface. `LimitsService` enforces per-tier deposit/withdrawal limits and anti-fraud rules. Frontend uses redirect-based checkout (Stripe Checkout / NOWPayments invoice) and polls for confirmation.

**Tech Stack:** Express.js, Prisma (PostgreSQL), Stripe SDK, NOWPayments REST API, Next.js 14, Framer Motion, Zod

**Design Spec:** `docs/superpowers/specs/2026-04-06-payment-system-design.md`

---

### Task 1: Install Dependencies & Add KYC Tier to Schema

**Files:**
- Modify: `apps/api/package.json`
- Modify: `apps/web/package.json`
- Modify: `packages/db/prisma/schema.prisma`
- Create: `packages/db/prisma/migrations/<timestamp>_add_kyc_tier/migration.sql`

- [ ] **Step 1: Install Stripe SDK in API**

```bash
cd apps/api && npm install stripe
```

- [ ] **Step 2: Install Stripe.js in web**

```bash
cd apps/web && npm install @stripe/stripe-js
```

- [ ] **Step 3: Add KycTier enum and field to User model in schema.prisma**

In `packages/db/prisma/schema.prisma`, add after the `UserRole` enum (around line 16):

```prisma
enum KycTier {
  UNVERIFIED
  BASIC
  FULL
}
```

In the `User` model, add after the `role` field:

```prisma
  kycTier       KycTier   @default(UNVERIFIED)
```

- [ ] **Step 4: Generate migration and push**

```bash
npx prisma db push --schema packages/db/prisma/schema.prisma
npx prisma generate --schema packages/db/prisma/schema.prisma
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/package.json apps/api/package-lock.json apps/web/package.json apps/web/package-lock.json packages/db/prisma/schema.prisma
git commit -m "chore: install Stripe SDK, add KycTier enum to User model"
```

---

### Task 2: Provider Interface & Stripe Provider

**Files:**
- Create: `apps/api/src/payments/providers/provider.interface.ts`
- Create: `apps/api/src/payments/providers/stripe.provider.ts`

- [ ] **Step 1: Create provider interface**

Create `apps/api/src/payments/providers/provider.interface.ts`:

```typescript
export interface CheckoutResult {
  sessionId: string;
  redirectUrl: string;
}

export interface WebhookResult {
  sessionId: string;
  status: 'completed' | 'failed' | 'expired';
  providerPaymentId: string;
  amount: number;
}

export interface PayoutResult {
  providerPayoutId: string;
  status: 'pending' | 'completed' | 'failed';
}

export type RecipientDetails =
  | { type: 'card_refund' }
  | { type: 'bank'; holderName: string; routingNumber: string; accountNumber: string }
  | { type: 'crypto'; address: string; network: 'ERC20' | 'TRC20' | 'SOL' | 'BTC' };

export interface PaymentProvider {
  readonly name: string;
  createCheckout(userId: string, amount: number, currency: string, metadata?: Record<string, string>): Promise<CheckoutResult>;
  verifyWebhook(headers: Record<string, string>, body: Buffer | string): Promise<WebhookResult>;
  createPayout(amount: number, recipient: RecipientDetails): Promise<PayoutResult>;
}
```

- [ ] **Step 2: Create Stripe provider**

Create `apps/api/src/payments/providers/stripe.provider.ts`:

```typescript
import Stripe from 'stripe';
import { PaymentProvider, CheckoutResult, WebhookResult, PayoutResult, RecipientDetails } from './provider.interface';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2025-03-31.basil',
});

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET!;

export class StripeProvider implements PaymentProvider {
  readonly name = 'STRIPE';

  async createCheckout(userId: string, amount: number, currency: string, metadata?: Record<string, string>): Promise<CheckoutResult> {
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: currency.toLowerCase(),
          unit_amount: Math.round(amount * 100), // Stripe uses cents
          product_data: { name: 'OGHUB Wallet Deposit' },
        },
        quantity: 1,
      }],
      metadata: {
        userId,
        type: 'deposit',
        ...metadata,
      },
      success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/wallet?checkout=success&session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/wallet?checkout=cancelled`,
      expires_after: 3600, // 1 hour
    });

    return {
      sessionId: session.id,
      redirectUrl: session.url!,
    };
  }

  async verifyWebhook(headers: Record<string, string>, body: Buffer | string): Promise<WebhookResult> {
    const sig = headers['stripe-signature'];
    const event = stripe.webhooks.constructEvent(body, sig, WEBHOOK_SECRET);

    if (event.type !== 'checkout.session.completed' && event.type !== 'checkout.session.expired') {
      throw new Error(`Unhandled event type: ${event.type}`);
    }

    const session = event.data.object as Stripe.Checkout.Session;

    let status: 'completed' | 'failed' | 'expired';
    if (event.type === 'checkout.session.completed' && session.payment_status === 'paid') {
      status = 'completed';
    } else if (event.type === 'checkout.session.expired') {
      status = 'expired';
    } else {
      status = 'failed';
    }

    return {
      sessionId: session.id,
      status,
      providerPaymentId: (session.payment_intent as string) || session.id,
      amount: (session.amount_total || 0) / 100,
    };
  }

  async createPayout(amount: number, recipient: RecipientDetails): Promise<PayoutResult> {
    // Phase 1: Card refunds are handled via Stripe refund API using the original payment intent
    // Bank payouts require Stripe Connect (future phase)
    // For now, mark as pending for manual processing
    return {
      providerPayoutId: `manual_stripe_${Date.now()}`,
      status: 'pending',
    };
  }
}

export const stripeProvider = new StripeProvider();
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/payments/providers/provider.interface.ts apps/api/src/payments/providers/stripe.provider.ts
git commit -m "feat(api): add payment provider interface and Stripe provider"
```

---

### Task 3: NOWPayments Provider

**Files:**
- Create: `apps/api/src/payments/providers/nowpay.provider.ts`

- [ ] **Step 1: Create NOWPayments provider**

Create `apps/api/src/payments/providers/nowpay.provider.ts`:

```typescript
import crypto from 'crypto';
import { PaymentProvider, CheckoutResult, WebhookResult, PayoutResult, RecipientDetails } from './provider.interface';

const API_BASE = 'https://api.nowpayments.io/v1';
const API_KEY = process.env.NOWPAYMENTS_API_KEY!;
const IPN_SECRET = process.env.NOWPAYMENTS_IPN_SECRET!;

async function nowpayFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'x-api-key': API_KEY,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`NOWPayments API error ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export class NowPayProvider implements PaymentProvider {
  readonly name = 'COINBASE'; // Maps to PaymentProviderType enum

  async createCheckout(userId: string, amount: number, currency: string, metadata?: Record<string, string>): Promise<CheckoutResult> {
    const invoice = await nowpayFetch<{
      id: string;
      invoice_url: string;
    }>('/invoice', {
      method: 'POST',
      body: JSON.stringify({
        price_amount: amount,
        price_currency: currency.toLowerCase(),
        order_id: `dep_${userId}_${Date.now()}`,
        order_description: 'OGHUB Wallet Deposit',
        ipn_callback_url: `${process.env.API_URL || 'http://localhost:3001'}/api/payments/webhooks/nowpayments`,
        success_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/wallet?checkout=success&session=np_${userId}_${Date.now()}`,
        cancel_url: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/wallet?checkout=cancelled`,
        is_fee_paid_by_user: false,
      }),
    });

    return {
      sessionId: String(invoice.id),
      redirectUrl: invoice.invoice_url,
    };
  }

  async verifyWebhook(headers: Record<string, string>, body: Buffer | string): Promise<WebhookResult> {
    const bodyStr = typeof body === 'string' ? body : body.toString('utf-8');
    const receivedHmac = headers['x-nowpayments-sig'];

    if (!receivedHmac) {
      throw new Error('Missing NOWPayments signature header');
    }

    // Sort keys and compute HMAC
    const sorted = JSON.stringify(
      Object.keys(JSON.parse(bodyStr)).sort().reduce((acc: Record<string, any>, key: string) => {
        acc[key] = JSON.parse(bodyStr)[key];
        return acc;
      }, {})
    );
    const expectedHmac = crypto.createHmac('sha512', IPN_SECRET).update(sorted).digest('hex');

    if (receivedHmac !== expectedHmac) {
      throw new Error('Invalid NOWPayments webhook signature');
    }

    const data = JSON.parse(bodyStr);

    let status: 'completed' | 'failed' | 'expired';
    if (data.payment_status === 'finished' || data.payment_status === 'confirmed') {
      status = 'completed';
    } else if (data.payment_status === 'expired') {
      status = 'expired';
    } else if (data.payment_status === 'failed' || data.payment_status === 'refunded') {
      status = 'failed';
    } else {
      // partially_paid, waiting, confirming — not terminal, ignore
      throw new Error(`Non-terminal status: ${data.payment_status}`);
    }

    return {
      sessionId: String(data.invoice_id || data.order_id),
      status,
      providerPaymentId: String(data.payment_id),
      amount: parseFloat(data.price_amount),
    };
  }

  async createPayout(amount: number, recipient: RecipientDetails): Promise<PayoutResult> {
    if (recipient.type !== 'crypto') {
      throw new Error('NOWPayments only supports crypto payouts');
    }

    const payout = await nowpayFetch<{
      id: string;
      status: string;
    }>('/payout', {
      method: 'POST',
      body: JSON.stringify({
        address: recipient.address,
        amount,
        currency: 'usdttrc20', // Default to USDT TRC-20 for low fees
        ipn_callback_url: `${process.env.API_URL || 'http://localhost:3001'}/api/payments/webhooks/nowpayments`,
      }),
    });

    return {
      providerPayoutId: String(payout.id),
      status: payout.status === 'FINISHED' ? 'completed' : 'pending',
    };
  }
}

export const nowpayProvider = new NowPayProvider();
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/payments/providers/nowpay.provider.ts
git commit -m "feat(api): add NOWPayments crypto provider"
```

---

### Task 4: Limits Service

**Files:**
- Create: `apps/api/src/payments/limits.service.ts`

- [ ] **Step 1: Create limits service**

Create `apps/api/src/payments/limits.service.ts`:

```typescript
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../main';
import { AppError } from '../common/error-handler';

interface LimitConfig {
  minDeposit: number;
  maxDepositPerDay: number;
  minWithdrawal: number;
  maxWithdrawalPerDay: number;
  maxMonthly: number;
}

const LIMITS_BY_PROVIDER: Record<string, LimitConfig> = {
  STRIPE: {
    minDeposit: parseFloat(process.env.DEPOSIT_MIN_CARD || '10'),
    maxDepositPerDay: 2000,
    minWithdrawal: parseFloat(process.env.WITHDRAWAL_MIN_CARD || '20'),
    maxWithdrawalPerDay: 5000,
    maxMonthly: 25000,
  },
  COINBASE: {
    minDeposit: parseFloat(process.env.DEPOSIT_MIN_CRYPTO || '5'),
    maxDepositPerDay: 10000,
    minWithdrawal: parseFloat(process.env.WITHDRAWAL_MIN_CRYPTO || '10'),
    maxWithdrawalPerDay: 10000,
    maxMonthly: 50000,
  },
};

// KYC tier overrides — lower tiers get stricter limits
const KYC_TIER_LIMITS: Record<string, { maxDepositPerDay: number; maxWithdrawalPerDay: number; cumulativeMax: number }> = {
  UNVERIFIED: { maxDepositPerDay: 500, maxWithdrawalPerDay: 200, cumulativeMax: 2000 },
  BASIC: { maxDepositPerDay: 2000, maxWithdrawalPerDay: 5000, cumulativeMax: Infinity },
  FULL: { maxDepositPerDay: Infinity, maxWithdrawalPerDay: Infinity, cumulativeMax: Infinity },
};

const KYC_THRESHOLD = parseFloat(process.env.KYC_THRESHOLD || '2000');

async function getDailyTotal(walletId: string, type: 'DEPOSIT' | 'WITHDRAWAL'): Promise<number> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await prisma.walletTransaction.aggregate({
    where: {
      walletId,
      type,
      createdAt: { gte: dayAgo },
    },
    _sum: { amount: true },
  });
  return Math.abs(parseFloat((result._sum.amount ?? new Decimal(0)).toString()));
}

async function getMonthlyTotal(walletId: string): Promise<number> {
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await prisma.walletTransaction.aggregate({
    where: {
      walletId,
      type: { in: ['DEPOSIT', 'WITHDRAWAL'] },
      createdAt: { gte: monthAgo },
    },
    _sum: { amount: true },
  });
  return Math.abs(parseFloat((result._sum.amount ?? new Decimal(0)).toString()));
}

async function getCumulativeTotal(walletId: string): Promise<number> {
  const result = await prisma.walletTransaction.aggregate({
    where: {
      walletId,
      type: { in: ['DEPOSIT', 'WITHDRAWAL'] },
    },
    _sum: { amount: true },
  });
  return Math.abs(parseFloat((result._sum.amount ?? new Decimal(0)).toString()));
}

export async function checkDepositAllowed(userId: string, amount: number, provider: string): Promise<void> {
  const limits = LIMITS_BY_PROVIDER[provider];
  if (!limits) throw new AppError(`Unsupported provider: ${provider}`, 400);

  if (amount < limits.minDeposit) {
    throw new AppError(`Minimum deposit is $${limits.minDeposit} for this payment method`, 400);
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { kycTier: true } });
  if (!user) throw new AppError('User not found', 404);

  const kycLimits = KYC_TIER_LIMITS[user.kycTier];
  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new AppError('Wallet not found', 404);

  // Daily limit (minimum of provider limit and KYC tier limit)
  const effectiveDailyLimit = Math.min(limits.maxDepositPerDay, kycLimits.maxDepositPerDay);
  const dailyTotal = await getDailyTotal(wallet.id, 'DEPOSIT');
  if (dailyTotal + amount > effectiveDailyLimit) {
    if (kycLimits.maxDepositPerDay < limits.maxDepositPerDay) {
      throw new AppError(`Daily deposit limit ($${kycLimits.maxDepositPerDay}) reached. Verify your identity to increase limits.`, 403, { requiresKyc: true, requiredTier: user.kycTier === 'UNVERIFIED' ? 'BASIC' : 'FULL' } as any);
    }
    throw new AppError(`Daily deposit limit ($${effectiveDailyLimit}) reached`, 403);
  }

  // Monthly limit
  const monthlyTotal = await getMonthlyTotal(wallet.id);
  if (monthlyTotal + amount > limits.maxMonthly) {
    throw new AppError(`Monthly transaction limit ($${limits.maxMonthly}) reached`, 403);
  }

  // Cumulative KYC threshold
  if (kycLimits.cumulativeMax < Infinity) {
    const cumulativeTotal = await getCumulativeTotal(wallet.id);
    if (cumulativeTotal + amount > kycLimits.cumulativeMax) {
      throw new AppError(`Cumulative limit ($${KYC_THRESHOLD}) reached. Verify your identity to continue.`, 403);
    }
  }
}

export async function checkWithdrawalAllowed(userId: string, amount: number, provider: string): Promise<void> {
  const limits = LIMITS_BY_PROVIDER[provider];
  if (!limits) throw new AppError(`Unsupported provider: ${provider}`, 400);

  if (amount < limits.minWithdrawal) {
    throw new AppError(`Minimum withdrawal is $${limits.minWithdrawal} for this payment method`, 400);
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { kycTier: true } });
  if (!user) throw new AppError('User not found', 404);

  const kycLimits = KYC_TIER_LIMITS[user.kycTier];

  // Single withdrawal > $1000 requires FULL KYC
  if (amount > 1000 && user.kycTier !== 'FULL') {
    throw new AppError('Withdrawals over $1,000 require full identity verification.', 403);
  }

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new AppError('Wallet not found', 404);

  // Check available balance (balance - frozenBalance)
  const available = wallet.balance.sub(wallet.frozenBalance);
  if (available.lt(new Decimal(amount))) {
    throw new AppError('Insufficient available balance', 402);
  }

  // Daily limit
  const effectiveDailyLimit = Math.min(limits.maxWithdrawalPerDay, kycLimits.maxWithdrawalPerDay);
  const dailyTotal = await getDailyTotal(wallet.id, 'WITHDRAWAL');
  if (dailyTotal + amount > effectiveDailyLimit) {
    if (kycLimits.maxWithdrawalPerDay < limits.maxWithdrawalPerDay) {
      throw new AppError(`Daily withdrawal limit ($${kycLimits.maxWithdrawalPerDay}) reached. Verify your identity to increase limits.`, 403);
    }
    throw new AppError(`Daily withdrawal limit ($${effectiveDailyLimit}) reached`, 403);
  }

  // Monthly limit
  const monthlyTotal = await getMonthlyTotal(wallet.id);
  if (monthlyTotal + amount > limits.maxMonthly) {
    throw new AppError(`Monthly transaction limit ($${limits.maxMonthly}) reached`, 403);
  }

  // Cumulative KYC check
  if (kycLimits.cumulativeMax < Infinity) {
    const cumulativeTotal = await getCumulativeTotal(wallet.id);
    if (cumulativeTotal + amount > kycLimits.cumulativeMax) {
      throw new AppError(`Cumulative limit ($${KYC_THRESHOLD}) reached. Verify your identity to continue.`, 403);
    }
  }

  // Anti-fraud: no pending payout for same provider
  const pendingPayout = await prisma.payoutRequest.findFirst({
    where: {
      userId,
      provider: provider as any,
      status: { in: ['PENDING_REVIEW', 'APPROVED', 'PROCESSING'] },
    },
  });
  if (pendingPayout) {
    throw new AppError('You already have a pending withdrawal. Please wait for it to complete.', 409);
  }
}

export async function checkCrossMethodFraud(userId: string, withdrawProvider: string): Promise<{ requiresReview: boolean; reason?: string }> {
  if (withdrawProvider === 'STRIPE') return { requiresReview: false };

  // Check if user deposited via card in last 7 days
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentCardDeposit = await prisma.checkoutSession.findFirst({
    where: {
      userId,
      provider: 'STRIPE',
      status: 'COMPLETED',
      completedAt: { gte: sevenDaysAgo },
    },
  });

  if (recentCardDeposit) {
    return {
      requiresReview: true,
      reason: 'Cross-method withdrawal: card deposit within 7 days, requesting crypto payout',
    };
  }

  return { requiresReview: false };
}

export async function checkInstantCashout(userId: string): Promise<boolean> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recentDeposit = await prisma.checkoutSession.findFirst({
    where: {
      userId,
      status: 'COMPLETED',
      completedAt: { gte: fiveMinAgo },
    },
  });
  return !!recentDeposit;
}

export function getAutoApproveThreshold(provider: string): number {
  return provider === 'STRIPE' ? 200 : 500;
}

export const WITHDRAWAL_FEE: Record<string, number> = {
  STRIPE: 0.50,
  COINBASE: 0,
};
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/payments/limits.service.ts
git commit -m "feat(api): add limits service with KYC tiers, daily/monthly caps, anti-fraud"
```

---

### Task 5: Payout Service

**Files:**
- Create: `apps/api/src/payments/payout.service.ts`

- [ ] **Step 1: Create payout service**

Create `apps/api/src/payments/payout.service.ts`:

```typescript
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../main';
import { AppError } from '../common/error-handler';
import { stripeProvider } from './providers/stripe.provider';
import { nowpayProvider } from './providers/nowpay.provider';
import { PaymentProvider, RecipientDetails } from './providers/provider.interface';
import { getAutoApproveThreshold, checkCrossMethodFraud, checkInstantCashout, WITHDRAWAL_FEE } from './limits.service';

function getProvider(providerType: string): PaymentProvider {
  switch (providerType) {
    case 'STRIPE': return stripeProvider;
    case 'COINBASE': return nowpayProvider;
    default: throw new AppError(`Unsupported provider: ${providerType}`, 400);
  }
}

export async function createPayoutRequest(
  userId: string,
  amount: number,
  provider: string,
  recipient: RecipientDetails,
): Promise<{ payoutId: string; status: string; estimatedTime: string }> {
  // Apply withdrawal fee
  const fee = WITHDRAWAL_FEE[provider] || 0;
  const netAmount = amount - fee;
  if (netAmount <= 0) throw new AppError('Amount too small after fees', 400);

  // Anti-fraud: instant cashout check
  const isInstantCashout = await checkInstantCashout(userId);
  if (isInstantCashout) {
    throw new AppError('Withdrawals are not available within 5 minutes of a deposit. Please try again later.', 403);
  }

  // Freeze funds in wallet
  const payoutRequest = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new AppError('Wallet not found', 404);

    const available = wallet.balance.sub(wallet.frozenBalance);
    const amountDecimal = new Decimal(amount);
    if (available.lt(amountDecimal)) {
      throw new AppError('Insufficient available balance', 402);
    }

    // Freeze: deduct from balance, add to frozenBalance
    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: wallet.balance.sub(amountDecimal),
        frozenBalance: wallet.frozenBalance.add(amountDecimal),
      },
    });

    // Create withdrawal transaction
    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'WITHDRAWAL',
        amount: amountDecimal.neg(),
        balanceBefore: wallet.balance,
        balanceAfter: wallet.balance.sub(amountDecimal),
        description: `Withdrawal via ${provider === 'COINBASE' ? 'crypto' : 'card'} (pending)`,
      },
    });

    // Create payout request
    const payout = await tx.payoutRequest.create({
      data: {
        userId,
        provider: provider as any,
        amount: new Decimal(netAmount),
        recipientExternalId: recipient.type === 'crypto' ? recipient.address : undefined,
        status: 'PENDING_REVIEW',
      },
    });

    return payout;
  }, { isolationLevel: 'Serializable' });

  // Check auto-approve eligibility
  const threshold = getAutoApproveThreshold(provider);
  const crossMethodCheck = await checkCrossMethodFraud(userId, provider);

  if (amount <= threshold && !crossMethodCheck.requiresReview) {
    // Auto-approve and process
    await processApprovedPayout(payoutRequest.id, recipient);
    return { payoutId: payoutRequest.id, status: 'PROCESSING', estimatedTime: '1-24 hours' };
  }

  return { payoutId: payoutRequest.id, status: 'PENDING_REVIEW', estimatedTime: '24-48 hours' };
}

export async function processApprovedPayout(payoutId: string, recipient?: RecipientDetails): Promise<void> {
  const payout = await prisma.payoutRequest.findUnique({ where: { id: payoutId } });
  if (!payout) throw new AppError('Payout not found', 404);
  if (payout.status !== 'PENDING_REVIEW' && payout.status !== 'APPROVED') {
    throw new AppError(`Cannot process payout in status: ${payout.status}`, 400);
  }

  const provider = getProvider(payout.provider);
  const recipientDetails: RecipientDetails = recipient || (
    payout.recipientExternalId
      ? { type: 'crypto', address: payout.recipientExternalId, network: 'TRC20' as const }
      : { type: 'card_refund' as const }
  );

  try {
    await prisma.payoutRequest.update({
      where: { id: payoutId },
      data: { status: 'PROCESSING' },
    });

    const result = await provider.createPayout(
      parseFloat(payout.amount.toString()),
      recipientDetails,
    );

    await prisma.payoutRequest.update({
      where: { id: payoutId },
      data: {
        providerPayoutId: result.providerPayoutId,
        status: result.status === 'completed' ? 'COMPLETED' : 'PROCESSING',
      },
    });

    // If completed immediately, unfreeze
    if (result.status === 'completed') {
      await unfreezePayoutFunds(payout.userId, parseFloat(payout.amount.toString()));
    }
  } catch (err: any) {
    // Failed — refund to wallet
    await refundFailedPayout(payoutId, err.message || 'Provider payout failed');
  }
}

export async function refundFailedPayout(payoutId: string, reason: string): Promise<void> {
  const payout = await prisma.payoutRequest.findUnique({ where: { id: payoutId } });
  if (!payout) return;

  await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { userId: payout.userId } });
    if (!wallet) return;

    const refundAmount = new Decimal(payout.amount);

    // Unfreeze and refund
    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: wallet.balance.add(refundAmount),
        frozenBalance: wallet.frozenBalance.sub(refundAmount),
      },
    });

    await tx.walletTransaction.create({
      data: {
        walletId: wallet.id,
        type: 'REFUND',
        amount: refundAmount,
        balanceBefore: wallet.balance,
        balanceAfter: wallet.balance.add(refundAmount),
        description: `Withdrawal refund: ${reason}`,
        referenceId: payoutId,
      },
    });

    await tx.payoutRequest.update({
      where: { id: payoutId },
      data: { status: 'FAILED', failureReason: reason },
    });
  }, { isolationLevel: 'Serializable' });
}

async function unfreezePayoutFunds(userId: string, amount: number): Promise<void> {
  await prisma.wallet.update({
    where: { userId },
    data: {
      frozenBalance: { decrement: amount },
    },
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/payments/payout.service.ts
git commit -m "feat(api): add payout service with auto-approve, freeze/refund logic"
```

---

### Task 6: Payment Service & Router

**Files:**
- Create: `apps/api/src/payments/payment.service.ts`
- Create: `apps/api/src/payments/payment.router.ts`
- Modify: `apps/api/src/main.ts`

- [ ] **Step 1: Create payment service (orchestrator)**

Create `apps/api/src/payments/payment.service.ts`:

```typescript
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../main';
import { AppError } from '../common/error-handler';
import { stripeProvider } from './providers/stripe.provider';
import { nowpayProvider } from './providers/nowpay.provider';
import { PaymentProvider } from './providers/provider.interface';

function getProvider(providerType: string): PaymentProvider {
  switch (providerType) {
    case 'STRIPE': return stripeProvider;
    case 'COINBASE': return nowpayProvider;
    default: throw new AppError(`Unsupported provider: ${providerType}`, 400);
  }
}

export async function createCheckoutSession(
  userId: string,
  amount: number,
  provider: string,
  currency: string = 'USD',
): Promise<{ sessionId: string; redirectUrl: string }> {
  const paymentProvider = getProvider(provider);
  const idempotencyKey = `dep_${userId}_${Date.now()}`;

  // Create provider checkout
  const result = await paymentProvider.createCheckout(userId, amount, currency);

  // Store in DB
  await prisma.checkoutSession.create({
    data: {
      userId,
      provider: provider as any,
      providerSessionId: result.sessionId,
      amount: new Decimal(amount),
      currency,
      status: 'PENDING',
      idempotencyKey,
      successUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/wallet?checkout=success&session=${result.sessionId}`,
      cancelUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/wallet?checkout=cancelled`,
      expiresAt: new Date(Date.now() + 3600_000), // 1 hour
    },
  });

  return { sessionId: result.sessionId, redirectUrl: result.redirectUrl };
}

export async function handleWebhookEvent(
  provider: string,
  headers: Record<string, string>,
  body: Buffer | string,
): Promise<void> {
  const paymentProvider = getProvider(provider);
  const event = await paymentProvider.verifyWebhook(headers, body);

  // Find the checkout session
  const session = await prisma.checkoutSession.findUnique({
    where: { providerSessionId: event.sessionId },
  });

  if (!session) {
    throw new AppError(`Checkout session not found: ${event.sessionId}`, 404);
  }

  // Idempotency: skip if already processed
  if (session.status === 'COMPLETED') return;

  if (event.status === 'completed') {
    // Credit wallet in a transaction
    await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({ where: { userId: session.userId } });
      if (!wallet) throw new AppError('Wallet not found', 404);

      const depositAmount = new Decimal(event.amount);
      const newBalance = wallet.balance.add(depositAmount);

      await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'DEPOSIT',
          amount: depositAmount,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          description: `Deposit via ${provider === 'STRIPE' ? 'card' : 'crypto'}`,
          providerPaymentId: event.providerPaymentId,
        },
      });

      await tx.checkoutSession.update({
        where: { id: session.id },
        data: {
          status: 'COMPLETED',
          providerPaymentId: event.providerPaymentId,
          completedAt: new Date(),
        },
      });
    }, { isolationLevel: 'Serializable' });
  } else if (event.status === 'failed') {
    await prisma.checkoutSession.update({
      where: { id: session.id },
      data: { status: 'FAILED' },
    });
  } else if (event.status === 'expired') {
    await prisma.checkoutSession.update({
      where: { id: session.id },
      data: { status: 'EXPIRED' },
    });
  }
}

export async function getCheckoutStatus(sessionId: string, userId: string): Promise<{ status: string; amount?: string }> {
  const session = await prisma.checkoutSession.findFirst({
    where: {
      providerSessionId: sessionId,
      userId,
    },
  });

  if (!session) throw new AppError('Checkout session not found', 404);

  return {
    status: session.status,
    amount: session.status === 'COMPLETED' ? session.amount.toString() : undefined,
  };
}
```

- [ ] **Step 2: Create payment router**

Create `apps/api/src/payments/payment.router.ts`:

```typescript
import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { authGuard, AuthenticatedRequest, roleGuard } from '../common/auth';
import { AppError } from '../common/error-handler';
import { validate } from '../common/schemas';
import { createCheckoutSession, handleWebhookEvent, getCheckoutStatus } from './payment.service';
import { checkDepositAllowed, checkWithdrawalAllowed } from './limits.service';
import { createPayoutRequest, processApprovedPayout, refundFailedPayout } from './payout.service';
import { RecipientDetails } from './providers/provider.interface';
import { prisma } from '../main';

export const paymentRouter = Router();

// ─── Rate Limiters ─────────────────────────────────────────

const checkoutLimiter = rateLimit({ windowMs: 60_000, max: 5, message: { success: false, error: 'Too many checkout attempts. Try again in a minute.' } });
const payoutLimiter = rateLimit({ windowMs: 60_000, max: 3, message: { success: false, error: 'Too many withdrawal attempts. Try again in a minute.' } });
const statusLimiter = rateLimit({ windowMs: 60_000, max: 30, message: { success: false, error: 'Too many status checks.' } });

// ─── Schemas ───────────────────────────────────────────────

const checkoutSchema = z.object({
  amount: z.number().positive().max(100000),
  provider: z.enum(['STRIPE', 'COINBASE']),
  currency: z.string().default('USD'),
});

const payoutSchema = z.object({
  amount: z.number().positive().max(50000),
  provider: z.enum(['STRIPE', 'COINBASE']),
  recipient: z.discriminatedUnion('type', [
    z.object({ type: z.literal('card_refund') }),
    z.object({
      type: z.literal('bank'),
      holderName: z.string().min(1),
      routingNumber: z.string().min(1),
      accountNumber: z.string().min(1),
    }),
    z.object({
      type: z.literal('crypto'),
      address: z.string().min(10).max(128),
      network: z.enum(['ERC20', 'TRC20', 'SOL', 'BTC']),
    }),
  ]),
});

// ─── Checkout (Deposit) ────────────────────────────────────

paymentRouter.post('/checkout', authGuard, checkoutLimiter, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { amount, provider, currency } = validate(checkoutSchema, req.body);

    await checkDepositAllowed(req.user!.userId, amount, provider);

    const result = await createCheckoutSession(req.user!.userId, amount, provider, currency);

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// ─── Checkout Status ───────────────────────────────────────

paymentRouter.get('/checkout/:sessionId/status', authGuard, statusLimiter, async (req: AuthenticatedRequest, res, next) => {
  try {
    const result = await getCheckoutStatus(req.params.sessionId, req.user!.userId);
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// ─── Webhooks (no auth — verified by signature) ───────────

paymentRouter.post('/webhooks/stripe', async (req, res, next) => {
  try {
    await handleWebhookEvent('STRIPE', req.headers as any, req.body);
    res.json({ received: true });
  } catch (err: any) {
    // Log but return 200 to prevent Stripe retries on non-retryable errors
    console.error('Stripe webhook error:', err.message);
    res.status(200).json({ received: true, error: err.message });
  }
});

paymentRouter.post('/webhooks/nowpayments', async (req, res, next) => {
  try {
    await handleWebhookEvent('COINBASE', req.headers as any, JSON.stringify(req.body));
    res.json({ received: true });
  } catch (err: any) {
    console.error('NOWPayments webhook error:', err.message);
    res.status(200).json({ received: true, error: err.message });
  }
});

// ─── Payout (Withdrawal) ──────────────────────────────────

paymentRouter.post('/payout', authGuard, payoutLimiter, async (req: AuthenticatedRequest, res, next) => {
  try {
    const { amount, provider, recipient } = validate(payoutSchema, req.body);

    await checkWithdrawalAllowed(req.user!.userId, amount, provider);

    const result = await createPayoutRequest(
      req.user!.userId,
      amount,
      provider,
      recipient as RecipientDetails,
    );

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
});

// ─── User's Payout History ─────────────────────────────────

paymentRouter.get('/payouts', authGuard, async (req: AuthenticatedRequest, res, next) => {
  try {
    const payouts = await prisma.payoutRequest.findMany({
      where: { userId: req.user!.userId },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    res.json({
      success: true,
      data: payouts.map(p => ({
        id: p.id,
        provider: p.provider,
        amount: p.amount.toString(),
        status: p.status,
        recipientExternalId: p.recipientExternalId,
        createdAt: p.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

// ─── Admin: Review Payouts ─────────────────────────────────

paymentRouter.get('/admin/payouts', authGuard, roleGuard('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const status = req.query.status as string || 'PENDING_REVIEW';
    const payouts = await prisma.payoutRequest.findMany({
      where: { status: status as any },
      include: { user: { select: { id: true, username: true, email: true } } },
      orderBy: { createdAt: 'asc' },
      take: 50,
    });

    res.json({
      success: true,
      data: payouts.map(p => ({
        id: p.id,
        user: p.user,
        provider: p.provider,
        amount: p.amount.toString(),
        status: p.status,
        recipientExternalId: p.recipientExternalId,
        createdAt: p.createdAt.toISOString(),
      })),
    });
  } catch (err) {
    next(err);
  }
});

paymentRouter.post('/admin/payouts/:id/approve', authGuard, roleGuard('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const payout = await prisma.payoutRequest.findUnique({ where: { id: req.params.id } });
    if (!payout) throw new AppError('Payout not found', 404);
    if (payout.status !== 'PENDING_REVIEW') throw new AppError(`Cannot approve payout in status: ${payout.status}`, 400);

    await prisma.payoutRequest.update({
      where: { id: req.params.id },
      data: { status: 'APPROVED', reviewedBy: req.user!.userId, reviewedAt: new Date() },
    });

    // Process the approved payout
    await processApprovedPayout(req.params.id);

    res.json({ success: true, data: { message: 'Payout approved and processing' } });
  } catch (err) {
    next(err);
  }
});

paymentRouter.post('/admin/payouts/:id/reject', authGuard, roleGuard('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { reason } = req.body || {};
    const payout = await prisma.payoutRequest.findUnique({ where: { id: req.params.id } });
    if (!payout) throw new AppError('Payout not found', 404);
    if (payout.status !== 'PENDING_REVIEW') throw new AppError(`Cannot reject payout in status: ${payout.status}`, 400);

    await prisma.payoutRequest.update({
      where: { id: req.params.id },
      data: { status: 'REJECTED', reviewedBy: req.user!.userId, reviewedAt: new Date(), reviewNote: reason || 'Rejected by admin' },
    });

    // Refund to wallet
    await refundFailedPayout(req.params.id, reason || 'Rejected by admin');

    res.json({ success: true, data: { message: 'Payout rejected, funds refunded' } });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 3: Register payment router in main.ts**

In `apps/api/src/main.ts`, add the import:

```typescript
import { paymentRouter } from './payments/payment.router';
```

Add the route after the existing routes (after `app.use('/api/challenges', challengesRouter);`):

```typescript
app.use('/api/payments', paymentRouter);
```

**Important:** The Stripe webhook needs raw body (not JSON-parsed). Add this BEFORE the `express.json()` middleware:

```typescript
// Stripe webhooks need raw body for signature verification
app.use('/api/payments/webhooks/stripe', express.raw({ type: 'application/json' }));
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/payments/payment.service.ts apps/api/src/payments/payment.router.ts apps/api/src/main.ts
git commit -m "feat(api): add payment router with checkout, webhooks, payouts, and admin review"
```

---

### Task 7: Update Existing Wallet Router

**Files:**
- Modify: `apps/api/src/wallet/wallet.router.ts`

- [ ] **Step 1: Update withdraw endpoint to use frozenBalance**

In `apps/api/src/wallet/wallet.router.ts`, replace the existing withdraw handler (lines 126-163) with a simplified version that redirects to the payment system:

```typescript
// ─── Withdraw (legacy — redirects to payment system) ──────

walletRouter.post('/withdraw', async (req: AuthenticatedRequest, res, next) => {
  try {
    res.status(410).json({
      success: false,
      error: 'Direct withdrawals are no longer supported. Please use POST /api/payments/payout instead.',
    });
  } catch (err) {
    next(err);
  }
});
```

Also update the deposit endpoint to return a deprecation notice:

```typescript
// ─── Deposit (legacy — kept for dev/testing only) ──────────

walletRouter.post('/deposit', async (req: AuthenticatedRequest, res, next) => {
  try {
    // In production, deposits go through /api/payments/checkout
    // This endpoint is kept for development/testing only
    if (process.env.NODE_ENV === 'production') {
      return res.status(410).json({
        success: false,
        error: 'Direct deposits are no longer supported. Please use POST /api/payments/checkout instead.',
      });
    }

    const { amount } = validate(depositSchema, req.body);
    const depositAmount = new Decimal(amount);

    const result = await prisma.$transaction(async (tx) => {
      const wallet = await tx.wallet.findUnique({
        where: { userId: req.user!.userId },
      });

      if (!wallet) throw new AppError('Wallet not found', 404);

      const newBalance = wallet.balance.add(depositAmount);

      const updated = await tx.wallet.update({
        where: { id: wallet.id },
        data: { balance: newBalance },
      });

      await tx.walletTransaction.create({
        data: {
          walletId: wallet.id,
          type: 'DEPOSIT',
          amount: depositAmount,
          balanceBefore: wallet.balance,
          balanceAfter: newBalance,
          description: 'Wallet deposit (dev)',
        },
      });

      return updated;
    }, { isolationLevel: 'Serializable' });

    res.json({
      success: true,
      data: {
        balance: result.balance.toString(),
        frozenBalance: result.frozenBalance.toString(),
        currency: result.currency,
      },
    });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add apps/api/src/wallet/wallet.router.ts
git commit -m "refactor(api): deprecate direct deposit/withdraw in favor of payment system"
```

---

### Task 8: Frontend — usePayments Hook

**Files:**
- Create: `apps/web/src/hooks/usePayments.ts`

- [ ] **Step 1: Create payments hook**

Create `apps/web/src/hooks/usePayments.ts`:

```typescript
'use client';

import { useCallback } from 'react';
import { api, getStoredToken } from '@/lib/api';

export interface CheckoutResult {
  sessionId: string;
  redirectUrl: string;
}

export interface CheckoutStatus {
  status: 'PENDING' | 'COMPLETED' | 'FAILED' | 'EXPIRED';
  amount?: string;
}

export interface PayoutResult {
  payoutId: string;
  status: string;
  estimatedTime: string;
}

export interface PayoutItem {
  id: string;
  provider: string;
  amount: string;
  status: string;
  recipientExternalId: string | null;
  createdAt: string;
}

export type RecipientDetails =
  | { type: 'card_refund' }
  | { type: 'bank'; holderName: string; routingNumber: string; accountNumber: string }
  | { type: 'crypto'; address: string; network: 'ERC20' | 'TRC20' | 'SOL' | 'BTC' };

export function usePayments() {
  const createCheckout = useCallback(async (
    amount: number,
    provider: 'STRIPE' | 'COINBASE',
  ): Promise<CheckoutResult> => {
    const token = getStoredToken();
    if (!token) throw new Error('Not authenticated');
    return api<CheckoutResult>('/api/payments/checkout', {
      method: 'POST',
      body: { amount, provider },
      token,
    });
  }, []);

  const getCheckoutStatus = useCallback(async (sessionId: string): Promise<CheckoutStatus> => {
    const token = getStoredToken();
    if (!token) throw new Error('Not authenticated');
    return api<CheckoutStatus>(`/api/payments/checkout/${sessionId}/status`, { token });
  }, []);

  const createPayout = useCallback(async (
    amount: number,
    provider: 'STRIPE' | 'COINBASE',
    recipient: RecipientDetails,
  ): Promise<PayoutResult> => {
    const token = getStoredToken();
    if (!token) throw new Error('Not authenticated');
    return api<PayoutResult>('/api/payments/payout', {
      method: 'POST',
      body: { amount, provider, recipient },
      token,
    });
  }, []);

  const getPayouts = useCallback(async (): Promise<PayoutItem[]> => {
    const token = getStoredToken();
    if (!token) throw new Error('Not authenticated');
    return api<PayoutItem[]>('/api/payments/payouts', { token });
  }, []);

  const pollCheckoutStatus = useCallback(async (
    sessionId: string,
    onComplete: (status: CheckoutStatus) => void,
    maxAttempts = 30,
  ): Promise<void> => {
    let attempts = 0;
    const poll = async () => {
      if (attempts >= maxAttempts) {
        onComplete({ status: 'EXPIRED' });
        return;
      }
      attempts++;
      try {
        const status = await getCheckoutStatus(sessionId);
        if (status.status !== 'PENDING') {
          onComplete(status);
          return;
        }
      } catch {
        // ignore polling errors
      }
      setTimeout(poll, 2000);
    };
    poll();
  }, [getCheckoutStatus]);

  return { createCheckout, getCheckoutStatus, pollCheckoutStatus, createPayout, getPayouts };
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/hooks/usePayments.ts
git commit -m "feat(web): add usePayments hook for checkout, payouts, and status polling"
```

---

### Task 9: Frontend — DepositModal

**Files:**
- Create: `apps/web/src/components/DepositModal.tsx`
- Modify: `apps/web/src/styles/globals.css`

- [ ] **Step 1: Create DepositModal component**

Create `apps/web/src/components/DepositModal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePayments } from '@/hooks/usePayments';
import { useToast } from '@/components/Toast';

interface DepositModalProps {
  open: boolean;
  onClose: () => void;
}

const CARD_AMOUNTS = [10, 25, 50, 100];
const CRYPTO_AMOUNTS = [5, 25, 50, 100];

export default function DepositModal({ open, onClose }: DepositModalProps) {
  const { createCheckout } = usePayments();
  const { showToast } = useToast();

  const [tab, setTab] = useState<'card' | 'crypto'>('card');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);

  const minAmount = tab === 'card' ? 10 : 5;
  const quickAmounts = tab === 'card' ? CARD_AMOUNTS : CRYPTO_AMOUNTS;

  const handleDeposit = async () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num < minAmount) {
      showToast(`Minimum deposit is $${minAmount}`, 'error');
      return;
    }

    setLoading(true);
    try {
      const provider = tab === 'card' ? 'STRIPE' : 'COINBASE';
      const result = await createCheckout(num, provider);
      // Redirect to payment page
      window.location.href = result.redirectUrl;
    } catch (err: any) {
      showToast(err.message || 'Failed to create checkout', 'error');
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="modal-sheet"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        <div className="modal-handle" />
        <h2 className="modal-title">Deposit Funds</h2>

        {/* Tabs */}
        <div className="payment-tabs">
          <button
            className={`payment-tab ${tab === 'card' ? 'payment-tab-active' : ''}`}
            onClick={() => { setTab('card'); setAmount(''); }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            Card
          </button>
          <button
            className={`payment-tab ${tab === 'crypto' ? 'payment-tab-active' : ''}`}
            onClick={() => { setTab('crypto'); setAmount(''); }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Crypto
          </button>
        </div>

        {/* Quick Amounts */}
        <div className="quick-amounts">
          {quickAmounts.map((a) => (
            <button
              key={a}
              className={`quick-amount-btn ${amount === String(a) ? 'quick-amount-active' : ''}`}
              onClick={() => setAmount(String(a))}
            >
              ${a}
            </button>
          ))}
        </div>

        {/* Custom Amount */}
        <div className="deposit-row" style={{ marginTop: 12 }}>
          <input
            className="form-input"
            type="number"
            placeholder="Custom amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={minAmount}
            step="0.01"
          />
        </div>

        <p className="payment-note">
          Min ${minAmount} &middot; {tab === 'card' ? 'No fees' : 'Network fee applies'}
        </p>

        {/* Submit */}
        <button
          className="btn-primary btn-full"
          onClick={handleDeposit}
          disabled={loading || !amount}
        >
          {loading ? 'Redirecting...' : `Deposit $${parseFloat(amount || '0').toFixed(2)}`}
        </button>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Add payment modal CSS to globals.css**

Append to `apps/web/src/styles/globals.css`:

```css
/* ─── Payment Modals ────────────────────────────────────── */

.payment-tabs {
  display: flex;
  gap: 8px;
  margin-bottom: var(--space-md);
}

.payment-tab {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 10px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.payment-tab:hover {
  border-color: var(--border-hover);
}

.payment-tab-active {
  background: var(--primary-dim);
  border-color: var(--primary);
  color: var(--primary);
}

.payment-note {
  font-size: 12px;
  color: var(--text-muted);
  text-align: center;
  margin: 8px 0 16px;
}

.quick-amount-active {
  background: var(--primary-dim) !important;
  border-color: var(--primary) !important;
  color: var(--primary) !important;
}

.btn-full {
  width: 100%;
  padding: 14px;
  font-size: 16px;
  font-weight: 600;
}

.network-select {
  display: flex;
  gap: 6px;
  margin-top: 8px;
}

.network-btn {
  flex: 1;
  padding: 8px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 12px;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.network-btn:hover {
  border-color: var(--border-hover);
}

.network-btn-active {
  background: var(--primary-dim);
  border-color: var(--primary);
  color: var(--primary);
}

.payout-pending-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.payout-pending-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.payout-pending-amount {
  font-weight: 600;
  color: var(--text-primary);
}

.payout-pending-dest {
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 11px;
}

.payout-pending-status {
  font-size: 11px;
  padding: 2px 8px;
  border-radius: var(--radius-full);
  background: rgba(249, 115, 22, 0.15);
  color: var(--primary);
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/DepositModal.tsx apps/web/src/styles/globals.css
git commit -m "feat(web): add DepositModal with card/crypto tabs"
```

---

### Task 10: Frontend — WithdrawModal

**Files:**
- Create: `apps/web/src/components/WithdrawModal.tsx`

- [ ] **Step 1: Create WithdrawModal component**

Create `apps/web/src/components/WithdrawModal.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { usePayments, RecipientDetails } from '@/hooks/usePayments';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/components/Toast';

interface WithdrawModalProps {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  availableBalance: number;
}

const NETWORKS = ['ERC20', 'TRC20', 'SOL', 'BTC'] as const;

export default function WithdrawModal({ open, onClose, onSuccess, availableBalance }: WithdrawModalProps) {
  const { createPayout } = usePayments();
  const { showToast } = useToast();

  const [tab, setTab] = useState<'card' | 'crypto'>('crypto');
  const [amount, setAmount] = useState('');
  const [address, setAddress] = useState('');
  const [network, setNetwork] = useState<typeof NETWORKS[number]>('TRC20');
  const [loading, setLoading] = useState(false);

  const minAmount = tab === 'card' ? 20 : 10;
  const fee = tab === 'card' ? 0.50 : 0;

  const handleWithdraw = async () => {
    const num = parseFloat(amount);
    if (isNaN(num) || num < minAmount) {
      showToast(`Minimum withdrawal is $${minAmount}`, 'error');
      return;
    }
    if (num > availableBalance) {
      showToast('Insufficient balance', 'error');
      return;
    }
    if (tab === 'crypto' && !address.trim()) {
      showToast('Please enter a wallet address', 'error');
      return;
    }

    setLoading(true);
    try {
      const provider = tab === 'card' ? 'STRIPE' : 'COINBASE';
      const recipient: RecipientDetails = tab === 'card'
        ? { type: 'card_refund' }
        : { type: 'crypto', address: address.trim(), network };

      const result = await createPayout(num, provider, recipient);

      showToast(
        result.status === 'PROCESSING'
          ? `$${num.toFixed(2)} withdrawal processing`
          : `$${num.toFixed(2)} withdrawal submitted for review`,
        'success'
      );
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Withdrawal failed', 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="modal-sheet"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 300 }}
      >
        <div className="modal-handle" />
        <h2 className="modal-title">Withdraw Funds</h2>
        <p className="payment-note" style={{ margin: '0 0 16px', textAlign: 'left' }}>
          Available: <strong>${availableBalance.toFixed(2)}</strong>
        </p>

        {/* Tabs */}
        <div className="payment-tabs">
          <button
            className={`payment-tab ${tab === 'card' ? 'payment-tab-active' : ''}`}
            onClick={() => setTab('card')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            Card
          </button>
          <button
            className={`payment-tab ${tab === 'crypto' ? 'payment-tab-active' : ''}`}
            onClick={() => setTab('crypto')}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            Crypto
          </button>
        </div>

        {/* Amount */}
        <div className="deposit-row">
          <input
            className="form-input"
            type="number"
            placeholder="Amount"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            min={minAmount}
            step="0.01"
          />
        </div>

        {tab === 'card' && (
          <p className="payment-note">
            Min ${minAmount} &middot; $0.50 fee &middot; Returns to your deposit card
          </p>
        )}

        {tab === 'crypto' && (
          <>
            {/* Network Selector */}
            <div className="network-select">
              {NETWORKS.map((n) => (
                <button
                  key={n}
                  className={`network-btn ${network === n ? 'network-btn-active' : ''}`}
                  onClick={() => setNetwork(n)}
                >
                  {n}
                </button>
              ))}
            </div>

            {/* Wallet Address */}
            <input
              className="form-input"
              type="text"
              placeholder="Wallet address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              style={{ marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 12 }}
            />

            <p className="payment-note">
              Min ${minAmount} &middot; No fee &middot; Auto-approved under $500
            </p>
          </>
        )}

        {/* Submit */}
        <button
          className="btn-primary btn-full"
          onClick={handleWithdraw}
          disabled={loading || !amount}
        >
          {loading ? 'Processing...' : `Withdraw $${(parseFloat(amount || '0') - fee).toFixed(2)}`}
        </button>

        <p className="payment-note" style={{ marginTop: 12 }}>
          Estimated: 24-48 hours
        </p>
      </motion.div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/components/WithdrawModal.tsx
git commit -m "feat(web): add WithdrawModal with card/crypto tabs, network selector"
```

---

### Task 11: Frontend — Rewrite Wallet Page

**Files:**
- Modify: `apps/web/src/app/wallet/page.tsx`

- [ ] **Step 1: Rewrite wallet page to use payment modals and show pending payouts**

Replace the entire content of `apps/web/src/app/wallet/page.tsx`:

```tsx
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useWallet, WalletTransaction } from '@/hooks/useWallet';
import { usePayments, PayoutItem, CheckoutStatus } from '@/hooks/usePayments';
import { useToast } from '@/components/Toast';
import { api, getStoredToken } from '@/lib/api';
import DepositModal from '@/components/DepositModal';
import WithdrawModal from '@/components/WithdrawModal';
import Link from 'next/link';

interface WalletStats {
  totalDeposited: string;
  totalWon: string;
  totalWithdrawn: string;
}

const TX_TYPE_LABELS: Record<string, string> = {
  DEPOSIT: 'Deposit',
  WITHDRAWAL: 'Withdrawal',
  ENTRY_FEE: 'Entry Fee',
  PRIZE_PAYOUT: 'Prize Won',
  REFUND: 'Refund',
};

export default function WalletPage() {
  const { user, refreshWallet } = useAuth();
  const { wallet, fetchTransactions, loading } = useWallet();
  const { getPayouts, pollCheckoutStatus } = usePayments();
  const { showToast } = useToast();
  const searchParams = useSearchParams();

  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);

  const [stats, setStats] = useState<WalletStats | null>(null);
  const [transactions, setTransactions] = useState<WalletTransaction[]>([]);
  const [txPage, setTxPage] = useState(1);
  const [txHasMore, setTxHasMore] = useState(false);
  const [txLoading, setTxLoading] = useState(false);

  const [pendingPayouts, setPendingPayouts] = useState<PayoutItem[]>([]);

  const loadTransactions = useCallback(async (page: number, append = false) => {
    setTxLoading(true);
    try {
      const result = await fetchTransactions(page, 20);
      setTransactions(prev => append ? [...prev, ...result.transactions] : result.transactions);
      setTxPage(result.page);
      setTxHasMore(result.hasMore);
    } catch (err) {
      console.error('Failed to load transactions:', err);
    } finally {
      setTxLoading(false);
    }
  }, [fetchTransactions]);

  const loadStats = useCallback(async () => {
    const token = getStoredToken();
    if (!token) return;
    try {
      const data = await api<WalletStats>('/api/wallet/stats', { token });
      setStats(data);
    } catch (err) {
      console.error('Failed to load wallet stats:', err);
    }
  }, []);

  const loadPayouts = useCallback(async () => {
    try {
      const payouts = await getPayouts();
      setPendingPayouts(payouts.filter(p =>
        ['PENDING_REVIEW', 'APPROVED', 'PROCESSING'].includes(p.status)
      ));
    } catch (err) {
      console.error('Failed to load payouts:', err);
    }
  }, [getPayouts]);

  const refreshAll = useCallback(() => {
    loadTransactions(1);
    loadStats();
    loadPayouts();
    refreshWallet();
  }, [loadTransactions, loadStats, loadPayouts, refreshWallet]);

  useEffect(() => {
    if (user) refreshAll();
  }, [user, refreshAll]);

  // Handle checkout return URL
  useEffect(() => {
    const checkoutResult = searchParams.get('checkout');
    const sessionId = searchParams.get('session');

    if (checkoutResult === 'success' && sessionId) {
      showToast('Processing deposit...', 'info');
      pollCheckoutStatus(sessionId, (status: CheckoutStatus) => {
        if (status.status === 'COMPLETED') {
          showToast(`$${status.amount} deposited!`, 'success');
          refreshAll();
        } else if (status.status === 'FAILED') {
          showToast('Deposit failed. Please try again.', 'error');
        } else if (status.status === 'EXPIRED') {
          showToast('Deposit expired. Please try again.', 'error');
        }
      });
      // Clean URL
      window.history.replaceState({}, '', '/wallet');
    } else if (checkoutResult === 'cancelled') {
      showToast('Deposit cancelled', 'info');
      window.history.replaceState({}, '', '/wallet');
    }
  }, [searchParams, pollCheckoutStatus, showToast, refreshAll]);

  if (!user) {
    return (
      <div className="auth-page">
        <div className="empty-state">
          <p>Sign in to manage your wallet</p>
          <Link href="/login?redirect=%2Fwallet" className="btn-primary" style={{ marginTop: 16, display: 'inline-block', padding: '12px 32px' }}>
            Sign In
          </Link>
        </div>
      </div>
    );
  }

  const balance = wallet ? parseFloat(wallet.balance) : 0;
  const frozen = wallet ? parseFloat(wallet.frozenBalance) : 0;
  const available = balance - frozen;

  const formatTxAmount = (amount: string) => {
    const num = parseFloat(amount);
    return num >= 0 ? `+$${num.toFixed(2)}` : `-$${Math.abs(num).toFixed(2)}`;
  };

  const formatTxDate = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const hours = Math.floor(diff / 3600000);
    if (hours < 1) return 'Just now';
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const isPositive = (type: string) => ['DEPOSIT', 'PRIZE_PAYOUT', 'REFUND'].includes(type);

  const truncateAddress = (addr: string) =>
    addr.length > 12 ? `${addr.slice(0, 6)}...${addr.slice(-4)}` : addr;

  return (
    <div className="wallet-page">
      <h1 className="page-title">Wallet</h1>

      {/* Balance Card */}
      <motion.div className="wallet-balance-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
        <div className="wallet-balance-amount">${available.toFixed(2)}</div>
        <div className="wallet-balance-label">
          Available Balance
          {frozen > 0 && <span style={{ color: 'var(--primary)', marginLeft: 8 }}>(${frozen.toFixed(2)} pending)</span>}
        </div>
        <div className="wallet-actions">
          <button className="wallet-btn wallet-btn-deposit" onClick={() => setDepositOpen(true)}>Deposit</button>
          <button className="wallet-btn wallet-btn-withdraw" onClick={() => setWithdrawOpen(true)}>Withdraw</button>
        </div>
      </motion.div>

      {/* Quick Stats */}
      <motion.div className="wallet-stats" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
        <div className="wallet-stat">
          <span className="wallet-stat-value">${stats ? parseFloat(stats.totalDeposited).toFixed(2) : '0.00'}</span>
          <span className="wallet-stat-label">Deposited</span>
        </div>
        <div className="wallet-stat">
          <span className="wallet-stat-value wallet-stat-win">${stats ? parseFloat(stats.totalWon).toFixed(2) : '0.00'}</span>
          <span className="wallet-stat-label">Won</span>
        </div>
        <div className="wallet-stat">
          <span className="wallet-stat-value">${stats ? parseFloat(stats.totalWithdrawn).toFixed(2) : '0.00'}</span>
          <span className="wallet-stat-label">Withdrawn</span>
        </div>
      </motion.div>

      {/* Pending Withdrawals */}
      {pendingPayouts.length > 0 && (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <div className="section-header"><h2 className="section-title">Pending Withdrawals</h2></div>
          <div className="payout-pending-list">
            {pendingPayouts.map((p) => (
              <div key={p.id} className="payout-pending-item">
                <div>
                  <span className="payout-pending-amount">${parseFloat(p.amount).toFixed(2)}</span>
                  {p.recipientExternalId && (
                    <span className="payout-pending-dest"> → {truncateAddress(p.recipientExternalId)}</span>
                  )}
                </div>
                <span className="payout-pending-status">{p.status.replace('_', ' ').toLowerCase()}</span>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Transaction History */}
      <section>
        <div className="section-header"><h2 className="section-title">Transactions</h2></div>
        {transactions.length > 0 ? (
          <div className="transaction-list">
            {transactions.map((tx, i) => (
              <motion.div key={tx.id} className="transaction-item" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.03 }}>
                <div className={`transaction-icon ${isPositive(tx.type) ? 'tx-positive' : 'tx-negative'}`}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    {isPositive(tx.type) ? <path d="M12 19V5M5 12l7-7 7 7" /> : <path d="M12 5v14M5 12l7 7 7-7" />}
                  </svg>
                </div>
                <div className="transaction-info">
                  <div className="transaction-desc">{tx.description || TX_TYPE_LABELS[tx.type] || tx.type}</div>
                  <div className="transaction-date">{formatTxDate(tx.createdAt)}</div>
                </div>
                <div className={`transaction-amount ${isPositive(tx.type) ? 'tx-amount-positive' : 'tx-amount-negative'}`}>
                  {formatTxAmount(tx.amount)}
                </div>
              </motion.div>
            ))}
            {txHasMore && (
              <button className="load-more-btn" onClick={() => loadTransactions(txPage + 1, true)} disabled={txLoading}>
                {txLoading ? 'Loading...' : 'Load More'}
              </button>
            )}
          </div>
        ) : txLoading ? (
          <div className="empty-state-inline"><p>Loading transactions...</p></div>
        ) : (
          <div className="empty-state-inline"><p>No transactions yet</p></div>
        )}
      </section>

      {/* Modals */}
      <AnimatePresence>
        {depositOpen && <DepositModal open={depositOpen} onClose={() => setDepositOpen(false)} />}
      </AnimatePresence>
      <AnimatePresence>
        {withdrawOpen && (
          <WithdrawModal
            open={withdrawOpen}
            onClose={() => setWithdrawOpen(false)}
            onSuccess={refreshAll}
            availableBalance={available}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/app/wallet/page.tsx
git commit -m "feat(web): rewrite wallet page with payment modals, pending payouts, checkout polling"
```

---

### Task 12: Environment Config & Stripe Raw Body Middleware

**Files:**
- Modify: `apps/api/src/main.ts`
- Modify: `.env` (add placeholder keys)

- [ ] **Step 1: Add Stripe raw body middleware in main.ts**

In `apps/api/src/main.ts`, add BEFORE the existing `app.use(express.json({ limit: '5mb' }));` line:

```typescript
// Stripe webhooks need raw body for signature verification
app.use('/api/payments/webhooks/stripe', express.raw({ type: 'application/json' }));
```

- [ ] **Step 2: Add placeholder env variables**

Append to `.env`:

```env
# Payment Providers
STRIPE_SECRET_KEY=sk_test_placeholder
STRIPE_PUBLISHABLE_KEY=pk_test_placeholder
STRIPE_WEBHOOK_SECRET=whsec_placeholder
NOWPAYMENTS_API_KEY=placeholder
NOWPAYMENTS_IPN_SECRET=placeholder
FRONTEND_URL=http://localhost:3000

# Limits (defaults)
DEPOSIT_MIN_CARD=10
DEPOSIT_MIN_CRYPTO=5
WITHDRAWAL_MIN_CARD=20
WITHDRAWAL_MIN_CRYPTO=10
KYC_THRESHOLD=2000
```

- [ ] **Step 3: Add FRONTEND_URL and payment keys to env validation**

In `apps/api/src/common/env.ts` (if it exists and validates env), add the new keys as optional.

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/main.ts .env
git commit -m "chore: add Stripe raw body middleware and payment env placeholders"
```
