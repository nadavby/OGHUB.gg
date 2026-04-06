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
  coin?: string,
): Promise<{ sessionId: string; redirectUrl: string }> {
  const paymentProvider = getProvider(provider);
  const idempotencyKey = `dep_${userId}_${Date.now()}`;

  // Create provider checkout (pass coin as metadata for crypto providers)
  const result = await paymentProvider.createCheckout(userId, amount, currency, coin ? { coin } : undefined);

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
    // Credit wallet in a transaction with idempotency guard inside
    await prisma.$transaction(async (tx) => {
      // Atomic idempotency: only proceed if session is not yet COMPLETED
      const updated = await tx.checkoutSession.updateMany({
        where: { id: session.id, status: { not: 'COMPLETED' } },
        data: {
          status: 'COMPLETED',
          providerPaymentId: event.providerPaymentId,
          completedAt: new Date(),
        },
      });
      if (updated.count === 0) return; // already processed by concurrent request

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
