import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../main';
import { AppError } from '../common/error-handler';
import { stripeProvider } from './providers/stripe.provider';
import { nowpayProvider } from './providers/nowpay.provider';
import { PaymentProvider, RecipientDetails } from './providers/provider.interface';
import { getAutoApproveThreshold, checkCrossMethodFraud, checkNewCryptoAddress, checkInstantCashout, WITHDRAWAL_FEE } from './limits.service';

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
  const fee = WITHDRAWAL_FEE[provider] || 0;
  const netAmount = amount - fee;
  if (netAmount <= 0) throw new AppError('Amount too small after fees', 400);

  const isInstantCashout = await checkInstantCashout(userId);
  if (isInstantCashout) {
    throw new AppError('Withdrawals are not available within 5 minutes of a deposit. Please try again later.', 403);
  }

  const payoutRequest = await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { userId } });
    if (!wallet) throw new AppError('Wallet not found', 404);

    const available = wallet.balance.sub(wallet.frozenBalance);
    const amountDecimal = new Decimal(amount);
    if (available.lt(amountDecimal)) {
      throw new AppError('Insufficient available balance', 402);
    }

    // Check for existing pending payout inside transaction to prevent TOCTOU race
    const pendingPayout = await tx.payoutRequest.findFirst({
      where: { userId, provider: provider as any, status: { in: ['PENDING_REVIEW', 'APPROVED', 'PROCESSING'] } },
    });
    if (pendingPayout) {
      throw new AppError('You already have a pending withdrawal. Please wait for it to complete.', 409);
    }

    await tx.wallet.update({
      where: { id: wallet.id },
      data: {
        balance: wallet.balance.sub(amountDecimal),
        frozenBalance: wallet.frozenBalance.add(amountDecimal),
      },
    });

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

    // Store gross amount (before fee) so refunds restore the full deducted amount
    const payout = await tx.payoutRequest.create({
      data: {
        userId,
        provider: provider as any,
        amount: amountDecimal,
        recipientExternalId: recipient.type === 'crypto' ? recipient.address : undefined,
        status: 'PENDING_REVIEW',
      },
    });

    return payout;
  }, { isolationLevel: 'Serializable' });

  // Cross-method fraud check
  const crossMethodCheck = await checkCrossMethodFraud(userId, provider, amount);
  if (crossMethodCheck.blocked) {
    // Refund the frozen funds — this withdrawal is not allowed
    await refundFailedPayout(payoutRequest.id, crossMethodCheck.reason || 'Cross-method withdrawal blocked');
    throw new AppError(crossMethodCheck.reason || 'This withdrawal method is currently unavailable.', 403);
  }

  // New crypto address check
  let newAddressFlag = false;
  if (recipient.type === 'crypto') {
    const addrCheck = await checkNewCryptoAddress(userId, recipient.address, amount);
    if (addrCheck.requiresReview) newAddressFlag = true;
  }

  const threshold = getAutoApproveThreshold(provider);

  if (amount <= threshold && !crossMethodCheck.requiresReview && !newAddressFlag) {
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

  const grossAmount = parseFloat(payout.amount.toString());
  const fee = WITHDRAWAL_FEE[payout.provider] || 0;
  const netAmount = grossAmount - fee;

  try {
    await prisma.payoutRequest.update({
      where: { id: payoutId },
      data: { status: 'PROCESSING' },
    });

    const result = await provider.createPayout(netAmount, recipientDetails);

    await prisma.payoutRequest.update({
      where: { id: payoutId },
      data: {
        providerPayoutId: result.providerPayoutId,
        status: result.status === 'completed' ? 'COMPLETED' : 'PROCESSING',
      },
    });

    if (result.status === 'completed') {
      // Unfreeze the gross amount (what was deducted from balance)
      await unfreezePayoutFunds(payout.userId, grossAmount);
    }
  } catch (err: any) {
    await refundFailedPayout(payoutId, err.message || 'Provider payout failed');
  }
}

export async function refundFailedPayout(payoutId: string, reason: string, opts?: { skipStatusUpdate?: boolean }): Promise<void> {
  const payout = await prisma.payoutRequest.findUnique({ where: { id: payoutId } });
  if (!payout) return;

  await prisma.$transaction(async (tx) => {
    const wallet = await tx.wallet.findUnique({ where: { userId: payout.userId } });
    if (!wallet) return;

    const refundAmount = new Decimal(payout.amount);

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

    // Skip status update when caller already set the status (e.g. admin reject)
    if (!opts?.skipStatusUpdate) {
      await tx.payoutRequest.update({
        where: { id: payoutId },
        data: { status: 'FAILED', failureReason: reason },
      });
    }
  }, { isolationLevel: 'Serializable' });
}

async function unfreezePayoutFunds(userId: string, amount: number): Promise<void> {
  await prisma.wallet.update({
    where: { userId },
    data: { frozenBalance: { decrement: amount } },
  });
}
