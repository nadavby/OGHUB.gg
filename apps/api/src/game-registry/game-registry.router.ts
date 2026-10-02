import { Router } from 'express';
import { prisma } from '../main';
import { authGuard, AuthenticatedRequest, roleGuard } from '../common/auth';
import { AppError } from '../common/error-handler';
import { parseGameDefinition } from './game-definition';
import type { TrustTier } from '@oghub/shared';
import { TRUST_TIER_LIMITS } from '@oghub/shared';

export const gameRegistryRouter = Router();

// ─── Register / Update Game Definition ─────────────────────

gameRegistryRouter.put(
  '/:slug/definition',
  authGuard,
  roleGuard('DEVELOPER', 'ADMIN'),
  async (req: AuthenticatedRequest, res, next) => {
    try {
      const slug = req.params.slug as string;

      // Verify game exists and user owns it
      const game = await prisma.game.findUnique({
        where: { slug },
        include: { developer: true },
      });
      if (!game) throw new AppError('Game not found', 404);
      if (game.developer.ownerId !== req.user!.userId) {
        throw new AppError('You do not own this game', 403);
      }

      // Parse and validate game definition
      const parsed = parseGameDefinition({ ...req.body, slug, name: game.title });
      if (!parsed.success) {
        throw new AppError(`Invalid game definition: ${parsed.errors.join('; ')}`, 400);
      }

      const definition = parsed.data;

      // Check trust tier prize pool compatibility with existing challenges
      const tierLimit = TRUST_TIER_LIMITS[definition.trust.tier as TrustTier];
      if (tierLimit.maxPrizePool !== Infinity) {
        const activeChallenges = await prisma.challenge.findMany({
          where: { gameId: game.id, status: 'ACTIVE' },
          select: { prizePool: true, title: true },
        });
        const exceeding = activeChallenges.filter(
          c => Number(c.prizePool) > tierLimit.maxPrizePool,
        );
        if (exceeding.length > 0) {
          throw new AppError(
            `Trust tier '${definition.trust.tier}' limits prize pools to $${tierLimit.maxPrizePool}. ` +
            `${exceeding.length} active challenge(s) exceed this limit.`,
            409,
          );
        }
      }

      // Upsert definition
      await prisma.$transaction([
        prisma.gameDefinition.upsert({
          where: { gameId: game.id },
          create: {
            gameId: game.id,
            version: definition.version,
            definition: definition as any,
          },
          update: {
            version: definition.version,
            definition: definition as any,
          },
        }),
        prisma.game.update({
          where: { id: game.id },
          data: { trustTier: definition.trust.tier },
        }),
      ]);

      res.json({
        success: true,
        data: {
          slug: definition.slug,
          version: definition.version,
          trustTier: definition.trust.tier,
        },
      });
    } catch (err) {
      next(err);
    }
  },
);

// ─── Get Game Definition ───────────────────────────────────

gameRegistryRouter.get(
  '/:slug/definition',
  async (req, res, next) => {
    try {
      const game = await prisma.game.findUnique({
        where: { slug: (req.params.slug as string) },
        include: { definition: true },
      });
      if (!game) throw new AppError('Game not found', 404);
      if (!game.definition) throw new AppError('Game has no definition', 404);

      res.json({
        success: true,
        data: game.definition.definition,
      });
    } catch (err) {
      next(err);
    }
  },
);
