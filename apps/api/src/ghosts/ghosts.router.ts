import { Router } from 'express';
import { prisma } from '../main';
import { AppError } from '../common/error-handler';

export const ghostsRouter = Router();

// ─── Get Top Ghost for Challenge ────────────────────────────

ghostsRouter.get('/:challengeId/top', async (req, res, next) => {
  try {
    const { challengeId } = req.params;

    const topScore = await prisma.score.findFirst({
      where: {
        session: { challengeId },
        isValidated: true,
      },
      orderBy: { value: 'desc' },
      include: {
        session: { include: { replay: true } },
        user: { select: { username: true, displayName: true } },
      },
    });

    if (!topScore?.session.replay) {
      return res.json({ success: true, data: null });
    }

    res.json({
      success: true,
      data: {
        seed: topScore.session.replay.seed,
        inputTimeline: topScore.session.replay.inputTimeline,
        duration: topScore.session.replay.duration,
        playerName: topScore.user.displayName || topScore.user.username,
        score: topScore.value,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Get Specific Replay ────────────────────────────────────

ghostsRouter.get('/:sessionId', async (req, res, next) => {
  try {
    const replay = await prisma.replay.findUnique({
      where: { sessionId: req.params.sessionId },
      include: {
        session: {
          include: {
            score: true,
            user: { select: { username: true, displayName: true } },
          },
        },
      },
    });

    if (!replay) throw new AppError('Replay not found', 404);

    res.json({
      success: true,
      data: {
        seed: replay.seed,
        inputTimeline: replay.inputTimeline,
        duration: replay.duration,
        checksum: replay.checksum,
        playerName: replay.session.user.displayName || replay.session.user.username,
        score: replay.session.score?.value ?? null,
      },
    });
  } catch (err) {
    next(err);
  }
});
