import { Router } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../main';
import { authGuard, AuthenticatedRequest, roleGuard } from '../common/auth';
import { AppError } from '../common/error-handler';
import { validate, depositSchema, withdrawalSchema } from '../common/schemas';

export const walletRouter = Router();

// All wallet routes require auth
walletRouter.use(authGuard);

// ─── Get Balance ────────────────────────────────────────────

walletRouter.get('/balance', async (req: AuthenticatedRequest, res, next) => {
  try {
    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!wallet) {
      throw new AppError('Wallet not found', 404);
    }

    res.json({
      success: true,
      data: {
        balance: wallet.balance.toString(),
        frozenBalance: wallet.frozenBalance.toString(),
        currency: wallet.currency,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Wallet Stats ──────────────────────────────────────────

walletRouter.get('/stats', async (req: AuthenticatedRequest, res, next) => {
  try {
    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!wallet) throw new AppError('Wallet not found', 404);

    const [depositSum, prizeSum, withdrawSum] = await Promise.all([
      prisma.walletTransaction.aggregate({
        where: { walletId: wallet.id, type: 'DEPOSIT' },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { walletId: wallet.id, type: 'PRIZE_PAYOUT' },
        _sum: { amount: true },
      }),
      prisma.walletTransaction.aggregate({
        where: { walletId: wallet.id, type: 'WITHDRAWAL' },
        _sum: { amount: true },
      }),
    ]);

    res.json({
      success: true,
      data: {
        totalDeposited: (depositSum._sum.amount ?? new Decimal(0)).toString(),
        totalWon: (prizeSum._sum.amount ?? new Decimal(0)).toString(),
        totalWithdrawn: (withdrawSum._sum.amount ?? new Decimal(0)).abs().toString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Deposit (legacy — kept for dev/testing only) ──────────

walletRouter.post('/deposit', async (req: AuthenticatedRequest, res, next) => {
  try {
    // In production, deposits go through /api/payments/checkout
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

// ─── Transaction History ────────────────────────────────────

walletRouter.get('/transactions', async (req: AuthenticatedRequest, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

    const wallet = await prisma.wallet.findUnique({
      where: { userId: req.user!.userId },
    });

    if (!wallet) throw new AppError('Wallet not found', 404);

    const [transactions, total] = await Promise.all([
      prisma.walletTransaction.findMany({
        where: { walletId: wallet.id },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.walletTransaction.count({
        where: { walletId: wallet.id },
      }),
    ]);

    res.json({
      success: true,
      data: transactions.map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount.toString(),
        balanceBefore: t.balanceBefore.toString(),
        balanceAfter: t.balanceAfter.toString(),
        description: t.description,
        createdAt: t.createdAt.toISOString(),
      })),
      total,
      page,
      limit,
      hasMore: page * limit < total,
    });
  } catch (err) {
    next(err);
  }
});

