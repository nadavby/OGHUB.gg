import { Router } from 'express';
import { prisma, redis } from '../main';
import { AppError } from '../common/error-handler';

export const leaderboardRouter = Router();

// ─── Get Leaderboard ────────────────────────────────────────

leaderboardRouter.get('/:challengeId', async (req, res, next) => {
  try {
    const { challengeId } = req.params;
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
    const offset = (page - 1) * limit;

    // Try Redis first
    const redisEntries = await redis.zrevrange(
      `leaderboard:${challengeId}`,
      offset,
      offset + limit - 1,
      'WITHSCORES',
    );

    if (redisEntries.length > 0) {
      // Parse Redis results
      const entries: { userId: string; score: number }[] = [];
      for (let i = 0; i < redisEntries.length; i += 2) {
        entries.push({
          userId: redisEntries[i],
          score: parseInt(redisEntries[i + 1], 10),
        });
      }

      // Fetch user details
      const userIds = entries.map((e) => e.userId);
      const users = await prisma.user.findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          username: true,
          displayName: true,
          avatarUrl: true,
        },
      });

      const userMap = new Map(users.map((u) => [u.id, u]));
      const total = await redis.zcard(`leaderboard:${challengeId}`);

      const data = entries.map((e, i) => {
        const user = userMap.get(e.userId);
        return {
          rank: offset + i + 1,
          userId: e.userId,
          username: user?.username || 'Unknown',
          displayName: user?.displayName || null,
          avatarUrl: user?.avatarUrl || null,
          score: e.score,
        };
      });

      return res.json({
        success: true,
        data,
        total,
        page,
        limit,
        hasMore: offset + limit < total,
      });
    }

    // Fallback to DB
    const [scores, total] = await Promise.all([
      prisma.score.findMany({
        where: {
          session: { challengeId },
          isValidated: true,
        },
        orderBy: { value: 'desc' },
        skip: offset,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatarUrl: true,
            },
          },
          session: { select: { completedAt: true } },
        },
      }),
      prisma.score.count({
        where: {
          session: { challengeId },
          isValidated: true,
        },
      }),
    ]);

    const data = scores.map((s, i) => ({
      rank: offset + i + 1,
      userId: s.user.id,
      username: s.user.username,
      displayName: s.user.displayName,
      avatarUrl: s.user.avatarUrl,
      score: s.value,
      playedAt: s.session.completedAt?.toISOString() || s.createdAt.toISOString(),
    }));

    res.json({
      success: true,
      data,
      total,
      page,
      limit,
      hasMore: offset + limit < total,
    });
  } catch (err) {
    next(err);
  }
});

// ─── Get User's Neighborhood ────────────────────────────────

leaderboardRouter.get('/:challengeId/near/:userId', async (req, res, next) => {
  try {
    const { challengeId, userId } = req.params;
    const range = 5; // Show 5 above and 5 below

    const rank = await redis.zrevrank(`leaderboard:${challengeId}`, userId);
    if (rank === null) {
      throw new AppError('User not found on leaderboard', 404);
    }

    const start = Math.max(0, rank - range);
    const end = rank + range;

    const entries = await redis.zrevrange(
      `leaderboard:${challengeId}`,
      start,
      end,
      'WITHSCORES',
    );

    const results: { userId: string; score: number }[] = [];
    for (let i = 0; i < entries.length; i += 2) {
      results.push({
        userId: entries[i],
        score: parseInt(entries[i + 1], 10),
      });
    }

    const userIds = results.map((e) => e.userId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, username: true, displayName: true, avatarUrl: true },
    });

    const userMap = new Map(users.map((u) => [u.id, u]));

    const data = results.map((e, i) => ({
      rank: start + i + 1,
      userId: e.userId,
      username: userMap.get(e.userId)?.username || 'Unknown',
      displayName: userMap.get(e.userId)?.displayName || null,
      avatarUrl: userMap.get(e.userId)?.avatarUrl || null,
      score: e.score,
      isCurrentUser: e.userId === userId,
    }));

    res.json({
      success: true,
      data,
      userRank: rank + 1,
    });
  } catch (err) {
    next(err);
  }
});
