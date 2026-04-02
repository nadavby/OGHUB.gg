import { Router } from 'express';
import crypto from 'crypto';
import { Decimal } from '@prisma/client/runtime/library';
import { prisma, redis } from '../main';
import { authGuard, AuthenticatedRequest, signToken } from '../common/auth';
import { AppError } from '../common/error-handler';
import { validateSession } from '../anticheat/fraud-engine';
import { enqueueEvents, getBackpressure } from '../events/event-pipeline';

export const sessionsRouter = Router();

sessionsRouter.use(authGuard);

// ─── Create Session ─────────────────────────────────────────

sessionsRouter.post('/create', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { gameId, challengeId } = req.body;

    if (!gameId) throw new AppError('gameId is required');

    const game = await prisma.game.findUnique({ where: { id: gameId } });
    if (!game || !game.isActive) throw new AppError('Game not found', 404);

    let entryFee = new Decimal(0);

    if (challengeId) {
      const challenge = await prisma.challenge.findUnique({ where: { id: challengeId } });
      if (!challenge || challenge.status !== 'ACTIVE') {
        throw new AppError('Challenge not found or inactive', 404);
      }
      if (challenge.gameId !== gameId) {
        throw new AppError('Challenge does not belong to this game');
      }
      entryFee = challenge.entryFee;
    }

    // Deduct entry fee if applicable
    if (entryFee.gt(0)) {
      await prisma.$transaction(async (tx) => {
        const wallet = await tx.wallet.findUnique({
          where: { userId: req.user!.userId },
        });
        if (!wallet) throw new AppError('Wallet not found', 404);
        if (wallet.balance.lt(entryFee)) {
          throw new AppError('Insufficient balance', 402);
        }

        const newBalance = wallet.balance.sub(entryFee);
        await tx.wallet.update({
          where: { id: wallet.id },
          data: { balance: newBalance },
        });

        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'ENTRY_FEE',
            amount: entryFee.neg(),
            balanceBefore: wallet.balance,
            balanceAfter: newBalance,
            description: `Entry fee for ${game.title}`,
            referenceId: challengeId,
          },
        });
      });
    }

    const seed = crypto.randomBytes(16).toString('hex');
    const sessionToken = signToken({
      userId: req.user!.userId,
      email: '',
      role: 'SESSION',
    });

    const session = await prisma.gameSession.create({
      data: {
        userId: req.user!.userId,
        gameId,
        challengeId,
        seed,
        token: sessionToken,
        expiresAt: new Date(Date.now() + 30 * 60 * 1000), // 30 min
        config: {
          seed,
          gameId,
          challengeId,
        },
      },
    });

    res.status(201).json({
      success: true,
      data: {
        sessionId: session.id,
        token: session.token,
        seed: session.seed,
        modifiers: session.config ?? {},
        expiresAt: session.expiresAt.toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Validate Session (SDK calls this) ─────────────────────

sessionsRouter.post('/:id/validate', async (req: AuthenticatedRequest, res, next) => {
  try {
    const session = await prisma.gameSession.findUnique({
      where: { id: req.params.id },
    });

    if (!session) throw new AppError('Session not found', 404);
    if (session.userId !== req.user!.userId) {
      throw new AppError('Session does not belong to user', 403);
    }
    if (session.status !== 'CREATED') {
      throw new AppError('Session already validated or completed');
    }
    if (new Date() > session.expiresAt) {
      await prisma.gameSession.update({
        where: { id: session.id },
        data: { status: 'EXPIRED' },
      });
      throw new AppError('Session expired', 410);
    }

    const updated = await prisma.gameSession.update({
      where: { id: session.id },
      data: {
        status: 'VALIDATED',
        startedAt: new Date(),
      },
    });

    // Check for ghost data
    let ghostData = null;
    if (session.challengeId) {
      const topScore = await prisma.score.findFirst({
        where: {
          session: { challengeId: session.challengeId },
          isValidated: true,
        },
        orderBy: { value: 'desc' },
        include: {
          session: { include: { replay: true } },
          user: { select: { username: true, displayName: true } },
        },
      });

      if (topScore?.session.replay) {
        ghostData = {
          seed: topScore.session.replay.seed,
          inputTimeline: topScore.session.replay.inputTimeline,
          duration: topScore.session.replay.duration,
          playerName: topScore.user.displayName || topScore.user.username,
          score: topScore.value,
        };
      }
    }

    res.json({
      success: true,
      data: {
        sessionId: updated.id,
        seed: updated.seed,
        modifiers: updated.config,
        ghostData,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Ingest Events (batched, via pipeline) ─────────────────

sessionsRouter.post('/:id/events', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { events } = req.body;

    if (!Array.isArray(events) || events.length === 0) {
      throw new AppError('Events array is required');
    }

    // Backpressure check
    const pressure = await getBackpressure();
    if (!pressure.accept) {
      return res.status(503).json({
        success: false,
        error: 'Event pipeline at capacity, retry later',
        retryAfterMs: 1000,
      });
    }

    const session = await prisma.gameSession.findUnique({
      where: { id: req.params.id },
    });

    if (!session) throw new AppError('Session not found', 404);
    if (!['VALIDATED', 'IN_PROGRESS'].includes(session.status)) {
      throw new AppError('Session not active');
    }

    // Mark as in progress
    if (session.status === 'VALIDATED') {
      await prisma.gameSession.update({
        where: { id: session.id },
        data: { status: 'IN_PROGRESS' },
      });
    }

    // Enqueue into Redis Streams pipeline (non-blocking)
    const result = await enqueueEvents(
      session.id,
      events.map((e: any) => ({
        eventType: e.eventType || e.type,
        payload: e.payload || {},
        timestamp: e.timestamp,
        sequence: e.sequence,
      })),
    );

    res.json({
      success: true,
      data: {
        queued: result.queued,
        streamUtilization: Math.round((result.streamLength / 1_000_000) * 100),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── End Session ────────────────────────────────────────────

sessionsRouter.post('/:id/end', async (req: AuthenticatedRequest, res, next) => {
  try {
    const { score, replayData, metadata } = req.body;

    if (score === undefined) throw new AppError('Score is required');

    const session = await prisma.gameSession.findUnique({
      where: { id: req.params.id },
      include: { challenge: true, game: true },
    });

    if (!session) throw new AppError('Session not found', 404);
    if (session.userId !== req.user!.userId) {
      throw new AppError('Session does not belong to user', 403);
    }
    if (!['VALIDATED', 'IN_PROGRESS'].includes(session.status)) {
      throw new AppError('Session not active');
    }

    // ── Anti-Cheat Validation (4-layer fraud engine) ─────
    const fraudResult = await validateSession(session, score, replayData, req.user!.userId);
    const isValid = fraudResult.isValid;

    const result = await prisma.$transaction(async (tx) => {
      // Update session
      await tx.gameSession.update({
        where: { id: session.id },
        data: {
          status: isValid ? 'COMPLETED' : 'REJECTED',
          completedAt: new Date(),
        },
      });

      // Create score
      const scoreRecord = await tx.score.create({
        data: {
          sessionId: session.id,
          userId: req.user!.userId,
          value: score,
          isValidated: isValid,
          validatedAt: isValid ? new Date() : null,
          metadata: metadata ?? {},
        },
      });

      // Store replay
      if (replayData) {
        const checksum = crypto
          .createHash('sha256')
          .update(JSON.stringify(replayData))
          .digest('hex');

        await tx.replay.create({
          data: {
            sessionId: session.id,
            seed: replayData.seed || session.seed,
            inputTimeline: replayData.inputTimeline || [],
            duration: replayData.duration || 0,
            checksum,
          },
        });
      }

      return scoreRecord;
    });

    // Update leaderboard in Redis
    if (isValid && session.challengeId) {
      await redis.zadd(
        `leaderboard:${session.challengeId}`,
        score,
        req.user!.userId,
      );

      // Get rank
      const rank = await redis.zrevrank(
        `leaderboard:${session.challengeId}`,
        req.user!.userId,
      );

      // Near-miss calculation
      const nearMiss = await calculateNearMiss(
        session.challengeId,
        req.user!.userId,
        score,
      );

      return res.json({
        success: true,
        data: {
          accepted: isValid,
          score,
          rank: rank !== null ? rank + 1 : null,
          nearMiss,
        },
      });
    }

    res.json({
      success: true,
      data: {
        accepted: isValid,
        score,
        rank: null,
        nearMiss: null,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Validation Helpers ─────────────────────────────────────

function validateScore(
  score: number,
  session: any,
  replayData: any,
): boolean {
  // Basic validation checks
  if (score < 0) return false;
  if (score > 999999999) return false;

  // Check session duration (shouldn't complete in < 1 second)
  if (session.startedAt) {
    const duration = Date.now() - new Date(session.startedAt).getTime();
    if (duration < 1000) return false; // too fast
  }

  // Check replay data integrity
  if (replayData) {
    if (replayData.seed && replayData.seed !== session.seed) {
      return false; // seed mismatch
    }

    // Check for impossible input rates (>30 inputs/sec sustained)
    if (replayData.inputTimeline && replayData.inputTimeline.length > 0) {
      const timeline = replayData.inputTimeline;
      const duration = replayData.duration || 1;
      const inputRate = timeline.length / (duration / 1000);
      if (inputRate > 30) return false;
    }
  }

  return true;
}

async function calculateNearMiss(
  challengeId: string,
  userId: string,
  score: number,
): Promise<any | null> {
  try {
    const totalPlayers = await redis.zcard(`leaderboard:${challengeId}`);
    if (totalPlayers < 2) return null;

    const rank = await redis.zrevrank(`leaderboard:${challengeId}`, userId);
    if (rank === null) return null;

    // Find the next higher score
    const higherScores = await redis.zrevrange(
      `leaderboard:${challengeId}`,
      Math.max(0, rank - 1),
      Math.max(0, rank - 1),
      'WITHSCORES',
    );

    if (higherScores.length >= 2) {
      const targetScore = parseInt(higherScores[1], 10);
      const difference = targetScore - score;
      const percentile = ((totalPlayers - rank) / totalPlayers) * 100;

      if (difference > 0 && difference / targetScore < 0.1) {
        return {
          message: `You were ${((difference / targetScore) * 100).toFixed(1)}% away from rank ${rank}!`,
          targetRank: rank,
          targetScore,
          difference,
          percentile: Math.round(percentile),
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}
