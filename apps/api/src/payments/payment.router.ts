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
  coin: z.string().optional(),
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
    const { amount, provider, currency, coin } = validate(checkoutSchema, req.body);

    await checkDepositAllowed(req.user!.userId, amount, provider);

    const result = await createCheckoutSession(req.user!.userId, amount, provider, currency, coin);

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
    console.error('Stripe webhook error:', err.message);
    // Return 400 for signature/verification failures so Stripe flags them
    const isSignatureError = err.message?.includes('signature') || err.message?.includes('Webhook');
    res.status(isSignatureError ? 400 : 200).json({ received: true, error: err.message });
  }
});

paymentRouter.post('/webhooks/nowpayments', async (req, res, next) => {
  try {
    // req.body is a raw Buffer thanks to express.raw() middleware
    await handleWebhookEvent('COINBASE', req.headers as any, req.body);
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

// ─── Test: Simulate Deposit (dev only) ────────────────────

if (process.env.NODE_ENV !== 'production') {
  const { Decimal } = require('@prisma/client/runtime/library');

  paymentRouter.post('/test-deposit', authGuard, async (req: AuthenticatedRequest, res, next) => {
    try {
      const { amount, provider } = validate(checkoutSchema, { ...req.body, provider: req.body.provider || 'STRIPE' });
      const userId = req.user!.userId;

      // Credit wallet directly — no external payment provider
      const wallet = await prisma.wallet.findUnique({ where: { userId } });
      if (!wallet) throw new AppError('Wallet not found', 404);

      const depositAmount = new Decimal(amount);
      const newBalance = wallet.balance.add(depositAmount);

      await prisma.$transaction(async (tx: any) => {
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
            description: `Test deposit via ${provider === 'STRIPE' ? 'card' : 'crypto'}`,
          },
        });
      });

      res.json({
        success: true,
        data: {
          balance: newBalance.toString(),
          amount: amount.toString(),
          message: `Test deposit of $${amount.toFixed(2)} credited`,
        },
      });
    } catch (err) {
      next(err);
    }
  });
}

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

    // Refund to wallet (skip status update — we already set REJECTED above)
    await refundFailedPayout(req.params.id, reason || 'Rejected by admin', { skipStatusUpdate: true });

    res.json({ success: true, data: { message: 'Payout rejected, funds refunded' } });
  } catch (err) {
    next(err);
  }
});
