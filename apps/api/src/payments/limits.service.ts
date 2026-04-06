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

const KYC_TIER_LIMITS: Record<string, { maxDepositPerDay: number; maxWithdrawalPerDay: number; cumulativeMax: number }> = {
  UNVERIFIED: { maxDepositPerDay: 500, maxWithdrawalPerDay: 200, cumulativeMax: 2000 },
  BASIC: { maxDepositPerDay: 2000, maxWithdrawalPerDay: 5000, cumulativeMax: Infinity },
  FULL: { maxDepositPerDay: Infinity, maxWithdrawalPerDay: Infinity, cumulativeMax: Infinity },
};

const KYC_THRESHOLD = parseFloat(process.env.KYC_THRESHOLD || '2000');

async function getDailyTotal(walletId: string, type: 'DEPOSIT' | 'WITHDRAWAL'): Promise<number> {
  const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const result = await prisma.walletTransaction.aggregate({
    where: { walletId, type, createdAt: { gte: dayAgo } },
    _sum: { amount: true },
  });
  return Math.abs(parseFloat((result._sum.amount ?? new Decimal(0)).toString()));
}

async function getMonthlyTotal(walletId: string): Promise<number> {
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const result = await prisma.walletTransaction.aggregate({
    where: { walletId, type: { in: ['DEPOSIT', 'WITHDRAWAL'] }, createdAt: { gte: monthAgo } },
    _sum: { amount: true },
  });
  return Math.abs(parseFloat((result._sum.amount ?? new Decimal(0)).toString()));
}

async function getCumulativeTotal(walletId: string): Promise<number> {
  const result = await prisma.walletTransaction.aggregate({
    where: { walletId, type: { in: ['DEPOSIT', 'WITHDRAWAL'] } },
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

  const effectiveDailyLimit = Math.min(limits.maxDepositPerDay, kycLimits.maxDepositPerDay);
  const dailyTotal = await getDailyTotal(wallet.id, 'DEPOSIT');
  if (dailyTotal + amount > effectiveDailyLimit) {
    if (kycLimits.maxDepositPerDay < limits.maxDepositPerDay) {
      throw new AppError(`Daily deposit limit ($${kycLimits.maxDepositPerDay}) reached. Verify your identity to increase limits.`, 403);
    }
    throw new AppError(`Daily deposit limit ($${effectiveDailyLimit}) reached`, 403);
  }

  const monthlyTotal = await getMonthlyTotal(wallet.id);
  if (monthlyTotal + amount > limits.maxMonthly) {
    throw new AppError(`Monthly transaction limit ($${limits.maxMonthly}) reached`, 403);
  }

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

  if (amount > 1000 && user.kycTier !== 'FULL') {
    throw new AppError('Withdrawals over $1,000 require full identity verification.', 403);
  }

  const wallet = await prisma.wallet.findUnique({ where: { userId } });
  if (!wallet) throw new AppError('Wallet not found', 404);

  const available = wallet.balance.sub(wallet.frozenBalance);
  if (available.lt(new Decimal(amount))) {
    throw new AppError('Insufficient available balance', 402);
  }

  const effectiveDailyLimit = Math.min(limits.maxWithdrawalPerDay, kycLimits.maxWithdrawalPerDay);
  const dailyTotal = await getDailyTotal(wallet.id, 'WITHDRAWAL');
  if (dailyTotal + amount > effectiveDailyLimit) {
    if (kycLimits.maxWithdrawalPerDay < limits.maxWithdrawalPerDay) {
      throw new AppError(`Daily withdrawal limit ($${kycLimits.maxWithdrawalPerDay}) reached. Verify your identity to increase limits.`, 403);
    }
    throw new AppError(`Daily withdrawal limit ($${effectiveDailyLimit}) reached`, 403);
  }

  const monthlyTotal = await getMonthlyTotal(wallet.id);
  if (monthlyTotal + amount > limits.maxMonthly) {
    throw new AppError(`Monthly transaction limit ($${limits.maxMonthly}) reached`, 403);
  }

  if (kycLimits.cumulativeMax < Infinity) {
    const cumulativeTotal = await getCumulativeTotal(wallet.id);
    if (cumulativeTotal + amount > kycLimits.cumulativeMax) {
      throw new AppError(`Cumulative limit ($${KYC_THRESHOLD}) reached. Verify your identity to continue.`, 403);
    }
  }

  const pendingPayout = await prisma.payoutRequest.findFirst({
    where: { userId, provider: provider as any, status: { in: ['PENDING_REVIEW', 'APPROVED', 'PROCESSING'] } },
  });
  if (pendingPayout) {
    throw new AppError('You already have a pending withdrawal. Please wait for it to complete.', 409);
  }
}

export async function checkCrossMethodFraud(userId: string, withdrawProvider: string): Promise<{ requiresReview: boolean; reason?: string }> {
  if (withdrawProvider === 'STRIPE') return { requiresReview: false };

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const recentCardDeposit = await prisma.checkoutSession.findFirst({
    where: { userId, provider: 'STRIPE', status: 'COMPLETED', completedAt: { gte: sevenDaysAgo } },
  });

  if (recentCardDeposit) {
    return { requiresReview: true, reason: 'Cross-method withdrawal: card deposit within 7 days, requesting crypto payout' };
  }

  return { requiresReview: false };
}

export async function checkInstantCashout(userId: string): Promise<boolean> {
  const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
  const recentDeposit = await prisma.checkoutSession.findFirst({
    where: { userId, status: 'COMPLETED', completedAt: { gte: fiveMinAgo } },
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
