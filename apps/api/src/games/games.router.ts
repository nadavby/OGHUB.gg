import { Router } from 'express';
import { prisma } from '../main';
import { authGuard, AuthenticatedRequest, roleGuard } from '../common/auth';
import { AppError } from '../common/error-handler';
import crypto from 'crypto';

export const gamesRouter = Router();

// ─── Discovery Feed (Public) ───────────────────────────────

gamesRouter.get('/', async (req, res, next) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 20, 50);
    const tag = req.query.tag as string;
    const featured = req.query.featured === 'true';

    const where: any = { isActive: true };
    if (tag) where.tags = { has: tag };
    if (featured) where.isFeatured = true;

    const [games, total] = await Promise.all([
      prisma.game.findMany({
        where,
        orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { challenges: { where: { status: 'ACTIVE' } } } },
          challenges: {
            where: { status: 'ACTIVE' },
            orderBy: { prizePool: 'desc' },
            take: 1,
            include: {
              sessions: {
                include: { score: true },
                orderBy: { createdAt: 'desc' },
                take: 1,
              },
            },
          },
        },
      }),
      prisma.game.count({ where }),
    ]);

    res.json({
      success: true,
      data: games.map((g) => ({
        id: g.id,
        slug: g.slug,
        title: g.title,
        description: g.description,
        thumbnailUrl: g.thumbnailUrl,
        bannerUrl: g.bannerUrl,
        difficulty: g.difficulty,
        tags: g.tags,
        isFeatured: g.isFeatured,
        activeChallenges: g._count.challenges,
        topScore: g.challenges[0]?.sessions[0]?.score?.value ?? null,
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

// ─── Game Detail ────────────────────────────────────────────

gamesRouter.get('/:id', async (req, res, next) => {
  try {
    const game = await prisma.game.findFirst({
      where: {
        OR: [{ id: req.params.id }, { slug: req.params.id }],
        isActive: true,
      },
      include: {
        challenges: {
          where: { status: 'ACTIVE' },
          orderBy: { prizePool: 'desc' },
          include: {
            _count: { select: { sessions: true } },
          },
        },
      },
    });

    if (!game) throw new AppError('Game not found', 404);

    res.json({
      success: true,
      data: {
        id: game.id,
        slug: game.slug,
        title: game.title,
        description: game.description,
        thumbnailUrl: game.thumbnailUrl,
        bannerUrl: game.bannerUrl,
        deepLinkScheme: game.deepLinkScheme,
        difficulty: game.difficulty,
        tags: game.tags,
        isFeatured: game.isFeatured,
        minPlayers: game.minPlayers,
        maxPlayers: game.maxPlayers,
        challenges: game.challenges.map((c) => ({
          id: c.id,
          title: c.title,
          description: c.description,
          entryFee: c.entryFee.toString(),
          prizePool: c.prizePool.toString(),
          maxEntries: c.maxEntries,
          currentEntries: c._count.sessions,
          startsAt: c.startsAt?.toISOString() ?? null,
          endsAt: c.endsAt?.toISOString() ?? null,
          status: c.status,
        })),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Register Game (Developer only) ────────────────────────

gamesRouter.post(
  '/',
  authGuard,
  roleGuard('DEVELOPER', 'ADMIN'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const { title, slug, description, thumbnailUrl, bannerUrl, deepLinkScheme, difficulty, tags } = req.body;

      if (!title || !slug) {
        throw new AppError('Title and slug are required');
      }

      // Find or create developer app
      let devApp = await prisma.developerApp.findFirst({
        where: { ownerId: req.user!.userId },
      });

      if (!devApp) {
        devApp = await prisma.developerApp.create({
          data: {
            name: `${req.user!.email}'s App`,
            ownerId: req.user!.userId,
            apiSecret: crypto.randomBytes(32).toString('hex'),
          },
        });
      }

      const game = await prisma.game.create({
        data: {
          title,
          slug,
          description,
          thumbnailUrl,
          bannerUrl,
          deepLinkScheme,
          difficulty: difficulty ?? 1,
          tags: tags ?? [],
          developerId: devApp.id,
        },
      });

      res.status(201).json({
        success: true,
        data: {
          game,
          sdk: {
            apiKey: devApp.apiKey,
            apiSecret: devApp.apiSecret,
          },
        },
      });
    } catch (err) {
      next(err);
    }
  },
);
