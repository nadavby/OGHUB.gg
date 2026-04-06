import { Decimal } from '@prisma/client/runtime/library';
import { prisma } from '../main';
import { calculateRoomPrizeSplit } from './room-prize-calc';
import { publishRoomEvent, cleanupRoom } from './room-redis';

interface SettlementResult {
  outcome: 'completed' | 'tie_refund' | 'all_invalid_refund';
  winners: { userId: string; rank: number; prize: string }[];
  refunds: { userId: string; amount: string }[];
}

export async function settleRoom(roomId: string): Promise<SettlementResult> {
  return prisma.$transaction(async (tx) => {
    // Idempotent: only settle rooms in SETTLING state
    const updated = await tx.room.updateMany({
      where: { id: roomId, status: 'SETTLING' },
      data: { status: 'COMPLETED', settledAt: new Date(), completedAt: new Date() },
    });
    if (updated.count === 0) {
      return { outcome: 'completed', winners: [], refunds: [] };
    }

    const room = await tx.room.findUnique({
      where: { id: roomId },
      include: {
        participants: true,
        game: { select: { title: true } },
      },
    });
    if (!room) return { outcome: 'completed', winners: [], refunds: [] };

    // Gather sessions + scores
    const sessionIds = room.participants
      .filter(p => p.sessionId)
      .map(p => p.sessionId!);

    const sessions = await tx.gameSession.findMany({
      where: { id: { in: sessionIds } },
      include: { score: true },
    });

    const sessionMap = new Map(sessions.map(s => [s.id, s]));

    // Classify participants
    type Classified = {
      participantId: string;
      userId: string;
      status: 'valid' | 'rejected' | 'expired' | 'no_session';
      score: number | null;
    };

    const classified: Classified[] = room.participants.map(p => {
      if (!p.sessionId) {
        return { participantId: p.id, userId: p.userId, status: 'no_session' as const, score: null };
      }
      const session = sessionMap.get(p.sessionId);
      if (!session) {
        return { participantId: p.id, userId: p.userId, status: 'no_session' as const, score: null };
      }
      if (session.status === 'REJECTED') {
        return { participantId: p.id, userId: p.userId, status: 'rejected' as const, score: null };
      }
      if (session.status === 'EXPIRED') {
        return { participantId: p.id, userId: p.userId, status: 'expired' as const, score: null };
      }
      const scoreVal = session.score?.isValidated ? session.score.value : null;
      return {
        participantId: p.id,
        userId: p.userId,
        status: 'valid' as const,
        score: scoreVal,
      };
    });

    const validPlayers = classified.filter(c => c.status === 'valid' && c.score !== null);
    const invalidPlayers = classified.filter(c => c.status !== 'valid' || c.score === null);

    // ── CASE: All invalid → full refund ──
    if (validPlayers.length === 0) {
      const refunds: { userId: string; amount: string }[] = [];
      for (const p of room.participants) {
        const wallet = await tx.wallet.findUnique({ where: { userId: p.userId } });
        if (!wallet) continue;
        const newBalance = wallet.balance.add(room.entryFee);
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'REFUND',
            amount: room.entryFee,
            balanceBefore: wallet.balance,
            balanceAfter: newBalance,
            description: `Room refund (no valid results): ${room.game.title}`,
            referenceId: roomId,
          },
        });
        await tx.roomParticipant.update({
          where: { id: p.id },
          data: { outcome: 'TIE_REFUND' },
        });
        refunds.push({ userId: p.userId, amount: room.entryFee.toString() });
      }

      await publishRoomEvent(roomId, { type: 'room_cancelled', reason: 'no_valid_results', refunds });
      await cleanupRoom(roomId);
      return { outcome: 'all_invalid_refund', winners: [], refunds };
    }

    // ── CASE: Check for tie (1v1 or all valid players same score) ──
    const uniqueScores = new Set(validPlayers.map(p => p.score));
    if (uniqueScores.size === 1 && validPlayers.length > 1) {
      // Tie — full refund to all
      const refunds: { userId: string; amount: string }[] = [];
      for (const p of room.participants) {
        const wallet = await tx.wallet.findUnique({ where: { userId: p.userId } });
        if (!wallet) continue;
        const refundAmount = room.entryFee; // Full refund including platform fee
        const newBalance = wallet.balance.add(refundAmount);
        await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });
        await tx.walletTransaction.create({
          data: {
            walletId: wallet.id,
            type: 'REFUND',
            amount: refundAmount,
            balanceBefore: wallet.balance,
            balanceAfter: newBalance,
            description: `Room tie refund: ${room.game.title}`,
            referenceId: roomId,
          },
        });
        await tx.roomParticipant.update({
          where: { id: p.id },
          data: {
            outcome: 'TIE_REFUND',
            finalScore: classified.find(c => c.participantId === p.id)?.score ?? undefined,
          },
        });
        refunds.push({ userId: p.userId, amount: refundAmount.toString() });
      }

      await publishRoomEvent(roomId, { type: 'room_cancelled', reason: 'tie', refunds });
      await cleanupRoom(roomId);
      return { outcome: 'tie_refund', winners: [], refunds };
    }

    // ── CASE: Normal distribution ──
    // Sort valid players by score descending
    validPlayers.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    // Prize splits based on number of VALID players (not total)
    const splits = calculateRoomPrizeSplit(room.format, validPlayers.length);
    const winners: { userId: string; rank: number; prize: string }[] = [];

    for (let i = 0; i < validPlayers.length; i++) {
      const player = validPlayers[i];
      const rank = i + 1;
      const splitPct = i < splits.length ? splits[i] : 0;
      const prizeAmount = room.prizePool.mul(new Decimal(splitPct)).toDecimalPlaces(2);

      if (prizeAmount.gt(0)) {
        const wallet = await tx.wallet.findUnique({ where: { userId: player.userId } });
        if (wallet) {
          const newBalance = wallet.balance.add(prizeAmount);
          await tx.wallet.update({ where: { id: wallet.id }, data: { balance: newBalance } });
          await tx.walletTransaction.create({
            data: {
              walletId: wallet.id,
              type: 'PRIZE_PAYOUT',
              amount: prizeAmount,
              balanceBefore: wallet.balance,
              balanceAfter: newBalance,
              description: `Rank ${rank} prize: ${room.game.title}`,
              referenceId: roomId,
            },
          });
        }
        winners.push({ userId: player.userId, rank, prize: prizeAmount.toString() });
      }

      await tx.roomParticipant.update({
        where: { id: player.participantId },
        data: {
          outcome: splitPct > 0 ? 'WIN' : 'LOSE',
          finalScore: player.score,
          finalRank: rank,
          prizeAmount: prizeAmount.gt(0) ? prizeAmount : undefined,
        },
      });
    }

    // Mark invalid players
    for (const player of invalidPlayers) {
      const outcome = (() => {
        const c = classified.find(c => c.participantId === player.participantId);
        if (c?.status === 'rejected') return 'CHEAT_DISQUALIFIED' as const;
        if (c?.status === 'expired' || c?.status === 'no_session') return 'NO_SHOW' as const;
        return 'LOSE' as const;
      })();

      await tx.roomParticipant.update({
        where: { id: player.participantId },
        data: { outcome },
      });
    }

    await publishRoomEvent(roomId, { type: 'room_completed', winners });
    await cleanupRoom(roomId);
    return { outcome: 'completed', winners, refunds: [] };
  }, { isolationLevel: 'Serializable' });
}
