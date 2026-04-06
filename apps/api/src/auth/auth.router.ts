import { Router } from 'express';
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import { prisma } from '../main';
import { signToken, authGuard, AuthenticatedRequest } from '../common/auth';
import { AppError } from '../common/error-handler';
import { validate, registerSchema, loginSchema, updateProfileSchema } from '../common/schemas';
import { getUserStats } from './user-stats';

export const authRouter = Router();

// ─── Rate Limiters ─────────────────────────────────────────

const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { success: false, error: 'Too many login attempts, try again in a minute' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 3,
  message: { success: false, error: 'Too many registration attempts, try again later' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ─── Password Validation ───────────────────────────────────

function validatePassword(password: string): string | null {
  if (password.length < 8) return 'Password must be at least 8 characters';
  if (!/[a-z]/.test(password)) return 'Password must contain a lowercase letter';
  if (!/[A-Z]/.test(password)) return 'Password must contain an uppercase letter';
  if (!/[0-9]/.test(password)) return 'Password must contain a number';
  return null;
}

// ─── Register ───────────────────────────────────────────────

authRouter.post('/register', registerLimiter, async (req, res, next) => {
  try {
    const { email, username, password, displayName } = validate(registerSchema, req.body);

    const passwordError = validatePassword(password);
    if (passwordError) {
      throw new AppError(passwordError);
    }

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, { username }] },
    });
    if (existing) {
      throw new AppError('Email or username already taken', 409);
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email,
        username,
        passwordHash,
        displayName: displayName || username,
        wallet: { create: {} },
      },
      include: { wallet: true },
    });

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    res.status(201).json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          role: user.role,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Login ──────────────────────────────────────────────────

authRouter.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const { email, password } = validate(loginSchema, req.body);

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      throw new AppError('Invalid credentials', 401);
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      throw new AppError('Invalid credentials', 401);
    }

    const token = signToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          email: user.email,
          username: user.username,
          displayName: user.displayName,
          avatarUrl: user.avatarUrl,
          role: user.role,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Get Current User ───────────────────────────────────────

authRouter.get('/me', authGuard, async (req: AuthenticatedRequest, res, next) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatarUrl: true,
        role: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new AppError('User not found', 404);
    }

    res.json({ success: true, data: user });
  } catch (err) {
    next(err);
  }
});

// ─── Update Profile ─────────────────────────────────────────

authRouter.patch('/me', authGuard, async (req: AuthenticatedRequest, res, next) => {
  try {
    const data = validate(updateProfileSchema, req.body);
    const updated = await prisma.user.update({
      where: { id: req.user!.userId },
      data,
      select: { id: true, email: true, username: true, displayName: true, avatarUrl: true, role: true, createdAt: true },
    });
    res.json({ success: true, data: updated });
  } catch (err) { next(err); }
});

// ─── User Stats ─────────────────────────────────────────────

authRouter.get('/me/stats', authGuard, async (req: AuthenticatedRequest, res, next) => {
  try {
    const stats = await getUserStats(req.user!.userId);
    res.json({ success: true, data: stats });
  } catch (err) { next(err); }
});

// ─── Match History ───────────────────────────────────────────

authRouter.get('/me/history', authGuard, async (req: AuthenticatedRequest, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page as string) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit as string) || 20));

    const [participations, total] = await Promise.all([
      prisma.roomParticipant.findMany({
        where: { userId: req.user!.userId, room: { status: 'COMPLETED' } },
        include: {
          room: {
            include: {
              game: { select: { title: true } },
              _count: { select: { participants: true } },
            },
          },
        },
        orderBy: { joinedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.roomParticipant.count({
        where: { userId: req.user!.userId, room: { status: 'COMPLETED' } },
      }),
    ]);

    const roomIds = participations.map(p => p.roomId);
    const payouts = await prisma.walletTransaction.findMany({
      where: {
        wallet: { userId: req.user!.userId },
        type: 'PRIZE_PAYOUT',
        referenceId: { in: roomIds },
      },
      select: { referenceId: true, amount: true },
    });
    const payoutMap = new Map(payouts.map(p => [p.referenceId, p.amount.toString()]));

    res.json({
      success: true,
      data: participations.map(p => ({
        roomId: p.roomId,
        game: p.room.game.title,
        format: p.room.format,
        entryFee: p.room.entryFee.toString(),
        players: p.room._count.participants,
        result: payoutMap.has(p.roomId) ? 'W' : 'L',
        earnings: payoutMap.get(p.roomId) || null,
        date: p.room.completedAt?.toISOString() || p.joinedAt.toISOString(),
      })),
      total,
      page,
      hasMore: page * limit < total,
    });
  } catch (err) { next(err); }
});
