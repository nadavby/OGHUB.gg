import { Router } from 'express';
import { z } from 'zod';
import { prisma, redis } from '../main';
import { authGuard, AuthenticatedRequest } from '../common/auth';
import { AppError } from '../common/error-handler';
import { validate } from '../common/schemas';

export const challengesRouter = Router();

challengesRouter.use(authGuard);

// ─── Validation Schemas ──────────────────────────────────────

const listChallengesSchema = z.object({
  status: z.enum(['UPCOMING', 'ACTIVE', 'COMPLETED', 'CANCELLED']).optional(),
  gameId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

// ─── List Challenges ─────────────────────────────────────────

challengesRouter.get('/', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { status, gameId, page, limit } = validate(listChallengesSchema, req.query);

    const where: any = {};
    if (status) where.status = status;
    if (gameId) where.gameId = gameId;

    const [challenges, total] = await Promise.all([
      prisma.challenge.findMany({
        where,
        include: {
          game: { select: { title: true, slug: true } },
          _count: { select: { sessions: true } },
        },
        orderBy: [
          { status: 'asc' },
          { startsAt: 'asc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.challenge.count({ where }),
    ]);

    res.json({
      success: true,
      data: challenges.map(c => ({
        id: c.id,
        gameId: c.gameId,
        gameTitle: c.game.title,
        gameSlug: c.game.slug,
        title: c.title,
        description: c.description,
        entryFee: c.entryFee.toString(),
        prizePool: c.prizePool.toString(),
        platformFee: c.platformFee.toString(),
        maxEntries: c.maxEntries,
        entries: c._count.sessions,
        startsAt: c.startsAt ? c.startsAt.toISOString() : null,
        endsAt: c.endsAt ? c.endsAt.toISOString() : null,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
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

// ─── Get Challenge Detail ────────────────────────────────────

challengesRouter.get('/:id', async (req: AuthenticatedRequest, res, next) => {
  try {
    const challengeId = req.params.id;
    const userId = req.user!.userId;

    const challenge = await prisma.challenge.findUnique({
      where: { id: challengeId },
      include: {
        game: { select: { title: true, slug: true } },
        _count: { select: { sessions: true } },
      },
    });

    if (!challenge) throw new AppError('Challenge not found', 404);

    // Fetch top 10 from Redis leaderboard
    const leaderboardKey = `leaderboard:${challengeId}`;
    const raw = await redis.zrevrange(leaderboardKey, 0, 9, 'WITHSCORES');

    // raw is alternating [userId, score, userId, score, ...]
    const leaderboardEntries: Array<{ userId: string; score: number; username: string | null }> = [];
    for (let i = 0; i < raw.length; i += 2) {
      leaderboardEntries.push({
        userId: raw[i],
        score: parseFloat(raw[i + 1]),
        username: null,
      });
    }

    // Batch-resolve usernames
    if (leaderboardEntries.length > 0) {
      const userIds = leaderboardEntries.map(e => e.userId);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: { id: true, username: true, displayName: true },
      });
      const userMap = new Map(users.map(u => [u.id, u.displayName || u.username]));
      for (const entry of leaderboardEntries) {
        entry.username = userMap.get(entry.userId) ?? null;
      }
    }

    // Check if current user has entered this challenge
    const userSession = await prisma.gameSession.findFirst({
      where: { challengeId, userId },
      select: { id: true, status: true },
    });

    res.json({
      success: true,
      data: {
        id: challenge.id,
        gameId: challenge.gameId,
        gameTitle: challenge.game.title,
        gameSlug: challenge.game.slug,
        title: challenge.title,
        description: challenge.description,
        entryFee: challenge.entryFee.toString(),
        prizePool: challenge.prizePool.toString(),
        platformFee: challenge.platformFee.toString(),
        maxEntries: challenge.maxEntries,
        entries: challenge._count.sessions,
        startsAt: challenge.startsAt ? challenge.startsAt.toISOString() : null,
        endsAt: challenge.endsAt ? challenge.endsAt.toISOString() : null,
        status: challenge.status,
        modifiers: challenge.modifiers,
        createdAt: challenge.createdAt.toISOString(),
        leaderboard: leaderboardEntries.map((e, i) => ({
          rank: i + 1,
          userId: e.userId,
          username: e.username,
          score: e.score,
        })),
        userEntry: userSession
          ? { sessionId: userSession.id, status: userSession.status }
          : null,
      },
    });
  } catch (err) {
    next(err);
  }
});
