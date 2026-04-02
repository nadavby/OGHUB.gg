import { Router } from 'express';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../main';
import { authGuard, AuthenticatedRequest, roleGuard } from '../common/auth';
import { AppError } from '../common/error-handler';

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

// ─── Deposit ────────────────────────────────────────────────

walletRouter.post('/deposit', roleGuard('ADMIN'), async (req: AuthenticatedRequest, res, next) => {
  try {
    const { amount } = req.body;
    const depositAmount = new Decimal(amount);

    if (depositAmount.lte(0)) {
      throw new AppError('Deposit amount must be positive');
    }

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
          description: 'Wallet deposit',
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
